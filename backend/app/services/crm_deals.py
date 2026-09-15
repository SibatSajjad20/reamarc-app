"""CRM Deals service: commercial opportunities with their own pipeline stages."""
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
    DEAL_OPEN_STAGES,
    DEAL_STATUSES,
    CrmDealCreate,
    CrmDealUpdate,
)
from app.services.crm_access import can_manage_outcomes, visibility_filter

logger = logging.getLogger("app.crm.deals")

DEFAULT_DEAL_STAGES = [
    {"id": "opportunity_created", "name": "Opportunity Created", "order": 1},
    {"id": "requirement_confirmed", "name": "Requirement Confirmed", "order": 2},
    {"id": "proposal_sent", "name": "Proposal Sent", "order": 3},
    {"id": "negotiation", "name": "Negotiation", "order": 4},
    {"id": "verbal_approval", "name": "Verbal Approval", "order": 5},
    {"id": "contract_sent", "name": "Contract / Agreement Sent", "order": 6},
    {"id": "contract_signed", "name": "Contract Signed", "order": 7},
    {"id": "payment_pending", "name": "Payment Pending", "order": 8},
    {"id": "payment_done", "name": "Payment Done", "order": 9},
]

_WORKSPACE_DRAFT_FIELDS = (
    "workspace_name",
    "brand_color",
    "priority",
    "contract_start_date",
    "contract_end_date",
    "poc_name",
    "poc_email",
    "poc_phone",
    "billing_name",
    "billing_email",
    "billing_phone",
    "budget_display",
    "proposal_name",
    "proposal_size",
    "next_follow_up_at",
    "deal_type",
    "probability",
    "expected_revenue",
    "expected_close_date",
    "payment_status",
    "lost_reason",
)

