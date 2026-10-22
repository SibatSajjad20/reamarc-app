"""Public CRM ingest endpoints (token auth / Meta webhook). No session required."""
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse

from app.config import settings
from app.core.limiter import limiter
from app.schemas.crm import CrmIngestResponse, CrmLeadResponse, CrmPublicIngestAck
from app.schemas.error import ErrorResponse
from app.services import crm_ingest

logger = logging.getLogger("app.crm.public")

router = APIRouter(
    prefix="/crm",
    tags=["CRM Ingest"],
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
    },
)


@router.post("/ingest/{token}", response_model=CrmPublicIngestAck)
@limiter.limit("60/minute")
async def public_ingest(request: Request, token: str):
    """Website / WordPress / Elementor / Forms / Sheets webhook.

    Auth is the path token (hashed at rest).
    Supports application/json, application/x-www-form-urlencoded, and multipart/form-data.
    """
    raw = await request.body()
    body = await crm_ingest.parse_ingest_request_body(request, raw)
    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload. Dictionary required.")

    result = await crm_ingest.ingest_from_token(token, body)
    lead = result["lead"]
    return CrmPublicIngestAck(
        id=lead["id"],
        created=bool(result.get("created")),
        duplicate=bool(result.get("duplicate")),
    )


@router.post("/google/webhook/{token}")
@limiter.limit("60/minute")
async def google_ads_webhook(request: Request, token: str):
    """Google Ads Lead Form Extension webhook with token authentication."""
    # Verify token exists and is active
    source = await crm_ingest.resolve_source_by_token(token)
    cid = source.get("company_id") or "company_reamarc"
    raw = await request.body()
    crm_ingest.assert_ingest_body_size(raw)
    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body.") from err

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object required.")

    # Validate google_key if configured
    expected_key = source.get("google_key") or getattr(settings, "CRM_GOOGLE_ADS_WEBHOOK_KEY", None)
    if expected_key:
        if payload.get("google_key") != expected_key:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Google Ads webhook key.")

    # Google Ads handshake test
    if payload.get("is_test"):
        return {"ok": True, "test": True, "message": "Google Ads test webhook received successfully."}

    from app.services.crm_lead_processor import queue_webhook_event
    from app.core.tenant import tenant_scope

    with tenant_scope(cid):
        event_id = await queue_webhook_event("google_ads", payload, source_id=source.get("id"))
    return {"ok": True, "queued": True, "event_id": event_id}


# ==============================================================================
# NATIVE MEETING SCHEDULER PUBLIC ENDPOINTS (No Auth Required)
# ==============================================================================

async def _resolve_scheduler_company(request: Request) -> str:
    slug = (
        request.headers.get("X-Company")
        or request.query_params.get("company")
        or request.query_params.get("slug")
    )
    if slug:
        from app.core.security import lookup_company
        comp = await lookup_company(slug)
        if comp:
            return comp.get("id") or "company_reamarc"
        
        # Check by scheduler_settings booking_link_slug
        from app.core.tenant import get_global_db
        gdb = get_global_db()
        if gdb is not None:
            sched = await gdb.crm_scheduler_settings.find_one({"booking_link_slug": slug})
            if sched and sched.get("company_id"):
                return sched["company_id"]
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company or scheduler not found for slug '{slug}'",
        )
    
    if getattr(settings, "MULTI_TENANT_ENABLED", False):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company specification required in multi-tenant mode",
        )
    return "company_reamarc"


@router.get("/public/scheduler/config")
@limiter.limit("120/minute")
async def get_public_scheduler_config(request: Request):
    """Retrieve public meeting scheduler metadata (title, duration, services, host, timezone)."""
    from app.services import crm_scheduler
    from app.core.tenant import tenant_scope, get_global_db
    cid = await _resolve_scheduler_company(request)
    with tenant_scope(cid):
        sched_settings = await crm_scheduler.get_scheduler_settings()
        gdb = get_global_db()
        comp = await gdb.companies.find_one({"id": cid}) if gdb is not None else None
        comp_name = comp.get("name") if comp else "Reamarc"
        comp_logo = comp.get("logo_url") if comp else None
        comp_accent = comp.get("accent_color") if comp else "#6847E0"
        return {
            "title": sched_settings.get("title"),
            "description": sched_settings.get("description"),
            "host_name": sched_settings.get("host_name"),
            "duration_minutes": sched_settings.get("duration_minutes", 30),
            "timezone": sched_settings.get("timezone", "Asia/Karachi"),
            "working_days": sched_settings.get("working_days", [1, 2, 3, 4, 5]),
            "services": sched_settings.get("services", []),
            "hr_whatsapp": sched_settings.get("hr_whatsapp", "+923265550022"),
            "careers_roles": sched_settings.get("careers_roles", [
                "Full-Stack Developer",
                "UI/UX & Product Designer",
                "Performance Marketer (Meta / Google Ads)",
                "Video Editor & Motion Designer",
                "AI & Automation Engineer",
                "Technical Copywriter",
                "Other Position",
            ]),
            "company_name": comp_name,
            "company_logo": comp_logo,
            "accent_color": comp_accent,
        }


