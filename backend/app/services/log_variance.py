"""
Log Variance Service: Central calculation service for Log Variance, Exceptions,
Lead Dashboard, and Member Activity.

Canonical unit is integer minutes.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException

from app.database import get_database
from app.models.attendance import NON_LEAVE_REQUEST_TYPES
from app.models.user import UserRole
from app.services.access import canonicalize_departments, is_tracked, was_tracked
from app.services.attendance_calculator import derive_expected_work_minutes
from app.services.attendance_golive import (
    ATTENDANCE_GO_LIVE_DATE,
    get_employee_attendance_start,
)
from app.services.company_members import (
    company_member_user,
    company_member_users,
    deactivation_cutoff,
    member_active_during,
)
from app.services.log_compliance import (
    ATTENDANCE_FULL_LEAVE_STATUSES,
    FULL_DAY_LEAVE_TYPES,
    LOGGERS_ROLES,
    PKT,
    apply_accepted_gap_state,
    attendance_is_full_leave,
    compute_time_at_work_hours,
    leave_covers_date,
    load_shift_lookup,
    pkt_today,
    resolved_auto_wfh,
    shift_doc_for_user,
    target_from_shift_and_leaves,
)
from app.services.permissions import (
    departments_with,
    load_context,
    normalize_dept,
)
from app.services.workdays import (
    DayClassification,
    OffDayIndex,
    load_off_day_index,
    parse_iso_date,
)

logger = logging.getLogger(__name__)


# Thresholds
UNDER_TARGET_MIN = 30
LARGE_VARIANCE_MIN = 60
OVER_LOGGED_MIN = 30
LATE_HOURS_WINDOW = 48
COVERAGE_TARGET_PCT = 95.0


EXCEPTION_FLAG_TYPES = {
    "no_log",
    "large_variance",
    "over_logged",
    "missing_checkout",
    "logged_on_leave_or_off",
    "logged_without_attendance",
}


def _person_department(user: Dict[str, Any]) -> str:
    packed = canonicalize_departments(
        departments=user.get("departments") if isinstance(user.get("departments"), list) else None,
        primary=user.get("primary_department"),
        department=user.get("department"),
    )
    return packed.get("primary_department") or "General"


def format_hm(minutes: int) -> str:
    """Format minutes to string e.g. 8h 09m, 8h, 45m, 0m."""
    mins = abs(int(minutes))
    h = mins // 60
    m = mins % 60
    if h == 0 and m == 0:
        return "0m"
    if h == 0:
        return f"{m}m"
    if m == 0:
        return f"{h}h"
    return f"{h}h {m:02d}m"


def format_signed_hm(minutes: int) -> str:
    """Format minutes with sign e.g. +14h 58m, -50m, 0m."""
    val = int(minutes)
    if val == 0:
        return "0m"
    sign = "+" if val > 0 else "-"
    return f"{sign}{format_hm(abs(val))}"


def _has_personal_working_override(
    assignment: Optional[Dict[str, Any]], date_str: str
) -> bool:
    """Return True if an override for date has working_day, source=shift_change, shift_id, or is_working."""
    if not assignment:
        return False
    for ov in assignment.get("date_overrides") or []:
        if isinstance(ov, dict) and str(ov.get("date") or "") == date_str:
            if (
                ov.get("working_day") is True
                or ov.get("source") == "shift_change"
                or ov.get("shift_id")
                or ov.get("is_working")
            ):
                return True
    return False


def parse_date_window(
    start_date: str, end_date: Optional[str] = None
) -> Tuple[str, str, List[str], bool]:
    """Validate and return (start, end, dates_list, today_included). Max 92 days inclusive."""
    s_clean = (start_date or "").strip()
    e_clean = (end_date or start_date or "").strip()
    if not s_clean:
        raise HTTPException(status_code=400, detail="start_date is required")

    try:
        s_d = datetime.strptime(s_clean, "%Y-%m-%d").date()
        e_d = datetime.strptime(e_clean, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be in YYYY-MM-DD format")

    if s_d > e_d:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    delta_days = (e_d - s_d).days + 1
    if delta_days > 92:
        raise HTTPException(
            status_code=400, detail="Requested date range cannot exceed 92 days"
        )

    today = pkt_today()
    dates: List[str] = []
    curr = s_d
    while curr <= e_d:
        dates.append(curr.strftime("%Y-%m-%d"))
        curr += timedelta(days=1)

    today_included = s_clean <= today <= e_clean
    return s_clean, e_clean, dates, today_included


async def get_loggers_for_viewer(
    current_user: Dict[str, Any],
    db: Any,
    department_filter: Optional[str] = None,
    user_id_filter: Optional[str] = None,
    for_exceptions: bool = False,
    range_start: Optional[str] = None,
    range_end: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Resolve people in scope for viewer according to §3 and §6.4."""
    viewer_id = str(current_user.get("id") or current_user.get("_id") or "")
    role = str(current_user.get("role") or "").lower()

    # 1. Base loggers query
    query: Dict[str, Any] = {
        "role": {"$in": list(LOGGERS_ROLES)},
    }

    # Viewer scoping
    if role in ("admin", "operations"):
        # Sees all loggers in company
        pass
    elif role == "hr":
        if for_exceptions:
            # An HR viewer sees everyone in scope EXCEPT themselves
            query["id"] = {"$ne": viewer_id}
        else:
            # HR sees all loggers in company
            pass
    elif role == "team_lead":
        if for_exceptions:
            lead_user_doc = await company_member_user(viewer_id, db=db)
            ctx = await load_context(lead_user_doc or current_user, db=db)
            lead_depts = [
                normalize_dept(d)
                for d in departments_with(ctx, "exceptions", "department")
            ]
            if not lead_depts:
                dept = current_user.get("department") or current_user.get("primary_department")
                if dept:
                    lead_depts = [normalize_dept(dept)]

            if not lead_depts:
                return []

            query["role"] = {"$in": ["team_member", "member"]}
            dept_regexes = [
                {"primary_department": {"$regex": f"^{re.escape(d)}$", "$options": "i"}}
                for d in lead_depts
            ]
            dept_regexes.extend([
                {"department": {"$regex": f"^{re.escape(d)}$", "$options": "i"}}
                for d in lead_depts
            ])
            query["$or"] = dept_regexes
            query["id"] = {"$ne": viewer_id}
        else:
            lead_user_doc = await company_member_user(viewer_id, db=db)
            ctx = await load_context(lead_user_doc or current_user, db=db)
            lead_depts = [
                normalize_dept(d)
                for d in (
                    departments_with(ctx, "daily_log", "department")
                    or departments_with(ctx, "exceptions", "department")
                )
            ]
            if not lead_depts:
                dept = current_user.get("department") or current_user.get("primary_department")
                if dept:
                    lead_depts = [normalize_dept(dept)]

            if not lead_depts:
                # If lead has no assigned departments, they only see themselves
                query["id"] = viewer_id
            else:
                dept_regexes = [
                    {"primary_department": {"$regex": f"^{re.escape(d)}$", "$options": "i"}}
                    for d in lead_depts
                ]
                dept_regexes.extend([
                    {"department": {"$regex": f"^{re.escape(d)}$", "$options": "i"}}
                    for d in lead_depts
                ])
                # Lead sees members of their departments + themselves
                query["$or"] = dept_regexes + [{"id": viewer_id}]
    elif role in ("team_member", "member"):
        # Member only sees themselves
        if user_id_filter and user_id_filter != viewer_id:
            raise HTTPException(
                status_code=403, detail="Team members can only view their own records"
            )
        query["id"] = viewer_id
    else:
        raise HTTPException(status_code=403, detail="Role not authorized")

    if user_id_filter:
        query["id"] = user_id_filter

    users = await company_member_users(query, db=db, limit=2000, include_inactive=True)

    # Filter to tracked users only, including leavers active during range (§2.1)
    tracked_users = []
    for u in users:
        is_act = u.get("is_active") is not False
        cutoff = deactivation_cutoff(u)
        is_inactive = (not is_act) or (cutoff is not None)
        if not is_inactive:
            if is_tracked(u, "daily_log"):
                tracked_users.append(u)
        else:
            if was_tracked(u, "daily_log"):
                if range_start and range_end:
                    if cutoff:
                        c_date = parse_iso_date(cutoff)
                        last_employed_day = (
                            (c_date - timedelta(days=1)).strftime("%Y-%m-%d")
                            if c_date
                            else None
                        )
                    else:
                        last_employed_day = None
                    if not last_employed_day:
                        continue
                    emp_start = get_employee_attendance_start(u, range_start)
                    eff_start = max(range_start, emp_start)
                    eff_end = min(range_end, last_employed_day)
                    if eff_start <= eff_end:
                        tracked_users.append(u)
                else:
                    tracked_users.append(u)

    # If department_filter is provided:
    if department_filter and isinstance(department_filter, str) and department_filter.strip():
        norm_dept = normalize_dept(department_filter.strip())
        tracked_users = [
            u
            for u in tracked_users
            if normalize_dept(u.get("department") or u.get("primary_department") or "")
            == norm_dept
            or norm_dept
            in [normalize_dept(d) for d in (u.get("departments") or [])]
        ]

    return tracked_users


