"""Expo Push sender + in-app notification feed."""
from datetime import datetime, timezone
from typing import FrozenSet, Iterable, List, Optional
import logging
import uuid

import httpx

from app.database import get_database
from app.services.device_registry import active_devices

logger = logging.getLogger("app.push_service")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def store_notification(
    user_id: str,
    title: str,
    body: str,
    kind: str,
    sender_id: Optional[str] = None,
    sender_name: Optional[str] = None,
    sender_role: Optional[str] = None,
) -> None:
    db = get_database()
    if db is None:
        return
    await db.mobile_notifications.insert_one(
        {
            "id": f"mn_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "title": title,
            "body": body,
            "kind": kind,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "sender_role": sender_role,
            "read": False,
            "created_at": _now_iso(),
        }
    )


async def mark_all_read(user_id: str) -> int:
    db = get_database()
    if db is None:
        return 0
    result = await db.mobile_notifications.update_many(
        {"user_id": user_id, "read": {"$ne": True}},
        {"$set": {"read": True}},
    )
    return int(result.modified_count or 0)


async def clear_all_notifications(user_id: str) -> int:
    db = get_database()
    if db is None:
        return 0
    result = await db.mobile_notifications.delete_many({"user_id": user_id})
    return int(result.deleted_count or 0)


async def list_notifications(user_id: str, limit: int = 50) -> list:
    db = get_database()
    if db is None:
        return []
    docs = (
        await db.mobile_notifications.find({"user_id": user_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(limit)
    )
    return docs


async def send_expo_push(tokens: Iterable[str], title: str, body: str) -> int:
    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "priority": "high",
            "channelId": "reamarc_alerts_v2",
            "_displayInForeground": True,
        }
        for token in tokens
        if token and str(token).startswith("ExponentPushToken")
    ]
    if not messages:
        return 0
    sent = 0
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            for i in range(0, len(messages), 100):
                chunk = messages[i : i + 100]
                resp = await client.post(EXPO_PUSH_URL, json=chunk)
                if resp.status_code >= 400:
                    logger.warning("Expo push HTTP %s: %s", resp.status_code, resp.text[:300])
                    continue
                try:
                    res_json = resp.json()
                    tickets = res_json.get("data") or []
                    for t in tickets:
                        if t.get("status") == "error":
                            logger.warning(
                                f"Expo push ticket error: {t.get('message')} (detail: {t.get('details')})"
                            )
                except Exception:
                    pass
                sent += len(chunk)
    except Exception as err:
        logger.error("Expo push failed: %s", err)
    return sent


async def dispatch_to_users(
    user_ids: Optional[List[str]],
    title: str,
    body: str,
    kind: str = "custom",
    sender_id: Optional[str] = None,
    sender_name: Optional[str] = None,
    sender_role: Optional[str] = None,
) -> dict:
    # Empty list must not fall through to "broadcast all devices" (falsy [] in active_devices).
    if user_ids is not None and len(user_ids) == 0:
        return {
            "sent": 0,
            "skipped": 0,
            "in_app": 0,
            "message": "No recipients.",
        }

    devices = await active_devices(user_ids)
    tokens = []
    device_user_ids = set()
    for dev in devices:
        uid = dev.get("user_id")
        token = (dev.get("push_token") or "").strip()
        if token:
            tokens.append(token)
        if uid:
            device_user_ids.add(uid)

    # Targeted sends: write inbox for every requested user, even without a bound phone.
    if user_ids is not None:
        inbox_ids = list(dict.fromkeys(uid for uid in user_ids if uid))
    else:
        inbox_ids = list(device_user_ids)

    if not inbox_ids and not tokens:
        return {
            "sent": 0,
            "skipped": 0,
            "in_app": 0,
            "message": "No bound phones. The employee must log in on the mobile app first.",
        }

    for uid in inbox_ids:
        await store_notification(
            user_id=uid,
            title=title,
            body=body,
            kind=kind,
            sender_id=sender_id,
            sender_name=sender_name,
            sender_role=sender_role,
        )

    sent = await send_expo_push(tokens, title, body)
    in_app = len(inbox_ids)
    skipped = max(0, in_app - sent)
    return {
        "sent": sent,
        "skipped": skipped,
        "in_app": in_app,
        "message": (
            f"Saved to {in_app} Alerts inbox(es). "
            f"Lock-screen push queued for {sent} device(s). "
            "Expo Go usually cannot show lock-screen pushes — keep the app open and check Alerts."
        ),
    }


async def already_sent(user_id: str, date_str: str, kind: str) -> bool:
    db = get_database()
    if db is None:
        return True
    doc = await db.mobile_push_receipts.find_one(
        {"user_id": user_id, "date": date_str, "kind": kind},
        {"_id": 1},
    )
    return doc is not None


async def mark_sent(user_id: str, date_str: str, kind: str) -> None:
    db = get_database()
    if db is None:
        return
    await db.mobile_push_receipts.update_one(
        {"user_id": user_id, "date": date_str, "kind": kind},
        {
            "$set": {
                "id": f"pr_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "date": date_str,
                "kind": kind,
                "sent_at": _now_iso(),
            }
        },
        upsert=True,
    )


ADMIN_ROLES = frozenset({"admin", "super_admin"})
HR_OPS_ROLES = frozenset({"hr", "operations"})
ATTENDANCE_STAFF_ROLES = frozenset({"hr", "operations", "admin", "super_admin"})


def staff_roles_for_subject(subject_role: Optional[str]) -> Optional[FrozenSet[str]]:
    """
    Which staff roles should receive attendance alerts about this subject.

    - Regular employee → HR + Operations + Admin
    - HR / Operations → Admin only (no peer HR/Ops noise)
    - Admin / super_admin → no staff fan-out
    """
    role = (subject_role or "").strip().lower()
    if role in ADMIN_ROLES:
        return None
    if role in HR_OPS_ROLES:
        return ADMIN_ROLES
    return ATTENDANCE_STAFF_ROLES


async def _user_ids_by_roles(roles: Iterable[str]) -> List[str]:
    db = get_database()
    if db is None:
        return []
    role_list = list(roles)
    if not role_list:
        return []
    cursor = db.users.find(
        {"role": {"$in": role_list}, "is_active": {"$ne": False}},
        {"id": 1, "_id": 0},
    )
    docs = await cursor.to_list(200)
    return [d["id"] for d in docs if d.get("id")]


async def get_hr_and_ops_user_ids() -> List[str]:
    """Fetch user IDs of active HR and Operations users (strictly excluding admin)."""
    return await _user_ids_by_roles(HR_OPS_ROLES)


async def get_admin_user_ids() -> List[str]:
    """Active admin / super_admin user IDs."""
    return await _user_ids_by_roles(ADMIN_ROLES)


async def get_attendance_staff_user_ids() -> List[str]:
    """Active HR + Operations + Admin user IDs for attendance staff alerts."""
    return await _user_ids_by_roles(ATTENDANCE_STAFF_ROLES)


async def resolve_attendance_alert_recipients(
    subject_user_id: Optional[str],
    subject_role: Optional[str],
) -> List[str]:
    """Staff recipients for check-in / check-out / late alerts about subject."""
    roles = staff_roles_for_subject(subject_role)
    if roles is None:
        return []
    recipients = await _user_ids_by_roles(roles)
    if subject_user_id:
        recipients = [uid for uid in recipients if uid != subject_user_id]
    return recipients

