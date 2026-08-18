import asyncio
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import List, Optional

from app.database import get_database
from app.services.email_service import EmailService

logger = logging.getLogger("app.scheduler")

PK_TZ = ZoneInfo("Asia/Karachi")

# In-memory fast cache for run dates
_last_morning_run_date: Optional[str] = None
_last_evening_run_date: Optional[str] = None


async def _has_run_today(job_name: str, today_str: str) -> bool:
    """Checks both in-memory cache and MongoDB persistence to see if the job ran today."""
    global _last_morning_run_date, _last_evening_run_date
    if job_name == "morning" and _last_morning_run_date == today_str:
        return True
    if job_name == "evening" and _last_evening_run_date == today_str:
        return True

    db = get_database()
    if db is not None:
        try:
            doc = await db.system_config.find_one({"key": f"scheduler_last_{job_name}"})
            if doc and doc.get("last_run_date") == today_str:
                if job_name == "morning":
                    _last_morning_run_date = today_str
                if job_name == "evening":
                    _last_evening_run_date = today_str
                return True
        except Exception as e:
            logger.warning(f"[Scheduler] Error checking persistent run status for {job_name}: {e}")

    return False


async def _mark_run_today(job_name: str, today_str: str):
    """Marks job as completed for today in-memory and in MongoDB."""
    global _last_morning_run_date, _last_evening_run_date
    if job_name == "morning":
        _last_morning_run_date = today_str
    if job_name == "evening":
        _last_evening_run_date = today_str

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


def _get_previous_workday(today_date: datetime) -> str:
    """Returns the previous workday string (YYYY-MM-DD), skipping Sundays and the 1st Saturday of the month."""
    check_date = today_date - timedelta(days=1)
    while not is_workday(check_date):
        check_date -= timedelta(days=1)
    return check_date.strftime("%Y-%m-%d")


async def run_evening_log_reminder_check():
    """Evening 8:00 PM Check: Dispatches reminder emails to members who haven't logged today."""
    db = get_database()
    if db is None:
        logger.warning("[Scheduler] Database unavailable for evening reminder check.")
        return

    now_pk = datetime.now(PK_TZ)
    today_str = now_pk.strftime("%Y-%m-%d")

    # Off-day check: Skip reminders on Sunday and 1st Saturday of the month
    if not is_workday(now_pk):
        logger.info(f"[Scheduler] Today ({today_str}) is an off day. Skipping automated daily log reminders.")
        return

    logger.info(f"[Scheduler] Running Evening 8:00 PM Log Reminder Check for {today_str}...")

    # Fetch active members (excluding super admin and client accounts)
    cursor = db.users.find(
        {"is_active": True, "role": {"$nin": ["admin", "ADMIN", "client", "CLIENT"]}},
        {"_id": 0, "id": 1, "email": 1, "full_name": 1, "name": 1},
    )
    members = await cursor.to_list(length=500)

    # Fetch today's log entries
    entries_cursor = db.daily_log_entries.find(
        {"date": today_str},
        {"_id": 0, "user_id": 1, "resource_name": 1},
    )
    today_entries = await entries_cursor.to_list(length=2000)

    logged_user_ids = {e["user_id"] for e in today_entries if e.get("user_id")}
    logged_names = {(e.get("resource_name") or "").strip().lower() for e in today_entries if e.get("resource_name")}

    reminded_count = 0
    for m in members:
        uid = m.get("id")
        fname = m.get("full_name") or m.get("name", "Team Member")
        fname_lower = fname.strip().lower()

        # Check if member submitted an entry today
        has_logged = (uid in logged_user_ids) or (fname_lower in logged_names)
        if not has_logged:
            try:
                await EmailService.send_log_reminder(
                    recipient_email=m["email"],
                    recipient_name=fname,
                    missing_dates=[today_str],
                    custom_message="Evening Reminder: Please remember to record your daily tasks and hours for today before wrapping up your shift.",
                )
                reminded_count += 1
                logger.info(f"[Scheduler] Evening reminder email dispatched to {m['email']}")
            except Exception as err:
                logger.error(f"[Scheduler] Failed to send evening reminder to {m['email']}: {err}")

    logger.info(f"[Scheduler] Evening reminder check complete. {reminded_count} members reminded for {today_str}.")


