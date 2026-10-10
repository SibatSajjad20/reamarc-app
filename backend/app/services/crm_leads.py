"""CRM lead store, timeline, and Phase 1 manual assignment."""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from pymongo import ReturnDocument

from app.database import get_database
from app.services.crm_form_fields import form_answer_rows, is_no_website, pull_form_answers
from app.schemas.crm import (
    DISQUALIFY_REASONS,
    OPEN_STAGES,
    OUTCOMES,
    CrmLeadCreate,
    CrmLeadUpdate,
)
from app.services.crm_access import (
    can_assign_leads,
    can_manage_outcomes,
    is_sales_team_lead,
    lead_visible_to,
    visibility_filter,
)
from app.services.crm_phone import normalize_phone_e164, wa_me_url

logger = logging.getLogger("app.crm")


def _dispatch_background_notification(coro) -> None:
    """Dispatches a coroutine in the background and logs any uncaught exception."""
    async def _runner():
        try:
            await coro
        except Exception as exc:
            logger.warning(f"Background CRM notification failed: {exc}")

    try:
        asyncio.create_task(_runner())
    except Exception as exc:
        logger.warning(f"Failed to schedule background CRM notification: {exc}")

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


def require_open_lead(lead: Dict[str, Any]) -> None:
    """Block pipeline work on won, lost, trashed, and disqualified leads."""
    if lead.get("outcome"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This lead is closed. Reopen it before continuing.",
        )


def _help_service_label(help_with: list, help_other: Optional[str]) -> Optional[str]:
    detail = (help_other or "").strip()
    parts = []
    for item in help_with or []:
        text = str(item).strip()
        if not text:
            continue
        if text == "Other" and detail:
            parts.append(f"Other: {detail}")
        else:
            parts.append(text)
    return ", ".join(parts) or None


