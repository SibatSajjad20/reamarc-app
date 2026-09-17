"""CRM Phase 4 — signed website ingest + Meta leadgen with E.164 + 30-day dedupe."""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.database import get_database
from app.services.crm_leads import append_activity, serialize_lead
from app.services.crm_phone import normalize_phone_e164
from app.services.meta_ads import META_GRAPH_BASE_URL, _execute_meta_request_with_retry

logger = logging.getLogger("app.crm.ingest")

DEDUPE_WINDOW_DAYS = 30
INGEST_MAX_BODY_BYTES = 65_536
INGEST_MAX_CUSTOM_FIELDS = 40
INGEST_MAX_FIELD_CHARS = 2_000
INGEST_MAX_RAW_CHARS = 8_192
SYSTEM_ACTOR = {"id": "system:crm_ingest", "full_name": "CRM Ingest", "name": "CRM Ingest"}

_PHONE_KEYS = (
    "phone",
    "phone_number",
    "mobile",
    "mobile_phone",
    "whatsapp",
    "tel",
    "contact_number",
)
_NAME_KEYS = ("name", "full_name", "fullname_name", "contact_name")
_EMAIL_KEYS = ("email", "email_address", "work_email")
_COMPANY_KEYS = ("company", "company_name", "business_name", "organisation", "organization")
_CITY_KEYS = ("city", "town", "location")
_SERVICE_KEYS = ("service", "product", "interest", "looking_for")
_BUDGET_KEYS = ("budget", "monthly_budget", "ad_budget")
_WEBSITE_KEYS = ("website", "website_url", "site", "web_url", "url")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable.")
    return db


def hash_ingest_token(raw: str) -> str:
    return hashlib.sha256(raw.strip().encode("utf-8")).hexdigest()


def _first_str(payload: Dict[str, Any], keys: Tuple[str, ...]) -> Optional[str]:
    lower = {str(k).lower().strip(): v for k, v in payload.items()}
    for key in keys:
        val = lower.get(key)
        if val is None:
            continue
        if isinstance(val, (list, tuple)) and val:
            val = val[0]
        text = str(val).strip()
        if text:
            return text
    return None


def _pick_name(payload: Dict[str, Any]) -> str:
    name = _first_str(payload, _NAME_KEYS)
    if name:
        return name
    first = _first_str(payload, ("first_name", "firstname", "given_name"))
    last = _first_str(payload, ("last_name", "lastname", "family_name", "surname"))
    joined = " ".join(p for p in (first, last) if p).strip()
    if joined:
        return joined
    email = _first_str(payload, _EMAIL_KEYS)
    if email and "@" in email:
        return email.split("@", 1)[0]
    phone = _first_str(payload, _PHONE_KEYS)
    if phone:
        return f"Lead {phone[-4:]}"
    return "Unknown lead"


