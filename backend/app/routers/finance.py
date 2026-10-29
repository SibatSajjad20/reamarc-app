"""FastAPI router for Reamarc Finance Module.

Handles Invoices, Receipts, Receivables reports, Accounts, Transfers,
Settings, Service catalog, Public share links, and Uploads.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response

from app.core.limiter import get_client_ip, limiter
from app.core.rate_limit_store import enforce_shared_rate_limit
from app.core.tenant import get_tenant_context, tenant_scope
from app.core.uploads import save_upload_bytes
from app.config import settings as app_settings
from app.database import get_database
from app.schemas.finance import (
    FinanceAdjustmentCreate,
    FinanceOpeningBalanceCreate,
    FinanceServiceCreate,
    FinanceServiceUpdate,
    FinanceSettingsUpdate,
    FinanceTransferCreate,
    InvoiceCreate,
    InvoiceDeleteRequest,
    InvoiceUpdate,
    InvoiceVoidRequest,
    ReceiptCreate,
    ReceiptDeleteRequest,
    ReceiptVoidRequest,
    RecurringInvoiceCreate,
    RecurringInvoiceUpdate,
)
from app.services.finance_invoices import (
    create_invoice_draft,
    delete_invoice,
    duplicate_invoice,
    get_invoice_by_share_token,
    get_invoices,
    issue_invoice,
    regenerate_share_token,
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
from app.services.finance_receipts import confirm_receipt, delete_receipt, get_receipts, post_receipt, void_receipt
from app.services.finance_reports import (
    export_ageing_summary_excel,
    export_ageing_summary_pdf,
    export_collections_pdf,
    export_monthly_analysis_pdf,
    export_receivables_outstanding_pdf,
    export_summary_accounts_pdf,
    get_ageing_detail_report,
    get_ageing_summary_report,
    get_client_statement_report,
    get_collections_report,
    get_monthly_collections_analysis,
    is_period_key,
    normalize_period,
    get_receivables_outstanding_report,
    get_summary_accounts_report,
    get_wht_report,
)
from app.services.finance_settings import (
    create_service,
    get_or_init_finance_settings,
    get_services,
    update_finance_settings,
    update_service,
)
from app.services.access import normalize_role
from app.services.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance", tags=["Finance"])


def _extract_company_id(user: Dict[str, Any]) -> str:
    ctx = get_tenant_context()
    if ctx and ctx.company_id:
        return ctx.company_id
    return user.get("company_id") or "company_reamarc"


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ALLOWED_REPORT_TYPES = {
    "ageing-summary",
    "ageing-detail",
    "statement",
    "collections",
    "monthly-analysis",
    "receivables",
    "summary-accounts",
    "wht",
}
_ALLOWED_REPORT_FORMATS = {"json", "pdf", "xlsx"}
_PDF_REPORT_TYPES = {"ageing-summary", "collections", "monthly-analysis", "receivables", "summary-accounts"}
_XLSX_REPORT_TYPES = {"ageing-summary"}


def _parse_report_date(value: Optional[str], field: str) -> Optional[datetime]:
    if not value:
        return None
    raw = value.strip()
    if not _DATE_RE.match(raw):
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD")
    try:
        return datetime.strptime(raw, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} must be a valid date")


def _validate_report_query(
    report_type: str,
    fmt: str,
    date_from: Optional[str],
    date_to: Optional[str],
    as_of: Optional[str],
    client_name: Optional[str],
    currency: Optional[str],
    method: Optional[str],
    bank: Optional[str],
) -> None:
    if report_type not in _ALLOWED_REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown report type")
    if fmt not in _ALLOWED_REPORT_FORMATS:
        raise HTTPException(status_code=400, detail="format must be json, pdf, or xlsx")
    if fmt == "pdf" and report_type not in _PDF_REPORT_TYPES:
        raise HTTPException(status_code=400, detail="PDF export is not available for this report")
    if fmt == "xlsx" and report_type not in _XLSX_REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Excel export is not available for this report")
    start = _parse_report_date(date_from, "date_from")
    end = _parse_report_date(date_to, "date_to")
    _parse_report_date(as_of, "as_of")
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="date_from cannot be after date_to")
    if start and end and (end - start).days > 1826:
        raise HTTPException(status_code=400, detail="Report range cannot exceed 5 years")
    if client_name and len(client_name.strip()) > 200:
        raise HTTPException(status_code=400, detail="client_name is too long")
    if currency and currency.upper() not in ("PKR", "USD", "GBP", "ALL"):
        raise HTTPException(status_code=400, detail="Invalid currency")
    if method and method.lower() not in ("all", "cash", "bank", "cheque"):
        raise HTTPException(status_code=400, detail="Invalid method")
    if bank and bank.lower() not in ("all", "abl", "meezan"):
        raise HTTPException(status_code=400, detail="Invalid bank")


def _safe_download_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", (name or "report").strip())[:80] or "report"
    if "." not in cleaned:
        cleaned += ".bin"
    return cleaned


def _file_download_headers(filename: str, inline: bool = False) -> Dict[str, str]:
    disposition = "inline" if inline else "attachment"
    return {
        "Content-Disposition": f'{disposition}; filename="{_safe_download_filename(filename)}"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
    }


async def _enforce_report_export_limits(request: Request, user: Dict[str, Any], company_id: str) -> None:
    uid = str(user.get("id") or user.get("_id") or "anon")
    ip = get_client_ip(request)
    await enforce_shared_rate_limit(f"finance-report-user:{uid}", 8, 60)
    await enforce_shared_rate_limit(f"finance-report-company:{company_id}", 20, 60)
    await enforce_shared_rate_limit(f"finance-report-ip:{ip}", 10, 60)


async def _audit_report_export(
    db,
    company_id: str,
    user: Dict[str, Any],
    report_type: str,
    fmt: str,
    date_from: Optional[str],
    date_to: Optional[str],
    as_of: Optional[str],
) -> None:
    try:
        await db["finance_audit"].insert_one({
            "id": f"aud_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "action": "report_export",
            "entity_type": "report",
            "entity_id": report_type,
            "details": {
                "format": fmt,
                "date_from": date_from,
                "date_to": date_to,
                "as_of": as_of,
            },
            "user_id": user.get("id") or user.get("_id"),
            "user_name": user.get("full_name") or user.get("name"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        logger.exception("Failed to write finance report export audit")


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
    updated = await update_finance_settings(
        db,
        cid,
        payload,
        user_id=current_user.get("id"),
        user_name=current_user.get("full_name") or current_user.get("name"),
    )
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
    status: Optional[str] = Query(None, description="all, draft, unpaid, partially_paid, paid, overdue, void, deleted, with_deleted"),
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


@router.post("/invoices/{invoice_id}/delete")
async def delete_invoice_endpoint(
    invoice_id: str,
    payload: InvoiceDeleteRequest,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    deleted = await delete_invoice(db, cid, invoice_id, reason=payload.reason, user_id=uid, user_name=uname)
    deleted.pop("_id", None)
    return deleted


@router.post("/invoices/{invoice_id}/share-link/regenerate")
async def regenerate_invoice_share_link_endpoint(
    invoice_id: str,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    """Issue a new public link for the invoice; the previous link stops working."""
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    updated = await regenerate_share_token(db, cid, invoice_id, user_id=uid, user_name=uname)
    updated.pop("_id", None)
    from app.core.origins import public_invoice_url
    token = updated.get("share_token") or ""
    return {
        "id": updated.get("id"),
        "share_token": token,
        "share_url": public_invoice_url(app_settings, token),
    }


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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
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
        date_from=date_from,
        date_to=date_to,
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


@router.post("/receipts/{receipt_id}/delete")
async def delete_receipt_endpoint(
    receipt_id: str,
    payload: ReceiptDeleteRequest,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    deleted = await delete_receipt(db, cid, receipt_id, reason=payload.reason, user_id=uid, user_name=uname)
    deleted.pop("_id", None)
    return deleted


@router.post("/receipts/{receipt_id}/confirm")
async def confirm_receipt_endpoint(
    receipt_id: str,
    current_user: Dict[str, Any] = Depends(require_permission("finance", "manage")),
):
    db = get_database()
    cid = _extract_company_id(current_user)
    uid = current_user.get("id") or current_user.get("_id")
    uname = current_user.get("full_name") or current_user.get("name")
    posted = await confirm_receipt(db, cid, receipt_id, user_id=uid, user_name=uname)
    posted.pop("_id", None)
    return posted


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
@limiter.limit("30/minute")
async def get_report_endpoint(
    request: Request,
    report_type: str,
    as_of: Optional[str] = Query(None, max_length=32),
    client_name: Optional[str] = Query(None, max_length=200),
    currency: Optional[str] = Query(None, max_length=8),
    date_from: Optional[str] = Query(None, max_length=32),
    date_to: Optional[str] = Query(None, max_length=32),
    method: Optional[str] = Query(None, max_length=16),
    bank: Optional[str] = Query(None, max_length=16),
    focus_month: Optional[str] = Query(None, max_length=7),
    period: Optional[str] = Query(None, max_length=16, description="monthly, quarterly, semiannual or yearly"),
    format: Optional[str] = Query(None, max_length=8, description="json, pdf, or xlsx"),
    current_user: Dict[str, Any] = Depends(require_permission("finance", "view")),
):
    if normalize_role(current_user.get("role")) not in ("admin", "operations"):
        raise HTTPException(status_code=403, detail="Accounts reports are limited to admin and operations")

    db = get_database()
    cid = _extract_company_id(current_user)
    fmt = (format or "json").lower().strip()
    _validate_report_query(report_type, fmt, date_from, date_to, as_of, client_name, currency, method, bank)
    if fmt in ("pdf", "xlsx"):
        await _enforce_report_export_limits(request, current_user, cid)

    if report_type == "ageing-summary":
        data = await get_ageing_summary_report(db, cid, as_of_date=as_of, client_name=client_name, currency=currency)
        if fmt == "xlsx":
            excel_bytes = export_ageing_summary_excel(data)
            await _audit_report_export(db, cid, current_user, report_type, fmt, date_from, date_to, as_of)
            return Response(
                content=excel_bytes,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers=_file_download_headers(f"ageing_summary_{data['as_of_date']}.xlsx"),
            )
        elif fmt == "pdf":
            settings = await get_or_init_finance_settings(db, cid)
            pdf_bytes = export_ageing_summary_pdf(data, settings)
            await _audit_report_export(db, cid, current_user, report_type, fmt, date_from, date_to, as_of)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers=_file_download_headers(f"ageing_summary_{data['as_of_date']}.pdf"),
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

    elif report_type == "monthly-analysis":
        try:
            period_norm = normalize_period(period)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if focus_month and not is_period_key(focus_month):
            raise HTTPException(status_code=400, detail="focus_month must be YYYY-MM, YYYY-Qn, YYYY-Hn or YYYY")
        data = await get_monthly_collections_analysis(
            db,
            cid,
            date_from=date_from,
            date_to=date_to,
            client_name=client_name,
            method=method,
            bank=bank,
            focus_month=focus_month.strip() if focus_month else None,
            period=period_norm,
        )
        if fmt == "pdf":
            settings = await get_or_init_finance_settings(db, cid)
            pdf_bytes = export_monthly_analysis_pdf(data, settings)
            await _audit_report_export(db, cid, current_user, report_type, fmt, date_from, date_to, as_of)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers=_file_download_headers(
                    f"collections_{period_norm}_{data['date_from']}_{data['date_to']}.pdf"
                ),
            )
        return data

    elif report_type == "collections":
        data = await get_collections_report(
            db, cid, date_from=date_from, date_to=date_to, method=method, bank=bank, client_name=client_name
        )
        for it in data.get("receipts") or []:
            if isinstance(it, dict):
                it.pop("_id", None)
        if fmt == "pdf":
            settings = await get_or_init_finance_settings(db, cid)
            pdf_bytes = export_collections_pdf(data, settings)
            await _audit_report_export(db, cid, current_user, report_type, fmt, date_from, date_to, as_of)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers=_file_download_headers(f"collections_{data['date_from']}_{data['date_to']}.pdf"),
            )
        return data

    elif report_type == "receivables":
        data = await get_receivables_outstanding_report(
            db, cid, date_from=date_from, date_to=date_to, client_name=client_name
        )
        if fmt == "pdf":
            settings = await get_or_init_finance_settings(db, cid)
            pdf_bytes = export_receivables_outstanding_pdf(data, settings)
            await _audit_report_export(db, cid, current_user, report_type, fmt, date_from, date_to, as_of)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers=_file_download_headers(f"receivables_{data['date_from']}_{data['date_to']}.pdf"),
            )
        return data

    elif report_type == "summary-accounts":
        data = await get_summary_accounts_report(
            db, cid, date_from=date_from, date_to=date_to, client_name=client_name
        )
        if fmt == "pdf":
            settings = await get_or_init_finance_settings(db, cid)
            pdf_bytes = export_summary_accounts_pdf(data, settings)
            await _audit_report_export(db, cid, current_user, report_type, fmt, date_from, date_to, as_of)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers=_file_download_headers(f"summary_accounts_{data['date_from']}_{data['date_to']}.pdf"),
            )
        return data

    elif report_type == "wht":
        data = await get_wht_report(db, cid, date_from=date_from, date_to=date_to, client_name=client_name)
        return data

    else:
        raise HTTPException(
            status_code=400,
            detail="Unknown report type",
        )


# =========================================================================
# 6. PUBLIC SHARE LINKS (UNAUTHENTICATED)
# =========================================================================

@router.get("/public/invoice/{share_token}")
@limiter.limit("60/minute")
async def get_public_invoice_endpoint(request: Request, share_token: str):
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
@limiter.limit("30/minute")
async def get_public_invoice_pdf_endpoint(request: Request, share_token: str):
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

def _sniff_finance_proof(content: bytes, ext: str) -> str:
    """Match daily-log / avatar upload security: magic bytes, not client MIME."""
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    dangerous_prefixes = (
        b"MZ",
        b"\x7fELF",
        b"\xfe\xed\xfa",
        b"\xcf\xfa\xed\xfe",
        b"<!DOCTYPE",
        b"<!doctype",
        b"<html",
        b"<HTML",
        b"<script",
        b"<SCRIPT",
        b"<?php",
    )
    for prefix in dangerous_prefixes:
        if content.startswith(prefix):
            raise HTTPException(
                status_code=400,
                detail=f"File content signature (magic bytes) does not match declared extension '{ext}'.",
            )

    ext_clean = (ext or "").lower().lstrip(".")
    if ext_clean == "pdf" and content.startswith(b"%PDF-"):
        return "application/pdf"
    if ext_clean == "png" and content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if ext_clean in ("jpg", "jpeg") and content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if (
        ext_clean == "webp"
        and len(content) >= 12
        and content[:4] == b"RIFF"
        and content[8:12] == b"WEBP"
    ):
        return "image/webp"

    raise HTTPException(
        status_code=400,
        detail=f"File content signature (magic bytes) does not match declared extension '{ext}'.",
    )


@router.post("/upload")
@limiter.limit("15/minute")
async def upload_proof_file_endpoint(
    request: Request,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_permission("finance", "create")),
):
    """Secure upload for payment slips, deposit slips, and WHT certificates."""
    db = get_database()
    cid = _extract_company_id(current_user)

    filename = (file.filename or "upload").replace("\\", "/").split("/")[-1]
    if not filename or filename in (".", "..") or ".." in filename:
        filename = "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("pdf", "png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Allowed file types: PDF, PNG, JPG, JPEG, WEBP")

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 15MB limit")

    sniffed_type = _sniff_finance_proof(content, ext)

    rel_key = f"finance/proofs/{cid}/{uuid.uuid4().hex[:12]}_{filename}"
    file_id = await save_upload_bytes(
        db,
        relative_key=rel_key,
        content=content,
        original_name=filename,
        content_type=sniffed_type,
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
