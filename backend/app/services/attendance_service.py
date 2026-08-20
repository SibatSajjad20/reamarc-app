"""
Attendance, Shift Management, Leaves, and Company Calendar Service.
Handles business logic and database persistence for MongoDB collections:
- `shifts`
- `user_shift_assignments`
- `attendance_records`
- `leave_requests`
- `company_calendar`
- `system_config`
"""
import uuid
import calendar
from datetime import datetime, timezone, date, timedelta
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException, status
import logging

from app.database import get_database
from app.models.attendance import (
    AttendanceStatus,
    LeaveType,
    LeaveStatus,
    ShiftType,
    BonusRecommendation,
    CalendarEventType,
)
from app.schemas.shift import (
    ShiftBase,
    ShiftCreate,
    ShiftUpdate,
    ShiftResponse,
    ShiftAssignmentRequest,
    DEFAULT_SHIFTS,
)
from app.schemas.attendance import (
    CheckInRequest,
    CheckOutRequest,
    AttendanceRecordResponse,
    PunchStatusResponse,
    TodayAttendanceResponse,
    DailyMatrixSummary,
    DailyMatrixRow,
    DailyMatrixResponse,
    MonthlyPunctualityRow,
    MonthlyPunctualityResponse,
    MonthlyPunctualitySummary,
    MonthlyTimesheetResponse,
    SecuritySettingsSchema,
    BreakActionRequest,
)
from app.schemas.leave import (
    LeaveCreateRequest,
    LeaveReviewRequest,
    LeaveResponse,
)
from app.schemas.company_calendar import (
    CalendarEventCreate,
    CalendarEventUpdate,
    CalendarEventResponse,
    CalendarMonthResponse,
)
from app.services.attendance_calculator import (
    calculate_daily_attendance,
    calculate_monthly_aggregation,
    parse_time_to_minutes,
    format_minutes_to_hhmm,
)
from app.services.attendance_security import (
    validate_punch_security,
    validate_client_ip,
)

logger = logging.getLogger(__name__)


# Company local timezone: Pakistan Standard Time (PKT, UTC+5 / Asia/Karachi)
PKT_TIMEZONE = timezone(timedelta(hours=5))


def get_current_date_str() -> str:
    """Returns today's date in YYYY-MM-DD format based on company local timezone (PKT)."""
    return datetime.now(PKT_TIMEZONE).strftime("%Y-%m-%d")


def get_current_time_str() -> str:
    """Returns current time in HH:MM format based on company local timezone (PKT)."""
    return datetime.now(PKT_TIMEZONE).strftime("%H:%M")


def accumulate_break_minutes(existing: dict, end_time_str: str) -> int:
    """Adds an open break interval onto the stored break_minutes total."""
    current = int(existing.get("break_minutes") or 0)
    if not existing.get("is_on_break"):
        return current
    start_str = existing.get("break_start_time")
    if not start_str:
        return current
    start = parse_time_to_minutes(start_str)
    end = parse_time_to_minutes(end_time_str)
    if end < start:
        end += 1440
    return current + max(0, end - start)


def iter_date_range(start_str: str, end_str: str) -> List[str]:
    try:
        start_d = datetime.strptime(start_str, "%Y-%m-%d").date()
        end_d = datetime.strptime(end_str or start_str, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return []
    if end_d < start_d:
        start_d, end_d = end_d, start_d
    dates = []
    cur = start_d
    while cur <= end_d:
        dates.append(cur.isoformat())
        cur += timedelta(days=1)
    return dates


def is_first_saturday_of_month(d: date) -> bool:
    """Returns True if the given date is the 1st Saturday of the month."""
    return d.weekday() == 5 and d.day <= 7


def is_sunday_date(d: date) -> bool:
    """Returns True if the given date is a Sunday."""
    return d.weekday() == 6


# ──────────────────────────────────────────────────────────
# 1. SHIFT MANAGEMENT & SEEDING
# ──────────────────────────────────────────────────────────

async def ensure_default_shifts() -> List[dict]:
    """
    Ensures standard shift templates exist in the database.
    If the `shifts` collection is empty, seeds DEFAULT_SHIFTS.
    """
    db = get_database()
    if db is None:
        return []

    count = await db.shifts.count_documents({})
    if count == 0:
        logger.info("Seeding DEFAULT_SHIFTS into shifts collection...")
        seeded_docs = []
        now_iso = datetime.now(timezone.utc).isoformat()
        for s in DEFAULT_SHIFTS:
            shift_dict = dict(s)
            shift_dict["id"] = f"shift_{shift_dict['shift_type'].value if isinstance(shift_dict['shift_type'], ShiftType) else shift_dict['shift_type']}"
            shift_dict["created_at"] = now_iso
            shift_dict["updated_at"] = now_iso
            # Convert ShiftType to string value for MongoDB
            if isinstance(shift_dict.get("shift_type"), ShiftType):
                shift_dict["shift_type"] = shift_dict["shift_type"].value
            seeded_docs.append(shift_dict)
        if seeded_docs:
            await db.shifts.insert_many(seeded_docs)
        return seeded_docs

    cursor = db.shifts.find({"is_active": True})
    return await cursor.to_list(100)


async def get_all_shifts(include_inactive: bool = False) -> List[ShiftResponse]:
    """Retrieves all shifts from the database."""
    db = get_database()
    if db is None:
        return []

    await ensure_default_shifts()
    query = {} if include_inactive else {"is_active": True}
    docs = await db.shifts.find(query, {"_id": 0}).to_list(100)
    return [ShiftResponse(**d) for d in docs]


async def get_shift_by_id(shift_id: str) -> Optional[ShiftResponse]:
    """Retrieves a specific shift by its ID."""
    db = get_database()
    if db is None:
        return None

    await ensure_default_shifts()
    doc = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if doc:
        return ShiftResponse(**doc)
    return None


async def create_shift(shift_in: ShiftCreate) -> ShiftResponse:
    """Creates a new shift definition."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    now_iso = datetime.now(timezone.utc).isoformat()
    shift_dict = shift_in.model_dump()
    shift_dict["id"] = f"shift_{uuid.uuid4().hex[:10]}"
    shift_dict["created_at"] = now_iso
    shift_dict["updated_at"] = now_iso
    if isinstance(shift_dict.get("shift_type"), ShiftType):
        shift_dict["shift_type"] = shift_dict["shift_type"].value

    await db.shifts.insert_one(shift_dict)
    created_doc = await db.shifts.find_one({"id": shift_dict["id"]}, {"_id": 0})
    return ShiftResponse(**created_doc)


async def update_shift(shift_id: str, shift_in: ShiftUpdate) -> ShiftResponse:
    """Updates an existing shift definition."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    update_data = {k: v for k, v in shift_in.model_dump().items() if v is not None}
    if not update_data:
        existing = await get_shift_by_id(shift_id)
        if not existing:
            raise HTTPException(status_code=404, detail=f"Shift '{shift_id}' not found")
        return existing

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    if isinstance(update_data.get("shift_type"), ShiftType):
        update_data["shift_type"] = update_data["shift_type"].value

    result = await db.shifts.find_one_and_update(
        {"id": shift_id},
        {"$set": update_data},
        projection={"_id": 0},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail=f"Shift '{shift_id}' not found")
    return ShiftResponse(**result)


async def delete_shift(shift_id: str) -> dict:
    """Deletes a shift template from the database."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    result = await db.shifts.delete_one({"$or": [{"id": shift_id}, {"_id": shift_id}]})
    if result.deleted_count == 0:
        result_soft = await db.shifts.update_one(
            {"$or": [{"id": shift_id}, {"_id": shift_id}]},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        if result_soft.matched_count == 0:
            raise HTTPException(status_code=404, detail=f"Shift '{shift_id}' not found")

    return {"message": f"Shift '{shift_id}' deleted successfully", "id": shift_id}


async def assign_user_shift(assignment: ShiftAssignmentRequest) -> dict:
    """Assigns or updates a user's assigned shift."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    shift = await get_shift_by_id(assignment.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail=f"Shift '{assignment.shift_id}' does not exist")

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": assignment.user_id,
        "shift_id": assignment.shift_id,
        "shift_name": shift.name,
        "effective_from": assignment.effective_from or get_current_date_str(),
        "updated_at": now_iso,
    }
    await db.user_shift_assignments.update_one(
        {"user_id": assignment.user_id},
        {"$set": doc, "$setOnInsert": {"created_at": now_iso, "id": f"assign_{uuid.uuid4().hex[:10]}"}},
        upsert=True,
    )
    return {"message": f"Shift '{shift.name}' assigned to user '{assignment.user_id}'", **doc}


async def get_user_shift_assignments() -> List[dict]:
    """Retrieves all user shift assignments."""
    db = get_database()
    if db is None:
        return []
    docs = await db.user_shift_assignments.find({}, {"_id": 0}).to_list(1000)
    return docs


