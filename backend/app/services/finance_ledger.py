"""Append-only financial ledger service for Cash, ABL, and Meezan accounts."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from pymongo import DESCENDING

from app.schemas.finance import (
    FinanceAccountResponse,
    FinanceAdjustmentCreate,
    FinanceOpeningBalanceCreate,
    FinanceTransferCreate,
    FinanceTransferResponse,
)
from app.services.finance_settings import seed_default_accounts

logger = logging.getLogger(__name__)


async def record_ledger_entry(
    db,
    company_id: str,
    account_code: str,
    direction: str,  # "in" or "out"
    amount: int,  # integer minor units in PKR paisa
    source_type: str,  # "receipt", "transfer", "opening_balance", "adjustment", "reversal"
    source_id: Optional[str] = None,
    memo: Optional[str] = None,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    entry_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Append a single movement record to the company's ledger."""
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ledger entry amount must be greater than zero",
        )
    if direction not in ("in", "out"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ledger direction must be 'in' or 'out'",
        )

    account_code = account_code.lower().strip()
    if account_code not in ("cash", "abl", "meezan"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown account code '{account_code}'. Must be 'cash', 'abl', or 'meezan'",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": f"led_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "account_code": account_code,
        "date": entry_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "direction": direction,
        "amount": amount,
        "source_type": source_type,
        "source_id": source_id,
        "memo": memo or "",
        "created_by": user_id,
        "created_by_name": user_name,
        "created_at": now_iso,
    }
    await db["finance_ledger"].insert_one(doc)
    return doc


async def get_account_balance(db, company_id: str, account_code: str, as_of_date: Optional[str] = None) -> int:
    """Calculate the balance of an account dynamically by aggregating append-only ledger entries."""
    account_code = account_code.lower().strip()
    match_query: Dict[str, Any] = {
        "company_id": company_id,
        "account_code": account_code,
    }
    if as_of_date:
        match_query["date"] = {"$lte": as_of_date}

    pipeline = [
        {"$match": match_query},
        {
            "$group": {
                "_id": "$account_code",
                "total_in": {
                    "$sum": {"$cond": [{"$eq": ["$direction", "in"]}, "$amount", 0]}
                },
                "total_out": {
                    "$sum": {"$cond": [{"$eq": ["$direction", "out"]}, "$amount", 0]}
                },
            }
        },
    ]

    cursor = db["finance_ledger"].aggregate(pipeline)
    results = await cursor.to_list(length=1)
    if not results:
        return 0
    agg = results[0]
    return int(agg.get("total_in", 0) - agg.get("total_out", 0))


async def get_all_account_balances(db, company_id: str, as_of_date: Optional[str] = None) -> Dict[str, int]:
    """Calculate dynamic balances for all three accounts."""
    match_query: Dict[str, Any] = {"company_id": company_id}
    if as_of_date:
        match_query["date"] = {"$lte": as_of_date}

    pipeline = [
        {"$match": match_query},
        {
            "$group": {
                "_id": "$account_code",
                "total_in": {
                    "$sum": {"$cond": [{"$eq": ["$direction", "in"]}, "$amount", 0]}
                },
                "total_out": {
                    "$sum": {"$cond": [{"$eq": ["$direction", "out"]}, "$amount", 0]}
                },
            }
        },
    ]

    cursor = db["finance_ledger"].aggregate(pipeline)
    rows = await cursor.to_list(length=10)
    balances = {"cash": 0, "abl": 0, "meezan": 0}
    for r in rows:
        code = str(r["_id"]).lower()
        if code in balances:
            balances[code] = int(r.get("total_in", 0) - r.get("total_out", 0))
    return balances


async def get_accounts_view(db, company_id: str) -> List[FinanceAccountResponse]:
    """Return all accounts with dynamic live balances."""
    await seed_default_accounts(db, company_id)
    coll = db["finance_accounts"]
    cursor = coll.find({"company_id": company_id})
    acc_docs = await cursor.to_list(length=20)
    balances = await get_all_account_balances(db, company_id)

    response: List[FinanceAccountResponse] = []
    for doc in acc_docs:
        code = doc.get("code", "").lower()
        bal = balances.get(code, 0)
        response.append(
            FinanceAccountResponse(
                id=doc["id"],
                company_id=company_id,
                code=code,
                name=doc.get("name", code.upper()),
                bank_name=doc.get("bank_name"),
                account_number=doc.get("account_number"),
                iban=doc.get("iban"),
                currency=doc.get("currency", "PKR"),
                balance=bal,
            )
        )
    return response


