"""Public CRM ingest endpoints (token auth / Meta webhook). No session required."""
import json
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
