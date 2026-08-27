"""
Daily log compliance: overlap/duplicate checks, expected hours from attendance
shifts, and GREEN/AMBER/RED day scores.

Pure helpers are unit-testable without Mongo. Async functions talk to the DB.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.database import get_database
from app.models.user import UserRole

SYSTEM_START_DATE = "2026-08-19"

logger = logging.getLogger(__name__)

PKT = timezone(timedelta(hours=5))
LOGGERS_ROLES = {UserRole.TEAM_MEMBER.value, UserRole.TEAM_LEAD.value, UserRole.HR.value, "team_member", "team_lead", "hr"}
EXEMPT_ROLES = {UserRole.ADMIN.value, UserRole.OPERATIONS.value, UserRole.CLIENT.value, "admin", "operations", "client"}
FULL_DAY_LEAVE_TYPES = {"sick", "casual", "annual", "unpaid", "sick_leave", "casual_leave", "annual_leave", "unpaid_leave"}
ATTENDANCE_FULL_LEAVE_STATUSES = {
    "on_leave",
    "sick_leave",
    "casual_leave",
    "annual_leave",
    "unpaid_leave",
}
NEAR_ZERO_MAX = 2.0
SMALL_GAP_HOURS = 0.25  # 15 minutes — warn, do not treat as overlap-level block


def pkt_today() -> str:
    return datetime.now(PKT).strftime("%Y-%m-%d")


def attendance_is_full_leave(rec: Optional[Dict[str, Any]]) -> bool:
    if not rec:
        return False
    return str(rec.get("status") or "").lower() in ATTENDANCE_FULL_LEAVE_STATUSES


def person_day_is_leave(target: Optional[Dict[str, Any]], att: Optional[Dict[str, Any]]) -> bool:
    if target and target.get("is_full_leave"):
        return True
    return attendance_is_full_leave(att)


def person_day_is_due(
    date_str: str,
    today: str,
    target: Optional[Dict[str, Any]],
    att: Optional[Dict[str, Any]],
) -> bool:
    """A log is required only after the workday is real — not on leave, not before check-out."""
    if person_day_is_leave(target, att):
        return False
    rec = att or {}
    has_checkout = rec.get("has_checkout")
    if has_checkout is None:
        has_checkout = bool(rec.get("check_out") or rec.get("punch_out"))
    try:
        worked = float(rec.get("work_hours") or 0)
    except (TypeError, ValueError):
        worked = 0.0
    if has_checkout or worked > 0:
        return True
    return bool(date_str) and date_str < today


def signed_hours_gap(logged_hours: float, worked_hours: float) -> float:
    """Positive = over-logged, negative = under-logged."""
    return round(float(logged_hours or 0) - float(worked_hours or 0), 2)


def format_signed_gap_label(hours: float) -> str:
    total = abs(int(round(float(hours or 0) * 60)))
    sign = "+" if float(hours or 0) >= 0 else "-"
    return f"{sign}{total // 60}:{total % 60:02d}"


def should_reopen_reviewed_gap(
    accepted_signed_gap_hours: Optional[float],
    current_signed_gap_hours: float,
    has_exception: bool,
    tolerance_hours: float = SMALL_GAP_HOURS,
) -> bool:
    """True when a later edit made the hours gap worse than what HR/lead accepted."""
    if not has_exception:
        return False
    if accepted_signed_gap_hours is None:
        return False
    current = float(current_signed_gap_hours or 0)
    accepted = float(accepted_signed_gap_hours)
    same_direction = (accepted >= 0 and current >= 0) or (accepted < 0 and current < 0)
    if same_direction:
        return abs(current) > abs(accepted) + float(tolerance_hours)
    return abs(current) > float(tolerance_hours)


def apply_accepted_gap_state(
    score: Dict[str, Any],
    *,
    status: str,
    exceptions: List[Dict[str, Any]],
    signed_gap: float,
    previous_signed_gap: Optional[float] = None,
) -> Dict[str, Any]:
    """Keep a reviewed day closed unless the gap grew past the accepted amount."""
    action = str(score.get("action_status") or "open")
    if status == "green" and not exceptions:
        if action in ("open", "waiting_on_employee", "waiting_on_reviewer", "escalated"):
            score["action_status"] = "cleared"
        return score

    accepted = score.get("accepted_signed_gap_hours")
    if action in ("reviewed", "cleared") and accepted is None:
        # Lock the gap from before this edit, not the newly computed one.
        fallback = previous_signed_gap if previous_signed_gap is not None else signed_gap
        score["accepted_signed_gap_hours"] = round(float(fallback or 0), 2)
        accepted = score["accepted_signed_gap_hours"]

    if action in ("reviewed", "cleared") and should_reopen_reviewed_gap(
        accepted,
        signed_gap,
        bool(exceptions),
    ):
        score["previously_accepted_signed_gap_hours"] = accepted
        score["accepted_signed_gap_hours"] = None
        score["action_status"] = "open"
        score["employee_notified"] = False
        score["escalated"] = False
        score["gap_reopened_at"] = datetime.now(timezone.utc).isoformat()
        prior = format_signed_gap_label(float(accepted or 0))
        score["reopen_note"] = f"Gap grew after a previous {prior} acceptance"
    return score


def time_to_minutes(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    parts = raw.split(":")
    if len(parts) != 2:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
    except ValueError:
        return None
    if minutes < 0 or minutes >= 60 or hours < 0:
        return None
    return hours * 60 + minutes


def minutes_to_hours(minutes: int) -> float:
    return round(minutes / 60.0, 2)


def hours_from_start_end(start: Optional[str], end: Optional[str]) -> Optional[float]:
    start_m = time_to_minutes(start)
    end_m = time_to_minutes(end)
    if start_m is None or end_m is None:
        return None
    if end_m <= start_m:
        end_m += 24 * 60
    return minutes_to_hours(end_m - start_m)


def ranges_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    """True when open intervals overlap. Adjacent blocks (11:00-12:00 and 12:00-13:00) do not overlap."""
    if a_end <= a_start:
        a_end += 24 * 60
    if b_end <= b_start:
        b_end += 24 * 60
    return a_start < b_end and b_start < a_end


def find_overlapping_pairs(entries: List[Dict[str, Any]], exclude_id: Optional[str] = None) -> List[Tuple[str, str]]:
    timed: List[Tuple[str, int, int]] = []
    for entry in entries:
        eid = str(entry.get("id") or "")
        if exclude_id and eid == str(exclude_id):
            continue
        start_m = time_to_minutes(entry.get("start_time"))
        end_m = time_to_minutes(entry.get("end_time"))
        if start_m is None or end_m is None or not eid:
            continue
        timed.append((eid, start_m, end_m))

    overlaps: List[Tuple[str, str]] = []
    for i, (id_a, a_s, a_e) in enumerate(timed):
        for id_b, b_s, b_e in timed[i + 1 :]:
            if ranges_overlap(a_s, a_e, b_s, b_e):
                overlaps.append((id_a, id_b))
    return overlaps


def find_duplicate_ids(
    entries: List[Dict[str, Any]],
    candidate: Dict[str, Any],
    exclude_id: Optional[str] = None,
) -> List[str]:
    task = (candidate.get("task_description") or "").strip().lower()
    date = candidate.get("date")
    try:
        hours = round(float(candidate.get("hours_utilized") or 0), 2)
    except (TypeError, ValueError):
        hours = 0.0
    if not task or not date:
        return []

    hits: List[str] = []
    for entry in entries:
        eid = str(entry.get("id") or "")
        if exclude_id and eid == str(exclude_id):
            continue
        if entry.get("date") != date:
            continue
        other_task = (entry.get("task_description") or "").strip().lower()
        try:
            other_hours = round(float(entry.get("hours_utilized") or 0), 2)
        except (TypeError, ValueError):
            other_hours = 0.0
        if other_task == task and other_hours == hours:
            hits.append(eid)
    return hits


def classify_day_status(
    logged_hours: float,
    worked_hours: float,
    *,
    is_full_leave: bool = False,
    has_checkout: bool = False,
    has_checkin: bool = False,
    has_log: bool = False,
    is_wfh: bool = False,
    compare_ready: bool = False,
    has_overlap: bool = False,
    has_duplicate: bool = False,
    variance_reason: Optional[str] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Compare logged task hours to attendance time-in/time-out (work_hours).
    No hours-mismatch until check-out, except WFH without a punch uses shift hours.
    """
    exceptions: List[Dict[str, Any]] = []
    _ = variance_reason
    _ = has_duplicate
    _ = has_overlap

    if is_full_leave:
        return "green", exceptions

    if has_log and not has_checkin and not is_wfh:
        exceptions.append({
            "type": "logged_without_attendance",
            "hours": logged_hours,
            "severity": "medium",
            "message": f"Logged {logged_hours}h with no time in/out",
            "required_action": "review",
        })
        return "amber", exceptions

    if not compare_ready:
        return "green", exceptions

    baseline = float(worked_hours or 0)
    delta = round(logged_hours - baseline, 2)

    if baseline > NEAR_ZERO_MAX and logged_hours <= NEAR_ZERO_MAX:
        exceptions.append({
            "type": "near_zero",
            "hours": round(baseline - logged_hours, 2),
            "severity": "high",
            "message": f"{logged_hours}h logged vs {baseline}h at work",
            "required_action": "explain",
        })
    elif abs(delta) > SMALL_GAP_HOURS:
        if delta < 0:
            exceptions.append({
                "type": "hours_mismatch",
                "hours": round(-delta, 2),
                "severity": "medium",
                "message": f"{logged_hours}h logged / {baseline}h at work",
                "required_action": "explain",
            })
        else:
            exceptions.append({
                "type": "hours_mismatch",
                "hours": delta,
                "severity": "medium",
                "message": f"{logged_hours}h logged / {baseline}h at work",
                "required_action": "explain",
            })

    if any(e["severity"] == "high" for e in exceptions):
        return "red", exceptions
    if exceptions:
        return "amber", exceptions
    return "green", exceptions


