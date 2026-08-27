"""
Leaves & Requests REST API Router.
Handles self-service requests (Full Leaves, Short Leaves, WFH, Regularization)
and HR / Lead approval workflow with Dynamic Synchronization.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query

from app.schemas.leave import (
    LeaveCreateRequest,
    LeaveReviewRequest,
    LeaveClarificationRequest,
    LeaveAppealRequest,
    LeaveStatusEditRequest,
    LeaveResponse,
    LeaveBalanceResponse,
    LeaveBalanceUpdateRequest,
)
from app.schemas.error import ErrorResponse
from app.core.security import (
    get_current_user,
    require_internal_user,
    require_roles,
    require_hr_or_admin,
)
from app.services import attendance_service

router = APIRouter(
    prefix="/leaves",
    tags=["Leaves, WFH & Regularization Requests"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)


@router.post("/requests", response_model=LeaveResponse, status_code=status.HTTP_201_CREATED)
async def submit_leave_or_wfh_request(
    request_in: LeaveCreateRequest,
    current_user: dict = Depends(require_internal_user),
):
    """
    Submit a new leave, WFH, short leave (1-3 hours), or missed punch regularization request.
    """
    return await attendance_service.submit_leave_request(
        user=current_user,
        req=request_in,
    )


@router.get("/requests", response_model=List[LeaveResponse])
async def get_all_or_user_requests(
    status: Optional[str] = Query(default=None, description="Filter by status (pending, approved, rejected, all)"),
    department: Optional[str] = Query(default=None, description="Filter requests by department"),
    current_user: dict = Depends(require_internal_user),
):
    """
    Get leave/WFH/regularization requests across all statuses.
    If Admin/HR/Operations, returns all organization or department requests.
    Otherwise returns current user's requests.
    """
    user_role = current_user.get("role")
    if user_role in ["admin", "hr", "operations"]:
        return await attendance_service.get_all_leave_requests(
            status_filter=status,
            department=department,
            viewer_user=current_user,
        )
    return await attendance_service.get_all_leave_requests(
        status_filter=status,
        user_id=current_user.get("id"),
        viewer_user=current_user,
    )


@router.get("/my-requests", response_model=List[LeaveResponse])
async def get_my_leave_requests(
    status: Optional[str] = Query(default=None, description="Filter by status"),
    current_user: dict = Depends(require_internal_user),
):
    """
    Get all leave/WFH/regularization requests submitted by the current user across all statuses.
    """
    return await attendance_service.get_all_leave_requests(
        status_filter=status,
        user_id=current_user.get("id"),
        viewer_user=current_user,
    )


@router.get("/pending", response_model=List[LeaveResponse])
async def get_pending_requests(
    department: Optional[str] = Query(default=None, description="Filter pending requests by department"),
    current_user: dict = Depends(require_roles(["admin", "hr", "operations"])),
):
    """
    Get all pending leave requests for Admin, HR, and Operations review inbox.
    """
    return await attendance_service.get_pending_leave_requests(
        department=department,
        viewer_user=current_user,
    )


@router.patch("/requests/{id}/status", response_model=LeaveResponse)
async def review_leave_request(
    id: str,
    review_in: LeaveReviewRequest,
    current_user: dict = Depends(require_roles(["admin", "hr", "operations"])),
):
    """
    Approve, reject, or request clarification on a request with audit comments and trigger DYNAMIC SYNCHRONIZATION:
    - Missed punch regularization updates daily attendance record and recalculates work hours.
    - Approved WFH enables security bypass.
    - Approved short leaves credit work hours.
    - Overtime approval/rejection dynamically settles daily hours.
    """
    return await attendance_service.review_leave_request(
        request_id=id,
        reviewer_user=current_user,
        review_data=review_in,
    )


@router.post("/requests/{id}/clarify", response_model=LeaveResponse)
async def clarify_leave_request(
    id: str,
    clarify_in: LeaveClarificationRequest,
    current_user: dict = Depends(require_internal_user),
):
    """
    Applicant submits clarification in response to HR/Admin request,
    reopening the request back to 'pending'.
    """
    return await attendance_service.submit_leave_clarification(
        request_id=id,
        current_user=current_user,
        clarification_response=clarify_in.clarification_response,
    )


@router.post("/requests/{id}/appeal", response_model=LeaveResponse)
async def appeal_leave_request(
    id: str,
    appeal_in: LeaveAppealRequest,
    current_user: dict = Depends(require_internal_user),
):
    """
    Applicant submits a single-use appeal against a rejected request,
    setting status to 'appealed'.
    """
    return await attendance_service.submit_leave_appeal(
        request_id=id,
        current_user=current_user,
        appeal_reason=appeal_in.appeal_reason,
    )


@router.post("/requests/{id}/edit-status", response_model=LeaveResponse)
async def edit_leave_request_status(
    id: str,
    edit_in: LeaveStatusEditRequest,
    current_user: dict = Depends(require_roles(["admin", "hr", "operations"])),
):
    """
    Modify/reverse an already approved or rejected request status with mandatory audit reason
    and dynamic timesheet recalculation.
    """
    return await attendance_service.edit_leave_request_status(
        request_id=id,
        reviewer_user=current_user,
        new_status=edit_in.new_status,
        reason=edit_in.reason,
    )


@router.delete("/requests/{id}", response_model=dict)
async def delete_leave_request(
    id: str,
    current_user: dict = Depends(require_internal_user),
):
    """
    Delete a pending request.
    Allowed if the current user is the applicant or an Admin.
    HR and Operations cannot delete someone else's request.
    """
    success = await attendance_service.delete_leave_request(
        request_id=id,
        current_user=current_user,
    )
    return {"success": success, "message": "Request deleted successfully"}


@router.get("/balances/me", response_model=LeaveBalanceResponse)
async def get_my_leave_balance(
    year: Optional[int] = Query(default=None),
    current_user: dict = Depends(require_internal_user),
):
    from app.services import leave_balance
    return await leave_balance.get_balance_for_user(current_user, year)


@router.get("/balances", response_model=List[LeaveBalanceResponse])
async def list_leave_balances(
    year: Optional[int] = Query(default=None),
    current_user: dict = Depends(require_hr_or_admin),
):
    from app.services import leave_balance
    return await leave_balance.list_balances(year)


@router.put("/balances/{user_id}", response_model=LeaveBalanceResponse)
async def update_leave_opening_balance(
    user_id: str,
    payload: LeaveBalanceUpdateRequest,
    current_user: dict = Depends(require_hr_or_admin),
):
    from app.services import leave_balance
    return await leave_balance.update_opening_balance(user_id, payload)