@router.post("/public/careers/inquiry")
@limiter.limit("30/minute")
async def submit_careers_inquiry(request: Request):
    """Store career application inquiry from public booking page.
    Does NOT reserve any calendar slot and does NOT create sales leads in crm_leads.
    """
    raw = await request.body()
    crm_ingest.assert_ingest_body_size(raw)
    payload = await crm_ingest.parse_ingest_request_body(request, raw)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object required.")

    from app.core.tenant import tenant_scope
    cid = await _resolve_scheduler_company(request)
    with tenant_scope(cid):
        db = crm_ingest._db()
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        doc = {
            "name": str(payload.get("name") or "").strip()[:120],
            "email": str(payload.get("email") or "").strip()[:254],
            "phone": str(payload.get("phone") or "").strip()[:40],
            "role": str(payload.get("role") or "").strip()[:120],
            "portfolio_url": str(payload.get("portfolio_url") or "").strip()[:500],
            "note": str(payload.get("note") or "").strip()[:2000],
            "created_at": now_iso,
        }
        if not doc["name"] or not doc["email"] or not doc["phone"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name, email, and phone are required.")
        await db.crm_career_applications.insert_one(doc)
        return {"ok": True, "message": "Application inquiry recorded."}


@router.get("/public/scheduler/month-availability")
@limiter.limit("120/minute")
async def get_public_scheduler_month_availability(
    request: Request,
    month: str = Query(..., description="Target booking month in YYYY-MM format"),
    timezone: Optional[str] = Query(None, description="Optional client timezone"),
):
    """Query fully booked / unavailable dates for a calendar month."""
    from app.services import crm_scheduler
    from app.core.tenant import tenant_scope
    cid = await _resolve_scheduler_company(request)
    with tenant_scope(cid):
        return await crm_scheduler.get_month_availability(month, client_timezone=timezone)


@router.get("/public/scheduler/slots")
@limiter.limit("120/minute")
async def get_public_scheduler_slots(
    request: Request,
    date: str = Query(..., description="Target booking date in YYYY-MM-DD format"),
    timezone: Optional[str] = Query(None, description="Optional client timezone"),
):
    """Query real-time available time slots for a specified date, automatically filtering out conflicts."""
    from app.services import crm_scheduler
    from app.core.tenant import tenant_scope
    cid = await _resolve_scheduler_company(request)
    with tenant_scope(cid):
        return await crm_scheduler.get_available_slots(date, client_timezone=timezone)


@router.post("/public/scheduler/book")
@limiter.limit("30/minute")
async def book_public_meeting(request: Request):
    """Submit a booking request from the public scheduler or embedded widget.

    Validates slot availability atomically, ingests the lead directly into 'session_booked'
    stage in CRM, and returns instant calendar links.
    """
    from app.services import crm_scheduler
    from app.core.tenant import tenant_scope
    cid = await _resolve_scheduler_company(request)
    raw = await request.body()
    crm_ingest.assert_ingest_body_size(raw)

    payload = await crm_ingest.parse_ingest_request_body(request, raw)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object required.")

    with tenant_scope(cid):
        return await crm_scheduler.book_meeting(payload)


@router.get("/public/scheduler/ics/{token}")
@limiter.limit("60/minute")
async def download_scheduler_ics(request: Request, token: str):
    """Download RFC 5545 iCalendar (.ics) invite. Requires a signed booking token."""
    from app.services import crm_scheduler
    from app.core.tenant import get_global_db, tenant_scope
    token = (token or "").strip()
    lead_id = token.split(".", 1)[0] if "." in token else ""
    if not lead_id or not lead_id.startswith("ld_"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable.")

    lead = await gdb.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead or not lead.get("meeting"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    cid = lead.get("company_id") or "company_reamarc"
    with tenant_scope(cid):
        m = lead["meeting"]
        start_time = str(m.get("start_time") or "")
        if not crm_scheduler.verify_ics_token(token, lead_id, start_time):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

        from datetime import datetime as dt_cls
        try:
            st_raw = start_time.replace("Z", "+00:00")
            et_raw = str(m.get("end_time")).replace("Z", "+00:00")
            start_dt = dt_cls.fromisoformat(st_raw)
            end_dt = dt_cls.fromisoformat(et_raw)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid meeting timestamps.")

        ics_content = crm_scheduler.generate_ics_calendar(
            lead_id=lead_id,
            title=m.get("event_name", "Consultancy Session"),
            description=f"Discovery and strategy session.\nMeeting Room: {m.get('join_url', '')}",
            location=m.get("join_url", ""),
            start_dt=start_dt,
            end_dt=end_dt,
            host_name=m.get("host_name", "Host"),
            host_email=m.get("host_email", "host@example.com"),
            attendee_name=lead.get("name", "Client"),
            attendee_email=lead.get("email", ""),
        )
        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "", lead_id) or "session"
        return PlainTextResponse(
            content=ics_content,
            media_type="text/calendar",
            headers={"Content-Disposition": f'attachment; filename="session-{safe_name}.ics"'},
        )


@router.get("/meta/webhook")
@limiter.limit("30/minute")
async def meta_webhook_verify(
    request: Request,
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    expected = (settings.CRM_META_WEBHOOK_VERIFY_TOKEN or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRM_META_WEBHOOK_VERIFY_TOKEN is not configured.",
        )
    if hub_mode == "subscribe" and crm_ingest.verify_meta_hub_token(hub_verify_token, expected) and hub_challenge is not None:
        return PlainTextResponse(content=str(hub_challenge))
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Meta webhook verification failed.")


@router.post("/meta/webhook")
@limiter.limit("120/minute")
async def meta_webhook_receive(request: Request):
    """Asynchronous Meta leadgen webhook.

    Validates X-Hub-Signature-256, immediately queues the payload into crm_lead_events (<100ms),
    and triggers async retrieval with exponential backoff retries to guarantee zero dropped leads.
    """
    raw = await request.body()
    crm_ingest.assert_ingest_body_size(raw)
    signature = request.headers.get("x-hub-signature-256")

    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body.") from err

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object required.")

    from app.services.crm_lead_processor import queue_webhook_event
    from app.services import crm_meta_accounts
    from app.core.tenant import get_global_db, tenant_scope

    cid = None
    gdb = get_global_db()
    page_id = None
    try:
        entries = payload.get("entry") or []
        for ent in entries:
            for ch in ent.get("changes") or []:
                val = ch.get("value") or {}
                if val.get("page_id"):
                    page_id = str(val["page_id"]).strip()
                    break
            if not page_id and ent.get("id"):
                page_id = str(ent["id"]).strip()
            if page_id:
                break
        env_page = (settings.CRM_META_PAGE_ID or "").strip()
        if page_id and env_page and page_id == env_page:
            cid = "company_reamarc"
        if page_id and gdb is not None:
            # 1. Check company_integrations
            integ = await gdb.company_integrations.find_one({"meta.page_id": page_id}, {"company_id": 1})
            if integ and integ.get("company_id"):
                cid = integ["company_id"]
            else:
                # 2. Check crm_meta_pages
                p_doc = await gdb.crm_meta_pages.find_one({"page_id": page_id}, {"company_id": 1, "page_id": 1})
                if p_doc:
                    stored_cid = p_doc.get("company_id")
                    if stored_cid:
                        cid = stored_cid
                    elif env_page and page_id == env_page:
                        cid = "company_reamarc"
                    else:
                        cid = cid  # missing company_id is unknown unless env page
        if page_id and env_page and page_id == env_page:
            cid = "company_reamarc"
    except Exception as exc:
        logger.warning("Error resolving Meta webhook company: %s", exc)

    env_page = (settings.CRM_META_PAGE_ID or "").strip()
    page_secret = None
    if page_id and env_page and page_id == env_page:
        page_secret = (settings.CRM_META_APP_SECRET or "").strip()
        cid = "company_reamarc"
    else:
        creds = await crm_meta_accounts.get_page_credentials(page_id, company_id=cid)
        if creds:
            page_secret = (creds.get("app_secret") or "").strip()
            cid = cid or creds.get("company_id")

    if not crm_ingest.verify_meta_signature(raw, signature, page_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Meta signature.")

    if not cid:
        if getattr(settings, "MULTI_TENANT_ENABLED", False):
            entry_ids = []
            for ent in payload.get("entry") or []:
                if ent.get("id") is not None:
                    entry_ids.append(str(ent.get("id")))
            if gdb is not None:
                await gdb.security_events.insert_one({
                    "event_type": "unknown_webhook_page",
                    "page_id": page_id,
                    "entry_ids": entry_ids,
                    "created_at": datetime.now(timezone.utc),
                })
            return {"ok": True, "dropped": True, "reason": "unknown_page"}
        cid = "company_reamarc"

    with tenant_scope(cid):
        event_id = await queue_webhook_event("meta", payload)
    return {"ok": True, "queued": True, "event_id": event_id}