async def run_morning_log_reminder_check():
    """Morning 10:00 AM Check: Dispatches reminder emails to members who missed the previous workday's log."""
    db = get_database()
    if db is None:
        logger.warning("[Scheduler] Database unavailable for morning reminder check.")
        return

    now_pk = datetime.now(PK_TZ)
    today_str = now_pk.strftime("%Y-%m-%d")

    # Off-day check: Skip morning reminders on Sunday and 1st Saturday of the month
    if not is_workday(now_pk):
        logger.info(f"[Scheduler] Today ({today_str}) is an off day. Skipping morning reminders.")
        return

    prev_workday_str = _get_previous_workday(now_pk)
    if prev_workday_str < "2026-08-18":
        logger.info(f"[Scheduler] Previous workday ({prev_workday_str}) is before system start date 2026-08-18. Skipping morning reminders.")
        await _mark_run_today("morning", today_str)
        return

    logger.info(f"[Scheduler] Running Morning 10:00 AM Log Reminder Check (Checking previous workday: {prev_workday_str})...")

    # Fetch active members (excluding super admin and client accounts)
    cursor = db.users.find(
        {"is_active": True, "role": {"$nin": ["admin", "ADMIN", "client", "CLIENT"]}},
        {"_id": 0, "id": 1, "email": 1, "full_name": 1, "name": 1},
    )
    members = await cursor.to_list(length=500)

    # Fetch previous workday's log entries
    entries_cursor = db.daily_log_entries.find(
        {"date": prev_workday_str},
        {"_id": 0, "user_id": 1, "resource_name": 1},
    )
    prev_entries = await entries_cursor.to_list(length=2000)

    logged_user_ids = {e["user_id"] for e in prev_entries if e.get("user_id")}
    logged_names = {(e.get("resource_name") or "").strip().lower() for e in prev_entries if e.get("resource_name")}

    reminded_count = 0
    for m in members:
        uid = m.get("id")
        fname = m.get("full_name") or m.get("name", "Team Member")
        fname_lower = fname.strip().lower()

        has_logged = (uid in logged_user_ids) or (fname_lower in logged_names)
        if not has_logged:
            try:
                await EmailService.send_log_reminder(
                    recipient_email=m["email"],
                    recipient_name=fname,
                    missing_dates=[prev_workday_str],
                    custom_message=f"Morning Reminder: You have an unlogged work submission for {prev_workday_str}. Please take 2 minutes to backfill your tasks.",
                )
                reminded_count += 1
                logger.info(f"[Scheduler] Morning reminder email dispatched to {m['email']}")
            except Exception as err:
                logger.error(f"[Scheduler] Failed to send morning reminder to {m['email']}: {err}")

    logger.info(f"[Scheduler] Morning reminder check complete. {reminded_count} members reminded for {prev_workday_str}.")


async def start_automated_log_reminder_scheduler():
    """Background continuous polling loop with widened catch-up windows for 10:00 AM and 8:00 PM Asia/Karachi."""
    logger.info("[Scheduler] Automated Daily Log Email Reminder background worker started (Working Days: 10:00 AM & 8:00 PM PKT).")

    while True:
        try:
            now_pk = datetime.now(PK_TZ)
            today_str = now_pk.strftime("%Y-%m-%d")
            hour = now_pk.hour

            # Working days check: Monday-Friday + 2nd, 3rd, 4th, 5th Saturday (1st Saturday & Sunday are OFF)
            if is_workday(now_pk):
                # 1. Morning Catch-up Window: Anytime from 10:00 AM until 7:59 PM
                if 10 <= hour < 20:
                    already_ran_morning = await _has_run_today("morning", today_str)
                    if not already_ran_morning:
                        await _mark_run_today("morning", today_str)
                        await run_morning_log_reminder_check()

                # 2. Evening Catch-up Window: Anytime from 8:00 PM onwards (hour >= 20)
                if hour >= 20:
                    already_ran_evening = await _has_run_today("evening", today_str)
                    if not already_ran_evening:
                        await _mark_run_today("evening", today_str)
                        await run_evening_log_reminder_check()

            # Sleep 30 seconds before next time check
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            logger.info("[Scheduler] Daily Log Email Reminder worker cancelled.")
            break
        except Exception as err:
            logger.error(f"[Scheduler] Exception in reminder worker loop: {err}")
            await asyncio.sleep(30)
