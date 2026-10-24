"""Invoice business logic: draft, issue, void, duplicate, calculations, and public share."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from pymongo import DESCENDING

from app.core.uploads import save_upload_bytes
from app.schemas.finance import InvoiceCreate, InvoiceResponse, InvoiceUpdate
from app.services.finance_numbering import get_next_number
from app.services.finance_pdf import generate_invoice_pdf
from app.services.finance_settings import get_or_init_finance_settings

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def compute_invoice_financials(
    line_items: List[Dict[str, Any]],
    discount_type: str = "amount",
    discount_value: int = 0,
) -> Dict[str, int]:
    """Compute subtotal, discount_amount, and total strictly using integer minor units."""
    subtotal = 0
    for it in line_items:
        qty = float(it.get("quantity", 1.0))
        rate = int(it.get("rate", 0))
        amt = int(round(qty * rate))
        it["amount"] = amt
        subtotal += amt

    discount_amount = 0
    if discount_type == "percent":
        # discount_value is percentage (e.g. 5 for 5%)
        pct = max(0, min(100, discount_value))
        discount_amount = int(round(subtotal * (pct / 100.0)))
    else:
        # discount_value is minor units amount
        discount_amount = min(subtotal, max(0, discount_value))

    total = max(0, subtotal - discount_amount)
    return {
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "total": total,
    }


async def create_invoice_draft(
    db,
    company_id: str,
    payload: InvoiceCreate,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new invoice draft with temporary DRAFT number and share token."""
    coll = db["invoices"]
    now = _now_iso()
    inv_id = f"inv_{uuid.uuid4().hex[:12]}"

    line_items_data = [item.model_dump() for item in payload.line_items]
    financials = compute_invoice_financials(
        line_items_data,
        payload.discount_type,
        payload.discount_value,
    )

    doc = payload.model_dump()
    doc["id"] = inv_id
    doc["company_id"] = company_id
    doc["number"] = f"DRAFT-{uuid.uuid4().hex[:6].upper()}"
    doc["line_items"] = line_items_data
    doc["subtotal"] = financials["subtotal"]
    doc["discount_amount"] = financials["discount_amount"]
    doc["total"] = financials["total"]
    doc["amount_paid"] = 0
    doc["wht_settled"] = 0
    doc["balance_due"] = financials["total"]
    doc["status"] = "draft"
    doc["share_token"] = f"inv_tok_{uuid.uuid4().hex}"
    doc["created_by"] = user_id
    doc["created_by_name"] = user_name
    doc["created_at"] = now
    doc["updated_at"] = now

    await coll.insert_one(doc)
    return doc


