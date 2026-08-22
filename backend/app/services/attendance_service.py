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
from pymongo.errors import DuplicateKeyError
from pymongo import ReturnDocument

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
    derive_expected_hours,
)
from app.services.attendance_security import (
    validate_punch_security,
    validate_client_ip,
    collect_whitelist_entries,
    resolve_effective_client_ip,
    PunchSecurityResult,
)
from app.services.shift_assignment import resolve_shift_assignment_for_date
from app.services.overtime_gate import (
    checkout_gate_payload,
    classify_checkout_gate,
    minutes_after_shift_end,
    settle_checkout_hours,
    settled_to_record_fields,
    shift_buffers,
    shift_times,
)

logger = logging.getLogger(__name__)


# Company local timezone: Pakistan Standard Time (PKT, UTC+5 / Asia/Karachi)
PKT_TIMEZONE = timezone(timedelta(hours=5))


def get_now_pkt() -> datetime:
    return datetime.now(PKT_TIMEZONE)


def get_current_date_str() -> str:
    """Returns today's date in YYYY-MM-DD format based on company local timezone (PKT)."""
    return get_now_pkt().strftime("%Y-%m-%d")


def get_current_time_str() -> str:
    """Returns current time in HH:MM format based on company local timezone (PKT)."""
    return get_now_pkt().strftime("%H:%M")


def is_future_pkt_clock_time(date_str: Optional[str], time_hhmm: Optional[str]) -> bool:
    """True when date + HH:MM is still ahead of current Pakistan time."""
    if not date_str or not time_hhmm:
        return False
    today = get_current_date_str()
    if date_str > today:
        return True
    if date_str < today:
        return False
    try:
        return parse_time_to_minutes(time_hhmm) > parse_time_to_minutes(get_current_time_str())
    except Exception:
        return False


def _blank_to_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return str(value).strip()


def _assert_checkout_not_in_future(
    date_str: Optional[str],
    time_hhmm: Optional[str],
    *,
    for_reviewer: bool = False,
) -> None:
    if not is_future_pkt_clock_time(date_str, time_hhmm):
        return
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "Time Out cannot be in the future. If they are still working, reject this and ask for Time In Only, "
            "or use Daily Matrix override and clear Time Out."
            if for_reviewer
            else "Time Out cannot be in the future. If you are still working, submit Time In Only so overtime is not lost."
        ),
    )


async def _snapshot_attendance_punches(user_id: Optional[str], date_str: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not user_id or not date_str:
        return None, None
    db = get_database()
    if db is None:
        return None, None
    rec = await db.attendance_records.find_one(
        {"user_id": user_id, "date": date_str},
        {"_id": 0, "check_in": 1, "check_out": 1, "punch_in": 1, "punch_out": 1},
    )
    if not rec:
        return None, None
    return rec.get("check_in") or rec.get("punch_in"), rec.get("check_out") or rec.get("punch_out")


async def _attach_original_punches(docs: List[dict]) -> None:
    """For pending corrections that never stored a snapshot, fill actual times from the live record."""
    db = get_database()
    if db is None or not docs:
        return
    pending: List[dict] = []
    keys: List[Dict[str, str]] = []
    for doc in docs:
        lt = str(doc.get("leave_type") or "")
        if lt not in (LeaveType.MISSED_PUNCH_REGULARIZATION.value, "missed_punch_regularization"):
            continue
        if str(doc.get("status") or "") != LeaveStatus.PENDING.value:
            continue
        if doc.get("original_check_in") or doc.get("original_check_out") or doc.get("original_punch_in") or doc.get("original_punch_out"):
            continue
        date_str = doc.get("regularization_date") or doc.get("start_date")
        user_id = doc.get("user_id")
        if not user_id or not date_str:
            continue
        pending.append(doc)
        keys.append({"user_id": user_id, "date": date_str})
    if not pending:
        return
    recs = await db.attendance_records.find(
        {"$or": keys},
        {"_id": 0, "user_id": 1, "date": 1, "check_in": 1, "check_out": 1, "punch_in": 1, "punch_out": 1},
    ).to_list(300)
    lookup = {(r.get("user_id"), r.get("date")): r for r in recs}
    for doc in pending:
        rec = lookup.get((doc.get("user_id"), doc.get("regularization_date") or doc.get("start_date")))
        if not rec:
            continue
        orig_in = rec.get("check_in") or rec.get("punch_in")
        orig_out = rec.get("check_out") or rec.get("punch_out")
        doc["original_check_in"] = orig_in
        doc["original_check_out"] = orig_out
        doc["original_punch_in"] = orig_in
        doc["original_punch_out"] = orig_out


async def _attach_applicant_roles(docs: List[dict]) -> None:
    """Stamp live user.role onto each request so the inbox can hide out-of-scope actions."""
    db = get_database()
    if db is None or not docs:
        return
    user_ids = list({d.get("user_id") for d in docs if d.get("user_id")})
    if not user_ids:
        return
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "role": 1},
    ).to_list(2000)
    role_map = {
        str(u.get("id")): str(u.get("role") or "team_member").lower()
        for u in users
        if u.get("id")
    }
    for doc in docs:
        uid = doc.get("user_id")
        doc["user_role"] = role_map.get(uid) or str(doc.get("user_role") or "team_member").lower()


async def _resolve_applicant_role(user_id: Optional[str], stored_role: Optional[str] = None) -> str:
    db = get_database()
    if db is not None and user_id:
        user = await db.users.find_one(
            {"$or": [{"id": user_id}, {"_id": user_id}]},
            {"_id": 0, "role": 1},
        )
        if user and user.get("role"):
            return str(user.get("role")).lower()
    return str(stored_role or "team_member").lower()


def shift_field(shift: Any, key: str, default: Any = None) -> Any:
    """Read a shift attribute from a Pydantic model or a Mongo dict."""
    if shift is None:
        return default
    if isinstance(shift, dict):
        val = shift.get(key)
    else:
        val = getattr(shift, key, None)
    return default if val is None else val


def is_night_shift_template(shift: Any) -> bool:
    if shift is None:
        return False
    if bool(shift_field(shift, "is_night_shift", False)):
        return True
    start_m = parse_time_to_minutes(shift_field(shift, "start_time") or "09:30")
    end_m = parse_time_to_minutes(shift_field(shift, "end_time") or "18:30")
    return end_m <= start_m


def is_shift_window_closed(shift: Any, now: Optional[datetime] = None) -> bool:
    """
    True once THIS employee's assigned shift end time has passed.

    Uses the template on `shift` (Standard, HR, Afternoon, Night, or any custom
    11:30–18:30 / overnight window). Times are never hardcoded.

    Same-calendar-day shifts stay open from midnight until that template's end_time.
    Overnight templates (is_night_shift or end <= start) stay open through midnight
    and lock after end_time the following morning, with a 2-hour early-arrival window.
    """
    if shift is None:
        return False
    now = now or get_now_pkt()
    now_m = now.hour * 60 + now.minute
    start_m = parse_time_to_minutes(shift_field(shift, "start_time") or "09:30")
    end_m = parse_time_to_minutes(shift_field(shift, "end_time") or "18:30")
    night = is_night_shift_template(shift)
    if not night:
        return now_m >= end_m
    if now_m >= start_m or now_m < end_m:
        return False
    early_m = (start_m - 120) % 1440
    if early_m < start_m and early_m <= now_m < start_m:
        return False
    return True


