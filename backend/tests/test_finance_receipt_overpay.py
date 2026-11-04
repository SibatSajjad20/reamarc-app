"""Throwaway-DB tests: unapplied WHT and accidental client credit are rejected."""
from __future__ import annotations

import os
import unittest

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("SECRET_KEY", "test-finance-receipt-overpay-secret-0123456789")

from app.schemas.finance import ReceiptAllocation, ReceiptCreate
from app.services.finance_receipts import (
    UNAPPLIED_CASH_DETAIL,
    WHT_MUST_BE_APPLIED_DETAIL,
    post_receipt,
    update_receipt,
)


COMPANY_A = "company-a"
INVOICE_TOTAL = 15_000_000  # PKR 150,000
CASH_150K = 15_000_000
CASH_144K = 14_400_000
CASH_160K = 16_000_000
WHT_6K = 600_000
EXTRA_10K = 1_000_000


def _payload(**overrides) -> ReceiptCreate:
    data = {
        "client_name": "Acme",
        "date": "2026-01-15",
        "currency": "PKR",
        "amount_received": CASH_150K,
        "wht_amount": 0,
        "method": "cash",
        "allocations": [ReceiptAllocation(invoice_id="inv-1", amount=CASH_150K, wht=0)],
        "allow_client_credit": False,
    }
    data.update(overrides)
    return ReceiptCreate(**data)


