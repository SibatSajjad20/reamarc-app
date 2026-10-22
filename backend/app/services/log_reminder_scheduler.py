import asyncio
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import List, Optional

from app.database import get_database
from app.services.email_service import EmailService
from app.services.company_members import company_member_users

logger = logging.getLogger("app.scheduler")

PK_TZ = ZoneInfo("Asia/Karachi")

# In-memory fast cache for run dates
_last_morning_run_date: dict[str, str] = {}
_last_evening_run_date: dict[str, str] = {}


async def _has_run_today(job_name: str, today_str: str) -> bool:
    """Checks both in-memory cache and MongoDB persistence to see if the job ran today."""
    global _last_morning_run_date, _last_evening_run_date
    from app.core.tenant import get_tenant_context
    ctx = get_tenant_context()
    cid = (ctx.company_id if ctx else None) or "default"

    cache = _last_morning_run_date if job_name == "morning" else _last_evening_run_date
    if cache.get(cid) == today_str:
        return True

    db = get_database()
    if db is not None:
        try:
            doc = await db.system_config.find_one({"key": f"scheduler_last_{job_name}"})
            if doc and doc.get("last_run_date") == today_str:
                cache[cid] = today_str
                return True
        except Exception as e:
            logger.warning(f"[Scheduler] Error checking persistent run status for {job_name}: {e}")

    return False


