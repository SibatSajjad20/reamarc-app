"""Shift-relative mobile punch reminders. Times come from each user's assigned shift."""
import logging
from datetime import datetime, timedelta, time as dt_time
from zoneinfo import ZoneInfo

from app.database import get_database
from app.models.attendance import LeaveStatus
from app.services import attendance_service, push_service

logger = logging.getLogger("app.mobile_push_scheduler")
PK_TZ = ZoneInfo("Asia/Karachi")

SKIP_ROLES = {"client", "CLIENT", "admin", "ADMIN", "super_admin", "SUPER_ADMIN"}


def _parse_hhmm(value: str) -> dt_time:
    parts = (value or "09:30").split(":")
    return dt_time(int(parts[0]), int(parts[1] if len(parts) > 1 else 0))


def shift_bounds(shift, now: datetime):
    start_t = _parse_hhmm(getattr(shift, "start_time", None) or "09:30")
    end_t = _parse_hhmm(getattr(shift, "end_time", None) or "18:30")
    start = datetime.combine(now.date(), start_t, tzinfo=PK_TZ)
    end = datetime.combine(now.date(), end_t, tzinfo=PK_TZ)
    night = bool(getattr(shift, "is_night_shift", False)) or end <= start
    if night:
        if now.hour < 12:
            start = start - timedelta(days=1)
        else:
            end = end + timedelta(days=1)
    return start, end


def _in_window(now: datetime, target: datetime, before_minutes: int = 0, after_minutes: int = 2) -> bool:
    lo = target - timedelta(minutes=before_minutes)
    hi = target + timedelta(minutes=after_minutes)
    return lo <= now <= hi


async def _on_approved_full_leave(db, user_id: str, date_str: str) -> bool:
    doc = await db.leave_requests.find_one(
        {
            "user_id": user_id,
            "status": LeaveStatus.APPROVED.value,
            "start_date": {"$lte": date_str},
            "end_date": {"$gte": date_str},
            "leave_type": {"$nin": ["wfh", "short_leave", "missed_punch_regularization", "overtime"]},
        },
        {"_id": 1},
    )
    return doc is not None


async def _has_check_in(db, user_id: str, date_str: str) -> bool:
    rec = await db.attendance_records.find_one(
        {"user_id": user_id, "date": date_str},
        {"_id": 0, "check_in": 1, "punch_in": 1, "check_out": 1, "punch_out": 1},
    )
    if not rec:
        return False
    return bool(rec.get("check_in") or rec.get("punch_in"))


async def _still_checked_in(db, user_id: str, date_str: str) -> bool:
    rec = await db.attendance_records.find_one(
        {"user_id": user_id, "date": date_str},
        {"_id": 0, "check_in": 1, "punch_in": 1, "check_out": 1, "punch_out": 1},
    )
    if not rec:
        return False
    cin = rec.get("check_in") or rec.get("punch_in")
    cout = rec.get("check_out") or rec.get("punch_out")
    return bool(cin) and not cout


async def run_mobile_reminder_tick() -> None:
    db = get_database()
    if db is None:
        return
    now = datetime.now(PK_TZ)
    today = now.strftime("%Y-%m-%d")
    yesterday = (now.date() - timedelta(days=1)).strftime("%Y-%m-%d")

    from app.services.attendance_scheduler import is_workday_for_date

    users = await db.users.find(
        {"is_active": True, "role": {"$nin": list(SKIP_ROLES)}},
        {"_id": 0, "id": 1, "full_name": 1, "name": 1, "department": 1, "role": 1},
    ).to_list(1000)

    for user in users:
        uid = user.get("id")
        if not uid:
            continue
        try:
            await _tick_user(db, user, now, today, yesterday, is_workday_for_date)
        except Exception as err:
            logger.warning("Mobile reminder tick failed for %s: %s", uid, err)


async def _tick_user(db, user, now, today, yesterday, is_workday_for_date) -> None:
    uid = user["id"]
    name = user.get("full_name") or user.get("name") or "there"
    on_leave_today = await _on_approved_full_leave(db, uid, today)
    is_workday_today = await is_workday_for_date(today)
    shift = await attendance_service.get_shift_for_user(uid, user.get("department"), today)
    start, end = shift_bounds(shift, now)

    if not on_leave_today and is_workday_today:
        if _in_window(now, start - timedelta(minutes=10), before_minutes=1, after_minutes=1):
            if not await push_service.already_sent(uid, today, "pre_shift"):
                if not await _has_check_in(db, uid, today):
                    await push_service.dispatch_to_users(
                        [uid],
                        "Shift starts soon",
                        f"Hi {name.split()[0]}, your shift starts at {shift.start_time}. Open the app to check in.",
                        kind="pre_shift",
                    )
                    await push_service.mark_sent(uid, today, "pre_shift")

        if _in_window(now, start + timedelta(minutes=30), before_minutes=1, after_minutes=2):
            if not await push_service.already_sent(uid, today, "missed_checkin"):
                if not await _has_check_in(db, uid, today):
                    await push_service.dispatch_to_users(
                        [uid],
                        "You have not checked in",
                        "Open Reamarc to check in, or submit leave / WFH if you are not working today.",
                        kind="missed_checkin",
                    )
                    await push_service.mark_sent(uid, today, "missed_checkin")

        if _in_window(now, end, before_minutes=1, after_minutes=2):
            if not await push_service.already_sent(uid, today, "checkout"):
                if await _still_checked_in(db, uid, today):
                    await push_service.dispatch_to_users(
                        [uid],
                        "Time to check out",
                        f"Your shift ends at {shift.end_time}. Open the app to check out.",
                        kind="checkout",
                    )
                    await push_service.mark_sent(uid, today, "checkout")

    if now.hour >= 10 and await is_workday_for_date(yesterday):
        if not await push_service.already_sent(uid, yesterday, "missed_yesterday"):
            if not await _on_approved_full_leave(db, uid, yesterday):
                if not await _has_check_in(db, uid, yesterday):
                    await push_service.dispatch_to_users(
                        [uid],
                        "Yesterday's attendance is missing",
                        "You did not check in yesterday. Open Requests to submit a correction if needed.",
                        kind="missed_yesterday",
                    )
                    await push_service.mark_sent(uid, yesterday, "missed_yesterday")