def serialize_lead(doc: Dict[str, Any]) -> Dict[str, Any]:
    e164 = doc.get("phone_e164")
    valid = bool(doc.get("phone_valid"))
    custom = doc.get("custom_fields") or {}
    filled, consumed = pull_form_answers(
        custom,
        {
            "role": doc.get("role"),
            "budget": doc.get("budget"),
            "start_timeline": doc.get("start_timeline"),
            "service": doc.get("service"),
            "objective": doc.get("objective"),
        },
    )
    website = doc.get("website")
    no_website = bool(doc.get("no_website")) or is_no_website(website)
    if no_website:
        website = None
    return {
        "id": doc.get("id"),
        "name": doc.get("name") or "",
        "company": doc.get("company"),
        "website": website,
        "email": doc.get("email"),
        "phone_raw": doc.get("phone_raw"),
        "phone_e164": e164,
        "phone_valid": valid,
        "wa_url": wa_me_url(e164) if valid else None,
        "city": doc.get("city"),
        "service": filled.get("service"),
        "budget": filled.get("budget"),
        "no_website": no_website,
        "role": filled.get("role"),
        "industry": doc.get("industry"),
        "business_stage": doc.get("business_stage"),
        "employee_count": doc.get("employee_count"),
        "sales_team": doc.get("sales_team"),
        "help_with": doc.get("help_with") or [],
        "help_other": doc.get("help_other"),
        "objective": filled.get("objective"),
        "start_timeline": filled.get("start_timeline"),
        "brief": doc.get("brief"),
        "source": doc.get("source") or "manual",
        "campaign": doc.get("campaign"),
        "stage": doc.get("stage") or "new",
        "outcome": doc.get("outcome"),
        "disqualify_reason": doc.get("disqualify_reason"),
        "lost_reason": doc.get("lost_reason"),
        "trash_reason": doc.get("trash_reason"),
        "form_completed_at": doc.get("form_completed_at"),
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
        "custom_fields": custom,
        "form_answers": form_answer_rows(custom, consumed),
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


async def _assert_can_see(user: Dict[str, Any], lead: Dict[str, Any]) -> None:
    assignee = None
    assigned_to = lead.get("assigned_to")
    if assigned_to and is_sales_team_lead(user) and assigned_to != user.get("id"):
        assignee = await _db().users.find_one(
            {"id": assigned_to},
            {"_id": 0, "id": 1, "role": 1, "department": 1},
        )
    if lead_visible_to(user, lead, assignee):
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
    await _assert_can_see(user, doc)
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
    outcome: Optional[str] = None,
    limit: int = 200,
    skip: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    outcome_filter: Optional[str] = None
    if outcome and str(outcome).strip():
        outcome_filter = str(outcome).strip().lower()
        if outcome_filter not in OUTCOMES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lead outcome filter.")

    db = _db()
    clauses: List[Dict[str, Any]] = []
    vis = await visibility_filter(user)
    if vis:
        clauses.append(vis)
    if not include_junk:
        clauses.append({"outcome": {"$nin": ["disqualified", "trashed"]}})
    if outcome_filter:
        clauses.append({"outcome": outcome_filter})
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
                    {"brief": {"$regex": q, "$options": "i"}},
                    {"industry": {"$regex": q, "$options": "i"}},
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
    vis = await visibility_filter(user)
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
    elif not can_assign_leads(user):
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
        "service": _help_service_label(payload.help_with, payload.help_other) or (payload.service or "").strip() or None,
        "budget": payload.budget,
        "no_website": bool(payload.no_website),
        "role": payload.role,
        "industry": payload.industry,
        "business_stage": payload.business_stage,
        "employee_count": payload.employee_count,
        "sales_team": payload.sales_team,
        "help_with": list(payload.help_with),
        "help_other": (payload.help_other or "").strip() or None,
        "objective": payload.objective,
        "start_timeline": payload.start_timeline,
        "brief": payload.brief,
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
        "form_completed_at": now,
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
        from app.services.crm_assignment import notify_new_lead_broadcast

        await notify_new_lead_broadcast(doc["id"])
    else:
        from app.services.crm_assignment import apply_assignment_engine

        await apply_assignment_engine(doc["id"], actor=user)
    note = (payload.note or payload.brief or "").strip()
    if note:
        await append_activity(doc["id"], "note", note, user)
    fresh = await db.crm_leads.find_one({"id": doc["id"]}, {"_id": 0})
    return serialize_lead(fresh or doc)


async def update_lead(lead_id: str, payload: CrmLeadUpdate, user: Dict[str, Any]) -> Dict[str, Any]:
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    dumped = payload.model_dump(exclude_unset=True)
    mark_form_complete = bool(dumped.pop("mark_form_complete", False))
    if not dumped and not mark_form_complete:
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
    if dumped.get("no_website"):
        fields["no_website"] = True
        fields["website"] = None
        dumped.pop("website", None)
        dumped.pop("no_website", None)
    elif "no_website" in dumped:
        fields["no_website"] = bool(dumped.pop("no_website"))
    if "help_with" in dumped:
        help_with = dumped.pop("help_with") or []
        fields["help_with"] = help_with
        if help_with and "service" not in dumped:
            fields["service"] = _help_service_label(help_with, dumped.get("help_other"))
    if "help_other" in dumped:
        fields["help_other"] = (dumped.pop("help_other") or "").strip() or None
    for key in (
        "name", "email", "company", "website", "city", "service", "budget", "source", "campaign",
        "tags", "next_follow_up_at", "proposal_config",
        "role", "industry", "business_stage", "employee_count", "sales_team",
        "objective", "start_timeline", "brief",
    ):
        if key in dumped:
            val = dumped[key]
            if key == "email" and isinstance(val, str):
                val = val.strip().lower() or None
            elif isinstance(val, str) and key not in ("tags", "proposal_config"):
                val = val.strip() or None
            fields[key] = val
    if mark_form_complete:
        fields["form_completed_at"] = _now()
    if not fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update.")
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
    try:
        from app.services.crm_assignment import notify_users

        _dispatch_background_notification(
            notify_users([uid], "New CRM lead", f"A lead was assigned to {name}.")
        )
    except Exception as exc:
        logger.warning(f"Failed to prepare assignment notification: {exc}")
    return serialize_lead(updated)


async def set_outcome(lead_id: str, outcome: str, user: Dict[str, Any], *, reason: Optional[str] = None, note: Optional[str] = None) -> Dict[str, Any]:
    if outcome not in OUTCOMES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid outcome.")
    if outcome == "won":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A lead becomes won by registering an active client. Submit the client workspace form.",
        )
    db = _db()
    lead = await get_lead_or_404(lead_id, user)
    now = _now()

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
        fields["trash_reason"] = None
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
        fields["trash_reason"] = None
    elif outcome == "trashed":
        reason_text = (reason or "").strip()
        if len(reason_text) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A detailed trash reason is required.",
            )
        if len(reason_text) > 2000:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Trash reason is too long.")
        fields["trash_reason"] = reason_text
        fields["disqualify_reason"] = None
        fields["lost_reason"] = None
    else:
        fields["disqualify_reason"] = None
        fields["lost_reason"] = None
        fields["trash_reason"] = None
    await db.crm_leads.update_one({"id": lead_id}, {"$set": fields})
    label = outcome if outcome != "disqualified" else f"disqualified ({fields.get('disqualify_reason')})"
    if outcome == "lost":
        label = f"lost ({fields.get('lost_reason')})"
    if outcome == "trashed":
        label = "trashed"
    await append_activity(
        lead_id,
        "outcome_set",
        f"Marked {label}.",
        user,
        {"outcome": outcome, "reason": fields.get("lost_reason") or fields.get("disqualify_reason") or fields.get("trash_reason")},
    )
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


