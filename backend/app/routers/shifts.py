"""
Shifts Management REST API Router.
Provides endpoints for Shift Templates CRUD and User Shift Assignments.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.shift import (
    ShiftCreate,
    ShiftUpdate,
    ShiftResponse,
    ShiftAssignmentRequest,
)
from app.schemas.error import ErrorResponse
from app.core.security import (
    get_current_user,
    require_hr_or_admin,
    require_internal_user,
)
from app.services import attendance_service

router = APIRouter(
    prefix="/shifts",
    tags=["Shifts & Shift Management"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)


@router.get("", response_model=List[ShiftResponse])
async def list_shifts(
    include_inactive: bool = False,
    current_user: dict = Depends(require_internal_user),
):
    """List all active shift templates (or all including inactive if specified)."""
    return await attendance_service.get_all_shifts(include_inactive=include_inactive)


@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_new_shift(
    shift_in: ShiftCreate,
    current_user: dict = Depends(require_hr_or_admin),
):
    """Create a new shift template (HR / Admin only)."""
    return await attendance_service.create_shift(shift_in)


@router.get("/assignments", response_model=List[dict])
async def list_shift_assignments(
    current_user: dict = Depends(require_internal_user),
):
    """List all user shift assignments."""
    return await attendance_service.get_user_shift_assignments()


@router.post("/assignments", response_model=dict)
async def assign_shift_to_user(
    assignment: ShiftAssignmentRequest,
    current_user: dict = Depends(require_hr_or_admin),
):
    """Assign or update a user's designated shift template (HR / Admin only)."""
    return await attendance_service.assign_user_shift(assignment)


@router.get("/{id}", response_model=ShiftResponse)
async def get_shift_details(
    id: str,
    current_user: dict = Depends(require_internal_user),
):
    """Retrieve details of a specific shift template."""
    shift = await attendance_service.get_shift_by_id(id)
    if not shift:
        raise HTTPException(status_code=404, detail=f"Shift '{id}' not found")
    return shift


@router.put("/{id}", response_model=ShiftResponse)
async def update_existing_shift(
    id: str,
    shift_in: ShiftUpdate,
    current_user: dict = Depends(require_hr_or_admin),
):
    """Update an existing shift template (HR / Admin only)."""
    return await attendance_service.update_shift(id, shift_in)


@router.delete("/{id}", response_model=dict)
async def delete_existing_shift(
    id: str,
    current_user: dict = Depends(require_hr_or_admin),
):
    """Deactivate or remove a shift template (HR / Admin only)."""
    return await attendance_service.delete_shift(id)