def closed_shift_attendance_date(shift: Any, now: Optional[datetime] = None) -> str:
    """Calendar date to lock when the current shift window has already ended."""
    now = now or get_now_pkt()
    if is_night_shift_template(shift):
        end_m = parse_time_to_minutes(shift_field(shift, "end_time") or "05:00")
        now_m = now.hour * 60 + now.minute
        if now_m >= end_m:
            return (now.date() - timedelta(days=1)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")


def unpunched_day_status(shift: Any, date_str: str, now: Optional[datetime] = None) -> AttendanceStatus:
    """Absent only after that employee's own shift end; otherwise still waiting to check in."""
    now = now or get_now_pkt()
    today = now.strftime("%Y-%m-%d")
    if date_str < today:
        return AttendanceStatus.ABSENT
    if date_str > today:
        return AttendanceStatus.AWAITING_CHECKIN
    if is_shift_window_closed(shift, now):
        return AttendanceStatus.ABSENT
    return AttendanceStatus.AWAITING_CHECKIN


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


def shift_calc_kwargs(shift: ShiftResponse, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Build calculate_daily_attendance kwargs from a shift template."""
    kwargs = {
        "shift_start": shift.start_time,
        "shift_end": shift.end_time,
        "break_duration_minutes": int(shift.break_duration_minutes or 0),
        "break_start_time": getattr(shift, "break_start_time", None),
        "break_end_time": getattr(shift, "break_end_time", None),
        "grace_period_minutes": shift.grace_period_minutes,
        "is_night_shift": bool(shift.is_night_shift),
    }
    if extra:
        kwargs.update(extra)
    return kwargs


def compute_settled_checkout(
    cin: str,
    cout: str,
    shift: Any,
    extra: Optional[Dict[str, Any]] = None,
    overtime_status: Optional[str] = None,
    auto_approve: bool = False,
):
    """Claimed hours plus credited hours after the overtime / undertime gate."""
    if isinstance(shift, ShiftResponse):
        kwargs = shift_calc_kwargs(shift, extra)
    else:
        kwargs = shift_doc_calc_kwargs(shift, extra)
    start, end, night = shift_times(shift)
    ot_buf, ut_buf = shift_buffers(shift)
    claimed = calculate_daily_attendance(
        check_in_time=cin,
        check_out_time=cout,
        **kwargs,
    )
    shift_end_calc = calculate_daily_attendance(
        check_in_time=cin,
        check_out_time=end,
        **kwargs,
    )
    gate = classify_checkout_gate(
        check_out=cout,
        claimed_overtime_minutes=claimed.overtime_minutes,
        claimed_undertime_minutes=claimed.undertime_minutes,
        shift_start=start,
        shift_end=end,
        is_night_shift=night,
        overtime_buffer_minutes=ot_buf,
        undertime_buffer_minutes=ut_buf,
        check_in=cin,
    )
    delta = minutes_after_shift_end(cout, start, end, night, cin)
    settled = settle_checkout_hours(
        claimed=claimed,
        shift_end_calc=shift_end_calc,
        gate=gate,
        minutes_past_end=delta,
        overtime_status=overtime_status,
        auto_approve=auto_approve,
    )
    return claimed, settled, gate, ot_buf, ut_buf, start, end


async def _upsert_overtime_request(
    user: dict,
    date_str: str,
    reason: str,
    category: Optional[str],
    overtime_minutes: int,
    shift_end: str,
    check_out: str,
) -> str:
    db = get_database()
    user_id = user.get("id")
    now_iso = datetime.now(timezone.utc).isoformat()
    existing = await db.leave_requests.find_one(
        {
            "user_id": user_id,
            "leave_type": LeaveType.OVERTIME.value,
            "start_date": date_str,
            "status": LeaveStatus.PENDING.value,
        },
        {"_id": 0},
    )
    payload = {
        "leave_type": LeaveType.OVERTIME.value,
        "start_date": date_str,
        "end_date": date_str,
        "reason": reason,
        "variance_category": category,
        "overtime_date": date_str,
        "overtime_minutes": int(overtime_minutes or 0),
        "shift_end": shift_end,
        "check_out": check_out,
        "updated_at": now_iso,
    }
    if existing:
        await db.leave_requests.update_one({"id": existing["id"]}, {"$set": payload})
        return existing["id"]
    req_id = f"leave_{uuid.uuid4().hex[:10]}"
    await db.leave_requests.insert_one(
        {
            **payload,
            "id": req_id,
            "user_id": user_id,
            "user_name": user.get("full_name") or user.get("name", "User"),
            "user_role": str(user.get("role") or "team_member").lower(),
            "department": user.get("department"),
            "status": LeaveStatus.PENDING.value,
            "created_at": now_iso,
        }
    )
    return req_id


async def _close_pending_overtime_requests(
    user_id: str,
    date_str: str,
    status_value: str = LeaveStatus.CANCELLED.value,
) -> None:
    db = get_database()
    if db is None or not user_id or not date_str:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.leave_requests.update_many(
        {
            "user_id": user_id,
            "leave_type": LeaveType.OVERTIME.value,
            "start_date": date_str,
            "status": LeaveStatus.PENDING.value,
        },
        {"$set": {"status": status_value, "updated_at": now_iso}},
    )


def shift_doc_calc_kwargs(raw_shift: Optional[Dict[str, Any]], extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    raw = raw_shift or {}
    kwargs = {
        "shift_start": raw.get("start_time") or "09:30",
        "shift_end": raw.get("end_time") or "18:30",
        "break_duration_minutes": int(raw.get("break_duration_minutes") or 0),
        "break_start_time": raw.get("break_start_time"),
        "break_end_time": raw.get("break_end_time"),
        "grace_period_minutes": int(raw.get("grace_period_minutes") or 30),
        "is_night_shift": bool(raw.get("is_night_shift", False)),
    }
    if extra:
        kwargs.update(extra)
    return kwargs


def apply_derived_shift_hours(shift_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Keep expected_hours in sync with start/end minus unpaid break."""
    start = shift_dict.get("start_time") or "09:30"
    end = shift_dict.get("end_time") or "18:30"
    brk = int(shift_dict.get("break_duration_minutes") or 0)
    night = bool(shift_dict.get("is_night_shift", False))
    if brk <= 0:
        shift_dict["break_start_time"] = None
        shift_dict["break_end_time"] = None
    shift_dict["expected_hours"] = derive_expected_hours(start, end, brk, night)
    return shift_dict


def record_punch_times(rec: Optional[Dict[str, Any]]) -> Tuple[Optional[str], Optional[str]]:
    """Prefer either naming convention used across punch / override / legacy docs."""
    if not rec:
        return None, None
    cin = rec.get("check_in") or rec.get("punch_in")
    cout = rec.get("check_out") or rec.get("punch_out")
    return cin, cout


def scheduled_break_minutes(raw_shift: Optional[Dict[str, Any]]) -> int:
    """Unpaid break from the assigned shift template, not from a punch record."""
    if not raw_shift:
        return 60
    if raw_shift.get("break_duration_minutes") is not None:
        return max(0, int(raw_shift.get("break_duration_minutes") or 0))
    shift_type = str(raw_shift.get("shift_type") or "").lower()
    if shift_type == "afternoon":
        return 0
    return 60


# Seeded templates that attendance uses as department/company fallbacks.
# A later custom template (e.g. "Operation Shift") must never steal these slots
# just because the create form defaulted its shift_type to "standard".
CANONICAL_SHIFT_TYPE_IDS = {
    "standard": "shift_standard",
    "hr": "shift_hr",
    "afternoon": "shift_afternoon",
    "night": "shift_night",
}
CANONICAL_SHIFT_TYPE_NAMES = {
    "standard": "standard shift",
    "hr": "hr shift",
    "afternoon": "afternoon shift",
    "night": "night shift",
}


def pick_canonical_shift(shifts: List[Dict[str, Any]], shift_type: str) -> Optional[Dict[str, Any]]:
    """Pick the seeded template for a category; never the newest extra of that type."""
    wanted = str(shift_type or "").strip().lower()
    if not wanted:
        return None
    typed = [s for s in shifts if str(s.get("shift_type") or "").strip().lower() == wanted]
    if not typed:
        return None
    canonical_id = CANONICAL_SHIFT_TYPE_IDS.get(wanted)
    if canonical_id:
        for s in typed:
            if s.get("id") == canonical_id:
                return s
    canonical_name = CANONICAL_SHIFT_TYPE_NAMES.get(wanted)
    if canonical_name:
        for s in typed:
            if str(s.get("name") or "").strip().lower() == canonical_name:
                return s
    typed_sorted = sorted(typed, key=lambda s: str(s.get("created_at") or ""))
    return typed_sorted[0]


def resolve_fallback_shifts(
    all_shifts: List[Dict[str, Any]],
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Company default (Standard) and HR default, ignoring extra templates of the same type."""
    std_shift = pick_canonical_shift(all_shifts, "standard") or (all_shifts[0] if all_shifts else None)
    hr_shift = pick_canonical_shift(all_shifts, "hr") or std_shift
    return std_shift, hr_shift


def coerce_user_created_shift_type(shift_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Keep user-created templates out of the standard/hr/afternoon/night fallback buckets."""
    stype = shift_dict.get("shift_type")
    if isinstance(stype, ShiftType):
        stype = stype.value
    stype_l = str(stype or "").strip().lower()
    name_l = str(shift_dict.get("name") or "").strip().lower()
    canonical_name = CANONICAL_SHIFT_TYPE_NAMES.get(stype_l)
    if stype_l in CANONICAL_SHIFT_TYPE_IDS and name_l != canonical_name:
        shift_dict["shift_type"] = ShiftType.CUSTOM.value
    return shift_dict


def apply_daily_calc_fields(doc: Dict[str, Any], shift: Any) -> Dict[str, Any]:
    """Recompute net hours / OT / UT from punches using that day's shift rules."""
    cin, cout = record_punch_times(doc)
    if isinstance(shift, ShiftResponse):
        scheduled_break = int(shift.break_duration_minutes or 0)
    else:
        scheduled_break = scheduled_break_minutes(shift)
    doc["break_minutes"] = scheduled_break
    if not cin:
        doc["working_hours_minutes"] = 0
        doc["work_hours"] = 0.0
        doc["work_duration_formatted"] = "00:00"
        doc["overtime_minutes"] = 0
        doc["overtime_hours"] = 0.0
        doc["overtime_formatted"] = "+00:00"
        return doc
    if shift is None:
        shift = {}
    status_val = str(doc.get("status") or "")
    extra = {
        "is_wfh": bool(doc.get("is_wfh")),
        "is_short_leave": bool(doc.get("is_short_leave") or status_val == AttendanceStatus.SHORT_LEAVE.value),
        "short_leave_hours": float(doc.get("short_leave_hours") or 0.0),
    }
    keep_status = {
        AttendanceStatus.WFH.value,
        AttendanceStatus.SHORT_LEAVE.value,
        AttendanceStatus.SICK_LEAVE.value,
        AttendanceStatus.CASUAL_LEAVE.value,
        AttendanceStatus.ANNUAL_LEAVE.value,
        AttendanceStatus.UNPAID_LEAVE.value,
        AttendanceStatus.MISSED_PUNCH.value,
        AttendanceStatus.ON_LEAVE.value,
    }
    doc["check_in"] = cin
    doc["punch_in"] = cin
    doc["check_out"] = cout
    doc["punch_out"] = cout
    if not cout:
        if isinstance(shift, ShiftResponse):
            kwargs = shift_calc_kwargs(shift, extra)
        else:
            kwargs = shift_doc_calc_kwargs(shift, extra)
        preview = calculate_daily_attendance(check_in_time=cin, check_out_time=None, **kwargs)
        if status_val not in keep_status:
            doc["status"] = preview.status.value
            doc["is_late"] = preview.is_late
            doc["late_strike"] = preview.late_strike
            doc["late_minutes"] = preview.late_minutes
        doc["working_hours_minutes"] = 0
        doc["work_hours"] = 0.0
        doc["work_duration_formatted"] = "00:00"
        doc["overtime_minutes"] = 0
        doc["overtime_hours"] = 0.0
        doc["overtime_formatted"] = "+00:00"
        doc["undertime_minutes"] = 0
        doc["undertime_hours"] = 0.0
        doc["undertime_formatted"] = "-00:00"
        doc["pending_overtime_minutes"] = 0
        doc["claimed_overtime_minutes"] = 0
        doc["overtime_status"] = "not_applicable"
        return doc
    claimed, settled, _gate, _ot_buf, _ut_buf, _start, _end = compute_settled_checkout(
        cin,
        cout,
        shift,
        extra=extra,
        overtime_status=doc.get("overtime_status"),
        auto_approve=str(doc.get("overtime_status") or "").lower() == "approved",
    )
    if status_val not in keep_status:
        doc["status"] = claimed.status.value
        doc["is_late"] = claimed.is_late
        doc["late_strike"] = claimed.late_strike
        doc["late_minutes"] = claimed.late_minutes
    doc.update(settled_to_record_fields(settled))
    return doc


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

_default_shifts_ensured = False


async def ensure_default_shifts() -> List[dict]:
    """
    Ensures standard shift templates exist in the database.
    If the `shifts` collection is empty, seeds DEFAULT_SHIFTS.
    Seed/backfill runs once per process so dashboard and admin reads stay cheap.
    """
    global _default_shifts_ensured
    db = get_database()
    if db is None:
        return []

    if _default_shifts_ensured:
        cursor = db.shifts.find({"is_active": True})
        return await cursor.to_list(100)

    count = await db.shifts.count_documents({})
    if count == 0:
        logger.info("Seeding DEFAULT_SHIFTS into shifts collection...")
        seeded_docs = []
        now_iso = datetime.now(timezone.utc).isoformat()
        for s in DEFAULT_SHIFTS:
            shift_dict = dict(s)
            stype = shift_dict['shift_type'].value if isinstance(shift_dict['shift_type'], ShiftType) else shift_dict['shift_type']
            shift_dict["id"] = shift_dict.get("id") or f"shift_{stype}"
            shift_dict["created_at"] = now_iso
            shift_dict["updated_at"] = now_iso
            # Convert ShiftType to string value for MongoDB
            if isinstance(shift_dict.get("shift_type"), ShiftType):
                shift_dict["shift_type"] = shift_dict["shift_type"].value
            seeded_docs.append(shift_dict)
        if seeded_docs:
            await db.shifts.insert_many(seeded_docs)
        _default_shifts_ensured = True
        return seeded_docs

    await _ensure_wfh_shift_templates()
    await _backfill_shift_break_windows()
    await _reclassify_noncanonical_category_shifts()
    _default_shifts_ensured = True
    cursor = db.shifts.find({"is_active": True})
    return await cursor.to_list(100)


async def _ensure_wfh_shift_templates() -> None:
    """Insert WFH Day / WFH Night templates if they were added after initial seed."""
    db = get_database()
    if db is None:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    for s in DEFAULT_SHIFTS:
        shift_dict = dict(s)
        if not shift_dict.get("id"):
            continue
        existing = await db.shifts.find_one({"id": shift_dict["id"]}, {"id": 1})
        if existing:
            continue
        if isinstance(shift_dict.get("shift_type"), ShiftType):
            shift_dict["shift_type"] = shift_dict["shift_type"].value
        shift_dict["created_at"] = now_iso
        shift_dict["updated_at"] = now_iso
        await db.shifts.insert_one(shift_dict)
        logger.info("Seeded missing shift template %s (%s)", shift_dict.get("name"), shift_dict["id"])


async def _reclassify_noncanonical_category_shifts() -> None:
    """
    Extra templates created from Admin default to shift_type=standard.
    Reclassify those extras as custom so they cannot become the company fallback.
    """
    db = get_database()
    if db is None:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    for stype, canonical_id in CANONICAL_SHIFT_TYPE_IDS.items():
        docs = await db.shifts.find({"shift_type": stype}, {"_id": 0, "id": 1, "name": 1, "created_at": 1}).to_list(100)
        if len(docs) <= 1:
            continue
        keep_id = None
        for d in docs:
            if d.get("id") == canonical_id:
                keep_id = d.get("id")
                break
        if not keep_id:
            canonical_name = CANONICAL_SHIFT_TYPE_NAMES[stype]
            named = [d for d in docs if str(d.get("name") or "").strip().lower() == canonical_name]
            if named:
                keep_id = named[0].get("id")
            else:
                keep_id = sorted(docs, key=lambda s: str(s.get("created_at") or ""))[0].get("id")
        for d in docs:
            extra_id = d.get("id")
            if not extra_id or extra_id == keep_id:
                continue
            await db.shifts.update_one(
                {"id": extra_id},
                {"$set": {"shift_type": ShiftType.CUSTOM.value, "updated_at": now_iso}},
            )
            logger.info(
                "Reclassified extra shift '%s' (%s) from type '%s' to custom",
                d.get("name"),
                extra_id,
                stype,
            )


async def _backfill_shift_break_windows() -> None:
    """Ensure seeded templates have lunch windows and derived expected hours."""
    db = get_database()
    if db is None:
        return
    patches = [
        ("shift_standard", {"break_duration_minutes": 60, "break_start_time": "13:00", "break_end_time": "14:00", "expected_hours": 8.0}),
        ("shift_hr", {"break_duration_minutes": 60, "break_start_time": "13:00", "break_end_time": "14:00", "expected_hours": 8.0}),
        ("shift_afternoon", {"break_duration_minutes": 0, "break_start_time": None, "break_end_time": None, "expected_hours": 6.0}),
        ("shift_night", {"break_duration_minutes": 60, "break_start_time": "01:00", "break_end_time": "02:00", "expected_hours": 7.0}),
    ]
    now_iso = datetime.now(timezone.utc).isoformat()
    for shift_id, fields in patches:
        query: Dict[str, Any] = {
            "id": shift_id,
            "$or": [
                {"break_start_time": {"$exists": False}},
                {"break_start_time": None, "break_duration_minutes": {"$gt": 0}},
                {"expected_hours": {"$exists": False}},
            ],
        }
        await db.shifts.update_one(query, {"$set": {**fields, "updated_at": now_iso}})

    # Custom and edited templates: keep their times, sync net expected hours.
    all_shifts = await db.shifts.find({}, {"_id": 0}).to_list(200)
    for raw in all_shifts:
        derived = derive_expected_hours(
            raw.get("start_time") or "09:30",
            raw.get("end_time") or "18:30",
            int(raw.get("break_duration_minutes") or 0),
            bool(raw.get("is_night_shift", False)),
        )
        current = raw.get("expected_hours")
        try:
            current_val = float(current) if current is not None else None
        except (TypeError, ValueError):
            current_val = None
        if current_val is None or abs(current_val - derived) > 0.011:
            await db.shifts.update_one(
                {"id": raw.get("id")},
                {"$set": {"expected_hours": derived, "updated_at": now_iso}},
            )


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
    shift_dict = apply_derived_shift_hours(shift_in.model_dump())
    shift_dict["id"] = f"shift_{uuid.uuid4().hex[:10]}"
    shift_dict["created_at"] = now_iso
    shift_dict["updated_at"] = now_iso
    if isinstance(shift_dict.get("shift_type"), ShiftType):
        shift_dict["shift_type"] = shift_dict["shift_type"].value
    coerce_user_created_shift_type(shift_dict)

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

    existing = await db.shifts.find_one({"id": shift_id}, {"_id": 0}) or {}
    merged = {**existing, **update_data}
    update_data = apply_derived_shift_hours(merged)
    update_data.pop("_id", None)

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


async def _load_user_shift_assignment(user_id: str) -> Optional[dict]:
    db = get_database()
    if db is None or not user_id:
        return None
    return await db.user_shift_assignments.find_one({"user_id": user_id}, {"_id": 0})


async def is_auto_wfh_for_date(user_id: str, date_str: str) -> bool:
    """True when the week pattern or a date override schedules WFH (no request needed)."""
    assignment = await _load_user_shift_assignment(user_id)
    return bool(resolve_shift_assignment_for_date(assignment, date_str).get("auto_wfh"))


async def assign_user_shift(assignment: ShiftAssignmentRequest) -> dict:
    """Assigns or updates a user's default shift and optional weekday / date pattern."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    shift_ids = {assignment.shift_id}
    if assignment.weekday_rules:
        for rule in assignment.weekday_rules.values():
            if rule.shift_id:
                shift_ids.add(rule.shift_id)
    if assignment.date_overrides:
        for override in assignment.date_overrides:
            if override.shift_id:
                shift_ids.add(override.shift_id)

    found_shifts = await db.shifts.find(
        {"id": {"$in": list(shift_ids)}},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(len(shift_ids) + 8)
    found_by_id = {doc.get("id"): doc for doc in found_shifts if doc.get("id")}
    missing = [sid for sid in shift_ids if sid not in found_by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"Shift '{missing[0]}' does not exist")

    shift = found_by_id.get(assignment.shift_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": assignment.user_id,
        "shift_id": assignment.shift_id,
        "shift_name": (shift or {}).get("name") or assignment.shift_id,
        "effective_from": assignment.effective_from or get_current_date_str(),
        "updated_at": now_iso,
    }
    if assignment.weekday_rules is not None:
        doc["weekday_rules"] = {
            str(key): rule.model_dump() for key, rule in assignment.weekday_rules.items()
        }
    if assignment.date_overrides is not None:
        doc["date_overrides"] = [override.model_dump() for override in assignment.date_overrides]

    await db.user_shift_assignments.update_one(
        {"user_id": assignment.user_id},
        {"$set": doc, "$setOnInsert": {"created_at": now_iso, "id": f"assign_{uuid.uuid4().hex[:10]}"}},
        upsert=True,
    )
    saved = await db.user_shift_assignments.find_one({"user_id": assignment.user_id}, {"_id": 0})
    return {
        "message": f"Shift '{doc['shift_name']}' assigned to user '{assignment.user_id}'",
        **(saved or doc),
    }


async def get_user_shift_assignments() -> List[dict]:
    """Retrieves all user shift assignments."""
    db = get_database()
    if db is None:
        return []
    docs = await db.user_shift_assignments.find({}, {"_id": 0}).to_list(1000)
    return docs


async def get_shift_for_user(
    user_id: str,
    department: Optional[str] = None,
    date_str: Optional[str] = None,
) -> ShiftResponse:
    """
    Finds the active shift for a given user on a calendar date (PKT today if omitted):
    1. Date override, then weekday rule, then legacy assignment.shift_id.
    2. Fallback to HR shift if department is 'HR'.
    3. Fallback to the seeded Standard Shift (never a later custom template).
    """
    db = get_database()
    await ensure_default_shifts()
    target_date = date_str or get_current_date_str()

    if db is not None:
        assignment = await db.user_shift_assignments.find_one({"user_id": user_id}, {"_id": 0})
        if assignment:
            resolved = resolve_shift_assignment_for_date(assignment, target_date)
            shift_id = resolved.get("shift_id")
            if shift_id:
                shift_doc = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
                if shift_doc and shift_doc.get("is_active", True):
                    return ShiftResponse(**shift_doc)

        all_shifts = await db.shifts.find({"is_active": True}, {"_id": 0}).to_list(100)
        std_shift, hr_shift = resolve_fallback_shifts(all_shifts)

        if department and str(department).upper() == "HR" and hr_shift:
            return ShiftResponse(**hr_shift)
        if std_shift:
            return ShiftResponse(**std_shift)

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


def resolve_shift_doc_for_date(
    assignment: Optional[Dict[str, Any]],
    date_str: str,
    shifts_by_id: Dict[str, Any],
    stored_shift_id: Optional[str] = None,
    fallback: Any = None,
) -> Any:
    """Same priority as the daily matrix: date override → weekday → default → stored."""
    try:
        resolved = resolve_shift_assignment_for_date(assignment, date_str)
    except (TypeError, ValueError):
        resolved = {}
    assigned_id = resolved.get("shift_id")
    if assigned_id and assigned_id in shifts_by_id:
        return shifts_by_id[assigned_id]
    if stored_shift_id and stored_shift_id in shifts_by_id:
        return shifts_by_id[stored_shift_id]
    return fallback


def _shift_label(shift: Any, default: str = "Standard Shift") -> str:
    if shift is None:
        return default
    if isinstance(shift, ShiftResponse):
        return shift.name or default
    return (shift.get("name") if isinstance(shift, dict) else None) or default


def _shift_id(shift: Any) -> Optional[str]:
    if shift is None:
        return None
    if isinstance(shift, ShiftResponse):
        return shift.id
    return shift.get("id") if isinstance(shift, dict) else None


LEAVE_LOCK_STATUSES = {
    AttendanceStatus.WFH.value,
    AttendanceStatus.SHORT_LEAVE.value,
    AttendanceStatus.SICK_LEAVE.value,
    AttendanceStatus.CASUAL_LEAVE.value,
    AttendanceStatus.ANNUAL_LEAVE.value,
    AttendanceStatus.UNPAID_LEAVE.value,
    AttendanceStatus.MISSED_PUNCH.value,
    AttendanceStatus.ON_LEAVE.value,
    AttendanceStatus.HOLIDAY.value,
    AttendanceStatus.SUNDAY_OFF.value,
    AttendanceStatus.FIRST_SATURDAY_OFF.value,
    AttendanceStatus.WEEKEND_OFF.value,
}


def _record_has_punch(rec: Optional[Dict[str, Any]]) -> bool:
    if not rec:
        return False
    cin, _cout = record_punch_times(rec)
    return bool(cin)


async def persist_auto_absent(
    user: dict,
    shift: ShiftResponse,
    date_str: str,
    notes: str = "Auto-marked Absent after shift end without check-in",
) -> Optional[dict]:
    """
    Write an absent row if this user never punched and is not on leave / holiday.
    Does not overwrite punches or approved leave statuses.
    """
    db = get_database()
    if db is None:
        return None

    user_id = user.get("id")
    if not user_id:
        return None

    existing = await db.attendance_records.find_one(
        {"user_id": user_id, "date": date_str},
        {"_id": 0},
    )
    if _record_has_punch(existing):
        return existing
    if existing and str(existing.get("status") or "") in LEAVE_LOCK_STATUSES:
        return existing

    approved_leave = await get_approved_leave_for_date(user_id, date_str)
    if approved_leave:
        return existing
    if await is_auto_wfh_for_date(user_id, date_str):
        return existing

    try:
        parsed = datetime.strptime(date_str, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return existing

    if db is not None:
        cal_event = await db.company_calendar.find_one({"date": date_str}, {"_id": 0})
        if cal_event:
            ev_type = str(cal_event.get("event_type") or "")
            if ev_type in ("holiday", CalendarEventType.HOLIDAY.value):
                return existing
            is_override = bool(cal_event.get("is_workday_override")) or ev_type in (
                "working_saturday",
                CalendarEventType.WORKING_SATURDAY.value,
            )
        else:
            is_override = False
        if not is_override:
            if is_sunday_date(parsed) or is_first_saturday_of_month(parsed):
                return existing
    elif is_sunday_date(parsed) or is_first_saturday_of_month(parsed):
        return existing

    expected_hours = float(shift.expected_hours) if shift else 8.0
    expected_minutes = int(round(expected_hours * 60))
    now_iso = datetime.now(timezone.utc).isoformat()
    user_name = user.get("full_name") or user.get("name", "User")
    department = user.get("department")

    absent_doc = {
        "id": f"att_{user_id}_{date_str}",
        "user_id": user_id,
        "user_name": user_name,
        "department": department,
        "date": date_str,
        "shift_id": shift.id if shift else "shift_standard",
        "shift_name": shift.name if shift else "Standard Shift",
        "check_in": None,
        "check_out": None,
        "punch_in": None,
        "punch_out": None,
        "break_minutes": 0,
        "working_hours_minutes": 0,
        "work_hours": 0.0,
        "work_duration_formatted": "00:00",
        "overtime_hours": 0.0,
        "overtime_minutes": 0,
        "overtime_formatted": "+00:00",
        "undertime_hours": expected_hours,
        "undertime_minutes": expected_minutes,
        "undertime_formatted": format_minutes_to_hhmm(-expected_minutes, show_sign=True),
        "late_minutes": 0,
        "is_late": False,
        "late_strike": 0,
        "status": AttendanceStatus.ABSENT.value,
        "is_wfh": False,
        "is_missed_punch": False,
        "is_short_leave": False,
        "short_leave_hours": 0.0,
        "ip_verified": False,
        "gps_verified": False,
        "notes": notes,
        "updated_at": now_iso,
    }
    await db.attendance_records.update_one(
        {"user_id": user_id, "date": date_str},
        {"$set": absent_doc, "$setOnInsert": {"created_at": now_iso}},
        upsert=True,
    )
    return absent_doc


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
    extra_list = doc.get("office_ip_whitelist") or []
    public_ips = list(doc.get("office_public_ips") or [])
    overbroad_cidrs = {"10.0.0.0/8", "0.0.0.0/0", "::/0", "192.168.0.0/16"}
    subnets = [
        str(s).strip()
        for s in (doc.get("office_subnets") or [])
        if str(s).strip() and str(s).strip() not in overbroad_cidrs
    ]
    merged_ips: List[str] = []
    seen = set()
    for item in public_ips + extra_list:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        merged_ips.append(text)
    doc["office_public_ips"] = merged_ips
    doc["office_subnets"] = [str(s).strip() for s in subnets if str(s).strip()]
    doc["office_ip_whitelist"] = merged_ips
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

async def is_wfh_leave_approved_for_date(user_id: str, date_str: str) -> bool:
    """True only when an approved WFH leave request covers date_str."""
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


async def is_wfh_approved_for_date(user_id: str, date_str: str) -> bool:
    """
    WFH for this date: approved request, or weekday/date pattern with auto_wfh.
    A real office punch still records as office (see process_check_in).
    """
    if await is_wfh_leave_approved_for_date(user_id, date_str):
        return True
    return await is_auto_wfh_for_date(user_id, date_str)


async def get_approved_leave_for_date(user_id: str, date_str: str) -> Optional[dict]:
    """
    Retrieves any approved leave document covering date_str for the user.
    """
    db = get_database()
    if db is None:
        return None

    return await db.leave_requests.find_one({
        "user_id": user_id,
        "leave_type": {"$nin": ["missed_punch_regularization", "regularization", "overtime"]},
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

    # Punch time is always server PKT. Client timestamps are ignored.
    date_str = get_current_date_str()
    time_str = get_current_time_str()

    # 1. Check duplicate check-in
    existing_record = await db.attendance_records.find_one(
        {"user_id": user_id, "date": date_str},
        {"_id": 0}
    )
    if existing_record and (existing_record.get("check_in") or existing_record.get("punch_in")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance already recorded for {date_str}. Check-in: {existing_record.get('check_in')}"
        )

    # 2. Punch = office unless they have an approved WFH request.
    # Auto WFH weekdays stay remote only when they do not punch.
    is_wfh = await is_wfh_leave_approved_for_date(user_id, date_str)

    # 3. Shift window: nobody may punch in after their shift has ended
    shift = await get_shift_for_user(user_id, department, date_str)
    if is_shift_window_closed(shift) and not custom_time:
        lock_date = closed_shift_attendance_date(shift)
        if lock_date == date_str:
            await persist_auto_absent(user, shift, date_str)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Shift ended at {shift.end_time}. Check-in is closed and today's attendance "
                    "has been marked Absent."
                ),
            )

    # 4. Security verification — office IP or in-range GPS is enough when enabled
    settings = await get_security_settings()
    ip_to_check = resolve_effective_client_ip(
        client_ip,
        check_in_req.detected_public_ip or check_in_req.client_ip,
    )
    sec_result: PunchSecurityResult = validate_punch_security(
        client_ip=ip_to_check,
        user_lat=check_in_req.latitude,
        user_lon=check_in_req.longitude,
        is_wfh_approved=is_wfh,
        settings=settings,
        accuracy_meters=check_in_req.accuracy_meters,
        gps_captured_at=check_in_req.gps_captured_at,
    )
    if not sec_result.authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=sec_result.error or "Check-in rejected: location or Wi-Fi security check failed."
        )

    # 5. Late calculation
    calc_res = calculate_daily_attendance(
        check_in_time=time_str,
        check_out_time=None,
        **shift_calc_kwargs(shift, {"is_wfh": is_wfh}),
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
        "break_minutes": int(shift.break_duration_minutes or 0),
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
        "ip_verified": bool(sec_result.ip_verified),
        "gps_verified": bool(sec_result.gps_verified),
        "distance_meters": (
            int(round(sec_result.distance_meters))
            if isinstance(sec_result.distance_meters, (int, float))
            and sec_result.distance_meters < 10_000_000
            else None
        ),
        "notes": check_in_req.notes,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    open_punch_filter = {
        "user_id": user_id,
        "date": date_str,
        "$and": [
            {"$or": [{"check_in": None}, {"check_in": ""}, {"check_in": {"$exists": False}}]},
            {"$or": [{"punch_in": None}, {"punch_in": ""}, {"punch_in": {"$exists": False}}]},
        ],
    }
    try:
        result = await db.attendance_records.update_one(
            open_punch_filter,
            {"$set": record_doc},
            upsert=True,
        )
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance already recorded for {date_str}.",
        )
    if result.matched_count == 0 and result.upserted_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance already recorded for {date_str}.",
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
    date_str = get_current_date_str()
    time_str = get_current_time_str()

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
        shift = await get_shift_for_user(user_id, department, date_str)

    is_wfh = existing.get("is_wfh", False)
    is_short_leave = existing.get("is_short_leave", False)
    short_leave_hours = existing.get("short_leave_hours", 0.0)
    closed_break_minutes = accumulate_break_minutes(existing, time_str)
    _ = closed_break_minutes

    extra = {
        "is_wfh": is_wfh,
        "is_short_leave": is_short_leave,
        "short_leave_hours": short_leave_hours,
    }
    claimed, settled, gate, _ot_buf, _ut_buf, _start, shift_end = compute_settled_checkout(
        cin,
        time_str,
        shift,
        extra=extra,
    )
    reason = (check_out_req.variance_reason or "").strip()
    category = (check_out_req.variance_category or "").strip() or None
    if gate in ("overtime", "undertime") and len(reason) < 3:
        label = "overtime" if gate == "overtime" else "leaving early"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Please enter a reason for {label}. Your shift ended at {shift_end}.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    status_out = AttendanceStatus.WFH.value if is_wfh else claimed.status.value
    update_doc = {
        "check_out": time_str,
        "punch_out": time_str,
        "break_minutes": int(shift.break_duration_minutes or 0),
        "is_on_break": False,
        "break_start_time": None,
        **settled_to_record_fields(settled),
        "late_minutes": claimed.late_minutes,
        "is_late": claimed.is_late,
        "late_strike": claimed.late_strike,
        "status": status_out,
        "is_missed_punch": False,
        "variance_category": category,
        "updated_at": now_iso,
    }
    if gate == "overtime":
        update_doc["overtime_reason"] = reason
        update_doc["overtime_request_id"] = await _upsert_overtime_request(
            user=user,
            date_str=date_str,
            reason=reason,
            category=category,
            overtime_minutes=settled.claimed_overtime_minutes,
            shift_end=shift_end,
            check_out=time_str,
        )
    elif gate == "undertime":
        update_doc["undertime_reason"] = reason
        update_doc["overtime_reason"] = None
    else:
        update_doc["overtime_reason"] = None
        update_doc["undertime_reason"] = None

    if check_out_req.notes:
        old_notes = existing.get("notes") or ""
        update_doc["notes"] = f"{old_notes} | Check-out: {check_out_req.notes}".strip(" | ")
    elif reason:
        old_notes = existing.get("notes") or ""
        tag = "Overtime" if gate == "overtime" else "Undertime" if gate == "undertime" else "Check-out"
        update_doc["notes"] = f"{old_notes} | {tag}: {reason}".strip(" | ")

    result = await db.attendance_records.find_one_and_update(
        {
            "user_id": user_id,
            "date": date_str,
            "$and": [
                {"$or": [{"check_out": None}, {"check_out": ""}, {"check_out": {"$exists": False}}]},
                {"$or": [{"punch_out": None}, {"punch_out": ""}, {"punch_out": {"$exists": False}}]},
            ],
        },
        {"$set": update_doc},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already checked out today or check-in is missing.",
        )

    try:
        from app.services.log_compliance import recompute_day_score
        await recompute_day_score(user_id, date_str)
    except Exception:
        logger.exception("Failed to recompute daily log score after check-out")

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
    detected_public_ip: Optional[str] = None,
) -> TodayAttendanceResponse:
    """
    Returns today's punch card status, active timer metrics, and assigned shift for the user.
    """
    db = get_database()
    user_id = user.get("id")
    department = user.get("department")
    now_pkt = get_now_pkt()
    target_date = date_str or now_pkt.strftime("%Y-%m-%d")

    shift = await get_shift_for_user(user_id, department, target_date)
    is_wfh = await is_wfh_approved_for_date(user_id, target_date)
    sec_settings = await get_security_settings()
    whitelist = collect_whitelist_entries(sec_settings)
    effective_ip = resolve_effective_client_ip(client_ip, detected_public_ip)

    is_ip_verified = False
    if is_wfh and sec_settings.allow_wfh_bypass:
        is_ip_verified = True
    elif effective_ip:
        is_ip_verified = validate_client_ip(effective_ip, whitelist, ())

    shift_ended = is_shift_window_closed(shift, now_pkt)
    if shift_ended and not is_wfh:
        lock_date = closed_shift_attendance_date(shift, now_pkt)
        if lock_date == target_date:
            await persist_auto_absent(user, shift, target_date)

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

    record_status = str(record_doc.get("status") or "") if record_doc else ""
    if record_doc and cin:
        try:
            status_val = AttendanceStatus(record_doc.get("status", AttendanceStatus.PRESENT))
        except ValueError:
            status_val = AttendanceStatus.PRESENT
        if status_val == AttendanceStatus.ABSENT:
            status_val = AttendanceStatus.LATE if record_doc.get("is_late") else AttendanceStatus.PRESENT
        is_wfh = bool(record_doc.get("is_wfh", False) or status_val == AttendanceStatus.WFH)
    elif is_wfh:
        status_val = AttendanceStatus.WFH
    elif record_status in LEAVE_LOCK_STATUSES:
        try:
            status_val = AttendanceStatus(record_status)
        except ValueError:
            status_val = AttendanceStatus.AWAITING_CHECKIN
    elif shift_ended and not cin:
        status_val = AttendanceStatus.ABSENT
    else:
        status_val = AttendanceStatus.AWAITING_CHECKIN

    locked_no_punch = bool(shift_ended and not cin) or (
        record_status in LEAVE_LOCK_STATUSES and not cin
    )
    can_check_in = (not bool(cin)) and (not locked_no_punch)
    can_check_out = is_checked_in
    has_active_break = bool(record_doc and record_doc.get("is_on_break"))

    show_absent_record = record_status == AttendanceStatus.ABSENT.value and shift_ended
    record_res = AttendanceRecordResponse.from_mongo(record_doc) if (record_doc and (cin or show_absent_record)) else None

    gate_payload = checkout_gate_payload("none", shift.end_time, *shift_buffers(shift), 0, 0)
    if is_checked_in and cin:
        now_time = get_current_time_str()
        extra = {
            "is_wfh": is_wfh,
            "is_short_leave": bool(record_doc.get("is_short_leave")) if record_doc else False,
            "short_leave_hours": float((record_doc or {}).get("short_leave_hours") or 0.0),
        }
        claimed, settled, gate, ot_buf, ut_buf, _start, shift_end = compute_settled_checkout(
            cin,
            now_time,
            shift,
            extra=extra,
        )
        claimed_mins = (
            settled.claimed_overtime_minutes if gate == "overtime"
            else claimed.undertime_minutes if gate == "undertime"
            else 0
        )
        gate_payload = checkout_gate_payload(
            gate,
            shift_end,
            ot_buf,
            ut_buf,
            claimed_mins,
            settled.minutes_past_end,
        )

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
        client_ip=effective_ip,
        is_ip_verified=is_ip_verified,
        enforce_ip_whitelist=bool(sec_settings.enforce_ip_whitelist),
        enforce_gps_geofence=bool(sec_settings.enforce_gps_geofence),
        shift_ended=bool(shift_ended and not cin),
        checkout_gate=gate_payload,
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
    shifts_by_id: Dict[str, ShiftResponse] = {}
    assignment: Optional[Dict[str, Any]] = None
    if shift and getattr(shift, "id", None):
        shifts_by_id[shift.id] = shift

    records = []
    if db is not None:
        from app.services.attendance_golive import get_effective_start_date
        min_date = get_effective_start_date()
        assignment = await db.user_shift_assignments.find_one({"user_id": user_id}, {"_id": 0})
        for raw in await db.shifts.find({"is_active": True}, {"_id": 0}).to_list(100):
            try:
                parsed = ShiftResponse(**raw)
                shifts_by_id[parsed.id] = parsed
            except Exception:
                continue
        docs = await db.attendance_records.find(
            {
                "user_id": user_id,
                "$and": [
                    {"date": {"$regex": f"^{month_str}-"}},
                    {"date": {"$gte": min_date}},
                ],
            },
            {"_id": 0}
        ).sort("date", 1).to_list(100)
        needed_ids = {
            d.get("shift_id") for d in docs
            if d.get("shift_id") and d.get("shift_id") not in shifts_by_id
        }
        if needed_ids:
            for raw in await db.shifts.find({"id": {"$in": list(needed_ids)}}, {"_id": 0}).to_list(50):
                try:
                    parsed = ShiftResponse(**raw)
                    shifts_by_id[parsed.id] = parsed
                except Exception:
                    continue
        for d in docs:
            rec_shift = resolve_shift_doc_for_date(
                assignment,
                str(d.get("date") or ""),
                shifts_by_id,
                stored_shift_id=d.get("shift_id"),
                fallback=shift,
            )
            d["shift_id"] = _shift_id(rec_shift) or d.get("shift_id")
            d["shift_name"] = _shift_label(rec_shift, d.get("shift_name") or "Standard Shift")
            apply_daily_calc_fields(d, rec_shift)
            records.append(AttendanceRecordResponse.from_mongo(d))

    # Calculate total working days in this month
    total_working_days = await calculate_month_working_days(year, month)

    daily_dicts = []
    for r in records:
        daily_dicts.append({
            "status": r.status,
            "late_strike": r.late_strike,
            "work_minutes": r.working_hours_minutes or int(round(r.work_hours * 60)),
            "overtime_minutes": r.overtime_minutes or int(round(r.overtime_hours * 60)),
            "undertime_minutes": r.undertime_minutes or int(round(r.undertime_hours * 60)),
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


async def get_timesheet_for_user_id(user_id: str, year: int, month: int) -> MonthlyTimesheetResponse:
    """Management view of another employee's monthly timesheet."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Employee not found")

    role = str(user_doc.get("role") or "").lower()
    if role == "client":
        raise HTTPException(status_code=400, detail="Client accounts do not have attendance timesheets")

    return await get_my_timesheet(user_doc, year, month)


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
    from app.services.attendance_golive import get_effective_start_date
    min_date = get_effective_start_date()
    start_day = 1
    if year == 2026 and month == 8:
        start_day = int(min_date[-2:]) if min_date.startswith("2026-08-") else 21
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
    from app.services.attendance_golive import get_effective_start_date
    min_date = get_effective_start_date()
    if target_date < min_date:
        target_date = min_date
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
        "leave_type": {"$nin": ["missed_punch_regularization", "regularization", "overtime"]},
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
    std_shift, hr_shift = resolve_fallback_shifts(all_shifts)

    all_assignments = await db.user_shift_assignments.find({}, {"_id": 0}).to_list(1000)
    user_assignment_map = {a["user_id"]: a for a in all_assignments if a.get("user_id")}

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

        resolved = resolve_shift_assignment_for_date(user_assignment_map.get(u_id), target_date)
        assigned_shift_id = resolved.get("shift_id")
        auto_wfh = bool(resolved.get("auto_wfh"))
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
        shift_break = scheduled_break_minutes(raw_shift)
        shift_timing = f"{shift_start} - {shift_end}"

        if rec:
            check_in, check_out = record_punch_times(rec)
            is_wfh_flag = bool(rec.get("is_wfh", False))
            is_short_leave_flag = bool(rec.get("is_short_leave", False))
            short_leave_hours_val = float(rec.get("short_leave_hours", 0.0))
            raw_status = rec.get("status")
            keep_status = {
                "sick_leave", "casual_leave", "annual_leave", "unpaid_leave",
                "short_leave", "wfh", "missed_punch", "sunday_off",
                "first_saturday_off", "holiday", "on_leave",
            }

            if check_in:
                calc_res = calculate_daily_attendance(
                    check_in_time=check_in,
                    check_out_time=check_out,
                    **shift_doc_calc_kwargs(raw_shift, {
                        "is_wfh": is_wfh_flag,
                        "is_short_leave": is_short_leave_flag,
                        "short_leave_hours": short_leave_hours_val,
                    }),
                )

                if raw_status in keep_status:
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

                stored_mins = rec.get("working_hours_minutes")
                work_mins = int(stored_mins) if check_out and stored_mins is not None else (calc_res.work_minutes if check_out else 0)
                work_hours = rec.get("work_duration_formatted") or (calc_res.work_duration_formatted if check_out else "00:00")
                break_mins_val = shift_break
            else:
                work_hours = "00:00"
                work_mins = 0
                break_mins_val = shift_break
                is_late_flag = False
                is_late_alert = False
                late_minutes = 0

                if raw_status in keep_status:
                    status_enum = AttendanceStatus(raw_status)
                else:
                    status_enum = unpunched_day_status(raw_shift, target_date)

            if status_enum == AttendanceStatus.ABSENT:
                status_badge = "Absent"
                absent_count += 1
            elif status_enum == AttendanceStatus.AWAITING_CHECKIN:
                status_badge = "Awaiting"
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
                overtime_status=rec.get("overtime_status"),
                pending_overtime_minutes=int(rec.get("pending_overtime_minutes") or 0),
                undertime_reason=rec.get("undertime_reason"),
                overtime_reason=rec.get("overtime_reason"),
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
            # Regular working day: awaiting until this employee's shift ends, then absent.
            # Auto-WFH weekdays stay WFH without a punch.
            if auto_wfh:
                status_enum = AttendanceStatus.WFH
                is_absent_now = False
                wfh_count += 1
            else:
                status_enum = unpunched_day_status(raw_shift, target_date)
                is_absent_now = status_enum == AttendanceStatus.ABSENT
                if is_absent_now:
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
                status=status_enum,
                status_badge="W.F.H" if auto_wfh else ("Absent" if is_absent_now else "Awaiting"),
                work_hours="00:00",
                late_minutes=0,
                is_late=False,
                is_late_alert=False,
                ip_verified=False,
                gps_verified=False,
                is_wfh_approved=bool(auto_wfh),
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
    std_shift, hr_shift = resolve_fallback_shifts(all_shifts)

    all_assignments = await db.user_shift_assignments.find({}, {"_id": 0}).to_list(1000)
    user_assignment_map = {a["user_id"]: a for a in all_assignments if a.get("user_id")}

    # Batch-load all monthly records for all users in a single query
    from app.services.attendance_golive import get_effective_start_date
    min_date = get_effective_start_date()
    all_monthly_records = await db.attendance_records.find(
        {
            "$and": [
                {"date": {"$regex": f"^{month_prefix}-"}},
                {"date": {"$gte": min_date}},
            ]
        },
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

        assignment = user_assignment_map.get(u_id)
        assigned_shift_id = (assignment or {}).get("shift_id")
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
            rec_shift = resolve_shift_doc_for_date(
                assignment,
                str(r.get("date") or ""),
                shifts_by_id,
                stored_shift_id=r.get("shift_id"),
                fallback=raw_shift,
            )
            apply_daily_calc_fields(r, rec_shift or raw_shift)
            daily_dicts.append({
                "status": r.get("status", AttendanceStatus.PRESENT),
                "late_strike": r.get("late_strike", 0),
                "work_minutes": int(r.get("working_hours_minutes") or round(float(r.get("work_hours", 0.0)) * 60)),
                "overtime_minutes": int(r.get("overtime_minutes") or round(float(r.get("overtime_hours", 0.0)) * 60)),
                "undertime_minutes": int(r.get("undertime_minutes") or round(float(r.get("undertime_hours", 0.0)) * 60)),
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

    from app.services.attendance_golive import get_effective_start_date
    min_date = get_effective_start_date()
    if req.start_date < min_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance and leave tracking starts on {min_date}.",
        )

    from app.services.leave_balance import assert_leave_quota
    lt = req.leave_type.value if isinstance(req.leave_type, LeaveType) else str(req.leave_type)
    if lt in (LeaveType.OVERTIME.value, "overtime"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Overtime requests are created automatically at check-out.",
        )
    if lt in (LeaveType.MISSED_PUNCH_REGULARIZATION.value, "missed_punch_regularization"):
        correction_target = (req.correction_target or "time_in").strip().lower()
        if correction_target in ("time_out", "both"):
            _assert_checkout_not_in_future(
                req.regularization_date or req.start_date,
                req.regularization_check_out,
            )
    await assert_leave_quota(
        user,
        lt,
        req.start_date,
        req.end_date,
        req.short_leave_hours,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    req_dict = req.model_dump()
    req_dict["id"] = f"leave_{uuid.uuid4().hex[:10]}"
    req_dict["user_id"] = user_id
    req_dict["user_name"] = user_name
    req_dict["user_role"] = str(user.get("role") or "team_member").lower()
    req_dict["department"] = department
    req_dict["status"] = LeaveStatus.PENDING.value
    if isinstance(req_dict.get("leave_type"), LeaveType):
        req_dict["leave_type"] = req_dict["leave_type"].value
    req_dict["created_at"] = now_iso
    req_dict["updated_at"] = now_iso

    if lt in (LeaveType.MISSED_PUNCH_REGULARIZATION.value, "missed_punch_regularization"):
        orig_in, orig_out = await _snapshot_attendance_punches(
            user_id, req.regularization_date or req.start_date
        )
        if orig_in is None:
            orig_in = req.original_check_in
        if orig_out is None:
            orig_out = req.original_check_out
        req_dict["original_check_in"] = orig_in
        req_dict["original_check_out"] = orig_out
        req_dict["original_punch_in"] = orig_in
        req_dict["original_punch_out"] = orig_out

    await db.leave_requests.insert_one(req_dict)
    created_doc = await db.leave_requests.find_one({"id": req_dict["id"]}, {"_id": 0})
    return LeaveResponse(**created_doc)


async def get_user_leave_requests(user_id: str) -> List[LeaveResponse]:
    """Retrieves all leave requests submitted by a specific user."""
    db = get_database()
    if db is None:
        return []
    docs = await db.leave_requests.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    await _attach_original_punches(docs)
    await _attach_applicant_roles(docs)
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
    await _attach_original_punches(docs)
    await _attach_applicant_roles(docs)
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
    await _attach_original_punches(docs)
    await _attach_applicant_roles(docs)
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

    from app.services.leave_permissions import assert_can_review_leave_request

    applicant_role = await _resolve_applicant_role(existing.get("user_id"), existing.get("user_role"))
    assert_can_review_leave_request(reviewer_user, existing.get("user_id"), applicant_role)

    reviewer_id = reviewer_user.get("id")
    reviewer_name = reviewer_user.get("full_name") or reviewer_user.get("name", "Reviewer")
    now_iso = datetime.now(timezone.utc).isoformat()
    status_str = review_data.status.value if isinstance(review_data.status, LeaveStatus) else str(review_data.status)

    if status_str == LeaveStatus.APPROVED.value:
        leave_type_val = existing.get("leave_type")
        if leave_type_val in (LeaveType.MISSED_PUNCH_REGULARIZATION.value, "missed_punch_regularization"):
            correction_target = (existing.get("correction_target") or "time_in").strip().lower()
            if correction_target in ("time_out", "both"):
                _assert_checkout_not_in_future(
                    existing.get("regularization_date") or existing.get("start_date"),
                    existing.get("regularization_check_out") or existing.get("regularization_punch_out"),
                    for_reviewer=True,
                )

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
        review_date = (
            existing.get("regularization_date")
            or existing.get("start_date")
            or get_current_date_str()
        )
        shift = await get_shift_for_user(target_user_id, user_dept, review_date)

        # 1. Missed Punch Regularization Dynamic Recalculation
        if leave_type_val in (LeaveType.MISSED_PUNCH_REGULARIZATION.value, "missed_punch_regularization"):
            reg_date = existing.get("regularization_date") or existing.get("start_date")
            existing_rec = await db.attendance_records.find_one({"user_id": target_user_id, "date": reg_date})
            correction_target = (existing.get("correction_target") or "time_in").strip().lower()

            if correction_target == "time_in":
                reg_in = existing.get("regularization_check_in") or shift.start_time
                reg_out = ((existing_rec.get("check_out") or existing_rec.get("punch_out")) if existing_rec else None)
            elif correction_target == "time_out":
                reg_in = (existing_rec.get("check_in") or existing_rec.get("punch_in")) if existing_rec else shift.start_time
                reg_out = existing.get("regularization_check_out") or shift.end_time
            else: # both
                reg_in = existing.get("regularization_check_in") or shift.start_time
                reg_out = existing.get("regularization_check_out") or (existing_rec.get("check_out") if existing_rec else None)

            if reg_in and reg_out:
                _claimed, settled, _gate, _ot, _ut, _s, _e = compute_settled_checkout(
                    reg_in,
                    reg_out,
                    shift,
                    auto_approve=True,
                )
                hour_fields = settled_to_record_fields(settled)
            else:
                calc_res = calculate_daily_attendance(
                    check_in_time=reg_in,
                    check_out_time=reg_out,
                    **shift_calc_kwargs(shift),
                )
                hour_fields = {
                    "working_hours_minutes": calc_res.work_minutes,
                    "work_hours": calc_res.work_hours,
                    "work_duration_formatted": calc_res.work_duration_formatted,
                    "overtime_minutes": calc_res.overtime_minutes,
                    "overtime_hours": calc_res.overtime_hours,
                    "overtime_formatted": calc_res.overtime_formatted,
                    "undertime_minutes": calc_res.undertime_minutes,
                    "undertime_hours": calc_res.undertime_hours,
                    "undertime_formatted": calc_res.undertime_formatted,
                    "pending_overtime_minutes": 0,
                    "claimed_overtime_minutes": 0,
                    "overtime_status": "not_applicable",
                }
                settled = None
            if reg_out:
                await _close_pending_overtime_requests(
                    target_user_id,
                    reg_date,
                    LeaveStatus.APPROVED.value if (settled and settled.overtime_minutes > 0) else LeaveStatus.CANCELLED.value,
                )
            preview = calculate_daily_attendance(
                check_in_time=reg_in,
                check_out_time=reg_out,
                **shift_calc_kwargs(shift),
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
                **hour_fields,
                "late_minutes": preview.late_minutes,
                "is_late": preview.is_late,
                "late_strike": preview.late_strike,
                "status": preview.status.value,
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
            if target_user_id and reg_date and reg_out:
                try:
                    from app.services.log_compliance import recompute_day_score
                    await recompute_day_score(target_user_id, reg_date)
                except Exception:
                    logger.exception("Failed to recompute daily log score after punch regularization")

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
                    **shift_calc_kwargs(shift, {
                        "is_short_leave": True,
                        "short_leave_hours": sl_hours,
                    }),
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

        # 5. Overtime credit
        elif leave_type_val in (LeaveType.OVERTIME.value, "overtime"):
            target_date = existing.get("overtime_date") or existing.get("start_date")
            rec = await db.attendance_records.find_one(
                {"user_id": target_user_id, "date": target_date},
                {"_id": 0},
            )
            cin = (rec.get("check_in") or rec.get("punch_in")) if rec else None
            cout = (rec.get("check_out") or rec.get("punch_out")) if rec else None
            if rec and cin and cout:
                _claimed, settled, _gate, _ot, _ut, _s, _e = compute_settled_checkout(
                    cin,
                    cout,
                    shift,
                    extra={
                        "is_wfh": bool(rec.get("is_wfh")),
                        "is_short_leave": bool(rec.get("is_short_leave")),
                        "short_leave_hours": float(rec.get("short_leave_hours") or 0.0),
                    },
                    overtime_status="approved",
                    auto_approve=True,
                )
                await db.attendance_records.update_one(
                    {"user_id": target_user_id, "date": target_date},
                    {"$set": {**settled_to_record_fields(settled), "updated_at": now_iso}},
                )

    elif status_str == LeaveStatus.REJECTED.value:
        leave_type_val = existing.get("leave_type")
        if leave_type_val in (LeaveType.OVERTIME.value, "overtime"):
            target_user_id = existing.get("user_id")
            user_dept = existing.get("department")
            target_date = existing.get("overtime_date") or existing.get("start_date")
            shift = await get_shift_for_user(target_user_id, user_dept, target_date)
            rec = await db.attendance_records.find_one(
                {"user_id": target_user_id, "date": target_date},
                {"_id": 0},
            )
            cin = (rec.get("check_in") or rec.get("punch_in")) if rec else None
            cout = (rec.get("check_out") or rec.get("punch_out")) if rec else None
            if rec and cin and cout:
                _claimed, settled, _gate, _ot, _ut, _s, _e = compute_settled_checkout(
                    cin,
                    cout,
                    shift,
                    extra={
                        "is_wfh": bool(rec.get("is_wfh")),
                        "is_short_leave": bool(rec.get("is_short_leave")),
                        "short_leave_hours": float(rec.get("short_leave_hours") or 0.0),
                    },
                    overtime_status="rejected",
                )
                await db.attendance_records.update_one(
                    {"user_id": target_user_id, "date": target_date},
                    {"$set": {**settled_to_record_fields(settled), "updated_at": now_iso}},
                )

    return LeaveResponse(**result)


async def delete_leave_request(request_id: str, current_user: dict) -> bool:
    """
    Deletes a pending leave, WFH, short leave, or regularization request.
    Allowed for the applicant withdrawing their own request, or Admin.
    HR and Operations cannot delete someone else's request.
    Idempotent: returns True if request was already deleted.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    existing = await db.leave_requests.find_one({"id": request_id})
    if not existing:
        return True  # Already deleted (idempotent)

    from app.services.leave_permissions import assert_can_delete_leave_request

    assert_can_delete_leave_request(
        current_user,
        existing.get("user_id"),
        existing.get("status"),
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
    shift = await get_shift_for_user(user_id, department, date_str)
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
        if check_out:
            calc_res, settled, _gate, _ot, _ut, _s, _e = compute_settled_checkout(
                check_in,
                check_out,
                shift,
                auto_approve=True,
            )
            work_hours = settled.work_hours
            work_duration_formatted = settled.work_duration_formatted
            overtime_hours = settled.overtime_hours
            overtime_formatted = settled.overtime_formatted
            undertime_hours = settled.undertime_hours
            undertime_formatted = settled.undertime_formatted
            ot_fields = settled_to_record_fields(settled)
        else:
            calc_res = calculate_daily_attendance(
                check_in_time=check_in,
                check_out_time=check_out,
                **shift_calc_kwargs(shift),
            )
            work_hours = calc_res.work_hours
            work_duration_formatted = calc_res.work_duration_formatted
            overtime_hours = calc_res.overtime_hours
            overtime_formatted = calc_res.overtime_formatted
            undertime_hours = calc_res.undertime_hours
            undertime_formatted = calc_res.undertime_formatted
            ot_fields = {
                "overtime_minutes": 0,
                "pending_overtime_minutes": 0,
                "claimed_overtime_minutes": 0,
                "overtime_status": "not_applicable",
            }
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
        ot_fields = {
            "overtime_minutes": 0,
            "pending_overtime_minutes": 0,
            "claimed_overtime_minutes": 0,
            "overtime_status": "not_applicable",
        }

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
        "punch_in": check_in,
        "punch_out": check_out,
        "break_minutes": 0 if is_absent_override or is_leave_override or not check_out else int(shift.break_duration_minutes or 0),
        "working_hours_minutes": int(round(float(work_hours or 0) * 60)),
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
        **ot_fields,
    }

    await db.attendance_records.update_one(
        {"user_id": user_id, "date": date_str},
        {"$set": record_doc, "$setOnInsert": {"created_at": now_iso}},
        upsert=True
    )
    await _close_pending_overtime_requests(
        user_id,
        date_str,
        LeaveStatus.APPROVED.value if (ot_fields.get("overtime_minutes") or 0) > 0 else LeaveStatus.CANCELLED.value,
    )

    if user_id and date_str:
        try:
            from app.services.log_compliance import recompute_day_score
            await recompute_day_score(user_id, date_str)
        except Exception:
            logger.exception("Failed to recompute daily log score after attendance override")

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

    date_str = override_data.get("date") or get_current_date_str()
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

    punch_in = _blank_to_none(override_data.get("punch_in")) or _blank_to_none(override_data.get("check_in"))
    punch_out = _blank_to_none(override_data.get("punch_out"))
    if punch_out is None:
        punch_out = _blank_to_none(override_data.get("check_out"))
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
