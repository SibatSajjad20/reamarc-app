"""Won-deal approvals for operations (and capability holders) outside require_crm_user."""
from typing import List, Optional

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, Field

from app.schemas.error import ErrorResponse
from app.services import crm_deals
from app.services.permissions import require_capability

require_approve_won_deal = require_capability("approve_won_deal")

router = APIRouter(
    prefix="/crm/approvals",
    tags=["CRM Won-deal Approvals"],
    dependencies=[Depends(require_approve_won_deal)],
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)


class WonDealApprovalItem(BaseModel):
    id: str
    title: str
    value: float
    currency: str
    won_date: str = ""
    sales_owner_name: str = ""
    lead_or_company_name: str = ""
    won_note: str = ""


class WonDealRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)


class WonDealApproveRequest(BaseModel):
    workspace_name: Optional[str] = None
    brand_color: Optional[str] = None
    priority: Optional[str] = None
    services: Optional[List[str]] = None
    project_cycle: Optional[str] = None


@router.get("/won-deals", response_model=List[WonDealApprovalItem])
async def list_won_deal_approvals(current_user: dict = Depends(require_approve_won_deal)):
    items = await crm_deals.list_pending_won_approvals(current_user)
    return [WonDealApprovalItem(**row) for row in items]


@router.post("/won-deals/{deal_id}/approve")
async def approve_won_deal_approval(
    deal_id: str,
    payload: WonDealApproveRequest = Body(default_factory=WonDealApproveRequest),
    current_user: dict = Depends(require_approve_won_deal),
):
    return await crm_deals.approve_won_deal(deal_id, current_user, payload=payload.model_dump())


@router.post("/won-deals/{deal_id}/reject")
async def reject_won_deal_approval(
    deal_id: str,
    payload: WonDealRejectRequest,
    current_user: dict = Depends(require_approve_won_deal),
):
    return await crm_deals.reject_won_deal(deal_id, current_user, reason=payload.reason)
