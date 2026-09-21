"""Public CRM ingest endpoints (token auth / Meta webhook). No session required."""
import json
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse

from app.config import settings
from app.core.limiter import limiter
from app.schemas.crm import CrmIngestResponse, CrmLeadResponse, CrmPublicIngestAck
from app.schemas.error import ErrorResponse
from app.services import crm_ingest

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

    event_id = await queue_webhook_event("google_ads", payload, source_id=source.get("id"))
    return {"ok": True, "queued": True, "event_id": event_id}


# ==============================================================================
# NATIVE REAMARC MEETING SCHEDULER PUBLIC ENDPOINTS (No Auth Required)
# ==============================================================================

@router.get("/public/scheduler/config")
@limiter.limit("120/minute")
async def get_public_scheduler_config(request: Request):
    """Retrieve public meeting scheduler metadata (title, duration, services, host, timezone)."""
    from app.services import crm_scheduler
    settings = await crm_scheduler.get_scheduler_settings()
    return {
        "title": settings.get("title"),
        "description": settings.get("description"),
        "host_name": settings.get("host_name"),
        "duration_minutes": settings.get("duration_minutes", 30),
        "timezone": settings.get("timezone", "Asia/Karachi"),
        "working_days": settings.get("working_days", [1, 2, 3, 4, 5]),
        "services": settings.get("services", []),
        "hr_whatsapp": settings.get("hr_whatsapp", "+923265550022"),
        "careers_roles": settings.get("careers_roles", [
            "Full-Stack Developer",
            "UI/UX & Product Designer",
            "Performance Marketer (Meta / Google Ads)",
            "Video Editor & Motion Designer",
            "AI & Automation Engineer",
            "Technical Copywriter",
            "Other Position",
        ]),
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
    return await crm_scheduler.get_available_slots(date, client_timezone=timezone)


@router.post("/public/scheduler/book")
@limiter.limit("30/minute")
async def book_public_meeting(request: Request):
    """Submit a booking request from the public scheduler or embedded WordPress widget.

    Validates slot availability atomically, ingests the lead directly into 'session_booked'
    stage in Reamarc CRM, and returns instant calendar links.
    """
    from app.services import crm_scheduler
    raw = await request.body()
    crm_ingest.assert_ingest_body_size(raw)

    payload = await crm_ingest.parse_ingest_request_body(request, raw)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object required.")

    return await crm_scheduler.book_meeting(payload)


@router.get("/public/scheduler/ics/{token}")
@limiter.limit("60/minute")
async def download_scheduler_ics(request: Request, token: str):
    """Download RFC 5545 iCalendar (.ics) invite. Requires a signed booking token."""
    from app.services import crm_scheduler
    db = crm_ingest._db()
    token = (token or "").strip()
    lead_id = token.split(".", 1)[0] if "." in token else ""
    if not lead_id or not lead_id.startswith("ld_"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    lead = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead or not lead.get("meeting"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

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
        title=m.get("event_name", "Reamarc Consultancy Session"),
        description=f"Discovery and strategy session with Reamarc.\nMeeting Room: {m.get('join_url', '')}",
        location=m.get("join_url", ""),
        start_dt=start_dt,
        end_dt=end_dt,
        host_name=m.get("host_name", "Muhammad Faizan Khan"),
        host_email=m.get("host_email", "faizan@reamarc.com"),
        attendee_name=lead.get("name", "Client"),
        attendee_email=lead.get("email", ""),
    )
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "", lead_id) or "session"
    return PlainTextResponse(
        content=ics_content,
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="reamarc-session-{safe_name}.ics"'},
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
    if not crm_ingest.verify_meta_signature(raw, signature):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Meta signature.")

    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body.") from err

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object required.")

    from app.services.crm_lead_processor import queue_webhook_event

    event_id = await queue_webhook_event("meta", payload)
    return {"ok": True, "queued": True, "event_id": event_id}
