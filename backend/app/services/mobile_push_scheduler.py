"""Shift-relative mobile punch reminders. Times come from each user's assigned shift."""
import logging
from typing import Optional
from datetime import datetime, timedelta, time as dt_time
from zoneinfo import ZoneInfo

from app.database import get_database
from app.services.company_members import company_member_users
from app.models.attendance import LeaveStatus, NON_LEAVE_REQUEST_TYPES
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


def _grace_minutes(shift) -> int:
    try:
        value = int(getattr(shift, "grace_period_minutes", 30) or 30)
    except (TypeError, ValueError):
        value = 30
    return max(0, value)


async def _on_approved_full_leave(db, user_id: str, date_str: str) -> bool:
    doc = await db.leave_requests.find_one(
        {
            "user_id": user_id,
            "status": LeaveStatus.APPROVED.value,
            "start_date": {"$lte": date_str},
            "end_date": {"$gte": date_str},
            "leave_type": {"$nin": list(NON_LEAVE_REQUEST_TYPES | {"wfh", "short_leave"})},
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


async def _late_personal_already_sent(uid: str, date_str: str) -> bool:
    """Compat: treat legacy missed_checkin receipt as already sent for late_checkin."""
    if await push_service.already_sent(uid, date_str, "late_checkin"):
        return True
    return await push_service.already_sent(uid, date_str, "missed_checkin")


async def _notify_late_at_grace(user, shift, start, today: str, grace: int) -> None:
    uid = user["id"]
    name = user.get("full_name") or user.get("name") or "there"
    display = name.split()[0] if name else "there"
    start_label = getattr(shift, "start_time", None) or start.strftime("%H:%M")

    if await push_service.try_claim_scheduled_push(uid, today, "late_checkin"):
        await push_service.dispatch_to_users(
            [uid],
            "You are late",
            (
                f"Hi {display}, your shift started at {start_label}. "
                f"The {grace}-minute grace period has ended. "
                "Open Reamarc to check in, or submit leave / WFH if you are not working today."
            ),
            kind="late_checkin",
        )

    if not await push_service.try_claim_scheduled_push(uid, today, "employee_late_staff"):
        return

    recipients = await push_service.resolve_attendance_alert_recipients(
        subject_user_id=uid,
        subject_role=user.get("role"),
    )
    if recipients:
        full_name = user.get("full_name") or user.get("name") or "An employee"
        await push_service.dispatch_to_users(
            recipients,
            f"{full_name} is late",
            (
                f"{full_name} has not checked in after the {grace}-minute grace period "
                f"(shift {start_label})."
            ),
            kind="employee_late",
        )


async def _tick_for_active_company(db, company: Optional[dict] = None) -> None:
    if db is None:
        return
    from app.core.tenant import company_tz
    tz = ZoneInfo(company_tz(company)) if company else PK_TZ
    now = datetime.now(tz)
    today = now.strftime("%Y-%m-%d")
    yesterday = (now.date() - timedelta(days=1)).strftime("%Y-%m-%d")

    from app.services.attendance_scheduler import is_workday_for_date
    from app.services.access import is_tracked

    users = await company_member_users(
        {"is_active": True, "role": {"$nin": list(SKIP_ROLES)}},
        db=db,
        projection={"_id": 0, "hashed_password": 0},
        limit=1000,
    )

    for user in users:
        uid = user.get("id")
        if not uid:
            continue
        if not is_tracked(user, "attendance"):
            continue
        try:
            await _tick_user(db, user, now, today, yesterday, is_workday_for_date)
        except Exception as err:
            logger.warning("Mobile reminder tick failed for %s: %s", uid, err)


async def run_mobile_reminder_tick() -> None:
    from app.config import settings
    from app.core.job_locks import job_lease
    from app.core.tenant import get_tenant_context, for_each_active_company

    ctx = get_tenant_context()
    if ctx and ctx.company_id:
        db = get_database()
        if db is not None:
            await _tick_for_active_company(db)
        return

    async with job_lease("mobile_reminder_tick", ttl_seconds=60) as acquired:
        if not acquired:
            return
        if getattr(settings, "MULTI_TENANT_ENABLED", False):
            await for_each_active_company(lambda comp: _tick_for_active_company(get_database(), comp))
        else:
            db = get_database()
            if db is not None:
                await _tick_for_active_company(db)


async def _tick_user(db, user, now, today, yesterday, is_workday_for_date) -> None:
    uid = user["id"]
    name = user.get("full_name") or user.get("name") or "there"
    on_leave_today = await _on_approved_full_leave(db, uid, today)
    is_workday_today = await is_workday_for_date(today)
    shift = await attendance_service.get_shift_for_user(uid, user.get("department"), today)
    start, end = shift_bounds(shift, now)
    grace = _grace_minutes(shift)

    if not on_leave_today and is_workday_today:
        if _in_window(now, start - timedelta(minutes=10), before_minutes=5, after_minutes=6):
            if not await _has_check_in(db, uid, today):
                if await push_service.try_claim_scheduled_push(uid, today, "pre_shift"):
                    await push_service.dispatch_to_users(
                        [uid],
                        "Shift starts soon",
                        f"Hi {name.split()[0]}, your shift starts at {shift.start_time}. Open the app to check in.",
                        kind="pre_shift",
                    )

        if _in_window(now, start + timedelta(minutes=grace), before_minutes=5, after_minutes=6):
            if not await _has_check_in(db, uid, today):
                await _notify_late_at_grace(user, shift, start, today, grace)

        if _in_window(now, end, before_minutes=5, after_minutes=6):
            if await _still_checked_in(db, uid, today):
                if await push_service.try_claim_scheduled_push(uid, today, "checkout"):
                    await push_service.dispatch_to_users(
                        [uid],
                        "Time to check out",
                        f"Your shift ends at {shift.end_time}. Open the app to check out.",
                        kind="checkout",
                    )

    if now.hour >= 10 and await is_workday_for_date(yesterday):
        if not await _on_approved_full_leave(db, uid, yesterday):
            if not await _has_check_in(db, uid, yesterday):
                if await push_service.try_claim_scheduled_push(uid, yesterday, "missed_yesterday"):
                    await push_service.dispatch_to_users(
                        [uid],
                        "Yesterday's attendance is missing",
                        "You did not check in yesterday. Open Requests to submit a correction if needed.",
                        kind="missed_yesterday",
                    )
