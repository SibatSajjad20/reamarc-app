"""Receipt recording, invoice allocation, ledger posting, and void reversals."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from pymongo import DESCENDING

from app.schemas.finance import ReceiptCreate, ReceiptResponse
from app.services.finance_ledger import record_ledger_entry, reverse_ledger_entries
from app.services.finance_numbering import get_next_number
from app.services.finance_settings import get_or_init_finance_settings

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def post_receipt(
    db,
    company_id: str,
    payload: ReceiptCreate,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Record payment receipt with invoice allocations, currency conversions, and ledger posting."""
    receipt_id = f"rcp_{uuid.uuid4().hex[:12]}"
    now = _now_iso()

    # 1. Currency & PKR Amount Calculation
    if payload.currency == "PKR":
        pkr_amount = payload.amount_received
    else:
        if not payload.exchange_rate or payload.exchange_rate <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Foreign currency ({payload.currency}) receipt requires a positive exchange rate",
            )
        pkr_amount = int(round(payload.amount_received * payload.exchange_rate))

    # 2. Validate Allocations against Invoices
    alloc_invoice_docs: List[Dict[str, Any]] = []
    enriched_allocations: List[Dict[str, Any]] = []

    for alloc in payload.allocations:
        inv = await db["invoices"].find_one({"company_id": company_id, "id": alloc.invoice_id})
        if not inv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Allocated invoice ID '{alloc.invoice_id}' not found",
            )
        if inv.get("status") in ("draft", "void"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot allocate payment to invoice {inv.get('number')} in '{inv.get('status')}' status",
            )
        if inv.get("currency") != payload.currency:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Currency mismatch: Receipt is in {payload.currency} but invoice {inv.get('number')} "
                    f"is in {inv.get('currency')}."
                ),
            )

        alloc_settle = alloc.amount + alloc.wht
        curr_balance = inv.get("balance_due", 0)
        if alloc_settle > curr_balance:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Allocation for invoice {inv.get('number')} ({alloc_settle / 100:.2f}) "
                    f"exceeds remaining balance due ({curr_balance / 100:.2f})."
                ),
            )

        alloc_invoice_docs.append(inv)
        enriched_allocations.append({
            "invoice_id": inv["id"],
            "invoice_number": inv.get("number"),
            "invoice_date": inv.get("issue_date"),
            "invoice_total": inv.get("total"),
            "invoice_balance_due": max(0, curr_balance - alloc_settle),
            "amount": alloc.amount,
            "wht": alloc.wht,
        })

    # 3. Reserve Sequential Receipt Number
    settings = await get_or_init_finance_settings(db, company_id)
    prefix = settings.get("receipt_prefix", "RCT-")
    rcpt_year = datetime.strptime(payload.date or _today_str(), "%Y-%m-%d").year
    rcpt_number = await get_next_number(db, company_id, "receipt", prefix=prefix, year=rcpt_year)

    total_alloc_amount = sum(a.amount for a in payload.allocations)
    total_alloc_wht = sum(a.wht for a in payload.allocations)
    unapplied_amount = (payload.amount_received - total_alloc_amount) + (payload.wht_amount - total_alloc_wht)

    receipt_doc = {
        "id": receipt_id,
        "company_id": company_id,
        "number": rcpt_number,
        "workspace_id": payload.workspace_id,
        "client_name": payload.client_name,
        "date": payload.date,
        "currency": payload.currency,
        "amount_received": payload.amount_received,
        "wht_amount": payload.wht_amount,
        "settles_total": payload.amount_received + payload.wht_amount,
        "method": payload.method,
        "bank": payload.bank,
        "reference_number": payload.reference_number or "",
        "exchange_rate": payload.exchange_rate,
        "pkr_amount": pkr_amount,
        "allocations": enriched_allocations,
        "unapplied_amount": unapplied_amount,
        "memo": payload.memo or "",
        "proof_file_ids": payload.proof_file_ids,
        "wht_certificate_file_id": payload.wht_certificate_file_id,
        "status": "posted",
        "created_by": user_id,
        "created_by_name": user_name,
        "created_at": now,
    }

    # 4. Insert Receipt Record
    await db["receipts"].insert_one(receipt_doc)

    # 5. Ledger Posting (PKR amount enters Cash or Bank; WHT never enters account)
    if pkr_amount > 0:
        account_target = "cash" if payload.method == "cash" else payload.bank.lower()
        memo_str = f"Payment from {payload.client_name}"
        if payload.reference_number:
            memo_str += f" (Ref: {payload.reference_number})"
        if payload.currency != "PKR":
            memo_str += f" [{payload.currency} {payload.amount_received / 100:.2f} @ {payload.exchange_rate}]"

        await record_ledger_entry(
            db,
            company_id=company_id,
            account_code=account_target,
            direction="in",
            amount=pkr_amount,
            source_type="receipt",
            source_id=receipt_id,
            memo=memo_str,
            user_id=user_id,
            user_name=user_name,
            entry_date=payload.date,
        )

    # 6. Update Allocated Invoices
    today = _today_str()
    for alloc, inv in zip(payload.allocations, alloc_invoice_docs):
        new_paid = inv.get("amount_paid", 0) + alloc.amount
        new_wht = inv.get("wht_settled", 0) + alloc.wht
        total = inv.get("total", 0)
        new_balance = max(0, total - (new_paid + new_wht))
        new_status = "paid" if new_balance == 0 else "partially_paid"

        result = await db["invoices"].update_one(
            {
                "company_id": company_id,
                "id": inv["id"],
                "balance_due": {"$gte": alloc.amount + alloc.wht},
            },
            {
                "$set": {
                    "amount_paid": new_paid,
                    "wht_settled": new_wht,
                    "balance_due": new_balance,
                    "status": new_status,
                    "updated_at": now,
                }
            },
        )
        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Invoice {inv.get('number')} was updated by another payment. "
                    "Refresh and try again."
                ),
            )

    # 7. Record Audit
    await db["finance_audit"].insert_one({
        "id": f"aud_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "action": "receipt_post",
        "entity_type": "receipt",
        "entity_id": receipt_id,
        "details": {
            "number": rcpt_number,
            "amount_received": payload.amount_received,
            "currency": payload.currency,
            "pkr_amount": pkr_amount,
            "client_name": payload.client_name,
        },
        "user_id": user_id,
        "user_name": user_name,
        "created_at": now,
    })

    return receipt_doc


