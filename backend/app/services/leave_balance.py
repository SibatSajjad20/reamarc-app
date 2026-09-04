"""
Annual / sick leave quotas and remaining balances.

Policy (calendar year):
- 14 annual paid days
- 8 sick days
- Short leave of 2–4 hours counts as 0.5 annual day
- Opening used = days already taken before attendance go-live (seeded by HR)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.database import get_database
from app.models.attendance import LeaveStatus, LeaveType
from app.schemas.leave import LeaveBalanceResponse, LeaveBalanceUpdateRequest
from app.services.attendance_golive import ATTENDANCE_GO_LIVE_DATE, get_effective_start_date


def _iter_dates(start_str: str, end_str: Optional[str]) -> List[str]:
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

logger = logging.getLogger("app.leave_balance")

ANNUAL_ENTITLED = 14.0
SICK_ENTITLED = 8.0

EXCLUDED_UNDERTIME_STATUSES = {
    "absent",
    "holiday",
    "weekend_off",
    "first_saturday_off",
    "sunday_off",
    "on_leave",
    "sick_leave",
    "casual_leave",
    "annual_leave",
    "unpaid_leave",
}
HALF_DAY_SHORT_LEAVE_HOURS = 2.0


def _current_year() -> int:
    return datetime.now(timezone.utc).year


def short_leave_annual_days(hours: Optional[float]) -> float:
    try:
        h = float(hours or 0)
    except (TypeError, ValueError):
        h = 0.0
    return 0.5 if h >= HALF_DAY_SHORT_LEAVE_HOURS else 0.0


def leave_days_in_range(
    start_date: str,
    end_date: Optional[str],
    off_index: Optional[Any] = None,
) -> float:
    dates = _iter_dates(start_date, end_date or start_date)
    if off_index is not None:
        return float(sum(1 for d in dates if off_index.is_workday_iso(d)))
    return float(len(dates))


def _usage_from_request(
    doc: Dict[str, Any],
    off_index: Optional[Any] = None,
) -> tuple[float, float]:
    """Returns (annual_days, sick_days) deducted by one request."""
    lt = str(doc.get("leave_type") or doc.get("leave_category") or "").lower()
    if lt in (LeaveType.ANNUAL.value, LeaveType.CASUAL.value, "annual_leave", "casual_leave"):
        return leave_days_in_range(doc.get("start_date") or "", doc.get("end_date"), off_index), 0.0
    if lt in (LeaveType.SICK.value, "sick_leave"):
        return 0.0, leave_days_in_range(doc.get("start_date") or "", doc.get("end_date"), off_index)
    if lt in (LeaveType.SHORT_LEAVE.value, "short_leave"):
        # Short leaves do not directly deduct days; their shortfall counts as undertime.
        return 0.0, 0.0
    return 0.0, 0.0


async def _ensure_balance_doc(user: Dict[str, Any], year: int) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    user_id = user.get("id")
    existing = await db.leave_balances.find_one({"user_id": user_id, "year": year}, {"_id": 0})
    if existing:
        return existing

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": f"lb_{user_id}_{year}",
        "user_id": user_id,
        "user_name": user.get("full_name") or user.get("name") or "User",
        "department": user.get("department") or "General",
        "year": year,
        "annual_entitled": ANNUAL_ENTITLED,
        "sick_entitled": SICK_ENTITLED,
        "annual_used_opening": 0.0,
        "sick_used_opening": 0.0,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.leave_balances.update_one(
        {"user_id": user_id, "year": year},
        {"$setOnInsert": doc},
        upsert=True,
    )
    stored = await db.leave_balances.find_one({"user_id": user_id, "year": year}, {"_id": 0})
    return stored or doc


async def _in_app_usage(user_id: str, year: int) -> tuple[float, float, float, float, float, float, float]:
    """
    Approved and pending usage on/after go-live for the given year, plus undertime deductions.
    Monthly rule:
    - If a month has net variance >= 0 (overtime), it closes cleanly (overtime is paid out monthly; nothing carries forward).
    - If a month has net variance < 0 (undertime), that net deficit carries forward into the running undertime deficit tracker.
    - Every full 8 hours (480 mins) of cumulative net undertime deducts 1 day from the annual leave quota.
    """
    db = get_database()
    if db is None:
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0

    from app.services.workdays import load_off_day_index
    start_d = datetime(year, 1, 1).date()
    end_d = datetime(year, 12, 31).date()
    off_index = await load_off_day_index(start_d, end_d)

    start = max(f"{year:04d}-01-01", get_effective_start_date())
    end = f"{year:04d}-12-31"
    cursor = db.leave_requests.find(
        {
            "user_id": user_id,
            "status": {"$in": [LeaveStatus.APPROVED.value, LeaveStatus.PENDING.value, "approved", "pending"]},
            "leave_type": {"$in": ["annual", "sick", "casual", "annual_leave", "sick_leave", "casual_leave"]},
            "start_date": {"$lte": end},
            "end_date": {"$gte": start},
        },
        {"_id": 0},
    )
    docs = await cursor.to_list(500)

    annual_approved = sick_approved = annual_pending = sick_pending = 0.0
    for doc in docs:
        annual_d, sick_d = _usage_from_request(doc, off_index)
        st = str(doc.get("status") or "").lower()
        if st == LeaveStatus.PENDING.value:
            annual_pending += annual_d
            sick_pending += sick_d
        else:
            annual_approved += annual_d
            sick_approved += sick_d

    # Monthly net-variance tracking from attendance records
    EXCLUDED_UNDERTIME_STATUSES = {
        "absent",
        "holiday",
        "weekend_off",
        "first_saturday_off",
        "sunday_off",
        "on_leave",
        "sick_leave",
        "casual_leave",
        "annual_leave",
        "unpaid_leave",
    }

    from app.services.attendance_service import (
        resolve_fallback_shifts,
        resolve_shift_doc_for_date,
        apply_daily_calc_fields,
    )
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "department": 1})
    assignment = await db.user_shift_assignments.find_one({"user_id": user_id}, {"_id": 0})
    all_shifts = await db.shifts.find({"is_active": True}, {"_id": 0}).to_list(100)
    shifts_by_id = {s["id"]: s for s in all_shifts}
    std_shift, hr_shift = resolve_fallback_shifts(all_shifts)
    assigned_shift_id = (assignment or {}).get("shift_id")
    dept = (user_doc or {}).get("department")
    raw_shift = shifts_by_id.get(assigned_shift_id) if assigned_shift_id else (hr_shift if str(dept).upper() == "HR" else std_shift)

    att_cursor = db.attendance_records.find(
        {
            "user_id": user_id,
            "date": {"$gte": start, "$lte": end},
        },
        {"_id": 0},
    )
    att_docs = await att_cursor.to_list(1000)

    monthly_data: Dict[str, Dict[str, int]] = {}
    for r in att_docs:
        d = str(r.get("date") or "")
        if len(d) >= 7:
            ym = d[:7]
            if ym not in monthly_data:
                monthly_data[ym] = {"ot": 0, "ut": 0}
            rec_shift = resolve_shift_doc_for_date(assignment, d, shifts_by_id, stored_shift_id=r.get("shift_id"), fallback=raw_shift)
            stored_ot = int(r.get("overtime_minutes") or 0)
            apply_daily_calc_fields(r, rec_shift or raw_shift)
            effective_ot = max(stored_ot, int(r.get("overtime_minutes") or 0))
            monthly_data[ym]["ot"] += effective_ot
            st = str(r.get("status") or "").lower()
            if st not in EXCLUDED_UNDERTIME_STATUSES:
                monthly_data[ym]["ut"] += int(r.get("undertime_minutes") or 0)

    # Calculate monthly net variance (overtime - undertime) for closed past months only.
    # The current in-progress month has not ended yet; employees can offset undertime with overtime until month-end.
    from zoneinfo import ZoneInfo
    now_pk = datetime.now(ZoneInfo("Asia/Karachi"))
    current_ym = now_pk.strftime("%Y-%m")

    cumulative_net_undertime_minutes = 0
    for _ym in sorted(monthly_data.keys()):
        # Only settle closed past months (< current_ym)
        if _ym >= current_ym:
            continue
        data = monthly_data[_ym]
        net_var = data["ot"] - data["ut"]
        if net_var < 0:
            cumulative_net_undertime_minutes += abs(net_var)
        # If net_var >= 0, closes cleanly: overtime is paid monthly, does not pay past debt or carry forward.

    undertime_days_deducted = float(cumulative_net_undertime_minutes // 480)
    carried_undertime_minutes = cumulative_net_undertime_minutes % 480
    carried_undertime_hours = round(carried_undertime_minutes / 60.0, 2)
    total_undertime_hours = round(cumulative_net_undertime_minutes / 60.0, 2)

    return annual_approved, sick_approved, annual_pending, sick_pending, undertime_days_deducted, total_undertime_hours, carried_undertime_hours


def _to_response(
    doc: Dict[str, Any],
    annual_app: float,
    sick_app: float,
    annual_pend: float,
    sick_pend: float,
    undertime_deducted: float = 0.0,
    total_undertime_hours: float = 0.0,
    carried_undertime_hours: float = 0.0,
) -> LeaveBalanceResponse:
    annual_raw = doc.get("annual_entitled")
    sick_raw = doc.get("sick_entitled")
    annual_entitled = float(annual_raw) if annual_raw is not None else ANNUAL_ENTITLED
    sick_entitled = float(sick_raw) if sick_raw is not None else SICK_ENTITLED
    annual_opening = float(doc.get("annual_used_opening") or 0)
    sick_opening = float(doc.get("sick_used_opening") or 0)
    return LeaveBalanceResponse(
        user_id=doc["user_id"],
        user_name=doc.get("user_name"),
        department=doc.get("department"),
        year=int(doc["year"]),
        annual_entitled=annual_entitled,
        sick_entitled=sick_entitled,
        annual_used_opening=annual_opening,
        sick_used_opening=sick_opening,
        annual_used_in_app=annual_app,
        sick_used_in_app=sick_app,
        annual_pending=annual_pend,
        sick_pending=sick_pend,
        annual_remaining=round(annual_entitled - annual_opening - annual_app - undertime_deducted - annual_pend, 2),
        sick_remaining=round(sick_entitled - sick_opening - sick_app - sick_pend, 2),
        undertime_days_deducted=undertime_deducted,
        total_undertime_hours=total_undertime_hours,
        carried_undertime_hours=carried_undertime_hours,
        go_live_date=ATTENDANCE_GO_LIVE_DATE,
    )


async def get_balance_for_user(user: Dict[str, Any], year: Optional[int] = None) -> LeaveBalanceResponse:
    y = year or _current_year()
    doc = await _ensure_balance_doc(user, y)
    annual_app, sick_app, annual_pend, sick_pend, ut_deducted, ut_hours, carried_hours = await _in_app_usage(user.get("id"), y)
    return _to_response(doc, annual_app, sick_app, annual_pend, sick_pend, ut_deducted, ut_hours, carried_hours)


async def list_balances(year: Optional[int] = None) -> List[LeaveBalanceResponse]:
    db = get_database()
    if db is None:
        return []
    import asyncio
    from app.services.workdays import load_off_day_index

    y = year or _current_year()
    users = await db.users.find(
        {"is_active": True, "role": {"$nin": ["client", "CLIENT", "admin", "ADMIN"]}},
        {"_id": 0, "hashed_password": 0},
    ).sort("full_name", 1).to_list(1000)

    start_d = datetime(y, 1, 1).date()
    end_d = datetime(y, 12, 31).date()
    start_str = max(f"{y:04d}-01-01", get_effective_start_date())
    end_str = f"{y:04d}-12-31"

    from app.services.attendance_service import (
        resolve_fallback_shifts,
        resolve_shift_doc_for_date,
        apply_daily_calc_fields,
    )

    # Concurrently batch-query off_day_index, leave balances, in-app requests, attendance records, shifts, and shift assignments
    off_task = load_off_day_index(start_d, end_d)
    bal_task = db.leave_balances.find({"year": y}, {"_id": 0}).to_list(1000)
    req_task = db.leave_requests.find(
        {
            "status": {"$in": [LeaveStatus.APPROVED.value, LeaveStatus.PENDING.value, "approved", "pending"]},
            "leave_type": {"$in": ["annual", "sick", "casual", "annual_leave", "sick_leave", "casual_leave"]},
            "start_date": {"$lte": end_str},
            "end_date": {"$gte": start_str},
        },
        {"_id": 0},
    ).to_list(2000)
    att_task = db.attendance_records.find(
        {"date": {"$gte": start_str, "$lte": end_str}},
        {"_id": 0},
    ).to_list(10000)
    shift_task = db.shifts.find({"is_active": True}, {"_id": 0}).to_list(100)
    asgn_task = db.user_shift_assignments.find({}, {"_id": 0}).to_list(1000)

    off_index, bal_docs, req_docs, att_docs, all_shifts, all_assignments = await asyncio.gather(
        off_task, bal_task, req_task, att_task, shift_task, asgn_task
    )

    shifts_by_id = {s["id"]: s for s in all_shifts}
    std_shift, hr_shift = resolve_fallback_shifts(all_shifts)
    user_assignment_map = {a["user_id"]: a for a in all_assignments if a.get("user_id")}

    bals_by_user = {b["user_id"]: b for b in bal_docs if "user_id" in b}
    reqs_by_user: Dict[str, List[Dict[str, Any]]] = {}
    for r in req_docs:
        uid = r.get("user_id")
        if uid:
            reqs_by_user.setdefault(uid, []).append(r)
    att_by_user: Dict[str, List[Dict[str, Any]]] = {}
    for a in att_docs:
        uid = a.get("user_id")
        if uid:
            att_by_user.setdefault(uid, []).append(a)

    from zoneinfo import ZoneInfo
    now_pk = datetime.now(ZoneInfo("Asia/Karachi"))
    current_ym = now_pk.strftime("%Y-%m")

    rows: List[LeaveBalanceResponse] = []
    for u in users:
        uid = u["id"]
        doc = bals_by_user.get(uid)
        if not doc:
            doc = {
                "user_id": uid,
                "user_name": u.get("full_name") or u.get("name"),
                "department": u.get("department"),
                "year": y,
                "annual_entitled": ANNUAL_ENTITLED,
                "sick_entitled": SICK_ENTITLED,
                "annual_used_opening": 0.0,
                "sick_used_opening": 0.0,
            }

        # Calculate in-app leave usage
        annual_approved = sick_approved = annual_pending = sick_pending = 0.0
        for r in reqs_by_user.get(uid, []):
            ann, sck = _usage_from_request(r, off_index)
            st = str(r.get("status") or "").lower()
            if st == LeaveStatus.PENDING.value:
                annual_pending += ann
                sick_pending += sck
            else:
                annual_approved += ann
                sick_approved += sck

        # Calculate monthly net variance (overtime - undertime) for closed past months only
        assignment = user_assignment_map.get(uid)
        assigned_shift_id = (assignment or {}).get("shift_id")
        dept = u.get("department")
        raw_shift = shifts_by_id.get(assigned_shift_id) if assigned_shift_id else (hr_shift if str(dept).upper() == "HR" else std_shift)

        monthly_data: Dict[str, Dict[str, int]] = {}
        for a in att_by_user.get(uid, []):
            d = str(a.get("date") or "")
            if len(d) >= 7:
                ym = d[:7]
                if ym >= current_ym:
                    continue
                if ym not in monthly_data:
                    monthly_data[ym] = {"ot": 0, "ut": 0}
                rec_shift = resolve_shift_doc_for_date(assignment, d, shifts_by_id, stored_shift_id=a.get("shift_id"), fallback=raw_shift)
                stored_ot = int(a.get("overtime_minutes") or 0)
                apply_daily_calc_fields(a, rec_shift or raw_shift)
                effective_ot = max(stored_ot, int(a.get("overtime_minutes") or 0))
                monthly_data[ym]["ot"] += effective_ot
                st = str(a.get("status") or "").lower()
                if st not in EXCLUDED_UNDERTIME_STATUSES:
                    monthly_data[ym]["ut"] += int(a.get("undertime_minutes") or 0)

        cumulative_net_undertime_minutes = 0
        for ym in sorted(monthly_data.keys()):
            net_var = monthly_data[ym]["ot"] - monthly_data[ym]["ut"]
            if net_var < 0:
                cumulative_net_undertime_minutes += abs(net_var)

        ut_deducted = float(cumulative_net_undertime_minutes // 480)
        carried_minutes = cumulative_net_undertime_minutes % 480
        carried_ut_hours = round(carried_minutes / 60.0, 2)
        total_ut_hours = round(cumulative_net_undertime_minutes / 60.0, 2)

        rows.append(_to_response(doc, annual_approved, sick_approved, annual_pending, sick_pending, ut_deducted, total_ut_hours, carried_ut_hours))

    return rows


async def update_opening_balance(user_id: str, payload: LeaveBalanceUpdateRequest) -> LeaveBalanceResponse:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    y = payload.year or _current_year()
    await _ensure_balance_doc(user, y)

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.annual_entitled is not None:
        updates["annual_entitled"] = float(payload.annual_entitled)
    if payload.sick_entitled is not None:
        updates["sick_entitled"] = float(payload.sick_entitled)

    if payload.annual_used_opening is not None:
        if payload.annual_used_opening < 0:
            raise HTTPException(status_code=400, detail="Annual taken cannot be negative")
        updates["annual_used_opening"] = float(payload.annual_used_opening)
    if payload.sick_used_opening is not None:
        if payload.sick_used_opening < 0:
            raise HTTPException(status_code=400, detail="Sick taken cannot be negative")
        updates["sick_used_opening"] = float(payload.sick_used_opening)

    await db.leave_balances.update_one({"user_id": user_id, "year": y}, {"$set": updates})
    return await get_balance_for_user(user, y)


async def assert_leave_quota(user: Dict[str, Any], leave_type: str, start_date: str, end_date: Optional[str], short_leave_hours: Optional[float] = None) -> None:
    """Reject a new request that would exceed remaining annual or sick quota."""
    try:
        year = int((start_date or "")[:4])
    except (TypeError, ValueError):
        year = _current_year()

    from app.services.workdays import load_off_day_index, parse_iso_date
    start_d = parse_iso_date(start_date) or datetime(year, 1, 1).date()
    end_d = parse_iso_date(end_date or start_date) or start_d
    off_index = await load_off_day_index(start_d, end_d)

    dummy = {"leave_type": leave_type, "start_date": start_date, "end_date": end_date or start_date, "short_leave_hours": short_leave_hours}
    need_annual, need_sick = _usage_from_request(dummy, off_index)
    if need_annual <= 0 and need_sick <= 0:
        return

    bal = await get_balance_for_user(user, year)
    # Note: Annual leaves are allowed to exceed quota; excess days result in a negative balance
    # which is settled at year-end (carried forward to reduce next year's quota or deducted from salary).
    if need_sick > 0 and bal.sick_remaining < need_sick:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not enough sick leave remaining ({bal.sick_remaining} left, {need_sick} requested). Quota is {bal.sick_entitled:g} days.",
        )