def recent_workdays(days: int = 7) -> List[str]:
    from app.routers.daily_log import is_workday

    workdays: List[str] = []
    current = datetime.now(PKT).date()
    try:
        start = datetime.strptime(SYSTEM_START_DATE, "%Y-%m-%d").date()
    except Exception:
        start = current
    while len(workdays) < days and current >= start:
        if is_workday(current):
            workdays.append(current.isoformat())
        current -= timedelta(days=1)
    return workdays


async def get_expected_log_hours(
    user_id: str,
    date_str: str,
    department: Optional[str] = None,
) -> Dict[str, Any]:
    """Expected hours for a person on a date, using attendance shifts and approved leave."""
    from app.services.attendance_service import get_shift_for_user, is_wfh_approved_for_date

    db = get_database()
    is_full_leave = False
    short_leave_hours = 0.0
    is_wfh = False

    if db is not None:
        leave_cursor = db.leave_requests.find(
            {
                "user_id": user_id,
                "status": {"$in": ["approved", "Approved"]},
                "$or": [
                    {"start_date": date_str, "end_date": {"$in": [None, "", date_str]}},
                    {"start_date": {"$lte": date_str}, "end_date": {"$gte": date_str}},
                    {"start_date": date_str},
                ],
            },
            {"_id": 0},
        )
        leaves = await leave_cursor.to_list(20)
        for leave in leaves:
            ltype = str(leave.get("leave_type") or "").lower()
            if ltype in FULL_DAY_LEAVE_TYPES:
                is_full_leave = True
            elif ltype in ("short_leave",):
                try:
                    short_leave_hours += float(leave.get("short_leave_hours") or leave.get("short_leave_duration_hours") or 0)
                except (TypeError, ValueError):
                    pass

        try:
            is_wfh = await is_wfh_approved_for_date(user_id, date_str)
        except Exception:
            is_wfh = False

    shift = await get_shift_for_user(user_id, department, date_str)
    expected = 0.0 if is_full_leave else float(getattr(shift, "expected_hours", 8.0) or 8.0)
    if not is_full_leave and short_leave_hours > 0:
        expected = max(0.0, round(expected - short_leave_hours, 2))

    return {
        "expected_hours": expected,
        "shift_name": getattr(shift, "name", "Standard Shift"),
        "shift_start": getattr(shift, "start_time", "09:30"),
        "shift_end": getattr(shift, "end_time", "18:30"),
        "break_duration_minutes": int(getattr(shift, "break_duration_minutes", 60) or 0),
        "is_full_leave": is_full_leave,
        "is_wfh": is_wfh,
        "short_leave_hours": short_leave_hours,
    }