def classify_person_day(
    *,
    user_id: str,
    date_str: str,
    today_str: str,
    user: Dict[str, Any],
    emp_start: str,
    last_employed_day: Optional[str],
    shift: Dict[str, Any],
    leaves: List[Dict[str, Any]],
    auto_wfh: bool,
    att_rec: Optional[Dict[str, Any]],
    entries: List[Dict[str, Any]],
    off_idx: OffDayIndex,
    has_personal_override: bool = False,
    score_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Pure calculation for a single person-day in integer minutes."""
    d_date = parse_iso_date(date_str)
    if d_date is None:
        raise ValueError(f"Invalid date: {date_str}")

    # Employment range check
    is_employed = date_str >= emp_start and (
        last_employed_day is None or date_str <= last_employed_day
    )
    if not is_employed:
        return {
            "date": date_str,
            "status": "not_employed",
            "status_label": "Not employed",
            "check_in": None,
            "check_out": None,
            "worked": 0,
            "pending_ot": 0,
            "expected": 0,
            "logged": 0,
            "variance": 0,
            "coverage_pct": None,
            "tone": "neutral",
            "flags": ["EXCLUDED FROM AVERAGE"],
            "entries_count": 0,
            "compare_ready": False,
            "tasks": [],
            "scheduled": False,
            "is_full_leave": False,
            "is_wfh": False,
            "employed": False,
            "exceptions": [],
        }

    # Shift & Leaves
    target_info = target_from_shift_and_leaves(shift, leaves, date_str, auto_wfh=auto_wfh)
    is_full_leave = bool(target_info.get("is_full_leave"))
    is_wfh = bool(target_info.get("is_wfh"))
    short_leave_hours = float(target_info.get("short_leave_hours") or 0.0)
    short_leave_min = int(round(short_leave_hours * 60))

    # Attendance
    rec = att_rec or {}
    has_checkin = bool(rec.get("check_in") or rec.get("punch_in"))
    has_checkout = bool(rec.get("check_out") or rec.get("punch_out"))
    check_in_time = rec.get("check_in") or rec.get("punch_in")
    check_out_time = rec.get("check_out") or rec.get("punch_out")
    att_status = str(rec.get("status") or "").lower()

    if attendance_is_full_leave(rec) or att_status in ("leave", "on_leave"):
        is_full_leave = True
    if rec.get("is_wfh"):
        is_wfh = True

    # Calendar & Scheduling
    is_company_workday = off_idx.is_workday(d_date)
    scheduled = is_company_workday or has_personal_override
    present = has_checkin or (is_wfh and scheduled)
    complete = (date_str < today_str) or (date_str == today_str and has_checkout)
    absent = scheduled and (not is_full_leave) and (not present) and (date_str < today_str)

    # Classify Day Status
    off_class = off_idx.classify(d_date)
    status_label = None

    if date_str == today_str and has_checkin and not has_checkout:
        status = "live"
        status_label = "Live"
    elif date_str < today_str and has_checkin and not has_checkout:
        status = "missing_checkout"
        status_label = "Missing checkout"
    elif is_full_leave:
        status = "leave"
        status_label = "Leave"
    elif has_checkin:
        if att_status == "half_day":
            status = "half_day"
            status_label = "Half day"
        else:
            status = "present"
            status_label = "Present"
    elif is_wfh and scheduled:
        status = "wfh"
        status_label = "WFH"
    elif absent:
        status = "absent"
        status_label = "Absent"
    else:
        # Off day or holiday
        if off_class.kind == "holiday":
            status = "holiday"
            status_label = off_class.holiday_title or off_class.label or "Holiday"
        else:
            status = "off"
            status_label = off_class.label or "Off"

    # Expected minutes
    shift_start = shift.get("start_time") or "09:30"
    shift_end = shift.get("end_time") or "18:30"
    break_duration = shift.get("break_duration_minutes", 60)
    is_night = bool(shift.get("is_night_shift") or shift.get("is_cross_midnight"))

    shift_expected_min = derive_expected_work_minutes(
        shift_start=shift_start,
        shift_end=shift_end,
        break_duration_minutes=break_duration,
        is_night_shift=is_night,
    )
    if scheduled and not is_full_leave:
        expected = max(0, shift_expected_min - short_leave_min)
    else:
        expected = 0

    # Worked minutes
    pending_ot = int(rec.get("pending_overtime_minutes") or 0)
    if pending_ot < 0:
        pending_ot = 0

    flags: List[str] = []
    wfh_assumed = False

    if has_checkout:
        stored_mins = rec.get("working_hours_minutes")
        if stored_mins is not None:
            base_mins = int(stored_mins)
        else:
            base_mins = int(round(float(rec.get("work_hours") or 0.0) * 60))
        worked = base_mins + pending_ot
    elif status == "live":
        provisional_h = compute_time_at_work_hours(
            date_str=date_str,
            check_in=check_in_time,
            check_out=None,
            work_hours=float(rec.get("work_hours") or 0.0),
            has_checkin=True,
            has_checkout=False,
            is_wfh=is_wfh,
            expected_hours=shift_expected_min / 60.0,
            shift_start=shift_start,
            shift_end=shift_end,
            break_duration_minutes=break_duration,
            is_night_shift=is_night,
            pending_overtime_minutes=pending_ot,
        )
        worked = int(round(provisional_h * 60))
        flags.append("live")
    elif status == "missing_checkout":
        worked = 0
        flags.append("missing_checkout")
    elif is_wfh and not has_checkin:
        worked = expected
        wfh_assumed = True
        flags.append("wfh_assumed")
    else:
        worked = 0

    if pending_ot > 0:
        flags.append("pending_ot")

    # Logged minutes
    logged = 0
    tasks: List[Dict[str, Any]] = []

    for entry in entries:
        try:
            hrs = float(entry.get("hours_utilized") or 0.0)
        except (ValueError, TypeError):
            hrs = 0.0
        m = int(round(hrs * 60))
        logged += m

        tasks.append({
            "id": entry.get("id") or str(entry.get("_id") or ""),
            "task_description": entry.get("task_description") or "",
            "client_project": entry.get("client_project") or "",
            "task_type": entry.get("task_type") or "",
            "task_status": entry.get("task_status") or "",
            "hours_utilized": hrs,
            "progress_percentage": entry.get("progress_percentage"),
            "blockers": entry.get("blockers"),
        })

    # Compare-ready
    compare_ready = bool(complete and present and status != "missing_checkout")

    # Variance and Coverage
    variance = worked - logged
    coverage_pct = round((logged / worked) * 100, 1) if (worked > 0 and compare_ready) else None
    under_target = bool(compare_ready and variance > UNDER_TARGET_MIN)

    # Tone
    if not compare_ready:
        tone = "neutral"
    else:
        if variance < -OVER_LOGGED_MIN:
            tone = "info"
        elif abs(variance) <= UNDER_TARGET_MIN:
            tone = "success"
        elif variance <= LARGE_VARIANCE_MIN:
            tone = "warning"
        else:
            tone = "danger"

    # Context / Exclusion flags
    if not compare_ready and status not in ("live",):
        flags.append("EXCLUDED FROM AVERAGE")
    elif status == "live":
        flags.append("NOT IN TOTALS YET")

    # Exceptions
    exceptions: List[Dict[str, Any]] = []

    # 1. missing_checkout
    if status == "missing_checkout":
        exceptions.append({
            "type": "missing_checkout",
            "type_label": "Missing checkout",
            "detail": f"In {check_in_time or '—'}, no checkout · {format_hm(logged)} logged, on hold",
        })

    # 2. logged_on_leave_or_off
    if (is_full_leave or not scheduled) and logged > 0 and not has_checkin:
        flags.append("logged_on_leave_or_off")
        exceptions.append({
            "type": "logged_on_leave_or_off",
            "type_label": "Logged on leave/off day",
            "detail": f"Off day / leave · {format_hm(logged)} logged without punch",
        })

    # 3. logged_without_attendance
    if absent and logged > 0:
        flags.append("logged_without_attendance")
        exceptions.append({
            "type": "logged_without_attendance",
            "type_label": "Logged without attendance",
            "detail": f"No check-in, not on leave · {format_hm(logged)} logged",
        })

    # 4. compare_ready exceptions
    if compare_ready:
        if logged == 0:
            flags.append("no_log")
            exceptions.append({
                "type": "no_log",
                "type_label": "No log on worked day",
                "detail": f"Worked {format_hm(worked)} · logged 0m",
            })
        elif variance > LARGE_VARIANCE_MIN:
            flags.append("large_variance")
            exceptions.append({
                "type": "large_variance",
                "type_label": "Large variance",
                "detail": f"Worked {format_hm(worked)} · logged {format_hm(logged)} · +{format_hm(variance)} unlogged",
            })
        elif variance < -OVER_LOGGED_MIN:
            flags.append("over_logged")
            exceptions.append({
                "type": "over_logged",
                "type_label": "Logged > worked",
                "detail": f"Worked {format_hm(worked)} · logged {format_hm(logged)} · {format_hm(abs(variance))} over",
            })

    return {
        "date": date_str,
        "status": status,
        "status_label": status_label,
        "check_in": check_in_time,
        "check_out": check_out_time,
        "worked": worked,
        "pending_ot": pending_ot,
        "expected": expected,
        "logged": logged,
        "variance": variance,
        "coverage_pct": coverage_pct,
        "tone": tone,
        "flags": flags,
        "entries_count": len(entries),
        "compare_ready": compare_ready,
        "tasks": tasks,
        "scheduled": scheduled,
        "is_full_leave": is_full_leave,
        "is_wfh": is_wfh,
        "employed": True,
        "under_target": under_target,
        "complete": complete,
        "exceptions": exceptions,
        "score_doc": score_doc,
    }


async def _compute_person_days(
    db: Any,
    users: List[Dict[str, Any]],
    s_clean: str,
    e_clean: str,
    today: Optional[str] = None,
    viewer_user: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Central batch calculation for all person-days across users in range (§2.6).
    Performs 4 batched queries with $in: user_ids for attendance, leaves, entries, and scores.
    """
    if today is None:
        today = pkt_today()

    s_d = parse_iso_date(s_clean)
    e_d = parse_iso_date(e_clean)
    if not s_d or not e_d:
        return {}

    dates: List[str] = []
    curr = s_d
    while curr <= e_d:
        dates.append(curr.strftime("%Y-%m-%d"))
        curr += timedelta(days=1)

    today_included = s_clean <= today <= e_clean

    if not users:
        return {}

    user_ids = [str(u.get("id") or u.get("_id")) for u in users]

    # Batch load shifts and calendar
    assign_map, shift_map, std_shift, hr_shift = await load_shift_lookup()
    off_idx = await load_off_day_index(s_d, e_d)

    # 1. Batch load attendance records (no cap!)
    att_cursor = db.attendance_records.find(
        {
            "user_id": {"$in": user_ids},
            "date": {"$gte": s_clean, "$lte": e_clean},
        },
        {
            "_id": 0,
            "user_id": 1,
            "date": 1,
            "check_in": 1,
            "punch_in": 1,
            "check_out": 1,
            "punch_out": 1,
            "work_hours": 1,
            "working_hours_minutes": 1,
            "pending_overtime_minutes": 1,
            "status": 1,
            "is_wfh": 1,
        },
    )
    att_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    async for rec in att_cursor:
        u_id = rec.get("user_id")
        d_str = rec.get("date")
        if u_id and d_str:
            att_map[(u_id, d_str)] = rec

    # 2. Batch load leaves (no cap!)
    leaves_cursor = db.leave_requests.find(
        {
            "user_id": {"$in": user_ids},
            "status": {"$in": ["approved", "Approved"]},
            "leave_type": {"$nin": list(NON_LEAVE_REQUEST_TYPES)},
            "start_date": {"$lte": e_clean},
            "$or": [
                {"end_date": {"$gte": s_clean}},
                {"end_date": {"$in": [None, ""]}},
            ],
        },
        {"_id": 0},
    )
    leaves_by_user: Dict[str, List[Dict[str, Any]]] = {uid: [] for uid in user_ids}
    async for leave in leaves_cursor:
        uid = leave.get("user_id")
        if uid in leaves_by_user:
            end = str(leave.get("end_date") or "").strip()
            if end and end < s_clean:
                continue
            leaves_by_user[uid].append(leave)

    # 3. Batch load daily log entries (no cap!)
    entries_cursor = db.daily_log_entries.find(
        {
            "user_id": {"$in": user_ids},
            "date": {"$gte": s_clean, "$lte": e_clean},
        },
        {
            "_id": 0,
            "id": 1,
            "user_id": 1,
            "date": 1,
            "hours_utilized": 1,
            "created_at": 1,
            "task_status": 1,
            "task_description": 1,
            "client_project": 1,
            "task_type": 1,
            "progress_percentage": 1,
            "blockers": 1,
        },
    )
    entries_map: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    tasks_completed_by_user: Dict[str, int] = {uid: 0 for uid in user_ids}
    async for entry in entries_cursor:
        uid = entry.get("user_id")
        d_str = entry.get("date")
        if uid and d_str:
            entries_map.setdefault((uid, d_str), []).append(entry)
            if str(entry.get("task_status") or "").strip().lower() == "completed":
                tasks_completed_by_user[uid] = tasks_completed_by_user.get(uid, 0) + 1

    # 4. Batch load daily_log_day_scores (for open exceptions / review states)
    scores_cursor = db.daily_log_day_scores.find(
        {
            "user_id": {"$in": user_ids},
            "date": {"$gte": s_clean, "$lte": e_clean},
        },
        {"_id": 0},
    )
    scores_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    async for score in scores_cursor:
        uid = score.get("user_id")
        d_str = score.get("date")
        if uid and d_str:
            scores_map[(uid, d_str)] = score

    results: Dict[str, Dict[str, Any]] = {}

    viewer_id = str(viewer_user.get("id") or viewer_user.get("_id") or "") if viewer_user else ""
    viewer_role = str(viewer_user.get("role") or "").lower() if viewer_user else ""

    for user in users:
        uid = str(user.get("id") or user.get("_id"))
        user_name = user.get("full_name") or user.get("name") or "Unknown"
        dept = _person_department(user)
        role_str = str(user.get("role") or "team_member").lower()
        avatar = user.get("avatar_url") or user.get("profile_image")
        cutoff = deactivation_cutoff(user)
        is_inactive = (user.get("is_active") is False) or (cutoff is not None)

        emp_start = get_employee_attendance_start(user, today)
        if cutoff:
            c_date = parse_iso_date(cutoff)
            last_employed_day = (
                (c_date - timedelta(days=1)).strftime("%Y-%m-%d") if c_date else None
            )
        else:
            last_employed_day = None

        user_leaves = leaves_by_user.get(uid, [])
        assignment = assign_map.get(uid)

        days_list: List[Dict[str, Any]] = []
        days_scheduled = 0
        days_present = 0
        days_logged = 0
        days_missing = 0
        days_under_target = 0
        days_absent = 0
        days_leave = 0
        days_off = 0
        days_missing_checkout = 0

        worked_sum = 0
        logged_sum = 0
        expected_sum = 0
        pending_ot_sum = 0
        scheduled_complete_logged = 0
        scheduled_complete_days = 0
        logged_outside = 0
        today_live_worked = 0
        today_live_logged = 0
        user_flags_set: Set[str] = set()
        user_exceptions: List[Dict[str, Any]] = []

        for d_str in dates:
            shift = shift_doc_for_user(
                uid, dept, assign_map, shift_map, std_shift, hr_shift, d_str
            )
            auto_wfh = resolved_auto_wfh(assign_map, uid, d_str)
            has_personal_override = _has_personal_working_override(assignment, d_str)

            att = att_map.get((uid, d_str))
            day_entries = entries_map.get((uid, d_str), [])
            day_score = scores_map.get((uid, d_str))

            day_res = classify_person_day(
                user_id=uid,
                date_str=d_str,
                today_str=today,
                user=user,
                emp_start=emp_start,
                last_employed_day=last_employed_day,
                shift=shift,
                leaves=user_leaves,
                auto_wfh=auto_wfh,
                att_rec=att,
                entries=day_entries,
                off_idx=off_idx,
                has_personal_override=has_personal_override,
                score_doc=day_score,
            )

            days_list.append(day_res)

            if not day_res["employed"]:
                continue

            # Context counts
            if day_res["scheduled"] and not day_res["is_full_leave"]:
                days_scheduled += 1
            if day_res["status"] == "absent":
                days_absent += 1
            elif day_res["status"] == "leave":
                days_leave += 1
            elif day_res["status"] in ("off", "holiday"):
                days_off += 1
            elif day_res["status"] == "missing_checkout":
                days_missing_checkout += 1

            # Scheduled complete (for secondary average)
            if day_res["scheduled"] and day_res["complete"]:
                scheduled_complete_logged += day_res["logged"]
                scheduled_complete_days += 1

            # Compare-ready
            if day_res["compare_ready"]:
                days_present += 1
                worked_sum += day_res["worked"]
                logged_sum += day_res["logged"]
                expected_sum += day_res["expected"]
                pending_ot_sum += day_res["pending_ot"]

                if day_res["logged"] > 0:
                    days_logged += 1
                else:
                    days_missing += 1

                if day_res["under_target"]:
                    days_under_target += 1
            else:
                if day_res["status"] == "live":
                    today_live_worked += day_res["worked"]
                    today_live_logged += day_res["logged"]
                else:
                    logged_outside += day_res["logged"]

            for exc in day_res.get("exceptions") or []:
                e_type = exc.get("type")
                if e_type in EXCEPTION_FLAG_TYPES:
                    user_flags_set.add(e_type)

            # Exceptions check with in-memory review state (§2.5)
            day_excs = day_res["exceptions"]
            if day_excs:
                day_score_doc = day_score or {}
                action_status = day_score_doc.get("action_status")
                if not action_status:
                    if day_score_doc.get("escalated") or day_score_doc.get("action_type") == "escalate":
                        action_status = "escalated"
                    elif day_score_doc.get("waiting_on_employee") or day_score_doc.get("action_type") in ("explain", "ask_again"):
                        action_status = "waiting_on_employee"
                    elif day_score_doc.get("action_type") in ("review", "accept") or day_score_doc.get("status") in ("reviewed", "cleared"):
                        action_status = "reviewed"
                    else:
                        action_status = "open"

                member_reason = day_score_doc.get("member_reason")
                reopen_note = day_score_doc.get("reopen_note") or ""
                signed_gap_hours = (
                    round((day_res["logged"] - day_res["worked"]) / 60.0, 2)
                    if day_res["compare_ready"]
                    else 0.0
                )

                is_reviewed = False
                if day_score and action_status in ("reviewed", "cleared"):
                    probe = {
                        "action_status": action_status,
                        "accepted_signed_gap_hours": day_score.get("accepted_signed_gap_hours"),
                    }
                    apply_accepted_gap_state(
                        probe,
                        status="green" if not day_excs else "amber",
                        exceptions=day_excs,
                        signed_gap=signed_gap_hours,
                        previous_signed_gap=day_score.get("signed_gap_hours"),
                    )
                    if probe.get("action_status") in ("reviewed", "cleared"):
                        is_reviewed = True
                        review_state = "reviewed"
                    else:
                        action_status = probe.get("action_status") or "open"
                        reopen_note = probe.get("reopen_note") or reopen_note
                        review_state = "open"
                else:
                    if action_status == "escalated" or day_score_doc.get("escalated"):
                        review_state = "escalated"
                    elif action_status == "waiting_on_employee" or day_score_doc.get("waiting_on_employee"):
                        review_state = "waiting_on_employee"
                    elif action_status == "waiting_on_reviewer":
                        review_state = "waiting_on_reviewer"
                    else:
                        review_state = "open"

                day_completed_tasks = sum(
                    1
                    for e in day_entries
                    if str(e.get("task_status") or "").strip().lower() == "completed"
                )

                for exc in day_excs:
                    e_type = exc["type"]
                    item_id = (
                        (day_score or {}).get("id")
                        or (f"missing:{uid}:{d_str}" if e_type == "no_log" else f"gap:{uid}:{d_str}")
                    )
                    user_exceptions.append({
                        "id": item_id,
                        "user_id": uid,
                        "user_name": user_name,
                        "avatar": avatar,
                        "department": dept,
                        "role": role_str,
                        "date": d_str,
                        "type": e_type,
                        "type_label": exc["type_label"],
                        "detail": exc["detail"],
                        "review_state": review_state,
                        "worked": day_res["worked"],
                        "logged": day_res["logged"],
                        "variance": day_res["variance"],
                        "expected": day_res["expected"],
                        "has_checkin": bool(day_res["check_in"]),
                        "has_checkout": bool(day_res["check_out"]),
                        "is_wfh": day_res["is_wfh"],
                        "action_status": action_status,
                        "escalated": review_state == "escalated" or bool(day_score_doc.get("escalated")),
                        "member_reason": member_reason,
                        "reopen_note": reopen_note,
                        "is_reviewed": is_reviewed,
                        "score_doc": day_score,
                        "task_count": day_completed_tasks,
                    })

        # Can viewer see/act on this person's exceptions? (§2.3, §2.5)
        can_viewer_see_exceptions = True
        if viewer_role == "team_lead":
            if uid == viewer_id or role_str not in ("team_member", "member"):
                can_viewer_see_exceptions = False
        elif viewer_role == "hr":
            if uid == viewer_id:
                can_viewer_see_exceptions = False

        open_excs_count = (
            sum(1 for it in user_exceptions if not it.get("is_reviewed"))
            if can_viewer_see_exceptions
            else 0
        )

        variance = worked_sum - logged_sum
        coverage_pct = round((logged_sum / worked_sum) * 100, 1) if worked_sum > 0 else None
        avg_logged = (
            int(round(logged_sum / days_present)) if days_present > 0 else None
        )
        avg_worked = (
            int(round(worked_sum / days_present)) if days_present > 0 else None
        )
        avg_logged_sched = (
            int(round(scheduled_complete_logged / scheduled_complete_days))
            if scheduled_complete_days > 0
            else None
        )
        submission_pct = (
            round((days_logged / days_present) * 100, 1) if days_present > 0 else None
        )
        att_vs_plan = (
            round((worked_sum / expected_sum) * 100, 1) if expected_sum > 0 else None
        )

        user_summary = {
            "days_scheduled": days_scheduled,
            "days_present": days_present,
            "days_logged": days_logged,
            "days_missing": days_missing,
            "days_under_target": days_under_target,
            "days_absent": days_absent,
            "days_leave": days_leave,
            "days_off": days_off,
            "days_missing_checkout": days_missing_checkout,
            "worked": worked_sum,
            "logged": logged_sum,
            "expected": expected_sum,
            "variance": variance,
            "pending_ot": pending_ot_sum,
            "scheduled_complete_logged": scheduled_complete_logged,
            "scheduled_complete_days": scheduled_complete_days,
            "coverage_pct": coverage_pct,
            "avg_logged_per_day": avg_logged,
            "avg_worked_per_day": avg_worked,
            "avg_logged_per_scheduled_day": avg_logged_sched,
            "submission_pct": submission_pct,
            "attendance_vs_plan_pct": att_vs_plan,
            "logged_outside": logged_outside,
            "flags": sorted(list(user_flags_set)),
            "open_exceptions": open_excs_count,
            "today_live": (
                {"worked": today_live_worked, "logged": today_live_logged}
                if today_included
                else None
            ),
            "tasks_completed": tasks_completed_by_user.get(uid, 0),
        }

        results[uid] = {
            "user": user,
            "days": days_list,
            "summary": user_summary,
            "exceptions": user_exceptions,
            "can_viewer_see_exceptions": can_viewer_see_exceptions,
            "tasks_completed": tasks_completed_by_user.get(uid, 0),
        }

    return results


async def compute_log_variance(
    current_user: Dict[str, Any],
    start_date: str,
    end_date: Optional[str] = None,
    department: Optional[str] = None,
    user_id: Optional[str] = None,
    db: Any = None,
) -> Dict[str, Any]:
    """Compute log variance for the requested scope and range."""
    if db is None:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")

    s_clean, e_clean, dates, today_included = parse_date_window(start_date, end_date)
    today = pkt_today()

    users = await get_loggers_for_viewer(
        current_user,
        db=db,
        department_filter=department,
        user_id_filter=user_id,
        for_exceptions=False,
        range_start=s_clean,
        range_end=e_clean,
    )
    if not users:
        now_iso = datetime.now(timezone.utc).isoformat()
        return {
            "range": {
                "start": s_clean,
                "end": e_clean,
                "today_included": today_included,
                "today": today,
            },
            "generated_at": now_iso,
            "summary": {
                "days_scheduled": 0,
                "days_present": 0,
                "days_logged": 0,
                "days_missing": 0,
                "days_under_target": 0,
                "days_absent": 0,
                "days_leave": 0,
                "days_off": 0,
                "days_missing_checkout": 0,
                "worked": 0,
                "logged": 0,
                "expected": 0,
                "variance": 0,
                "pending_ot": 0,
                "scheduled_complete_logged": 0,
                "scheduled_complete_days": 0,
                "coverage_pct": None,
                "avg_logged_per_day": None,
                "avg_worked_per_day": None,
                "avg_logged_per_scheduled_day": None,
                "submission_pct": None,
                "attendance_vs_plan_pct": None,
                "logged_outside": 0,
                "people": 0,
                "open_exceptions": 0,
                "today_live": {"worked": 0, "logged": 0},
                "tasks_completed": 0,
            },
            "departments": [],
            "rows": [],
            "thresholds": {
                "under_target_min": UNDER_TARGET_MIN,
                "large_variance_min": LARGE_VARIANCE_MIN,
                "over_logged_min": OVER_LOGGED_MIN,
                "late_hours": LATE_HOURS_WINDOW,
                "coverage_target_pct": int(COVERAGE_TARGET_PCT),
            },
        }

    person_data = await _compute_person_days(
        db=db,
        users=users,
        s_clean=s_clean,
        e_clean=e_clean,
        today=today,
        viewer_user=current_user,
    )

    employee_rows: List[Dict[str, Any]] = []
    for user in users:
        uid = str(user.get("id") or user.get("_id"))
        pdata = person_data.get(uid)
        if not pdata:
            continue
        cutoff = deactivation_cutoff(user)
        is_inactive = (user.get("is_active") is False) or (cutoff is not None)
        u_summary = pdata["summary"]

        employee_rows.append({
            "user_id": uid,
            "name": user.get("full_name") or user.get("name") or "Unknown",
            "avatar": user.get("avatar_url") or user.get("profile_image"),
            "department": _person_department(user),
            "role": str(user.get("role") or "team_member").lower(),
            "inactive": is_inactive,
            "joining_date": user.get("joining_date"),
            "days_scheduled": u_summary["days_scheduled"],
            "days_present": u_summary["days_present"],
            "days_logged": u_summary["days_logged"],
            "days_missing": u_summary["days_missing"],
            "days_under_target": u_summary["days_under_target"],
            "days_absent": u_summary["days_absent"],
            "days_leave": u_summary["days_leave"],
            "days_off": u_summary["days_off"],
            "days_missing_checkout": u_summary["days_missing_checkout"],
            "worked": u_summary["worked"],
            "logged": u_summary["logged"],
            "expected": u_summary["expected"],
            "variance": u_summary["variance"],
            "pending_ot": u_summary["pending_ot"],
            "scheduled_complete_logged": u_summary["scheduled_complete_logged"],
            "scheduled_complete_days": u_summary["scheduled_complete_days"],
            "coverage_pct": u_summary["coverage_pct"],
            "avg_logged_per_day": u_summary["avg_logged_per_day"],
            "avg_worked_per_day": u_summary["avg_worked_per_day"],
            "avg_logged_per_scheduled_day": u_summary["avg_logged_per_scheduled_day"],
            "submission_pct": u_summary["submission_pct"],
            "attendance_vs_plan_pct": u_summary["attendance_vs_plan_pct"],
            "logged_outside": u_summary["logged_outside"],
            "flags": u_summary["flags"],
            "open_exceptions": u_summary["open_exceptions"],
            "today_live": u_summary["today_live"],
            "tasks_completed": u_summary["tasks_completed"],
        })

    # Sort employee rows: large variance first, then name
    employee_rows.sort(
        key=lambda r: (-r["variance"] if r["variance"] is not None else 0, r["name"].lower())
    )

    # Team Totals: exact Σ over rows
    team_scheduled = sum(r["days_scheduled"] for r in employee_rows)
    team_present = sum(r["days_present"] for r in employee_rows)
    team_logged_days = sum(r["days_logged"] for r in employee_rows)
    team_missing_days = sum(r["days_missing"] for r in employee_rows)
    team_under_target = sum(r["days_under_target"] for r in employee_rows)
    team_absent = sum(r["days_absent"] for r in employee_rows)
    team_leave = sum(r["days_leave"] for r in employee_rows)
    team_off = sum(r["days_off"] for r in employee_rows)
    team_missing_checkout = sum(r["days_missing_checkout"] for r in employee_rows)

    team_worked = sum(r["worked"] for r in employee_rows)
    team_logged = sum(r["logged"] for r in employee_rows)
    team_expected = sum(r["expected"] for r in employee_rows)
    team_variance = team_worked - team_logged
    team_pending_ot = sum(r["pending_ot"] for r in employee_rows)
    team_sched_logged = sum(r["scheduled_complete_logged"] for r in employee_rows)
    team_sched_days = sum(r["scheduled_complete_days"] for r in employee_rows)

    team_coverage = (
        round((team_logged / team_worked) * 100, 1) if team_worked > 0 else None
    )
    team_avg_logged = (
        int(round(team_logged / team_present)) if team_present > 0 else None
    )
    team_avg_worked = (
        int(round(team_worked / team_present)) if team_present > 0 else None
    )
    team_avg_sched = (
        int(round(team_sched_logged / team_sched_days))
        if team_sched_days > 0
        else None
    )
    team_submission = (
        round((team_logged_days / team_present) * 100, 1) if team_present > 0 else None
    )
    team_att_vs_plan = (
        round((team_worked / team_expected) * 100, 1) if team_expected > 0 else None
    )
    team_logged_outside = sum(r["logged_outside"] for r in employee_rows)
    team_open_exceptions = sum(r["open_exceptions"] for r in employee_rows)
    team_tasks_completed = sum(r["tasks_completed"] for r in employee_rows)

    team_live_worked = sum(
        (r["today_live"]["worked"] if r.get("today_live") else 0)
        for r in employee_rows
    )
    team_live_logged = sum(
        (r["today_live"]["logged"] if r.get("today_live") else 0)
        for r in employee_rows
    )

    # Departments rollup
    dept_groups: Dict[str, List[Dict[str, Any]]] = {}
    for r in employee_rows:
        d_name = r["department"] or "General"
        dept_groups.setdefault(d_name, []).append(r)

    departments_summary: List[Dict[str, Any]] = []
    for d_name, d_rows in sorted(dept_groups.items(), key=lambda x: x[0].lower()):
        d_worked = sum(r["worked"] for r in d_rows)
        d_logged = sum(r["logged"] for r in d_rows)
        d_present = sum(r["days_present"] for r in d_rows)
        d_missing = sum(r["days_missing"] for r in d_rows)
        d_cov = round((d_logged / d_worked) * 100, 1) if d_worked > 0 else None
        d_avg = int(round(d_logged / d_present)) if d_present > 0 else None

        departments_summary.append({
            "department": d_name,
            "people": len(d_rows),
            "coverage_pct": d_cov,
            "avg_logged_per_day": d_avg,
            "days_missing": d_missing,
            "days_present": d_present,
            "worked": d_worked,
            "logged": d_logged,
        })

    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "range": {
            "start": s_clean,
            "end": e_clean,
            "today_included": today_included,
            "today": today,
        },
        "generated_at": now_iso,
        "summary": {
            "days_scheduled": team_scheduled,
            "days_present": team_present,
            "days_logged": team_logged_days,
            "days_missing": team_missing_days,
            "days_under_target": team_under_target,
            "days_absent": team_absent,
            "days_leave": team_leave,
            "days_off": team_off,
            "days_missing_checkout": team_missing_checkout,
            "worked": team_worked,
            "logged": team_logged,
            "expected": team_expected,
            "variance": team_variance,
            "pending_ot": team_pending_ot,
            "scheduled_complete_logged": team_sched_logged,
            "scheduled_complete_days": team_sched_days,
            "coverage_pct": team_coverage,
            "avg_logged_per_day": team_avg_logged,
            "avg_worked_per_day": team_avg_worked,
            "avg_logged_per_scheduled_day": team_avg_sched,
            "submission_pct": team_submission,
            "attendance_vs_plan_pct": team_att_vs_plan,
            "logged_outside": team_logged_outside,
            "people": len(employee_rows),
            "open_exceptions": team_open_exceptions,
            "today_live": {"worked": team_live_worked, "logged": team_live_logged},
            "tasks_completed": team_tasks_completed,
        },
        "departments": departments_summary,
        "rows": employee_rows,
        "thresholds": {
            "under_target_min": UNDER_TARGET_MIN,
            "large_variance_min": LARGE_VARIANCE_MIN,
            "over_logged_min": OVER_LOGGED_MIN,
            "late_hours": LATE_HOURS_WINDOW,
            "coverage_target_pct": int(COVERAGE_TARGET_PCT),
        },
    }