async def void_receipt(
    db,
    company_id: str,
    receipt_id: str,
    reason: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Void an active receipt, reversing ledger entries and reopening invoice balances."""
    coll = db["receipts"]
    receipt = await coll.find_one({"company_id": company_id, "id": receipt_id})
    if not receipt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")

    if receipt.get("status") == "void":
        return receipt

    now = _now_iso()
    today = _today_str()

    # 1. Reverse Ledger Movements
    await reverse_ledger_entries(
        db,
        company_id=company_id,
        source_type="receipt",
        source_id=receipt_id,
        reason=reason,
        user_id=user_id,
        user_name=user_name,
    )

    # 2. Reopen Invoices that had allocations in this receipt
    for alloc in receipt.get("allocations", []):
        inv_id = alloc.get("invoice_id")
        inv = await db["invoices"].find_one({"company_id": company_id, "id": inv_id})
        if inv and inv.get("status") != "void":
            alloc_amt = alloc.get("amount", 0)
            alloc_wht = alloc.get("wht", 0)

            new_paid = max(0, inv.get("amount_paid", 0) - alloc_amt)
            new_wht = max(0, inv.get("wht_settled", 0) - alloc_wht)
            total = inv.get("total", 0)
            new_balance = max(0, total - (new_paid + new_wht))

            # If fully unpaid, check if overdue or issued
            if new_balance >= total:
                new_status = "overdue" if inv.get("due_date", "") < today else "issued"
            elif new_balance > 0:
                new_status = "partially_paid"
            else:
                new_status = "paid"

            await db["invoices"].update_one(
                {"company_id": company_id, "id": inv_id},
                {
                    "$set": {
                        "amount_paid": new_paid,
                        "wht_settled": new_wht,
                        "balance_due": new_balance,
                        "status": new_status,
                        "updated_at": now,
                    }
                },
            )

    # 3. Mark Receipt Void
    updated_rcpt = await coll.find_one_and_update(
        {"company_id": company_id, "id": receipt_id},
        {
            "$set": {
                "status": "void",
                "void_reason": reason,
                "voided_at": now,
                "voided_by": user_id,
                "updated_at": now,
            }
        },
        return_document=True,
    )

    # 4. Record Audit
    await db["finance_audit"].insert_one({
        "id": f"aud_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "action": "receipt_void",
        "entity_type": "receipt",
        "entity_id": receipt_id,
        "details": {"number": receipt.get("number"), "reason": reason},
        "user_id": user_id,
        "user_name": user_name,
        "created_at": now,
    })

    return updated_rcpt


async def get_receipts(
    db,
    company_id: str,
    client_name: Optional[str] = None,
    workspace_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Dict[str, Any]:
    """Retrieve receipts with search and status filtering."""
    coll = db["receipts"]
    query: Dict[str, Any] = {"company_id": company_id}

    if status_filter and status_filter.lower() != "all":
        query["status"] = status_filter.lower()

    if workspace_id:
        query["workspace_id"] = workspace_id

    if client_name:
        query["client_name"] = {"$regex": client_name.strip(), "$options": "i"}

    if search and search.strip():
        q = search.strip()
        query["$or"] = [
            {"number": {"$regex": q, "$options": "i"}},
            {"client_name": {"$regex": q, "$options": "i"}},
            {"reference_number": {"$regex": q, "$options": "i"}},
        ]

    total = await coll.count_documents(query)
    cursor = coll.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"items": items, "total": total}