def _clip_str(value: Optional[str], limit: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


def _sanitize_custom_fields(raw: Dict[str, Any], reserved: set) -> Dict[str, Any]:
    """Allowlist leftover form keys with hard size caps (DoS / BSON bloat)."""
    out: Dict[str, Any] = {}
    for key, val in raw.items():
        if len(out) >= INGEST_MAX_CUSTOM_FIELDS:
            break
        k = str(key).strip()[:80]
        if not k or k.lower() in reserved:
            continue
        if isinstance(val, (dict, list)):
            text = str(val)[:INGEST_MAX_FIELD_CHARS]
        else:
            text = str(val).strip()[:INGEST_MAX_FIELD_CHARS] if val is not None else ""
        if text:
            out[k] = text
    return out


def _truncate_raw_payload(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Persist a compact snapshot only — never unbounded attacker JSON."""
    if not isinstance(payload, dict):
        return {}
    compact: Dict[str, Any] = {}
    for key, val in list(payload.items())[:INGEST_MAX_CUSTOM_FIELDS]:
        k = str(key).strip()[:80]
        if not k:
            continue
        if isinstance(val, (dict, list)):
            compact[k] = str(val)[:INGEST_MAX_FIELD_CHARS]
        else:
            compact[k] = str(val).strip()[:INGEST_MAX_FIELD_CHARS] if val is not None else None
    blob = str(compact)
    if len(blob) > INGEST_MAX_RAW_CHARS:
        return {"_truncated": True, "preview": blob[:INGEST_MAX_RAW_CHARS]}
    return compact


def normalize_ingest_fields(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Map messy website / Meta field bags into CRM lead fields."""
    raw = dict(payload or {})
    phone_raw = _clip_str(_first_str(raw, _PHONE_KEYS), 40)
    email = (_first_str(raw, _EMAIL_KEYS) or "").lower() or None
    e164, valid = normalize_phone_e164(phone_raw)
    reserved = {
        *_PHONE_KEYS,
        *_NAME_KEYS,
        *_EMAIL_KEYS,
        *_COMPANY_KEYS,
        *_CITY_KEYS,
        *_SERVICE_KEYS,
        *_BUDGET_KEYS,
        *_WEBSITE_KEYS,
        "campaign",
        "campaign_name",
        "utm_campaign",
        "note",
        "message",
        "comments",
        "enquiry",
        "external_id",
        "id",
        "lead_id",
        "first_name",
        "lastname",
        "last_name",
        "firstname",
        "given_name",
        "family_name",
        "surname",
        "source",
    }
    return {
        "name": _pick_name(raw)[:160],
        "phone_raw": phone_raw,
        "phone_e164": e164,
        "phone_valid": valid,
        "email": email[:200] if email else None,
        "company": _clip_str(_first_str(raw, _COMPANY_KEYS), 160),
        "website": _clip_str(_first_str(raw, _WEBSITE_KEYS), 200),
        "city": _clip_str(_first_str(raw, _CITY_KEYS), 80),
        "service": _clip_str(_first_str(raw, _SERVICE_KEYS), 120),
        "budget": _clip_str(_first_str(raw, _BUDGET_KEYS), 80),
        "campaign": _clip_str(_first_str(raw, ("campaign", "campaign_name", "utm_campaign")), 160),
        "note": _clip_str(_first_str(raw, ("note", "message", "comments", "enquiry")), 4000),
        "external_id": (
            f"client_{_clip_str(_first_str(raw, ('external_id', 'id', 'lead_id')), 200)}"
            if _clip_str(_first_str(raw, ("external_id", "id", "lead_id")), 200)
            and _clip_str(_first_str(raw, ("external_id", "id", "lead_id")), 200).lower().startswith(
                ("meta_", "meta_lead_", "google_", "google_lead_", "fb_", "facebook_")
            )
            else _clip_str(_first_str(raw, ("external_id", "id", "lead_id")), 200)
        ),
        "custom_fields": _sanitize_custom_fields(raw, reserved),
    }


def assert_ingest_body_size(raw: bytes) -> None:
    if len(raw) > INGEST_MAX_BODY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Ingest payload exceeds {INGEST_MAX_BODY_BYTES} bytes.",
        )


def extract_attribution(payload: Dict[str, Any], default_platform: str = "web") -> Dict[str, Any]:
    raw = dict(payload or {})
    platform = _first_str(raw, ("platform", "source", "utm_source")) or default_platform
    utm_source = _first_str(raw, ("utm_source",))
    utm_medium = _first_str(raw, ("utm_medium", "medium"))
    utm_campaign = _first_str(raw, ("utm_campaign", "campaign", "campaign_name"))
    utm_content = _first_str(raw, ("utm_content", "content"))
    utm_term = _first_str(raw, ("utm_term", "term", "keyword"))
    click_id = _first_str(raw, ("fbclid", "gclid", "ttclid", "msclkid", "click_id"))
    referrer = _first_str(raw, ("referrer", "http_referrer", "page_url", "url"))

    ad_id = _first_str(raw, ("ad_id", "meta_ad_id"))
    ad_name = _first_str(raw, ("ad_name", "ad", "creative"))
    adset_id = _first_str(raw, ("adset_id", "meta_adset_id"))
    adset_name = _first_str(raw, ("adset_name", "adset"))
    campaign_id = _first_str(raw, ("campaign_id", "meta_campaign_id"))
    form_id = _first_str(raw, ("form_id", "meta_form_id", "lead_form_id"))
    form_name = _first_str(raw, ("form_name", "lead_form_name"))

    out: Dict[str, Any] = {
        "platform": _clip_str(str(platform), 60),
        "utm_source": _clip_str(utm_source, 100),
        "utm_medium": _clip_str(utm_medium, 100),
        "utm_campaign": _clip_str(utm_campaign, 160),
        "utm_content": _clip_str(utm_content, 160),
        "utm_term": _clip_str(utm_term, 160),
        "click_id": _clip_str(click_id, 200),
        "referrer": _clip_str(referrer, 500),
        "ad_id": _clip_str(ad_id, 100),
        "ad_name": _clip_str(ad_name, 160),
        "adset_id": _clip_str(adset_id, 100),
        "adset_name": _clip_str(adset_name, 160),
        "campaign_id": _clip_str(campaign_id, 100),
        "form_id": _clip_str(form_id, 100),
        "form_name": _clip_str(form_name, 160),
    }
    return {k: v for k, v in out.items() if v is not None}


async def parse_ingest_request_body(request: Any, raw: bytes) -> Dict[str, Any]:
    """Robust parser for JSON, form-urlencoded, and multipart payloads from WordPress / web forms."""
    assert_ingest_body_size(raw)
    content_type = (request.headers.get("content-type") or "").lower()

    # 1. JSON parse attempt
    if "application/json" in content_type or not content_type:
        try:
            import json as _json
            parsed = _json.loads(raw.decode("utf-8") or "{}")
            if isinstance(parsed, dict):
                return parsed
        except (UnicodeDecodeError, Exception):
            if "application/json" in content_type:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body.")

    # 2. Form urlencoded or multipart
    if "form-urlencoded" in content_type or "multipart/form-data" in content_type:
        try:
            form = await request.form()
            out: Dict[str, Any] = {}
            for k, v in form.items():
                k_str = str(k).strip()
                if not k_str or hasattr(v, "filename"):
                    continue
                out[k_str] = str(v).strip()
            # If payload is bundled under single field like 'payload' or 'data'
            for single_key in ("payload", "data", "json", "body"):
                if single_key in out and len(out) == 1:
                    try:
                        import json as _json
                        inner = _json.loads(out[single_key])
                        if isinstance(inner, dict):
                            return inner
                    except Exception:
                        pass
            if out:
                return out
        except HTTPException:
            raise
        except Exception as err:
            logger.warning("Form parsing failed: %s", err)

    # 3. Fallback: try raw JSON or query string parsing
    try:
        import json as _json
        text = raw.decode("utf-8", errors="replace").strip()
        if text.startswith("{") and text.endswith("}"):
            parsed = _json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        from urllib.parse import parse_qs
        qs = parse_qs(text, keep_blank_values=True)
        if qs:
            return {k: v[0] if len(v) == 1 else v for k, v in qs.items()}
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid request body. Supported formats: JSON, application/x-www-form-urlencoded, or multipart/form-data.",
    )