async def get_employee_variance(
    current_user: Dict[str, Any],
    target_user_id: str,
    start_date: str,
    end_date: Optional[str] = None,
    db: Any = None,
) -> Dict[str, Any]:
    """Employee breakdown endpoint for drawer drilldown."""
    if db is None:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")

    s_clean, e_clean, dates, today_included = parse_date_window(start_date, end_date)
    today = pkt_today()

    users = await get_loggers_for_viewer(
        current_user,
        db=db,
        user_id_filter=target_user_id,
        range_start=s_clean,
        range_end=e_clean,
    )
    if not users:
        existing = await company_member_user(target_user_id, db=db, include_inactive=True)
        if existing:
            raise HTTPException(status_code=403, detail="Employee is outside your department scope")
        raise HTTPException(status_code=404, detail="Employee not found")

    target_user = users[0]
    uid = str(target_user.get("id") or target_user.get("_id"))
    cutoff = deactivation_cutoff(target_user)
    is_inactive = (target_user.get("is_active") is False) or (cutoff is not None)

    person_data = await _compute_person_days(
        db=db,
        users=[target_user],
        s_clean=s_clean,
        e_clean=e_clean,
        today=today,
        viewer_user=current_user,
    )
    pdata = person_data[uid]

    return {
        "user": {
            "user_id": uid,
            "name": target_user.get("full_name") or target_user.get("name") or "Unknown",
            "avatar": target_user.get("avatar_url") or target_user.get("profile_image"),
            "department": _person_department(target_user),
            "role": str(target_user.get("role") or "team_member").lower(),
            "email": target_user.get("email"),
            "inactive": is_inactive,
            "joining_date": target_user.get("joining_date"),
            "deactivation_date": cutoff,
        },
        "summary": pdata["summary"],
        "days": pdata["days"],
        "range": {
            "start": s_clean,
            "end": e_clean,
            "today_included": today_included,
            "today": today,
        },
    }


