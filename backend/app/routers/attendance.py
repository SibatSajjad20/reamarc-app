"""
Attendance REST API Router.
Provides endpoints for Check-In, Check-Out, Today's Punch Status, Personal Timesheets,
HR Daily Attendance Matrix, Monthly Punctuality Command Center, and Security Settings.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.responses import StreamingResponse

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
    OverrideAttendanceRequest,
    MissedPunchInquiryCreate,
    MissedPunchInquiryRespond,
    MissedPunchInquiryResponse,
)
from app.models.attendance import AttendanceStatus
from app.schemas.error import ErrorResponse
from app.core.security import (
    require_internal_user,
    require_hr_or_admin,
    require_management_role,
)
from app.services.attendance_security import (
    is_loopback_ip,
    is_public_ip,
)
from app.services import attendance_service

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
    """
    Resolve the connecting client IP using one trusted reverse proxy (Render).

    Render documents X-Forwarded-For as: original client first, then proxies.
    We take the left-most public IP so home/office WAN addresses match the
    whitelist. Spoofable headers (X-Real-IP, CF-Connecting-IP) are ignored.
    Browser-detected IPs are accepted only on loopback (local Vite).
    """
    socket_ip = request.client.host if request.client and request.client.host else None

    forwarded = request.headers.get("x-forwarded-for") or ""
    parts = [part.strip() for part in forwarded.split(",") if part.strip()]
    trusted_from_xff = None
    for part in parts:
        if is_public_ip(part):
            trusted_from_xff = part
            break

    if trusted_from_xff:
        return trusted_from_xff

    if is_public_ip(socket_ip):
        return str(socket_ip).strip()

    if is_loopback_ip(socket_ip) and body_ip and is_public_ip(str(body_ip).strip()):
        return str(body_ip).strip()

    if socket_ip:
        return socket_ip

    return "127.0.0.1"


def extract_detected_public_ip(request: Request, body_ip: Optional[str] = None) -> Optional[str]:
    socket_ip = request.client.host if request.client and request.client.host else None
    if not is_loopback_ip(socket_ip):
        return None
    header_ip = (request.headers.get("x-detected-public-ip") or "").strip()
    if header_ip and is_public_ip(header_ip):
        return header_ip
    if body_ip and is_public_ip(str(body_ip).strip()):
        return str(body_ip).strip()
    return None


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
    client_ip = extract_client_ip(
        request,
        check_in_req.detected_public_ip or check_in_req.client_ip,
    )
    if not check_in_req.detected_public_ip:
        check_in_req.detected_public_ip = extract_detected_public_ip(
            request,
            check_in_req.client_ip,
        )
    return await attendance_service.process_check_in(
        user=current_user,
        check_in_req=check_in_req,
        client_ip=client_ip,
    )


@router.post("/check-out", response_model=AttendanceRecordResponse, status_code=status.HTTP_200_OK)
async def check_out(
    request: Request,
    check_out_req: CheckOutRequest,
    current_user: dict = Depends(require_internal_user),
):
    """
    Punch Out for the day.
    Mobile app only. Calculates net working hours, overtime, and undertime.
    """
    client_ip = extract_client_ip(request)
    return await attendance_service.process_check_out(
        user=current_user,
        check_out_req=check_out_req,
        client_ip=client_ip,
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
    detected_public_ip = extract_detected_public_ip(request)
    return await attendance_service.get_today_status(
        user=current_user,
        client_ip=client_ip,
        detected_public_ip=detected_public_ip,
    )


class AttendanceConfigResponse(BaseModel):
    go_live_date: str
    test_start_date: str
    effective_start_date: str
    timezone: str = "Asia/Karachi"
    go_live_reached: bool


@router.get("/config", response_model=AttendanceConfigResponse)
async def get_attendance_config(
    current_user: dict = Depends(require_internal_user),
):
    """Go-live cutoff used by date pickers and the midnight purge."""
    from app.services.attendance_golive import (
        ATTENDANCE_GO_LIVE_DATE,
        ATTENDANCE_TEST_START_DATE,
        get_effective_start_date,
        is_go_live_reached,
        pkt_today_str,
    )
    today = pkt_today_str()
    return AttendanceConfigResponse(
        go_live_date=ATTENDANCE_GO_LIVE_DATE,
        test_start_date=ATTENDANCE_TEST_START_DATE,
        effective_start_date=get_effective_start_date(today),
        go_live_reached=is_go_live_reached(today),
    )


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


@router.get("/timesheet/{user_id}", response_model=MonthlyTimesheetResponse)
async def get_employee_monthly_timesheet(
    user_id: str,
    year: Optional[int] = Query(default=None, description="Year (e.g. 2026)"),
    month: Optional[int] = Query(default=None, description="Month (1 - 12)"),
    current_user: dict = Depends(require_management_role),
):
    """
    Admin / HR / Operations view of an individual employee's monthly attendance timesheet.
    Employees cannot reach this route; they use /my-timesheet.
    """
    now = datetime.now(timezone.utc)
    target_year = year or now.year
    target_month = month or now.month
    return await attendance_service.get_timesheet_for_user_id(
        user_id=user_id,
        year=target_year,
        month=target_month,
    )


@router.get("/matrix", response_model=DailyMatrixResponse)
async def get_daily_attendance_matrix(
    date: Optional[str] = Query(default=None, description="Target date YYYY-MM-DD"),
    department: Optional[str] = Query(default=None, description="Filter by department"),
    current_user: dict = Depends(require_management_role),
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
    current_user: dict = Depends(require_management_role),
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
    current_user: dict = Depends(require_management_role),
):
    """
    Exports company-wide attendance and monthly punctuality summary as a styled multi-tab Excel (.xlsx) workbook.
    - Tab 1: Company-wide Punctuality Summary.
    - Tabs 2 to N: Individual Employee Monthly Timesheets with color-coded styling.
    """
    now = datetime.now(timezone.utc)
    target_year = year or now.year
    target_month = month or now.month

    from app.services import attendance_excel

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
    current_user: dict = Depends(require_management_role),
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
    override_payload: OverrideAttendanceRequest,
    current_user: dict = Depends(require_management_role),
):
    """HR / Admin attendance record override by record ID or employee ID."""
    return await attendance_service.override_attendance_record(
        target_id=record_id,
        override_data=override_payload.model_dump(),
        admin_user=current_user,
    )


# ==============================================================================
# Missed Punch Inquiries Endpoints
# ==============================================================================

@router.post("/missed-punch-inquiries", response_model=MissedPunchInquiryResponse)
async def create_missed_punch_inquiry(
    inquiry_in: MissedPunchInquiryCreate,
    current_user: dict = Depends(require_management_role),
):
    """HR / Admin creates an inquiry asking an employee for their missed checkout time."""
    return await attendance_service.create_missed_punch_inquiry(
        user_id=inquiry_in.user_id,
        date_str=inquiry_in.date,
        actor=current_user,
        note=inquiry_in.note,
    )


@router.get("/missed-punch-inquiries/pending", response_model=List[MissedPunchInquiryResponse])
async def get_my_pending_inquiries(
    current_user: dict = Depends(require_internal_user),
):
    """Retrieves active pending missed punch inquiries for the authenticated employee."""
    return await attendance_service.get_pending_inquiries_for_user(current_user["id"])


@router.get("/missed-punch-inquiries", response_model=List[MissedPunchInquiryResponse])
async def get_all_missed_punch_inquiries(
    user_id: Optional[str] = Query(None, description="Filter by employee user ID"),
    date: Optional[str] = Query(None, description="Filter by target date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Filter by status (pending, resolved, cancelled)"),
    current_user: dict = Depends(require_management_role),
):
    """HR / Admin queries all missed punch inquiries across employees."""
    return await attendance_service.get_missed_punch_inquiries(
        user_id=user_id,
        date_str=date,
        status_filter=status,
    )


@router.post("/missed-punch-inquiries/{inquiry_id}/respond")
async def respond_to_missed_punch_inquiry(
    inquiry_id: str,
    payload: MissedPunchInquiryRespond,
    current_user: dict = Depends(require_internal_user),
):
    """Employee provides their checkout time and explanation to resolve a missed punch."""
    return await attendance_service.respond_to_missed_punch_inquiry(
        inquiry_id=inquiry_id,
        user_id=current_user["id"],
        check_out=payload.check_out,
        reason=payload.reason,
    )

