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
    LeaveResponse,
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
    If HR/Lead/Admin/Operations, returns all organization or department requests.
    Otherwise returns current user's requests.
    """
    user_role = current_user.get("role")
    if user_role in ["admin", "hr", "operations", "team_lead"]:
        return await attendance_service.get_all_leave_requests(
            status_filter=status,
            department=department,
        )
    return await attendance_service.get_all_leave_requests(
        status_filter=status,
        user_id=current_user.get("id"),
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
    )


@router.get("/pending", response_model=List[LeaveResponse])
async def get_pending_requests(
    department: Optional[str] = Query(default=None, description="Filter pending requests by department"),
    current_user: dict = Depends(require_roles(["admin", "hr", "operations", "team_lead"])),
):
    """
    Get all pending leave requests for HR, Team Lead, and Admin review inbox.
    """
    return await attendance_service.get_pending_leave_requests(department=department)


@router.patch("/requests/{id}/status", response_model=LeaveResponse)
async def review_leave_request(
    id: str,
    review_in: LeaveReviewRequest,
    current_user: dict = Depends(require_roles(["admin", "hr", "operations", "team_lead"])),
):
    """
    Approve or reject a request with audit comments and trigger DYNAMIC SYNCHRONIZATION:
    - Missed punch regularization updates daily attendance record and recalculates work hours.
    - Approved WFH enables security bypass.
    - Approved short leaves credit work hours.
    """
    return await attendance_service.review_leave_request(
        request_id=id,
        reviewer_user=current_user,
        review_data=review_in,
    )


@router.delete("/requests/{id}", response_model=dict)
async def delete_leave_request(
    id: str,
    current_user: dict = Depends(require_internal_user),
):
    """
    Delete a request (e.g. accidental or incorrect submission).
    Allowed if the current user is the applicant or an Admin/HR.
    """
    success = await attendance_service.delete_leave_request(
        request_id=id,
        current_user=current_user,
    )
    return {"success": success, "message": "Request deleted successfully"}