async def register_lead_as_client(lead_id: str, payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    """Mark the lead won and create its active client from the workspace form.

    The proposal file on this payload is the client's proposal. Deal proposals are not copied.
    """
    lead = await get_lead_or_404(lead_id, user)
    if lead.get("converted_workspace_id"):
        return serialize_lead(lead)
    if lead.get("outcome") in ("lost", "disqualified", "trashed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reopen this lead before registering it as a client.",
        )
    db = _db()

    name = str(payload.get("name") or "").strip()
    services = [str(item).strip() for item in (payload.get("services") or []) if str(item).strip()]
    start = str(payload.get("contract_start_date") or "").strip()
    end = str(payload.get("contract_end_date") or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client / Brand name is required.")
    if not services:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please select at least one service.")
    if not start or not end:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contract start and end dates are required.")
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contract end date cannot be earlier than contract start date.",
        )

    now = _now()
    ws_id = f"ws-{uuid.uuid4().hex[:8]}"
    initials = str(payload.get("initials") or "").strip().upper() or _workspace_initials(name)
    brand = str(payload.get("brandColor") or "#4f46e5").strip() or "#4f46e5"
    proposal_url = (str(payload.get("proposal_url") or "").strip() or None)
    ws_doc = {
        "id": ws_id,
        "name": name[:120],
        "initials": initials[:8],
        "brandColor": brand,
        "brand_color": brand,
        "status": payload.get("status") if payload.get("status") in ("active", "inactive") else "active",
        "proposal_url": proposal_url,
        "proposal_name": (str(payload.get("proposal_name") or "").strip() or None) if proposal_url else None,
        "proposal_size": payload.get("proposal_size") if proposal_url else None,
        "project_cycle": payload.get("project_cycle") or "Retainer",
        "priority": payload.get("priority") or "Medium",
        "contract_start_date": start,
        "contract_end_date": end,
        "services": services,
        "health": payload.get("health") or "Good",
        "poc_name": (str(payload.get("poc_name") or "").strip() or None),
        "poc_email": (str(payload.get("poc_email") or "").strip() or None),
        "poc_phone": (str(payload.get("poc_phone") or "").strip() or None),
        "billing_name": (str(payload.get("billing_name") or "").strip() or None),
        "billing_email": (str(payload.get("billing_email") or "").strip() or None),
        "billing_phone": (str(payload.get("billing_phone") or "").strip() or None),
        "brandGuidelines": "",
        "brand_guidelines": "",
        "isDefault": False,
        "user_id": user.get("id"),
        "created_at": now,
        "updated_at": now,
        "source_crm_lead_id": lead_id,
    }
    await db.workspaces.insert_one(ws_doc)

    fields = {
        "outcome": "won",
        "disqualify_reason": None,
        "lost_reason": None,
        "trash_reason": None,
        "approval_status": None,
        "payment_cleared": False,
        "converted_workspace_id": ws_id,
        "updated_at": now,
    }
    await db.crm_leads.update_one({"id": lead_id}, {"$set": fields})
    await append_activity(
        lead_id,
        "converted",
        f"Registered as active client {name}.",
        user,
        {"workspace_id": ws_id, "outcome": "won"},
    )
    fresh = await db.crm_leads.find_one({"id": lead_id}, {"_id": 0})
    return serialize_lead(fresh or {**lead, **fields})


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

    if not ws_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Register the lead with the client workspace form. A deal does not create the client.",
        )

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
        {"workspace_id": ws_id, "created": created_new},
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
    del lead_id, user, payload
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Leads are registered with the client workspace form. Operations approval confirms a won deal.",
    )


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
        "lost_reason": None,
        "trash_reason": None,
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
            _dispatch_background_notification(
                notify_users(
                    [assigned_to],
                    f"New Note on {lead.get('name')}",
                    f"{actor_name}: {snippet}",
                    data={"type": "crm_lead", "lead_id": lead_id},
                )
            )
        except Exception as exc:
            logger.warning(f"Failed to prepare note notification: {exc}")
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
    require_open_lead(lead)
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
    require_open_lead(lead)
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