async def get_attendance_worked(user_id: str, date_str: str) -> Dict[str, Any]:
    db = get_database()
    empty = {
        "has_checkin": False,
        "has_checkout": False,
        "work_hours": 0.0,
        "is_wfh": False,
        "status": "",
        "check_in": None,
        "check_out": None,
    }
    if db is None:
        return empty
    rec = await db.attendance_records.find_one({"user_id": user_id, "date": date_str}, {"_id": 0})
    if not rec:
        return empty
    cin = rec.get("check_in") or rec.get("punch_in")
    cout = rec.get("check_out") or rec.get("punch_out")
    try:
        hours = float(rec.get("work_hours") or 0)
    except (TypeError, ValueError):
        hours = 0.0
    return {
        "has_checkin": bool(cin),
        "has_checkout": bool(cout),
        "work_hours": round(hours, 2),
        "is_wfh": bool(rec.get("is_wfh")),
        "status": str(rec.get("status") or ""),
        "check_in": cin,
        "check_out": cout,
    }


_HARD_FALLBACK_SHIFT = {
    "id": "shift_standard",
    "name": "Standard Shift",
    "start_time": "09:30",
    "end_time": "18:30",
    "break_duration_minutes": 60,
    "expected_hours": 8.0,
}


def _leave_covers_date(leave: Dict[str, Any], date_str: str) -> bool:
    start = str(leave.get("start_date") or "")
    end = str(leave.get("end_date") or "").strip()
    if not start:
        return False
    if start > date_str:
        return False
    if not end:
        return start == date_str or start <= date_str
    return end >= date_str