async def update_invoice_draft(
    db,
    company_id: str,
    invoice_id: str,
    payload: InvoiceUpdate,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Edit an existing draft invoice. Issued or voided invoices cannot be edited."""
    coll = db["invoices"]
    existing = await coll.find_one({"company_id": company_id, "id": invoice_id})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    if existing.get("status") != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot edit invoice in '{existing.get('status')}' status. Only draft invoices can be edited.",
        )

    update_dict = {k: v for k, v in payload.model_dump().items() if v is not None}
    line_items_data = update_dict.get("line_items") or existing.get("line_items", [])
    if isinstance(line_items_data, list) and line_items_data and hasattr(line_items_data[0], "model_dump"):
        line_items_data = [it.model_dump() for it in line_items_data]

    disc_type = update_dict.get("discount_type") or existing.get("discount_type", "amount")
    disc_val = update_dict.get("discount_value") if update_dict.get("discount_value") is not None else existing.get("discount_value", 0)

    financials = compute_invoice_financials(line_items_data, disc_type, disc_val)
    update_dict["line_items"] = line_items_data
    update_dict["subtotal"] = financials["subtotal"]
    update_dict["discount_amount"] = financials["discount_amount"]
    update_dict["total"] = financials["total"]
    update_dict["balance_due"] = financials["total"] - (existing.get("amount_paid", 0) + existing.get("wht_settled", 0))
    update_dict["updated_at"] = _now_iso()

    result = await coll.find_one_and_update(
        {"company_id": company_id, "id": invoice_id},
        {"$set": update_dict},
        return_document=True,
    )
    return result


async def issue_invoice(
    db,
    company_id: str,
    invoice_id: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Issue a draft invoice, allocating official sequential number and snapshotting PDF."""
    coll = db["invoices"]
    inv = await coll.find_one({"company_id": company_id, "id": invoice_id})
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    curr_status = inv.get("status")
    if curr_status == "void":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot issue a voided invoice")

    # Already issued: return as is
    if curr_status in ("issued", "paid", "partially_paid", "overdue"):
        return inv

    # Reserve official sequential number
    settings = await get_or_init_finance_settings(db, company_id)
    prefix = settings.get("invoice_prefix", "INV-")
    issue_year = datetime.strptime(inv.get("issue_date") or _today_str(), "%Y-%m-%d").year
    official_num = await get_next_number(db, company_id, "invoice", prefix=prefix, year=issue_year)

    now = _now_iso()
    new_status = "paid" if inv.get("balance_due", 0) == 0 else "issued"

    update_fields = {
        "number": official_num,
        "status": new_status,
        "issued_at": now,
        "issued_by": user_id,
        "updated_at": now,
    }

    # Generate and store PDF snapshot
    inv_copy = dict(inv)
    inv_copy.update(update_fields)
    try:
        pdf_bytes = generate_invoice_pdf(inv_copy, settings)
        rel_key = f"finance/invoices/{company_id}/{official_num}.pdf"
        file_id = await save_upload_bytes(
            db,
            relative_key=rel_key,
            content=pdf_bytes,
            original_name=f"{official_num}.pdf",
            content_type="application/pdf",
            extra_metadata={"company_id": company_id, "invoice_id": invoice_id},
        )
        update_fields["pdf_file_id"] = file_id
    except Exception as exc:
        logger.warning(f"Could not generate/save invoice PDF snapshot: {exc}")

    updated = await coll.find_one_and_update(
        {"company_id": company_id, "id": invoice_id},
        {"$set": update_fields},
        return_document=True,
    )

    # Record audit entry
    await db["finance_audit"].insert_one({
        "id": f"aud_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "action": "invoice_issue",
        "entity_type": "invoice",
        "entity_id": invoice_id,
        "details": {"number": official_num, "total": inv.get("total")},
        "user_id": user_id,
        "user_name": user_name,
        "created_at": now,
    })

    return updated


async def void_invoice(
    db,
    company_id: str,
    invoice_id: str,
    reason: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Void an invoice. Protected: cannot void if active payments/receipts are allocated."""
    coll = db["invoices"]
    inv = await coll.find_one({"company_id": company_id, "id": invoice_id})
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    if inv.get("status") == "void":
        return inv

    # Check for active (posted) receipts allocated to this invoice
    active_receipt = await db["receipts"].find_one({
        "company_id": company_id,
        "status": "posted",
        "allocations.invoice_id": invoice_id,
    })
    if active_receipt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot void invoice {inv.get('number')} because receipt {active_receipt.get('number')} "
                "is actively allocated to it. You must void the receipt first."
            ),
        )

    now = _now_iso()
    updated = await coll.find_one_and_update(
        {"company_id": company_id, "id": invoice_id},
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

    # Record audit entry
    await db["finance_audit"].insert_one({
        "id": f"aud_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "action": "invoice_void",
        "entity_type": "invoice",
        "entity_id": invoice_id,
        "details": {"reason": reason, "number": inv.get("number")},
        "user_id": user_id,
        "user_name": user_name,
        "created_at": now,
    })

    return updated


async def duplicate_invoice(
    db,
    company_id: str,
    invoice_id: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Duplicate an existing invoice into a new draft."""
    inv = await db["invoices"].find_one({"company_id": company_id, "id": invoice_id})
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    create_data = InvoiceCreate(
        workspace_id=inv.get("workspace_id"),
        client_name=inv.get("client_name", "Client"),
        client_billing=inv.get("client_billing"),
        issue_date=_today_str(),
        due_date=_today_str(),
        terms=inv.get("terms", "Due on receipt"),
        reference=f"Copy of {inv.get('number')}",
        currency=inv.get("currency", "PKR"),
        line_items=inv.get("line_items", []),
        discount_type=inv.get("discount_type", "amount"),
        discount_value=inv.get("discount_value", 0),
        notes=inv.get("notes"),
        terms_text=inv.get("terms_text"),
        pay_to_bank=inv.get("pay_to_bank"),
    )
    return await create_invoice_draft(db, company_id, create_data, user_id, user_name)


async def get_invoices(
    db,
    company_id: str,
    status_filter: Optional[str] = None,
    workspace_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Dict[str, Any]:
    """Retrieve invoices with status tabs, search, and dynamic overdue detection."""
    coll = db["invoices"]
    query: Dict[str, Any] = {"company_id": company_id}

    today = _today_str()

    if status_filter:
        s = status_filter.lower().strip()
        if s == "overdue":
            query["status"] = {"$in": ["issued", "partially_paid", "overdue"]}
            query["due_date"] = {"$lt": today}
        elif s == "unpaid":
            query["status"] = {"$in": ["issued", "partially_paid", "overdue"]}
        elif s != "all":
            query["status"] = s

    if workspace_id:
        query["workspace_id"] = workspace_id

    if search and search.strip():
        q = search.strip()
        query["$or"] = [
            {"number": {"$regex": q, "$options": "i"}},
            {"client_name": {"$regex": q, "$options": "i"}},
            {"reference": {"$regex": q, "$options": "i"}},
        ]

    if date_from or date_to:
        d_clause: Dict[str, Any] = {}
        if date_from:
            d_clause["$gte"] = date_from
        if date_to:
            d_clause["$lte"] = date_to
        query["issue_date"] = d_clause

    total = await coll.count_documents(query)
    cursor = coll.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)

    # Dynamic overdue tag computation
    for it in items:
        if it.get("status") in ("issued", "partially_paid") and it.get("due_date", "") < today:
            it["is_overdue"] = True
            it["effective_status"] = "overdue"
        else:
            it["is_overdue"] = False
            it["effective_status"] = it.get("status")

    return {"items": items, "total": total}


async def get_invoice_by_share_token(db, share_token: str) -> Optional[Dict[str, Any]]:
    """Public lookup of an invoice via secret share token."""
    if not share_token or not share_token.strip():
        return None
    return await db["invoices"].find_one({"share_token": share_token.strip()})