async def get_shift_for_user(user_id: str, department: Optional[str] = None) -> ShiftResponse:
    """
    Finds the active shift for a given user:
    1. Check specific assignment in user_shift_assignments.
    2. Fallback to HR shift if department is 'HR'.
    3. Fallback to default Standard Shift.
    """
    db = get_database()
    await ensure_default_shifts()

    if db is not None:
        assignment = await db.user_shift_assignments.find_one({"user_id": user_id}, {"_id": 0})
        if assignment:
            shift_doc = await db.shifts.find_one({"id": assignment.get("shift_id")}, {"_id": 0})
            if shift_doc and shift_doc.get("is_active", True):
                return ShiftResponse(**shift_doc)

    # Department-based default
    if department and str(department).upper() == "HR":
        hr_shift = await db.shifts.find_one({"shift_type": "hr", "is_active": True}, {"_id": 0})
        if hr_shift:
            return ShiftResponse(**hr_shift)

    # Standard default
    standard_shift = await db.shifts.find_one({"shift_type": "standard", "is_active": True}, {"_id": 0})
    if standard_shift:
        return ShiftResponse(**standard_shift)

    # Hard fallback
    return ShiftResponse(
        id="shift_standard",
        name="Standard Shift",
        shift_type=ShiftType.STANDARD,
        start_time="09:30",
        end_time="18:30",
        break_duration_minutes=60,
        grace_period_minutes=30,
        expected_hours=8.0,
        is_night_shift=False,
        description="Standard office working hours",
        is_active=True,
    )


# ──────────────────────────────────────────────────────────
# 2. SECURITY SETTINGS
# ──────────────────────────────────────────────────────────

async def get_security_settings() -> SecuritySettingsSchema:
    """Retrieves system attendance security settings from system_config collection."""
    db = get_database()
    if db is None:
        return SecuritySettingsSchema()

    doc = await db.system_config.find_one({"key": "attendance_security"}, {"_id": 0})
    if not doc:
        default_settings = SecuritySettingsSchema()
        await db.system_config.update_one(
            {"key": "attendance_security"},
            {"$set": {"key": "attendance_security", **default_settings.model_dump()}},
            upsert=True
        )
        return default_settings

    doc.pop("key", None)
    return SecuritySettingsSchema(**doc)


async def update_security_settings(new_settings: SecuritySettingsSchema) -> SecuritySettingsSchema:
    """Updates system attendance security settings."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    settings_dict = new_settings.model_dump()
    await db.system_config.update_one(
        {"key": "attendance_security"},
        {"$set": {"key": "attendance_security", **settings_dict}},
        upsert=True
    )
    return new_settings


# ──────────────────────────────────────────────────────────
# 3. WFH & LEAVE APPROVAL CHECKS
# ──────────────────────────────────────────────────────────

async def is_wfh_approved_for_date(user_id: str, date_str: str) -> bool:
    """
    Checks whether a user has an approved WFH request spanning date_str.
    """
    db = get_database()
    if db is None:
        return False

    leave = await db.leave_requests.find_one({
        "user_id": user_id,
        "leave_type": LeaveType.WFH.value,
        "status": LeaveStatus.APPROVED.value,
        "start_date": {"$lte": date_str},
        "end_date": {"$gte": date_str},
    })
    return leave is not None


async def get_approved_leave_for_date(user_id: str, date_str: str) -> Optional[dict]:
    """
    Retrieves any approved leave document covering date_str for the user.
    """
    db = get_database()
    if db is None:
        return None

    return await db.leave_requests.find_one({
        "user_id": user_id,
        "leave_type": {"$nin": ["missed_punch_regularization", "regularization"]},
        "status": LeaveStatus.APPROVED.value,
        "start_date": {"$lte": date_str},
        "end_date": {"$gte": date_str},
    }, {"_id": 0})


# ──────────────────────────────────────────────────────────
# 4. CHECK-IN & CHECK-OUT FLOWS
# ──────────────────────────────────────────────────────────

async def process_check_in(
    user: dict,
    check_in_req: CheckInRequest,
    client_ip: Optional[str] = None,
    custom_date: Optional[str] = None,
    custom_time: Optional[str] = None,
) -> AttendanceRecordResponse:
    """
    Executes attendance check-in:
    1. Prevents duplicate check-ins for the same date.
    2. Verifies approved WFH status.
    3. Enforces Tier 1 IP Whitelist and Tier 3 GPS Geofencing (bypassed if WFH approved).
    4. Computes grace buffer and late strike.
    5. Saves record in attendance_records collection.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    user_id = user.get("id")
    user_name = user.get("full_name") or user.get("name", "User")
    department = user.get("department")

    date_str = custom_date or get_current_date_str()
    time_str = custom_time or get_current_time_str()

    # 1. Check duplicate check-in
    existing_record = await db.attendance_records.find_one(
        {"user_id": user_id, "date": date_str},
        {"_id": 0}
    )
    if existing_record and existing_record.get("check_in"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance already recorded for {date_str}. Check-in: {existing_record.get('check_in')}"
        )

    # 2. Check WFH
    is_wfh = await is_wfh_approved_for_date(user_id, date_str)

    # 3. Security verification
    settings = await get_security_settings()
    ip_to_check = check_in_req.client_ip or client_ip
    is_authorized, sec_error = validate_punch_security(
        client_ip=ip_to_check,
        user_lat=check_in_req.latitude,
        user_lon=check_in_req.longitude,
        is_wfh_approved=is_wfh,
        settings=settings,
    )
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=sec_error or "Check-in rejected: Location or IP security check failed."
        )

    # 4. User shift & late calculation
    shift = await get_shift_for_user(user_id, department)
    calc_res = calculate_daily_attendance(
        check_in_time=time_str,
        check_out_time=None,
        shift_start=shift.start_time,
        shift_end=shift.end_time,
        break_duration_minutes=shift.break_duration_minutes,
        grace_period_minutes=shift.grace_period_minutes,
        expected_hours=shift.expected_hours,
        is_night_shift=shift.is_night_shift,
        is_wfh=is_wfh,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    record_id = f"att_{user_id}_{date_str}"
    
    status_enum = AttendanceStatus.WFH if is_wfh else calc_res.status

    record_doc = {
        "id": record_id,
        "user_id": user_id,
        "user_name": user_name,
        "department": department,
        "date": date_str,
        "shift_id": shift.id,
        "shift_name": shift.name,
        "check_in": time_str,
        "check_out": None,
        "punch_in": time_str,
        "punch_out": None,
        "break_minutes": 0,
        "working_hours_minutes": 0,
        "work_hours": calc_res.work_hours,
        "work_duration_formatted": calc_res.work_duration_formatted,
        "overtime_minutes": 0,
        "overtime_hours": calc_res.overtime_hours,
        "overtime_formatted": calc_res.overtime_formatted,
        "undertime_minutes": 0,
        "undertime_hours": calc_res.undertime_hours,
        "undertime_formatted": calc_res.undertime_formatted,
        "late_minutes": calc_res.late_minutes,
        "is_late": calc_res.is_late,
        "late_strike": calc_res.late_strike,
        "status": status_enum.value,
        "is_wfh": is_wfh,
        "is_missed_punch": False,
        "is_short_leave": False,
        "short_leave_hours": 0.0,
        "is_on_break": False,
        "break_start_time": None,
        "check_in_ip": ip_to_check,
        "check_in_location": {
            "latitude": check_in_req.latitude,
            "longitude": check_in_req.longitude,
        } if check_in_req.latitude is not None and check_in_req.longitude is not None else None,
        "notes": check_in_req.notes,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    await db.attendance_records.update_one(
        {"user_id": user_id, "date": date_str},
        {"$set": record_doc},
        upsert=True
    )

    return AttendanceRecordResponse.from_mongo(record_doc)


async def process_check_out(
    user: dict,
    check_out_req: CheckOutRequest,
    custom_date: Optional[str] = None,
    custom_time: Optional[str] = None,
) -> AttendanceRecordResponse:
    """
    Executes attendance check-out:
    1. Validates that check-in exists.
    2. Calculates net working hours, overtime, undertime, and late status.
    3. Updates record in attendance_records collection.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    user_id = user.get("id")
    department = user.get("department")
    date_str = custom_date or get_current_date_str()
    time_str = custom_time or get_current_time_str()

    existing = await db.attendance_records.find_one(
        {"user_id": user_id, "date": date_str},
        {"_id": 0}
    )
    cin = existing.get("check_in") or existing.get("punch_in") if existing else None
    if not existing or not cin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot check out without an active check-in for today."
        )

    cout = existing.get("check_out") or existing.get("punch_out")
    if cout:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Already checked out today at {cout}."
        )

    # Fetch shift
    shift_id = existing.get("shift_id")
    shift = await get_shift_by_id(shift_id) if shift_id else None
    if not shift:
        shift = await get_shift_for_user(user_id, department)

    is_wfh = existing.get("is_wfh", False)
    is_short_leave = existing.get("is_short_leave", False)
    short_leave_hours = existing.get("short_leave_hours", 0.0)
    closed_break_minutes = accumulate_break_minutes(existing, time_str)

    # Calculate final daily values
    calc_res = calculate_daily_attendance(
        check_in_time=cin,
        check_out_time=time_str,
        shift_start=shift.start_time,
        shift_end=shift.end_time,
        break_duration_minutes=shift.break_duration_minutes,
        grace_period_minutes=shift.grace_period_minutes,
        expected_hours=shift.expected_hours,
        is_night_shift=shift.is_night_shift,
        is_wfh=is_wfh,
        is_short_leave=is_short_leave,
        short_leave_hours=short_leave_hours,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    status_out = AttendanceStatus.WFH.value if is_wfh else calc_res.status.value
    update_doc = {
        "check_out": time_str,
        "punch_out": time_str,
        "break_minutes": closed_break_minutes or shift.break_duration_minutes,
        "is_on_break": False,
        "break_start_time": None,
        "working_hours_minutes": calc_res.work_minutes,
        "work_hours": calc_res.work_hours,
        "work_duration_formatted": calc_res.work_duration_formatted,
        "overtime_minutes": calc_res.overtime_minutes,
        "overtime_hours": calc_res.overtime_hours,
        "overtime_formatted": calc_res.overtime_formatted,
        "undertime_minutes": calc_res.undertime_minutes,
        "undertime_hours": calc_res.undertime_hours,
        "undertime_formatted": calc_res.undertime_formatted,
        "late_minutes": calc_res.late_minutes,
        "is_late": calc_res.is_late,
        "late_strike": calc_res.late_strike,
        "status": status_out,
        "is_missed_punch": False,
        "updated_at": now_iso,
    }
    if check_out_req.notes:
        old_notes = existing.get("notes") or ""
        update_doc["notes"] = f"{old_notes} | Check-out: {check_out_req.notes}".strip(" | ")

    result = await db.attendance_records.find_one_and_update(
        {"user_id": user_id, "date": date_str},
        {"$set": update_doc},
        projection={"_id": 0},
        return_document=True,
    )

    return AttendanceRecordResponse.from_mongo(result)


async def process_break_toggle(
    user: dict,
    break_req: BreakActionRequest,
) -> AttendanceRecordResponse:
    """Start or end a live break on today's open attendance record."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    user_id = user.get("id")
    date_str = get_current_date_str()
    time_str = get_current_time_str()
    action = (break_req.action or "").strip().lower()

    existing = await db.attendance_records.find_one(
        {"user_id": user_id, "date": date_str},
        {"_id": 0},
    )
    cin = (existing.get("check_in") or existing.get("punch_in")) if existing else None
    cout = (existing.get("check_out") or existing.get("punch_out")) if existing else None
    if not existing or not cin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start or end a break without an active check-in.",
        )
    if cout:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change break state after check-out.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    is_on_break = bool(existing.get("is_on_break"))

    if action == "start":
        if is_on_break:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A break is already in progress.",
            )
        update_doc = {
            "is_on_break": True,
            "break_start_time": time_str,
            "updated_at": now_iso,
        }
    elif action == "end":
        if not is_on_break:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active break to end.",
            )
        update_doc = {
            "is_on_break": False,
            "break_start_time": None,
            "break_minutes": accumulate_break_minutes(existing, time_str),
            "updated_at": now_iso,
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Break action must be 'start' or 'end'.",
        )

    if break_req.notes:
        old_notes = existing.get("notes") or ""
        update_doc["notes"] = f"{old_notes} | Break {action}: {break_req.notes}".strip(" | ")

    result = await db.attendance_records.find_one_and_update(
        {"user_id": user_id, "date": date_str},
        {"$set": update_doc},
        projection={"_id": 0},
        return_document=True,
    )
    return AttendanceRecordResponse.from_mongo(result)