def _target_from_shift_and_leaves(
    shift: Dict[str, Any],
    leaves: List[Dict[str, Any]],
    date_str: str,
    auto_wfh: bool = False,
) -> Dict[str, Any]:
    is_full_leave = False
    short_leave_hours = 0.0
    is_wfh = bool(auto_wfh)
    for leave in leaves:
        if not _leave_covers_date(leave, date_str):
            continue
        ltype = str(leave.get("leave_type") or "").lower()
        if ltype in FULL_DAY_LEAVE_TYPES:
            is_full_leave = True
        elif ltype in ("short_leave",):
            try:
                short_leave_hours += float(leave.get("short_leave_hours") or leave.get("short_leave_duration_hours") or 0)
            except (TypeError, ValueError):
                pass
        elif ltype in ("wfh",):
            is_wfh = True

    expected = 0.0 if is_full_leave else float(shift.get("expected_hours") or 8.0)
    if not is_full_leave and short_leave_hours > 0:
        expected = max(0.0, round(expected - short_leave_hours, 2))
    return {
        "expected_hours": expected,
        "shift_name": shift.get("name") or "Standard Shift",
        "shift_start": shift.get("start_time") or "09:30",
        "shift_end": shift.get("end_time") or "18:30",
        "break_duration_minutes": int(shift.get("break_duration_minutes") or 60),
        "is_full_leave": is_full_leave,
        "is_wfh": is_wfh,
        "short_leave_hours": short_leave_hours,
    }