async def get_exceptions(
    current_user: Dict[str, Any],
    start_date: str,
    end_date: Optional[str] = None,
    department: Optional[str] = None,
    exception_type: Optional[str] = None,
    group_by: str = "employee",
    include_reviewed: bool = False,
    db: Any = None,
) -> Dict[str, Any]:
    """Exceptions endpoint grouped by employee or day."""
    if db is None:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")

    s_clean, e_clean, dates, today_included = parse_date_window(start_date, end_date)
    today = pkt_today()

    users = await get_loggers_for_viewer(
        current_user,
        db=db,
        department_filter=department,
        for_exceptions=True,
        range_start=s_clean,
        range_end=e_clean,
    )
    if not users:
        return {
            "groups": [],
            "totals_by_type": {
                "all": 0,
                "no_log": 0,
                "over_logged": 0,
                "missing_checkout": 0,
                "large_variance": 0,
                "logged_on_leave_or_off": 0,
                "logged_without_attendance": 0,
                "logged_late": 0,
            },
            "reviewed_count": 0,
            "range": {
                "start": s_clean,
                "end": e_clean,
                "today_included": today_included,
                "today": today,
            },
        }

    person_data = await _compute_person_days(
        db=db,
        users=users,
        s_clean=s_clean,
        e_clean=e_clean,
        today=today,
        viewer_user=current_user,
    )

    all_exception_items: List[Dict[str, Any]] = []
    reviewed_count = 0
    type_counts = {
        "all": 0,
        "no_log": 0,
        "over_logged": 0,
        "missing_checkout": 0,
        "large_variance": 0,
        "logged_on_leave_or_off": 0,
        "logged_without_attendance": 0,
        "logged_late": 0,
    }

    users_map = {str(u.get("id") or u.get("_id")): u for u in users}

    for uid, pdata in person_data.items():
        if not pdata.get("can_viewer_see_exceptions", True):
            continue
        for it in pdata["exceptions"]:
            is_rev = it.get("is_reviewed", False)
            if is_rev:
                reviewed_count += 1
                if not include_reviewed:
                    continue
            else:
                e_type = it["type"]
                type_counts["all"] += 1
                if e_type in type_counts:
                    type_counts[e_type] += 1

            if exception_type and exception_type != "all" and it["type"] != exception_type:
                continue

            all_exception_items.append(it)

    # Grouping
    groups: List[Dict[str, Any]] = []

    if group_by == "day":
        by_day: Dict[str, List[Dict[str, Any]]] = {}
        for it in all_exception_items:
            by_day.setdefault(it["date"], []).append(it)

        for d_key in sorted(by_day.keys(), reverse=True):
            items_day = by_day[d_key]
            items_day.sort(key=lambda x: x["user_name"].lower())
            parsed_d = parse_iso_date(d_key)
            label = parsed_d.strftime("%a %d %b %Y") if parsed_d else d_key
            groups.append({
                "key": d_key,
                "label": label,
                "count": len(items_day),
                "flags": [],
                "items": items_day,
            })
    else:
        by_user: Dict[str, List[Dict[str, Any]]] = {}
        for it in all_exception_items:
            by_user.setdefault(it["user_id"], []).append(it)

        for u_id, items_user in by_user.items():
            items_user.sort(key=lambda x: x["date"], reverse=True)
            u_doc = users_map.get(u_id, {})
            u_name = u_doc.get("full_name") or u_doc.get("name") or "User"
            dept = _person_department(u_doc)
            role_str = str(u_doc.get("role") or "team_member").lower()
            avatar = u_doc.get("avatar_url") or u_doc.get("profile_image")

            counts_per_type: Dict[str, int] = {}
            for it in items_user:
                counts_per_type[it["type_label"]] = counts_per_type.get(it["type_label"], 0) + 1

            flags = [
                f"{lbl} ×{cnt}" if cnt > 1 else lbl
                for lbl, cnt in counts_per_type.items()
            ]

            groups.append({
                "key": u_id,
                "label": u_name,
                "user_id": u_id,
                "avatar": avatar,
                "department": dept,
                "role": role_str,
                "count": len(items_user),
                "flags": flags,
                "items": items_user,
            })

        groups.sort(key=lambda g: (-g["count"], g["label"].lower()))

    return {
        "groups": groups,
        "totals_by_type": type_counts,
        "reviewed_count": reviewed_count,
        "range": {
            "start": s_clean,
            "end": e_clean,
            "today_included": today_included,
            "today": today,
        },
    }
