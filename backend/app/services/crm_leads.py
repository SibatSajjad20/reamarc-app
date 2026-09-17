"""CRM lead store, timeline, and Phase 1 manual assignment."""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from pymongo import ReturnDocument

from app.database import get_database
from app.schemas.crm import (
    DISQUALIFY_REASONS,
    OPEN_STAGES,
    OUTCOMES,
    CrmLeadCreate,
    CrmLeadUpdate,
)
from app.services.crm_access import can_assign_leads, can_manage_outcomes, can_view_all_leads, visibility_filter
from app.services.crm_phone import normalize_phone_e164, wa_me_url

logger = logging.getLogger("app.crm")

DEFAULT_STAGES = [
    {"id": "new", "name": "New", "order": 1},
    {"id": "contacted", "name": "Contacted", "order": 2},
    {"id": "qualified", "name": "Qualified", "order": 3},
    {"id": "session_booked", "name": "Meeting Booked", "order": 4},
    {"id": "session_done", "name": "Meeting Completed", "order": 5},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable.")
    return db


def _actor_name(user: Dict[str, Any]) -> str:
    return str(user.get("full_name") or user.get("name") or user.get("email") or "User")


def serialize_lead(doc: Dict[str, Any]) -> Dict[str, Any]:
    e164 = doc.get("phone_e164")
    valid = bool(doc.get("phone_valid"))
    return {
        "id": doc.get("id"),
        "name": doc.get("name") or "",
        "company": doc.get("company"),
        "website": doc.get("website"),
        "email": doc.get("email"),
        "phone_raw": doc.get("phone_raw"),
        "phone_e164": e164,
        "phone_valid": valid,
        "wa_url": wa_me_url(e164) if valid else None,
        "city": doc.get("city"),
        "service": doc.get("service"),
        "budget": doc.get("budget"),
        "source": doc.get("source") or "manual",
        "campaign": doc.get("campaign"),
        "stage": doc.get("stage") or "new",
        "outcome": doc.get("outcome"),
        "disqualify_reason": doc.get("disqualify_reason"),
        "lost_reason": doc.get("lost_reason"),
        "approval_status": doc.get("approval_status"),
        "payment_cleared": bool(doc.get("payment_cleared")),
        "proposal_config": doc.get("proposal_config"),
        "deals": doc.get("deals") or [],
        "deals_count": int(doc.get("deals_count") or 0),
        "total_deal_value": float(doc.get("total_deal_value") or 0.0),
        "assigned_to": doc.get("assigned_to"),
        "assigned_to_name": doc.get("assigned_to_name"),
        "assigned_at": doc.get("assigned_at"),
        "contacted": bool(doc.get("contacted")),
        "contacted_at": doc.get("contacted_at"),
        "whatsapp_opened_at": doc.get("whatsapp_opened_at"),
        "last_activity_at": doc.get("last_activity_at"),
        "next_follow_up_at": doc.get("next_follow_up_at"),
        "tags": doc.get("tags") or [],
        "converted_workspace_id": doc.get("converted_workspace_id"),
        "created_by": doc.get("created_by"),
        "created_at": doc.get("created_at") or "",
        "updated_at": doc.get("updated_at") or "",
        "attribution": doc.get("attribution"),
        "meeting": doc.get("meeting"),
        "custom_fields": doc.get("custom_fields") or {},
    }


def serialize_activity(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": doc.get("id"),
        "lead_id": doc.get("lead_id"),
        "type": doc.get("type"),
        "body": doc.get("body") or "",
        "actor_id": doc.get("actor_id"),
        "actor_name": doc.get("actor_name"),
        "created_at": doc.get("created_at") or "",
        "meta": doc.get("meta") or {},
    }


async def ensure_default_pipeline() -> Dict[str, Any]:
    db = _db()
    existing = await db.crm_pipeline.find_one({"id": "default"}, {"_id": 0})
    lead_stage_ids = {s["id"] for s in DEFAULT_STAGES}
    if existing:
        stages = existing.get("stages") or []
        needs_update = False
        cleaned: List[Dict[str, Any]] = []
        for s in stages:
            sid = s.get("id")
            # Drop legacy commercial stages now owned by the deal pipeline
            if sid in ("proposal_sent", "negotiation"):
                needs_update = True
                continue
            if sid == "session_booked" and s.get("name") != "Meeting Booked":
                s = {**s, "name": "Meeting Booked"}
                needs_update = True
            elif sid == "session_done" and s.get("name") != "Meeting Completed":
                s = {**s, "name": "Meeting Completed"}
                needs_update = True
            if sid in lead_stage_ids:
                cleaned.append(s)
            else:
                needs_update = True
        # Ensure all default stages exist
        have = {s.get("id") for s in cleaned}
        for s in DEFAULT_STAGES:
            if s["id"] not in have:
                cleaned.append(dict(s))
                needs_update = True
        cleaned.sort(key=lambda x: int(x.get("order") or 99))
        if needs_update or cleaned != stages:
            await db.crm_pipeline.update_one(
                {"id": "default"},
                {"$set": {"stages": cleaned, "updated_at": _now()}},
            )
            existing["stages"] = cleaned
        return existing
    doc = {"id": "default", "stages": DEFAULT_STAGES, "updated_at": _now()}
    await db.crm_pipeline.insert_one(doc)
    return doc


async def append_activity(
    lead_id: str,
    activity_type: str,
    body: str,
    actor: Optional[Dict[str, Any]] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    db = _db()
    now = _now()
    doc = {
        "id": f"act_{uuid.uuid4().hex[:12]}",
        "lead_id": lead_id,
        "type": activity_type,
        "body": body,
        "actor_id": (actor or {}).get("id"),
        "actor_name": _actor_name(actor) if actor else None,
        "created_at": now,
        "meta": meta or {},
    }
    await db.crm_activities.insert_one(doc)
    await db.crm_leads.update_one(
        {"id": lead_id},
        {"$set": {"last_activity_at": now, "updated_at": now}},
    )
    return doc


async def _user_label(user_id: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not user_id:
        return None, None
    db = _db()
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "full_name": 1, "name": 1, "email": 1})
    if not doc:
        return user_id, None
    return user_id, str(doc.get("full_name") or doc.get("name") or doc.get("email") or user_id)


def _assert_can_see(user: Dict[str, Any], lead: Dict[str, Any]) -> None:
    if can_view_all_leads(user):
        return
    uid = user.get("id")
    if lead.get("assigned_to") in (None, uid):
        return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")


async def attach_deals_to_leads(leads_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not leads_list:
        return leads_list
    from app.services.crm_deals import serialize_deal

    db = _db()
    lead_ids = [l["id"] for l in leads_list if l.get("id")]
    cursor = db.crm_deals.find({"lead_id": {"$in": lead_ids}}, {"_id": 0})
    all_deals = await cursor.to_list(1000)
    deals_by_lead: Dict[str, List[Dict[str, Any]]] = {}
    for d in all_deals:
        lid = d.get("lead_id")
        if lid not in deals_by_lead:
            deals_by_lead[lid] = []
        deals_by_lead[lid].append(serialize_deal(d))
    for lead in leads_list:
        lid = lead.get("id")
        dlist = deals_by_lead.get(lid, [])
        lead["deals"] = dlist
        lead["deals_count"] = len(dlist)
        lead["total_deal_value"] = sum(float(x.get("value") or 0.0) for x in dlist if x.get("status") == "open")
    return leads_list


async def get_lead_or_404(lead_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    db = _db()
    doc = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
    _assert_can_see(user, doc)
    deals = await db.crm_deals.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    from app.services.crm_deals import serialize_deal

    serialized_deals = [serialize_deal(d) for d in deals]
    doc["deals"] = serialized_deals
    doc["deals_count"] = len(serialized_deals)
    doc["total_deal_value"] = sum(float(x.get("value") or 0.0) for x in serialized_deals if x.get("status") == "open")
    return doc


async def list_assignees() -> List[Dict[str, Any]]:
    from app.services.crm_access import is_crm_user

    db = _db()
    cursor = db.users.find(
        {"is_active": {"$ne": False}, "role": {"$nin": ["client", "hr"]}},
        {"_id": 0, "hashed_password": 0},
    )
    users = await cursor.to_list(400)
    out = []
    for u in users:
        if not is_crm_user(u):
            continue
        out.append(
            {
                "id": u.get("id"),
                "full_name": u.get("full_name") or u.get("name") or u.get("email") or "User",
                "email": u.get("email") or "",
                "role": u.get("role") or "team_member",
                "department": u.get("department"),
            }
        )
    out.sort(key=lambda r: (r.get("full_name") or "").lower())
    return out


async def list_leads(
    user: Dict[str, Any],
    *,
    search: Optional[str] = None,
    stage: Optional[str] = None,
    assigned_to: Optional[str] = None,
    include_junk: bool = False,
    uncontacted: Optional[bool] = None,
    limit: int = 200,
    skip: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    db = _db()
    clauses: List[Dict[str, Any]] = []
    vis = visibility_filter(user)
    if vis:
        clauses.append(vis)
    if not include_junk:
        clauses.append({"outcome": {"$ne": "disqualified"}})
    if stage:
        clauses.append({"stage": stage})
    if assigned_to == "unassigned":
        clauses.append({"assigned_to": None})
    elif assigned_to:
        clauses.append({"assigned_to": assigned_to})
    if uncontacted is True:
        clauses.append({"contacted": {"$ne": True}})
        clauses.append({"outcome": None})
    if search and search.strip():
        raw_q = search.strip()
        if len(raw_q) > 120:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Search term too long.")
        # Escape so user input is literal — prevents ReDoS / regex injection.
        q = re.escape(raw_q)
        clauses.append(
            {
                "$or": [
                    {"name": {"$regex": q, "$options": "i"}},
                    {"company": {"$regex": q, "$options": "i"}},
                    {"email": {"$regex": q, "$options": "i"}},
                    {"phone_raw": {"$regex": q, "$options": "i"}},
                    {"phone_e164": {"$regex": q, "$options": "i"}},
                ]
            }
        )
    query: Dict[str, Any] = {"$and": clauses} if clauses else {}

    total = await db.crm_leads.count_documents(query)
    cursor = (
        db.crm_leads.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(max(skip, 0))
        .limit(min(max(limit, 1), 500))
    )
    docs = await cursor.to_list(500)
    serialized = [serialize_lead(d) for d in docs]
    await attach_deals_to_leads(serialized)
    return serialized, total


async def lead_counts(user: Dict[str, Any]) -> Dict[str, Any]:
    db = _db()
    vis = visibility_filter(user)
    base: Dict[str, Any] = dict(vis or {})
    open_q = {**base, "outcome": None}
    incoming = await db.crm_leads.count_documents(open_q)
    assigned = await db.crm_leads.count_documents({**open_q, "assigned_to": {"$ne": None}})
    uncontacted = await db.crm_leads.count_documents({**open_q, "contacted": {"$ne": True}})
    opened_not_confirmed = await db.crm_leads.count_documents(
        {**open_q, "contacted": {"$ne": True}, "whatsapp_opened_at": {"$ne": None}}
    )
    won_q = {**base, "outcome": "won"}
    won = await db.crm_leads.count_documents(won_q)
    lost = await db.crm_leads.count_documents({**base, "outcome": "lost"})
    closed = won + lost
    win_rate = round((won / closed) * 100.0, 1) if closed else None

    contacted_under_15m = 0
    cursor = db.crm_leads.find(
        {**open_q, "contacted": True, "contacted_at": {"$ne": None}, "created_at": {"$ne": None}},
        {"_id": 0, "created_at": 1, "contacted_at": 1},
    )
    for row in await cursor.to_list(2000):
        try:
            created = datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
            contacted = datetime.fromisoformat(str(row["contacted_at"]).replace("Z", "+00:00"))
            if (contacted - created).total_seconds() <= 15 * 60:
                contacted_under_15m += 1
        except (TypeError, ValueError, KeyError):
            continue

    return {
        "incoming": incoming,
        "assigned": assigned,
        "uncontacted": uncontacted,
        "opened_not_confirmed": opened_not_confirmed,
        "contacted_under_15m": contacted_under_15m,
        "won": won,
        "lost": lost,
        "win_rate": win_rate,
    }


async def create_lead(payload: CrmLeadCreate, user: Dict[str, Any]) -> Dict[str, Any]:
    db = _db()
    now = _now()
    e164, valid = normalize_phone_e164(payload.phone)
    assigned_to = payload.assigned_to
    assigned_name = None
    if assigned_to:
        if not can_assign_leads(user) and assigned_to != user.get("id"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign leads to others.")
        from app.services.crm_access import is_crm_user

        assignee = await db.users.find_one({"id": assigned_to}, {"_id": 0, "hashed_password": 0})
        if not assignee or not is_crm_user(assignee):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignee is not CRM-eligible.")
        assigned_to = assignee.get("id")
        assigned_name = str(assignee.get("full_name") or assignee.get("name") or assignee.get("email") or assigned_to)
    elif not can_view_all_leads(user):
        assigned_to, assigned_name = user.get("id"), _actor_name(user)

    if e164:
        existing = await db.crm_leads.find_one(
            {"phone_e164": e164, "outcome": None},
            {"_id": 0},
        )
        if existing:
            await append_activity(
                existing["id"],
                "note",
                f"New lead '{payload.name.strip()}' created with matching phone number.",
                user,
                {"source": payload.source},
            )

    doc = {
        "id": f"ld_{uuid.uuid4().hex[:12]}",
        "name": payload.name.strip(),
        "company": (payload.company or "").strip() or None,
        "website": (payload.website or "").strip() or None,
        "email": (payload.email or "").strip().lower() or None,
        "phone_raw": (payload.phone or "").strip() or None,
        "phone_e164": e164,
        "phone_valid": valid,
        "city": (payload.city or "").strip() or None,
        "service": (payload.service or "").strip() or None,
        "budget": (payload.budget or "").strip() or None,
        "source": (payload.source or "manual").strip().lower(),
        "campaign": (payload.campaign or "").strip() or None,
        "stage": "new",
        "outcome": None,
        "disqualify_reason": None,
        "assigned_to": assigned_to,
        "assigned_to_name": assigned_name,
        "assigned_at": now if assigned_to else None,
        "contacted": False,
        "contacted_at": None,
        "whatsapp_opened_at": None,
        "last_activity_at": now,
        "next_follow_up_at": payload.next_follow_up_at,
        "tags": payload.tags or [],
        "custom_fields": {},
        "raw_payload": {},
        "converted_workspace_id": None,
        "created_by": user.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    # Omit external_id when absent — Mongo unique indexes treat null as a real key.
    await db.crm_leads.insert_one(doc)
    await append_activity(doc["id"], "created", f"Lead created from {doc['source']}.", user)
    if assigned_to:
        await append_activity(
            doc["id"],
            "assigned",
            f"Assigned to {assigned_name}.",
            user,
            {"assigned_to": assigned_to},
        )
        from app.services.crm_assignment import notify_users

        await notify_users([assigned_to], "New CRM lead", f"A lead was assigned to {assigned_name}.")
    else:
        from app.services.crm_assignment import apply_assignment_engine

        await apply_assignment_engine(doc["id"], actor=user)
    if payload.note:
        await append_activity(doc["id"], "note", payload.note.strip(), user)
    fresh = await db.crm_leads.find_one({"id": doc["id"]}, {"_id": 0})
    return serialize_lead(fresh or doc)


async def update_lead(lead_id: str, payload: CrmLeadUpdate, user: Dict[str, Any]) -> Dict[str, Any]:
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    dumped = payload.model_dump(exclude_unset=True)
    if not dumped:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update.")

    fields: Dict[str, Any] = {}
    if "phone" in dumped:
        raw = dumped.pop("phone")
        e164, valid = normalize_phone_e164(raw)
        fields["phone_raw"] = (raw or "").strip() or None
        fields["phone_e164"] = e164
        fields["phone_valid"] = valid
    if "stage" in dumped:
        stage = dumped.pop("stage")
        if stage not in OPEN_STAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown pipeline stage.")
        if lead.get("outcome"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change stage of a closed lead via update. Use the /reopen endpoint.",
            )
        fields["stage"] = stage
        if stage != lead.get("stage"):
            await append_activity(
                lead_id,
                "stage_changed",
                f"Stage moved {lead.get('stage')} → {stage}.",
                user,
                {"from": lead.get("stage"), "to": stage},
            )
    for key in (
        "name", "email", "company", "website", "city", "service", "budget", "source", "campaign",
        "tags", "next_follow_up_at", "proposal_config",
    ):
        if key in dumped:
            val = dumped[key]
            if key == "email" and isinstance(val, str):
                val = val.strip().lower() or None
            elif isinstance(val, str) and key not in ("tags", "proposal_config"):
                val = val.strip() or None
            fields[key] = val
    fields["updated_at"] = _now()
    await db.crm_leads.update_one({"id": lead_id}, {"$set": fields})
    fresh = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    return serialize_lead(fresh or lead)


async def assign_lead(lead_id: str, target_user_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    if not can_assign_leads(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot assign leads.")
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    if lead.get("outcome") and not can_manage_outcomes(user):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Closed leads cannot be reassigned.")
    from app.services.crm_access import is_crm_user

    assignee = await db.users.find_one({"id": target_user_id}, {"_id": 0, "hashed_password": 0})
    if not assignee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found.")
    if not is_crm_user(assignee):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignee is not CRM-eligible.")
    uid = assignee.get("id")
    name = str(assignee.get("full_name") or assignee.get("name") or assignee.get("email") or uid)
    now = _now()
    prev = lead.get("assigned_to")
    # Update assignee
    update_q: Dict[str, Any] = {"id": lead_id}
    if not can_manage_outcomes(user):
        update_q["outcome"] = None
    updated = await db.crm_leads.find_one_and_update(
        update_q,
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Closed leads cannot be reassigned.")
    updated.pop("_id", None)
    kind = "reassigned" if prev and prev != uid else "assigned"
    await append_activity(lead_id, kind, f"Assigned to {name}.", user, {"assigned_to": uid, "previous": prev})
    from app.services.crm_assignment import notify_users

    await notify_users([uid], "New CRM lead", f"A lead was assigned to {name}.")
    return serialize_lead(updated)


async def set_outcome(lead_id: str, outcome: str, user: Dict[str, Any], *, reason: Optional[str] = None, note: Optional[str] = None) -> Dict[str, Any]:
    if outcome not in OUTCOMES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid outcome.")
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    now = _now()

    if outcome == "won":
        # Opportunity created — does not immediately create workspace
        fields: Dict[str, Any] = {
            "outcome": "won",
            "disqualify_reason": None,
            "lost_reason": None,
            "approval_status": "pending_operations",
            "payment_cleared": False,
            "updated_at": now,
        }
        await db.crm_leads.update_one({"id": lead_id}, {"$set": fields})
        await append_activity(
            lead_id,
            "outcome_set",
            "Opportunity created (Pending Operations Approval & Payment Clearance).",
            user,
            {"outcome": "won", "approval_status": "pending_operations"},
        )
        if note:
            await append_activity(lead_id, "note", note.strip(), user)
        fresh = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
        return serialize_lead(fresh or lead)

    if outcome in ("lost", "disqualified") and not can_manage_outcomes(user):
        if outcome == "lost":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can mark a lead as lost.")
    fields = {"outcome": outcome, "updated_at": now}
    if outcome == "disqualified":
        reason_val = (reason or "spam").lower()
        if reason_val not in DISQUALIFY_REASONS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid disqualify reason.")
        fields["disqualify_reason"] = reason_val
        fields["lost_reason"] = None
    elif outcome == "lost":
        from app.schemas.crm import LEAD_LOST_REASONS

        reason_val = (reason or "").strip().lower()
        if reason_val not in LEAD_LOST_REASONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Lost reason required. Expected one of: {', '.join(LEAD_LOST_REASONS)}",
            )
        fields["lost_reason"] = reason_val
        fields["disqualify_reason"] = None
    else:
        fields["disqualify_reason"] = None
        fields["lost_reason"] = None
    await db.crm_leads.update_one({"id": lead_id}, {"$set": fields})
    label = outcome if outcome != "disqualified" else f"disqualified ({fields.get('disqualify_reason')})"
    if outcome == "lost":
        label = f"lost ({fields.get('lost_reason')})"
    await append_activity(lead_id, "outcome_set", f"Marked {label}.", user, {"outcome": outcome, "reason": fields.get("lost_reason") or fields.get("disqualify_reason")})
    if note:
        await append_activity(lead_id, "note", note.strip(), user)
    fresh = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    return serialize_lead(fresh or lead)


def _workspace_initials(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()[:2]
    cleaned = "".join(ch for ch in name if ch.isalnum())
    return (cleaned[:2] or "CL").upper()


async def convert_to_workspace(
    lead_id: str,
    user: Dict[str, Any],
    *,
    workspace_id: Optional[str] = None,
    note: Optional[str] = None,
    preferred_deal_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Mark lead Won and create/link an Active Client workspace.

    Prefers fields from the won deal (preferred_deal_id or latest won deal),
    then falls back to lead.proposal_config for legacy data.
    """
    if not can_manage_outcomes(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only operations and admins can convert a lead to a workspace.")
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    if lead.get("outcome") == "won" and lead.get("converted_workspace_id"):
        return serialize_lead(lead)

    now = _now()
    ws_id = (workspace_id or "").strip() or None
    created_new = False

    # Resolve commercial + workspace draft from deal first, then proposal_config
    deal_doc: Optional[Dict[str, Any]] = None
    if preferred_deal_id:
        deal_doc = await db.crm_deals.find_one({"id": preferred_deal_id, "lead_id": lead_id}, {"_id": 0})
    if not deal_doc:
        won_cursor = db.crm_deals.find({"lead_id": lead_id, "status": "won"}, {"_id": 0}).sort("updated_at", -1).limit(1)
        won_list = await won_cursor.to_list(1)
        deal_doc = won_list[0] if won_list else None
    if not deal_doc:
        any_cursor = db.crm_deals.find({"lead_id": lead_id}, {"_id": 0}).sort("updated_at", -1).limit(1)
        any_list = await any_cursor.to_list(1)
        deal_doc = any_list[0] if any_list else None

    p_conf = lead.get("proposal_config") or {}
    if deal_doc:
        from app.services.crm_deals import proposal_config_from_deal

        p_conf = {**p_conf, **{k: v for k, v in proposal_config_from_deal(deal_doc).items() if v is not None}}

    if ws_id:
        existing_ws = await db.workspaces.find_one(
            {"id": ws_id},
            {"_id": 0, "id": 1, "name": 1, "source_crm_lead_id": 1, "members": 1, "owner_id": 1},
        )
        if not existing_ws:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
        bound = existing_ws.get("source_crm_lead_id")
        if bound and bound != lead_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workspace is already linked to another CRM lead.",
            )
        # Validate workspace membership before link
        is_admin_or_ops = user.get("role") in ("admin", "operations") or user.get("department") in ("operations", "admin")
        ws_members = existing_ws.get("members") or []
        user_id = user.get("id")
        if not is_admin_or_ops and user_id not in ws_members and user_id != existing_ws.get("owner_id"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to link this workspace.",
            )
        other = await db.crm_leads.find_one(
            {
                "converted_workspace_id": ws_id,
                "id": {"$ne": lead_id},
                "outcome": "won",
            },
            {"_id": 0, "id": 1},
        )
        if other:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workspace is already linked to another won lead.",
            )
        ws_name = existing_ws.get("name") or ws_id
    else:
        ws_name = (p_conf.get("workspace_name") or lead.get("company") or lead.get("name") or "New client").strip()[:120]
        ws_id = f"ws-{uuid.uuid4().hex[:8]}"
        phone = lead.get("phone_e164")
        poc_phone = f"+{phone}" if phone else (lead.get("phone_raw") or None)

        brand_color = p_conf.get("brand_color") or p_conf.get("brandColor") or "bg-zinc-700"
        services = p_conf.get("services") or ([lead["service"]] if lead.get("service") else [])
        project_cycle = p_conf.get("project_cycle") or "Retainer"
        priority = p_conf.get("priority") or "Medium"
        proposal_url = p_conf.get("proposal_url")
        proposal_name = p_conf.get("proposal_name")
        proposal_size = p_conf.get("proposal_size")
        start_date = p_conf.get("contract_start_date") or now[:10]
        end_date = p_conf.get("contract_end_date")
        poc_name = p_conf.get("poc_name") or lead.get("name")
        poc_email = p_conf.get("poc_email") or lead.get("email")
        poc_phone_val = p_conf.get("poc_phone") or poc_phone
        billing_name = p_conf.get("billing_name") or lead.get("name")
        billing_email = p_conf.get("billing_email") or lead.get("email")
        billing_phone_val = p_conf.get("billing_phone") or poc_phone

        ws_doc = {
            "id": ws_id,
            "name": ws_name,
            "brandColor": brand_color,
            "brand_color": brand_color,
            "status": "active",
            "initials": _workspace_initials(ws_name),
            "proposal_url": proposal_url,
            "proposal_name": proposal_name,
            "proposal_size": proposal_size,
            "project_cycle": project_cycle,
            "priority": priority,
            "contract_start_date": start_date,
            "contract_end_date": end_date,
            "services": services,
            "health": "Good",
            "poc_name": poc_name,
            "poc_email": poc_email,
            "poc_phone": poc_phone_val,
            "billing_name": billing_name,
            "billing_email": billing_email,
            "billing_phone": billing_phone_val,
            "isDefault": False,
            "created_at": now,
            "updated_at": now,
            "source_crm_lead_id": lead_id,
            "source_crm_deal_id": (deal_doc or {}).get("id"),
        }
        await db.workspaces.insert_one(ws_doc)
        created_new = True

    fields = {
        "outcome": "won",
        "disqualify_reason": None,
        "converted_workspace_id": ws_id,
        "approval_status": "approved",
        "payment_cleared": True,
        "updated_at": now,
    }
    await db.crm_leads.update_one({"id": lead_id}, {"$set": fields})
    if not created_new:
        await db.workspaces.update_one(
            {"id": ws_id},
            {"$set": {"source_crm_lead_id": lead_id, "updated_at": now}},
        )
    action = "Created" if created_new else "Linked"
    await append_activity(
        lead_id,
        "converted",
        f"{action} Active Client workspace {ws_name}.",
        user,
        {"workspace_id": ws_id, "created": created_new, "deal_id": (deal_doc or {}).get("id")},
    )
    await append_activity(lead_id, "outcome_set", "Marked won and approved.", user, {"outcome": "won", "workspace_id": ws_id})
    if note:
        await append_activity(lead_id, "note", note.strip(), user)
    fresh = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    return serialize_lead(fresh or {**lead, **fields})


async def approve_won_lead(
    lead_id: str,
    user: Dict[str, Any],
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not can_manage_outcomes(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only operations and admins can approve won deals.")
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    if lead.get("outcome") != "won":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lead is not marked as won.")
    if lead.get("converted_workspace_id"):
        return serialize_lead(lead)

    if payload:
        p_conf = lead.get("proposal_config") or {}
        for k in ("workspace_name", "brand_color", "services", "project_cycle", "note"):
            if payload.get(k):
                p_conf[k] = payload[k]
        await db.crm_leads.update_one({"id": lead_id}, {"$set": {"proposal_config": p_conf}})
        lead["proposal_config"] = p_conf

    converted = await convert_to_workspace(lead_id, user, note=(payload or {}).get("note"))
    await db.crm_leads.update_one(
        {"id": lead_id},
        {"$set": {"approval_status": "approved", "payment_cleared": True, "updated_at": _now()}},
    )
    await append_activity(
        lead_id,
        "won_approved",
        "Operations approved won deal and confirmed payment clearance. Active client workspace created.",
        user,
    )
    fresh = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    return serialize_lead(fresh or converted)


async def reopen_lead(
    lead_id: str,
    user: Dict[str, Any],
    target_stage: str = "contacted",
    note: Optional[str] = None,
) -> Dict[str, Any]:
    if not can_manage_outcomes(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins and operations can reopen leads.")
    if target_stage not in OPEN_STAGES:
        target_stage = "contacted"
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    now = _now()
    fields: Dict[str, Any] = {
        "outcome": None,
        "disqualify_reason": None,
        "approval_status": None,
        "stage": target_stage,
        "updated_at": now,
    }
    await db.crm_leads.update_one({"id": lead_id}, {"$set": fields})
    await append_activity(
        lead_id,
        "lead_reopened",
        f"Deal reopened by Admin to stage '{target_stage}'.",
        user,
        {"target_stage": target_stage},
    )
    if note:
        await append_activity(lead_id, "note", note.strip(), user)
    fresh = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    return serialize_lead(fresh or lead)


async def add_note(lead_id: str, body: str, user: Dict[str, Any]) -> Dict[str, Any]:
    lead = await get_lead_or_404(lead_id, user)
    await append_activity(lead_id, "note", body.strip(), user)
    assigned_to = lead.get("assigned_to")
    actor_id = user.get("id")
    if assigned_to and assigned_to != actor_id:
        try:
            from app.services.crm_assignment import notify_users
            actor_name = user.get("full_name") or user.get("name") or "A team member"
            snippet = (body.strip()[:80] + "…") if len(body.strip()) > 80 else body.strip()
            await notify_users(
                [assigned_to],
                f"New Note on {lead.get('name')}",
                f"{actor_name}: {snippet}",
                data={"type": "crm_lead", "lead_id": lead_id},
            )
        except Exception:
            pass
    return serialize_lead(await get_lead_or_404(lead_id, user))


async def log_whatsapp_opened(
    lead_id: str,
    user: Dict[str, Any],
    *,
    template_id: Optional[str] = None,
) -> Dict[str, Any]:
    from app.services.crm_templates import preview_for_lead

    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    if not lead.get("phone_valid") or not lead.get("phone_e164"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number is not valid for WhatsApp.")
    preview = await preview_for_lead(template_id, lead)
    text = preview.get("text") or ""
    now = _now()
    await db.crm_leads.update_one(
        {"id": lead_id},
        {"$set": {"whatsapp_opened_at": lead.get("whatsapp_opened_at") or now, "updated_at": now}},
    )
    label = preview.get("template_name")
    body = f"WhatsApp opened ({label})." if label else "WhatsApp opened."
    await append_activity(
        lead_id,
        "whatsapp_opened",
        body,
        user,
        {
            "template_id": preview.get("template_id"),
            "template_name": label,
            "rendered_preview": (text[:160] + "…") if len(text) > 160 else text,
        },
    )
    serialized = serialize_lead(await get_lead_or_404(lead_id, user))
    serialized["wa_url"] = wa_me_url(lead.get("phone_e164"), text or None)
    serialized["rendered_text"] = text
    serialized["template_id"] = preview.get("template_id")
    serialized["template_name"] = label
    return serialized


async def set_follow_up(
    lead_id: str,
    next_follow_up_at: Optional[str],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    if lead.get("outcome"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Closed leads cannot set follow-ups.")
    now = _now()
    fields: Dict[str, Any] = {
        "next_follow_up_at": next_follow_up_at or None,
        "follow_up_nagged_at": None,
        "updated_at": now,
    }
    await db.crm_leads.update_one({"id": lead_id}, {"$set": fields})
    if next_follow_up_at:
        await append_activity(
            lead_id,
            "follow_up_set",
            f"Follow-up set for {next_follow_up_at}.",
            user,
            {"next_follow_up_at": next_follow_up_at},
        )
    else:
        await append_activity(lead_id, "follow_up_cleared", "Follow-up cleared.", user)
    return serialize_lead(await get_lead_or_404(lead_id, user))


async def mark_contacted(lead_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    now = _now()
    stage = lead.get("stage") or "new"
    fields: Dict[str, Any] = {
        "contacted": True,
        "contacted_at": lead.get("contacted_at") or now,
        "updated_at": now,
    }
    if stage == "new" and not lead.get("outcome"):
        fields["stage"] = "contacted"
    await db.crm_leads.update_one({"id": lead_id}, {"$set": fields})
    await append_activity(lead_id, "contacted", "Marked as contacted.", user)
    return serialize_lead(await get_lead_or_404(lead_id, user))


async def list_activities(lead_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    db = _db()
    await get_lead_or_404(lead_id, user)
    docs = await db.crm_activities.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [serialize_activity(d) for d in docs]


async def delete_lead(lead_id: str, user: Dict[str, Any]) -> None:
    db = _db()
    await get_lead_or_404(lead_id, user)
    if not (can_assign_leads(user) or user.get("role") in ("admin", "operations", "team_lead")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete leads.")
    await db.crm_leads.delete_one({"id": lead_id})
    await db.crm_activities.delete_many({"lead_id": lead_id})
    await db.crm_deals.delete_many({"lead_id": lead_id})