async def transfer_cash_to_bank(
    db,
    company_id: str,
    payload: FinanceTransferCreate,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> FinanceTransferResponse:
    """Transfer funds from Cash in Hand clearing account to ABL or Meezan."""
    cash_balance = await get_account_balance(db, company_id, "cash")
    if payload.amount > cash_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Transfer amount ({payload.amount / 100:.2f} PKR) exceeds current "
                f"Cash in Hand balance ({cash_balance / 100:.2f} PKR)."
            ),
        )

    to_account = payload.to_account.lower()
    if to_account not in ("abl", "meezan"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transfer destination must be 'abl' or 'meezan'",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    transfer_id = f"trf_{uuid.uuid4().hex[:12]}"
    transfer_doc = {
        "id": transfer_id,
        "company_id": company_id,
        "from_account": "cash",
        "to_account": to_account,
        "amount": payload.amount,
        "date": payload.date,
        "deposit_slip_reference": payload.deposit_slip_reference or "",
        "slip_file_id": payload.slip_file_id,
        "notes": payload.notes or "",
        "created_by": user_id,
        "created_by_name": user_name,
        "created_at": now_iso,
    }
    await db["finance_transfers"].insert_one(transfer_doc)

    # 1. Debit Cash (out)
    await record_ledger_entry(
        db,
        company_id=company_id,
        account_code="cash",
        direction="out",
        amount=payload.amount,
        source_type="transfer",
        source_id=transfer_id,
        memo=f"Bank deposit to {to_account.upper()}" + (f" (Ref: {payload.deposit_slip_reference})" if payload.deposit_slip_reference else ""),
        user_id=user_id,
        user_name=user_name,
        entry_date=payload.date,
    )

    # 2. Credit Bank (in)
    await record_ledger_entry(
        db,
        company_id=company_id,
        account_code=to_account,
        direction="in",
        amount=payload.amount,
        source_type="transfer",
        source_id=transfer_id,
        memo="Cash deposit from Cash in Hand" + (f" (Ref: {payload.deposit_slip_reference})" if payload.deposit_slip_reference else ""),
        user_id=user_id,
        user_name=user_name,
        entry_date=payload.date,
    )

    return FinanceTransferResponse(**transfer_doc)


async def set_opening_balance(
    db,
    company_id: str,
    payload: FinanceOpeningBalanceCreate,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Set an opening balance by writing an opening_balance ledger entry."""
    existing = await db["finance_ledger"].find_one(
        {
            "company_id": company_id,
            "account_code": payload.account_code.lower().strip(),
            "source_type": "opening_balance",
        }
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Opening balance for {payload.account_code} is already set. Use an adjustment instead.",
        )
    entry = await record_ledger_entry(
        db,
        company_id=company_id,
        account_code=payload.account_code,
        direction="in",
        amount=payload.amount,
        source_type="opening_balance",
        memo=payload.memo or "Opening balance",
        user_id=user_id,
        user_name=user_name,
        entry_date=payload.date,
    )
    return entry


async def make_adjustment(
    db,
    company_id: str,
    payload: FinanceAdjustmentCreate,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Make an accounting adjustment by writing an adjustment ledger entry."""
    entry = await record_ledger_entry(
        db,
        company_id=company_id,
        account_code=payload.account_code,
        direction=payload.direction,
        amount=payload.amount,
        source_type="adjustment",
        memo=f"{payload.memo} (Reason: {payload.reason})",
        user_id=user_id,
        user_name=user_name,
        entry_date=payload.date,
    )
    return entry


async def reverse_ledger_entries(
    db,
    company_id: str,
    source_type: str,
    source_id: str,
    reason: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> int:
    """Reverse all ledger entries associated with a source document (e.g. voided receipt).
    
    Appends compensating entries to the ledger so the audit trail is never deleted.
    """
    coll = db["finance_ledger"]
    cursor = coll.find({
        "company_id": company_id,
        "source_type": source_type,
        "source_id": source_id,
    })
    entries = await cursor.to_list(length=100)
    reversed_count = 0
    now_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for e in entries:
        rev_direction = "out" if e["direction"] == "in" else "in"
        rev_memo = f"Reversal: {e.get('memo', '')} (Reason: {reason})"
        await record_ledger_entry(
            db,
            company_id=company_id,
            account_code=e["account_code"],
            direction=rev_direction,
            amount=e["amount"],
            source_type="reversal",
            source_id=f"rev_{e['id']}",
            memo=rev_memo,
            user_id=user_id,
            user_name=user_name,
            entry_date=now_date,
        )
        reversed_count += 1

    return reversed_count


async def get_ledger_entries(
    db,
    company_id: str,
    account_code: Optional[str] = None,
    source_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Dict[str, Any]:
    """Retrieve ledger entries with filtering and pagination."""
    query: Dict[str, Any] = {"company_id": company_id}
    if account_code:
        query["account_code"] = account_code.lower().strip()
    if source_type:
        query["source_type"] = source_type.strip()
    if date_from or date_to:
        d_clause: Dict[str, Any] = {}
        if date_from:
            d_clause["$gte"] = date_from
        if date_to:
            d_clause["$lte"] = date_to
        query["date"] = d_clause

    coll = db["finance_ledger"]
    total = await coll.count_documents(query)
    cursor = coll.find(query).sort([("date", DESCENDING), ("created_at", DESCENDING)]).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)

    transfer_ids = list({
        it.get("source_id")
        for it in items
        if it.get("source_type") == "transfer" and it.get("source_id")
    })
    if transfer_ids:
        transfers = await db["finance_transfers"].find(
            {"company_id": company_id, "id": {"$in": transfer_ids}},
            {"id": 1, "slip_file_id": 1},
        ).to_list(length=len(transfer_ids))
        slip_by_transfer = {
            t["id"]: t.get("slip_file_id")
            for t in transfers
            if t.get("slip_file_id")
        }
        for it in items:
            if it.get("source_type") == "transfer":
                it["slip_file_id"] = slip_by_transfer.get(it.get("source_id"))

    return {"items": items, "total": total}
