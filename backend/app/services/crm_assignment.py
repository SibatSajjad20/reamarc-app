"""Shift-aware assignment rules, atomic claim, and lead alerts."""
from __future__ import annotations

import html as html_module
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from pymongo import ReturnDocument

from app.database import get_database
from app.models.attendance import LeaveType
from app.services.attendance_calculator import parse_time_to_minutes
from app.services.attendance_service import (
    get_approved_leave_for_date,
    get_now_pkt,
    get_shift_for_user,
)
from app.services.crm_access import can_assign_leads, is_crm_user
from app.services.workdays import classify_date

logger = logging.getLogger("app.crm.assignment")

METHODS = ("round_robin", "claim", "manual")
CONDITION_FIELDS = ("source", "campaign", "city", "service")
BLOCKING_LEAVE = {
    LeaveType.SICK.value,
    LeaveType.CASUAL.value,
    LeaveType.ANNUAL.value,
    LeaveType.UNPAID.value,
    "sick",
    "casual",
    "annual",
    "unpaid",
}
ENGINE_ACTOR = {"id": "crm_engine", "full_name": "Assignment engine"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable.")
    return db


def serialize_rule(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": doc.get("id"),
        "name": doc.get("name") or "Rule",
        "enabled": bool(doc.get("enabled", True)),
        "priority": int(doc.get("priority") or 100),
        "method": doc.get("method") or "round_robin",
        "pool": list(doc.get("pool") or []),
        "fallback_user_id": doc.get("fallback_user_id"),
        "after_hours": doc.get("after_hours") or "claim",
        "conditions": list(doc.get("conditions") or []),
        "cursor": int(doc.get("cursor") or 0),
        "updated_at": doc.get("updated_at"),
    }


def _in_shift_window(shift: Any, now_pkt: datetime) -> bool:
    if shift is None:
        return False
    start = parse_time_to_minutes(getattr(shift, "start_time", None) or "09:30")
    end = parse_time_to_minutes(getattr(shift, "end_time", None) or "18:30")
    now_m = now_pkt.hour * 60 + now_pkt.minute
    night = bool(getattr(shift, "is_night_shift", False)) or end <= start
    if night:
        return now_m >= start or now_m < end
    return start <= now_m < end


async def is_crm_assignable(user: Dict[str, Any]) -> Tuple[bool, str]:
    """Eligible for new lead ownership right now. Punch status is not a hard skip."""
    if not user or not user.get("is_active", True):
        return False, "inactive"
    if user.get("crm_paused") is True or user.get("crm_enabled") is False:
        return False, "paused"
    if not is_crm_user(user):
        return False, "not_crm"

    now = get_now_pkt()
    today = now.strftime("%Y-%m-%d")
    yesterday = (now.date() - timedelta(days=1)).strftime("%Y-%m-%d")
    uid = user.get("id")
    dept = user.get("department")

    leave = await get_approved_leave_for_date(uid, today)
    if leave:
        lt = str(leave.get("leave_type") or "").lower()
        if lt in BLOCKING_LEAVE:
            return False, "on_leave"

    shift_today = await get_shift_for_user(uid, dept, today)
    if _in_shift_window(shift_today, now):
        return True, "in_shift"

    shift_yday = await get_shift_for_user(uid, dept, yesterday)
    if bool(getattr(shift_yday, "is_night_shift", False)) and _in_shift_window(shift_yday, now):
        return True, "night_shift"

    day = await classify_date(today)
    if day.is_off:
        return False, "off_day"
    return False, "off_shift"


async def _load_users(ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not ids:
        return {}
    db = _db()
    docs = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "hashed_password": 0}).to_list(400)
    return {d.get("id"): d for d in docs if d.get("id")}


async def eligible_from_pool(pool: List[str]) -> List[Dict[str, Any]]:
    users = await _load_users(pool)
    out: List[Dict[str, Any]] = []
    for uid in pool:
        u = users.get(uid)
        if not u:
            continue
        ok, _reason = await is_crm_assignable(u)
        if ok:
            out.append(u)
    return out