# ──────────────────────────────────────────────────────────
# 5. TODAY STATUS & USER TIMESHEET
# ──────────────────────────────────────────────────────────

async def get_today_status(
    user: dict,
    date_str: Optional[str] = None,
    client_ip: Optional[str] = None,
) -> TodayAttendanceResponse:
    """
    Returns today's punch card status, active timer metrics, and assigned shift for the user.
    """
    db = get_database()
    user_id = user.get("id")
    department = user.get("department")
    target_date = date_str or get_current_date_str()

    shift = await get_shift_for_user(user_id, department)
    is_wfh = await is_wfh_approved_for_date(user_id, target_date)
    sec_settings = await get_security_settings()

    is_ip_verified = False
    if client_ip:
        is_ip_verified = validate_client_ip(
            client_ip,
            sec_settings.office_public_ips,
            sec_settings.office_subnets,
        )

    record_doc = None
    if db is not None:
        record_doc = await db.attendance_records.find_one(
            {"user_id": user_id, "date": target_date},
            {"_id": 0}
        )

    cin = (record_doc.get("punch_in") or record_doc.get("check_in")) if record_doc else None
    cout = (record_doc.get("punch_out") or record_doc.get("check_out")) if record_doc else None

    is_checked_in = bool(record_doc and cin and not cout)
    check_in_time = cin
    check_out_time = cout

    # Calculate active duration in seconds if currently punched in
    active_duration_seconds = 0
    if is_checked_in and check_in_time:
        now_mins = parse_time_to_minutes(get_current_time_str())
        in_mins = parse_time_to_minutes(check_in_time)
        diff_mins = max(0, now_mins - in_mins)
        active_duration_seconds = diff_mins * 60

    if record_doc and cin:
        status_val = AttendanceStatus(record_doc.get("status", AttendanceStatus.PRESENT))
        is_wfh = bool(record_doc.get("is_wfh", False) or status_val == AttendanceStatus.WFH)
    elif is_wfh:
        status_val = AttendanceStatus.WFH
    else:
        status_val = AttendanceStatus.ABSENT

    can_check_in = not bool(record_doc and cin)
    can_check_out = is_checked_in
    has_active_break = bool(record_doc and record_doc.get("is_on_break"))

    record_res = AttendanceRecordResponse.from_mongo(record_doc) if (record_doc and cin) else None

    punch_status = PunchStatusResponse(
        is_checked_in=is_checked_in,
        check_in_time=check_in_time,
        check_out_time=check_out_time,
        active_duration_seconds=active_duration_seconds,
        current_status=status_val,
        shift=shift,
        is_wfh_approved=is_wfh,
        can_check_in=can_check_in,
        can_check_out=can_check_out,
        today_record=record_res,
    )

    return TodayAttendanceResponse(
        record=record_res,
        shift=shift,
        is_wfh_approved=is_wfh,
        punch_status=punch_status,
        has_active_break=has_active_break,
        can_punch_in=can_check_in,
        can_punch_out=can_check_out,
        office_latitude=sec_settings.office_latitude,
        office_longitude=sec_settings.office_longitude,
        geofence_radius_meters=sec_settings.geofence_radius_meters,
        client_ip=client_ip,
        is_ip_verified=is_ip_verified,
    )


async def get_my_timesheet(
    user: dict,
    year: int,
    month: int,
) -> MonthlyTimesheetResponse:
    """
    Returns monthly attendance records and aggregated punctuality summary for current user.
    """
    db = get_database()
    user_id = user.get("id")
    user_name = user.get("full_name") or user.get("name", "User")
    department = user.get("department")

    month_str = f"{year:04d}-{month:02d}"
    shift = await get_shift_for_user(user_id, department)

    records = []
    if db is not None:
        docs = await db.attendance_records.find(
            {"user_id": user_id, "date": {"$regex": f"^{month_str}-"}},
            {"_id": 0}
        ).sort("date", 1).to_list(100)
        records = [AttendanceRecordResponse.from_mongo(d) for d in docs]

    # Calculate total working days in this month
    total_working_days = await calculate_month_working_days(year, month)

    daily_dicts = []
    for r in records:
        daily_dicts.append({
            "status": r.status,
            "late_strike": r.late_strike,
            "work_minutes": int(round(r.work_hours * 60)),
            "overtime_minutes": int(round(r.overtime_hours * 60)),
            "undertime_minutes": int(round(r.undertime_hours * 60)),
            "is_short_leave": (r.status == AttendanceStatus.SHORT_LEAVE),
            "is_missed_punch": r.is_missed_punch,
        })

    agg = calculate_monthly_aggregation(daily_dicts, total_working_days=total_working_days)

    summary_row = MonthlyPunctualityRow(
        user_id=user_id,
        employee_name=user_name,
        department=department,
        shift_name=shift.name,
        total_working_days=agg.total_working_days,
        days_present=agg.days_present,
        days_absent=agg.days_absent,
        leave_count=agg.leave_count,
        late_count=agg.late_count,
        short_leaves_count=agg.short_leaves_count,
        total_work_hours=agg.total_work_hours,
        total_work_hours_formatted=agg.total_work_hours_formatted,
        overtime_hours=agg.overtime_hours,
        overtime_formatted=agg.overtime_formatted,
        undertime_hours=agg.undertime_hours,
        undertime_formatted=agg.undertime_formatted,
        net_variance_hours=agg.net_variance_hours,
        net_variance_formatted=agg.net_variance_formatted,
        punctuality_percentage=agg.punctuality_percentage,
        punctuality_score_percent=agg.punctuality_percentage,
        missed_punches=agg.missed_punches,
        late_strikes=agg.late_count,
        leaves_taken=agg.leave_count,
        working_days=agg.total_working_days,
        bonus_recommendation=agg.bonus_recommendation,
    )

    return MonthlyTimesheetResponse(
        user_id=user_id,
        employee_name=user_name,
        year=year,
        month=month,
        records=records,
        summary=summary_row,
    )