async def load_shift_lookup() -> Tuple[Dict[str, dict], Dict[str, dict], dict, dict]:
    """One-shot assignment + shift maps for many users. Reads only — does not seed or backfill."""
    from app.services.attendance_service import resolve_fallback_shifts

    db = get_database()
    assign_map: Dict[str, dict] = {}
    shift_map: Dict[str, dict] = {}
    std = dict(_HARD_FALLBACK_SHIFT)
    hr = dict(_HARD_FALLBACK_SHIFT)
    if db is not None:
        assignments = await db.user_shift_assignments.find({}, {"_id": 0}).to_list(2000)
        assign_map = {a["user_id"]: a for a in assignments if a.get("user_id")}
        shifts = await db.shifts.find({"is_active": True}, {"_id": 0}).to_list(200)
        shift_map = {s["id"]: s for s in shifts if s.get("id")}
        std_doc, hr_doc = resolve_fallback_shifts(shifts)
        if std_doc:
            std = std_doc
        if hr_doc:
            hr = hr_doc
    return assign_map, shift_map, std, hr


def shift_doc_for_user(
    user_id: str,
    department: Optional[str],
    assign_map: Dict[str, dict],
    shift_map: Dict[str, dict],
    std: dict,
    hr: dict,
    date_str: Optional[str] = None,
) -> dict:
    from app.services.shift_assignment import resolve_shift_assignment_for_date

    assignment = assign_map.get(user_id)
    if date_str:
        sid = resolve_shift_assignment_for_date(assignment, date_str).get("shift_id")
    else:
        sid = assignment.get("shift_id") if assignment else None
    if sid and shift_map.get(sid):
        return shift_map[sid]
    if department and str(department).strip().upper() == "HR":
        return hr
    return std


def resolved_auto_wfh(assign_map: Dict[str, dict], user_id: str, date_str: str) -> bool:
    from app.services.shift_assignment import resolve_shift_assignment_for_date

    return bool(resolve_shift_assignment_for_date(assign_map.get(user_id), date_str).get("auto_wfh"))


async def batch_expected_targets(users: List[Dict[str, Any]], dates: List[str]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """expected hours for many users × dates in a handful of Mongo queries."""
    db = get_database()
    result: Dict[Tuple[str, str], Dict[str, Any]] = {}
    if not users or not dates:
        return result

    user_ids = [u.get("id") for u in users if u.get("id")]
    assign_map, shift_map, std, hr = await load_shift_lookup()

    leaves_by_user: Dict[str, List[dict]] = {uid: [] for uid in user_ids}
    if db is not None and user_ids:
        newest = max(dates)
        oldest = min(dates)
        leaves = await db.leave_requests.find(
            {
                "user_id": {"$in": user_ids},
                "status": {"$in": ["approved", "Approved"]},
                "start_date": {"$lte": newest},
            },
            {"_id": 0},
        ).to_list(4000)
        for leave in leaves:
            uid = leave.get("user_id")
            if uid not in leaves_by_user:
                continue
            end = str(leave.get("end_date") or "").strip()
            if end and end < oldest:
                continue
            leaves_by_user[uid].append(leave)

    for user in users:
        uid = user.get("id")
        if not uid:
            continue
        for date_str in dates:
            shift = shift_doc_for_user(
                uid, user.get("department"), assign_map, shift_map, std, hr, date_str
            )
            result[(uid, date_str)] = _target_from_shift_and_leaves(
                shift,
                leaves_by_user.get(uid) or [],
                date_str,
                auto_wfh=resolved_auto_wfh(assign_map, uid, date_str),
            )
    return result


async def load_user_day_entries(user_id: str, date_str: str) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        return []
    cursor = db.daily_log_entries.find(
        {"user_id": user_id, "date": date_str},
        {"_id": 0},
    )
    return await cursor.to_list(200)


def assert_no_overlap_or_duplicate(
    existing: List[Dict[str, Any]],
    candidate: Dict[str, Any],
    exclude_id: Optional[str] = None,
) -> None:
    from fastapi import HTTPException, status

    overlaps = find_overlapping_pairs(
        existing + ([candidate] if candidate.get("start_time") and candidate.get("end_time") else []),
        exclude_id=exclude_id,
    )
    # If candidate is already in existing (update), find_overlapping_pairs on existing+candidate
    # can double-count. Prefer checking candidate against others only.
    cand_start = time_to_minutes(candidate.get("start_time"))
    cand_end = time_to_minutes(candidate.get("end_time"))
    if cand_start is not None and cand_end is not None:
        for entry in existing:
            eid = str(entry.get("id") or "")
            if exclude_id and eid == str(exclude_id):
                continue
            other_s = time_to_minutes(entry.get("start_time"))
            other_e = time_to_minutes(entry.get("end_time"))
            if other_s is None or other_e is None:
                continue
            if ranges_overlap(cand_start, cand_end, other_s, other_e):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This time overlaps another entry on the same day. Adjust start/end before saving.",
                )

    dups = find_duplicate_ids(existing, candidate, exclude_id=exclude_id)
    _ = dups
    _ = overlaps