_LEGACY_STAGE_MAP = {
    # Old dual-pipeline stages
    "proposal": "opportunity_created",
    "meeting_scheduled": "requirement_confirmed",
    "meeting_completed": "proposal_sent",
    # Legacy lead stages
    "proposal_sent": "proposal_sent",
    "negotiation": "negotiation",
    "new": "opportunity_created",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable.")
    return db


def _normalize_deal_stage(stage: Optional[str]) -> str:
    raw = (stage or "opportunity_created").strip()
    if raw in DEAL_OPEN_STAGES:
        return raw
    mapped = _LEGACY_STAGE_MAP.get(raw)
    if mapped and mapped in DEAL_OPEN_STAGES:
        return mapped
    return "opportunity_created"


def _compute_expected_revenue(value: float, probability: float, override: Optional[float] = None) -> float:
    if override is not None:
        return float(max(override, 0.0))
    return round(float(value or 0.0) * (float(probability or 0.0) / 100.0), 2)


def _billing_from_cycle(cycle: Optional[str]) -> str:
    text = (cycle or "").strip().lower()
    if "retain" in text:
        return "retainer"
    return "one_time"


def _parse_budget_value(budget: Any) -> float:
    if budget is None:
        return 0.0
    if isinstance(budget, (int, float)):
        return float(max(budget, 0))
    text = str(budget).strip()
    if not text:
        return 0.0
    # Pull first number-like token (supports $5,000 or 1500/mo)
    match = re.search(r"[\d,.]+", text.replace(",", ""))
    if not match:
        # try without stripping commas first
        match = re.search(r"[\d,]+(?:\.\d+)?", text)
    if not match:
        return 0.0
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return 0.0


def serialize_deal(doc: Dict[str, Any], lead: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    value = float(doc.get("value") or 0.0)
    probability = float(doc.get("probability") if doc.get("probability") is not None else 50.0)
    expected = doc.get("expected_revenue")
    if expected is None:
        expected = _compute_expected_revenue(value, probability)
    out: Dict[str, Any] = {
        "id": doc.get("id"),
        "lead_id": doc.get("lead_id"),
        "title": doc.get("title") or "Deal",
        "service": doc.get("service") or "General",
        "additional_services": doc.get("additional_services") or [],
        "value": value,
        "currency": doc.get("currency") or "PKR",
        "billing_type": doc.get("billing_type") or "one_time",
        "stage": _normalize_deal_stage(doc.get("stage")),
        "status": doc.get("status") if doc.get("status") in DEAL_STATUSES else "open",
        "deal_type": doc.get("deal_type") if doc.get("deal_type") in ("new_business", "upsell", "renewal") else "new_business",
        "probability": probability,
        "expected_revenue": float(expected or 0.0),
        "expected_close_date": doc.get("expected_close_date"),
        "payment_status": doc.get("payment_status")
        if doc.get("payment_status") in ("pending", "partial", "cleared")
        else "pending",
        "lost_reason": doc.get("lost_reason"),
        "approval_status": doc.get("approval_status"),
        "payment_cleared": bool(doc.get("payment_cleared")),
        "proposal_url": doc.get("proposal_url"),
        "proposal_name": doc.get("proposal_name"),
        "proposal_size": doc.get("proposal_size"),
        "notes": doc.get("notes"),
        "workspace_name": doc.get("workspace_name"),
        "brand_color": doc.get("brand_color"),
        "priority": doc.get("priority"),
        "contract_start_date": doc.get("contract_start_date"),
        "contract_end_date": doc.get("contract_end_date"),
        "poc_name": doc.get("poc_name"),
        "poc_email": doc.get("poc_email"),
        "poc_phone": doc.get("poc_phone"),
        "billing_name": doc.get("billing_name"),
        "billing_email": doc.get("billing_email"),
        "billing_phone": doc.get("billing_phone"),
        "next_follow_up_at": doc.get("next_follow_up_at"),
        "budget_display": doc.get("budget_display"),
        "converted_workspace_id": doc.get("converted_workspace_id"),
        "created_at": doc.get("created_at") or "",
        "updated_at": doc.get("updated_at") or "",
    }
    if lead:
        out["lead"] = {
            "id": lead.get("id"),
            "name": lead.get("name") or "",
            "company": lead.get("company"),
            "email": lead.get("email"),
            "phone_e164": lead.get("phone_e164"),
            "phone_raw": lead.get("phone_raw"),
            "assigned_to": lead.get("assigned_to"),
            "assigned_to_name": lead.get("assigned_to_name"),
            "stage": lead.get("stage"),
        }
    return out


def deal_pipeline_stages() -> List[Dict[str, Any]]:
    return list(DEFAULT_DEAL_STAGES)


def proposal_config_from_deal(deal: Dict[str, Any]) -> Dict[str, Any]:
    """Thin proposal_config mirror kept on the lead for legacy workspace conversion."""
    services = [deal.get("service")] if deal.get("service") else []
    extras = deal.get("additional_services") or []
    for s in extras:
        if s and s not in services:
            services.append(s)
    cycle = "Retainer" if deal.get("billing_type") == "retainer" else "One-Time Project"
    return {
        "workspace_name": deal.get("workspace_name"),
        "brand_color": deal.get("brand_color") or "#4f46e5",
        "services": services,
        "project_cycle": cycle,
        "priority": deal.get("priority") or "Medium",
        "budget": deal.get("budget_display") or (
            f"{deal.get('currency', 'USD')} {float(deal.get('value') or 0):,.2f}"
            if deal.get("value")
            else None
        ),
        "contract_start_date": deal.get("contract_start_date"),
        "contract_end_date": deal.get("contract_end_date"),
        "poc_name": deal.get("poc_name"),
        "poc_email": deal.get("poc_email"),
        "poc_phone": deal.get("poc_phone"),
        "billing_name": deal.get("billing_name"),
        "billing_email": deal.get("billing_email"),
        "billing_phone": deal.get("billing_phone"),
        "proposal_url": deal.get("proposal_url"),
        "proposal_name": deal.get("proposal_name"),
        "proposal_size": deal.get("proposal_size"),
        "proposal_notes": deal.get("notes"),
        "source_deal_id": deal.get("id"),
    }


async def list_deals_for_lead(lead_id: str) -> List[Dict[str, Any]]:
    db = _db()
    cursor = db.crm_deals.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(100)
    return [serialize_deal(d) for d in docs]


async def get_deal_or_404(deal_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    from app.services.crm_leads import get_lead_or_404

    db = _db()
    existing = await db.crm_deals.find_one({"id": deal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found.")
    lead = await get_lead_or_404(existing["lead_id"], user)
    return serialize_deal(existing, lead)


async def list_deals(
    user: Dict[str, Any],
    *,
    search: Optional[str] = None,
    stage: Optional[str] = None,
    status_filter: Optional[str] = None,
    lead_id: Optional[str] = None,
    limit: int = 300,
    skip: int = 0,
) -> Tuple[List[Dict[str, Any]], int, float]:
    from app.services.crm_leads import serialize_lead

    db = _db()
    await migrate_proposal_configs_to_deals(user)

    clauses: List[Dict[str, Any]] = []
    if stage:
        clauses.append({"stage": _normalize_deal_stage(stage)})
    if status_filter:
        if status_filter not in DEAL_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid deal status filter.")
        clauses.append({"status": status_filter})
    if lead_id:
        clauses.append({"lead_id": lead_id})

    query: Dict[str, Any] = {"$and": clauses} if clauses else {}
    cursor = db.crm_deals.find(query, {"_id": 0}).sort("updated_at", -1)
    all_docs = await cursor.to_list(2000)

    # Visibility via lead assignment
    lead_ids = list({d.get("lead_id") for d in all_docs if d.get("lead_id")})
    leads_by_id: Dict[str, Dict[str, Any]] = {}
    if lead_ids:
        vis = visibility_filter(user)
        lead_q: Dict[str, Any] = {"id": {"$in": lead_ids}}
        if vis:
            lead_q = {"$and": [lead_q, vis]}
        lead_docs = await db.crm_leads.find(lead_q, {"_id": 0}).to_list(2000)
        for ld in lead_docs:
            leads_by_id[ld["id"]] = serialize_lead(ld)

    visible = [d for d in all_docs if d.get("lead_id") in leads_by_id]

    if search and search.strip():
        raw_q = search.strip().lower()
        if len(raw_q) > 120:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Search term too long.")

        def _match(d: Dict[str, Any]) -> bool:
            lead = leads_by_id.get(d.get("lead_id") or "", {})
            hay = " ".join(
                [
                    str(d.get("title") or ""),
                    str(d.get("service") or ""),
                    str(d.get("workspace_name") or ""),
                    str(lead.get("name") or ""),
                    str(lead.get("company") or ""),
                    str(lead.get("email") or ""),
                    str(lead.get("phone_e164") or ""),
                    str(lead.get("phone_raw") or ""),
                ]
            ).lower()
            return raw_q in hay

        visible = [d for d in visible if _match(d)]

    total_value = sum(float(d.get("value") or 0.0) for d in visible if d.get("status") == "open")
    total_count = len(visible)
    page = visible[max(skip, 0) : max(skip, 0) + min(max(limit, 1), 500)]
    serialized = [serialize_deal(d, leads_by_id.get(d.get("lead_id") or "")) for d in page]
    return serialized, total_count, total_value


async def create_deal(lead_id: str, payload: CrmDealCreate, user: Dict[str, Any]) -> Dict[str, Any]:
    from app.services.crm_leads import append_activity, get_lead_or_404

    lead = await get_lead_or_404(lead_id, user)
    db = _db()
    now = _now()
    deal_id = f"deal-{uuid.uuid4().hex[:10]}"

    stage = _normalize_deal_stage(payload.stage or "opportunity_created")
    deal_status = payload.status if payload.status in DEAL_STATUSES else "open"
    probability = float(payload.probability if payload.probability is not None else 50.0)
    value = float(payload.value or 0.0)
    expected_revenue = _compute_expected_revenue(value, probability, payload.expected_revenue)

    doc: Dict[str, Any] = {
        "id": deal_id,
        "lead_id": lead_id,
        "title": payload.title.strip(),
        "service": payload.service.strip(),
        "additional_services": payload.additional_services or [],
        "value": value,
        "currency": (payload.currency or "PKR").upper().strip(),
        "billing_type": payload.billing_type or "one_time",
        "stage": stage,
        "status": deal_status,
        "deal_type": payload.deal_type or "new_business",
        "probability": probability,
        "expected_revenue": expected_revenue,
        "expected_close_date": payload.expected_close_date,
        "payment_status": payload.payment_status or "pending",
        "lost_reason": None,
        "approval_status": None,
        "payment_cleared": False,
        "proposal_url": payload.proposal_url,
        "proposal_name": payload.proposal_name,
        "proposal_size": payload.proposal_size,
        "notes": payload.notes.strip() if payload.notes else None,
        "workspace_name": (payload.workspace_name or lead.get("company") or lead.get("name") or "").strip() or None,
        "brand_color": payload.brand_color or "#4f46e5",
        "priority": payload.priority or "Medium",
        "contract_start_date": payload.contract_start_date,
        "contract_end_date": payload.contract_end_date,
        "poc_name": payload.poc_name or lead.get("name"),
        "poc_email": payload.poc_email or lead.get("email"),
        "poc_phone": payload.poc_phone or lead.get("phone_e164") or lead.get("phone_raw"),
        "billing_name": payload.billing_name or payload.poc_name or lead.get("name"),
        "billing_email": payload.billing_email or payload.poc_email or lead.get("email"),
        "billing_phone": payload.billing_phone or payload.poc_phone or lead.get("phone_e164") or lead.get("phone_raw"),
        "next_follow_up_at": payload.next_follow_up_at,
        "budget_display": payload.budget_display,
        "converted_workspace_id": None,
        "created_at": now,
        "updated_at": now,
        "created_by": user.get("id"),
    }
    await db.crm_deals.insert_one(doc)
    doc.pop("_id", None)

    # Mirror thin proposal_config on lead for legacy convert path
    p_conf = proposal_config_from_deal(doc)
    await db.crm_leads.update_one(
        {"id": lead_id},
        {"$set": {"proposal_config": p_conf, "updated_at": now}},
    )

    # Remap lead off legacy commercial stages if still there
    if lead.get("stage") in ("proposal_sent", "negotiation"):
        target = "session_done" if lead.get("stage") else "qualified"
        if lead.get("stage") == "proposal_sent":
            target = "qualified"
        await db.crm_leads.update_one({"id": lead_id}, {"$set": {"stage": target, "updated_at": now}})

    await append_activity(
        lead_id,
        "deal_added",
        f"Deal added: {doc['title']} ({doc['currency']} {doc['value']:,.2f} - {doc['service']}).",
        user,
        {"deal_id": deal_id, "title": doc["title"], "value": doc["value"], "stage": stage},
    )
    return serialize_deal(doc, lead)


async def update_deal(deal_id: str, payload: CrmDealUpdate, user: Dict[str, Any]) -> Dict[str, Any]:
    from app.services.crm_leads import append_activity, get_lead_or_404

    db = _db()
    existing = await db.crm_deals.find_one({"id": deal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found.")

    lead_id = existing["lead_id"]
    lead = await get_lead_or_404(lead_id, user)

    dumped = payload.model_dump(exclude_unset=True)
    if not dumped:
        return serialize_deal(existing, lead)

    fields: Dict[str, Any] = {"updated_at": _now()}
    mutable = (
        "title",
        "service",
        "additional_services",
        "value",
        "currency",
        "billing_type",
        "stage",
        "status",
        "proposal_url",
        "proposal_name",
        "proposal_size",
        "notes",
        *_WORKSPACE_DRAFT_FIELDS,
    )
    for k in mutable:
        if k in dumped:
            val = dumped[k]
            if k == "stage" and val is not None:
                val = _normalize_deal_stage(val)
            if k == "status" and val is not None and val not in DEAL_STATUSES:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid deal status.")
            if k == "currency" and isinstance(val, str):
                val = val.upper().strip()
            if k in ("title", "service", "notes", "workspace_name") and isinstance(val, str):
                val = val.strip() or None
            fields[k] = val

    # Keep expected_revenue in sync when value/probability change without explicit override
    if "expected_revenue" not in dumped and ("value" in fields or "probability" in fields):
        next_value = float(fields.get("value", existing.get("value") or 0.0))
        next_prob = float(fields.get("probability", existing.get("probability") if existing.get("probability") is not None else 50.0))
        fields["expected_revenue"] = _compute_expected_revenue(next_value, next_prob)

    # Re-opening via status=open clears approval flags
    if fields.get("status") == "open" and existing.get("status") != "open":
        fields["approval_status"] = None
        fields["payment_cleared"] = False
        fields["lost_reason"] = None

    updated = await db.crm_deals.find_one_and_update(
        {"id": deal_id},
        {"$set": fields},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found.")
    updated.pop("_id", None)

    # Refresh mirrored proposal_config when commercial/workspace fields change
    p_conf = proposal_config_from_deal(updated)
    await db.crm_leads.update_one(
        {"id": lead_id},
        {"$set": {"proposal_config": p_conf, "updated_at": _now()}},
    )

    activity_bits = list(fields.keys())
    if "stage" in fields and fields["stage"] != existing.get("stage"):
        await append_activity(
            lead_id,
            "deal_stage_changed",
            f"Deal '{updated.get('title')}' moved {existing.get('stage')} → {fields['stage']}.",
            user,
            {"deal_id": deal_id, "from": existing.get("stage"), "to": fields["stage"]},
        )
    else:
        await append_activity(
            lead_id,
            "deal_updated",
            f"Deal updated: {updated.get('title')}.",
            user,
            {"deal_id": deal_id, "fields": activity_bits},
        )
    return serialize_deal(updated, lead)


async def set_deal_outcome(
    deal_id: str,
    outcome: str,
    user: Dict[str, Any],
    *,
    note: Optional[str] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    from app.schemas.crm import DEAL_LOST_REASONS
    from app.services.crm_leads import append_activity, get_lead_or_404

    if outcome not in ("won", "lost"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deal outcome must be won or lost.")

    db = _db()
    existing = await db.crm_deals.find_one({"id": deal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found.")

    lead = await get_lead_or_404(existing["lead_id"], user)
    now = _now()

    if outcome == "won":
        fields: Dict[str, Any] = {
            "status": "won",
            "approval_status": "pending_operations",
            "payment_cleared": False,
            "lost_reason": None,
            "updated_at": now,
        }
        body = f"Deal Won: {existing.get('title')} (pending Operations approval)."
    else:
        reason_val = (reason or "").strip().lower()
        if reason_val not in DEAL_LOST_REASONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Lost reason required. Expected one of: {', '.join(DEAL_LOST_REASONS)}",
            )
        fields = {
            "status": "lost",
            "approval_status": None,
            "payment_cleared": False,
            "lost_reason": reason_val,
            "updated_at": now,
        }
        body = f"Deal Lost ({reason_val}): {existing.get('title')}."

    updated = await db.crm_deals.find_one_and_update(
        {"id": deal_id},
        {"$set": fields},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found.")
    updated.pop("_id", None)

    await append_activity(
        existing["lead_id"],
        "deal_outcome_set",
        body,
        user,
        {
            "deal_id": deal_id,
            "status": outcome,
            "approval_status": fields.get("approval_status"),
            "lost_reason": fields.get("lost_reason"),
        },
    )
    if note:
        await append_activity(existing["lead_id"], "note", note.strip(), user, {"deal_id": deal_id})

    if outcome == "won":
        try:
            from app.services.crm_assignment import manager_user_ids, notify_users
            targets = await manager_user_ids()
            rep_name = user.get("full_name") or user.get("name") or "Sales Rep"
            val = float(existing.get("value") or 0.0)
            await notify_users(
                targets,
                "🎉 Deal Won: Operations Approval Needed",
                f"{rep_name} marked deal '{existing.get('title')}' (${val:,.0f}) as WON for {lead.get('name')}.",
                data={"type": "crm_lead", "lead_id": existing["lead_id"]},
            )
        except Exception as err:
            logger.warning("Failed to notify managers on deal won: %s", err)

    return serialize_deal(updated, lead)


async def reopen_deal(
    deal_id: str,
    user: Dict[str, Any],
    *,
    target_stage: str = "opportunity_created",
    note: Optional[str] = None,
) -> Dict[str, Any]:
    from app.services.crm_leads import append_activity, get_lead_or_404

    if not can_manage_outcomes(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins and operations can reopen deals.")

    stage = _normalize_deal_stage(target_stage or "opportunity_created")
    db = _db()
    existing = await db.crm_deals.find_one({"id": deal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found.")

    lead = await get_lead_or_404(existing["lead_id"], user)
    now = _now()
    updated = await db.crm_deals.find_one_and_update(
        {"id": deal_id},
        {
            "$set": {
                "status": "open",
                "stage": stage,
                "approval_status": None,
                "payment_cleared": False,
                "lost_reason": None,
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found.")
    updated.pop("_id", None)

    await append_activity(
        existing["lead_id"],
        "deal_reopened",
        f"Deal reopened to {stage}: {existing.get('title')}.",
        user,
        {"deal_id": deal_id, "stage": stage},
    )
    if note:
        await append_activity(existing["lead_id"], "note", note.strip(), user, {"deal_id": deal_id})
    return serialize_deal(updated, lead)


async def approve_won_deal(
    deal_id: str,
    user: Dict[str, Any],
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Ops approve a won deal → create/link Active Client workspace on the lead."""
    from app.services.crm_leads import append_activity, convert_to_workspace, get_lead_or_404

    if not can_manage_outcomes(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only operations and admins can approve won deals.")

    db = _db()
    existing = await db.crm_deals.find_one({"id": deal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found.")
    if existing.get("status") != "won":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deal is not marked as won.")

    lead_id = existing["lead_id"]
    lead = await get_lead_or_404(lead_id, user)
    payload = payload or {}

    # Merge optional overrides into the deal before conversion
    overrides: Dict[str, Any] = {}
    for k in ("workspace_name", "brand_color", "priority"):
        if payload.get(k):
            overrides[k] = payload[k]
    if payload.get("services"):
        services = list(payload["services"])
        overrides["service"] = services[0] if services else existing.get("service")
        overrides["additional_services"] = services[1:] if len(services) > 1 else []
    if payload.get("project_cycle"):
        overrides["billing_type"] = _billing_from_cycle(payload["project_cycle"])
    if overrides:
        overrides["updated_at"] = _now()
        existing = await db.crm_deals.find_one_and_update(
            {"id": deal_id},
            {"$set": overrides},
            return_document=ReturnDocument.AFTER,
        ) or existing
        existing.pop("_id", None)

    # Mirror onto lead proposal_config so convert_to_workspace can prefer deal fields
    p_conf = proposal_config_from_deal(existing)
    await db.crm_leads.update_one({"id": lead_id}, {"$set": {"proposal_config": p_conf}})

    converted = await convert_to_workspace(
        lead_id,
        user,
        workspace_id=payload.get("workspace_id"),
        note=payload.get("note"),
        preferred_deal_id=deal_id,
    )

    ws_id = converted.get("converted_workspace_id")
    now = _now()
    updated = await db.crm_deals.find_one_and_update(
        {"id": deal_id},
        {
            "$set": {
                "approval_status": "approved",
                "payment_cleared": True,
                "converted_workspace_id": ws_id,
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated:
        updated.pop("_id", None)
    else:
        updated = {**existing, "approval_status": "approved", "payment_cleared": True, "converted_workspace_id": ws_id}

    await append_activity(
        lead_id,
        "deal_won_approved",
        f"Operations approved won deal '{existing.get('title')}' and confirmed payment clearance.",
        user,
        {"deal_id": deal_id, "workspace_id": ws_id},
    )

    if lead.get("assigned_to"):
        try:
            from app.services.crm_assignment import notify_users
            val = float(existing.get("value") or 0.0)
            await notify_users(
                [lead["assigned_to"]],
                "✅ Deal Approved!",
                f"Your deal '{existing.get('title')}' (${val:,.0f}) for {lead.get('name')} was approved by Operations! Client workspace created.",
                data={"type": "crm_lead", "lead_id": lead_id},
            )
        except Exception as err:
            logger.warning("Failed to notify rep on deal approval: %s", err)

    return serialize_deal(updated, converted)


async def delete_deal(deal_id: str, user: Dict[str, Any]) -> None:
    from app.services.crm_leads import append_activity, get_lead_or_404

    db = _db()
    existing = await db.crm_deals.find_one({"id": deal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found.")

    lead_id = existing["lead_id"]
    await get_lead_or_404(lead_id, user)

    await db.crm_deals.delete_one({"id": deal_id})
    await append_activity(
        lead_id,
        "deal_removed",
        f"Deal removed: {existing.get('title')}.",
        user,
        {"deal_id": deal_id},
    )


async def migrate_proposal_configs_to_deals(user: Optional[Dict[str, Any]] = None) -> int:
    """
    One-shot / lazy migration:
    - Leads with proposal_config and zero deals → create a deal
    - Remap lead stages proposal_sent/negotiation → qualified/session_done
    """
    db = _db()
    migrated = 0
    now = _now()

    # Find leads still on legacy commercial stages or with proposal_config and no deals
    cursor = db.crm_leads.find(
        {
            "$or": [
                {"stage": {"$in": ["proposal_sent", "negotiation"]}},
                {"proposal_config": {"$exists": True, "$ne": None}},
            ]
        },
        {"_id": 0},
    )
    leads = await cursor.to_list(2000)
    if not leads:
        return 0

    lead_ids = [l["id"] for l in leads if l.get("id")]
    existing_deals = await db.crm_deals.find({"lead_id": {"$in": lead_ids}}, {"_id": 0, "lead_id": 1}).to_list(5000)
    leads_with_deals = {d["lead_id"] for d in existing_deals}

    for lead in leads:
        lid = lead.get("id")
        if not lid:
            continue
        p_conf = lead.get("proposal_config") or {}
        stage = lead.get("stage")

        if lid not in leads_with_deals and p_conf:
            deal_stage = "negotiation" if stage == "negotiation" else "opportunity_created"
            deal_status = "open"
            approval_status = None
            payment_cleared = False
            if lead.get("outcome") == "won":
                deal_status = "won"
                approval_status = lead.get("approval_status") or "pending_operations"
                payment_cleared = bool(lead.get("payment_cleared"))
            elif lead.get("outcome") == "lost":
                deal_status = "lost"

            services = p_conf.get("services") or ([lead["service"]] if lead.get("service") else ["General"])
            primary = services[0] if services else (lead.get("service") or "General")
            extras = services[1:] if len(services) > 1 else []
            value = _parse_budget_value(p_conf.get("budget") or lead.get("budget"))
            billing = _billing_from_cycle(p_conf.get("project_cycle"))
            title = p_conf.get("workspace_name") or lead.get("company") or lead.get("name") or "Deal"
            if primary and primary not in title:
                title = f"{title} — {primary}"
            probability = 60.0 if deal_stage == "proposal_sent" else 50.0

            deal_doc = {
                "id": f"deal-{uuid.uuid4().hex[:10]}",
                "lead_id": lid,
                "title": str(title)[:160],
                "service": str(primary)[:80],
                "additional_services": extras,
                "value": value,
                "currency": "PKR",
                "billing_type": billing,
                "stage": deal_stage,
                "status": deal_status,
                "deal_type": "new_business",
                "probability": probability,
                "expected_revenue": _compute_expected_revenue(value, probability),
                "expected_close_date": None,
                "payment_status": "cleared" if payment_cleared else "pending",
                "lost_reason": lead.get("lost_reason") or lead.get("disqualify_reason"),
                "approval_status": approval_status,
                "payment_cleared": payment_cleared,
                "proposal_url": p_conf.get("proposal_url"),
                "proposal_name": p_conf.get("proposal_name"),
                "proposal_size": p_conf.get("proposal_size"),
                "notes": p_conf.get("proposal_notes"),
                "workspace_name": p_conf.get("workspace_name") or lead.get("company") or lead.get("name"),
                "brand_color": p_conf.get("brand_color") or "#4f46e5",
                "priority": p_conf.get("priority") or "Medium",
                "contract_start_date": p_conf.get("contract_start_date"),
                "contract_end_date": p_conf.get("contract_end_date"),
                "poc_name": p_conf.get("poc_name") or lead.get("name"),
                "poc_email": p_conf.get("poc_email") or lead.get("email"),
                "poc_phone": p_conf.get("poc_phone") or lead.get("phone_e164") or lead.get("phone_raw"),
                "billing_name": p_conf.get("billing_name") or p_conf.get("poc_name") or lead.get("name"),
                "billing_email": p_conf.get("billing_email") or p_conf.get("poc_email") or lead.get("email"),
                "billing_phone": p_conf.get("billing_phone") or p_conf.get("poc_phone") or lead.get("phone_e164"),
                "next_follow_up_at": lead.get("next_follow_up_at"),
                "budget_display": p_conf.get("budget") or lead.get("budget"),
                "converted_workspace_id": lead.get("converted_workspace_id"),
                "created_at": lead.get("updated_at") or lead.get("created_at") or now,
                "updated_at": now,
                "created_by": lead.get("assigned_to") or lead.get("created_by"),
                "migrated_from_proposal_config": True,
            }
            await db.crm_deals.insert_one(deal_doc)
            migrated += 1
            leads_with_deals.add(lid)

        # Remap lead off commercial stages (keep outcome as-is for historical won/lost leads)
        if stage in ("proposal_sent", "negotiation"):
            # Prefer session_done if they had a meeting; otherwise qualified
            new_stage = "session_done" if stage == "negotiation" else "qualified"
            await db.crm_leads.update_one(
                {"id": lid},
                {"$set": {"stage": new_stage, "updated_at": now}},
            )

    if migrated:
        logger.info("Migrated %s proposal_config lead(s) into deals", migrated)
    return migrated


def build_create_payload_from_proposal_config(
    config: Dict[str, Any],
    lead: Dict[str, Any],
) -> CrmDealCreate:
    """Map proposal modal form payload → CrmDealCreate."""
    services = config.get("services") or ([lead.get("service")] if lead.get("service") else ["Website Dev"])
    primary = services[0] if services else "General"
    extras = [s for s in services[1:] if s]
    value = _parse_budget_value(config.get("budget"))
    billing = _billing_from_cycle(config.get("project_cycle"))
    ws_name = (config.get("workspace_name") or lead.get("company") or lead.get("name") or "Deal").strip()
    title = ws_name if primary in ws_name else f"{ws_name} — {primary}"

    return CrmDealCreate(
        title=title[:160],
        service=str(primary)[:80],
        additional_services=extras,
        value=value,
        currency="PKR",
        billing_type=billing,
        stage="opportunity_created",
        status="open",
        deal_type="new_business",
        probability=50.0,
        expected_revenue=_compute_expected_revenue(value, 50.0),
        payment_status="pending",
        proposal_url=config.get("proposal_url"),
        proposal_name=config.get("proposal_name"),
        proposal_size=config.get("proposal_size"),
        notes=config.get("proposal_notes"),
        workspace_name=ws_name,
        brand_color=config.get("brand_color") or "#4f46e5",
        priority=config.get("priority") or "Medium",
        contract_start_date=config.get("contract_start_date"),
        contract_end_date=config.get("contract_end_date"),
        poc_name=config.get("poc_name"),
        poc_email=config.get("poc_email"),
        poc_phone=config.get("poc_phone"),
        billing_name=config.get("billing_name"),
        billing_email=config.get("billing_email"),
        billing_phone=config.get("billing_phone"),
        budget_display=config.get("budget"),
        next_follow_up_at=config.get("next_follow_up_at"),
        expected_close_date=config.get("expected_close_date"),
    )
