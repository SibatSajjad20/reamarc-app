"""
Reamarc CRM — web Phases 1–5.

Phases (web only; mobile is deferred):
  1. Lead CRUD, E.164 phones, manual assign, disqualify, timeline notes
  2. Shift-aware round-robin + atomic claim + SLA
  3. Templates + follow-up scheduler
  4. Signed webhook + Meta leadgen
  5. Kanban + convert-to-workspace + win rate
Never merge/push to main until the user confirms.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from app.core.security import get_current_user
from app.schemas.crm import (
    CrmActivityResponse,
    CrmApproveWonRequest,
    CrmAssignRequest,
    CrmAssigneeResponse,
    CrmConvertRequest,
    CrmCountsResponse,
    CrmDealApproveWonRequest,
    CrmDealCreate,
    CrmDealListResponse,
    CrmDealOutcomeRequest,
    CrmDealPipelineResponse,
    CrmDealReopenRequest,
    CrmDealResponse,
    CrmDealUpdate,
    CrmDisqualifyRequest,
    CrmFollowUpRequest,
    CrmIngestSourceCreate,
    CrmIngestSourceResponse,
    CrmIngestSourceUpdate,
    CrmLeadCreate,
    CrmLeadDetailResponse,
    CrmLeadListResponse,
    CrmLeadResponse,
    CrmLeadUpdate,
    CrmNoteRequest,
    CrmOutcomeRequest,
    CrmPipelineResponse,
    CrmPipelineStage,
    CrmReopenRequest,
    CrmRuleCreate,
    CrmRuleResponse,
    CrmRuleUpdate,
    CrmTemplateCreate,
    CrmTemplateResponse,
    CrmTemplateUpdate,
    CrmWhatsAppOpenRequest,
    CrmWhatsAppOpenResponse,
)
from app.schemas.error import ErrorResponse
from app.services.crm_access import can_assign_leads, require_crm_user
from app.services import crm_assignment
from app.services import crm_deals
from app.services import crm_ingest
from app.services import crm_leads as crm
from app.services import crm_templates

router = APIRouter(
    prefix="/crm",
    tags=["CRM Leads"],
    dependencies=[Depends(require_crm_user)],
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)


@router.get("/pipeline", response_model=CrmPipelineResponse)
async def get_pipeline(_user: dict = Depends(get_current_user)):
    pipe = await crm.ensure_default_pipeline()
    stages = [CrmPipelineStage(**s) for s in pipe.get("stages") or crm.DEFAULT_STAGES]
    stages.sort(key=lambda s: s.order)
    return CrmPipelineResponse(stages=stages)


@router.get("/deal-pipeline", response_model=CrmDealPipelineResponse)
async def get_deal_pipeline(_user: dict = Depends(get_current_user)):
    stages = [CrmPipelineStage(**s) for s in crm_deals.deal_pipeline_stages()]
    stages.sort(key=lambda s: s.order)
    return CrmDealPipelineResponse(stages=stages)


@router.get("/assignees", response_model=list[CrmAssigneeResponse])
async def get_assignees(_user: dict = Depends(get_current_user)):
    return await crm.list_assignees()


@router.get("/counts", response_model=CrmCountsResponse)
async def get_counts(current_user: dict = Depends(get_current_user)):
    return CrmCountsResponse(**await crm.lead_counts(current_user))


@router.get("/leads", response_model=CrmLeadListResponse)
async def list_leads(
    current_user: dict = Depends(get_current_user),
    search: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    include_junk: bool = Query(False),
    uncontacted: Optional[bool] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    skip: int = Query(0, ge=0),
):
    items, total = await crm.list_leads(
        current_user,
        search=search,
        stage=stage,
        assigned_to=assigned_to,
        include_junk=include_junk,
        uncontacted=uncontacted,
        limit=limit,
        skip=skip,
    )
    return CrmLeadListResponse(items=[CrmLeadResponse(**i) for i in items], total=total)


@router.post("/leads", response_model=CrmLeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(payload: CrmLeadCreate, current_user: dict = Depends(get_current_user)):
    return CrmLeadResponse(**await crm.create_lead(payload, current_user))


@router.get("/leads/{lead_id}", response_model=CrmLeadDetailResponse)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await crm.get_lead_or_404(lead_id, current_user)
    activities = await crm.list_activities(lead_id, current_user)
    return CrmLeadDetailResponse(**crm.serialize_lead(lead), activities=[CrmActivityResponse(**a) for a in activities])


@router.patch("/leads/{lead_id}", response_model=CrmLeadResponse)
async def patch_lead(lead_id: str, payload: CrmLeadUpdate, current_user: dict = Depends(get_current_user)):
    return CrmLeadResponse(**await crm.update_lead(lead_id, payload, current_user))


@router.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    await crm.delete_lead(lead_id, current_user)



@router.post("/leads/{lead_id}/assign", response_model=CrmLeadResponse)
async def assign_lead(lead_id: str, payload: CrmAssignRequest, current_user: dict = Depends(get_current_user)):
    return CrmLeadResponse(**await crm.assign_lead(lead_id, payload.user_id, current_user))


@router.post("/leads/{lead_id}/disqualify", response_model=CrmLeadResponse)
async def disqualify_lead(lead_id: str, payload: CrmDisqualifyRequest, current_user: dict = Depends(get_current_user)):
    return CrmLeadResponse(
        **await crm.set_outcome(lead_id, "disqualified", current_user, reason=payload.reason, note=payload.note)
    )


@router.post("/leads/{lead_id}/outcome", response_model=CrmLeadResponse)
async def set_outcome(lead_id: str, payload: CrmOutcomeRequest, current_user: dict = Depends(get_current_user)):
    if payload.outcome not in ("won", "lost"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use /disqualify for junk leads.")
    return CrmLeadResponse(
        **await crm.set_outcome(
            lead_id,
            payload.outcome,
            current_user,
            reason=payload.reason,
            note=payload.note,
        )
    )


@router.post("/leads/{lead_id}/convert", response_model=CrmLeadResponse)
async def convert_lead(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    payload: CrmConvertRequest = Body(default_factory=CrmConvertRequest),
):
    """Mark Won and create/link an Active Client workspace."""
    return CrmLeadResponse(
        **await crm.convert_to_workspace(lead_id, current_user, workspace_id=payload.workspace_id)
    )


@router.post("/leads/{lead_id}/approve-won", response_model=CrmLeadResponse)
async def approve_won(
    lead_id: str,
    payload: CrmApproveWonRequest = Body(default_factory=CrmApproveWonRequest),
    current_user: dict = Depends(get_current_user),
):
    """Operations / Admin approval of a won deal, confirming payment cleared and creating client workspace."""
    return CrmLeadResponse(
        **await crm.approve_won_lead(lead_id, current_user, payload=payload.model_dump())
    )


@router.post("/leads/{lead_id}/reopen", response_model=CrmLeadResponse)
async def reopen_lead(
    lead_id: str,
    payload: CrmReopenRequest = Body(default_factory=CrmReopenRequest),
    current_user: dict = Depends(get_current_user),
):
    """Admin / Operations reopening of a closed lead back into an active pipeline stage."""
    return CrmLeadResponse(
        **await crm.reopen_lead(lead_id, current_user, target_stage=payload.target_stage or "contacted", note=payload.note)
    )


@router.get("/leads/{lead_id}/deals", response_model=CrmDealListResponse)
async def list_deals(lead_id: str, current_user: dict = Depends(get_current_user)):
    """List all commercial deals/opportunities attached to this lead."""
    await crm.get_lead_or_404(lead_id, current_user)
    deals = await crm_deals.list_deals_for_lead(lead_id)
    return CrmDealListResponse(
        deals=[CrmDealResponse(**d) for d in deals],
        total_count=len(deals),
        total_value=sum(float(d.get("value") or 0.0) for d in deals if d.get("status") == "open"),
    )


@router.get("/deals", response_model=CrmDealListResponse)
async def list_all_deals(
    current_user: dict = Depends(get_current_user),
    search: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    lead_id: Optional[str] = Query(None),
    limit: int = Query(300, ge=1, le=500),
    skip: int = Query(0, ge=0),
):
    """List deals across visible leads for the deal pipeline board."""
    deals, total_count, total_value = await crm_deals.list_deals(
        current_user,
        search=search,
        stage=stage,
        status_filter=status_filter,
        lead_id=lead_id,
        limit=limit,
        skip=skip,
    )
    return CrmDealListResponse(
        deals=[CrmDealResponse(**d) for d in deals],
        total_count=total_count,
        total_value=total_value,
    )


@router.post("/leads/{lead_id}/deals", response_model=CrmDealResponse)
async def create_deal(lead_id: str, payload: CrmDealCreate, current_user: dict = Depends(get_current_user)):
    """Add a new commercial deal to a lead."""
    return CrmDealResponse(**await crm_deals.create_deal(lead_id, payload, current_user))


@router.patch("/deals/{deal_id}", response_model=CrmDealResponse)
async def update_deal(deal_id: str, payload: CrmDealUpdate, current_user: dict = Depends(get_current_user)):
    """Update a specific deal (value, stage, status, etc.)."""
    return CrmDealResponse(**await crm_deals.update_deal(deal_id, payload, current_user))


@router.post("/deals/{deal_id}/won", response_model=CrmDealResponse)
async def mark_deal_won(
    deal_id: str,
    payload: CrmDealOutcomeRequest = Body(default_factory=CrmDealOutcomeRequest),
    current_user: dict = Depends(get_current_user),
):
    """Mark a deal as won (pending Operations approval). Does not close the lead."""
    return CrmDealResponse(
        **await crm_deals.set_deal_outcome(deal_id, "won", current_user, note=payload.note, reason=payload.reason)
    )


@router.post("/deals/{deal_id}/lost", response_model=CrmDealResponse)
async def mark_deal_lost(
    deal_id: str,
    payload: CrmDealOutcomeRequest = Body(default_factory=CrmDealOutcomeRequest),
    current_user: dict = Depends(get_current_user),
):
    """Mark a deal as lost. Requires a reason. Does not close the lead."""
    return CrmDealResponse(
        **await crm_deals.set_deal_outcome(deal_id, "lost", current_user, note=payload.note, reason=payload.reason)
    )


@router.post("/deals/{deal_id}/reopen", response_model=CrmDealResponse)
async def reopen_deal(
    deal_id: str,
    payload: CrmDealReopenRequest = Body(default_factory=CrmDealReopenRequest),
    current_user: dict = Depends(get_current_user),
):
    """Admin / Operations reopen a closed deal back into an active deal stage."""
    return CrmDealResponse(
        **await crm_deals.reopen_deal(
            deal_id,
            current_user,
            target_stage=payload.target_stage or "opportunity_created",
            note=payload.note,
        )
    )


@router.post("/deals/{deal_id}/approve-won", response_model=CrmDealResponse)
async def approve_won_deal(
    deal_id: str,
    payload: CrmDealApproveWonRequest = Body(default_factory=CrmDealApproveWonRequest),
    current_user: dict = Depends(get_current_user),
):
    """Operations approve a won deal and create/link an Active Client workspace."""
    return CrmDealResponse(
        **await crm_deals.approve_won_deal(deal_id, current_user, payload=payload.model_dump())
    )


@router.delete("/deals/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(deal_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a deal."""
    await crm_deals.delete_deal(deal_id, current_user)
    return None