async def live_day_hours(user_id: str, date_str: str) -> Dict[str, Any]:
    """Current logged vs at-work hours for a person-day, without writing a score."""
    entries = await load_user_day_entries(user_id, date_str)
    logged = 0.0
    task_count = 0
    for entry in entries:
        try:
            logged += float(entry.get("hours_utilized") or 0)
        except (TypeError, ValueError):
            pass
        task_count += 1
    logged = round(logged, 2)
    punch = await get_attendance_worked(user_id, date_str)
    has_checkin = bool(punch.get("has_checkin"))
    has_checkout = bool(punch.get("has_checkout"))
    try:
        worked = float(punch.get("work_hours") or 0)
    except (TypeError, ValueError):
        worked = 0.0
    compare_ready = has_checkout or worked > 0
    signed = signed_hours_gap(logged, worked) if compare_ready else 0.0
    return {
        "logged_hours": logged,
        "worked_hours": round(worked, 2),
        "signed_gap_hours": signed,
        "gap_hours": abs(signed) if compare_ready else 0.0,
        "has_checkin": has_checkin,
        "has_checkout": has_checkout,
        "compare_ready": compare_ready,
        "has_log": len(entries) > 0,
        "task_count": task_count,
        "is_missing_log": compare_ready and len(entries) == 0,
    }