def _lead_field(lead: Dict[str, Any], field: str) -> str:
    return str(lead.get(field) or "").strip().lower()


def rule_matches(rule: Dict[str, Any], lead: Dict[str, Any]) -> bool:
    conditions = rule.get("conditions") or []
    if not conditions:
        return True
    for cond in conditions:
        field = str(cond.get("field") or "").strip().lower()
        if field not in CONDITION_FIELDS:
            continue
        op = str(cond.get("op") or "eq").strip().lower()
        raw = cond.get("value")
        actual = _lead_field(lead, field)
        if op == "contains":
            needle = str(raw or "").strip().lower()
            if needle and needle not in actual:
                return False
        elif op == "in":
            if isinstance(raw, list):
                options = [str(v).strip().lower() for v in raw if str(v).strip()]
            else:
                options = [p.strip().lower() for p in str(raw or "").split(",") if p.strip()]
            if actual not in options:
                return False
        else:
            if actual != str(raw or "").strip().lower():
                return False
    return True


async def list_rules() -> List[Dict[str, Any]]:
    db = _db()
    docs = await db.crm_assignment_rules.find({}, {"_id": 0}).sort([("priority", 1), ("name", 1)]).to_list(200)
    return [serialize_rule(d) for d in docs]


async def get_rule(rule_id: str) -> Dict[str, Any]:
    db = _db()
    doc = await db.crm_assignment_rules.find_one({"id": rule_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment rule not found.")
    return serialize_rule(doc)


async def _validate_pool_members(pool: List[str]) -> List[str]:
    """Keep only CRM-eligible active users in assignment pools."""
    cleaned = [str(x) for x in pool if x]
    if not cleaned:
        return []
    users = await _load_users(cleaned)
    return [uid for uid in cleaned if users.get(uid) and is_crm_user(users[uid])]


async def create_rule(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    if not can_assign_leads(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage assignment rules.")
    method = str(payload.get("method") or "round_robin")
    if method not in METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assignment method.")
    now = _now()
    pool = await _validate_pool_members([str(x) for x in (payload.get("pool") or []) if x])
    fallback = payload.get("fallback_user_id") or None
    if fallback:
        fb_users = await _load_users([str(fallback)])
        fb = fb_users.get(str(fallback))
        if not fb or not is_crm_user(fb):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fallback user is not CRM-eligible.")
    doc = {
        "id": f"rule_{uuid.uuid4().hex[:10]}",
        "name": str(payload.get("name") or "Rule").strip()[:80],
        "enabled": bool(payload.get("enabled", True)),
        "priority": int(payload.get("priority") or 100),
        "method": method,
        "pool": pool,
        "fallback_user_id": str(fallback) if fallback else None,
        "after_hours": payload.get("after_hours") or "claim",
        "conditions": [
            c if isinstance(c, dict) else dict(c)
            for c in (payload.get("conditions") or [])
        ],
        "cursor": 0,
        "created_by": user.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    await _db().crm_assignment_rules.insert_one(doc)
    return serialize_rule(doc)


async def update_rule(rule_id: str, payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    if not can_assign_leads(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage assignment rules.")
    await get_rule(rule_id)
    fields: Dict[str, Any] = {"updated_at": _now()}
    if "name" in payload and payload["name"] is not None:
        fields["name"] = str(payload["name"]).strip()[:80]
    if "enabled" in payload and payload["enabled"] is not None:
        fields["enabled"] = bool(payload["enabled"])
    if "priority" in payload and payload["priority"] is not None:
        fields["priority"] = int(payload["priority"])
    if "method" in payload and payload["method"] is not None:
        if payload["method"] not in METHODS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assignment method.")
        fields["method"] = payload["method"]
    if "pool" in payload and payload["pool"] is not None:
        fields["pool"] = await _validate_pool_members([str(x) for x in payload["pool"] if x])
    if "fallback_user_id" in payload:
        fallback = payload.get("fallback_user_id") or None
        if fallback:
            fb_users = await _load_users([str(fallback)])
            fb = fb_users.get(str(fallback))
            if not fb or not is_crm_user(fb):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fallback user is not CRM-eligible.")
            fields["fallback_user_id"] = str(fallback)
        else:
            fields["fallback_user_id"] = None
    if "after_hours" in payload and payload["after_hours"] is not None:
        fields["after_hours"] = payload["after_hours"]
    if "conditions" in payload and payload["conditions"] is not None:
        fields["conditions"] = payload["conditions"]
    await _db().crm_assignment_rules.update_one({"id": rule_id}, {"$set": fields})
    return await get_rule(rule_id)


async def delete_rule(rule_id: str, user: Dict[str, Any]) -> None:
    if not can_assign_leads(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage assignment rules.")
    res = await _db().crm_assignment_rules.delete_one({"id": rule_id})
    if not res.deleted_count:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment rule not found.")


async def _require_crm_assignee(user_id: str) -> Tuple[str, str]:
    """Resolve assignee and enforce CRM eligibility (no client/hr/disabled)."""
    docs = await _load_users([user_id])
    doc = docs.get(user_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found.")
    if not is_crm_user(doc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignee is not CRM-eligible.")
    name = str(doc.get("full_name") or doc.get("name") or doc.get("email") or user_id)
    return user_id, name


def _email_html(body: str, crm_url: str) -> str:
    safe_body = html_module.escape(body or "")
    safe_url = html_module.escape(crm_url, quote=True)
    return f'<p>{safe_body}</p><p><a href="{safe_url}">Open CRM</a></p>'


async def notify_users(user_ids: List[str], title: str, body: str, data: Optional[Dict[str, Any]] = None) -> None:
    ids = [u for u in dict.fromkeys(user_ids) if u]
    if not ids:
        return
    try:
        from app.services.push_service import dispatch_to_users

        await dispatch_to_users(ids, title, body, kind="crm_lead", data=data)
    except Exception as err:
        logger.warning("CRM push failed: %s", err)
    try:
        from app.config import settings
        from app.services.email_service import EmailService

        users = await _load_users(ids)
        crm_url = f"{settings.APP_FRONTEND_URL.rstrip('/')}/crm"
        html = _email_html(body, crm_url)
        for uid in ids:
            email = (users.get(uid) or {}).get("email")
            name = (users.get(uid) or {}).get("full_name") or "there"
            if email:
                await EmailService.send_html_email(email, title, html, recipient_name=name)
    except Exception as err:
        logger.warning("CRM email failed: %s", err)


async def _set_owner(
    lead_id: str,
    user_id: str,
    actor: Dict[str, Any],
    *,
    activity_type: str = "assigned",
    require_unassigned: bool = True,
) -> Dict[str, Any]:
    """Assign ownership. Engine path requires unassigned (claim-safe); managers may reassign."""
    from app.services import crm_leads as crm

    uid, name = await _require_crm_assignee(user_id)
    now = _now()
    db = _db()
    filt: Dict[str, Any] = {"id": lead_id, "outcome": None}
    if require_unassigned:
        filt["assigned_to"] = None
    updated = await db.crm_leads.find_one_and_update(
        filt,
        {
            "$set": {
                "assigned_to": uid,
                "assigned_to_name": name,
                "assigned_at": now,
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        existing = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
        # Concurrent claim/assign won — do not overwrite.
        return crm.serialize_lead(existing)
    updated.pop("_id", None)
    await crm.append_activity(lead_id, activity_type, f"Assigned to {name}.", actor, {"assigned_to": uid})
    await notify_users([uid], "New CRM lead", f"{name}: a lead was assigned to you.", data={"type": "crm_lead", "lead_id": lead_id})
    return crm.serialize_lead(updated)


async def _leave_unassigned_claim(lead: Dict[str, Any], pool: List[str], actor: Dict[str, Any]) -> Dict[str, Any]:
    from app.services import crm_leads as crm

    eligible = await eligible_from_pool(pool)
    notify_ids = [u.get("id") for u in eligible if u.get("id")]
    if not notify_ids:
        from app.services.push_service import get_admin_user_ids

        ops = await _db().users.find(
            {"role": {"$in": ["admin", "operations"]}, "is_active": {"$ne": False}},
            {"id": 1, "_id": 0},
        ).to_list(100)
        notify_ids = [d.get("id") for d in ops if d.get("id")]
        if not notify_ids:
            notify_ids = await get_admin_user_ids()
    await crm.append_activity(
        lead["id"],
        "claim_opened",
        "Left unassigned for claim (no in-shift round-robin winner).",
        actor,
    )
    await notify_users(
        notify_ids,
        "Unassigned CRM lead",
        f"{lead.get('name') or 'A lead'} is in the claim pool.",
        data={"type": "crm_lead", "lead_id": lead["id"]},
    )
    doc = await _db().crm_leads.find_one({"id": lead["id"]}, {"_id": 0})
    return crm.serialize_lead(doc or lead)


async def apply_assignment_engine(lead_id: str, actor: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """First matching enabled rule wins. No-op if already assigned. Claim-safe ownership writes."""
    from app.services import crm_leads as crm

    actor = actor or ENGINE_ACTOR
    db = _db()
    lead = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
    if lead.get("assigned_to") or lead.get("outcome"):
        return crm.serialize_lead(lead)

    rules = await db.crm_assignment_rules.find({"enabled": True}, {"_id": 0}).sort("priority", 1).to_list(200)
    matched = next((r for r in rules if rule_matches(r, lead)), None)
    if not matched:
        return crm.serialize_lead(lead)

    method = matched.get("method") or "round_robin"
    pool = [p for p in (matched.get("pool") or []) if p]
    after_hours = matched.get("after_hours") or "claim"

    if method == "manual":
        fallback = matched.get("fallback_user_id") or (pool[0] if pool else None)
        if fallback:
            return await _set_owner(lead_id, fallback, actor)
        return await _leave_unassigned_claim(lead, pool, actor)

    if method == "claim":
        return await _leave_unassigned_claim(lead, pool, actor)

    # round_robin
    if not pool:
        fallback = matched.get("fallback_user_id")
        if fallback:
            return await _set_owner(lead_id, fallback, actor)
        return await _leave_unassigned_claim(lead, pool, actor)

    users = await _load_users(pool)
    n = len(pool)
    # Atomic cursor ticket: each concurrent ingest gets a unique start index.
    before = await db.crm_assignment_rules.find_one_and_update(
        {"id": matched["id"]},
        {"$inc": {"cursor": 1}, "$set": {"updated_at": _now()}},
        return_document=ReturnDocument.BEFORE,
    )
    start = int((before or matched).get("cursor") or 0) % n
    winner: Optional[str] = None
    for i in range(n):
        idx = (start + i) % n
        uid = pool[idx]
        u = users.get(uid)
        if not u:
            continue
        ok, _reason = await is_crm_assignable(u)
        if ok:
            winner = uid
            break

    if winner:
        return await _set_owner(lead_id, winner, actor)

    if after_hours == "fallback" and matched.get("fallback_user_id"):
        return await _set_owner(lead_id, matched["fallback_user_id"], actor)
    return await _leave_unassigned_claim(lead, pool, actor)


async def claim_lead(lead_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    from app.services import crm_leads as crm

    if not is_crm_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CRM access required.")
    uid = user.get("id")
    name = str(user.get("full_name") or user.get("name") or user.get("email") or "User")
    now = _now()
    db = _db()
    updated = await db.crm_leads.find_one_and_update(
        {"id": lead_id, "assigned_to": None, "outcome": None},
        {
            "$set": {
                "assigned_to": uid,
                "assigned_to_name": name,
                "assigned_at": now,
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        existing = await db.crm_leads.find_one(
            {"id": lead_id},
            {"_id": 0, "outcome": 1},
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
        if existing.get("outcome"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Lead is already closed.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lead is already claimed.",
        )
    updated.pop("_id", None)
    await crm.append_activity(lead_id, "claimed", f"Claimed by {name}.", user, {"assigned_to": uid})
    return crm.serialize_lead(updated)


async def manager_user_ids() -> List[str]:
    docs = await _db().users.find(
        {"role": {"$in": ["admin", "operations"]}, "is_active": {"$ne": False}},
        {"id": 1, "_id": 0},
    ).to_list(100)
    return [d["id"] for d in docs if d.get("id")]


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


async def run_sla_tick() -> Dict[str, int]:
    """15/60 uncontacted nags + due follow-up reminders.

    Two clocks (MVP): nags stop when WhatsApp was opened OR contacted=true.
    Uncontacted badge stays until mark-contacted.
    """
    db = get_database()
    if db is None:
        return {"checked": 0, "n15": 0, "n60": 0, "follow_ups": 0}
    now = datetime.now(timezone.utc)
    cursor = db.crm_leads.find(
        {
            "outcome": None,
            "contacted": {"$ne": True},
            "whatsapp_opened_at": None,
        },
        {"_id": 0},
    )
    leads = await cursor.to_list(500)
    n15 = 0
    n60 = 0
    for lead in leads:
        start = _parse_iso(lead.get("assigned_at") or lead.get("created_at"))
        if not start:
            continue
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        age = (now - start).total_seconds()
        lid = lead.get("id")
        name = lead.get("name") or "A lead"
        if age >= 15 * 60 and not lead.get("sla_15_sent_at"):
            targets = [lead["assigned_to"]] if lead.get("assigned_to") else await manager_user_ids()
            await notify_users(targets, "CRM SLA 15m", f"{name} is still uncontacted.", data={"type": "crm_lead", "lead_id": lid})
            await db.crm_leads.update_one({"id": lid}, {"$set": {"sla_15_sent_at": _now()}})
            n15 += 1
        if age >= 60 * 60 and not lead.get("sla_60_sent_at"):
            await notify_users(await manager_user_ids(), "CRM SLA 60m", f"{name} has been uncontacted for an hour.", data={"type": "crm_lead", "lead_id": lid})
            await db.crm_leads.update_one({"id": lid}, {"$set": {"sla_60_sent_at": _now()}})
            n60 += 1

    follow_ups = await run_follow_up_tick(now)
    return {"checked": len(leads), "n15": n15, "n60": n60, "follow_ups": follow_ups}


async def run_follow_up_tick(now: Optional[datetime] = None) -> int:
    """Nag assignee once when next_follow_up_at is due."""
    db = get_database()
    if db is None:
        return 0
    now = now or datetime.now(timezone.utc)
    now_iso = now.isoformat()
    cursor = db.crm_leads.find(
        {
            "outcome": None,
            "next_follow_up_at": {"$ne": None, "$lte": now_iso},
            "$or": [
                {"follow_up_nagged_at": None},
                {"follow_up_nagged_at": {"$exists": False}},
            ],
        },
        {"_id": 0},
    )
    due = await cursor.to_list(200)
    sent = 0
    for lead in due:
        due_at = _parse_iso(lead.get("next_follow_up_at"))
        if not due_at:
            continue
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        if due_at > now:
            continue
        lid = lead.get("id")
        name = lead.get("name") or "A lead"
        targets = [lead["assigned_to"]] if lead.get("assigned_to") else await manager_user_ids()
        await notify_users(targets, "CRM follow-up due", f"Follow up with {name}.", data={"type": "crm_lead", "lead_id": lid})
        await db.crm_leads.update_one(
            {"id": lid},
            {"$set": {"follow_up_nagged_at": _now(), "updated_at": _now()}},
        )
        sent += 1
    return sent
