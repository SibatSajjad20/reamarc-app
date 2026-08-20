"""
Attendance REST API Router.
Provides endpoints for Check-In, Check-Out, Today's Punch Status, Personal Timesheets,
HR Daily Attendance Matrix, Monthly Punctuality Command Center, and Security Settings.
"""
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.schemas.attendance import (
    CheckInRequest,
    CheckOutRequest,
    BreakActionRequest,
    AttendanceRecordResponse,
    TodayAttendanceResponse,
    DailyMatrixResponse,
    MonthlyPunctualityResponse,
    MonthlyTimesheetResponse,
    SecuritySettingsSchema,
)
from app.models.attendance import AttendanceStatus
from app.schemas.error import ErrorResponse
from app.core.security import (
    get_current_user,
    require_internal_user,
    require_hr_or_admin,
    require_management_role,
    require_roles,
)
from app.services import attendance_service, attendance_excel

router = APIRouter(
    prefix="/attendance",
    tags=["Attendance & Timesheets"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)


class ManualAttendanceEntryRequest(BaseModel):
    user_id: str = Field(..., description="Target user ID")
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    check_in: Optional[str] = Field(default=None, description="Check-in time (HH:MM)")
    check_out: Optional[str] = Field(default=None, description="Check-out time (HH:MM)")
    status: Optional[AttendanceStatus] = Field(default=None, description="Attendance status override")
    notes: Optional[str] = Field(default=None, description="Administrative override notes")


def extract_client_ip(request: Request, body_ip: Optional[str] = None) -> str:
    """Extracts client public or intranet IP address from headers, body, or connection."""
    if body_ip and body_ip.strip():
        return body_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


@router.post("/check-in", response_model=AttendanceRecordResponse, status_code=status.HTTP_200_OK)
async def check_in(
    request: Request,
    check_in_req: CheckInRequest,
    current_user: dict = Depends(require_internal_user),
):
    """
    Punch In for the day.
    Enforces IP Whitelist (Tier 1) and GPS Geofencing (Tier 3), unless user has approved WFH.
    """
    client_ip = extract_client_ip(request, check_in_req.client_ip)
    return await attendance_service.process_check_in(
        user=current_user,
        check_in_req=check_in_req,
        client_ip=client_ip,
    )


@router.post("/check-out", response_model=AttendanceRecordResponse, status_code=status.HTTP_200_OK)
async def check_out(
    check_out_req: CheckOutRequest,
    current_user: dict = Depends(require_internal_user),
):
    """
    Punch Out for the day.
    Calculates net working hours, overtime, and undertime based on assigned shift.
    """
    return await attendance_service.process_check_out(
        user=current_user,
        check_out_req=check_out_req,
    )


@router.post("/break", response_model=AttendanceRecordResponse, status_code=status.HTTP_200_OK)
async def toggle_break(
    break_req: BreakActionRequest,
    current_user: dict = Depends(require_internal_user),
):
    """Start or end a live break on today's open attendance record."""
    return await attendance_service.process_break_toggle(
        user=current_user,
        break_req=break_req,
    )


@router.get("/today", response_model=TodayAttendanceResponse)
async def get_today_attendance(
    request: Request,
    current_user: dict = Depends(require_internal_user),
):
    """
    Returns today's punch status, active timer metrics, and assigned shift for the current user.
    """
    client_ip = extract_client_ip(request)
    return await attendance_service.get_today_status(user=current_user, client_ip=client_ip)


@router.get("/my-timesheet", response_model=MonthlyTimesheetResponse)
async def get_my_monthly_timesheet(
    year: Optional[int] = Query(default=None, description="Year (e.g. 2026)"),
    month: Optional[int] = Query(default=None, description="Month (1 - 12)"),
    current_user: dict = Depends(require_internal_user),
):
    """
    Returns the current user's monthly attendance logs and punctuality summary metrics.
    """
    now = datetime.now(timezone.utc)
    target_year = year or now.year
    target_month = month or now.month
    return await attendance_service.get_my_timesheet(
        user=current_user,
        year=target_year,
        month=target_month,
    )


@router.get("/matrix", response_model=DailyMatrixResponse)
async def get_daily_attendance_matrix(
    date: Optional[str] = Query(default=None, description="Target date YYYY-MM-DD"),
    department: Optional[str] = Query(default=None, description="Filter by department"),
    current_user: dict = Depends(require_roles(["admin", "hr", "operations", "team_lead", "team_member"])),
):
    """
    Company-wide live attendance grid for a date (replicates physical register).
    """
    return await attendance_service.get_daily_matrix(
        date_str=date,
        department=department,
    )


@router.get("/monthly-summary", response_model=MonthlyPunctualityResponse)
async def get_monthly_punctuality_summary(
    year: Optional[int] = Query(default=None, description="Year (e.g. 2026)"),
    month: Optional[int] = Query(default=None, description="Month (1 - 12)"),
    department: Optional[str] = Query(default=None, description="Filter by department"),
    current_user: dict = Depends(require_roles(["admin", "hr", "operations", "team_lead"])),
):
    """
    Company-wide Monthly Punctuality Summary aggregating:
    - Working days, Days Present, Leaves, Late Strikes, Short Leaves
    - Overtime, Undertime, Net Variance in HH:MM
    - Punctuality Score & Bonus Recommendation
    """
    now = datetime.now(timezone.utc)
    target_year = year or now.year
    target_month = month or now.month
    return await attendance_service.get_monthly_punctuality_summary(
        year=target_year,
        month=target_month,
        department=department,
    )


@router.get("/export/excel")
async def export_attendance_excel(
    year: Optional[int] = Query(default=None, description="Year (e.g. 2026)"),
    month: Optional[int] = Query(default=None, description="Month (1 - 12)"),
    department: Optional[str] = Query(default=None, description="Filter by department"),
    current_user: dict = Depends(require_roles(["admin", "hr", "operations", "team_lead", "team_member"])),
):
    """
    Exports company-wide attendance and monthly punctuality summary as a styled multi-tab Excel (.xlsx) workbook.
    - Tab 1: Company-wide Punctuality Summary.
    - Tabs 2 to N: Individual Employee Monthly Timesheets with color-coded styling.
    """
    now = datetime.now(timezone.utc)
    target_year = year or now.year
    target_month = month or now.month

    excel_bytes = await attendance_excel.generate_multi_tab_attendance_workbook(
        year=target_year,
        month=target_month,
        department=department,
    )

    filename = f"Reamarc_Attendance_Summary_{target_year}_{target_month:02d}.xlsx"
    return StreamingResponse(
        excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get("/settings", response_model=SecuritySettingsSchema)
async def get_security_settings(
    current_user: dict = Depends(require_internal_user),
):
    """Retrieves current IP Whitelist and GPS Geofencing security settings for all members."""
    return await attendance_service.get_security_settings()


@router.put("/settings", response_model=SecuritySettingsSchema)
async def update_security_settings(
    settings_in: SecuritySettingsSchema,
    current_user: dict = Depends(require_hr_or_admin),
):
    """Updates IP Whitelist and GPS Geofencing security settings (Admin/HR only)."""
    return await attendance_service.update_security_settings(settings_in)


@router.post("/admin/manual-entry", response_model=AttendanceRecordResponse)
async def admin_manual_entry(
    entry_req: ManualAttendanceEntryRequest,
    current_user: dict = Depends(require_roles(["admin", "hr", "operations", "team_lead"])),
):
    """HR / Admin manual attendance record creation or override."""
    return await attendance_service.admin_manual_attendance_entry(
        user_id=entry_req.user_id,
        date_str=entry_req.date,
        check_in=entry_req.check_in,
        check_out=entry_req.check_out,
        status_override=entry_req.status,
        notes=entry_req.notes,
        admin_user=current_user,
    )


@router.patch("/records/{record_id}/override", response_model=AttendanceRecordResponse)
async def override_attendance(
    record_id: str,
    override_payload: dict,
    current_user: dict = Depends(require_roles(["admin", "hr", "operations", "team_lead"])),
):
    """HR / Admin attendance record override by record ID or employee ID."""
    return await attendance_service.override_attendance_record(
        target_id=record_id,
        override_data=override_payload,
        admin_user=current_user,
    )