class TestFinanceReceiptOverpay(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().test_finance_receipt_overpay
        await self.db["finance_settings"].insert_one({
            "company_id": COMPANY_A,
            "receipt_prefix": "RCT-",
        })
        await self.db["invoices"].insert_many([
            {
                "id": "inv-1",
                "company_id": COMPANY_A,
                "number": "INV-001",
                "status": "issued",
                "currency": "PKR",
                "total": INVOICE_TOTAL,
                "amount_paid": 0,
                "wht_settled": 0,
                "balance_due": INVOICE_TOTAL,
                "issue_date": "2026-01-01",
            },
            {
                "id": "inv-pending",
                "company_id": COMPANY_A,
                "number": "INV-002",
                "status": "issued",
                "currency": "PKR",
                "total": INVOICE_TOTAL,
                "amount_paid": 0,
                "wht_settled": 0,
                "balance_due": INVOICE_TOTAL,
                "issue_date": "2026-01-01",
            },
        ])
        await self.db["receipts"].insert_one({
            "id": "rcp-pending",
            "company_id": COMPANY_A,
            "number": "RCT-0001",
            "client_name": "Acme",
            "date": "2026-01-15",
            "currency": "PKR",
            "amount_received": CASH_150K,
            "wht_amount": 0,
            "settles_total": CASH_150K,
            "method": "cash",
            "bank": None,
            "reference_number": "",
            "exchange_rate": None,
            "pkr_amount": CASH_150K,
            "allocations": [{"invoice_id": "inv-pending", "amount": CASH_150K, "wht": 0}],
            "unapplied_amount": 0,
            "memo": "",
            "proof_file_ids": [],
            "wht_certificate_file_id": None,
            "status": "pending",
            "is_cheque": True,
        })

    async def _invoice(self):
        return await self.db["invoices"].find_one({"id": "inv-1"})

    async def test_rct_26_0002_cash_plus_unapplied_wht_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await post_receipt(
                self.db,
                COMPANY_A,
                _payload(
                    amount_received=CASH_150K,
                    wht_amount=WHT_6K,
                    allocations=[ReceiptAllocation(invoice_id="inv-1", amount=CASH_150K, wht=0)],
                ),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, WHT_MUST_BE_APPLIED_DETAIL)

    async def test_144k_cash_plus_6k_wht_settles_invoice(self):
        doc = await post_receipt(
            self.db,
            COMPANY_A,
            _payload(
                amount_received=CASH_144K,
                wht_amount=WHT_6K,
                allocations=[ReceiptAllocation(invoice_id="inv-1", amount=CASH_144K, wht=WHT_6K)],
            ),
        )
        self.assertEqual(doc["unapplied_amount"], 0)
        inv = await self._invoice()
        self.assertEqual(inv["balance_due"], 0)
        self.assertEqual(inv["amount_paid"], CASH_144K)
        self.assertEqual(inv["wht_settled"], WHT_6K)
        self.assertEqual(inv["status"], "paid")

    async def test_160k_cash_without_credit_flag_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await post_receipt(
                self.db,
                COMPANY_A,
                _payload(
                    amount_received=CASH_160K,
                    allocations=[ReceiptAllocation(invoice_id="inv-1", amount=CASH_150K, wht=0)],
                    allow_client_credit=False,
                ),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, UNAPPLIED_CASH_DETAIL)

    async def test_160k_cash_with_credit_flag_keeps_unapplied(self):
        doc = await post_receipt(
            self.db,
            COMPANY_A,
            _payload(
                amount_received=CASH_160K,
                allocations=[ReceiptAllocation(invoice_id="inv-1", amount=CASH_150K, wht=0)],
                allow_client_credit=True,
            ),
        )
        self.assertEqual(doc["unapplied_amount"], EXTRA_10K)
        inv = await self._invoice()
        self.assertEqual(inv["balance_due"], 0)

    async def test_pure_advance_requires_credit_flag_and_zero_wht(self):
        with self.assertRaises(HTTPException) as ctx:
            await post_receipt(
                self.db,
                COMPANY_A,
                _payload(amount_received=CASH_150K, allocations=[], allow_client_credit=False),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, UNAPPLIED_CASH_DETAIL)

        with self.assertRaises(HTTPException) as ctx:
            await post_receipt(
                self.db,
                COMPANY_A,
                _payload(
                    amount_received=CASH_150K,
                    wht_amount=WHT_6K,
                    allocations=[],
                    allow_client_credit=True,
                ),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, WHT_MUST_BE_APPLIED_DETAIL)

        doc = await post_receipt(
            self.db,
            COMPANY_A,
            _payload(amount_received=CASH_150K, allocations=[], allow_client_credit=True),
        )
        self.assertEqual(doc["unapplied_amount"], CASH_150K)

    async def test_update_pending_rejects_unapplied_wht(self):
        with self.assertRaises(HTTPException) as ctx:
            await update_receipt(
                self.db,
                COMPANY_A,
                "rcp-pending",
                _payload(
                    amount_received=CASH_150K,
                    wht_amount=WHT_6K,
                    allocations=[ReceiptAllocation(invoice_id="inv-pending", amount=CASH_150K, wht=0)],
                    is_cheque=True,
                ),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, WHT_MUST_BE_APPLIED_DETAIL)

    async def test_update_pending_144k_cash_plus_6k_wht_ok(self):
        updated = await update_receipt(
            self.db,
            COMPANY_A,
            "rcp-pending",
            _payload(
                amount_received=CASH_144K,
                wht_amount=WHT_6K,
                allocations=[ReceiptAllocation(invoice_id="inv-pending", amount=CASH_144K, wht=WHT_6K)],
                is_cheque=True,
            ),
        )
        self.assertEqual(updated["unapplied_amount"], 0)
        self.assertEqual(updated["amount_received"], CASH_144K)
        self.assertEqual(updated["wht_amount"], WHT_6K)

    async def test_update_pending_160k_cash_requires_flag(self):
        with self.assertRaises(HTTPException) as ctx:
            await update_receipt(
                self.db,
                COMPANY_A,
                "rcp-pending",
                _payload(
                    amount_received=CASH_160K,
                    allocations=[ReceiptAllocation(invoice_id="inv-pending", amount=CASH_150K, wht=0)],
                    is_cheque=True,
                    allow_client_credit=False,
                ),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, UNAPPLIED_CASH_DETAIL)

        updated = await update_receipt(
            self.db,
            COMPANY_A,
            "rcp-pending",
            _payload(
                amount_received=CASH_160K,
                allocations=[ReceiptAllocation(invoice_id="inv-pending", amount=CASH_150K, wht=0)],
                is_cheque=True,
                allow_client_credit=True,
            ),
        )
        self.assertEqual(updated["unapplied_amount"], EXTRA_10K)