async def _mark_run_today(job_name: str, today_str: str):
    """Marks job as completed for today in-memory and in MongoDB."""
    global _last_morning_run_date, _last_evening_run_date
    from app.core.tenant import get_tenant_context
    ctx = get_tenant_context()
    cid = (ctx.company_id if ctx else None) or "default"

    cache = _last_morning_run_date if job_name == "morning" else _last_evening_run_date
    cache[cid] = today_str

    db = get_database()
    if db is not None:
        try:
            await db.system_config.update_one(
                {"key": f"scheduler_last_{job_name}"},
                {
                    "$set": {
                        "key": f"scheduler_last_{job_name}",
                        "last_run_date": today_str,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"[Scheduler] Error persisting run status for {job_name}: {e}")


def is_workday(date_obj: datetime) -> bool:
    """
    Evaluates whether a given date is an official working day:
      - Monday through Friday: Always working days.
      - Sunday: Always an off day.
      - Saturday: 1st Saturday of the month (day 1-7) is OFF; all remaining Saturdays (day > 7) are WORKING DAYS.
    """
    w = date_obj.weekday()
    if w == 6:  # Sunday
        return False
    if w == 5:  # Saturday: 1st Saturday of the month is off
        return date_obj.day > 7
    return True  # Monday - Friday


async def _is_company_workday(date_obj: datetime) -> bool:
    from app.services.workdays import is_company_workday
    day = date_obj.date() if isinstance(date_obj, datetime) else date_obj
    return await is_company_workday(day)


async def _get_previous_workday(today_date: datetime) -> str:
    """Previous company workday (YYYY-MM-DD), skipping Sundays, 1st Saturdays, and calendar holidays."""
    from app.services.workdays import load_off_day_index
    today = today_date.date() if isinstance(today_date, datetime) else today_date
    idx = await load_off_day_index(today - timedelta(days=21), today)
    check = today - timedelta(days=1)
    for _ in range(21):
        if idx.is_workday(check):
            return check.isoformat()
        check -= timedelta(days=1)
    return check.isoformat()


async def _user_ids_on_leave(members: List[dict], date_str: str) -> set:
    from app.services.log_compliance import batch_expected_targets, person_day_is_leave, person_day_is_due

    db = get_database()
    ids = {m.get("id") for m in members if m.get("id")}
    if db is None or not ids:
        return set()
    targets = await batch_expected_targets(members, [date_str])
    att_docs = await db.attendance_records.find(
        {"user_id": {"$in": list(ids)}, "date": date_str},
        {"_id": 0, "user_id": 1, "status": 1, "check_in": 1, "punch_in": 1, "check_out": 1, "punch_out": 1, "work_hours": 1, "is_wfh": 1},
    ).to_list(500)
    att_by_user = {d.get("user_id"): d for d in att_docs if d.get("user_id")}
    on_leave = set()
    today_str = datetime.now(PK_TZ).strftime("%Y-%m-%d")
    for uid in ids:
        target = targets.get((uid, date_str)) or {}
        att = att_by_user.get(uid) or {}
        if person_day_is_leave(target, att) or not person_day_is_due(date_str, today_str, target, att):
            on_leave.add(uid)
    return on_leave


async def run_evening_log_reminder_check(company: Optional[dict] = None, now_override: Optional[datetime] = None):
    """Evening 8:00 PM Check: Dispatches reminder emails to members who haven't logged today."""
    db = get_database()
    if db is None:
        logger.warning("[Scheduler] Database unavailable for evening reminder check.")
        return

    from app.core.tenant import company_tz
    tz = ZoneInfo(company_tz(company)) if company else PK_TZ
    now_pk = now_override or datetime.now(tz)
    today_str = now_pk.strftime("%Y-%m-%d")

    # Off-day check: Skip reminders on Sunday and 1st Saturday of the month
    if not await _is_company_workday(now_pk):
        logger.info(f"[Scheduler] Today ({today_str}) is an off day. Skipping automated daily log reminders.")
        return

    logger.info(f"[Scheduler] Running Evening 8:00 PM Log Reminder Check for {today_str}...")

    # Fetch active members (excluding super admin, client, and operations accounts)
    members = await company_member_users(
        {"is_active": True, "role": {"$nin": ["admin", "ADMIN", "client", "CLIENT", "operations", "OPERATIONS"]}},
        db=db,
        projection={"_id": 0, "hashed_password": 0},
        limit=500,
    )
    from app.services.access import is_tracked
    members = [m for m in members if is_tracked(m, "daily_log")]

    # Fetch today's log entries
    entries_cursor = db.daily_log_entries.find(
        {"date": today_str},
        {"_id": 0, "user_id": 1, "resource_name": 1},
    )
    today_entries = await entries_cursor.to_list(length=2000)

    logged_user_ids = {e["user_id"] for e in today_entries if e.get("user_id")}
    logged_names = {(e.get("resource_name") or "").strip().lower() for e in today_entries if e.get("resource_name")}
    on_leave_ids = await _user_ids_on_leave(members, today_str)

    reminded_count = 0
    for m in members:
        uid = m.get("id")
        if uid in on_leave_ids:
            continue
        fname = m.get("full_name") or m.get("name", "Team Member")
        fname_lower = fname.strip().lower()

        # Check if member submitted an entry today
        has_logged = (uid in logged_user_ids) or (fname_lower in logged_names)
        if not has_logged:
            from app.services.log_compliance import compute_log_submission_window
            win = await compute_log_submission_window(uid, today_str, now_dt=now_pk, user_dept=m.get("department"))
            if not win.get("is_open"):
                continue

            try:
                await EmailService.send_log_reminder(
                    recipient_email=m["email"],
                    recipient_name=fname,
                    missing_dates=[today_str],
                    custom_message="Evening Reminder: Please remember to record your daily tasks and hours for today before wrapping up your shift.",
                    company=company,
                )
                reminded_count += 1
                logger.info(f"[Scheduler] Evening reminder email dispatched to {m['email']}")
            except Exception as err:
                logger.error(f"[Scheduler] Failed to send evening reminder to {m['email']}: {err}")

            try:
                from app.services import push_service
                if await push_service.try_claim_scheduled_push(uid, today_str, "daily_log_evening_push"):
                    await push_service.dispatch_to_users(
                        user_ids=[uid],
                        title="Daily Log Reminder",
                        body="Please remember to record your daily tasks and hours for today before wrapping up your shift.",
                        kind="daily_log_reminder",
                        data={"date": today_str, "type": "evening_log_reminder"},
                    )
            except Exception as p_err:
                logger.warning(f"[Scheduler] Failed to dispatch evening push notification to {uid}: {p_err}")

    logger.info(f"[Scheduler] Evening reminder check complete. {reminded_count} members reminded for {today_str}.")


async def run_morning_log_reminder_check(company: Optional[dict] = None, now_override: Optional[datetime] = None):
    """Morning 10:00 AM Check: Dispatches reminder emails to members who missed the previous workday's log."""
    db = get_database()
    if db is None:
        logger.warning("[Scheduler] Database unavailable for morning reminder check.")
        return

    from app.core.tenant import company_tz
    tz = ZoneInfo(company_tz(company)) if company else PK_TZ
    now_pk = now_override or datetime.now(tz)
    today_str = now_pk.strftime("%Y-%m-%d")

    # Off-day check: Skip morning reminders on Sunday and 1st Saturday of the month
    if not await _is_company_workday(now_pk):
        logger.info(f"[Scheduler] Today ({today_str}) is an off day. Skipping morning reminders.")
        return

    prev_workday_str = await _get_previous_workday(now_pk)
    if prev_workday_str < "2026-08-19":
        logger.info(f"[Scheduler] Previous workday ({prev_workday_str}) is before system start date 2026-08-19. Skipping morning reminders.")
        await _mark_run_today("morning", today_str)
        return

    logger.info(f"[Scheduler] Running Morning 10:00 AM Log Reminder Check (Checking previous workday: {prev_workday_str})...")

    # Fetch active members (excluding super admin, client, and operations accounts)
    members = await company_member_users(
        {"is_active": True, "role": {"$nin": ["admin", "ADMIN", "client", "CLIENT", "operations", "OPERATIONS"]}},
        db=db,
        projection={"_id": 0, "hashed_password": 0},
        limit=500,
    )
    from app.services.access import is_tracked
    members = [m for m in members if is_tracked(m, "daily_log")]

    # Fetch previous workday's log entries
    entries_cursor = db.daily_log_entries.find(
        {"date": prev_workday_str},
        {"_id": 0, "user_id": 1, "resource_name": 1},
    )
    prev_entries = await entries_cursor.to_list(length=2000)

    logged_user_ids = {e["user_id"] for e in prev_entries if e.get("user_id")}
    logged_names = {(e.get("resource_name") or "").strip().lower() for e in prev_entries if e.get("resource_name")}
    on_leave_ids = await _user_ids_on_leave(members, prev_workday_str)

    reminded_count = 0
    for m in members:
        uid = m.get("id")
        if uid in on_leave_ids:
            continue
        fname = m.get("full_name") or m.get("name", "Team Member")
        fname_lower = fname.strip().lower()

        has_logged = (uid in logged_user_ids) or (fname_lower in logged_names)
        if not has_logged:
            from app.services.log_compliance import compute_log_submission_window
            win = await compute_log_submission_window(uid, prev_workday_str, now_dt=now_pk, user_dept=m.get("department"))
            if not win.get("is_open"):
                continue

            try:
                await EmailService.send_log_reminder(
                    recipient_email=m["email"],
                    recipient_name=fname,
                    missing_dates=[prev_workday_str],
                    custom_message=f"Morning Reminder: You have an unlogged work submission for {prev_workday_str}. Please take 2 minutes to backfill your tasks.",
                    company=company,
                )
                reminded_count += 1
                logger.info(f"[Scheduler] Morning reminder email dispatched to {m['email']}")
            except Exception as err:
                logger.error(f"[Scheduler] Failed to send morning reminder to {m['email']}: {err}")

            try:
                from app.services import push_service
                if await push_service.try_claim_scheduled_push(uid, today_str, "daily_log_morning_push"):
                    await push_service.dispatch_to_users(
                        user_ids=[uid],
                        title="Daily Log Reminder",
                        body=f"You have an unlogged work submission for {prev_workday_str}. Please take 2 minutes to backfill your tasks.",
                        kind="daily_log_reminder",
                        data={"date": prev_workday_str, "type": "morning_log_reminder"},
                    )
            except Exception as p_err:
                logger.warning(f"[Scheduler] Failed to dispatch morning push notification to {uid}: {p_err}")

    logger.info(f"[Scheduler] Morning reminder check complete. {reminded_count} members reminded for {prev_workday_str}.")


async def start_automated_log_reminder_scheduler():
    """Background continuous polling loop with widened catch-up windows for 10:00 AM and 8:00 PM local time."""
    from app.config import settings
    from app.core.job_locks import job_lease
    from app.core.tenant import for_each_active_company, company_tz

    logger.info("[Scheduler] Automated Daily Log Email Reminder background worker started.")

    tick_running = False
    while True:
        if tick_running:
            await asyncio.sleep(120)
            continue
        tick_running = True
        try:
            async with job_lease("daily_log_reminders", ttl_seconds=120) as acquired:
                if acquired:
                    if getattr(settings, "MULTI_TENANT_ENABLED", False):
                        async def _check_company_reminders(comp: dict):
                            tz_str = company_tz(comp)
                            try:
                                comp_tz = ZoneInfo(tz_str)
                            except Exception:
                                comp_tz = PK_TZ
                            now_comp = datetime.now(comp_tz)
                            today_comp = now_comp.strftime("%Y-%m-%d")
                            hour = now_comp.hour

                            if await _is_company_workday(now_comp):
                                if 10 <= hour < 20:
                                    if not await _has_run_today("morning", today_comp):
                                        await _mark_run_today("morning", today_comp)
                                        await run_morning_log_reminder_check(company=comp, now_override=now_comp)
                                if hour >= 20:
                                    if not await _has_run_today("evening", today_comp):
                                        await _mark_run_today("evening", today_comp)
                                        await run_evening_log_reminder_check(company=comp, now_override=now_comp)

                        await for_each_active_company(_check_company_reminders)
                    else:
                        now_pk = datetime.now(PK_TZ)
                        today_str = now_pk.strftime("%Y-%m-%d")
                        hour = now_pk.hour

                        if await _is_company_workday(now_pk):
                            if 10 <= hour < 20:
                                if not await _has_run_today("morning", today_str):
                                    await _mark_run_today("morning", today_str)
                                    await run_morning_log_reminder_check()
                            if hour >= 20:
                                if not await _has_run_today("evening", today_str):
                                    await _mark_run_today("evening", today_str)
                                    await run_evening_log_reminder_check()

            # Sleep 120 seconds before next time check (window is hour-based)
            await asyncio.sleep(120)
        except asyncio.CancelledError:
            logger.info("[Scheduler] Daily Log Email Reminder worker cancelled.")
            break
        except Exception as err:
            logger.error(f"[Scheduler] Exception in reminder worker loop: {err}")
            await asyncio.sleep(120)
        finally:
            tick_running = False
