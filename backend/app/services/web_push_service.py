"""Browser Web Push (VAPID). Subscriptions are separate from the one-phone device lock."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from typing import Iterable, Optional
from urllib.parse import urlparse

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid, b64urldecode, b64urlencode
from pywebpush import WebPushException, webpush

from app.config import settings
from app.database import get_database

logger = logging.getLogger("app.web_push")

MAX_SUBSCRIPTIONS_PER_USER = 8
_INDEX_READY = False

# Only these push-service hosts may be contacted. Anything else is treated as SSRF.
_EXACT_PUSH_HOSTS = frozenset(
    {
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
        "notify.windows.com",
    }
)

_ATTENDANCE_KINDS = frozenset(
    {
        "late_checkin",
        "employee_late",
        "pre_shift",
        "checkout",
        "missed_yesterday",
        "missed_punch_inquiry",
        "missed_punch_resolved",
        "attendance_check_in",
        "attendance_check_out",
    }
)


class WebPushConfigError(RuntimeError):
    pass


class InvalidSubscription(ValueError):
    pass


def _b64_bytes(value: str) -> bytes:
    return b64urldecode(value.encode("ascii"))


def validate_push_endpoint(endpoint: str) -> str:
    """Return the endpoint only when it is a known public push service over HTTPS."""
    if not isinstance(endpoint, str):
        raise InvalidSubscription("Invalid push subscription.")
    cleaned = endpoint.strip()
    if len(cleaned) < 20 or len(cleaned) > 4096:
        raise InvalidSubscription("Invalid push subscription.")
    if any(ord(ch) < 33 or ord(ch) == 127 for ch in cleaned):
        raise InvalidSubscription("Invalid push subscription.")
    parsed = urlparse(cleaned)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.fragment:
        raise InvalidSubscription("Invalid push subscription.")
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host or host != (parsed.netloc or "").split("@")[-1].split(":")[0].lower():
        raise InvalidSubscription("Invalid push subscription.")
    port = parsed.port
    if port not in (None, 443):
        raise InvalidSubscription("Invalid push subscription.")
    allowed = host in _EXACT_PUSH_HOSTS or host.endswith(".notify.windows.com")
    if not allowed:
        raise InvalidSubscription("Invalid push subscription.")
    if not parsed.path or parsed.path == "/":
        raise InvalidSubscription("Invalid push subscription.")
    return cleaned


def validate_subscription_keys(p256dh: str, auth: str) -> tuple[str, str]:
    if not isinstance(p256dh, str) or not isinstance(auth, str):
        raise InvalidSubscription("Invalid push subscription.")
    p256dh = p256dh.strip()
    auth = auth.strip()
    if not re.fullmatch(r"[A-Za-z0-9_\-]+", p256dh) or not re.fullmatch(r"[A-Za-z0-9_\-]+", auth):
        raise InvalidSubscription("Invalid push subscription.")
    try:
        point = _b64_bytes(p256dh)
        secret = _b64_bytes(auth)
    except Exception as err:
        raise InvalidSubscription("Invalid push subscription.") from err
    if len(point) != 65 or point[:1] != b"\x04" or len(secret) != 16:
        raise InvalidSubscription("Invalid push subscription.")
    return p256dh, auth


def notification_path(kind: str, data: Optional[dict] = None) -> str:
    """App-relative path only. Never an absolute URL."""
    payload = data or {}
    kind_name = (kind or "").strip().lower()
    data_type = str(payload.get("type") or "").strip().lower()
    if kind_name == "crm_lead" or data_type.startswith("crm"):
        return "/crm"
    if kind_name in _ATTENDANCE_KINDS or kind_name.startswith("leave_") or kind_name.startswith("attendance_"):
        return "/attendance"
    return "/"


def _subject() -> str:
    subject = (settings.VAPID_SUBJECT or "").strip()
    if subject.startswith("mailto:") and "@" in subject[7:]:
        return subject
    if subject.startswith("https://") and " " not in subject:
        return subject
    return ""


def _private_key() -> str:
    return (settings.VAPID_PRIVATE_KEY or "").strip()


def web_push_configured() -> bool:
    return bool(_private_key() and _subject())


def _vapid() -> Vapid:
    try:
        return Vapid.from_string(_private_key())
    except Exception as err:
        raise WebPushConfigError("VAPID private key is invalid.") from err


def public_application_server_key() -> Optional[str]:
    """Uncompressed P-256 public key, base64url, for PushManager.subscribe."""
    if not web_push_configured():
        return None
    try:
        vapid = _vapid()
        raw = vapid.public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    except WebPushConfigError:
        logger.error("Web Push public key could not be derived.")
        return None
    except Exception:
        logger.error("Web Push public key could not be derived.")
        return None
    derived = b64urlencode(raw)
    if isinstance(derived, bytes):
        derived = derived.decode("ascii")
    configured = (settings.VAPID_PUBLIC_KEY or "").strip()
    if configured and configured != derived:
        logger.error("VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY. Refusing to advertise it.")
        return None
    return derived


def _sanitize_user_agent(user_agent: Optional[str]) -> str:
    text = (user_agent or "").replace("\n", " ").replace("\r", " ")
    text = "".join(ch for ch in text if 32 <= ord(ch) < 127)
    return text[:180]


async def _ensure_indexes(db) -> None:
    global _INDEX_READY
    if _INDEX_READY or db is None:
        return
    try:
        await db.web_push_subscriptions.create_index("endpoint", unique=True, name="idx_web_push_endpoint")
        await db.web_push_subscriptions.create_index("user_id", name="idx_web_push_user")
        _INDEX_READY = True
    except Exception as err:
        logger.warning("Web push index creation failed: %s", err)


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


async def upsert_subscription(
    user_id: str,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: Optional[str] = None,
) -> dict:
    endpoint = validate_push_endpoint(endpoint)
    p256dh, auth = validate_subscription_keys(p256dh, auth)
    db = get_database()
    if db is None:
        raise WebPushConfigError("Database is unavailable.")
    await _ensure_indexes(db)
    now = _now_iso()
    await db.web_push_subscriptions.update_one(
        {"endpoint": endpoint},
        {
            "$set": {
                "user_id": user_id,
                "endpoint": endpoint,
                "p256dh": p256dh,
                "auth": auth,
                "user_agent": _sanitize_user_agent(user_agent),
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": f"wp_{uuid.uuid4().hex[:12]}",
                "created_at": now,
            },
        },
        upsert=True,
    )
    owned = (
        await db.web_push_subscriptions.find({"user_id": user_id}, {"_id": 0, "endpoint": 1, "updated_at": 1})
        .sort("updated_at", -1)
        .to_list(50)
    )
    overflow = [doc.get("endpoint") for doc in owned[MAX_SUBSCRIPTIONS_PER_USER:] if doc.get("endpoint")]
    if overflow:
        await db.web_push_subscriptions.delete_many({"user_id": user_id, "endpoint": {"$in": overflow}})
    return {"subscribed": True}


async def remove_subscription(user_id: str, endpoint: str) -> int:
    if not isinstance(endpoint, str) or len(endpoint) > 4096:
        return 0
    db = get_database()
    if db is None:
        return 0
    result = await db.web_push_subscriptions.delete_one(
        {"user_id": user_id, "endpoint": endpoint.strip()}
    )
    return int(getattr(result, "deleted_count", 0) or 0)


async def subscriber_user_ids() -> list[str]:
    db = get_database()
    if db is None:
        return []
    try:
        ids = await db.web_push_subscriptions.distinct("user_id")
    except Exception as err:
        logger.warning("Could not list web push subscribers: %s", err)
        return []
    return [uid for uid in ids if isinstance(uid, str) and uid]


def _deliver_one(subscription: dict, payload: str) -> str:
    """Return ok, gone, or fail. Runs in a worker thread because pywebpush uses requests."""
    endpoint = subscription.get("endpoint") or ""
    try:
        validate_push_endpoint(endpoint)
        p256dh, auth = validate_subscription_keys(
            subscription.get("p256dh") or "",
            subscription.get("auth") or "",
        )
    except InvalidSubscription:
        return "gone"
    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=payload,
            vapid_private_key=_private_key(),
            vapid_claims={"sub": _subject()},
            ttl=12 * 60 * 60,
            timeout=10,
        )
        return "ok"
    except WebPushException as err:
        code = err.status_code
        if code in (404, 410):
            return "gone"
        logger.warning("Web push rejected with HTTP %s", code)
        return "fail"
    except Exception:
        logger.warning("Web push delivery failed")
        return "fail"


async def send_web_push(
    user_ids: Iterable[str],
    title: str,
    body: str,
    kind: str = "custom",
    data: Optional[dict] = None,
) -> int:
    ids = [uid for uid in dict.fromkeys(user_ids) if uid]
    if not ids or not web_push_configured() or public_application_server_key() is None:
        return 0
    db = get_database()
    if db is None:
        return 0
    try:
        subs = await db.web_push_subscriptions.find(
            {"user_id": {"$in": ids}},
            {"_id": 0, "user_id": 1, "endpoint": 1, "p256dh": 1, "auth": 1},
        ).to_list(500)
    except Exception as err:
        logger.warning("Web push lookup failed: %s", err)
        return 0
    if not subs:
        return 0
    payload = json.dumps(
        {
            "title": (title or "Reamarc")[:120],
            "body": (body or "")[:500],
            "path": notification_path(kind, data),
        },
        separators=(",", ":"),
    )
    sent = 0
    for sub in subs:
        try:
            outcome = await asyncio.to_thread(_deliver_one, sub, payload)
        except Exception:
            logger.warning("Web push worker failed")
            continue
        if outcome == "gone":
            await db.web_push_subscriptions.delete_one(
                {"user_id": sub.get("user_id"), "endpoint": sub.get("endpoint")}
            )
        elif outcome == "ok":
            sent += 1
    return sent
