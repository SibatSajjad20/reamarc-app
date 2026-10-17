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


STAFF_ATT_KINDS = frozenset({
    "attendance_check_in", "attendance_check_out", "employee_late",
})
ADMIN_NOTIFICATION_KINDS = frozenset({
    "attendance_check_in", "attendance_check_out", "crm_sla",
})
CRM_KINDS = frozenset({
    "crm_lead", "crm_deal", "crm_sla", "crm_followup", "crm_meeting",
})


def _is_crm_kind(kind: str) -> bool:
    k = (kind or "").strip().lower()
    return k in CRM_KINDS or k.startswith("crm")


def _is_blocked_crm_kind(kind: str) -> bool:
    """Sales pipeline alerts other than the 60-minute uncontacted SLA are suppressed."""
    k = (kind or "").strip().lower()
    return _is_crm_kind(k) and k != "crm_sla"


async def filter_allowed_recipients(user_ids: List[str], kind: str) -> List[str]:
    """Filters recipient user IDs based on effective access and tracking switches for notification kind."""
    if not user_ids:
        return []
    k = (kind or "").strip().lower()
    if _is_blocked_crm_kind(k):
        return []

    db = get_database()
    if db is None:
        return user_ids

    from app.services.access import is_tracked, effective_access

    employee_att_kinds = {
        "late_checkin", "pre_shift", "checkout", "missed_yesterday",
        "missed_punch_inquiry", "missed_punch_resolved", "attendance_reminder",
    }
    log_kinds = {
        "daily_log", "daily_log_reminder", "log_reminder", "log_exception_followup",
    }
    content_kinds = {
        "content_calendar",
    }
    website_kinds = {
        "website_task_due", "website_task_overdue", "website_review_requested",
        "website_stage_completed", "website_task_assigned", "website_client_feedback",
        "website_task_comment", "website_client_approval", "website_file_uploaded",
        "website_project", "revision",
    }
    ads_kinds = {
        "marketing", "ads",
    }

    req_module = None
    req_tracking = None
    if k in employee_att_kinds:
        req_tracking = "attendance"
    elif k in log_kinds:
        req_tracking = "daily_log"
    elif _is_crm_kind(k):
        req_module = "sales"
    elif k in content_kinds or k.startswith("content_calendar"):
        req_module = "content_calendar"
    elif k in website_kinds or k.startswith("website_"):
        req_module = "website"
    elif k in ads_kinds:
        req_module = "ads"

    users_cursor = db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "hashed_password": 0})
    users_list = await users_cursor.to_list(len(user_ids))
    user_map = {u.get("id"): u for u in users_list if u.get("id")}

    classified = bool(req_module or req_tracking or k in STAFF_ATT_KINDS)

    allowed = []
    for uid in user_ids:
        u = user_map.get(uid)
        if not u:
            continue
        role = str(u.get("role") or "").lower()
        if role in ("admin", "super_admin"):
            if k in ADMIN_NOTIFICATION_KINDS:
                allowed.append(uid)
            continue
        if not classified:
            allowed.append(uid)
            continue
        if k in STAFF_ATT_KINDS:
            if role in ("hr", "operations", "team_lead", "lead"):
                allowed.append(uid)
                continue
            if effective_access(u)["modules"].get("attendance"):
                allowed.append(uid)
                continue
        if req_tracking:
            if not is_tracked(u, req_tracking):
                continue
        if req_module:
            if role == "client" and req_module in ("website", "content_calendar"):
                pass
            elif not effective_access(u)["modules"].get(req_module):
                continue
        allowed.append(uid)
    return allowed