async def recompute_day_score(
    user_id: str,
    date_str: str,
    *,
    variance_reason: Optional[str] = None,
    actor: Optional[dict] = None,
) -> Optional[dict]:
    db = get_database()
    if db is None:
        return None

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user:
        return None

    role = str(user.get("role") or "team_member").lower()
    if role in EXEMPT_ROLES:
        return None

    entries = await load_user_day_entries(user_id, date_str)
    logged = 0.0
    tasks_completed = 0
    rework_hours = 0.0
    estimate_actual = 0.0
    estimate_planned = 0.0
    for entry in entries:
        try:
            logged += float(entry.get("hours_utilized") or 0)
        except (TypeError, ValueError):
            pass
        if str(entry.get("task_status") or "") == "Completed":
            tasks_completed += 1
        revisions = (entry.get("revisions_done") or "").strip()
        if revisions:
            try:
                rework_hours += float(entry.get("hours_utilized") or 0) * 0.25
            except (TypeError, ValueError):
                pass
        est = entry.get("estimated_hours")
        if est is not None and est != "":
            try:
                estimate_planned += float(est)
                estimate_actual += float(entry.get("hours_utilized") or 0)
            except (TypeError, ValueError):
                pass

    logged = round(logged, 2)
    target = await get_expected_log_hours(user_id, date_str, user.get("department"))
    punch = await get_attendance_worked(user_id, date_str)
    is_wfh = bool(target.get("is_wfh") or punch.get("is_wfh"))
    has_checkout = bool(punch.get("has_checkout"))
    has_checkin = bool(punch.get("has_checkin"))
    has_log = logged > 0 or len(entries) > 0
    is_full_leave = person_day_is_leave(target, punch)

    if has_checkout:
        worked = float(punch.get("work_hours") or 0)
        compare_ready = True
    elif is_wfh and not has_checkin:
        worked = float(target.get("expected_hours") or 0)
        compare_ready = True
    else:
        worked = float(punch.get("work_hours") or 0)
        compare_ready = False

    status, exceptions = classify_day_status(
        logged,
        worked,
        is_full_leave=is_full_leave,
        has_checkout=has_checkout,
        has_checkin=has_checkin,
        has_log=has_log,
        is_wfh=is_wfh,
        compare_ready=compare_ready,
    )

    gap = round(max(0.0, worked - logged), 2) if compare_ready else 0.0
    signed_gap = signed_hours_gap(logged, worked) if compare_ready else 0.0
    now_iso = datetime.now(timezone.utc).isoformat()
    existing_score = await db.daily_log_day_scores.find_one(
        {"user_id": user_id, "date": date_str},
        {"_id": 0},
    )
    score = {
        "id": (existing_score or {}).get("id") or f"dls-{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "date": date_str,
        "full_name": user.get("full_name") or user.get("name") or "User",
        "email": user.get("email"),
        "department": user.get("department") or "",
        "role": role,
        "expected_hours": float(target["expected_hours"]),
        "worked_hours": worked,
        "logged_hours": logged,
        "gap_hours": gap,
        "signed_gap_hours": signed_gap,
        "status": status,
        "exceptions": exceptions,
        "has_checkin": has_checkin,
        "has_checkout": has_checkout,
        "compare_ready": compare_ready,
        "tasks_completed": tasks_completed,
        "rework_hours": round(rework_hours, 2),
        "estimate_planned": round(estimate_planned, 2),
        "estimate_actual": round(estimate_actual, 2),
        "is_full_leave": is_full_leave,
        "is_wfh": is_wfh,
        "action_status": (existing_score or {}).get("action_status") or "open",
        "action_type": (existing_score or {}).get("action_type"),
        "action_by": (existing_score or {}).get("action_by"),
        "action_by_name": (existing_score or {}).get("action_by_name"),
        "action_by_role": (existing_score or {}).get("action_by_role"),
        "action_at": (existing_score or {}).get("action_at"),
        "escalated": bool((existing_score or {}).get("escalated")),
        "employee_notified": bool((existing_score or {}).get("employee_notified")),
        "member_reason": (existing_score or {}).get("member_reason") or "",
        "member_reason_at": (existing_score or {}).get("member_reason_at"),
        "accepted_signed_gap_hours": (existing_score or {}).get("accepted_signed_gap_hours"),
        "previously_accepted_signed_gap_hours": (existing_score or {}).get("previously_accepted_signed_gap_hours"),
        "reopen_note": (existing_score or {}).get("reopen_note") or "",
        "gap_reopened_at": (existing_score or {}).get("gap_reopened_at"),
        "updated_at": now_iso,
        "created_at": (existing_score or {}).get("created_at") or now_iso,
    }

    apply_accepted_gap_state(
        score,
        status=status,
        exceptions=exceptions,
        signed_gap=signed_gap,
        previous_signed_gap=(existing_score or {}).get("signed_gap_hours"),
    )

    await db.daily_log_day_scores.update_one(
        {"user_id": user_id, "date": date_str},
        {"$set": score},
        upsert=True,
    )
    return score


def primary_exception(score: dict) -> Dict[str, Any]:
    exceptions = score.get("exceptions") or []
    if exceptions:
        return exceptions[0]
    if score.get("status") in ("amber", "red"):
        return {
            "type": "review",
            "hours": score.get("gap_hours") or 0,
            "severity": "medium",
            "message": "Needs review",
            "required_action": "review",
        }
    return {
        "type": "missing_log",
        "hours": score.get("expected_hours") or 0,
        "severity": "medium",
        "message": "Daily log not submitted",
        "required_action": "correct",
    }