def serialize_source(doc: Dict[str, Any], *, include_url_hint: bool = True) -> Dict[str, Any]:
    out = {
        "id": doc.get("id"),
        "name": doc.get("name") or "",
        "kind": doc.get("kind") or "webhook",
        "enabled": bool(doc.get("enabled", True)),
        "default_source": doc.get("default_source") or "website",
        "default_campaign": doc.get("default_campaign"),
        "token_prefix": doc.get("token_prefix") or "",
        "created_by": doc.get("created_by"),
        "created_at": doc.get("created_at") or "",
        "updated_at": doc.get("updated_at") or "",
        "last_used_at": doc.get("last_used_at"),
        "hit_count": int(doc.get("hit_count") or 0),
    }
    if include_url_hint and doc.get("token_prefix"):
        out["ingest_path"] = f"/crm/ingest/<{doc.get('token_prefix')}…>"
    return out


async def list_sources() -> List[Dict[str, Any]]:
    db = _db()
    rows = await db.crm_ingest_sources.find({}, {"_id": 0, "token_hash": 0}).sort("created_at", -1).to_list(200)
    return [serialize_source(r) for r in rows]


async def create_source(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    db = _db()
    raw_token = secrets.token_urlsafe(32)
    now = _now()
    doc = {
        "id": f"src_{uuid.uuid4().hex[:12]}",
        "name": str(payload.get("name") or "Website form").strip()[:80],
        "kind": str(payload.get("kind") or "webhook").strip().lower()[:40],
        "enabled": True,
        "default_source": str(payload.get("default_source") or "website").strip().lower()[:80],
        "default_campaign": (str(payload["default_campaign"]).strip() if payload.get("default_campaign") else None),
        "token_hash": hash_ingest_token(raw_token),
        "token_prefix": raw_token[:8],
        "created_by": user.get("id"),
        "created_at": now,
        "updated_at": now,
        "last_used_at": None,
        "hit_count": 0,
    }
    await db.crm_ingest_sources.insert_one(doc)
    out = serialize_source(doc)
    out["token"] = raw_token
    out["ingest_path"] = f"/crm/ingest/{raw_token}"
    return out


async def update_source(source_id: str, patch: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    db = _db()
    existing = await db.crm_ingest_sources.find_one({"id": source_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingest source not found.")
    fields: Dict[str, Any] = {"updated_at": _now()}
    if "name" in patch and patch["name"] is not None:
        fields["name"] = str(patch["name"]).strip()[:80]
    if "enabled" in patch and patch["enabled"] is not None:
        fields["enabled"] = bool(patch["enabled"])
    if "default_source" in patch and patch["default_source"] is not None:
        fields["default_source"] = str(patch["default_source"]).strip().lower()[:80]
    if "default_campaign" in patch:
        val = patch["default_campaign"]
        fields["default_campaign"] = str(val).strip() if val else None
    await db.crm_ingest_sources.update_one({"id": source_id}, {"$set": fields})
    fresh = await db.crm_ingest_sources.find_one({"id": source_id}, {"_id": 0, "token_hash": 0})
    return serialize_source(fresh or {**existing, **fields})


async def delete_source(source_id: str, user: Dict[str, Any]) -> None:
    db = _db()
    result = await db.crm_ingest_sources.delete_one({"id": source_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingest source not found.")


async def resolve_source_by_token(raw_token: str) -> Dict[str, Any]:
    db = _db()
    token = (raw_token or "").strip()
    if not token or len(token) < 16:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ingest token.")
    doc = await db.crm_ingest_sources.find_one({"token_hash": hash_ingest_token(token)}, {"_id": 0})
    if not doc or not doc.get("enabled", True):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ingest token.")
    return doc


async def _touch_source(source_id: str) -> None:
    db = _db()
    await db.crm_ingest_sources.update_one(
        {"id": source_id},
        {"$set": {"last_used_at": _now()}, "$inc": {"hit_count": 1}},
    )


def _parse_created_at(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


async def find_recent_duplicate(
    *,
    phone_e164: Optional[str],
    email: Optional[str],
    external_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Match external_id (any age) or phone/email within 30 days."""
    db = _db()
    if external_id:
        hit = await db.crm_leads.find_one({"external_id": external_id}, {"_id": 0})
        if hit:
            return hit

    cutoff = (datetime.now(timezone.utc) - timedelta(days=DEDUPE_WINDOW_DAYS)).isoformat()
    clauses: List[Dict[str, Any]] = []
    if phone_e164:
        clauses.append({"phone_e164": phone_e164})
    if email:
        clauses.append({"email": email.lower().strip()})
    if not clauses:
        return None

    cursor = db.crm_leads.find(
        {"$or": clauses, "created_at": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("created_at", -1)
    rows = await cursor.to_list(5)
    window_start = datetime.now(timezone.utc) - timedelta(days=DEDUPE_WINDOW_DAYS)
    for row in rows:
        created = _parse_created_at(row.get("created_at"))
        # Only match when created_at is parseable and inside the 30-day window.
        # Unparseable timestamps must not permanently swallow new leads.
        if created and created >= window_start:
            return row
    return None


async def ingest_lead(
    *,
    fields: Dict[str, Any],
    source_label: str,
    campaign: Optional[str] = None,
    external_id: Optional[str] = None,
    raw_payload: Optional[Dict[str, Any]] = None,
    ingest_source_id: Optional[str] = None,
    attribution: Optional[Dict[str, Any]] = None,
    initial_stage: Optional[str] = None,
    meeting: Optional[Dict[str, Any]] = None,
    next_follow_up_at: Optional[str] = None,
    skip_duplicate_merge: bool = False,
) -> Dict[str, Any]:
    """Create or attach-to-duplicate a lead, then run the assignment engine.

    Public scheduler bookings must pass skip_duplicate_merge=True so an anonymous
    caller cannot mutate an existing lead by matching email/phone.
    """
    db = _db()
    normalized = normalize_ingest_fields(fields)
    ext = external_id or normalized.get("external_id")
    if ext:
        ext = str(ext).strip()[:200] or None

    existing = None
    if not skip_duplicate_merge:
        existing = await find_recent_duplicate(
            phone_e164=normalized.get("phone_e164"),
            email=normalized.get("email"),
            external_id=ext,
        )
    if existing:
        await append_activity(
            existing["id"],
            "duplicate_ingest",
            f"Duplicate ingest from {source_label} for {normalized.get('name')}.",
            SYSTEM_ACTOR,
            {
                "source": source_label,
                "ingest_source_id": ingest_source_id,
                "external_id": ext,
            },
        )
        if ingest_source_id:
            await _touch_source(ingest_source_id)
        return {
            "lead": serialize_lead(existing),
            "created": False,
            "duplicate": True,
        }

    now = _now()
    doc = {
        "id": f"ld_{uuid.uuid4().hex[:12]}",
        "name": normalized["name"],
        "company": normalized.get("company"),
        "website": normalized.get("website"),
        "email": normalized.get("email"),
        "phone_raw": normalized.get("phone_raw"),
        "phone_e164": normalized.get("phone_e164"),
        "phone_valid": bool(normalized.get("phone_valid")),
        "city": normalized.get("city"),
        "service": normalized.get("service"),
        "budget": normalized.get("budget"),
        "source": (source_label or "ingest").strip().lower()[:80],
        "campaign": campaign or normalized.get("campaign"),
        "stage": (initial_stage or "new").strip().lower()[:80],
        "outcome": None,
        "disqualify_reason": None,
        "assigned_to": None,
        "assigned_to_name": None,
        "assigned_at": None,
        "contacted": False,
        "contacted_at": None,
        "whatsapp_opened_at": None,
        "last_activity_at": now,
        "next_follow_up_at": next_follow_up_at,
        "meeting": meeting,
        "tags": [],
        "custom_fields": normalized.get("custom_fields") or {},
        "raw_payload": _truncate_raw_payload(raw_payload or fields),
        "converted_workspace_id": None,
        "created_by": SYSTEM_ACTOR["id"],
        "created_at": now,
        "updated_at": now,
        "ingest_source_id": ingest_source_id,
        "attribution": attribution or extract_attribution(fields, default_platform=source_label),
    }
    if ext:
        doc["external_id"] = ext
    try:
        await db.crm_leads.insert_one(doc)
    except Exception as err:
        # Race on unique external_id — treat as duplicate.
        if ext:
            raced = await db.crm_leads.find_one({"external_id": ext}, {"_id": 0})
            if raced:
                await append_activity(
                    raced["id"],
                    "duplicate_ingest",
                    f"Concurrent duplicate ingest from {source_label}.",
                    SYSTEM_ACTOR,
                    {"external_id": ext},
                )
                return {"lead": serialize_lead(raced), "created": False, "duplicate": True}
        logger.exception("CRM ingest insert failed: %s", err)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not store lead.") from err

    await append_activity(
        doc["id"],
        "created",
        f"Lead ingested from {doc['source']}.",
        SYSTEM_ACTOR,
        {"ingest_source_id": ingest_source_id, "external_id": ext},
    )
    if meeting:
        host_str = f" with {meeting.get('host_name')}" if meeting.get("host_name") else ""
        await append_activity(
            doc["id"],
            "meeting_scheduled",
            f"Meeting scheduled{host_str}: {meeting.get('event_name', 'Consultancy Session')} on {meeting.get('start_time', 'scheduled time')}.",
            SYSTEM_ACTOR,
            meeting,
        )
    note = normalized.get("note")
    if note:
        await append_activity(doc["id"], "note", str(note)[:4000], SYSTEM_ACTOR)

    from app.services.crm_assignment import apply_assignment_engine

    assigned = await apply_assignment_engine(doc["id"], actor=SYSTEM_ACTOR)
    if ingest_source_id:
        await _touch_source(ingest_source_id)
    return {"lead": assigned, "created": True, "duplicate": False}


async def ingest_from_token(raw_token: str, body: Dict[str, Any]) -> Dict[str, Any]:
    source = await resolve_source_by_token(raw_token)
    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object required.")
    source_lbl = str(body.get("source") or source.get("default_source") or "website")
    return await ingest_lead(
        fields=body,
        source_label=source_lbl,
        campaign=body.get("campaign") or source.get("default_campaign"),
        external_id=body.get("external_id") or body.get("id"),
        raw_payload=body,
        ingest_source_id=source.get("id"),
        attribution=extract_attribution(body, default_platform=source_lbl),
    )


def meta_field_data_to_dict(field_data: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if not isinstance(field_data, list):
        return out
    for item in field_data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        values = item.get("values") or []
        if not name:
            continue
        if isinstance(values, list) and values:
            out[name] = values[0] if len(values) == 1 else values
        else:
            out[name] = values
    return out


def meta_credentials_configured() -> bool:
    return bool(
        (settings.CRM_META_PAGE_ACCESS_TOKEN or "").strip()
        and (settings.CRM_META_WEBHOOK_VERIFY_TOKEN or "").strip()
    )


def verify_meta_signature(raw_body: bytes, signature_header: Optional[str]) -> bool:
    """Fail closed: missing app secret or signature always rejects."""
    secret = (settings.CRM_META_APP_SECRET or "").strip()
    if not secret:
        return False
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = signature_header.split("=", 1)[1].strip()
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, expected)


def verify_meta_hub_token(provided: Optional[str], expected: str) -> bool:
    """Constant-time compare for Meta webhook subscription verify_token."""
    if provided is None or not expected:
        return False
    return hmac.compare_digest(str(provided).encode("utf-8"), expected.encode("utf-8"))


async def fetch_meta_lead(leadgen_id: str, *, access_token: Optional[str] = None) -> Dict[str, Any]:
    token = (access_token or settings.CRM_META_PAGE_ACCESS_TOKEN or "").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Meta Page Access Token is not configured.",
        )
    url = f"{META_GRAPH_BASE_URL}/{leadgen_id}"
    params = {
        "access_token": token,
        "fields": (
            "id,created_time,ad_id,ad_name,adset_id,adset_name,"
            "campaign_id,campaign_name,form_id,field_data,page_id"
        ),
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await _execute_meta_request_with_retry(client, url, params)
    data = res.json() if res is not None else {}
    if res is None or res.status_code != 200 or "error" in data:
        logger.warning("Meta leadgen fetch failed for %s: %s", leadgen_id, data)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch Meta lead details.",
        )
    return data


async def ingest_meta_leadgen(leadgen_id: str, *, page_id: Optional[str] = None) -> Dict[str, Any]:
    from app.services import crm_meta_accounts

    creds = await crm_meta_accounts.get_page_credentials(page_id)
    if not creds or not creds.get("access_token"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Meta credentials not configured for Page ID {page_id or 'default'}.",
        )

    meta = await fetch_meta_lead(leadgen_id, access_token=creds["access_token"])
    fields = meta_field_data_to_dict(meta.get("field_data"))
    campaign = meta.get("campaign_name") or meta.get("ad_name") or creds.get("default_campaign")

    attribution = {
        "platform": "meta",
        "campaign_id": _clip_str(meta.get("campaign_id"), 100),
        "campaign_name": _clip_str(meta.get("campaign_name"), 160),
        "adset_id": _clip_str(meta.get("adset_id"), 100),
        "adset_name": _clip_str(meta.get("adset_name"), 160),
        "ad_id": _clip_str(meta.get("ad_id"), 100),
        "ad_name": _clip_str(meta.get("ad_name"), 160),
        "form_id": _clip_str(meta.get("form_id"), 100),
        "page_id": _clip_str(page_id or meta.get("page_id"), 100),
    }

    return await ingest_lead(
        fields=fields,
        source_label="meta",
        campaign=str(campaign) if campaign else None,
        external_id=f"meta_lead_{leadgen_id}",
        raw_payload={"meta_lead": meta, "field_data": fields},
        attribution=attribution,
    )


async def process_google_lead_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Google Ads Lead Form webhook payload and ingest lead."""
    raw = dict(payload or {})
    lead_id = str(raw.get("lead_id") or uuid.uuid4().hex[:12]).strip()
    user_columns = raw.get("user_column_data") or []

    fields: Dict[str, Any] = {}
    for col in user_columns:
        if not isinstance(col, dict):
            continue
        col_id = str(col.get("column_id") or col.get("column_name") or "").upper().strip()
        val = str(col.get("string_value") or "").strip()
        if not val:
            continue
        if "COMPANY" in col_id or "BUSINESS" in col_id:
            fields["company"] = val
        elif "PHONE" in col_id:
            fields["phone"] = val
        elif "EMAIL" in col_id:
            fields["email"] = val
        elif "CITY" in col_id:
            fields["city"] = val
        elif "NAME" in col_id:
            if "FIRST" in col_id:
                fields["first_name"] = val
            elif "LAST" in col_id:
                fields["last_name"] = val
            else:
                fields["name"] = val
        else:
            clean_key = col.get("column_name") or col_id.lower()
            fields[str(clean_key)[:80]] = val

    if "name" not in fields and ("first_name" in fields or "last_name" in fields):
        fields["name"] = f"{fields.get('first_name', '')} {fields.get('last_name', '')}".strip()

    campaign_id = str(raw.get("campaign_id") or "").strip() or None
    form_id = str(raw.get("form_id") or "").strip() or None

    attribution = {
        "platform": "google_ads",
        "campaign_id": campaign_id,
        "form_id": form_id,
        "click_id": str(raw.get("gcl_id") or raw.get("gclid") or "").strip() or None,
    }

    return await ingest_lead(
        fields=fields,
        source_label="google_ads",
        campaign=campaign_id,
        external_id=f"google_lead_{lead_id}",
        raw_payload=raw,
        attribution=attribution,
    )


async def process_meta_webhook_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle Meta leadgen webhook body; return counts."""
    created = 0
    duplicates = 0
    skipped = 0
    errors: List[str] = []

    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            if change.get("field") != "leadgen" and "leadgen_id" not in value:
                skipped += 1
                continue
            leadgen_id = str(value.get("leadgen_id") or "").strip()
            if not leadgen_id:
                skipped += 1
                continue
            try:
                result = await ingest_meta_leadgen(leadgen_id, page_id=value.get("page_id") or entry.get("id"))
                if result.get("duplicate"):
                    duplicates += 1
                elif result.get("created"):
                    created += 1
            except HTTPException as exc:
                errors.append(f"{leadgen_id}: {exc.detail}")
            except Exception as err:  # noqa: BLE001
                logger.exception("Meta leadgen ingest failed for %s", leadgen_id)
                errors.append(f"{leadgen_id}: {err}")

    return {"created": created, "duplicates": duplicates, "skipped": skipped, "errors": errors}


async def poll_meta_form_leads(form_id: str, *, limit: int = 25) -> Dict[str, Any]:
    """Backup poller: GET /{form_id}/leads."""
    token = (settings.CRM_META_PAGE_ACCESS_TOKEN or "").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRM_META_PAGE_ACCESS_TOKEN is not configured.",
        )
    url = f"{META_GRAPH_BASE_URL}/{form_id}/leads"
    params = {
        "access_token": token,
        "fields": "id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id",
        "limit": min(max(limit, 1), 50),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await _execute_meta_request_with_retry(client, url, params)
    data = res.json() if res is not None else {}
    if res is None or res.status_code != 200 or "error" in data:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Meta form leads poll failed.")

    created = 0
    duplicates = 0
    for item in data.get("data") or []:
        leadgen_id = str(item.get("id") or "").strip()
        if not leadgen_id:
            continue
        fields = meta_field_data_to_dict(item.get("field_data"))
        result = await ingest_lead(
            fields=fields,
            source_label="meta",
            campaign=item.get("campaign_name") or item.get("ad_name"),
            external_id=f"meta_lead_{leadgen_id}",
            raw_payload={"meta_lead": item, "field_data": fields, "polled_form_id": form_id},
        )
        if result.get("duplicate"):
            duplicates += 1
        elif result.get("created"):
            created += 1
    return {"form_id": form_id, "created": created, "duplicates": duplicates}


async def poll_configured_meta_forms() -> Dict[str, Any]:
    form_ids = [f.strip() for f in (settings.CRM_META_FORM_IDS or "").split(",") if f.strip()]
    if not form_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set CRM_META_FORM_IDS (comma-separated) to poll Meta lead forms.",
        )
    results = []
    for form_id in form_ids:
        results.append(await poll_meta_form_leads(form_id))
    return {"forms": results}