@router.post("/leads/{lead_id}/notes", response_model=CrmLeadResponse)
async def add_note(lead_id: str, payload: CrmNoteRequest, current_user: dict = Depends(get_current_user)):
    return CrmLeadResponse(**await crm.add_note(lead_id, payload.body, current_user))


@router.post("/leads/{lead_id}/whatsapp-opened", response_model=CrmWhatsAppOpenResponse)
async def whatsapp_opened(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    payload: CrmWhatsAppOpenRequest = Body(default_factory=CrmWhatsAppOpenRequest),
):
    data = await crm.log_whatsapp_opened(
        lead_id,
        current_user,
        template_id=payload.template_id,
    )
    return CrmWhatsAppOpenResponse(**data)


@router.post("/leads/{lead_id}/follow-up", response_model=CrmLeadResponse)
async def set_follow_up(lead_id: str, payload: CrmFollowUpRequest, current_user: dict = Depends(get_current_user)):
    return CrmLeadResponse(**await crm.set_follow_up(lead_id, payload.next_follow_up_at, current_user))


@router.post("/leads/{lead_id}/contacted", response_model=CrmLeadResponse)
async def mark_contacted(lead_id: str, current_user: dict = Depends(get_current_user)):
    return CrmLeadResponse(**await crm.mark_contacted(lead_id, current_user))