# ──────────────────────────────────────────────────────────
# 6. DAILY MATRIX & MONTHLY PUNCTUALITY COMMAND CENTER
# ──────────────────────────────────────────────────────────

async def calculate_month_working_days(year: int, month: int) -> int:
    """
    Computes standard company working days in a month:
    Excludes Sundays, 1st Saturday off, and registered public holidays in company_calendar.
    Includes any working Saturday overrides.
    """
    db = get_database()
    num_days = calendar.monthrange(year, month)[1]

    # Fetch holidays & working saturdays for this month
    holidays_set = set()
    working_saturdays_set = set()
    if db is not None:
        month_prefix = f"{year:04d}-{month:02d}"
        events = await db.company_calendar.find(
            {"date": {"$regex": f"^{month_prefix}-"}},
            {"_id": 0}
        ).to_list(100)
        for ev in events:
            ev_date = ev.get("date")
            if ev.get("event_type") == CalendarEventType.HOLIDAY.value or ev.get("event_type") == "holiday":
                holidays_set.add(ev_date)
            if ev.get("is_workday_override", False) or ev.get("event_type") == CalendarEventType.WORKING_SATURDAY.value:
                working_saturdays_set.add(ev_date)

    working_days_count = 0
    start_day = 19 if (year == 2026 and month == 8) else 1
    for day in range(start_day, num_days + 1):
        cur_date = date(year, month, day)
        date_str = cur_date.strftime("%Y-%m-%d")

        if date_str in working_saturdays_set:
            working_days_count += 1
            continue

        if date_str in holidays_set:
            continue

        if is_sunday_date(cur_date):
            continue

        if is_first_saturday_of_month(cur_date):
            continue

        working_days_count += 1

    return max(1, working_days_count)