async def store_notification(
    user_id: str,
    title: str,
    body: str,
    kind: str,
    sender_id: Optional[str] = None,
    sender_name: Optional[str] = None,
    sender_role: Optional[str] = None,
    data: Optional[dict] = None,
) -> None:
    db = get_database()
    if db is None:
        return
    allowed = await filter_allowed_recipients([user_id], kind)
    if not allowed:
        return

    payload_data = dict(data or {})
    cid = payload_data.get("company_id")
    cname = payload_data.get("company_name")
    if not cid:
        from app.core.tenant import get_tenant_context, get_global_db
        ctx = get_tenant_context()
        if ctx and ctx.company_id:
            cid = ctx.company_id
            payload_data["company_id"] = cid
            gdb = get_global_db()
            if gdb is not None and not cname:
                cdoc = await gdb.companies.find_one({"id": cid})
                if cdoc:
                    cname = cdoc.get("name")
                    payload_data["company_name"] = cname

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
            "data": payload_data,
            "company_id": cid,
            "company_name": cname,
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


async def mark_one_read(user_id: str, notification_id: str) -> int:
    db = get_database()
    if db is None:
        return 0
    result = await db.mobile_notifications.update_one(
        {"user_id": user_id, "id": notification_id},
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

    # Transparent migration of any orphaned records in db.notifications for this user
    try:
        orphan_docs = await db.notifications.find({"user_id": user_id}).to_list(100)
        if orphan_docs:
            for od in orphan_docs:
                await store_notification(
                    user_id=user_id,
                    title=od.get("title") or "Notification",
                    body=od.get("message") or od.get("body") or "",
                    kind="admin_alert",
                    data={"missing_dates": od.get("missing_dates")} if "missing_dates" in od else {},
                )
            await db.notifications.delete_many({"user_id": user_id})
    except Exception as e:
        logger.warning(f"Error checking legacy notifications: {e}")

    docs = (
        await db.mobile_notifications.find({"user_id": user_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(max(limit * 4, 50))
    )
    allowed_kinds = set()
    denied_kinds = set()
    visible = []
    for doc in docs:
        kind = str(doc.get("kind") or "")
        if kind in denied_kinds:
            continue
        if kind not in allowed_kinds:
            permitted = await filter_allowed_recipients([user_id], kind)
            if user_id in permitted:
                allowed_kinds.add(kind)
            else:
                denied_kinds.add(kind)
                continue
        visible.append(doc)
        if len(visible) >= limit:
            break
    return visible


async def send_expo_push(tokens: Iterable[str], title: str, body: str, data: Optional[dict] = None) -> int:
    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "priority": "high",
            "channelId": "reamarc_alerts_v2",
            "_displayInForeground": True,
            **({"data": data} if data else {}),
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
    data: Optional[dict] = None,
) -> dict:
    if user_ids is not None:
        user_ids = await filter_allowed_recipients(user_ids, kind)

    # Empty list must not fall through to "broadcast all devices" (falsy [] in active_devices).
    if user_ids is not None and len(user_ids) == 0:
        return {
            "sent": 0,
            "skipped": 0,
            "in_app": 0,
            "web_sent": 0,
            "message": "No recipients.",
        }

    payload_data = dict(data or {})
    from app.core.tenant import get_tenant_context, get_global_db
    ctx = get_tenant_context()
    if ctx and ctx.company_id:
        payload_data.setdefault("company_id", ctx.company_id)
        gdb = get_global_db()
        if gdb is not None and "company_name" not in payload_data:
            cdoc = await gdb.companies.find_one({"id": ctx.company_id})
            if cdoc:
                payload_data.setdefault("company_name", cdoc.get("name"))
    data = payload_data

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

    from app.services.web_push_service import send_web_push, subscriber_user_ids

    browser_user_ids: List[str] = []
    if user_ids is None:
        browser_user_ids = await subscriber_user_ids()

    # Targeted sends: write inbox for every requested user, even without a bound phone.
    if user_ids is not None:
        inbox_ids = list(dict.fromkeys(uid for uid in user_ids if uid))
    else:
        inbox_ids = list(dict.fromkeys([*device_user_ids, *browser_user_ids]))

    if not inbox_ids and not tokens:
        return {
            "sent": 0,
            "skipped": 0,
            "in_app": 0,
            "web_sent": 0,
            "message": "No recipients. The employee must open the mobile app or allow browser notifications.",
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
            data=data,
        )

    sent = await send_expo_push(tokens, title, body, data=data)
    web_targets = inbox_ids if user_ids is not None else browser_user_ids
    try:
        web_sent = await send_web_push(web_targets, title, body, kind=kind, data=data)
    except Exception as err:
        logger.warning("Web push dispatch failed: %s", err)
        web_sent = 0
    in_app = len(inbox_ids)
    skipped = max(0, in_app - sent)
    return {
        "sent": sent,
        "skipped": skipped,
        "in_app": in_app,
        "web_sent": web_sent,
        "message": (
            f"Saved to {in_app} inbox(es). "
            f"Phone push queued for {sent} device(s). "
            f"Browser push queued for {web_sent}."
        ),
    }


async def try_claim_scheduled_push(user_id: str, date_str: str, kind: str) -> bool:
    """
    Atomically claims a scheduled push for (user_id, date, kind).
    Prevents duplicate dispatches when multiple server workers run the reminder tick.
    Returns True if successfully claimed by this worker, False if already claimed.
    """
    db = get_database()
    if db is None:
        return False
    try:
        await db.mobile_push_receipts.insert_one(
            {
                "id": f"pr_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "date": date_str,
                "kind": kind,
                "sent_at": _now_iso(),
            }
        )
        return True
    except Exception:
        # DuplicateKeyError or existing entry
        return False


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


async def get_team_lead_user_ids_for_member(
    subject_user_id: str,
    subject_user: Optional[dict] = None,
) -> List[str]:
    """Finds active team leads whose department overlaps with the subject employee."""
    db = get_database()
    if db is None or not subject_user_id:
        return []

    if subject_user is None:
        subject_user = await db.users.find_one({"id": subject_user_id}, {"_id": 0, "hashed_password": 0})
    if not subject_user:
        return []

    from app.services.access import (
        normalize_role,
        normalize_dept,
        get_user_primary_department,
        parse_user_departments,
    )

    sub_role = normalize_role(subject_user.get("role"))
    # Only regular team members report to team leads
    if sub_role not in ("team_member", "member"):
        return []

    sub_primary = normalize_dept(get_user_primary_department(subject_user))
    sub_depts = {normalize_dept(d) for d in parse_user_departments(subject_user) if d}
    if sub_primary:
        sub_depts.add(sub_primary)
    sub_depts = {d for d in sub_depts if d}
    if not sub_depts:
        return []

    leads_cursor = db.users.find(
        {
            "role": {"$in": ["team_lead", "lead", "TEAM_LEAD"]},
            "is_active": {"$ne": False},
        },
        {"_id": 0, "hashed_password": 0},
    )
    leads = await leads_cursor.to_list(100)

    matched_lead_ids: List[str] = []
    for lead in leads:
        lead_id = lead.get("id")
        if not lead_id or lead_id == subject_user_id:
            continue
        lead_primary = normalize_dept(get_user_primary_department(lead))
        lead_depts = {normalize_dept(d) for d in parse_user_departments(lead) if d}
        if lead_primary:
            lead_depts.add(lead_primary)
        lead_depts = {d for d in lead_depts if d}

        if lead_depts & sub_depts:
            matched_lead_ids.append(lead_id)

    return matched_lead_ids


async def resolve_attendance_alert_recipients(
    subject_user_id: Optional[str],
    subject_role: Optional[str],
    subject_user: Optional[dict] = None,
) -> List[str]:
    """Staff recipients for check-in / check-out / late alerts about subject."""
    roles = staff_roles_for_subject(subject_role)
    if roles is None:
        return []
    recipients = await _user_ids_by_roles(roles)

    # Fan out to department team leads when subject is a team member
    if subject_user_id:
        team_leads = await get_team_lead_user_ids_for_member(subject_user_id, subject_user)
        recipients.extend(team_leads)

    if subject_user_id:
        recipients = [uid for uid in dict.fromkeys(recipients) if uid != subject_user_id]
    return recipients