def calculate_48_working_hours_window(
    target_date_str: str,
    shift_start_time: str,
    off_day_index: Any = None,
    now_dt: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Computes the submission window for a given date and shift start time under the 48 working-hours rule:
    1. Window Open = datetime(target_date, shift_start_time, tz=PKT).
       Logs cannot be entered before Window Open.
    2. Window Close = Advances 2 full working days (48 working hours) from target_date,
       skipping Sundays, 1st Saturdays off, and registered Public Holidays.
    """
    from app.services.workdays import parse_iso_date, weekday_is_workday

    now = now_dt or datetime.now(PKT)
    if now.tzinfo is None:
        now = now.replace(tzinfo=PKT)

    target_d = parse_iso_date(target_date_str)
    if target_d is None:
        return {
            "is_valid": False,
            "is_open": False,
            "is_expired": True,
            "error": f"Invalid date: {target_date_str}",
            "window_start": None,
            "window_end": None,
        }

    # Parse shift start time (e.g., "09:30", "14:00", "21:00")
    start_hour, start_min = 9, 30
    if shift_start_time and ":" in str(shift_start_time):
        parts = str(shift_start_time).strip().split(":")
        try:
            start_hour, start_min = int(parts[0]), int(parts[1])
        except (ValueError, TypeError):
            start_hour, start_min = 9, 30

    window_start = datetime(
        target_d.year, target_d.month, target_d.day,
        start_hour, start_min, tzinfo=PKT
    )

    # Check if target date itself is an off-day (Sundays, 1st Sat, Holidays cannot have daily logs)
    if off_day_index and not off_day_index.is_workday(target_d):
        off_info = off_day_index.classify(target_d)
        return {
            "is_valid": False,
            "is_open": False,
            "is_expired": True,
            "is_off_day": True,
            "off_day_label": off_info.label,
            "error": f"Daily logs cannot be submitted on {off_info.label} ({target_date_str}).",
            "window_start": window_start.isoformat(),
            "window_end": None,
        }

    # Advance 2 full working days (48 working hours):
    working_days_counted = 0
    curr_d = target_d + timedelta(days=1)
    
    # Step forward day by day until we count 2 working days
    for _ in range(14):
        is_work = off_day_index.is_workday(curr_d) if off_day_index else weekday_is_workday(curr_d)
        if is_work:
            working_days_counted += 1
            if working_days_counted == 2:
                break
        curr_d += timedelta(days=1)

    window_end = datetime(
        curr_d.year, curr_d.month, curr_d.day,
        start_hour, start_min, tzinfo=PKT
    )

    is_open = window_start <= now <= window_end
    is_not_started = now < window_start
    is_expired = now > window_end

    error_msg = None
    if is_not_started:
        error_msg = (
            f"Daily logs for {target_date_str} cannot be entered before your shift starts at "
            f"{shift_start_time} PKT."
        )
    elif is_expired:
        end_display = window_end.strftime("%A, %d %b at %I:%M %p")
        error_msg = (
            f"The 48 working-hour submission window for {target_date_str} expired on {end_display}."
        )

    return {
        "is_valid": True,
        "is_open": is_open,
        "is_not_started": is_not_started,
        "is_expired": is_expired,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "window_end_formatted": window_end.strftime("%A, %d %b at %I:%M %p"),
        "error": error_msg,
    }


async def compute_log_submission_window(
    user_id: str,
    target_date_str: str,
    now_dt: Optional[datetime] = None,
    user_dept: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Resolves shift and calendar off-days for user on target_date_str,
    returning the window open / close status.
    """
    from app.services import attendance_service
    from app.services.workdays import load_off_day_index, parse_iso_date

    target_d = parse_iso_date(target_date_str)
    if not target_d:
        return {
            "is_valid": False,
            "is_open": False,
            "is_expired": True,
            "error": f"Invalid date: {target_date_str}",
        }

    shift = await attendance_service.get_shift_for_user(user_id, user_dept, target_date_str)
    shift_start_time = shift.start_time if shift else "09:30"

    off_index = await load_off_day_index(
        target_d - timedelta(days=7),
        target_d + timedelta(days=21),
    )

    return calculate_48_working_hours_window(
        target_date_str=target_date_str,
        shift_start_time=shift_start_time,
        off_day_index=off_index,
        now_dt=now_dt,
    )