async def get_daily_matrix(
    date_str: Optional[str] = None,
    department: Optional[str] = None,
) -> DailyMatrixResponse:
    """
    Generates company-wide live attendance grid for a specific date:
    - Replicates physical register with KPI banner.
    - Resolves WFH, Leaves, First Saturday off, Sunday off, Holiday tags.
    - Flags late arrivals > 10:00 AM.
    """
    db = get_database()
    target_date = date_str or get_current_date_str()
    parsed_date = datetime.strptime(target_date, "%Y-%m-%d").date()

    if db is None:
        return DailyMatrixResponse(
            date=target_date,
            total_employees=0,
            present_count=0,
            absent_count=0,
            late_count=0,
            wfh_count=0,
            leave_count=0,
            rows=[],
        )

    # 1. Fetch active employees (excluding clients and administrators who do not clock in/out)
    user_query: Dict[str, Any] = {"is_active": True, "role": {"$nin": ["client", "CLIENT", "admin", "ADMIN"]}}
    if department and department.lower() != "all":
        user_query["department"] = {"$regex": f"^{department}$", "$options": "i"}

    users = await db.users.find(user_query, {"_id": 0, "hashed_password": 0}).sort("full_name", 1).to_list(1000)

    # 2. Fetch all attendance records for date
    records_list = await db.attendance_records.find({"date": target_date}, {"_id": 0}).to_list(1000)
    records_by_user = {r["user_id"]: r for r in records_list}

    # 3. Fetch approved leaves covering date (excluding missed punch regularization)
    leaves_list = await db.leave_requests.find({
        "status": LeaveStatus.APPROVED.value,
        "leave_type": {"$nin": ["missed_punch_regularization", "regularization"]},
        "start_date": {"$lte": target_date},
        "end_date": {"$gte": target_date},
    }, {"_id": 0}).to_list(1000)
    leaves_by_user = {l["user_id"]: l for l in leaves_list}

    # 4. Check company calendar for holiday or workday override
    calendar_event = await db.company_calendar.find_one({"date": target_date}, {"_id": 0})
    is_holiday = calendar_event and (calendar_event.get("event_type") == "holiday" or calendar_event.get("event_type") == CalendarEventType.HOLIDAY)
    is_workday_override = calendar_event and calendar_event.get("is_workday_override", False)

    is_sunday = is_sunday_date(parsed_date)
    is_first_sat = is_first_saturday_of_month(parsed_date) and not is_workday_override

    # 5. Batch-load shifts and user assignments for instant O(1) in-memory resolution
    all_shifts = await db.shifts.find({"is_active": True}, {"_id": 0}).to_list(100)
    shifts_by_id = {s["id"]: s for s in all_shifts}
    shifts_by_type = {s.get("shift_type", ""): s for s in all_shifts}
    std_shift = shifts_by_type.get("standard") or (all_shifts[0] if all_shifts else None)
    hr_shift = shifts_by_type.get("hr") or std_shift

    all_assignments = await db.user_shift_assignments.find({}, {"_id": 0}).to_list(1000)
    user_shift_map = {a["user_id"]: a["shift_id"] for a in all_assignments}

    rows: List[DailyMatrixRow] = []
    present_count = 0
    absent_count = 0
    late_count = 0
    wfh_count = 0
    leave_count = 0

    for u in users:
        u_id = u.get("id")
        u_name = u.get("full_name") or u.get("name", "User")
        u_dept = u.get("department") or "General"
        u_role = u.get("role", "team_member")
        u_code = u.get("employee_id") or u.get("code") or f"EMP-{u_id[:4].upper() if len(u_id) >= 4 else '001'}"

        rec = records_by_user.get(u_id)
        approved_leave = leaves_by_user.get(u_id)

        assigned_shift_id = user_shift_map.get(u_id)
        raw_shift = shifts_by_id.get(assigned_shift_id) if assigned_shift_id else None
        if not raw_shift and rec and rec.get("shift_id"):
            raw_shift = shifts_by_id.get(rec.get("shift_id"))
        if not raw_shift:
            if str(u_dept).upper() == "HR":
                raw_shift = hr_shift
            else:
                raw_shift = std_shift

        shift_start = raw_shift.get("start_time", "09:30") if raw_shift else "09:30"
        shift_end = raw_shift.get("end_time", "18:30") if raw_shift else "18:30"
        shift_name = raw_shift.get("name", "Standard Shift") if raw_shift else "Standard Shift"
        shift_break = raw_shift.get("break_duration_minutes", 60) if raw_shift else 60
        shift_grace = int(raw_shift.get("grace_period_minutes", 30)) if raw_shift else 30
        shift_expected_hours = float(raw_shift.get("expected_hours", 8.0)) if raw_shift else 8.0
        shift_is_night = bool(raw_shift.get("is_night_shift", False)) if raw_shift else False
        shift_timing = f"{shift_start} - {shift_end}"

        if rec:
            check_in = rec.get("check_in")
            check_out = rec.get("check_out")
            is_wfh_flag = bool(rec.get("is_wfh", False))
            is_short_leave_flag = bool(rec.get("is_short_leave", False))
            short_leave_hours_val = float(rec.get("short_leave_hours", 0.0))
            raw_status = rec.get("status")

            if check_in:
                # Dynamic mathematical calculation engine against the user's specific shift
                calc_res = calculate_daily_attendance(
                    check_in_time=check_in,
                    check_out_time=check_out,
                    shift_start=shift_start,
                    shift_end=shift_end,
                    break_duration_minutes=rec.get("break_duration_minutes", shift_break),
                    grace_period_minutes=shift_grace,
                    expected_hours=shift_expected_hours,
                    is_night_shift=shift_is_night,
                    is_wfh=is_wfh_flag,
                    is_short_leave=is_short_leave_flag,
                    short_leave_hours=short_leave_hours_val,
                )

                if raw_status in ("sick_leave", "casual_leave", "annual_leave", "unpaid_leave", "short_leave", "wfh", "missed_punch", "absent", "sunday_off", "first_saturday_off", "holiday", "present", "late", "on_leave"):
                    status_enum = AttendanceStatus(raw_status)
                else:
                    status_enum = AttendanceStatus.WFH if is_wfh_flag else calc_res.status

                if status_enum == AttendanceStatus.PRESENT:
                    is_late_flag = False
                    is_late_alert = False
                    late_minutes = 0
                elif status_enum == AttendanceStatus.LATE:
                    is_late_flag = True
                    is_late_alert = True
                    late_minutes = rec.get("late_minutes") or calc_res.late_minutes
                else:
                    is_late_flag = bool(rec.get("is_late", calc_res.is_late))
                    is_late_alert = is_late_flag
                    late_minutes = rec.get("late_minutes", calc_res.late_minutes)

                work_hours = calc_res.work_duration_formatted
                work_mins = calc_res.work_minutes
                break_mins_val = rec.get("break_duration_minutes", shift_break)
            else:
                # Attendance record exists without check_in (e.g. overridden as absent or on-leave)
                work_hours = rec.get("work_duration_formatted") or "00:00"
                work_mins = rec.get("working_hours_minutes") or 0
                break_mins_val = rec.get("break_duration_minutes", 0)
                is_late_flag = False
                is_late_alert = False
                late_minutes = 0

                if raw_status in ("sick_leave", "casual_leave", "annual_leave", "unpaid_leave", "short_leave", "wfh", "missed_punch", "absent", "sunday_off", "first_saturday_off", "holiday", "present", "late", "on_leave"):
                    status_enum = AttendanceStatus(raw_status)
                else:
                    status_enum = AttendanceStatus.ABSENT

            if status_enum == AttendanceStatus.ABSENT:
                status_badge = "Absent"
                absent_count += 1
            elif is_wfh_flag or status_enum == AttendanceStatus.WFH:
                status_badge = "W.F.H"
                wfh_count += 1
            elif status_enum == AttendanceStatus.LATE or (status_enum != AttendanceStatus.PRESENT and is_late_flag):
                status_badge = "Late"
                late_count += 1
                present_count += 1
            elif status_enum == AttendanceStatus.SHORT_LEAVE:
                status_badge = "Short Leave"
                present_count += 1
            elif status_enum == AttendanceStatus.MISSED_PUNCH:
                status_badge = "Missed Punch"
                present_count += 1
            elif status_enum in (AttendanceStatus.SICK_LEAVE, AttendanceStatus.CASUAL_LEAVE, AttendanceStatus.ANNUAL_LEAVE, AttendanceStatus.UNPAID_LEAVE, AttendanceStatus.ON_LEAVE):
                status_badge = "Leave"
                leave_count += 1
            elif status_enum == AttendanceStatus.SUNDAY_OFF:
                status_badge = "Sunday Off"
            elif status_enum == AttendanceStatus.FIRST_SATURDAY_OFF:
                status_badge = "1st Sat Off"
            elif status_enum == AttendanceStatus.HOLIDAY:
                status_badge = "Holiday"
            else:
                status_badge = "Present"
                present_count += 1

            rows.append(DailyMatrixRow(
                user_id=u_id,
                employee_code=u_code,
                employee_name=u_name,
                department=u_dept,
                role=u_role,
                shift_name=shift_name,
                shift_timing=shift_timing,
                check_in=check_in,
                check_out=check_out,
                punch_in=check_in,
                punch_out=check_out,
                break_minutes=break_mins_val,
                effective_hours_minutes=work_mins,
                status=status_enum,
                status_badge=status_badge,
                work_hours=work_hours,
                late_minutes=late_minutes,
                is_late=is_late_flag,
                is_late_alert=is_late_alert,
                ip_verified=bool(rec.get("ip_verified", True)),
                gps_verified=bool(rec.get("gps_verified", True)),
                distance_meters=rec.get("distance_meters"),
                is_wfh_approved=bool(is_wfh_flag or rec.get("is_wfh_approved")),
                notes=rec.get("notes"),
                record_id=rec.get("id") or rec.get("_id"),
            ))

        elif approved_leave:
            # Not checked in, but has approved leave or WFH
            l_type = approved_leave.get("leave_type")
            if l_type == LeaveType.WFH.value or l_type == "wfh":
                status_enum = AttendanceStatus.WFH
                status_badge = "W.F.H"
                wfh_count += 1
            else:
                status_enum = AttendanceStatus.ON_LEAVE
                status_badge = "Leave"
                leave_count += 1

            rows.append(DailyMatrixRow(
                user_id=u_id,
                employee_code=u_code,
                employee_name=u_name,
                department=u_dept,
                role=u_role,
                shift_name=shift_name,
                shift_timing=shift_timing,
                check_in=None,
                check_out=None,
                punch_in=None,
                punch_out=None,
                break_minutes=shift_break,
                effective_hours_minutes=0,
                status=status_enum,
                status_badge=status_badge,
                work_hours="00:00",
                late_minutes=0,
                is_late=False,
                is_late_alert=False,
                ip_verified=False,
                gps_verified=False,
                is_wfh_approved=(l_type == LeaveType.WFH.value or l_type == "wfh"),
                notes=approved_leave.get("reason"),
                record_id=None,
            ))

        elif is_holiday:
            rows.append(DailyMatrixRow(
                user_id=u_id,
                employee_code=u_code,
                employee_name=u_name,
                department=u_dept,
                role=u_role,
                shift_name=shift_name,
                shift_timing=shift_timing,
                check_in=None,
                check_out=None,
                punch_in=None,
                punch_out=None,
                break_minutes=shift_break,
                effective_hours_minutes=0,
                status=AttendanceStatus.HOLIDAY,
                status_badge="Holiday",
                work_hours="00:00",
                late_minutes=0,
                is_late=False,
                is_late_alert=False,
                ip_verified=False,
                gps_verified=False,
                is_wfh_approved=False,
                notes=calendar_event.get("title") if calendar_event else "Public Holiday",
                record_id=None,
            ))

        elif is_sunday:
            rows.append(DailyMatrixRow(
                user_id=u_id,
                employee_code=u_code,
                employee_name=u_name,
                department=u_dept,
                role=u_role,
                shift_name=shift_name,
                shift_timing=shift_timing,
                check_in=None,
                check_out=None,
                punch_in=None,
                punch_out=None,
                break_minutes=shift_break,
                effective_hours_minutes=0,
                status=AttendanceStatus.SUNDAY_OFF,
                status_badge="Sunday Off",
                work_hours="00:00",
                late_minutes=0,
                is_late=False,
                is_late_alert=False,
                ip_verified=False,
                gps_verified=False,
                is_wfh_approved=False,
                notes=None,
                record_id=None,
            ))

        elif is_first_sat:
            rows.append(DailyMatrixRow(
                user_id=u_id,
                employee_code=u_code,
                employee_name=u_name,
                department=u_dept,
                role=u_role,
                shift_name=shift_name,
                shift_timing=shift_timing,
                check_in=None,
                check_out=None,
                punch_in=None,
                punch_out=None,
                break_minutes=shift_break,
                effective_hours_minutes=0,
                status=AttendanceStatus.FIRST_SATURDAY_OFF,
                status_badge="1st Sat Off",
                work_hours="00:00",
                late_minutes=0,
                is_late=False,
                is_late_alert=False,
                ip_verified=False,
                gps_verified=False,
                is_wfh_approved=False,
                notes=None,
                record_id=None,
            ))

        else:
            # Regular working day absent / unpunched
            absent_count += 1
            rows.append(DailyMatrixRow(
                user_id=u_id,
                employee_code=u_code,
                employee_name=u_name,
                department=u_dept,
                role=u_role,
                shift_name=shift_name,
                shift_timing=shift_timing,
                check_in=None,
                check_out=None,
                punch_in=None,
                punch_out=None,
                break_minutes=shift_break,
                effective_hours_minutes=0,
                status=AttendanceStatus.ABSENT,
                status_badge="Absent",
                work_hours="00:00",
                late_minutes=0,
                is_late=False,
                is_late_alert=False,
                ip_verified=False,
                gps_verified=False,
                is_wfh_approved=False,
                notes=None,
                record_id=None,
            ))

    on_time_count = max(0, present_count - late_count)

    summary_obj = DailyMatrixSummary(
        total_headcount=len(users),
        present=present_count,
        on_time=on_time_count,
        late=late_count,
        wfh=wfh_count,
        leaves=leave_count,
        absent=absent_count,
    )

    return DailyMatrixResponse(
        date=target_date,
        summary=summary_obj,
        total_employees=len(users),
        present_count=present_count,
        absent_count=absent_count,
        late_count=late_count,
        wfh_count=wfh_count,
        leave_count=leave_count,
        rows=rows,
    )


