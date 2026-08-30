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
        return short_leave_annual_days(doc.get("short_leave_hours") or doc.get("short_leave_duration_hours")), 0.0
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


async def _in_app_usage(user_id: str, year: int) -> tuple[float, float, float, float]:
    """Approved and pending usage on/after go-live for the given year."""
    db = get_database()
    if db is None:
        return 0.0, 0.0, 0.0, 0.0

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
            "leave_type": {"$in": ["annual", "sick", "short_leave", "casual", "annual_leave", "sick_leave", "casual_leave"]},
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
    return annual_approved, sick_approved, annual_pending, sick_pending


def _to_response(doc: Dict[str, Any], annual_app: float, sick_app: float, annual_pend: float, sick_pend: float) -> LeaveBalanceResponse:
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
        annual_remaining=round(annual_entitled - annual_opening - annual_app - annual_pend, 2),
        sick_remaining=round(sick_entitled - sick_opening - sick_app - sick_pend, 2),
        go_live_date=ATTENDANCE_GO_LIVE_DATE,
    )


async def get_balance_for_user(user: Dict[str, Any], year: Optional[int] = None) -> LeaveBalanceResponse:
    y = year or _current_year()
    doc = await _ensure_balance_doc(user, y)
    annual_app, sick_app, annual_pend, sick_pend = await _in_app_usage(user.get("id"), y)
    return _to_response(doc, annual_app, sick_app, annual_pend, sick_pend)


async def list_balances(year: Optional[int] = None) -> List[LeaveBalanceResponse]:
    db = get_database()
    if db is None:
        return []
    y = year or _current_year()
    users = await db.users.find(
        {"is_active": True, "role": {"$nin": ["client", "CLIENT", "admin", "ADMIN"]}},
        {"_id": 0, "hashed_password": 0},
    ).sort("full_name", 1).to_list(1000)

    rows: List[LeaveBalanceResponse] = []
    for u in users:
        rows.append(await get_balance_for_user(u, y))
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
    if need_annual > 0 and bal.annual_remaining < need_annual:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not enough annual leave remaining ({bal.annual_remaining} left, {need_annual} requested). Quota is {bal.annual_entitled:g} days including half-days already taken.",
        )
    if need_sick > 0 and bal.sick_remaining < need_sick:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not enough sick leave remaining ({bal.sick_remaining} left, {need_sick} requested). Quota is {bal.sick_entitled:g} days.",
        )