@router.post("/leads/{lead_id}/claim", response_model=CrmLeadResponse)
async def claim_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    return CrmLeadResponse(**await crm_assignment.claim_lead(lead_id, current_user))


@router.post("/leads/{lead_id}/apply-rules", response_model=CrmLeadResponse)
async def apply_rules(lead_id: str, current_user: dict = Depends(get_current_user)):
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot re-run assignment rules.")
    lead = await crm.get_lead_or_404(lead_id, current_user)
    if lead.get("assigned_to"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unassign the lead before re-running rules.")
    return CrmLeadResponse(**await crm_assignment.apply_assignment_engine(lead_id, actor=current_user))


@router.get("/rules", response_model=list[CrmRuleResponse])
async def list_rules(_user: dict = Depends(get_current_user)):
    return [CrmRuleResponse(**r) for r in await crm_assignment.list_rules()]


@router.post("/rules", response_model=CrmRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(payload: CrmRuleCreate, current_user: dict = Depends(get_current_user)):
    return CrmRuleResponse(**await crm_assignment.create_rule(payload.model_dump(), current_user))


@router.patch("/rules/{rule_id}", response_model=CrmRuleResponse)
async def patch_rule(rule_id: str, payload: CrmRuleUpdate, current_user: dict = Depends(get_current_user)):
    return CrmRuleResponse(**await crm_assignment.update_rule(rule_id, payload.model_dump(exclude_unset=True), current_user))


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    await crm_assignment.delete_rule(rule_id, current_user)
    return None


@router.get("/templates", response_model=list[CrmTemplateResponse])
async def list_templates(_user: dict = Depends(get_current_user)):
    return [CrmTemplateResponse(**t) for t in await crm_templates.list_templates()]


@router.post("/templates", response_model=CrmTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(payload: CrmTemplateCreate, current_user: dict = Depends(get_current_user)):
    return CrmTemplateResponse(**await crm_templates.create_template(payload.model_dump(), current_user))


@router.patch("/templates/{template_id}", response_model=CrmTemplateResponse)
async def patch_template(template_id: str, payload: CrmTemplateUpdate, current_user: dict = Depends(get_current_user)):
    return CrmTemplateResponse(
        **await crm_templates.update_template(template_id, payload.model_dump(exclude_unset=True), current_user)
    )


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    await crm_templates.delete_template(template_id, current_user)
    return None


@router.get("/ingest-sources", response_model=list[CrmIngestSourceResponse])
async def list_ingest_sources(current_user: dict = Depends(get_current_user)):
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can manage ingest sources.")
    return [CrmIngestSourceResponse(**s) for s in await crm_ingest.list_sources()]


@router.post("/ingest-sources", response_model=CrmIngestSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_ingest_source(payload: CrmIngestSourceCreate, current_user: dict = Depends(get_current_user)):
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can manage ingest sources.")
    return CrmIngestSourceResponse(**await crm_ingest.create_source(payload.model_dump(), current_user))


@router.patch("/ingest-sources/{source_id}", response_model=CrmIngestSourceResponse)
async def patch_ingest_source(
    source_id: str,
    payload: CrmIngestSourceUpdate,
    current_user: dict = Depends(get_current_user),
):
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can manage ingest sources.")
    return CrmIngestSourceResponse(
        **await crm_ingest.update_source(source_id, payload.model_dump(exclude_unset=True), current_user)
    )


@router.delete("/ingest-sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ingest_source(source_id: str, current_user: dict = Depends(get_current_user)):
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can manage ingest sources.")
    await crm_ingest.delete_source(source_id, current_user)
    return None


@router.post("/meta/poll")
async def poll_meta_leads(current_user: dict = Depends(get_current_user)):
    """Backup: poll configured Meta lead forms (CRM_META_FORM_IDS)."""
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can poll Meta forms.")
    return await crm_ingest.poll_configured_meta_forms()


@router.get("/meta/pages")
async def list_meta_pages(current_user: dict = Depends(get_current_user)):
    """List connected Meta Pages (multi-page configuration and .env fallback)."""
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can view connected Meta pages.")
    from app.services import crm_meta_accounts

    return await crm_meta_accounts.list_connected_pages()


@router.post("/meta/pages", status_code=status.HTTP_201_CREATED)
async def connect_meta_page(payload: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """Connect a Meta Facebook/Instagram Page with encrypted access token."""
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can connect Meta pages.")
    from app.services import crm_meta_accounts

    return await crm_meta_accounts.upsert_connected_page(payload, current_user)


@router.delete("/meta/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_meta_page(page_id: str, current_user: dict = Depends(get_current_user)):
    """Disconnect a Meta Facebook Page."""
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can disconnect Meta pages.")
    from app.services import crm_meta_accounts

    await crm_meta_accounts.delete_connected_page(page_id, current_user)
    return None


@router.get("/ingest/queue-stats")
async def get_lead_queue_stats(current_user: dict = Depends(get_current_user)):
    """Health monitor: get status metrics for incoming lead event buffer."""
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can view queue metrics.")
    from app.services import crm_lead_processor

    return await crm_lead_processor.get_queue_stats()


# ==============================================================================
# REAMARC MEETING SCHEDULER SETTINGS
# ==============================================================================

@router.get("/scheduler/settings")
async def get_crm_scheduler_settings(current_user: dict = Depends(get_current_user)):
    """Retrieve internal scheduler configuration and working hours."""
    from app.services import crm_scheduler

    return await crm_scheduler.get_scheduler_settings()


@router.patch("/scheduler/settings")
async def update_crm_scheduler_settings(
    payload: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
):
    """Update meeting scheduler settings (working hours, duration, services, meeting link)."""
    if not can_assign_leads(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can update scheduler settings.")
    from app.services import crm_scheduler

    return await crm_scheduler.update_scheduler_settings(payload, current_user)