async def get_monthly_punctuality_summary(
    year: int,
    month: int,
    department: Optional[str] = None,
) -> MonthlyPunctualityResponse:
    """
    Generates company-wide Monthly Punctuality Summary aggregating:
    - Working days, Days Present, Leaves, Late Strikes, Short Leaves, Missed Punches
    - Overtime, Undertime, Net Variance in HH:MM
    - Punctuality Percentage Score & Bonus Recommendation
    """
    db = get_database()
    if db is None:
        return MonthlyPunctualityResponse(year=year, month=month, total_employees=0, rows=[])

    user_query: Dict[str, Any] = {"is_active": True, "role": {"$nin": ["client", "CLIENT", "admin", "ADMIN"]}}
    if department and department.lower() != "all":
        user_query["department"] = {"$regex": f"^{department}$", "$options": "i"}

    users = await db.users.find(user_query, {"_id": 0, "hashed_password": 0}).sort("full_name", 1).to_list(1000)
    month_prefix = f"{year:04d}-{month:02d}"

    # Calculate total working days in this month
    total_working_days = await calculate_month_working_days(year, month)

    # Batch-load all shifts & assignments
    all_shifts = await db.shifts.find({"is_active": True}, {"_id": 0}).to_list(100)
    shifts_by_id = {s["id"]: s for s in all_shifts}
    shifts_by_type = {s.get("shift_type", ""): s for s in all_shifts}
    std_shift = shifts_by_type.get("standard") or (all_shifts[0] if all_shifts else None)
    hr_shift = shifts_by_type.get("hr") or std_shift

    all_assignments = await db.user_shift_assignments.find({}, {"_id": 0}).to_list(1000)
    user_shift_map = {a["user_id"]: a["shift_id"] for a in all_assignments}

    # Batch-load all monthly records for all users in a single query
    all_monthly_records = await db.attendance_records.find(
        {"date": {"$regex": f"^{month_prefix}-"}},
        {"_id": 0}
    ).to_list(10000)

    records_by_user: Dict[str, list] = {}
    for r in all_monthly_records:
        uid = r.get("user_id")
        if uid:
            records_by_user.setdefault(uid, []).append(r)

    rows: List[MonthlyPunctualityRow] = []

    for u in users:
        u_id = u.get("id")
        u_name = u.get("full_name") or u.get("name", "User")
        u_dept = u.get("department")

        assigned_shift_id = user_shift_map.get(u_id)
        raw_shift = shifts_by_id.get(assigned_shift_id) if assigned_shift_id else None
        if not raw_shift:
            if str(u_dept).upper() == "HR":
                raw_shift = hr_shift
            else:
                raw_shift = std_shift
        shift_name = raw_shift.get("name", "Standard Shift") if raw_shift else "Standard Shift"

        records = records_by_user.get(u_id, [])

        daily_dicts = []
        for r in records:
            daily_dicts.append({
                "status": r.get("status", AttendanceStatus.PRESENT),
                "late_strike": r.get("late_strike", 0),
                "work_minutes": int(round(float(r.get("work_hours", 0.0)) * 60)),
                "overtime_minutes": int(round(float(r.get("overtime_hours", 0.0)) * 60)),
                "undertime_minutes": int(round(float(r.get("undertime_hours", 0.0)) * 60)),
                "is_short_leave": (r.get("status") == AttendanceStatus.SHORT_LEAVE.value or r.get("is_short_leave", False)),
                "is_missed_punch": bool(r.get("is_missed_punch") or r.get("status") == AttendanceStatus.MISSED_PUNCH.value),
            })

        agg = calculate_monthly_aggregation(daily_dicts, total_working_days=total_working_days)

        rows.append(MonthlyPunctualityRow(
            user_id=u_id,
            employee_name=u_name,
            department=u_dept,
            shift_name=shift_name,
            total_working_days=agg.total_working_days,
            days_present=agg.days_present,
            days_absent=agg.days_absent,
            leave_count=agg.leave_count,
            late_count=agg.late_count,
            short_leaves_count=agg.short_leaves_count,
            total_work_hours=agg.total_work_hours,
            total_work_hours_formatted=agg.total_work_hours_formatted,
            overtime_hours=agg.overtime_hours,
            overtime_formatted=agg.overtime_formatted,
            undertime_hours=agg.undertime_hours,
            undertime_formatted=agg.undertime_formatted,
            net_variance_hours=agg.net_variance_hours,
            net_variance_formatted=agg.net_variance_formatted,
            punctuality_percentage=agg.punctuality_percentage,
            punctuality_score_percent=agg.punctuality_percentage,
            missed_punches=agg.missed_punches,
            late_strikes=agg.late_count,
            leaves_taken=agg.leave_count,
            working_days=agg.total_working_days,
            bonus_recommendation=agg.bonus_recommendation,
        ))

    total_late = sum(r.late_count for r in rows)
    total_ot_minutes = sum(int(round(r.overtime_hours * 60)) for r in rows)
    total_ut_minutes = sum(int(round(r.undertime_hours * 60)) for r in rows)
    avg_punctuality = (
        round(sum(r.punctuality_percentage for r in rows) / len(rows), 1) if rows else 100.0
    )
    bonus_eligible = sum(
        1 for r in rows if r.bonus_recommendation == BonusRecommendation.ELIGIBLE
    )
    summary = MonthlyPunctualitySummary(
        average_punctuality_percent=avg_punctuality,
        total_overtime_formatted=format_minutes_to_hhmm(total_ot_minutes, show_sign=True),
        total_undertime_formatted=format_minutes_to_hhmm(-total_ut_minutes, show_sign=True) if total_ut_minutes else "-00:00",
        total_late_strikes=total_late,
        bonus_eligible_count=bonus_eligible,
        total_employees=len(rows),
    )

    return MonthlyPunctualityResponse(
        year=year,
        month=month,
        department=department,
        total_employees=len(rows),
        summary=summary,
        rows=rows,
    )


# ──────────────────────────────────────────────────────────
# 7. LEAVE MANAGEMENT & DYNAMIC SYNCHRONIZATION
# ──────────────────────────────────────────────────────────

