"""FastAPI router for Reamarc Finance Module.

Handles Invoices, Receipts, Receivables reports, Accounts, Transfers,
Settings, Service catalog, Public share links, and Uploads.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import Response

from app.core.security import get_current_user
from app.core.tenant import get_tenant_context, tenant_scope
from app.core.uploads import save_upload_bytes
from app.database import get_database
from app.schemas.finance import (
    FinanceAdjustmentCreate,
    FinanceOpeningBalanceCreate,
    FinanceServiceCreate,
    FinanceServiceUpdate,
    FinanceSettingsUpdate,
    FinanceTransferCreate,
    InvoiceCreate,
    InvoiceUpdate,
    InvoiceVoidRequest,
    ReceiptCreate,
    ReceiptVoidRequest,
    RecurringInvoiceCreate,
    RecurringInvoiceUpdate,
)
from app.services.finance_invoices import (
    create_invoice_draft,
    duplicate_invoice,
    get_invoice_by_share_token,
    get_invoices,
    issue_invoice,
    update_invoice_draft,
    void_invoice,
)
from app.services.finance_ledger import (
    get_accounts_view,
    get_ledger_entries,
    make_adjustment,
    set_opening_balance,
    transfer_cash_to_bank,
)
from app.services.finance_pdf import generate_invoice_pdf, generate_receipt_pdf
from app.services.finance_receipts import get_receipts, post_receipt, void_receipt
from app.services.finance_reports import (
    export_ageing_summary_excel,
    export_ageing_summary_pdf,
    get_ageing_detail_report,
    get_ageing_summary_report,
    get_client_statement_report,
    get_collections_report,
    get_wht_report,
)
from app.services.finance_settings import (
    create_service,
    get_or_init_finance_settings,
    get_services,
    update_finance_settings,
    update_service,
)
from app.services.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance", tags=["Finance"])


def _extract_company_id(user: Dict[str, Any]) -> str:
    ctx = get_tenant_context()
    if ctx and ctx.company_id:
        return ctx.company_id
    return user.get("company_id") or "company_reamarc"


# =========================================================================
# 1. SETTINGS & SERVICE CATALOG
# =========================================================================

@router.get("/settings")
async def get_settings_endpoint(
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    settings = await get_or_init_finance_settings(db, cid)
    settings.pop("_id", None)
    return settings


@router.put("/settings")
async def update_settings_endpoint(
    payload: FinanceSettingsUpdate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    updated = await update_finance_settings(db, cid, payload)
    updated.pop("_id", None)
    return updated


@router.get("/services")
async def list_services_endpoint(
    active_only: bool = Query(True),
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    services = await get_services(db, cid, active_only=active_only)
    for s in services:
        s.pop("_id", None)
    return services


@router.post("/services")
async def create_service_endpoint(
    payload: FinanceServiceCreate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    created = await create_service(db, cid, payload)
    created.pop("_id", None)
    return created


@router.patch("/services/{service_id}")
async def update_service_endpoint(
    service_id: str,
    payload: FinanceServiceUpdate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    updated = await update_service(db, cid, service_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Service catalog item not found")
    updated.pop("_id", None)
    return updated


# =========================================================================
# 2. INVOICES
# =========================================================================

@router.get("/invoices")
async def list_invoices_endpoint(
    status: Optional[str] = Query(None, description="all, draft, unpaid, partially_paid, paid, overdue, void"),
    workspace_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    result = await get_invoices(
        db,
        company_id=cid,
        status_filter=status,
        workspace_id=workspace_id,
        search=search,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    for it in result["items"]:
        it.pop("_id", None)
    return result


@router.post("/invoices")
async def create_invoice_endpoint(
    payload: InvoiceCreate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "create")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    draft = await create_invoice_draft(db, cid, payload, user_id=uid, user_name=uname)
    draft.pop("_id", None)
    return draft


@router.get("/invoices/{invoice_id}")
async def get_invoice_detail_endpoint(
    invoice_id: str,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    inv = await db["invoices"].find_one({"company_id": cid, "id": invoice_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv.pop("_id", None)

    # Attach receipts timeline
    rcpts_cursor = db["receipts"].find({"company_id": cid, "allocations.invoice_id": invoice_id})
    rcpts = await rcpts_cursor.to_list(length=100)
    for r in rcpts:
        r.pop("_id", None)
    inv["receipts"] = rcpts

    return inv


@router.put("/invoices/{invoice_id}")
async def update_invoice_endpoint(
    invoice_id: str,
    payload: InvoiceUpdate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "create")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    updated = await update_invoice_draft(db, cid, invoice_id, payload, user_id=uid)
    updated.pop("_id", None)
    return updated


@router.post("/invoices/{invoice_id}/issue")
async def issue_invoice_endpoint(
    invoice_id: str,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "create")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    issued = await issue_invoice(db, cid, invoice_id, user_id=uid, user_name=uname)
    issued.pop("_id", None)
    return issued


@router.post("/invoices/{invoice_id}/void")
async def void_invoice_endpoint(
    invoice_id: str,
    payload: InvoiceVoidRequest,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    voided = await void_invoice(db, cid, invoice_id, reason=payload.reason, user_id=uid, user_name=uname)
    voided.pop("_id", None)
    return voided


@router.post("/invoices/{invoice_id}/duplicate")
async def duplicate_invoice_endpoint(
    invoice_id: str,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "create")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    dup = await duplicate_invoice(db, cid, invoice_id, user_id=uid, user_name=uname)
    dup.pop("_id", None)
    return dup


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf_endpoint(
    invoice_id: str,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    inv = await db["invoices"].find_one({"company_id": cid, "id": invoice_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    settings = await get_or_init_finance_settings(db, cid)
    pdf_bytes = generate_invoice_pdf(inv, settings)
    filename = f"{inv.get('number', 'invoice')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# =========================================================================
# 3. RECEIPTS
# =========================================================================

@router.get("/receipts")
async def list_receipts_endpoint(
    status: Optional[str] = Query(None),
    workspace_id: Optional[str] = Query(None),
    client_name: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    res = await get_receipts(
        db,
        company_id=cid,
        client_name=client_name,
        workspace_id=workspace_id,
        status_filter=status,
        search=search,
        skip=skip,
        limit=limit,
    )
    for it in res["items"]:
        it.pop("_id", None)
    return res


@router.post("/receipts")
async def post_receipt_endpoint(
    payload: ReceiptCreate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "create")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    rcpt = await post_receipt(db, cid, payload, user_id=uid, user_name=uname)
    rcpt.pop("_id", None)
    return rcpt


@router.get("/receipts/{receipt_id}")
async def get_receipt_detail_endpoint(
    receipt_id: str,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    rcpt = await db["receipts"].find_one({"company_id": cid, "id": receipt_id})
    if not rcpt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    rcpt.pop("_id", None)
    return rcpt


@router.post("/receipts/{receipt_id}/void")
async def void_receipt_endpoint(
    receipt_id: str,
    payload: ReceiptVoidRequest,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    voided = await void_receipt(db, cid, receipt_id, reason=payload.reason, user_id=uid, user_name=uname)
    voided.pop("_id", None)
    return voided


@router.get("/receipts/{receipt_id}/pdf")
async def download_receipt_pdf_endpoint(
    receipt_id: str,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    rcpt = await db["receipts"].find_one({"company_id": cid, "id": receipt_id})
    if not rcpt:
        raise HTTPException(status_code=404, detail="Receipt not found")

    settings = await get_or_init_finance_settings(db, cid)
    pdf_bytes = generate_receipt_pdf(rcpt, settings)
    filename = f"{rcpt.get('number', 'receipt')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# =========================================================================
# 4. ACCOUNTS & TRANSFERS
# =========================================================================

@router.get("/accounts")
async def get_accounts_endpoint(
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    accounts = await get_accounts_view(db, cid)
    return accounts


@router.get("/ledger")
async def get_ledger_endpoint(
    account: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    res = await get_ledger_entries(
        db,
        company_id=cid,
        account_code=account,
        source_type=source_type,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    for it in res["items"]:
        it.pop("_id", None)
    return res


@router.post("/transfers")
async def create_transfer_endpoint(
    payload: FinanceTransferCreate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    res = await transfer_cash_to_bank(db, cid, payload, user_id=uid, user_name=uname)
    return res


@router.post("/accounts/opening-balance")
async def set_opening_balance_endpoint(
    payload: FinanceOpeningBalanceCreate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    res = await set_opening_balance(db, cid, payload, user_id=uid, user_name=uname)
    res.pop("_id", None)
    return res


@router.post("/accounts/adjustment")
async def make_adjustment_endpoint(
    payload: FinanceAdjustmentCreate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    res = await make_adjustment(db, cid, payload, user_id=uid, user_name=uname)
    res.pop("_id", None)
    return res


# =========================================================================
# 5. RECEIVABLES REPORTS
# =========================================================================

@router.get("/reports/{report_type}")
async def get_report_endpoint(
    report_type: str,
    as_of: Optional[str] = Query(None),
    client_name: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    method: Optional[str] = Query(None),
    bank: Optional[str] = Query(None),
    format: Optional[str] = Query(None, description="json, pdf, or xlsx"),
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    fmt = (format or "json").lower()

    if report_type == "ageing-summary":
        data = await get_ageing_summary_report(db, cid, as_of_date=as_of, client_name=client_name, currency=currency)
        if fmt == "xlsx":
            excel_bytes = export_ageing_summary_excel(data)
            return Response(
                content=excel_bytes,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="ageing_summary_{data["as_of_date"]}.xlsx"'},
            )
        elif fmt == "pdf":
            settings = await get_or_init_finance_settings(db, cid)
            pdf_bytes = export_ageing_summary_pdf(data, settings)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f'inline; filename="ageing_summary_{data["as_of_date"]}.pdf"'},
            )
        return data

    elif report_type == "ageing-detail":
        data = await get_ageing_detail_report(db, cid, as_of_date=as_of, client_name=client_name, currency=currency)
        return data

    elif report_type == "statement":
        if not client_name:
            raise HTTPException(status_code=400, detail="client_name is required for client statement")
        data = await get_client_statement_report(
            db, cid, client_name=client_name, date_from=date_from, date_to=date_to, currency=currency
        )
        return data

    elif report_type == "collections":
        data = await get_collections_report(
            db, cid, date_from=date_from, date_to=date_to, method=method, bank=bank
        )
        return data

    elif report_type == "wht":
        data = await get_wht_report(db, cid, date_from=date_from, date_to=date_to, client_name=client_name)
        return data

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown report type '{report_type}'. Available: ageing-summary, ageing-detail, statement, collections, wht",
        )


# =========================================================================
# 6. PUBLIC SHARE LINKS (UNAUTHENTICATED)
# =========================================================================

@router.get("/public/invoice/{share_token}")
async def get_public_invoice_endpoint(share_token: str):
    db = get_database()
    inv = await get_invoice_by_share_token(db, share_token)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice link not found or expired")

    cid = inv.get("company_id") or "company_reamarc"
    settings = await get_or_init_finance_settings(db, cid)

    # Return safe public view
    return {
        "invoice": {
            "number": inv.get("number"),
            "client_name": inv.get("client_name"),
            "client_billing": inv.get("client_billing"),
            "issue_date": inv.get("issue_date"),
            "due_date": inv.get("due_date"),
            "terms": inv.get("terms"),
            "reference": inv.get("reference"),
            "currency": inv.get("currency"),
            "line_items": inv.get("line_items"),
            "subtotal": inv.get("subtotal"),
            "discount_amount": inv.get("discount_amount"),
            "total": inv.get("total"),
            "amount_paid": inv.get("amount_paid"),
            "wht_settled": inv.get("wht_settled"),
            "balance_due": inv.get("balance_due"),
            "status": inv.get("status"),
            "notes": inv.get("notes"),
            "terms_text": inv.get("terms_text"),
            "pay_to_bank": inv.get("pay_to_bank"),
        },
        "company": {
            "name": settings.get("company_name"),
            "address": settings.get("company_address"),
            "phone": settings.get("company_phone"),
            "email": settings.get("company_email"),
            "website": settings.get("company_website"),
            "tax_id": settings.get("tax_id"),
        },
    }


@router.get("/public/invoice/{share_token}/pdf")
async def get_public_invoice_pdf_endpoint(share_token: str):
    db = get_database()
    inv = await get_invoice_by_share_token(db, share_token)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice link not found or expired")

    cid = inv.get("company_id") or "company_reamarc"
    settings = await get_or_init_finance_settings(db, cid)
    pdf_bytes = generate_invoice_pdf(inv, settings)
    filename = f"{inv.get('number', 'invoice')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# =========================================================================
# 7. FILE UPLOADS (PROOFS & CERTIFICATES)
# =========================================================================

@router.post("/upload")
async def upload_proof_file_endpoint(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_permission("finance", "create")),
):
    """Secure upload for payment slips, deposit slips, and WHT certificates."""
    db = get_database()
    cid = _extract_company_id(current_user)

    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("pdf", "png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Allowed file types: PDF, PNG, JPG, JPEG, WEBP")

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 15MB limit")

    rel_key = f"finance/proofs/{cid}/{uuid.uuid4().hex[:12]}_{filename}"
    file_id = await save_upload_bytes(
        db,
        relative_key=rel_key,
        content=content,
        original_name=filename,
        content_type=file.content_type,
        extra_metadata={"company_id": cid, "uploaded_by": current_user.get("id")},
    )

    return {
        "file_id": file_id,
        "url": f"/api/v1/uploads/{file_id}",
        "filename": filename,
    }


# =========================================================================
# 8. RECURRING INVOICES
# =========================================================================

@router.get("/recurring")
async def list_recurring_invoices_endpoint(
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    cursor = db["recurring_invoices"].find({"company_id": cid})
    items = await cursor.to_list(length=100)
    for it in items:
        it.pop("_id", None)
    return items


@router.post("/recurring")
async def create_recurring_invoice_endpoint(
    payload: RecurringInvoiceCreate,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc["id"] = f"rec_{uuid.uuid4().hex[:12]}"
    doc["company_id"] = cid
    doc["created_at"] = now
    doc["updated_at"] = now
    await db["recurring_invoices"].insert_one(doc)
    doc.pop("_id", None)
    return doc
