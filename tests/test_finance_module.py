"""Comprehensive Unit and Integration Tests for Reamarc Finance Module.

Uses IsolatedAsyncioTestCase against local MongoDB test database (reamarc_test_db).
Covers dual-condition tests (rejected vs legitimate), multi-company isolation,
append-only ledger integrity, atomic numbering, currency conversions, and vulnerability edge cases.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import os
import sys
import unittest
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import FastAPI
import httpx

from app.core.tenant import TenantDB, tenant_scope
from app.database import db_instance
from app.routers import finance as finance_router
from app.services.finance_settings import (
    DEFAULT_SERVICES_LIST,
    ensure_finance_indexes,
    get_or_init_finance_settings,
    get_services,
)
from app.services.finance_numbering import get_next_number
from app.services.finance_ledger import get_account_balance, get_all_account_balances
from app.services.finance_pdf import amount_in_words, generate_invoice_pdf, generate_receipt_pdf
from app.services.permissions import require_permission
from app.core.security import get_current_user

TEST_DB_NAME = "reamarc_test_db"
COMPANY_A = "company_test_a"
COMPANY_B = "company_test_b"


class TestFinanceModule(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncIOMotorClient("mongodb://localhost:27017")
        self.raw = self.client[TEST_DB_NAME]
        self._prev_db = db_instance.db
        db_instance.db = self.raw

        # Clear collections
        colls = [
            "finance_settings",
            "finance_services",
            "invoices",
            "receipts",
            "finance_accounts",
            "finance_ledger",
            "finance_transfers",
            "finance_counters",
            "finance_audit",
            "recurring_invoices",
        ]
        for c in colls:
            await self.raw[c].delete_many({})

        await ensure_finance_indexes(self.raw)

        # Set up test app
        self.app = FastAPI()
        self.app.include_router(finance_router.router, prefix="/api/v1")

        # Mock current user context
        self.current_mock_user = {
            "id": "u_admin",
            "full_name": "Faizan Khan",
            "name": "Faizan Khan",
            "email": "faizan.khan@reamarc.io",
            "role": "admin",
            "company_id": COMPANY_A,
            "is_active": True,
            "permissions": {"finance": "manage"},
        }

        async def _override_get_user():
            return self.current_mock_user

        self.app.dependency_overrides[get_current_user] = _override_get_user

    async def asyncTearDown(self):
        db_instance.db = self._prev_db
        self.client.close()

    async def test_01_service_catalog_and_settings_initialization(self):
        """Verify finance settings and 21 default agency services are auto-seeded properly."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/v1/finance/settings")
            self.assertEqual(res.status_code, 200, res.text)
            data = res.json()
            self.assertEqual(data["company_name"], "Reamarc - Digital Solutions")
            self.assertGreaterEqual(len(data["bank_accounts"]), 2)
            bank_ids = [b["bank_id"] for b in data["bank_accounts"]]
            self.assertIn("meezan", bank_ids)
            self.assertIn("abl", bank_ids)

            res_srv = await ac.get("/api/v1/finance/services")
            self.assertEqual(res_srv.status_code, 200)
            services = res_srv.json()
            self.assertEqual(len(services), len(DEFAULT_SERVICES_LIST))
            srv_names = {s["name"] for s in services}
            self.assertIn("Digital Marketing Strategy", srv_names)
            self.assertIn("Search Engine Optimization (SEO)", srv_names)
            self.assertIn("Website Design and Development", srv_names)
            self.assertIn("Professional Video Shoots + Photography Shoots", srv_names)

    async def test_02_atomic_sequential_numbering(self):
        """Dual invoices created at the same moment get atomic, sequential, different numbers."""
        tasks = [
            get_next_number(self.raw, COMPANY_A, "invoice", prefix="INV-", year=2026)
            for _ in range(5)
        ]
        numbers = await asyncio.gather(*tasks)
        self.assertEqual(len(set(numbers)), 5, "All generated invoice numbers must be unique")
        self.assertIn("INV-2026-0001", numbers)
        self.assertIn("INV-2026-0005", numbers)

    async def test_03_invoice_draft_lifecycle_and_locks(self):
        """Dual-condition: editing draft is allowed; editing issued invoice is rejected."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Create Draft Invoice
            invoice_payload = {
                "client_name": "Nova Luxury Living",
                "client_billing": {
                    "name": "Ali Raza",
                    "email": "ali@nova.pk",
                    "address": "Islamabad, PK",
                },
                "issue_date": "2026-10-24",
                "due_date": "2026-11-08",
                "terms": "Net 15",
                "currency": "PKR",
                "line_items": [
                    {
                        "serial": 1,
                        "description": "SMM Retainer Oct 2026",
                        "quantity": 1,
                        "rate": 12000000,  # 120,000 PKR
                        "amount": 12000000,
                    },
                    {
                        "serial": 2,
                        "description": "Meta Ads mgmt",
                        "quantity": 1,
                        "rate": 3000000,   # 30,000 PKR
                        "amount": 3000000,
                    },
                ],
                "discount_type": "amount",
                "discount_value": 500000,  # 5,000 PKR
            }

            res = await ac.post("/api/v1/finance/invoices", json=invoice_payload)
            self.assertEqual(res.status_code, 200, res.text)
            inv = res.json()
            inv_id = inv["id"]
            self.assertEqual(inv["subtotal"], 15000000)
            self.assertEqual(inv["discount_amount"], 500000)
            self.assertEqual(inv["total"], 14500000)
            self.assertEqual(inv["balance_due"], 14500000)
            self.assertEqual(inv["status"], "draft")
            self.assertTrue(inv["number"].startswith("DRAFT-"))
            self.assertIsNotNone(inv.get("share_token"))

            # 2. Legitimate Case: Edit Draft
            update_payload = {"discount_value": 1000000}
            res_update = await ac.put(f"/api/v1/finance/invoices/{inv_id}", json=update_payload)
            self.assertEqual(res_update.status_code, 200)
            updated_inv = res_update.json()
            self.assertEqual(updated_inv["discount_amount"], 1000000)
            self.assertEqual(updated_inv["total"], 14000000)
            self.assertEqual(updated_inv["balance_due"], 14000000)

            # 3. Issue the Invoice
            res_issue = await ac.post(f"/api/v1/finance/invoices/{inv_id}/issue")
            self.assertEqual(res_issue.status_code, 200)
            issued_inv = res_issue.json()
            self.assertEqual(issued_inv["status"], "issued")
            self.assertTrue(issued_inv["number"].startswith("INV-2026-"))
            self.assertIsNotNone(issued_inv.get("pdf_file_id"))

            # 4. Rejected Case: Try to edit an issued invoice
            res_illegal_edit = await ac.put(f"/api/v1/finance/invoices/{inv_id}", json=update_payload)
            self.assertEqual(res_illegal_edit.status_code, 400)
            self.assertIn("only draft invoices can be edited", res_illegal_edit.json()["detail"].lower())

    async def test_04_payment_receipt_allocations_and_ledger(self):
        """Dual-condition: Valid receipt allocates & enters ledger; Over-allocation is rejected."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            inv_payload = {
                "client_name": "SP Builders",
                "issue_date": "2026-10-20",
                "due_date": "2026-10-25",
                "currency": "PKR",
                "line_items": [
                    {"serial": 1, "description": "Website Design", "quantity": 1, "rate": 10000000, "amount": 10000000}
                ],
            }
            inv_res = await ac.post("/api/v1/finance/invoices", json=inv_payload)
            inv_id = inv_res.json()["id"]
            await ac.post(f"/api/v1/finance/invoices/{inv_id}/issue")

            # 1. Rejected Case: Over-allocation (allocate 110,000 when invoice is 100,000)
            over_alloc_receipt = {
                "client_name": "SP Builders",
                "date": "2026-10-21",
                "currency": "PKR",
                "amount_received": 11000000,
                "wht_amount": 0,
                "method": "bank",
                "bank": "meezan",
                "reference_number": "FT-99120",
                "allocations": [
                    {"invoice_id": inv_id, "amount": 11000000, "wht": 0}
                ],
            }
            res_over = await ac.post("/api/v1/finance/receipts", json=over_alloc_receipt)
            self.assertEqual(res_over.status_code, 400)
            self.assertIn("exceeds", res_over.json()["detail"].lower())

            # 2. Rejected Case: Bank payment without reference or invalid bank
            invalid_bank_receipt = {
                "client_name": "SP Builders",
                "date": "2026-10-21",
                "currency": "PKR",
                "amount_received": 5000000,
                "method": "bank",
                "bank": "unknown_bank",
                "allocations": [{"invoice_id": inv_id, "amount": 5000000, "wht": 0}],
            }
            res_inv_bank = await ac.post("/api/v1/finance/receipts", json=invalid_bank_receipt)
            self.assertEqual(res_inv_bank.status_code, 422)

            # 3. Legitimate Case: Partial payment (50,000 PKR cash + 5,000 WHT)
            valid_receipt = {
                "client_name": "SP Builders",
                "date": "2026-10-21",
                "currency": "PKR",
                "amount_received": 5000000,
                "wht_amount": 500000,
                "method": "cash",
                "allocations": [
                    {"invoice_id": inv_id, "amount": 5000000, "wht": 500000}
                ],
            }
            res_rcpt = await ac.post("/api/v1/finance/receipts", json=valid_receipt)
            self.assertEqual(res_rcpt.status_code, 200, res_rcpt.text)
            rcpt = res_rcpt.json()
            self.assertTrue(rcpt["number"].startswith("RCT-2026-"))
            self.assertEqual(rcpt["settles_total"], 5500000)

            # Check invoice status: partially_paid, balance_due = 45,000 PKR
            inv_check = (await ac.get(f"/api/v1/finance/invoices/{inv_id}")).json()
            self.assertEqual(inv_check["status"], "partially_paid")
            self.assertEqual(inv_check["amount_paid"], 5000000)
            self.assertEqual(inv_check["wht_settled"], 500000)
            self.assertEqual(inv_check["balance_due"], 4500000)

            # Check Account Balances: Cash has exactly 50,000 PKR (WHT 5,000 never enters account!)
            accs = (await ac.get("/api/v1/finance/accounts")).json()
            cash_acc = next(a for a in accs if a["code"] == "cash")
            self.assertEqual(cash_acc["balance"], 5000000)

            # 4. Settle remaining 45,000 PKR via Meezan Bank
            valid_final_receipt = {
                "client_name": "SP Builders",
                "date": "2026-10-22",
                "currency": "PKR",
                "amount_received": 4500000,
                "wht_amount": 0,
                "method": "bank",
                "bank": "meezan",
                "reference_number": "MEZN-TX-888",
                "allocations": [
                    {"invoice_id": inv_id, "amount": 4500000, "wht": 0}
                ],
            }
            res_final = await ac.post("/api/v1/finance/receipts", json=valid_final_receipt)
            self.assertEqual(res_final.status_code, 200)

            inv_check_2 = (await ac.get(f"/api/v1/finance/invoices/{inv_id}")).json()
            self.assertEqual(inv_check_2["status"], "paid")
            self.assertEqual(inv_check_2["balance_due"], 0)

            accs_2 = (await ac.get("/api/v1/finance/accounts")).json()
            meezan_acc = next(a for a in accs_2 if a["code"] == "meezan")
            self.assertEqual(meezan_acc["balance"], 4500000)

    async def test_05_cash_to_bank_transfer_and_balance_guard(self):
        """Dual-condition: Transfer <= Cash balance succeeds; Transfer > Cash balance is rejected."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # Seed 50,000 PKR cash
            open_payload = {
                "account_code": "cash",
                "amount": 5000000,
                "date": "2026-10-20",
                "memo": "Seed Cash",
            }
            await ac.post("/api/v1/finance/accounts/opening-balance", json=open_payload)

            # 1. Rejected Case: Transfer 60,000 PKR (exceeds 50,000)
            excess_transfer = {
                "from_account": "cash",
                "to_account": "abl",
                "amount": 6000000,
                "date": "2026-10-21",
                "deposit_slip_reference": "DEP-001",
            }
            res_fail = await ac.post("/api/v1/finance/transfers", json=excess_transfer)
            self.assertEqual(res_fail.status_code, 400)
            self.assertIn("exceeds", res_fail.json()["detail"].lower())

            # 2. Legitimate Case: Transfer 30,000 PKR to ABL
            valid_transfer = {
                "from_account": "cash",
                "to_account": "abl",
                "amount": 3000000,
                "date": "2026-10-21",
                "deposit_slip_reference": "DEP-001",
            }
            res_ok = await ac.post("/api/v1/finance/transfers", json=valid_transfer)
            self.assertEqual(res_ok.status_code, 200)

            accs = (await ac.get("/api/v1/finance/accounts")).json()
            cash = next(a for a in accs if a["code"] == "cash")
            abl = next(a for a in accs if a["code"] == "abl")
            self.assertEqual(cash["balance"], 2000000)  # 50k - 30k = 20k
            self.assertEqual(abl["balance"], 3000000)   # 0 + 30k = 30k

    async def test_06_void_receipt_reversal_and_invoice_reopen(self):
        """Voiding a receipt reverses ledger entries and reopens invoice balance accurately."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            inv_res = await ac.post("/api/v1/finance/invoices", json={
                "client_name": "Milestone Marketing",
                "issue_date": "2026-10-24",
                "due_date": "2026-10-25",
                "line_items": [{"serial": 1, "description": "SEO", "quantity": 1, "rate": 2000000, "amount": 2000000}],
            })
            inv_id = inv_res.json()["id"]
            await ac.post(f"/api/v1/finance/invoices/{inv_id}/issue")

            rcpt_res = await ac.post("/api/v1/finance/receipts", json={
                "client_name": "Milestone Marketing",
                "date": "2026-10-24",
                "currency": "PKR",
                "amount_received": 2000000,
                "wht_amount": 0,
                "method": "bank",
                "bank": "meezan",
                "reference_number": "TX-MZN-999",
                "allocations": [{"invoice_id": inv_id, "amount": 2000000, "wht": 0}],
            })
            rcpt_id = rcpt_res.json()["id"]

            # Void the receipt
            res_void = await ac.post(f"/api/v1/finance/receipts/{rcpt_id}/void", json={"reason": "Cheque bounced"})
            self.assertEqual(res_void.status_code, 200)

            # Invoice reopened
            inv_reopened = (await ac.get(f"/api/v1/finance/invoices/{inv_id}")).json()
            self.assertIn(inv_reopened["status"], ("issued", "overdue"))
            self.assertEqual(inv_reopened["balance_due"], 2000000)
            self.assertEqual(inv_reopened["amount_paid"], 0)

            # Meezan balance restored to 0
            accs = (await ac.get("/api/v1/finance/accounts")).json()
            meezan = next(a for a in accs if a["code"] == "meezan")
            self.assertEqual(meezan["balance"], 0)

    async def test_07_void_invoice_protection_with_active_receipt(self):
        """Dual-condition: Invoice with active receipts cannot be voided; without receipts can be voided."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            inv_res = await ac.post("/api/v1/finance/invoices", json={
                "client_name": "Test Client",
                "issue_date": "2026-10-24",
                "due_date": "2026-10-25",
                "line_items": [{"serial": 1, "description": "Dev", "quantity": 1, "rate": 1000000, "amount": 1000000}],
            })
            inv_id = inv_res.json()["id"]
            await ac.post(f"/api/v1/finance/invoices/{inv_id}/issue")

            # Post active receipt
            rcpt_res = await ac.post("/api/v1/finance/receipts", json={
                "client_name": "Test Client",
                "date": "2026-10-24",
                "currency": "PKR",
                "amount_received": 1000000,
                "method": "cash",
                "allocations": [{"invoice_id": inv_id, "amount": 1000000, "wht": 0}],
            })
            rcpt_id = rcpt_res.json()["id"]

            # 1. Rejected Case: Try voiding invoice while receipt is active
            res_bad_void = await ac.post(f"/api/v1/finance/invoices/{inv_id}/void", json={"reason": "cancelled"})
            self.assertEqual(res_bad_void.status_code, 400)
            self.assertIn("must void the receipt first", res_bad_void.json()["detail"].lower())

            # 2. Legitimate Case: Void the receipt first, then void invoice
            await ac.post(f"/api/v1/finance/receipts/{rcpt_id}/void", json={"reason": "wrong payment"})
            res_good_void = await ac.post(f"/api/v1/finance/invoices/{inv_id}/void", json={"reason": "cancelled"})
            self.assertEqual(res_good_void.status_code, 200)
            self.assertEqual(res_good_void.json()["status"], "void")

    async def test_08_foreign_currency_usd_conversion(self):
        """Foreign currency receipt credits PKR paisa to account while invoice is in USD."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            inv_res = await ac.post("/api/v1/finance/invoices", json={
                "client_name": "Global Tech Corp",
                "issue_date": "2026-10-24",
                "due_date": "2026-10-30",
                "currency": "USD",
                "line_items": [{"serial": 1, "description": "Consultation", "quantity": 1, "rate": 120000, "amount": 120000}],
            })
            inv_id = inv_res.json()["id"]
            await ac.post(f"/api/v1/finance/invoices/{inv_id}/issue")

            # Exchange rate 278.50 PKR/USD
            valid_usd_rcpt = {
                "client_name": "Global Tech Corp",
                "date": "2026-10-24",
                "currency": "USD",
                "amount_received": 120000,
                "exchange_rate": 278.50,
                "method": "bank",
                "bank": "meezan",
                "reference_number": "WIRE-USD-01",
                "allocations": [{"invoice_id": inv_id, "amount": 120000, "wht": 0}],
            }
            res_ok = await ac.post("/api/v1/finance/receipts", json=valid_usd_rcpt)
            self.assertEqual(res_ok.status_code, 200)
            rcpt = res_ok.json()
            self.assertEqual(rcpt["pkr_amount"], 33420000)

            # Invoice in USD is marked paid
            inv = (await ac.get(f"/api/v1/finance/invoices/{inv_id}")).json()
            self.assertEqual(inv["status"], "paid")
            self.assertEqual(inv["balance_due"], 0)

            # Ledger Meezan balance is in PKR (33,420,000 paisa)
            accs = (await ac.get("/api/v1/finance/accounts")).json()
            meezan = next(a for a in accs if a["code"] == "meezan")
            self.assertEqual(meezan["balance"], 33420000)

    async def test_09_company_isolation(self):
        """Company A cannot read, edit, or void Company B's invoices or receipts."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # Company A creates invoice
            self.current_mock_user["company_id"] = COMPANY_A
            res_a = await ac.post("/api/v1/finance/invoices", json={
                "client_name": "Company A Client",
                "issue_date": "2026-10-24",
                "due_date": "2026-10-25",
                "line_items": [{"serial": 1, "description": "Strategy", "quantity": 1, "rate": 500000, "amount": 500000}],
            })
            inv_id_a = res_a.json()["id"]

            # Switch user to Company B
            self.current_mock_user["company_id"] = COMPANY_B
            res_b = await ac.get(f"/api/v1/finance/invoices/{inv_id_a}")
            self.assertEqual(res_b.status_code, 404)

            res_void_b = await ac.post(f"/api/v1/finance/invoices/{inv_id_a}/void", json={"reason": "hacked"})
            self.assertEqual(res_void_b.status_code, 404)

            list_b = (await ac.get("/api/v1/finance/invoices")).json()
            self.assertEqual(len(list_b["items"]), 0)

    async def test_10_reports_excel_pdf_and_public_link(self):
        """Ageing reports, Excel export, PDF export, and Public link."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            self.current_mock_user["company_id"] = COMPANY_A
            inv_res = await ac.post("/api/v1/finance/invoices", json={
                "client_name": "Apex Builders",
                "issue_date": "2026-09-01",
                "due_date": "2026-09-15",
                "line_items": [{"serial": 1, "description": "Branding", "quantity": 1, "rate": 8000000, "amount": 8000000}],
            })
            inv_id = inv_res.json()["id"]
            await ac.post(f"/api/v1/finance/invoices/{inv_id}/issue")

            # 1. Ageing Summary JSON
            res_summary = await ac.get("/api/v1/finance/reports/ageing-summary?as_of=2026-10-24")
            self.assertEqual(res_summary.status_code, 200)
            summary_data = res_summary.json()
            apex_row = next(r for r in summary_data["rows"] if r["client_name"] == "Apex Builders")
            self.assertEqual(apex_row["31_60"], 8000000)

            # 2. Ageing Summary Excel Export
            res_excel = await ac.get("/api/v1/finance/reports/ageing-summary?format=xlsx")
            self.assertEqual(res_excel.status_code, 200)
            self.assertEqual(res_excel.headers["content-type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.assertGreater(len(res_excel.content), 1000)

            # 3. Ageing Summary PDF Export
            res_pdf = await ac.get("/api/v1/finance/reports/ageing-summary?format=pdf")
            self.assertEqual(res_pdf.status_code, 200)
            self.assertEqual(res_pdf.headers["content-type"], "application/pdf")
            self.assertTrue(res_pdf.content.startswith(b"%PDF"))

            # 4. Client Statement
            res_stmt = await ac.get("/api/v1/finance/reports/statement?client_name=Apex Builders")
            self.assertEqual(res_stmt.status_code, 200)
            stmt = res_stmt.json()
            self.assertEqual(stmt["client_name"], "Apex Builders")
            self.assertGreaterEqual(len(stmt["transactions"]), 1)

            # 5. Public invoice share link
            inv_detail = (await ac.get(f"/api/v1/finance/invoices/{inv_id}")).json()
            share_tok = inv_detail["share_token"]
            res_pub = await ac.get(f"/api/v1/finance/public/invoice/{share_tok}")
            self.assertEqual(res_pub.status_code, 200)
            self.assertEqual(res_pub.json()["invoice"]["client_name"], "Apex Builders")

            # Public PDF
            res_pub_pdf = await ac.get(f"/api/v1/finance/public/invoice/{share_tok}/pdf")
            self.assertEqual(res_pub_pdf.status_code, 200)
            self.assertTrue(res_pub_pdf.content.startswith(b"%PDF"))

    def test_11_amount_in_words_pakistani_format(self):
        """Test Pakistani Lakhs/Crores amount in words conversion."""
        self.assertEqual(
            amount_in_words(14500000, "PKR"),
            "Rupees One Lakh Forty Five Thousand Only",
        )
        self.assertEqual(
            amount_in_words(120000, "USD"),
            "US Dollars One Thousand Two Hundred Only",
        )
        self.assertEqual(
            amount_in_words(2500000000, "PKR"),
            "Rupees Two Crore Fifty Lakh Only",
        )

    async def test_12_wht_only_settlement(self):
        """A WHT-only settlement marks invoice as paid without crediting any money account."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            inv_res = await ac.post("/api/v1/finance/invoices", json={
                "client_name": "Govt Agency",
                "issue_date": "2026-10-24",
                "due_date": "2026-10-25",
                "line_items": [{"serial": 1, "description": "Consulting", "quantity": 1, "rate": 5000000, "amount": 5000000}],
            })
            inv_id = inv_res.json()["id"]
            await ac.post(f"/api/v1/finance/invoices/{inv_id}/issue")

            # 100% WHT withheld (50,000 PKR, amount_received = 0)
            wht_rcpt = {
                "client_name": "Govt Agency",
                "date": "2026-10-24",
                "currency": "PKR",
                "amount_received": 0,
                "wht_amount": 5000000,
                "method": "cash",
                "allocations": [{"invoice_id": inv_id, "amount": 0, "wht": 5000000}],
            }
            res_ok = await ac.post("/api/v1/finance/receipts", json=wht_rcpt)
            self.assertEqual(res_ok.status_code, 200)

            # Invoice is paid
            inv = (await ac.get(f"/api/v1/finance/invoices/{inv_id}")).json()
            self.assertEqual(inv["status"], "paid")
            self.assertEqual(inv["balance_due"], 0)
            self.assertEqual(inv["wht_settled"], 5000000)

            # All money accounts remain 0 (WHT never enters Cash or Bank!)
            accs = (await ac.get("/api/v1/finance/accounts")).json()
            for a in accs:
                self.assertEqual(a["balance"], 0)

    async def test_13_permissions_and_client_role_forbidden(self):
        """External client role gets 403 on internal finance routes."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            self.current_mock_user["role"] = "client"
            self.current_mock_user["permissions"] = {}

            res_inv = await ac.get("/api/v1/finance/invoices")
            self.assertEqual(res_inv.status_code, 403)

            res_rcpt = await ac.get("/api/v1/finance/receipts")
            self.assertEqual(res_rcpt.status_code, 403)

            res_acc = await ac.get("/api/v1/finance/accounts")
            self.assertEqual(res_acc.status_code, 403)

    async def test_14_vulnerabilities_negative_and_zero_values(self):
        """Validation rules block negative amounts, zero allocation, empty line items, and bad dates."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            self.current_mock_user["role"] = "admin"
            self.current_mock_user["permissions"] = {"finance": "manage"}

            # Negative line item amount
            bad_inv_1 = {
                "client_name": "Bad Actor",
                "issue_date": "2026-10-24",
                "due_date": "2026-10-25",
                "line_items": [{"serial": 1, "description": "Negative", "quantity": 1, "rate": -5000, "amount": -5000}],
            }
            res_bad_1 = await ac.post("/api/v1/finance/invoices", json=bad_inv_1)
            self.assertEqual(res_bad_1.status_code, 422)

            # Empty line items
            bad_inv_2 = {
                "client_name": "Bad Actor",
                "issue_date": "2026-10-24",
                "due_date": "2026-10-25",
                "line_items": [],
            }
            res_bad_2 = await ac.post("/api/v1/finance/invoices", json=bad_inv_2)
            self.assertEqual(res_bad_2.status_code, 422)

            # Invalid date format
            bad_inv_3 = {
                "client_name": "Bad Actor",
                "issue_date": "24/10/2026",
                "due_date": "2026-10-25",
                "line_items": [{"serial": 1, "description": "Test", "quantity": 1, "rate": 1000, "amount": 1000}],
            }
            res_bad_3 = await ac.post("/api/v1/finance/invoices", json=bad_inv_3)
            self.assertEqual(res_bad_3.status_code, 422)

            # Receipt with 0 amount_received and 0 wht_amount
            bad_rcpt_zero = {
                "client_name": "Bad Actor",
                "date": "2026-10-24",
                "currency": "PKR",
                "amount_received": 0,
                "wht_amount": 0,
                "method": "cash",
            }
            res_rcpt_zero = await ac.post("/api/v1/finance/receipts", json=bad_rcpt_zero)
            self.assertEqual(res_rcpt_zero.status_code, 422)

    async def test_15_recurring_invoices(self):
        """Recurring invoice template creation and retrieval."""
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            self.current_mock_user["role"] = "admin"
            self.current_mock_user["permissions"] = {"finance": "manage"}

            rec_payload = {
                "template_invoice": {
                    "client_name": "Retainer Client",
                    "issue_date": "2026-10-24",
                    "due_date": "2026-11-08",
                    "terms": "Net 15",
                    "currency": "PKR",
                    "line_items": [{"serial": 1, "description": "Monthly Retainer", "quantity": 1, "rate": 15000000, "amount": 15000000}],
                },
                "frequency": "monthly",
                "next_run_date": "2026-11-24",
                "auto_issue": False,
            }
            res = await ac.post("/api/v1/finance/recurring", json=rec_payload)
            self.assertEqual(res.status_code, 200)
            rec = res.json()
            self.assertEqual(rec["frequency"], "monthly")

            list_rec = await ac.get("/api/v1/finance/recurring")
            self.assertEqual(list_rec.status_code, 200)
            self.assertEqual(len(list_rec.json()), 1)


if __name__ == "__main__":
    unittest.main()