async def submit_leave_request(user: dict, req: LeaveCreateRequest) -> LeaveResponse:
    """
    Submits a new leave request (Full Leave, Short Leave 1-3h, WFH, Regularization).
    Status defaults to 'pending'.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    user_id = user.get("id")
    user_name = user.get("full_name") or user.get("name", "User")
    department = user.get("department")

    now_iso = datetime.now(timezone.utc).isoformat()
    req_dict = req.model_dump()
    req_dict["id"] = f"leave_{uuid.uuid4().hex[:10]}"
    req_dict["user_id"] = user_id
    req_dict["user_name"] = user_name
    req_dict["department"] = department
    req_dict["status"] = LeaveStatus.PENDING.value
    if isinstance(req_dict.get("leave_type"), LeaveType):
        req_dict["leave_type"] = req_dict["leave_type"].value
    req_dict["created_at"] = now_iso
    req_dict["updated_at"] = now_iso

    await db.leave_requests.insert_one(req_dict)
    created_doc = await db.leave_requests.find_one({"id": req_dict["id"]}, {"_id": 0})
    return LeaveResponse(**created_doc)


async def get_user_leave_requests(user_id: str) -> List[LeaveResponse]:
    """Retrieves all leave requests submitted by a specific user."""
    db = get_database()
    if db is None:
        return []
    docs = await db.leave_requests.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [LeaveResponse(**d) for d in docs]


async def get_all_leave_requests(
    status_filter: Optional[str] = None,
    department: Optional[str] = None,
    user_id: Optional[str] = None,
) -> List[LeaveResponse]:
    """
    Retrieves leave requests across all statuses (pending, approved, rejected).
    Supports filtering by status, department, or user_id.
    """
    db = get_database()
    if db is None:
        return []

    query: Dict[str, Any] = {}
    if user_id:
        query["user_id"] = user_id
    if status_filter and status_filter.lower() not in ("all", ""):
        query["status"] = status_filter.lower()
    if department and department.lower() not in ("all", ""):
        query["department"] = {"$regex": f"^{department}$", "$options": "i"}

    docs = await db.leave_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [LeaveResponse(**d) for d in docs]


async def get_pending_leave_requests(department: Optional[str] = None) -> List[LeaveResponse]:
    """Retrieves all pending leave requests for HR / Lead approval inbox."""
    db = get_database()
    if db is None:
        return []

    query: Dict[str, Any] = {"status": LeaveStatus.PENDING.value}
    if department and department.lower() != "all":
        query["department"] = {"$regex": f"^{department}$", "$options": "i"}

    docs = await db.leave_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [LeaveResponse(**d) for d in docs]


async def review_leave_request(
    request_id: str,
    reviewer_user: dict,
    review_data: LeaveReviewRequest,
) -> LeaveResponse:
    """
    Approves or rejects a leave request with reviewer notes and executes
    DYNAMIC SYNCHRONIZATION:
    - Missed Punch Regularization: immediately updates and recalculates that day's attendance record with the regularized times!
    - WFH: marks the day's attendance as W.F.H and bypasses security.
    - Short Leave: recalculates daily working hours with credit for short leave.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    existing = await db.leave_requests.find_one({"id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Leave request '{request_id}' not found")

    reviewer_id = reviewer_user.get("id")
    reviewer_name = reviewer_user.get("full_name") or reviewer_user.get("name", "Reviewer")
    now_iso = datetime.now(timezone.utc).isoformat()
    status_str = review_data.status.value if isinstance(review_data.status, LeaveStatus) else str(review_data.status)

    update_fields = {
        "status": status_str,
        "reviewed_by_id": reviewer_id,
        "reviewed_by_name": reviewer_name,
        "review_comments": review_data.review_comments,
        "reviewed_at": now_iso,
        "updated_at": now_iso,
    }

    result = await db.leave_requests.find_one_and_update(
        {"id": request_id},
        {"$set": update_fields},
        projection={"_id": 0},
        return_document=True,
    )

    # ── DYNAMIC SYNCHRONIZATION LOGIC ──
    if status_str == LeaveStatus.APPROVED.value:
        leave_type_val = existing.get("leave_type")
        target_user_id = existing.get("user_id")
        user_dept = existing.get("department")
        shift = await get_shift_for_user(target_user_id, user_dept)

        # 1. Missed Punch Regularization Dynamic Recalculation
        if leave_type_val in (LeaveType.MISSED_PUNCH_REGULARIZATION.value, "missed_punch_regularization"):
            reg_date = existing.get("regularization_date") or existing.get("start_date")
            existing_rec = await db.attendance_records.find_one({"user_id": target_user_id, "date": reg_date})
            correction_target = existing.get("correction_target", "both")

            if correction_target == "time_in":
                reg_in = existing.get("regularization_check_in") or shift.start_time
                reg_out = existing_rec.get("check_out") if existing_rec else None
            elif correction_target == "time_out":
                reg_in = (existing_rec.get("check_in") or existing_rec.get("punch_in")) if existing_rec else shift.start_time
                reg_out = existing.get("regularization_check_out") or shift.end_time
            else: # both
                reg_in = existing.get("regularization_check_in") or shift.start_time
                reg_out = existing.get("regularization_check_out") or (existing_rec.get("check_out") if existing_rec else None)

            calc_res = calculate_daily_attendance(
                check_in_time=reg_in,
                check_out_time=reg_out,
                shift_start=shift.start_time,
                shift_end=shift.end_time,
                break_duration_minutes=shift.break_duration_minutes,
                grace_period_minutes=shift.grace_period_minutes,
                expected_hours=shift.expected_hours,
                is_night_shift=shift.is_night_shift,
            )

            att_doc = {
                "id": f"att_{target_user_id}_{reg_date}",
                "user_id": target_user_id,
                "user_name": existing.get("user_name"),
                "department": user_dept,
                "date": reg_date,
                "shift_id": shift.id,
                "shift_name": shift.name,
                "check_in": reg_in,
                "check_out": reg_out,
                "punch_in": reg_in,
                "punch_out": reg_out,
                "break_minutes": shift.break_duration_minutes if reg_out else 0,
                "working_hours_minutes": calc_res.work_minutes,
                "work_hours": calc_res.work_hours,
                "work_duration_formatted": calc_res.work_duration_formatted,
                "overtime_minutes": calc_res.overtime_minutes,
                "overtime_hours": calc_res.overtime_hours,
                "overtime_formatted": calc_res.overtime_formatted,
                "undertime_minutes": calc_res.undertime_minutes,
                "undertime_hours": calc_res.undertime_hours,
                "undertime_formatted": calc_res.undertime_formatted,
                "late_minutes": calc_res.late_minutes,
                "is_late": calc_res.is_late,
                "late_strike": calc_res.late_strike,
                "status": calc_res.status.value,
                "is_wfh": False,
                "is_missed_punch": False,
                "notes": f"Regularized punch ({correction_target.replace('_', ' ').title()}) approved by {reviewer_name}: {review_data.review_comments or ''}".strip(),
                "updated_at": now_iso,
            }
            await db.attendance_records.update_one(
                {"user_id": target_user_id, "date": reg_date},
                {"$set": att_doc, "$setOnInsert": {"created_at": now_iso}},
                upsert=True
            )

        # 2. WFH Dynamic Synchronization
        elif leave_type_val in (LeaveType.WFH.value, "wfh"):
            start_d = existing.get("start_date")
            end_d = existing.get("end_date")
            # Update any existing record in the range to is_wfh=True and status=wfh
            await db.attendance_records.update_many(
                {
                    "user_id": target_user_id,
                    "date": {"$gte": start_d, "$lte": end_d},
                },
                {"$set": {"is_wfh": True, "status": AttendanceStatus.WFH.value, "updated_at": now_iso}}
            )

        # 3. Short Leave Dynamic Recalculation
        elif leave_type_val in (LeaveType.SHORT_LEAVE.value, "short_leave"):
            target_date = existing.get("start_date")
            sl_hours = float(existing.get("short_leave_hours") or 2.0)
            rec = await db.attendance_records.find_one({"user_id": target_user_id, "date": target_date}, {"_id": 0})
            if rec and rec.get("check_in"):
                calc_res = calculate_daily_attendance(
                    check_in_time=rec.get("check_in"),
                    check_out_time=rec.get("check_out"),
                    shift_start=shift.start_time,
                    shift_end=shift.end_time,
                    break_duration_minutes=shift.break_duration_minutes,
                    grace_period_minutes=shift.grace_period_minutes,
                    expected_hours=shift.expected_hours,
                    is_night_shift=shift.is_night_shift,
                    is_short_leave=True,
                    short_leave_hours=sl_hours,
                )
                await db.attendance_records.update_one(
                    {"user_id": target_user_id, "date": target_date},
                    {
                        "$set": {
                            "is_short_leave": True,
                            "short_leave_hours": sl_hours,
                            "work_hours": calc_res.work_hours,
                            "work_duration_formatted": calc_res.work_duration_formatted,
                            "overtime_hours": calc_res.overtime_hours,
                            "overtime_formatted": calc_res.overtime_formatted,
                            "undertime_hours": calc_res.undertime_hours,
                            "undertime_formatted": calc_res.undertime_formatted,
                            "status": AttendanceStatus.SHORT_LEAVE.value,
                            "updated_at": now_iso,
                        }
                    }
                )

        # 4. Full-day leave types write attendance rows so monthly leave counts stay accurate
        elif leave_type_val in (
            LeaveType.SICK.value,
            LeaveType.CASUAL.value,
            LeaveType.ANNUAL.value,
            LeaveType.UNPAID.value,
            "sick",
            "casual",
            "annual",
            "unpaid",
        ):
            status_map = {
                "sick": AttendanceStatus.SICK_LEAVE.value,
                "casual": AttendanceStatus.CASUAL_LEAVE.value,
                "annual": AttendanceStatus.ANNUAL_LEAVE.value,
                "unpaid": AttendanceStatus.UNPAID_LEAVE.value,
            }
            att_status = status_map.get(str(leave_type_val), AttendanceStatus.ON_LEAVE.value)
            for day_str in iter_date_range(existing.get("start_date"), existing.get("end_date")):
                await db.attendance_records.update_one(
                    {"user_id": target_user_id, "date": day_str},
                    {
                        "$set": {
                            "id": f"att_{target_user_id}_{day_str}",
                            "user_id": target_user_id,
                            "user_name": existing.get("user_name"),
                            "department": user_dept,
                            "date": day_str,
                            "shift_id": shift.id,
                            "shift_name": shift.name,
                            "status": att_status,
                            "is_wfh": False,
                            "updated_at": now_iso,
                        },
                        "$setOnInsert": {"created_at": now_iso},
                    },
                    upsert=True,
                )

    return LeaveResponse(**result)


async def delete_leave_request(request_id: str, current_user: dict) -> bool:
    """
    Deletes a leave, WFH, short leave, or regularization request.
    Allowed if the current user is the author of the request OR is an Admin/HR/Lead.
    Idempotent: returns True if request was already deleted.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    existing = await db.leave_requests.find_one({"id": request_id})
    if not existing:
        return True  # Already deleted (idempotent)

    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    user_role = str(current_user.get("role") or "").lower()
    is_author = str(existing.get("user_id") or "") == user_id
    is_management = user_role in ("admin", "hr", "operations", "team_lead")

    if not (is_author or is_management):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this request."
        )

    await db.leave_requests.delete_one({"id": request_id})
    return True


# ──────────────────────────────────────────────────────────
# 8. ADMIN MANUAL ENTRY OVERRIDE
# ──────────────────────────────────────────────────────────

async def admin_manual_attendance_entry(
    user_id: str,
    date_str: str,
    check_in: Optional[str],
    check_out: Optional[str],
    status_override: Optional[AttendanceStatus],
    notes: Optional[str],
    admin_user: dict,
) -> AttendanceRecordResponse:
    """
    Allows HR / Admin to manually create or override an attendance record.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    target_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")

    user_name = target_user.get("full_name") or target_user.get("name", "User")
    department = target_user.get("department")
    shift = await get_shift_for_user(user_id, department)
    existing = await db.attendance_records.find_one({"user_id": user_id, "date": date_str})
    rec_id = existing.get("id") if existing else f"att_{user_id}_{date_str}"

    now_iso = datetime.now(timezone.utc).isoformat()
    admin_name = admin_user.get("full_name") or admin_user.get("name", "Admin")

    is_absent_override = (status_override == AttendanceStatus.ABSENT)
    is_leave_override = status_override in (
        AttendanceStatus.ON_LEAVE,
        AttendanceStatus.SICK_LEAVE,
        AttendanceStatus.CASUAL_LEAVE,
        AttendanceStatus.ANNUAL_LEAVE,
        AttendanceStatus.UNPAID_LEAVE,
        AttendanceStatus.SUNDAY_OFF,
        AttendanceStatus.FIRST_SATURDAY_OFF,
        AttendanceStatus.HOLIDAY,
    )

    if is_absent_override:
        check_in = None
        check_out = None

    if check_in and not is_absent_override and not is_leave_override:
        calc_res = calculate_daily_attendance(
            check_in_time=check_in,
            check_out_time=check_out,
            shift_start=shift.start_time,
            shift_end=shift.end_time,
            break_duration_minutes=shift.break_duration_minutes,
            grace_period_minutes=shift.grace_period_minutes,
            expected_hours=shift.expected_hours,
            is_night_shift=shift.is_night_shift,
        )
        work_hours = calc_res.work_hours
        work_duration_formatted = calc_res.work_duration_formatted
        overtime_hours = calc_res.overtime_hours
        overtime_formatted = calc_res.overtime_formatted
        undertime_hours = calc_res.undertime_hours
        undertime_formatted = calc_res.undertime_formatted
        if status_override == AttendanceStatus.WFH:
            late_minutes = 0
            is_late = False
            late_strike = 0
            final_status = AttendanceStatus.WFH.value
        elif status_override == AttendanceStatus.SHORT_LEAVE:
            late_minutes = 0
            is_late = False
            late_strike = 0
            final_status = AttendanceStatus.SHORT_LEAVE.value
        else:
            # Respect mathematical shift grace buffer against check_in time
            is_late = calc_res.is_late or (status_override == AttendanceStatus.LATE)
            late_strike = 1 if is_late else 0
            late_minutes = calc_res.late_minutes if is_late else 0
            final_status = AttendanceStatus.LATE.value if is_late else AttendanceStatus.PRESENT.value
    else:
        work_hours = 0.0
        work_duration_formatted = "00:00"
        overtime_hours = 0.0
        overtime_formatted = "+00:00"
        undertime_hours = shift.expected_hours if is_absent_override else 0.0
        undertime_formatted = format_minutes_to_hhmm(-int(round(shift.expected_hours * 60)), show_sign=True) if is_absent_override else "00:00"
        late_minutes = 0
        is_late = False
        late_strike = 0
        final_status = status_override.value if status_override else AttendanceStatus.ABSENT.value

    record_doc = {
        "id": f"att_{user_id}_{date_str}",
        "user_id": user_id,
        "user_name": user_name,
        "department": department,
        "date": date_str,
        "shift_id": shift.id,
        "shift_name": shift.name,
        "check_in": check_in,
        "check_out": check_out,
        "work_hours": work_hours,
        "work_duration_formatted": work_duration_formatted,
        "overtime_hours": overtime_hours,
        "overtime_formatted": overtime_formatted,
        "undertime_hours": undertime_hours,
        "undertime_formatted": undertime_formatted,
        "late_minutes": late_minutes,
        "is_late": is_late,
        "late_strike": late_strike,
        "status": final_status,
        "is_wfh": (final_status == AttendanceStatus.WFH.value),
        "is_missed_punch": False,
        "notes": f"Manual override by {admin_name}: {notes or ''}".strip(),
        "updated_at": now_iso,
    }

    await db.attendance_records.update_one(
        {"user_id": user_id, "date": date_str},
        {"$set": record_doc, "$setOnInsert": {"created_at": now_iso}},
        upsert=True
    )

    return AttendanceRecordResponse(**record_doc)


async def override_attendance_record(
    target_id: str,
    override_data: dict,
    admin_user: dict,
) -> AttendanceRecordResponse:
    """
    Overrides or creates an attendance record for a user / record ID.
    target_id can be a record_id or user_id.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    date_str = override_data.get("date") or datetime.now(ZoneInfo("Asia/Karachi")).strftime("%Y-%m-%d")
    user_id = target_id

    # 1. Check if target_id is an existing record ID
    rec = await db.attendance_records.find_one({"$or": [{"id": target_id}, {"_id": target_id}]})
    if rec:
        user_id = rec.get("user_id")
        date_str = rec.get("date", date_str)
    else:
        # 2. Check if target_id is user_id
        target_user = await db.users.find_one({"id": target_id})
        if target_user:
            user_id = target_id
            rec = await db.attendance_records.find_one({"user_id": user_id, "date": date_str})

    punch_in = override_data.get("punch_in") or override_data.get("check_in")
    punch_out = override_data.get("punch_out") or override_data.get("check_out")
    status_val = override_data.get("status")
    status_override = AttendanceStatus(status_val) if status_val else None
    notes = override_data.get("notes") or override_data.get("reason") or "HR Attendance Override"

    return await admin_manual_attendance_entry(
        user_id=user_id,
        date_str=date_str,
        check_in=punch_in,
        check_out=punch_out,
        status_override=status_override,
        notes=notes,
        admin_user=admin_user,
    )


# ──────────────────────────────────────────────────────────
# 9. COMPANY CALENDAR & HOLIDAYS
# ──────────────────────────────────────────────────────────

async def get_calendar_events(year: int, month: int) -> CalendarMonthResponse:
    """Retrieves all calendar events, holidays, and working Saturdays for a month."""
    db = get_database()
    if db is None:
        return CalendarMonthResponse(year=year, month=month, events=[], holidays=[], working_saturdays=[])

    month_prefix = f"{year:04d}-{month:02d}"
    docs = await db.company_calendar.find(
        {"date": {"$regex": f"^{month_prefix}-"}},
        {"_id": 0}
    ).sort("date", 1).to_list(100)

    events = [CalendarEventResponse(**d) for d in docs]
    holidays = [e.date for e in events if e.event_type == CalendarEventType.HOLIDAY]
    working_saturdays = [e.date for e in events if e.is_workday_override or e.event_type == CalendarEventType.WORKING_SATURDAY]

    return CalendarMonthResponse(
        year=year,
        month=month,
        events=events,
        holidays=holidays,
        working_saturdays=working_saturdays,
    )


async def create_calendar_event(event_in: CalendarEventCreate) -> CalendarEventResponse:
    """Creates a new company calendar event / holiday / working Saturday override."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    now_iso = datetime.now(timezone.utc).isoformat()
    event_dict = event_in.model_dump()
    event_dict["id"] = f"cal_{uuid.uuid4().hex[:10]}"
    event_dict["created_at"] = now_iso
    event_dict["updated_at"] = now_iso
    if isinstance(event_dict.get("event_type"), CalendarEventType):
        event_dict["event_type"] = event_dict["event_type"].value

    await db.company_calendar.insert_one(event_dict)
    created_doc = await db.company_calendar.find_one({"id": event_dict["id"]}, {"_id": 0})
    return CalendarEventResponse(**created_doc)


async def update_calendar_event(event_id: str, event_in: CalendarEventUpdate) -> CalendarEventResponse:
    """Updates an existing company calendar event."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    update_data = {k: v for k, v in event_in.model_dump().items() if v is not None}
    if not update_data:
        doc = await db.company_calendar.find_one({"id": event_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Calendar event '{event_id}' not found")
        return CalendarEventResponse(**doc)

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    if isinstance(update_data.get("event_type"), CalendarEventType):
        update_data["event_type"] = update_data["event_type"].value

    result = await db.company_calendar.find_one_and_update(
        {"id": event_id},
        {"$set": update_data},
        projection={"_id": 0},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail=f"Calendar event '{event_id}' not found")
    return CalendarEventResponse(**result)


async def delete_calendar_event(event_id: str) -> dict:
    """Deletes a company calendar event."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    result = await db.company_calendar.delete_one({"id": event_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Calendar event '{event_id}' not found")
    return {"message": f"Calendar event '{event_id}' deleted successfully", "id": event_id}
