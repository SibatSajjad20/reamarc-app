"""
Company Calendar REST API Router.
Handles public holidays, special events, and working Saturday overrides.
"""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query

from app.schemas.company_calendar import (
    CalendarEventCreate,
    CalendarEventUpdate,
    CalendarEventResponse,
    CalendarMonthResponse,
)
from app.schemas.error import ErrorResponse
from app.core.security import (
    get_current_user,
    require_internal_user,
    require_hr_or_admin,
)
from app.services import attendance_service

router = APIRouter(
    prefix="/company-calendar",
    tags=["Company Calendar & Holidays"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)


@router.get("", response_model=CalendarMonthResponse)
async def get_monthly_calendar_events(
    year: Optional[int] = Query(default=None, description="Year (e.g. 2026)"),
    month: Optional[int] = Query(default=None, description="Month (1 - 12)"),
    current_user: dict = Depends(require_internal_user),
):
    """
    Retrieve all calendar events, holidays, and working Saturday overrides for a specified month.
    """
    now = datetime.now(timezone.utc)
    target_year = year or now.year
    target_month = month or now.month
    return await attendance_service.get_calendar_events(year=target_year, month=target_month)


@router.post("", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
async def create_new_calendar_event(
    event_in: CalendarEventCreate,
    current_user: dict = Depends(require_hr_or_admin),
):
    """
    Create a new calendar event, public holiday, or working Saturday override (HR / Admin only).
    """
    return await attendance_service.create_calendar_event(event_in)


@router.delete("/{id}", response_model=dict)
async def delete_existing_calendar_event(
    id: str,
    current_user: dict = Depends(require_hr_or_admin),
):
    """
    Delete a company calendar event or holiday override (HR / Admin only).
    """
    return await attendance_service.delete_calendar_event(id)
