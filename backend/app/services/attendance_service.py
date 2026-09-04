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
from typing import Optional, List, Dict, Any, Tuple, Union
from fastapi import HTTPException, status
import logging
from pymongo.errors import DuplicateKeyError
from pymongo import ReturnDocument

from app.database import get_database
from app.core.mongo_filters import exact_ci
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
from app.constants.office_location import (
    OFFICE_LATITUDE,
    OFFICE_LONGITUDE,
    get_built_in_office_ips,
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
from app.services import push_service

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


async def _heal_overtime_requests(docs: List[dict], active_only_pending: bool = False) -> List[dict]:
    """
    Fast batch-recalculation for overtime requests:
    - Reads claimed/settled overtime directly from attendance_records.
    - If true overtime is 0 (employee only compensated for late arrival), cancels/clears the request.
    - If true overtime > 0, ensures overtime_minutes in document matches.
    """
    db = get_database()
    if db is None or not docs:
        return docs

    ot_docs = [
        d for d in docs
        if str(d.get("leave_type") or "").lower() in (LeaveType.OVERTIME.value, "overtime")
    ]
    if not ot_docs:
        return docs

    keys = []
    for d in ot_docs:
        uid = d.get("user_id")
        dt = d.get("overtime_date") or d.get("start_date")
        if uid and dt:
            keys.append({"user_id": uid, "date": dt})

    if not keys:
        return docs

    recs = await db.attendance_records.find(
        {"$or": keys},
        {"_id": 0, "user_id": 1, "date": 1, "claimed_overtime_minutes": 1, "overtime_minutes": 1}
    ).to_list(len(keys) + 10)
    rec_lookup = {(r.get("user_id"), r.get("date")): r for r in recs}

    filtered_docs = []
    for doc in docs:
        lt = str(doc.get("leave_type") or "").lower()
        if lt not in (LeaveType.OVERTIME.value, "overtime"):
            filtered_docs.append(doc)
            continue

        uid = doc.get("user_id")
        dt = doc.get("overtime_date") or doc.get("start_date")
        rec = rec_lookup.get((uid, dt))
        if not rec:
            filtered_docs.append(doc)
            continue

        stored_claimed = rec.get("claimed_overtime_minutes")
        true_ot_minutes = int(stored_claimed if stored_claimed is not None else (rec.get("overtime_minutes") or 0))
        req_status = str(doc.get("status") or "").lower()

        if true_ot_minutes == 0:
            if req_status == LeaveStatus.PENDING.value:
                doc["status"] = LeaveStatus.CANCELLED.value
                doc["overtime_minutes"] = 0
                if active_only_pending:
                    continue
            filtered_docs.append(doc)
        else:
            doc["overtime_minutes"] = true_ot_minutes
            filtered_docs.append(doc)

    return filtered_docs


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
    if bool(shift_field(shift, "is_night_shift", False)) or bool(shift_field(shift, "is_cross_midnight", False)):
        return True
    start_m = parse_time_to_minutes(shift_field(shift, "start_time") or "09:30")
    end_m = parse_time_to_minutes(shift_field(shift, "end_time") or "18:30")
    return end_m <= start_m


def get_shift_datetimes(
    shift: Any,
    shift_date_str: Optional[Union[str, date]] = None,
    now: Optional[datetime] = None,
) -> Tuple[datetime, datetime, datetime]:
    """
    Returns (shift_start_dt, shift_end_dt, checkout_cutoff_dt) for a shift on a specific shift_date.
    If shift_date_str is omitted, infers shift_date based on current PKT time and shift type.
    """
    from datetime import time as dt_time
    now = now or get_now_pkt()
    night = is_night_shift_template(shift)

    if shift_date_str:
        if isinstance(shift_date_str, date):
            s_date = shift_date_str
        else:
            s_date = datetime.strptime(str(shift_date_str), "%Y-%m-%d").date()
    else:
        if night and now.hour < 12:
            s_date = now.date() - timedelta(days=1)
        else:
            s_date = now.date()

    start_m = parse_time_to_minutes(shift_field(shift, "start_time") or "09:30")
    end_m = parse_time_to_minutes(shift_field(shift, "end_time") or "18:30")

    start_dt = datetime.combine(
        s_date,
        dt_time(start_m // 60, start_m % 60),
        tzinfo=PKT_TIMEZONE,
    )

    if night:
        if end_m == 0:
            end_dt = datetime.combine(
                s_date + timedelta(days=1),
                dt_time(0, 0),
                tzinfo=PKT_TIMEZONE,
            )
        else:
            end_dt = datetime.combine(
                s_date + timedelta(days=1),
                dt_time(end_m // 60, end_m % 60),
                tzinfo=PKT_TIMEZONE,
            )
    else:
        end_dt = datetime.combine(
            s_date,
            dt_time(end_m // 60, end_m % 60),
            tzinfo=PKT_TIMEZONE,
        )

    checkout_cutoff_dt = end_dt + timedelta(minutes=CHECKOUT_GRACE_MINUTES)
    return start_dt, end_dt, checkout_cutoff_dt


def is_shift_window_closed(
    shift: Any,
    now: Optional[datetime] = None,
    shift_date: Optional[Union[str, date]] = None,
) -> bool:
    """
    True once THIS employee's assigned shift end time has passed.

    Uses the template on `shift` (Standard, HR, Afternoon, Night, or any custom
    window). Times are never hardcoded.
    """
    now = now or get_now_pkt()
    if shift is None:
        if shift_date:
            s_date_str = shift_date.strftime("%Y-%m-%d") if isinstance(shift_date, date) else str(shift_date)
            yesterday_str = (now.date() - timedelta(days=1)).strftime("%Y-%m-%d")
            if s_date_str < yesterday_str:
                return True
            if s_date_str > now.strftime("%Y-%m-%d"):
                return False
        shift = {"start_time": "09:30", "end_time": "18:30"}
    _, end_dt, _ = get_shift_datetimes(shift, shift_date, now)
    return now >= end_dt


CHECKOUT_GRACE_MINUTES = 240  # 4-hour post-shift checkout window across all shifts


def is_checkout_window_closed(
    shift: Any,
    now: Optional[datetime] = None,
    grace_minutes: int = CHECKOUT_GRACE_MINUTES,
    shift_date: Optional[Union[str, date]] = None,
) -> bool:
    """
    True only after THIS employee's assigned shift end time PLUS the checkout waiting window has passed.

    Examples:
    - Standard Shift (09:30 - 18:30): 18:30 + 4h = 22:30. Closed only after 22:30.
    - HR Shift (09:30 - 18:00): 18:00 + 4h = 22:00. Closed only after 22:00.
    - Afternoon Shift (14:00 - 20:00): 20:00 + 4h = 24:00 (Midnight).
    - SEO Evening Shift (18:00 - 00:00): 00:00 + 4h = 04:00 AM next morning.
    - WFH Night Shift (21:00 - 05:00): 05:00 AM + 4h = 09:00 AM next morning.
    """
    now = now or get_now_pkt()
    if shift is None:
        if shift_date:
            s_date_str = shift_date.strftime("%Y-%m-%d") if isinstance(shift_date, date) else str(shift_date)
            yesterday_str = (now.date() - timedelta(days=1)).strftime("%Y-%m-%d")
            if s_date_str < yesterday_str:
                return True
            if s_date_str > now.strftime("%Y-%m-%d"):
                return False
        shift = {"start_time": "09:30", "end_time": "18:30"}
    _, _, cutoff_dt = get_shift_datetimes(shift, shift_date, now)
    return now >= cutoff_dt


def closed_shift_attendance_date(shift: Any, now: Optional[datetime] = None) -> str:
    """Calendar date to lock when the current shift window has already ended."""
    now = now or get_now_pkt()
    if is_night_shift_template(shift):
        if now.hour < 12:
            return (now.date() - timedelta(days=1)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")


def unpunched_day_status(shift: Any, date_str: str, now: Optional[datetime] = None) -> AttendanceStatus:
    """Absent only after that employee's own shift end; otherwise still waiting to check in."""
    now = now or get_now_pkt()
    if is_shift_window_closed(shift, now, shift_date=date_str):
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
    is_sl = bool((extra or {}).get("is_short_leave", False) or kwargs.get("is_short_leave", False))
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
        is_short_leave=is_sl,
    )
    delta = minutes_after_shift_end(cout, start, end, night, cin)
    settled = settle_checkout_hours(
        claimed=claimed,
        shift_end_calc=shift_end_calc,
        gate=gate,
        minutes_past_end=delta,
        overtime_status=overtime_status,
        auto_approve=auto_approve,
        undertime_buffer_minutes=ut_buf,
        overtime_buffer_minutes=ot_buf,
        is_short_leave=is_sl,
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

    # Dispatch mobile push notification to HR & Operations (excluding admin)
    try:
        hr_ops_ids = await push_service.get_hr_and_ops_user_ids()
        notify_ids = [uid for uid in hr_ops_ids if uid != user_id]
        if notify_ids:
            user_name = user.get("full_name") or user.get("name", "Employee")
            await push_service.dispatch_to_users(
                user_ids=notify_ids,
                title="New Overtime Request 📥",
                body=f"{user_name} claimed overtime (+{overtime_minutes}m) on {date_str}.",
                kind="leave_submitted",
                sender_id=user_id,
                sender_name=user_name,
                sender_role=user.get("role"),
            )
    except Exception as exc:
        logger.warning("Failed to dispatch push notification for overtime request %s: %s", req_id, exc)

    return req_id


def _checkout_reason_from_record(rec: Optional[Dict[str, Any]]) -> str:
    if not rec:
        return ""
    for key in ("overtime_reason", "undertime_reason"):
        val = str(rec.get(key) or "").strip()
        if val:
            return val
    notes = str(rec.get("notes") or "")
    for prefix in ("Overtime:", "Undertime:", "Check-out:"):
        if prefix in notes:
            return notes.split(prefix, 1)[1].strip().split("|")[0].strip()
    return ""


async def _heal_overtime_request_for_record(user: dict, rec: dict, shift: Any) -> dict:
    """
    If this day is overtime against the date-resolved shift but checkout used the
    stamped template, move the reason onto overtime and create the missing request.
    """
    db = get_database()
    cin, cout = record_punch_times(rec)
    if not cin or not cout or not rec.get("user_id") or not rec.get("date"):
        apply_daily_calc_fields(rec, shift)
        return rec

    extra = {
        "is_wfh": bool(rec.get("is_wfh")),
        "is_short_leave": bool(rec.get("is_short_leave")),
        "short_leave_hours": float(rec.get("short_leave_hours") or 0.0),
    }
    _claimed, settled, gate, _ot_buf, _ut_buf, _start, shift_end = compute_settled_checkout(
        cin,
        cout,
        shift,
        extra=extra,
        overtime_status=rec.get("overtime_status"),
        auto_approve=str(rec.get("overtime_status") or "").lower() == "approved",
    )
    apply_daily_calc_fields(rec, shift)

    resolved_id = _shift_id(shift)
    reason = _checkout_reason_from_record(rec)
    needs_request = gate == "overtime" and not rec.get("overtime_request_id")
    needs_reason_move = gate == "overtime" and bool(rec.get("undertime_reason"))
    needs_cleanup = gate != "overtime" and bool(rec.get("overtime_request_id"))
    needs_shift = bool(resolved_id and rec.get("shift_id") != resolved_id)
    if db is None or not (needs_request or needs_reason_move or needs_cleanup or needs_shift):
        return rec

    updates: Dict[str, Any] = dict(settled_to_record_fields(settled))
    if needs_shift:
        updates["shift_id"] = resolved_id
        updates["shift_name"] = _shift_label(shift, rec.get("shift_name") or "Standard Shift")
    if gate == "overtime":
        if needs_request:
            updates["overtime_request_id"] = await _upsert_overtime_request(
                user=user,
                date_str=str(rec.get("date")),
                reason=reason or "Stayed after shift end",
                category=rec.get("variance_category"),
                overtime_minutes=settled.claimed_overtime_minutes,
                shift_end=shift_end,
                check_out=cout,
            )
        if reason:
            updates["overtime_reason"] = reason
        updates["undertime_reason"] = None
    elif needs_cleanup:
        await _close_pending_overtime_requests(
            rec["user_id"],
            str(rec.get("date")),
            LeaveStatus.CANCELLED.value,
        )
        updates["overtime_request_id"] = None
        updates["overtime_reason"] = None

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.attendance_records.update_one(
        {"user_id": rec["user_id"], "date": rec["date"]},
        {"$set": updates},
    )
    rec.update(updates)
    return rec


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
    s_name = str(shift_field(shift, "name", "") or "").lower()
    is_shift_wfh = bool(shift_field(shift, "is_wfh") or "wfh" in s_name or str(shift_field(shift, "shift_type", "")).lower() == "wfh")
    is_short = bool(doc.get("is_short_leave") or status_val == AttendanceStatus.SHORT_LEAVE.value)
    sl_hours = float(doc.get("short_leave_hours") or 0.0)
    if is_short and sl_hours <= 0.0 and cin and cout:
        exp_h = float(shift_field(shift, "expected_hours", 8.0) or 8.0)
        in_m = parse_time_to_minutes(cin)
        out_m = parse_time_to_minutes(cout)
        start_m = parse_time_to_minutes(shift_field(shift, "start_time", "09:30"))
        effective_in = max(start_m, in_m)
        actual_work_m = max(0, out_m - effective_in - scheduled_break)
        sl_hours = max(0.0, round(exp_h - (actual_work_m / 60.0), 4))
        doc["short_leave_hours"] = sl_hours

    extra = {
        "is_wfh": bool(doc.get("is_wfh") or is_shift_wfh),
        "is_short_leave": is_short,
        "short_leave_hours": sl_hours,
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

    await db.shifts.update_many(
        {"$or": [
            {"id": "shift_afternoon"},
            {"shift_type": "afternoon"},
            {"name": {"$regex": "afternoon", "$options": "i"}},
        ]},
        {"$set": {
            "break_duration_minutes": 0,
            "break_start_time": None,
            "break_end_time": None,
            "updated_at": now_iso,
        }},
    )

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
        return SecuritySettingsSchema(
            office_latitude=OFFICE_LATITUDE,
            office_longitude=OFFICE_LONGITUDE,
            office_public_ips=list(get_built_in_office_ips()),
            office_ip_whitelist=list(get_built_in_office_ips()),
        )

    doc = await db.system_config.find_one({"key": "attendance_security"}, {"_id": 0})
    if not doc:
        default_settings = SecuritySettingsSchema(
            office_latitude=OFFICE_LATITUDE,
            office_longitude=OFFICE_LONGITUDE,
            office_public_ips=list(get_built_in_office_ips()),
            office_ip_whitelist=list(get_built_in_office_ips()),
        )
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
    for item in list(get_built_in_office_ips()) + public_ips + extra_list:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        merged_ips.append(text)
    doc["office_public_ips"] = merged_ips
    doc["office_subnets"] = [str(s).strip() for s in subnets if str(s).strip()]
    doc["office_ip_whitelist"] = merged_ips
    doc["office_latitude"] = OFFICE_LATITUDE
    doc["office_longitude"] = OFFICE_LONGITUDE
    return SecuritySettingsSchema(**doc)


async def update_security_settings(new_settings: SecuritySettingsSchema) -> SecuritySettingsSchema:
    """Updates attendance security settings. HQ pin is fixed; env OFFICE_PUBLIC_IPS is always merged in."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    # Hardcode office coordinates
    new_settings.office_latitude = OFFICE_LATITUDE
    new_settings.office_longitude = OFFICE_LONGITUDE

    # Ensure hardcoded office IPs are never removed
    merged_ips = []
    seen = set()
    for ip in list(get_built_in_office_ips()) + list(new_settings.office_public_ips or []) + list(new_settings.office_ip_whitelist or []):
        text = str(ip or "").strip()
        if text and text not in seen:
            seen.add(text)
            merged_ips.append(text)
    new_settings.office_public_ips = merged_ips
    new_settings.office_ip_whitelist = merged_ips

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


async def is_wfh_approved_for_date(user_id: str, date_str: str, department: Optional[str] = None) -> bool:
    """
    WFH for this date: approved request, weekday/date pattern with auto_wfh, or assigned a WFH shift.
    A real office punch still records as office (see process_check_in).
    """
    if await is_wfh_leave_approved_for_date(user_id, date_str):
        return True
    if await is_auto_wfh_for_date(user_id, date_str):
        return True
    try:
        shift = await get_shift_for_user(user_id, department, date_str)
        if shift:
            s_name = str(getattr(shift, "name", "") or "").lower()
            s_type = str(getattr(shift, "shift_type", "") or "").lower()
            if getattr(shift, "is_wfh", False) or "wfh" in s_name or s_type == "wfh":
                return True
    except Exception:
        pass
    return False


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


async def get_active_attendance_record(user_id: str) -> Optional[dict]:
    """
    Finds currently active/in-progress punch-in for user.
    An active record has check_in/punch_in set, check_out/punch_out NOT set,
    and is not marked as missed_punch or absent.
    Searches today and yesterday (to seamlessly handle evening/night shifts crossing midnight).
    """
    db = get_database()
    if db is None or not user_id:
        return None
    now_pkt = get_now_pkt()
    today_str = now_pkt.strftime("%Y-%m-%d")
    yesterday_str = (now_pkt.date() - timedelta(days=1)).strftime("%Y-%m-%d")

    # 1. Check today first
    rec_today = await db.attendance_records.find_one(
        {
            "user_id": user_id,
            "date": today_str,
            "$or": [{"check_in": {"$ne": None}}, {"punch_in": {"$ne": None}}],
            "check_out": None,
            "punch_out": None,
            "is_missed_punch": {"$ne": True},
            "status": {"$nin": [AttendanceStatus.MISSED_PUNCH.value, AttendanceStatus.ABSENT.value]},
        },
        {"_id": 0},
    )
    if rec_today and (rec_today.get("check_in") or rec_today.get("punch_in")):
        return rec_today

    # 2. Check yesterday (for evening / night shifts crossing midnight or recent open punches)
    rec_yesterday = await db.attendance_records.find_one(
        {
            "user_id": user_id,
            "date": yesterday_str,
            "$or": [{"check_in": {"$ne": None}}, {"punch_in": {"$ne": None}}],
            "check_out": None,
            "punch_out": None,
        },
        {"_id": 0},
    )
    if rec_yesterday and (rec_yesterday.get("check_in") or rec_yesterday.get("punch_in")):
        shift = None
        try:
            if rec_yesterday.get("shift_id"):
                shift = await get_shift_by_id(rec_yesterday.get("shift_id"))
            if not shift:
                shift = await get_shift_for_user(user_id, rec_yesterday.get("department"), yesterday_str)
        except Exception:
            shift = None

        if not is_checkout_window_closed(shift, now_pkt, shift_date=yesterday_str):
            # Shift / checkout window is still open! If it was prematurely marked as missed punch or absent, heal it.
            s_name = str(shift_field(shift, "name", "") or "").lower()
            is_shift_wfh = bool(shift_field(shift, "is_wfh") or "wfh" in s_name or str(shift_field(shift, "shift_type", "")).lower() == "wfh")
            is_wfh = bool(rec_yesterday.get("is_wfh") or str(rec_yesterday.get("status")) == "wfh" or is_shift_wfh)
            is_late = bool(rec_yesterday.get("is_late"))
            active_status = "wfh" if is_wfh else (AttendanceStatus.LATE.value if is_late else AttendanceStatus.PRESENT.value)

            if rec_yesterday.get("is_missed_punch") or str(rec_yesterday.get("status")) in (AttendanceStatus.MISSED_PUNCH.value, AttendanceStatus.ABSENT.value) or (is_wfh and rec_yesterday.get("status") == AttendanceStatus.PRESENT.value):
                rec_yesterday["status"] = active_status
                rec_yesterday["is_wfh"] = is_wfh
                rec_yesterday["is_missed_punch"] = False
                rec_yesterday["undertime_hours"] = 0.0
                rec_yesterday["undertime_minutes"] = 0
                rec_yesterday["undertime_formatted"] = "00:00"
                await db.attendance_records.update_one(
                    {"user_id": user_id, "date": yesterday_str},
                    {"$set": {
                        "status": active_status,
                        "is_wfh": is_wfh,
                        "is_missed_punch": False,
                        "undertime_hours": 0.0,
                        "undertime_minutes": 0,
                        "undertime_formatted": "00:00",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }}
                )
            return rec_yesterday
        elif not rec_yesterday.get("is_missed_punch") and str(rec_yesterday.get("status")) not in (AttendanceStatus.MISSED_PUNCH.value, AttendanceStatus.ABSENT.value):
            return rec_yesterday

    return None


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

    from app.services.device_registry import enforce_mobile_punch
    await enforce_mobile_punch(
        user_id=user_id,
        device_uuid=check_in_req.device_uuid,
        biometric_verified=check_in_req.biometric_verified,
        is_mocked=check_in_req.is_mocked,
    )

    # Prevent check-in if user already has an active, open punch session
    active_existing = await get_active_attendance_record(user_id)
    if active_existing:
        cin_prev = active_existing.get("check_in") or active_existing.get("punch_in")
        prev_date = active_existing.get("date")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You are currently checked in (since {prev_date} {cin_prev}). Please check out before checking in again.",
        )

    # Punch time is always server PKT. Client timestamps are ignored.
    date_str = get_current_date_str()
    time_str = get_current_time_str()

    from app.services.workdays import classify_date
    day_info = await classify_date(date_str)
    if day_info.is_off:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Check-in is not available. {day_info.label}.",
        )

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

    # 2. Punch allows remote check-in for approved WFH requests and WFH shift schedules.
    is_wfh = await is_wfh_approved_for_date(user_id, date_str)

    # 3. Shift window: nobody may punch in after their shift has ended
    shift = await get_shift_for_user(user_id, department, date_str)
    if is_shift_window_closed(shift, now=None, shift_date=date_str) and not custom_time:
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

    # 4. Security verification — office Wi-Fi OR in-range GPS (WFH bypasses)
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
        "device_uuid": check_in_req.device_uuid,
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
    client_ip: Optional[str] = None,
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
    time_str = custom_time or get_current_time_str()

    from app.services.device_registry import enforce_mobile_punch
    await enforce_mobile_punch(
        user_id=user_id,
        device_uuid=check_out_req.device_uuid,
        biometric_verified=check_out_req.biometric_verified,
        is_mocked=check_out_req.is_mocked,
    )

    if custom_date:
        date_str = custom_date
        existing = await db.attendance_records.find_one(
            {"user_id": user_id, "date": date_str},
            {"_id": 0}
        )
    else:
        existing = await get_active_attendance_record(user_id)
        if not existing:
            date_str = get_current_date_str()
            existing = await db.attendance_records.find_one(
                {"user_id": user_id, "date": date_str},
                {"_id": 0}
            )
        else:
            date_str = existing.get("date") or get_current_date_str()

    cin = existing.get("check_in") or existing.get("punch_in") if existing else None
    if not existing or not cin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot check out without an active check-in."
        )

    cout = existing.get("check_out") or existing.get("punch_out")
    if cout:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Already checked out at {cout}."
        )

    # Use assigned shift for the record's date (date override / weekday), not the template stamped at check-in.
    shift = await get_shift_for_user(user_id, department, date_str)

    is_wfh = existing.get("is_wfh", False)
    is_short_leave = existing.get("is_short_leave", False)
    short_leave_hours = existing.get("short_leave_hours", 0.0)
    closed_break_minutes = accumulate_break_minutes(existing, time_str)
    _ = closed_break_minutes

    settings = await get_security_settings()
    ip_to_check = resolve_effective_client_ip(
        client_ip,
        getattr(check_out_req, "detected_public_ip", None),
    )
    sec_result: PunchSecurityResult = validate_punch_security(
        client_ip=ip_to_check,
        user_lat=check_out_req.latitude,
        user_lon=check_out_req.longitude,
        is_wfh_approved=bool(is_wfh),
        settings=settings,
        accuracy_meters=check_out_req.accuracy_meters,
        gps_captured_at=check_out_req.gps_captured_at,
    )
    if not sec_result.authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=sec_result.error or "Check-out rejected: location or Wi-Fi security check failed.",
        )

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
        "shift_id": shift.id,
        "shift_name": shift.name,
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
        "check_out_ip": ip_to_check,
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
    time_str = get_current_time_str()
    action = (break_req.action or "").strip().lower()

    existing = await get_active_attendance_record(user_id)
    if not existing:
        date_str = get_current_date_str()
        existing = await db.attendance_records.find_one(
            {"user_id": user_id, "date": date_str},
            {"_id": 0},
        )
    else:
        date_str = existing.get("date") or get_current_date_str()

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

    active_rec = None
    if not date_str:
        active_rec = await get_active_attendance_record(user_id)

    if active_rec:
        target_date = active_rec.get("date") or now_pkt.strftime("%Y-%m-%d")
        record_doc = active_rec
    else:
        target_date = date_str or now_pkt.strftime("%Y-%m-%d")
        record_doc = None
        if db is not None:
            record_doc = await db.attendance_records.find_one(
                {"user_id": user_id, "date": target_date},
                {"_id": 0}
            )

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

    from app.services.workdays import classify_date, attendance_status_for_off_day

    day_info = await classify_date(target_date)

    cin = (record_doc.get("punch_in") or record_doc.get("check_in")) if record_doc else None
    cout = (record_doc.get("punch_out") or record_doc.get("check_out")) if record_doc else None

    shift_ended = is_shift_window_closed(shift, now_pkt, shift_date=target_date) if not active_rec else False
    if shift_ended and not is_wfh and not day_info.is_off and not cin:
        lock_date = closed_shift_attendance_date(shift, now_pkt)
        if lock_date == target_date:
            await persist_auto_absent(user, shift, target_date)
    elif not shift_ended and record_doc and str(record_doc.get("status") or "") == AttendanceStatus.ABSENT.value and not cin and not cout:
        # Heal/clean up premature auto-absent record saved prior to shift end
        if db is not None:
            await db.attendance_records.delete_one({"user_id": user_id, "date": target_date, "check_in": None, "punch_in": None})
            record_doc = None

    is_checked_in = bool(record_doc and cin and not cout)
    check_in_time = cin
    check_out_time = cout

    # Calculate active duration in seconds if currently punched in
    active_duration_seconds = 0
    if is_checked_in and check_in_time:
        try:
            rec_date_str = (record_doc or {}).get("date") or target_date
            in_dt = datetime.strptime(f"{rec_date_str} {check_in_time}", "%Y-%m-%d %H:%M").replace(tzinfo=PKT_TIMEZONE)
            active_duration_seconds = max(0, int((now_pkt - in_dt).total_seconds()))
        except Exception:
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
    elif day_info.is_off and not cin:
        try:
            status_val = AttendanceStatus(attendance_status_for_off_day(day_info.kind))
        except ValueError:
            status_val = AttendanceStatus.HOLIDAY
    elif shift_ended and not cin:
        status_val = AttendanceStatus.ABSENT
    else:
        status_val = AttendanceStatus.AWAITING_CHECKIN

    locked_no_punch = bool(shift_ended and not cin) or (
        record_status in LEAVE_LOCK_STATUSES and not cin
    )
    can_check_in = (not bool(cin)) and (not locked_no_punch) and (not day_info.is_off)
    can_check_out = is_checked_in
    has_active_break = bool(record_doc and record_doc.get("is_on_break"))

    show_absent_record = record_status == AttendanceStatus.ABSENT.value and shift_ended
    if record_doc and cin:
        record_doc = await _heal_overtime_request_for_record(user, record_doc, shift)
        cin = record_doc.get("check_in") or record_doc.get("punch_in")
        cout = record_doc.get("check_out") or record_doc.get("punch_out")
        check_out_time = cout
        is_checked_in = bool(cin and not cout)
        can_check_out = is_checked_in
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

    u_role = str(user.get("role") or "").lower()
    is_mgmt = u_role in ("admin", "hr", "operations")
    return TodayAttendanceResponse(
        record=record_res,
        shift=shift,
        is_wfh_approved=is_wfh,
        punch_status=punch_status,
        has_active_break=has_active_break,
        can_punch_in=can_check_in,
        can_punch_out=can_check_out,
        office_latitude=sec_settings.office_latitude if is_mgmt else None,
        office_longitude=sec_settings.office_longitude if is_mgmt else None,
        geofence_radius_meters=sec_settings.geofence_radius_meters if is_mgmt else None,
        client_ip=effective_ip,
        is_ip_verified=is_ip_verified,
        enforce_ip_whitelist=bool(sec_settings.enforce_ip_whitelist),
        enforce_gps_geofence=bool(sec_settings.enforce_gps_geofence),
        shift_ended=bool(shift_ended and not cin),
        checkout_gate=gate_payload,
        is_off_day=day_info.is_off,
        off_day_kind=day_info.kind if day_info.is_off else None,
        off_day_label=day_info.label if day_info.is_off else None,
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
        # Load calendar overrides for this month
        from app.services.workdays import load_calendar_overrides
        month_start_date = date(year, month, 1)
        month_last_day = calendar.monthrange(year, month)[1]
        month_end_date = date(year, month, month_last_day)
        holidays_set, _working_sats, holiday_titles = await load_calendar_overrides(month_start_date, month_end_date)

        seen_record_dates = set()
        for d in docs:
            rec_date = str(d.get("date") or "")
            seen_record_dates.add(rec_date)
            cin = d.get("punch_in") or d.get("check_in")
            cout = d.get("punch_out") or d.get("check_out")

            if rec_date in holidays_set and not cin and not cout:
                # Calendar holiday with no punches -> ensure status is HOLIDAY
                h_title = holiday_titles.get(rec_date) or "Public Holiday"
                d["status"] = AttendanceStatus.HOLIDAY.value
                d["shift_name"] = h_title
                d["notes"] = h_title
                d["is_late"] = False
                d["late_minutes"] = 0
            else:
                rec_shift = resolve_shift_doc_for_date(
                    assignment,
                    rec_date,
                    shifts_by_id,
                    stored_shift_id=d.get("shift_id"),
                    fallback=shift,
                )
                now_pkt = get_now_pkt()
                today_str = now_pkt.strftime("%Y-%m-%d")

                # If an absent record was prematurely saved before the shift ended, clean it up
                if not cin and not cout and str(d.get("status")) == AttendanceStatus.ABSENT.value:
                    if not is_shift_window_closed(rec_shift, now_pkt, shift_date=rec_date):
                        if db is not None:
                            await db.attendance_records.delete_one({"user_id": user_id, "date": rec_date, "check_in": None, "punch_in": None})
                        continue

                d["shift_id"] = _shift_id(rec_shift) or d.get("shift_id")
                d["shift_name"] = _shift_label(rec_shift, d.get("shift_name") or "Standard Shift")
                d = await _heal_overtime_request_for_record(user, d, rec_shift)

                # Read-time healing for unclosed punches with 4-hour waiting window
                checkout_closed = is_checkout_window_closed(rec_shift, now_pkt, shift_date=rec_date)

                if cin and not cout:
                    if not checkout_closed:
                        # Inside active shift / 4-hour post-shift waiting window: restore / keep as active
                        s_name = str(shift_field(rec_shift, "name", "") or "").lower()
                        is_shift_wfh = bool(shift_field(rec_shift, "is_wfh") or "wfh" in s_name or str(shift_field(rec_shift, "shift_type", "")).lower() == "wfh")
                        is_late = bool(d.get("is_late"))
                        is_wfh = bool(d.get("is_wfh") or str(d.get("status")) == "wfh" or is_shift_wfh)
                        active_status = "wfh" if is_wfh else (AttendanceStatus.LATE.value if is_late else AttendanceStatus.PRESENT.value)

                        if d.get("is_missed_punch") or str(d.get("status")) == AttendanceStatus.MISSED_PUNCH.value or (is_wfh and d.get("status") == AttendanceStatus.PRESENT.value):
                            d["status"] = active_status
                            d["is_wfh"] = is_wfh
                            d["is_missed_punch"] = False
                            d["undertime_hours"] = 0.0
                            d["undertime_minutes"] = 0
                            d["undertime_formatted"] = "00:00"
                            if db is not None:
                                await db.attendance_records.update_one(
                                    {"user_id": user_id, "date": rec_date},
                                    {"$set": {
                                        "status": active_status,
                                        "is_wfh": is_wfh,
                                        "is_missed_punch": False,
                                        "undertime_hours": 0.0,
                                        "undertime_minutes": 0,
                                        "undertime_formatted": "00:00",
                                        "updated_at": datetime.now(timezone.utc).isoformat(),
                                    }}
                                )
                    else:
                        # 4-hour checkout waiting window elapsed -> Flag as Missed Punch
                        if not d.get("is_missed_punch") and str(d.get("status")) != AttendanceStatus.MISSED_PUNCH.value:
                            exp_h = float(shift_field(rec_shift, "expected_hours", 8.0) or 8.0)
                            exp_m = int(round(exp_h * 60))
                            existing_notes = d.get("notes") or ""
                            updated_notes = f"{existing_notes} | Flagged as Missed Punch after 4h waiting window closed".strip(" | ")
                            d["status"] = AttendanceStatus.MISSED_PUNCH.value
                            d["is_missed_punch"] = True
                            d["work_hours"] = 0.0
                            d["working_hours_minutes"] = 0
                            d["work_duration_formatted"] = "00:00"
                            d["overtime_hours"] = 0.0
                            d["overtime_minutes"] = 0
                            d["overtime_formatted"] = "+00:00"
                            d["undertime_hours"] = exp_h
                            d["undertime_minutes"] = exp_m
                            d["undertime_formatted"] = format_minutes_to_hhmm(-exp_m, show_sign=True)
                            d["notes"] = updated_notes
                            if db is not None:
                                await db.attendance_records.update_one(
                                    {"user_id": user_id, "date": rec_date},
                                    {"$set": {
                                        "status": AttendanceStatus.MISSED_PUNCH.value,
                                        "is_missed_punch": True,
                                        "work_hours": 0.0,
                                        "working_hours_minutes": 0,
                                        "work_duration_formatted": "00:00",
                                        "overtime_hours": 0.0,
                                        "overtime_minutes": 0,
                                        "overtime_formatted": "+00:00",
                                        "undertime_hours": exp_h,
                                        "undertime_minutes": exp_m,
                                        "undertime_formatted": format_minutes_to_hhmm(-exp_m, show_sign=True),
                                        "notes": updated_notes,
                                        "updated_at": datetime.now(timezone.utc).isoformat(),
                                    }}
                                )
                elif cin and cout:
                    apply_daily_calc_fields(d, rec_shift)

            records.append(AttendanceRecordResponse.from_mongo(d))

        # Inject synthesized holiday records for holiday dates without punch docs
        for h_date in sorted(holidays_set):
            if h_date not in seen_record_dates and h_date >= min_date:
                h_title = holiday_titles.get(h_date) or "Public Holiday"
                records.append(AttendanceRecordResponse(
                    id=f"cal_hol_{user_id}_{h_date}",
                    user_id=user_id,
                    employee_name=user_name,
                    user_name=user_name,
                    department=department,
                    date=h_date,
                    shift_id=None,
                    shift_name=h_title,
                    punch_in=None,
                    punch_out=None,
                    check_in=None,
                    check_out=None,
                    break_minutes=0,
                    working_hours_minutes=0,
                    work_hours=0.0,
                    overtime_minutes=0,
                    overtime_hours=0.0,
                    undertime_minutes=0,
                    undertime_hours=0.0,
                    status=AttendanceStatus.HOLIDAY,
                    is_late=False,
                    late_minutes=0,
                    ip_verified=False,
                    gps_verified=False,
                    is_wfh_approved=False,
                    notes=h_title,
                    created_at=f"{h_date}T00:00:00Z",
                    updated_at=f"{h_date}T00:00:00Z",
                ))

        records.sort(key=lambda r: r.date)

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
        user_query["department"] = exact_ci(department)

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
    is_holiday = bool(
        calendar_event and (
            calendar_event.get("is_off_day") is True
            or str(calendar_event.get("event_type") or "").lower() in ("holiday", "calendar_event_type.holiday")
        )
    )
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

        is_shift_wfh = bool(
            raw_shift and (
                raw_shift.get("is_wfh")
                or str(raw_shift.get("shift_type", "")).lower() == "wfh"
                or "wfh" in str(raw_shift.get("name", "")).lower()
            )
        )
        is_leave_wfh = bool(approved_leave and str(approved_leave.get("leave_type", "")).lower() in ("wfh", LeaveType.WFH.value))

        if rec:
            if record_punch_times(rec)[0]:
                rec = await _heal_overtime_request_for_record(u, rec, raw_shift)
            check_in, check_out = record_punch_times(rec)
            is_wfh_flag = bool(rec.get("is_wfh", False) or auto_wfh or is_shift_wfh or is_leave_wfh)
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

                now_pkt = get_now_pkt()
                today_str = now_pkt.strftime("%Y-%m-%d")
                checkout_passed = is_checkout_window_closed(raw_shift, now_pkt, shift_date=target_date)
                if not check_out and checkout_passed and not rec.get("is_missed_punch") and raw_status != AttendanceStatus.MISSED_PUNCH.value:
                    status_enum = AttendanceStatus.MISSED_PUNCH
                elif not check_out and not checkout_passed and (rec.get("is_missed_punch") or raw_status == AttendanceStatus.MISSED_PUNCH.value or (is_wfh_flag and raw_status == AttendanceStatus.PRESENT.value)):
                    status_enum = AttendanceStatus.WFH if is_wfh_flag else (AttendanceStatus.LATE if calc_res.is_late else AttendanceStatus.PRESENT)
                    if db is not None and u_id:
                        await db.attendance_records.update_one(
                            {"user_id": u_id, "date": target_date},
                            {"$set": {
                                "status": status_enum.value,
                                "is_wfh": is_wfh_flag,
                                "is_missed_punch": False,
                                "undertime_hours": 0.0,
                                "undertime_minutes": 0,
                                "undertime_formatted": "00:00",
                                "updated_at": datetime.now(timezone.utc).isoformat(),
                            }}
                        )
                elif raw_status in keep_status:
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

                if is_holiday:
                    status_enum = AttendanceStatus.HOLIDAY
                    # Auto-heal database record if it was previously marked absent/wfh or has undertime penalty
                    if db is not None and u_id and (raw_status != AttendanceStatus.HOLIDAY.value or float(rec.get("undertime_hours") or 0.0) > 0 or bool(rec.get("is_absent"))):
                        h_title = calendar_event.get("title") if calendar_event else "Public Holiday"
                        asyncio.create_task(db.attendance_records.update_one(
                            {"user_id": u_id, "date": target_date},
                            {"$set": {
                                "status": AttendanceStatus.HOLIDAY.value,
                                "shift_name": h_title,
                                "notes": f"{h_title} (Public Holiday)",
                                "is_absent": False,
                                "is_wfh": False,
                                "is_late": False,
                                "late_minutes": 0,
                                "work_hours": 0.0,
                                "working_hours_minutes": 0,
                                "work_duration_formatted": "00:00",
                                "overtime_hours": 0.0,
                                "overtime_minutes": 0,
                                "overtime_formatted": "+00:00",
                                "undertime_hours": 0.0,
                                "undertime_minutes": 0,
                                "undertime_formatted": "+00:00",
                                "updated_at": datetime.now(timezone.utc).isoformat(),
                            }}
                        ))
                elif is_sunday and not rec.get("punch_in") and not rec.get("check_in"):
                    status_enum = AttendanceStatus.SUNDAY_OFF
                elif is_first_sat and not rec.get("punch_in") and not rec.get("check_in"):
                    status_enum = AttendanceStatus.FIRST_SATURDAY_OFF
                elif raw_status in keep_status:
                    status_enum = AttendanceStatus(raw_status)
                else:
                    status_enum = unpunched_day_status(raw_shift, target_date)

            if status_enum == AttendanceStatus.HOLIDAY:
                status_badge = "Holiday"
            elif status_enum == AttendanceStatus.SUNDAY_OFF:
                status_badge = "Sunday Off"
            elif status_enum == AttendanceStatus.FIRST_SATURDAY_OFF:
                status_badge = "1st Sat Off"
            elif status_enum == AttendanceStatus.ABSENT:
                status_badge = "Absent"
                absent_count += 1
            elif status_enum == AttendanceStatus.AWAITING_CHECKIN:
                status_badge = "Awaiting"
            elif is_wfh_flag or status_enum == AttendanceStatus.WFH:
                status_badge = "W.F.H"
                wfh_count += 1
            elif status_enum == AttendanceStatus.MISSED_PUNCH:
                status_badge = "Missed Punch"
                present_count += 1
            elif status_enum == AttendanceStatus.SHORT_LEAVE:
                status_badge = "Short Leave"
                present_count += 1
            elif status_enum == AttendanceStatus.LATE or (status_enum == AttendanceStatus.PRESENT and is_late_flag):
                status_badge = "Late"
                late_count += 1
                present_count += 1
            elif status_enum in (AttendanceStatus.SICK_LEAVE, AttendanceStatus.CASUAL_LEAVE, AttendanceStatus.ANNUAL_LEAVE, AttendanceStatus.UNPAID_LEAVE, AttendanceStatus.ON_LEAVE):
                status_badge = "Leave"
                leave_count += 1
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
        user_query["department"] = exact_ci(department)

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


def _format_request_type_label(req_dict: dict) -> str:
    lt = str(req_dict.get("leave_type") or req_dict.get("request_type") or "leave").lower()
    if lt == "wfh":
        return "WFH"
    elif lt == "short_leave":
        return "Short Leave"
    elif lt in ("missed_punch_regularization", "regularization"):
        return "Punch Correction"
    elif lt == "overtime":
        return "Overtime"
    elif lt == "sick":
        return "Sick Leave"
    elif lt == "casual":
        return "Casual Leave"
    elif lt == "annual":
        return "Annual Leave"
    elif lt == "unpaid":
        return "Unpaid Leave"
    return lt.replace("_", " ").title()


def _format_request_date_label(req_dict: dict) -> str:
    start = req_dict.get("start_date") or req_dict.get("regularization_date") or ""
    end = req_dict.get("end_date") or start
    if start and end and start != end:
        return f"{start} to {end}"
    return start or "scheduled date"


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

    from app.services.workdays import load_off_day_index, parse_iso_date
    start_d_obj = parse_iso_date(req.start_date)
    end_d_obj = parse_iso_date(req.end_date or req.start_date)
    if start_d_obj and end_d_obj:
        off_index = await load_off_day_index(start_d_obj, end_d_obj)

        lt = req.leave_type.value if isinstance(req.leave_type, LeaveType) else str(req.leave_type)
        if lt in (LeaveType.MISSED_PUNCH_REGULARIZATION.value, "missed_punch_regularization"):
            reg_date_str = req.regularization_date or req.start_date
            reg_cls = off_index.classify_iso(reg_date_str)
            if reg_cls.is_off:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot submit punch correction for a non-working day ({reg_cls.label}).",
                )

        elif lt in (LeaveType.SHORT_LEAVE.value, "short_leave"):
            sl_cls = off_index.classify_iso(req.start_date)
            if sl_cls.is_off:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot request short leave on a non-working day ({sl_cls.label}).",
                )

        elif lt in (LeaveType.WFH.value, "wfh"):
            workdays_in_range = sum(
                1 for d in iter_date_range(req.start_date, req.end_date or req.start_date)
                if off_index.is_workday_iso(d)
            )
            if workdays_in_range == 0:
                single_cls = off_index.classify_iso(req.start_date)
                msg = (
                    f"Cannot request WFH on a non-working day ({single_cls.label})."
                    if req.start_date == (req.end_date or req.start_date)
                    else "Selected WFH date range contains no working days."
                )
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

        elif lt not in (LeaveType.OVERTIME.value, "overtime"):
            workdays_in_range = sum(
                1 for d in iter_date_range(req.start_date, req.end_date or req.start_date)
                if off_index.is_workday_iso(d)
            )
            if workdays_in_range == 0:
                single_cls = off_index.classify_iso(req.start_date)
                msg = (
                    f"Cannot request leave on a non-working day ({single_cls.label})."
                    if req.start_date == (req.end_date or req.start_date)
                    else "Selected leave date range contains no working days."
                )
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

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

    # Dispatch mobile push notification to HR & Operations (excluding admin)
    try:
        hr_ops_ids = await push_service.get_hr_and_ops_user_ids()
        notify_ids = [uid for uid in hr_ops_ids if uid != user_id]
        if notify_ids:
            type_lbl = _format_request_type_label(req_dict)
            date_lbl = _format_request_date_label(req_dict)
            await push_service.dispatch_to_users(
                user_ids=notify_ids,
                title=f"New {type_lbl} Request 📥",
                body=f"{user_name} submitted a {type_lbl.lower()} request for {date_lbl}.",
                kind="leave_submitted",
                sender_id=user_id,
                sender_name=user_name,
                sender_role=req_dict.get("user_role"),
            )
    except Exception as exc:
        logger.warning("Failed to dispatch push notification for submitted request %s: %s", req_dict.get("id"), exc)

    return LeaveResponse(**created_doc)


async def get_user_leave_requests(user_id: str, viewer_user: Optional[dict] = None) -> List[LeaveResponse]:
    """Retrieves all leave requests submitted by a specific user."""
    db = get_database()
    if db is None:
        return []
    query: Dict[str, Any] = {"user_id": user_id}
    viewer_id = str(viewer_user.get("id") or viewer_user.get("_id") or "") if viewer_user else user_id
    if viewer_id:
        query["hidden_from_user_ids"] = {"$ne": viewer_id}
    docs = await db.leave_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    docs = await _heal_overtime_requests(docs, active_only_pending=False)
    await _attach_original_punches(docs)
    await _attach_applicant_roles(docs)
    return [LeaveResponse(**d) for d in docs]


async def get_all_leave_requests(
    status_filter: Optional[str] = None,
    department: Optional[str] = None,
    user_id: Optional[str] = None,
    viewer_user: Optional[dict] = None,
) -> List[LeaveResponse]:
    """
    Retrieves leave requests across all statuses (pending, approved, rejected).
    Supports filtering by status, department, user_id, and viewer scope.
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
        query["department"] = exact_ci(department)

    # Scoped visibility / view clearing
    if viewer_user:
        viewer_id = str(viewer_user.get("id") or viewer_user.get("_id") or "")
        viewer_role = str(viewer_user.get("role") or "team_member").lower()

        if viewer_role == "admin":
            # Admin sees all requests unless Admin explicitly deleted it
            query["hidden_from_admin"] = {"$ne": True}
        elif viewer_role in ("hr", "operations"):
            # When viewing organization-wide inbox (no specific user_id query)
            if not user_id:
                query["hidden_from_hr"] = {"$ne": True}
            elif user_id == viewer_id:
                # HR viewing their own personal requests tab
                query["hidden_from_user_ids"] = {"$ne": viewer_id}
            else:
                query["hidden_from_hr"] = {"$ne": True}
        else:
            # Regular employee viewing their personal requests
            if viewer_id:
                query["hidden_from_user_ids"] = {"$ne": viewer_id}

    docs = await db.leave_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(300)
    docs = await _heal_overtime_requests(docs, active_only_pending=(status_filter == "pending"))
    await _attach_original_punches(docs)
    await _attach_applicant_roles(docs)
    return [LeaveResponse(**d) for d in docs]


async def get_pending_leave_requests(
    department: Optional[str] = None,
    viewer_user: Optional[dict] = None,
) -> List[LeaveResponse]:
    """Retrieves all pending and appealed leave requests for HR / Lead / Admin approval inbox."""
    db = get_database()
    if db is None:
        return []

    query: Dict[str, Any] = {"status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.APPEALED.value]}}
    if department and department.lower() != "all":
        query["department"] = exact_ci(department)

    if viewer_user:
        viewer_role = str(viewer_user.get("role") or "team_member").lower()
        if viewer_role == "admin":
            query["hidden_from_admin"] = {"$ne": True}
        elif viewer_role in ("hr", "operations"):
            query["hidden_from_hr"] = {"$ne": True}

    docs = await db.leave_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    docs = await _heal_overtime_requests(docs, active_only_pending=True)
    await _attach_original_punches(docs)
    await _attach_applicant_roles(docs)
    return [LeaveResponse(**d) for d in docs]


async def _sync_attendance_record_for_request(
    req: dict,
    new_status_str: str,
    reviewer_name: str,
    review_comments: Optional[str],
    now_iso: str,
):
    db = get_database()
    if db is None:
        return

    from app.services.workdays import load_off_day_index, parse_iso_date

    leave_type_val = str(req.get("leave_type") or req.get("request_type") or "").strip().lower()
    request_type_val = str(req.get("request_type") or "").strip().lower()
    target_user_id = req.get("user_id")
    user_dept = req.get("department")
    review_date = (
        req.get("regularization_date")
        or req.get("start_date")
        or get_current_date_str()
    )
    shift = await get_shift_for_user(target_user_id, user_dept, review_date)

    if new_status_str == LeaveStatus.APPROVED.value:
        # 1. Missed Punch Regularization Dynamic Recalculation
        if leave_type_val in (LeaveType.MISSED_PUNCH_REGULARIZATION.value, "missed_punch_regularization") or request_type_val in ("regularization", "missed_punch_regularization"):
            reg_date = req.get("regularization_date") or req.get("start_date")
            existing_rec = await db.attendance_records.find_one({"user_id": target_user_id, "date": reg_date})
            correction_target = (req.get("correction_target") or "time_in").strip().lower()

            if correction_target == "time_in":
                reg_in = req.get("regularization_check_in") or req.get("regularization_punch_in") or shift.start_time
                reg_out = ((existing_rec.get("check_out") or existing_rec.get("punch_out")) if existing_rec else None)
            elif correction_target == "time_out":
                reg_in = (existing_rec.get("check_in") or existing_rec.get("punch_in")) if existing_rec else shift.start_time
                reg_out = req.get("regularization_check_out") or req.get("regularization_punch_out") or shift.end_time
            else:  # both
                reg_in = req.get("regularization_check_in") or req.get("regularization_punch_in") or shift.start_time
                reg_out = req.get("regularization_check_out") or req.get("regularization_punch_out") or (existing_rec.get("check_out") if existing_rec else None)

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
                "user_name": req.get("user_name"),
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
                "notes": f"Regularized punch ({correction_target.replace('_', ' ').title()}) approved by {reviewer_name}: {review_comments or ''}".strip(),
                "updated_at": now_iso,
            }
            await db.attendance_records.update_one(
                {"user_id": target_user_id, "date": reg_date},
                {"$set": att_doc, "$setOnInsert": {"created_at": now_iso}},
                upsert=True,
            )
            if target_user_id and reg_date and reg_out:
                try:
                    from app.services.log_compliance import recompute_day_score
                    await recompute_day_score(target_user_id, reg_date)
                except Exception:
                    logger.exception("Failed to recompute daily log score after punch regularization")

        # 2. WFH Dynamic Synchronization
        elif leave_type_val in (LeaveType.WFH.value, "wfh") or request_type_val == "wfh":
            start_d = req.get("start_date")
            end_d = req.get("end_date") or start_d
            start_date_obj = parse_iso_date(start_d)
            end_date_obj = parse_iso_date(end_d)
            off_index = await load_off_day_index(start_date_obj, end_date_obj) if (start_date_obj and end_date_obj) else None

            for day_str in iter_date_range(start_d, end_d):
                if off_index and off_index.is_off_iso(day_str):
                    continue
                await db.attendance_records.update_one(
                    {"user_id": target_user_id, "date": day_str},
                    {
                        "$set": {
                            "id": f"att_{target_user_id}_{day_str}",
                            "user_id": target_user_id,
                            "user_name": req.get("user_name"),
                            "department": user_dept,
                            "date": day_str,
                            "shift_id": shift.id,
                            "shift_name": shift.name,
                            "is_wfh": True,
                            "status": AttendanceStatus.WFH.value,
                            "updated_at": now_iso,
                        },
                        "$setOnInsert": {"created_at": now_iso},
                    },
                    upsert=True,
                )

        # 3. Short Leave Dynamic Recalculation
        elif leave_type_val in (LeaveType.SHORT_LEAVE.value, "short_leave") or request_type_val == "short_leave":
            target_date = req.get("start_date")
            sl_hours = float(req.get("short_leave_hours") or 2.0)
            rec = await db.attendance_records.find_one({"user_id": target_user_id, "date": target_date}, {"_id": 0})
            if rec and (rec.get("check_in") or rec.get("punch_in")):
                cin = rec.get("check_in") or rec.get("punch_in")
                cout = rec.get("check_out") or rec.get("punch_out")
                calc_res = calculate_daily_attendance(
                    check_in_time=cin,
                    check_out_time=cout,
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
                    },
                )

        # 4. Full-day leave types
        elif leave_type_val in (
            LeaveType.SICK.value,
            LeaveType.CASUAL.value,
            LeaveType.ANNUAL.value,
            LeaveType.UNPAID.value,
            "sick",
            "casual",
            "annual",
            "unpaid",
            "leave",
        ) or request_type_val == "leave":
            status_map = {
                "sick": AttendanceStatus.SICK_LEAVE.value,
                "casual": AttendanceStatus.CASUAL_LEAVE.value,
                "annual": AttendanceStatus.ANNUAL_LEAVE.value,
                "unpaid": AttendanceStatus.UNPAID_LEAVE.value,
            }
            att_status = status_map.get(str(leave_type_val), AttendanceStatus.ON_LEAVE.value)
            start_iso = req.get("start_date")
            end_iso = req.get("end_date") or start_iso
            start_d = parse_iso_date(start_iso)
            end_d = parse_iso_date(end_iso)
            off_index = await load_off_day_index(start_d, end_d) if (start_d and end_d) else None

            for day_str in iter_date_range(start_iso, end_iso):
                if off_index and off_index.is_off_iso(day_str):
                    continue
                await db.attendance_records.update_one(
                    {"user_id": target_user_id, "date": day_str},
                    {
                        "$set": {
                            "id": f"att_{target_user_id}_{day_str}",
                            "user_id": target_user_id,
                            "user_name": req.get("user_name"),
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
        elif leave_type_val in (LeaveType.OVERTIME.value, "overtime") or request_type_val == "overtime":
            target_date = req.get("overtime_date") or req.get("start_date")
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
                if target_user_id and target_date:
                    try:
                        from app.services.log_compliance import recompute_day_score
                        await recompute_day_score(target_user_id, target_date)
                    except Exception:
                        pass

    elif new_status_str in (LeaveStatus.REJECTED.value, LeaveStatus.CANCELLED.value):
        # 1. Missed Punch Regularization Reversal
        if leave_type_val in (LeaveType.MISSED_PUNCH_REGULARIZATION.value, "missed_punch_regularization") or request_type_val in ("regularization", "missed_punch_regularization"):
            reg_date = req.get("regularization_date") or req.get("start_date")
            existing_rec = await db.attendance_records.find_one({"user_id": target_user_id, "date": reg_date})
            correction_target = (req.get("correction_target") or "both").strip().lower()

            orig_in = req.get("original_punch_in") or req.get("original_check_in")
            orig_out = req.get("original_punch_out") or req.get("original_check_out")

            if correction_target == "time_in":
                restored_in = orig_in
                restored_out = (existing_rec.get("check_out") or existing_rec.get("punch_out")) if existing_rec else orig_out
            elif correction_target == "time_out":
                restored_in = (existing_rec.get("check_in") or existing_rec.get("punch_in")) if existing_rec else orig_in
                restored_out = orig_out
            else:  # both
                restored_in = orig_in
                restored_out = orig_out

            if restored_in and restored_out:
                _claimed, settled, _gate, _ot, _ut, _s, _e = compute_settled_checkout(
                    restored_in,
                    restored_out,
                    shift,
                    extra={
                        "is_wfh": bool(existing_rec.get("is_wfh") if existing_rec else False),
                        "is_short_leave": bool(existing_rec.get("is_short_leave") if existing_rec else False),
                        "short_leave_hours": float(existing_rec.get("short_leave_hours") or 0.0) if existing_rec else 0.0,
                    },
                    overtime_status=existing_rec.get("overtime_status", "not_applicable") if existing_rec else "not_applicable",
                )
                hour_fields = settled_to_record_fields(settled)
                calc_res = calculate_daily_attendance(
                    check_in_time=restored_in,
                    check_out_time=restored_out,
                    **shift_calc_kwargs(shift),
                )
                is_missed = False
                att_status = calc_res.status.value
            elif restored_in:
                calc_res = calculate_daily_attendance(
                    check_in_time=restored_in,
                    check_out_time=None,
                    **shift_calc_kwargs(shift),
                )
                hour_fields = {
                    "working_hours_minutes": calc_res.work_minutes,
                    "work_hours": calc_res.work_hours,
                    "work_duration_formatted": calc_res.work_duration_formatted,
                    "overtime_minutes": 0,
                    "overtime_hours": 0.0,
                    "overtime_formatted": "0h 00m",
                    "undertime_minutes": calc_res.undertime_minutes,
                    "undertime_hours": calc_res.undertime_hours,
                    "undertime_formatted": calc_res.undertime_formatted,
                    "pending_overtime_minutes": 0,
                    "claimed_overtime_minutes": 0,
                    "overtime_status": "not_applicable",
                }
                is_missed = True
                att_status = AttendanceStatus.MISSED_PUNCH.value
            else:
                calc_res = calculate_daily_attendance(
                    check_in_time=None,
                    check_out_time=None,
                    **shift_calc_kwargs(shift),
                )
                hour_fields = {
                    "working_hours_minutes": 0,
                    "work_hours": 0.0,
                    "work_duration_formatted": "0h 00m",
                    "overtime_minutes": 0,
                    "overtime_hours": 0.0,
                    "overtime_formatted": "0h 00m",
                    "undertime_minutes": calc_res.undertime_minutes,
                    "undertime_hours": calc_res.undertime_hours,
                    "undertime_formatted": calc_res.undertime_formatted,
                    "pending_overtime_minutes": 0,
                    "claimed_overtime_minutes": 0,
                    "overtime_status": "not_applicable",
                }
                is_missed = True
                att_status = AttendanceStatus.ABSENT.value

            att_doc = {
                "check_in": restored_in,
                "check_out": restored_out,
                "punch_in": restored_in,
                "punch_out": restored_out,
                "break_minutes": shift.break_duration_minutes if (restored_in and restored_out) else 0,
                **hour_fields,
                "late_minutes": calc_res.late_minutes,
                "is_late": calc_res.is_late,
                "late_strike": calc_res.late_strike,
                "status": att_status,
                "is_missed_punch": is_missed,
                "notes": f"Correction request was {new_status_str} by {reviewer_name}: {review_comments or ''}".strip(),
                "updated_at": now_iso,
            }
            await db.attendance_records.update_one(
                {"user_id": target_user_id, "date": reg_date},
                {"$set": att_doc},
            )
            if target_user_id and reg_date and restored_out:
                try:
                    from app.services.log_compliance import recompute_day_score
                    await recompute_day_score(target_user_id, reg_date)
                except Exception:
                    pass

        # 2. WFH Reversal
        elif leave_type_val in (LeaveType.WFH.value, "wfh") or request_type_val == "wfh":
            start_d = req.get("start_date")
            end_d = req.get("end_date") or start_d
            for day_str in iter_date_range(start_d, end_d):
                day_shift = await get_shift_for_user(target_user_id, user_dept, day_str)
                rec = await db.attendance_records.find_one({"user_id": target_user_id, "date": day_str})
                if rec and (rec.get("check_in") or rec.get("punch_in")):
                    cin = rec.get("check_in") or rec.get("punch_in")
                    cout = rec.get("check_out") or rec.get("punch_out")
                    calc_res = calculate_daily_attendance(
                        check_in_time=cin,
                        check_out_time=cout,
                        **shift_calc_kwargs(day_shift),
                    )
                    await db.attendance_records.update_one(
                        {"user_id": target_user_id, "date": day_str},
                        {"$set": {"is_wfh": False, "status": calc_res.status.value, "updated_at": now_iso}},
                    )
                else:
                    await db.attendance_records.update_one(
                        {"user_id": target_user_id, "date": day_str},
                        {"$set": {"is_wfh": False, "status": AttendanceStatus.ABSENT.value, "updated_at": now_iso}},
                    )

        # 3. Short Leave Reversal
        elif leave_type_val in (LeaveType.SHORT_LEAVE.value, "short_leave") or request_type_val == "short_leave":
            target_date = req.get("start_date")
            rec = await db.attendance_records.find_one({"user_id": target_user_id, "date": target_date}, {"_id": 0})
            if rec and (rec.get("check_in") or rec.get("punch_in")):
                cin = rec.get("check_in") or rec.get("punch_in")
                cout = rec.get("check_out") or rec.get("punch_out")
                calc_res = calculate_daily_attendance(
                    check_in_time=cin,
                    check_out_time=cout,
                    **shift_calc_kwargs(shift, {
                        "is_short_leave": False,
                        "short_leave_hours": 0.0,
                    }),
                )
                await db.attendance_records.update_one(
                    {"user_id": target_user_id, "date": target_date},
                    {
                        "$set": {
                            "is_short_leave": False,
                            "short_leave_hours": 0.0,
                            "work_hours": calc_res.work_hours,
                            "work_duration_formatted": calc_res.work_duration_formatted,
                            "overtime_hours": calc_res.overtime_hours,
                            "overtime_formatted": calc_res.overtime_formatted,
                            "undertime_hours": calc_res.undertime_hours,
                            "undertime_formatted": calc_res.undertime_formatted,
                            "status": calc_res.status.value,
                            "updated_at": now_iso,
                        }
                    },
                )

        # 4. Full-day Leave Reversal
        elif leave_type_val in (
            LeaveType.SICK.value,
            LeaveType.CASUAL.value,
            LeaveType.ANNUAL.value,
            LeaveType.UNPAID.value,
            "sick",
            "casual",
            "annual",
            "unpaid",
            "leave",
        ) or request_type_val == "leave":
            for day_str in iter_date_range(req.get("start_date"), req.get("end_date")):
                day_shift = await get_shift_for_user(target_user_id, user_dept, day_str)
                rec = await db.attendance_records.find_one({"user_id": target_user_id, "date": day_str})
                if rec and (rec.get("check_in") or rec.get("punch_in")):
                    cin = rec.get("check_in") or rec.get("punch_in")
                    cout = rec.get("check_out") or rec.get("punch_out")
                    calc_res = calculate_daily_attendance(
                        check_in_time=cin,
                        check_out_time=cout,
                        **shift_calc_kwargs(day_shift),
                    )
                    await db.attendance_records.update_one(
                        {"user_id": target_user_id, "date": day_str},
                        {"$set": {"status": calc_res.status.value, "updated_at": now_iso}},
                    )
                else:
                    await db.attendance_records.update_one(
                        {"user_id": target_user_id, "date": day_str},
                        {"$set": {"status": AttendanceStatus.ABSENT.value, "updated_at": now_iso}},
                    )

        # 5. Overtime reversal
        elif leave_type_val in (LeaveType.OVERTIME.value, "overtime") or request_type_val == "overtime":
            target_date = req.get("overtime_date") or req.get("start_date")
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
                if target_user_id and target_date:
                    try:
                        from app.services.log_compliance import recompute_day_score
                        await recompute_day_score(target_user_id, target_date)
                    except Exception:
                        pass


async def review_leave_request(
    request_id: str,
    reviewer_user: dict,
    review_data: LeaveReviewRequest,
) -> LeaveResponse:
    """
    Approve, reject, or request clarification on an attendance/leave request with audit trail
    and dynamic timesheet recalculation.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    existing = await db.leave_requests.find_one({"id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Leave request '{request_id}' not found")

    from app.services.leave_permissions import assert_can_review_leave

    applicant_role = await _resolve_applicant_role(existing.get("user_id"), existing.get("user_role"))
    assert_can_review_leave(reviewer_user, existing.get("user_id"), applicant_role)

    reviewer_id = str(reviewer_user.get("id") or reviewer_user.get("_id") or "")
    reviewer_name = reviewer_user.get("full_name") or reviewer_user.get("name", "Reviewer")
    reviewer_role = reviewer_user.get("role", "reviewer")
    now_iso = datetime.now(timezone.utc).isoformat()

    new_status = review_data.status
    reason_text = (
        review_data.review_comments
        if new_status == LeaveStatus.APPROVED
        else review_data.clarification_prompt
        if new_status == LeaveStatus.NEEDS_INFO
        else (review_data.rejection_reason or review_data.review_comments or "Rejected")
    )

    history_entry = {
        "from_status": existing.get("status", LeaveStatus.PENDING.value),
        "to_status": new_status.value,
        "changed_by_id": reviewer_id,
        "changed_by_name": reviewer_name,
        "changed_by_role": reviewer_role,
        "changed_at": now_iso,
        "reason": reason_text,
    }

    update_fields: Dict[str, Any] = {
        "status": new_status.value,
        "reviewer_id": reviewer_id,
        "reviewer_name": reviewer_name,
        "reviewed_at": now_iso,
        "updated_at": now_iso,
    }
    if review_data.review_comments is not None:
        update_fields["review_comments"] = review_data.review_comments
    if review_data.rejection_reason is not None:
        update_fields["rejection_reason"] = review_data.rejection_reason
    if review_data.clarification_prompt is not None:
        update_fields["clarification_prompt"] = review_data.clarification_prompt
        update_fields["clarification_requested_at"] = now_iso

    result = await db.leave_requests.find_one_and_update(
        {"id": request_id},
        {
            "$set": update_fields,
            "$push": {"status_history": history_entry},
        },
        projection={"_id": 0},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=500, detail="Failed to update leave request")

    await _sync_attendance_record_for_request(
        req=existing,
        new_status_str=new_status.value,
        reviewer_name=reviewer_name,
        review_comments=review_data.review_comments,
        now_iso=now_iso,
    )

    # Dispatch mobile push notification to the applicant
    try:
        applicant_id = existing.get("user_id")
        if applicant_id:
            type_lbl = _format_request_type_label(existing)
            date_lbl = _format_request_date_label(existing)

            if new_status == LeaveStatus.APPROVED:
                title = f"{type_lbl} Approved ✅"
                body = f"Your {type_lbl.lower()} request for {date_lbl} has been approved by {reviewer_name}."
                if review_data.review_comments:
                    body += f" Note: {review_data.review_comments}"
                kind = "leave_approved"
            elif new_status == LeaveStatus.REJECTED:
                title = f"{type_lbl} Rejected ❌"
                body = f"Your {type_lbl.lower()} request for {date_lbl} was rejected by {reviewer_name}."
                if review_data.rejection_reason:
                    body += f" Reason: {review_data.rejection_reason}"
                kind = "leave_rejected"
            elif new_status == LeaveStatus.NEEDS_INFO:
                title = f"Info Requested on {type_lbl} ℹ️"
                prompt_text = review_data.clarification_prompt or "Please provide more details."
                body = f"{reviewer_name} requested information for your {type_lbl.lower()} request on {date_lbl}: {prompt_text}"
                kind = "leave_needs_info"
            else:
                title = f"{type_lbl} Status Updated"
                body = f"Your {type_lbl.lower()} request status was set to {new_status.value}."
                kind = "leave_status_update"

            await push_service.dispatch_to_users(
                user_ids=[applicant_id],
                title=title,
                body=body,
                kind=kind,
                sender_id=reviewer_id,
                sender_name=reviewer_name,
                sender_role=reviewer_role,
            )
    except Exception as exc:
        logger.warning("Failed to dispatch push notification for reviewed request %s: %s", request_id, exc)

    return LeaveResponse(**result)


async def submit_leave_clarification(
    request_id: str,
    current_user: dict,
    clarification_response: str,
) -> LeaveResponse:
    """
    Submits clarification from the employee in response to HR/Admin request,
    reopening the request back to 'pending'.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    existing = await db.leave_requests.find_one({"id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Leave request '{request_id}' not found")

    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    if str(existing.get("user_id")) != user_id:
        raise HTTPException(status_code=403, detail="You can only provide clarification for your own request.")

    if existing.get("status") != LeaveStatus.NEEDS_INFO.value:
        raise HTTPException(
            status_code=400,
            detail="Clarification can only be submitted for requests with 'needs_info' status.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    history_entry = {
        "from_status": LeaveStatus.NEEDS_INFO.value,
        "to_status": LeaveStatus.PENDING.value,
        "changed_by_id": user_id,
        "changed_by_name": current_user.get("full_name") or current_user.get("name", "Applicant"),
        "changed_by_role": current_user.get("role", "employee"),
        "changed_at": now_iso,
        "reason": f"Clarification provided: {clarification_response}",
    }

    result = await db.leave_requests.find_one_and_update(
        {"id": request_id},
        {
            "$set": {
                "status": LeaveStatus.PENDING.value,
                "clarification_response": clarification_response,
                "clarification_submitted_at": now_iso,
                "updated_at": now_iso,
            },
            "$push": {"status_history": history_entry},
        },
        projection={"_id": 0},
        return_document=True,
    )

    # Dispatch mobile push notification to HR & Operations (excluding admin)
    try:
        hr_ops_ids = await push_service.get_hr_and_ops_user_ids()
        notify_ids = [uid for uid in hr_ops_ids if uid != user_id]
        if notify_ids:
            type_lbl = _format_request_type_label(existing)
            date_lbl = _format_request_date_label(existing)
            applicant_name = current_user.get("full_name") or current_user.get("name", "Employee")
            await push_service.dispatch_to_users(
                user_ids=notify_ids,
                title=f"{type_lbl} Clarification Submitted 💬",
                body=f"{applicant_name} replied to clarification for {type_lbl.lower()} request on {date_lbl}: {clarification_response}",
                kind="leave_clarified",
                sender_id=user_id,
                sender_name=applicant_name,
                sender_role=current_user.get("role"),
            )
    except Exception as exc:
        logger.warning("Failed to dispatch push notification for clarification %s: %s", request_id, exc)

    return LeaveResponse(**result)


async def submit_leave_appeal(
    request_id: str,
    current_user: dict,
    appeal_reason: str,
) -> LeaveResponse:
    """
    Submits a single-use appeal on a rejected request, setting status to 'appealed'.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    existing = await db.leave_requests.find_one({"id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Leave request '{request_id}' not found")

    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    if str(existing.get("user_id")) != user_id:
        raise HTTPException(status_code=403, detail="You can only appeal your own request.")

    if existing.get("status") != LeaveStatus.REJECTED.value:
        raise HTTPException(
            status_code=400,
            detail="Appeals can only be submitted for rejected requests.",
        )

    if existing.get("has_appealed"):
        raise HTTPException(
            status_code=400,
            detail="You can only appeal a rejected request once.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    history_entry = {
        "from_status": LeaveStatus.REJECTED.value,
        "to_status": LeaveStatus.APPEALED.value,
        "changed_by_id": user_id,
        "changed_by_name": current_user.get("full_name") or current_user.get("name", "Applicant"),
        "changed_by_role": current_user.get("role", "employee"),
        "changed_at": now_iso,
        "reason": f"Appeal submitted: {appeal_reason}",
    }

    result = await db.leave_requests.find_one_and_update(
        {"id": request_id},
        {
            "$set": {
                "status": LeaveStatus.APPEALED.value,
                "has_appealed": True,
                "appeal_reason": appeal_reason,
                "appealed_at": now_iso,
                "updated_at": now_iso,
            },
            "$push": {"status_history": history_entry},
        },
        projection={"_id": 0},
        return_document=True,
    )

    # Dispatch mobile push notification to HR & Operations (excluding admin)
    try:
        hr_ops_ids = await push_service.get_hr_and_ops_user_ids()
        notify_ids = [uid for uid in hr_ops_ids if uid != user_id]
        if notify_ids:
            type_lbl = _format_request_type_label(existing)
            date_lbl = _format_request_date_label(existing)
            applicant_name = current_user.get("full_name") or current_user.get("name", "Employee")
            await push_service.dispatch_to_users(
                user_ids=notify_ids,
                title=f"{type_lbl} Appeal Submitted ⚖️",
                body=f"{applicant_name} appealed the decision on their {type_lbl.lower()} request for {date_lbl}: {appeal_reason}",
                kind="leave_appealed",
                sender_id=user_id,
                sender_name=applicant_name,
                sender_role=current_user.get("role"),
            )
    except Exception as exc:
        logger.warning("Failed to dispatch push notification for appeal %s: %s", request_id, exc)

    return LeaveResponse(**result)


async def edit_leave_request_status(
    request_id: str,
    reviewer_user: dict,
    new_status: LeaveStatus,
    reason: str,
) -> LeaveResponse:
    """
    Edits/reverses an already resolved leave/overtime request status with audit tracking
    and dynamic recalculation.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    existing = await db.leave_requests.find_one({"id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Leave request '{request_id}' not found")

    from app.services.leave_permissions import assert_can_edit_leave_status

    applicant_role = await _resolve_applicant_role(existing.get("user_id"), existing.get("user_role"))
    assert_can_edit_leave_status(reviewer_user, existing.get("user_id"), applicant_role)

    reviewer_id = reviewer_user.get("id")
    reviewer_name = reviewer_user.get("full_name") or reviewer_user.get("name", "Reviewer")
    reviewer_role = reviewer_user.get("role", "reviewer")
    now_iso = datetime.now(timezone.utc).isoformat()
    status_str = new_status.value if isinstance(new_status, LeaveStatus) else str(new_status)

    update_fields = {
        "status": status_str,
        "reviewed_by_id": reviewer_id,
        "reviewed_by_name": reviewer_name,
        "reviewed_at": now_iso,
        "updated_at": now_iso,
    }
    if status_str == LeaveStatus.APPROVED.value:
        update_fields["review_comments"] = f"Status modified to approved: {reason}"
    elif status_str == LeaveStatus.REJECTED.value:
        update_fields["rejection_reason"] = reason
        update_fields["review_comments"] = f"Status modified to rejected: {reason}"

    history_entry = {
        "from_status": existing.get("status", "unknown"),
        "to_status": status_str,
        "changed_by_id": reviewer_id,
        "changed_by_name": reviewer_name,
        "changed_by_role": reviewer_role,
        "changed_at": now_iso,
        "reason": f"Status manually edited: {reason}",
    }

    result = await db.leave_requests.find_one_and_update(
        {"id": request_id},
        {
            "$set": update_fields,
            "$push": {"status_history": history_entry},
        },
        projection={"_id": 0},
        return_document=True,
    )

    await _sync_attendance_record_for_request(existing, status_str, reviewer_name, reason, now_iso)
    return LeaveResponse(**result)


async def delete_leave_request(request_id: str, current_user: dict) -> bool:
    """
    Deletes or hides a leave/WFH/regularization/overtime request:
    1. Pending / In-Flight requests ('pending', 'appealed', 'needs_info'):
       - Completely hard deleted from the database so it is cancelled and removed
         from ALL views (Applicant, HR, Operations, Admin).
    2. Resolved requests ('approved', 'rejected', 'cancelled'):
       - If deleted by Applicant / Employee: Hidden ONLY from that applicant's view (added to `hidden_from_user_ids`).
         HR, Operations, and Admin STILL SEE IT in their approvals/audit log.
       - If deleted by HR / Operations: Hidden from HR/Operations view (`hidden_from_hr: True`).
         Admin STILL SEES IT (Admin retains master audit visibility).
       - If deleted by Admin: Hidden from Admin view (`hidden_from_admin: True`).
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
        allow_scoped_hide=True,
    )

    req_status = str(existing.get("status") or "").lower()
    actor_role = str(current_user.get("role") or "team_member").lower()
    actor_id_str = str(current_user.get("id") or current_user.get("_id") or "")
    applicant_id_str = str(existing.get("user_id") or "")

    is_in_flight = req_status in (
        LeaveStatus.PENDING.value,
        LeaveStatus.APPEALED.value,
        LeaveStatus.NEEDS_INFO.value,
        "pending",
        "appealed",
        "needs_info",
    )

    if is_in_flight:
        # In-flight request withdrawn/cancelled before completion: hard delete from everyone's view
        await db.leave_requests.delete_one({"id": request_id})
        return True

    # Resolved requests: Role-scoped view clearing
    if actor_role == "admin":
        await db.leave_requests.update_one(
            {"id": request_id},
            {"$set": {"hidden_from_admin": True}},
        )
    elif actor_role in ("hr", "operations"):
        # If HR is deleting their own submitted request from My Requests
        if actor_id_str == applicant_id_str:
            await db.leave_requests.update_one(
                {"id": request_id},
                {
                    "$addToSet": {"hidden_from_user_ids": actor_id_str},
                    "$set": {"hidden_from_hr": True},
                },
            )
        else:
            # HR deleting someone else's request from HR Approvals view
            await db.leave_requests.update_one(
                {"id": request_id},
                {"$set": {"hidden_from_hr": True}},
            )
    else:
        # Regular employee deleting from My Requests tab
        await db.leave_requests.update_one(
            {"id": request_id},
            {"$addToSet": {"hidden_from_user_ids": actor_id_str}},
        )

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
            exp_h = float(shift.expected_hours or 8.0)
            sl_hours_val = max(0.0, round(exp_h - float(work_hours or 0.0), 4))
            undertime_hours = 0.0
            undertime_minutes = 0
            undertime_formatted = "-00:00"
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

    sl_hours_final = (
        sl_hours_val
        if final_status == AttendanceStatus.SHORT_LEAVE.value
        else float(existing.get("short_leave_hours", 0.0) if existing else 0.0)
    )

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
        "is_short_leave": (final_status == AttendanceStatus.SHORT_LEAVE.value or bool(existing.get("is_short_leave") if existing else False)),
        "short_leave_hours": sl_hours_final,
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

async def get_calendar_events(year: Optional[int] = None, month: Optional[int] = None) -> CalendarMonthResponse:
    """Retrieves all calendar events, holidays, and working Saturdays for a month or active period."""
    db = get_database()
    target_year = year or 2026
    target_month = month or 8
    if db is None:
        return CalendarMonthResponse(year=target_year, month=target_month, events=[], holidays=[], working_saturdays=[])

    query = {}
    if year is not None and month is not None:
        month_prefix = f"{year:04d}-{month:02d}"
        query = {"date": {"$regex": f"^{month_prefix}-"}}
    elif year is not None:
        query = {"date": {"$regex": f"^{year:04d}-"}}

    docs = await db.company_calendar.find(query, {"_id": 0}).sort("date", 1).to_list(500)

    events = [CalendarEventResponse(**d) for d in docs]
    holidays = [
        e.date for e in events
        if e.is_off_day or str(getattr(e.event_type, "value", e.event_type) or "").lower() in ("holiday", "calendar_event_type.holiday")
    ]
    working_saturdays = [
        e.date for e in events
        if e.is_workday_override or str(getattr(e.event_type, "value", e.event_type) or "").lower() in ("working_saturday", "calendar_event_type.working_saturday")
    ]

    return CalendarMonthResponse(
        year=target_year,
        month=target_month,
        events=events,
        holidays=holidays,
        working_saturdays=working_saturdays,
    )


async def create_calendar_event(event_in: CalendarEventCreate) -> CalendarEventResponse:
    """Creates a new company calendar event / holiday / working Saturday override and auto-syncs attendance."""
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

    # If this is a holiday, auto-convert unpunched absent attendance records on this date to holiday
    is_holiday = event_dict.get("is_off_day") is True or str(event_dict.get("event_type") or "").lower() in ("holiday", "calendar_event_type.holiday")
    if is_holiday and event_dict.get("date"):
        h_title = event_dict.get("title") or "Public Holiday"
        try:
            await db.attendance_records.update_many(
                {"date": event_dict["date"], "punch_in": None, "check_in": None},
                {"$set": {
                    "status": AttendanceStatus.HOLIDAY.value,
                    "shift_name": h_title,
                    "notes": f"{h_title} (Public Holiday)",
                    "is_late": False,
                    "late_minutes": 0,
                    "is_absent": False,
                    "is_wfh": False,
                    "is_missed_punch": False,
                    "work_hours": 0.0,
                    "working_hours_minutes": 0,
                    "work_duration_formatted": "00:00",
                    "overtime_hours": 0.0,
                    "overtime_minutes": 0,
                    "overtime_formatted": "+00:00",
                    "undertime_hours": 0.0,
                    "undertime_minutes": 0,
                    "undertime_formatted": "+00:00",
                    "updated_at": now_iso,
                }}
            )
        except Exception as e:
            logger.warning(f"Failed to auto-sync attendance records for holiday {event_dict['date']}: {e}")

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

    existing = await db.company_calendar.find_one({"id": event_id})
    result = await db.company_calendar.delete_one({"id": event_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Calendar event '{event_id}' not found")

    if existing and existing.get("date") and (existing.get("is_off_day") or existing.get("event_type") == "holiday"):
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            await db.attendance_records.update_many(
                {"date": existing["date"], "punch_in": None, "check_in": None, "status": AttendanceStatus.HOLIDAY.value},
                {"$set": {
                    "status": AttendanceStatus.ABSENT.value,
                    "notes": "Unpunched workday (Auto Absent)",
                    "updated_at": now_iso,
                }}
            )
        except Exception:
            pass

    return {"message": f"Calendar event '{event_id}' deleted successfully", "id": event_id}


# ==============================================================================
# Missed Punch Inquiries (HR Ask Checkout & Employee Response)
# ==============================================================================

async def create_missed_punch_inquiry(
    user_id: str,
    date_str: str,
    actor: dict,
    note: Optional[str] = None,
) -> dict:
    """HR dispatches an inquiry to an employee who missed punch out on date_str."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")

    employee_name = user_doc.get("full_name") or user_doc.get("name", "Employee")
    department = user_doc.get("department", "")

    att_rec = await db.attendance_records.find_one({"user_id": user_id, "date": date_str}, {"_id": 0})
    shift = await get_shift_for_user(user_id, department, date_str)

    punch_in = None
    shift_name = shift.name if shift else "Standard Shift"
    if att_rec:
        punch_in = att_rec.get("punch_in") or att_rec.get("check_in")
        shift_name = att_rec.get("shift_name") or shift_name

    now_pkt = get_now_pkt()
    is_missed = False
    if att_rec:
        is_missed = bool(att_rec.get("is_missed_punch") or att_rec.get("status") == "missed_punch")
        if not is_missed and (att_rec.get("punch_in") or att_rec.get("check_in")) and not (att_rec.get("punch_out") or att_rec.get("check_out")):
            if is_checkout_window_closed(shift, now_pkt, shift_date=date_str):
                is_missed = True

    if not is_missed and not is_checkout_window_closed(shift, now_pkt, shift_date=date_str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot request checkout for an ongoing shift or open checkout window.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()

    existing = await db.missed_punch_inquiries.find_one(
        {"user_id": user_id, "date": date_str, "status": "pending"},
        {"_id": 0},
    )
    if existing:
        return existing

    inq_doc = {
        "id": f"inq_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "employee_name": employee_name,
        "department": department,
        "date": date_str,
        "shift_name": shift_name,
        "punch_in": punch_in,
        "status": "pending",
        "requested_by_id": actor.get("id"),
        "requested_by_name": actor.get("full_name") or actor.get("name", "HR"),
        "requested_at": now_iso,
        "note": note,
        "response_check_out": None,
        "response_reason": None,
        "responded_at": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    await db.missed_punch_inquiries.insert_one(inq_doc)

    try:
        from app.services.email_service import EmailService
        if user_doc.get("email"):
            msg = (
                f"HR ({inq_doc['requested_by_name']}) has requested your check-out time and reason "
                f"for {date_str} ({shift_name}, punch in: {punch_in or 'N/A'}). "
                f"Please open your attendance dashboard to submit your check-out."
            )
            await EmailService.send_log_reminder(
                recipient_email=user_doc["email"],
                recipient_name=employee_name,
                missing_dates=[date_str],
                custom_message=msg,
            )
    except Exception as e:
        logger.warning(f"Failed to send email notification for inquiry {inq_doc['id']}: {e}")

    # Dispatch mobile push notification to the employee's phone
    try:
        hr_name = inq_doc.get("requested_by_name") or "HR"
        body_text = f"{hr_name} requested your check-out time and explanation for missed punch on {date_str} ({shift_name})."
        if note:
            body_text += f" Note: {note}"
        await push_service.dispatch_to_users(
            user_ids=[user_id],
            title="Missed Checkout Inquiry ⚠️",
            body=body_text,
            kind="missed_punch_inquiry",
            sender_id=actor.get("id"),
            sender_name=hr_name,
            sender_role=actor.get("role"),
        )
    except Exception as e:
        logger.warning(f"Failed to send mobile push notification for inquiry {inq_doc['id']}: {e}")

    return inq_doc


async def get_pending_inquiries_for_user(user_id: str) -> List[dict]:
    """Returns active pending missed punch inquiries for the authenticated employee."""
    db = get_database()
    if db is None:
        return []
    cursor = db.missed_punch_inquiries.find({"user_id": user_id, "status": "pending"}, {"_id": 0}).sort("date", -1)
    return await cursor.to_list(length=100)


async def get_missed_punch_inquiries(
    user_id: Optional[str] = None,
    date_str: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> List[dict]:
    """HR query for missed punch inquiries."""
    db = get_database()
    if db is None:
        return []
    query: Dict[str, Any] = {}
    if user_id:
        query["user_id"] = user_id
    if date_str:
        query["date"] = date_str
    if status_filter:
        query["status"] = status_filter
    cursor = db.missed_punch_inquiries.find(query, {"_id": 0}).sort("date", -1)
    return await cursor.to_list(length=200)


async def respond_to_missed_punch_inquiry(
    inquiry_id: str,
    user_id: str,
    check_out: str,
    reason: str,
) -> dict:
    """Employee provides their missing checkout time and explanation."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    inq = await db.missed_punch_inquiries.find_one({"id": inquiry_id}, {"_id": 0})
    if not inq:
        raise HTTPException(status_code=404, detail=f"Inquiry '{inquiry_id}' not found")

    if inq.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="You are not authorized to respond to this inquiry")

    if inq.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"This inquiry is already {inq.get('status')}")

    target_date = inq.get("date")
    now_iso = datetime.now(timezone.utc).isoformat()

    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    dept = (user_doc or {}).get("department", "")
    shift = await get_shift_for_user(user_id, dept, target_date)
    existing_rec = await db.attendance_records.find_one({"user_id": user_id, "date": target_date}, {"_id": 0})

    punch_in = (existing_rec.get("punch_in") or existing_rec.get("check_in")) if existing_rec else shift.start_time
    punch_out = check_out.strip()

    _claimed, settled, _gate, _ot, _ut, _s, _e = compute_settled_checkout(
        punch_in,
        punch_out,
        shift,
        auto_approve=True,
    )
    hour_fields = settled_to_record_fields(settled)
    preview = calculate_daily_attendance(
        check_in_time=punch_in,
        check_out_time=punch_out,
        **shift_calc_kwargs(shift),
    )

    is_wfh = bool((existing_rec or {}).get("is_wfh") or (existing_rec or {}).get("status") == "wfh")
    final_status = "wfh" if is_wfh else (AttendanceStatus.LATE.value if preview.is_late else AttendanceStatus.PRESENT.value)

    att_doc = {
        "id": (existing_rec or {}).get("id") or f"att_{user_id}_{target_date}",
        "user_id": user_id,
        "user_name": (user_doc or {}).get("full_name") or (user_doc or {}).get("name", "Employee"),
        "employee_name": (user_doc or {}).get("full_name") or (user_doc or {}).get("name", "Employee"),
        "department": dept,
        "date": target_date,
        "shift_id": shift.id,
        "shift_name": shift.name,
        "check_in": punch_in,
        "check_out": punch_out,
        "punch_in": punch_in,
        "punch_out": punch_out,
        "break_minutes": shift.break_duration_minutes,
        **hour_fields,
        "late_minutes": preview.late_minutes,
        "is_late": preview.is_late,
        "late_strike": preview.late_strike,
        "status": final_status,
        "is_wfh": is_wfh,
        "is_missed_punch": False,
        "notes": f"Checkout provided upon HR inquiry: {reason}",
        "undertime_reason": reason if hour_fields.get("undertime_minutes", 0) > 0 else None,
        "created_at": (existing_rec or {}).get("created_at") or now_iso,
        "updated_at": now_iso,
    }

    await db.attendance_records.update_one(
        {"user_id": user_id, "date": target_date},
        {"$set": att_doc},
        upsert=True,
    )

    await db.missed_punch_inquiries.update_one(
        {"id": inquiry_id},
        {
            "$set": {
                "status": "resolved",
                "response_check_out": punch_out,
                "response_reason": reason,
                "responded_at": now_iso,
                "updated_at": now_iso,
            }
        },
    )

    try:
        from app.services.log_compliance import recompute_day_score
        await recompute_day_score(user_id, target_date, actor=user_doc)
    except Exception as err:
        logger.warning(f"Failed to recompute daily log score after inquiry response: {err}")

    # Dispatch mobile push notification to HR & Operations (excluding admin)
    try:
        hr_ops_ids = await push_service.get_hr_and_ops_user_ids()
        notify_ids = [uid for uid in hr_ops_ids if uid != user_id]
        if notify_ids:
            applicant_name = (user_doc or {}).get("full_name") or (user_doc or {}).get("name", "Employee")
            await push_service.dispatch_to_users(
                user_ids=notify_ids,
                title="Missed Checkout Regularized ✅",
                body=f"{applicant_name} provided check-out time ({punch_out}) and reason for {target_date}: {reason}",
                kind="missed_punch_resolved",
                sender_id=user_id,
                sender_name=applicant_name,
                sender_role=(user_doc or {}).get("role"),
            )
    except Exception as e:
        logger.warning(f"Failed to dispatch push notification for resolved inquiry {inquiry_id}: {e}")

    return {
        "message": "Checkout time submitted and attendance successfully regularized.",
        "attendance_record": att_doc,
    }

