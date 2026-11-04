"""Throwaway-DB tests for PATCH receipt edits."""
from __future__ import annotations

import os
import unittest

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("SECRET_KEY", "test-finance-receipt-edit-secret-0123456789")

from app.schemas.finance import ReceiptAllocation, ReceiptCreate
from app.services.finance_receipts import POSTED_RECEIPT_EDIT_DETAIL, update_receipt


COMPANY_A = "company-a"
COMPANY_B = "company-b"


def _payload(**overrides) -> ReceiptCreate:
    data = {
        "client_name": "Acme",
        "date": "2026-01-15",
        "currency": "PKR",
        "amount_received": 700000,
        "wht_amount": 300000,
        "method": "bank",
        "bank": "meezan",
        "reference_number": "FT-1",
        "memo": "original memo",
        "allocations": [ReceiptAllocation(invoice_id="inv-1", amount=700000, wht=300000)],
        "proof_file_ids": [],
        "is_cheque": True,
    }
    data.update(overrides)
    return ReceiptCreate(**data)


class TestFinanceReceiptEdit(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().test_finance_receipt_edit
        await self.db["invoices"].insert_one({
            "id": "inv-1",
            "company_id": COMPANY_A,
            "number": "INV-001",
            "status": "issued",
            "currency": "PKR",
            "total": 1000000,
            "amount_paid": 0,
            "wht_settled": 0,
            "balance_due": 1000000,
            "issue_date": "2026-01-01",
        })
        self.pending = {
            "id": "rcp-pending",
            "company_id": COMPANY_A,
            "number": "RCT-0001",
            "client_name": "Acme",
            "date": "2026-01-15",
            "currency": "PKR",
            "amount_received": 700000,
            "wht_amount": 300000,
            "settles_total": 1000000,
            "method": "bank",
            "bank": "meezan",
            "reference_number": "FT-1",
            "exchange_rate": None,
            "pkr_amount": 700000,
            "allocations": [{"invoice_id": "inv-1", "amount": 700000, "wht": 300000}],
            "unapplied_amount": 0,
            "memo": "original memo",
            "proof_file_ids": [],
            "wht_certificate_file_id": None,
            "status": "pending",
            "is_cheque": True,
        }
        self.posted = {
            **self.pending,
            "id": "rcp-posted",
            "number": "RCT-0002",
            "status": "posted",
            "is_cheque": False,
        }
        await self.db["receipts"].insert_many([self.pending, self.posted])

    async def test_pending_edit_updates_amount_and_allocations(self):
        updated = await update_receipt(
            self.db,
            COMPANY_A,
            "rcp-pending",
            _payload(
                amount_received=500000,
                wht_amount=200000,
                memo="edited pending",
                allocations=[ReceiptAllocation(invoice_id="inv-1", amount=500000, wht=200000)],
            ),
            user_id="user-1",
            user_name="Tester",
        )
        self.assertEqual(updated["amount_received"], 500000)
        self.assertEqual(updated["wht_amount"], 200000)
        self.assertEqual(updated["memo"], "edited pending")
        self.assertEqual(updated["allocations"][0]["amount"], 500000)
        self.assertEqual(updated["status"], "pending")

    async def test_posted_amount_edit_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await update_receipt(
                self.db,
                COMPANY_A,
                "rcp-posted",
                _payload(
                    amount_received=500000,
                    wht_amount=200000,
                    is_cheque=False,
                    allocations=[ReceiptAllocation(invoice_id="inv-1", amount=500000, wht=200000)],
                ),
                user_id="user-1",
                user_name="Tester",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, POSTED_RECEIPT_EDIT_DETAIL)

    async def test_posted_memo_edit_works(self):
        updated = await update_receipt(
            self.db,
            COMPANY_A,
            "rcp-posted",
            _payload(memo="posted notes only", is_cheque=False, proof_file_ids=["file-1"]),
            user_id="user-1",
            user_name="Tester",
        )
        self.assertEqual(updated["memo"], "posted notes only")
        self.assertEqual(updated["proof_file_ids"], ["file-1"])
        self.assertEqual(updated["amount_received"], 700000)
        self.assertEqual(updated["status"], "posted")

    async def test_cross_company_404(self):
        with self.assertRaises(HTTPException) as ctx:
            await update_receipt(
                self.db,
                COMPANY_B,
                "rcp-pending",
                _payload(),
                user_id="user-1",
                user_name="Tester",
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_audit_entry_written(self):
        await update_receipt(
            self.db,
            COMPANY_A,
            "rcp-pending",
            _payload(memo="audited memo"),
            user_id="user-1",
            user_name="Tester",
        )
        audit = await self.db["finance_audit"].find_one({
            "entity_id": "rcp-pending",
            "action": "receipt_edit",
        })
        self.assertIsNotNone(audit)
        self.assertEqual(audit["company_id"], COMPANY_A)
        self.assertEqual(audit["user_id"], "user-1")
        self.assertEqual(audit["user_name"], "Tester")
        self.assertEqual(audit["details"]["old"]["memo"], "original memo")
        self.assertEqual(audit["details"]["new"]["memo"], "audited memo")

    async def test_pending_edit_rejects_unapplied_wht(self):
        from app.services.finance_receipts import WHT_MUST_BE_APPLIED_DETAIL

        with self.assertRaises(HTTPException) as ctx:
            await update_receipt(
                self.db,
                COMPANY_A,
                "rcp-pending",
                _payload(
                    amount_received=1000000,
                    wht_amount=60000,
                    allocations=[ReceiptAllocation(invoice_id="inv-1", amount=1000000, wht=0)],
                ),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, WHT_MUST_BE_APPLIED_DETAIL)

    async def test_pending_edit_rejects_unapplied_cash_without_flag(self):
        from app.services.finance_receipts import UNAPPLIED_CASH_DETAIL

        with self.assertRaises(HTTPException) as ctx:
            await update_receipt(
                self.db,
                COMPANY_A,
                "rcp-pending",
                _payload(
                    amount_received=1100000,
                    wht_amount=0,
                    allocations=[ReceiptAllocation(invoice_id="inv-1", amount=1000000, wht=0)],
                ),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, UNAPPLIED_CASH_DETAIL)

    async def test_pending_edit_allows_unapplied_cash_with_flag(self):
        updated = await update_receipt(
            self.db,
            COMPANY_A,
            "rcp-pending",
            _payload(
                amount_received=1100000,
                wht_amount=0,
                allocations=[ReceiptAllocation(invoice_id="inv-1", amount=1000000, wht=0)],
                allow_client_credit=True,
            ),
        )
        self.assertEqual(updated["unapplied_amount"], 100000)
        self.assertEqual(updated["status"], "pending")
