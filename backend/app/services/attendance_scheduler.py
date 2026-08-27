"""
Midnight APScheduler Background Worker for Attendance & Shift Management.

Responsibilities:
1. APScheduler AsyncIOScheduler running with Asia/Karachi (PKT) timezone.
2. Daily Midnight Cron at 00:01 PKT (19:01 UTC):
   - Missed Punch Transition: Finds all unclosed punch records from yesterday (check_in != None and check_out == None)
     with status in (present, late, checked_in). Transitions them to status="missed_punch", is_missed_punch=True,
     sets work_hours=0, working_hours_minutes=0, overtime_hours=0, undertime_hours=expected_shift_hours.
     This prevents runaway overtime for employees who forgot to punch out.
   - Absentee Detection: Evaluates if yesterday was an official working day (not a Sunday, not 1st Saturday off,
     and not a calendar holiday). Finds all active internal users who do NOT have an attendance record and do NOT
     have an approved full leave or WFH for yesterday. Inserts an attendance record with status="absent",
     work_hours=0, undertime_hours=expected_shift_hours.
3. Explicit manual/test execution support via run_midnight_attendance_job_now(target_date=None).
4. Lifecycle management: start_attendance_scheduler() and shutdown_attendance_scheduler().
"""
import logging
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional, Dict, Any, List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.database import get_database
from app.models.attendance import (
    AttendanceStatus,
    LeaveType,
    LeaveStatus,
    CalendarEventType,
)
from app.services.attendance_calculator import (
    format_minutes_to_hhmm,
)
from app.services import attendance_service

logger = logging.getLogger("app.attendance_scheduler")

PK_TZ = ZoneInfo("Asia/Karachi")

# Global scheduler singleton instance
_attendance_scheduler: Optional[AsyncIOScheduler] = None


async def is_workday_for_date(target_date_str: str) -> bool:
    """
    Evaluates whether a given date (YYYY-MM-DD) is an official working day:
    - Checks company_calendar for public holidays (event_type='holiday' -> False).
    - Checks company_calendar for working Saturday overrides (event_type='working_saturday' or is_workday_override=True -> True).
    - Checks Sunday (weekday == 6 -> False).
    - Checks 1st Saturday of the month (weekday == 5 and day <= 7 -> False).
    - All other days (Mon-Fri and remaining Saturdays) -> True.
    """
    db = get_database()
    try:
        parsed_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return False

    if db is not None:
        try:
            cal_event = await db.company_calendar.find_one({"date": target_date_str}, {"_id": 0})
            if cal_event:
                ev_type = cal_event.get("event_type")
                if ev_type in (CalendarEventType.HOLIDAY.value, "holiday"):
                    return False
                if cal_event.get("is_workday_override") or ev_type in (
                    CalendarEventType.WORKING_SATURDAY.value,
                    "working_saturday",
                ):
                    return True
        except Exception as e:
            logger.warning(f"[Scheduler] Error checking company_calendar for {target_date_str}: {e}")

    # Sunday check
    if parsed_date.weekday() == 6:
        return False

    # 1st Saturday of the month check (day 1 to 7)
    if parsed_date.weekday() == 5 and parsed_date.day <= 7:
        return False

    return True


async def run_midnight_attendance_job_now(target_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Executes the midnight attendance processing job for a target date (defaults to yesterday in PKT):
    1. Transitions unclosed sessions to missed_punch with 0 work hours and expected undertime.
    2. Identifies and records absentees on scheduled workdays.
    """
    db = get_database()
    if db is None:
        logger.warning("[Scheduler] Database unavailable for midnight attendance job.")
        return {
            "target_date": target_date,
            "success": False,
            "error": "Database unavailable",
            "missed_punches_flagged": 0,
            "absentees_flagged": 0,
            "is_workday": False,
        }

    # If target_date is not provided, calculate yesterday's date in Asia/Karachi timezone
    if not target_date:
        now_pk = datetime.now(PK_TZ)
        target_date = (now_pk - timedelta(days=1)).strftime("%Y-%m-%d")

    logger.info(f"[Scheduler] Running Midnight Attendance Job for target date: {target_date}...")

    from app.services.attendance_golive import (
        ATTENDANCE_GO_LIVE_DATE,
        purge_pre_go_live_attendance,
    )

    purge_result = await purge_pre_go_live_attendance()

    now_iso = datetime.now(timezone.utc).isoformat()
    missed_punches_flagged = 0
    absentees_flagged = 0

    if target_date < ATTENDANCE_GO_LIVE_DATE:
        logger.info(
            "[Scheduler] Skipping missed-punch/absent processing for %s (before go-live %s).",
            target_date,
            ATTENDANCE_GO_LIVE_DATE,
        )
        return {
            "target_date": target_date,
            "success": True,
            "is_workday": False,
            "missed_punches_flagged": 0,
            "absentees_flagged": 0,
            "skipped_pre_go_live": True,
            "purge": purge_result,
        }

    # ──────────────────────────────────────────────────────────
    # STEP 1: MISSED PUNCH TRANSITION
    # ──────────────────────────────────────────────────────────
    # Find all records for target_date where check_in is set, check_out is None,
    # and record has not yet been marked as missed_punch.
    unclosed_query = {
        "date": target_date,
        "$or": [
            {"check_in": {"$ne": None}},
            {"punch_in": {"$ne": None}},
        ],
        "check_out": None,
        "punch_out": None,
        "is_missed_punch": {"$ne": True},
        "status": {"$ne": AttendanceStatus.MISSED_PUNCH.value},
    }

    try:
        unclosed_records = await db.attendance_records.find(unclosed_query, {"_id": 0}).to_list(1000)
        for rec in unclosed_records:
            u_id = rec.get("user_id")
            u_dept = rec.get("department")
            shift_id = rec.get("shift_id")

            # Resolve user's shift for expected hours
            shift = await attendance_service.get_shift_by_id(shift_id) if shift_id else None
            if not shift:
                shift = await attendance_service.get_shift_for_user(u_id, u_dept, target_date)

            expected_hours = float(shift.expected_hours) if shift else 8.0
            expected_minutes = int(round(expected_hours * 60))

            existing_notes = rec.get("notes") or ""
            updated_notes = (
                f"{existing_notes} | Flagged as Missed Punch by Midnight Background Worker".strip(" | ")
            )

            update_doc = {
                "status": AttendanceStatus.MISSED_PUNCH.value,
                "is_missed_punch": True,
                "work_hours": 0.0,
                "working_hours_minutes": 0,
                "work_duration_formatted": "00:00",
                "overtime_hours": 0.0,
                "overtime_minutes": 0,
                "overtime_formatted": "+00:00",
                "undertime_hours": expected_hours,
                "undertime_minutes": expected_minutes,
                "undertime_formatted": format_minutes_to_hhmm(-expected_minutes, show_sign=True),
                "notes": updated_notes,
                "updated_at": now_iso,
            }

            await db.attendance_records.update_one(
                {"user_id": u_id, "date": target_date},
                {"$set": update_doc},
            )
            missed_punches_flagged += 1

        logger.info(
            f"[Scheduler] Flagged {missed_punches_flagged} unclosed records as missed_punch for {target_date}."
        )
    except Exception as e:
        logger.error(f"[Scheduler] Error processing missed punch transition for {target_date}: {e}")

    # ──────────────────────────────────────────────────────────
    # STEP 2: ABSENTEE DETECTION
    # ──────────────────────────────────────────────────────────
    is_workday = await is_workday_for_date(target_date)

    if not is_workday:
        logger.info(
            f"[Scheduler] Target date {target_date} is not an official workday (Weekend/Holiday). Skipping absentee detection."
        )
    else:
        try:
            # 1. Fetch all active internal users (excluding client accounts)
            user_query = {"is_active": True, "role": {"$nin": ["client", "CLIENT"]}}
            users = await db.users.find(user_query, {"_id": 0, "id": 1, "full_name": 1, "name": 1, "department": 1}).to_list(1000)

            # 2. Fetch existing attendance records for target_date
            existing_records = await db.attendance_records.find(
                {"date": target_date},
                {"_id": 0, "user_id": 1}
            ).to_list(2000)
            recorded_user_ids = {r["user_id"] for r in existing_records if r.get("user_id")}

            # 3. Fetch approved leaves / WFH covering target_date
            approved_leaves = await db.leave_requests.find(
                {
                    "status": LeaveStatus.APPROVED.value,
                    "start_date": {"$lte": target_date},
                    "end_date": {"$gte": target_date},
                },
                {"_id": 0, "user_id": 1}
            ).to_list(1000)
            approved_leave_user_ids = {l["user_id"] for l in approved_leaves if l.get("user_id")}

            # 4. Identify absentees: Active internal users with no attendance record and no approved leave/WFH
            for u in users:
                u_id = u.get("id")
                if not u_id:
                    continue

                if u_id in recorded_user_ids or u_id in approved_leave_user_ids:
                    continue

                u_name = u.get("full_name") or u.get("name", "User")
                u_dept = u.get("department")

                shift = await attendance_service.get_shift_for_user(u_id, u_dept, target_date)
                expected_hours = float(shift.expected_hours) if shift else 8.0
                expected_minutes = int(round(expected_hours * 60))
                auto_wfh = await attendance_service.is_auto_wfh_for_date(u_id, target_date)
                day_status = AttendanceStatus.WFH.value if auto_wfh else AttendanceStatus.ABSENT.value
                day_notes = (
                    "Auto-marked WFH from weekday pattern by Midnight Background Worker"
                    if auto_wfh
                    else "Auto-marked Absent by Midnight Background Worker"
                )

                absent_doc = {
                    "user_id": u_id,
                    "user_name": u_name,
                    "department": u_dept,
                    "date": target_date,
                    "shift_id": shift.id if shift else "shift_standard",
                    "shift_name": shift.name if shift else "Standard Shift",
                    "check_in": None,
                    "check_out": None,
                    "work_hours": 0.0 if not auto_wfh else expected_hours,
                    "working_hours_minutes": 0 if not auto_wfh else expected_minutes,
                    "work_duration_formatted": "00:00" if not auto_wfh else format_minutes_to_hhmm(expected_minutes),
                    "overtime_hours": 0.0,
                    "overtime_minutes": 0,
                    "overtime_formatted": "+00:00",
                    "undertime_hours": 0.0 if auto_wfh else expected_hours,
                    "undertime_minutes": 0 if auto_wfh else expected_minutes,
                    "undertime_formatted": "+00:00" if auto_wfh else format_minutes_to_hhmm(-expected_minutes, show_sign=True),
                    "late_minutes": 0,
                    "is_late": False,
                    "late_strike": 0,
                    "status": day_status,
                    "is_wfh": bool(auto_wfh),
                    "is_missed_punch": False,
                    "is_short_leave": False,
                    "short_leave_hours": 0.0,
                    "notes": day_notes,
                    "updated_at": now_iso,
                }

                await db.attendance_records.update_one(
                    {"user_id": u_id, "date": target_date},
                    {
                        "$set": absent_doc,
                        "$setOnInsert": {
                            "id": f"att_{u_id}_{target_date}",
                            "created_at": now_iso,
                        },
                    },
                    upsert=True,
                )
                absentees_flagged += 1

            logger.info(
                f"[Scheduler] Absentee detection complete. Inserted {absentees_flagged} absentee records for {target_date}."
            )
        except Exception as e:
            logger.error(f"[Scheduler] Error running absentee detection for {target_date}: {e}")

    result = {
        "target_date": target_date,
        "success": True,
        "is_workday": is_workday,
        "missed_punches_flagged": missed_punches_flagged,
        "absentees_flagged": absentees_flagged,
    }
    logger.info(f"[Scheduler] Midnight job completed successfully for {target_date}: {result}")
    return result


async def close_elapsed_shifts_now() -> Dict[str, Any]:
    """
    Auto-closes elapsed shifts throughout the day:
    1. Flags unclosed sessions (check_in without check_out) as Missed Punch after shift window closes.
    2. Marks unpunched employees as Absent after shift end.
    Runs throughout the day so shift transitions occur promptly rather than only at midnight.
    """
    db = get_database()
    if db is None:
        return {"success": False, "closed": 0, "missed_flagged": 0, "error": "Database unavailable"}

    now_pkt = attendance_service.get_now_pkt()
    now_iso = datetime.now(timezone.utc).isoformat()
    closed = 0
    missed_flagged = 0
    skipped = 0
    try:
        users = await db.users.find(
            {"is_active": True, "role": {"$nin": ["client", "CLIENT", "admin", "ADMIN"]}},
            {"_id": 0, "hashed_password": 0},
        ).to_list(1000)
        today_str = now_pkt.strftime("%Y-%m-%d")
        yesterday_str = (now_pkt.date() - timedelta(days=1)).isoformat()
        for user in users:
            uid = user.get("id")
            dept = user.get("department")
            for check_date in (today_str, yesterday_str):
                shift = await attendance_service.get_shift_for_user(uid, dept, check_date)
                is_auto_wfh = await attendance_service.is_auto_wfh_for_date(uid, check_date)

                if not attendance_service.is_checkout_window_closed(shift, now_pkt):
                    continue
                date_str = attendance_service.closed_shift_attendance_date(shift, now_pkt)
                if date_str != check_date:
                    continue
                if not await is_workday_for_date(date_str):
                    skipped += 1
                    continue

                before = await db.attendance_records.find_one(
                    {"user_id": uid, "date": date_str},
                    {"_id": 0},
                )
                cin = before.get("check_in") or before.get("punch_in") if before else None
                cout = before.get("check_out") or before.get("punch_out") if before else None

                # Case 1: Punched in, but never punched out and shift is closed -> Transition to missed punch
                if cin and not cout:
                    if not before.get("is_missed_punch") and str(before.get("status")) != AttendanceStatus.MISSED_PUNCH.value:
                        expected_hours = float(shift.expected_hours) if shift else 8.0
                        expected_minutes = int(round(expected_hours * 60))
                        existing_notes = before.get("notes") or ""
                        updated_notes = (
                            f"{existing_notes} | Flagged as Missed Punch after shift window closed".strip(" | ")
                        )
                        update_doc = {
                            "status": AttendanceStatus.MISSED_PUNCH.value,
                            "is_missed_punch": True,
                            "work_hours": 0.0,
                            "working_hours_minutes": 0,
                            "work_duration_formatted": "00:00",
                            "overtime_hours": 0.0,
                            "overtime_minutes": 0,
                            "overtime_formatted": "+00:00",
                            "undertime_hours": expected_hours,
                            "undertime_minutes": expected_minutes,
                            "undertime_formatted": format_minutes_to_hhmm(-expected_minutes, show_sign=True),
                            "notes": updated_notes,
                            "updated_at": now_iso,
                        }
                        await db.attendance_records.update_one(
                            {"user_id": uid, "date": date_str},
                            {"$set": update_doc},
                        )
                        missed_flagged += 1
                    continue

                # Case 2: Never punched in -> Mark absent (skip auto-WFH)
                if is_auto_wfh:
                    skipped += 1
                    continue

                if not cin and not cout:
                    doc = await attendance_service.persist_auto_absent(
                        user,
                        shift,
                        date_str,
                        notes="Auto-marked Absent after shift end without check-in",
                    )
                    if doc and str(doc.get("status")) == AttendanceStatus.ABSENT.value and not (
                        doc.get("check_in") or doc.get("punch_in")
                    ):
                        if not before or str(before.get("status")) != AttendanceStatus.ABSENT.value:
                            closed += 1
    except Exception as e:
        logger.error(f"[Scheduler] Error closing elapsed shifts: {e}")
        return {"success": False, "closed": closed, "missed_flagged": missed_flagged, "error": str(e)}

    if closed or missed_flagged:
        logger.info(f"[Scheduler] Closed {closed} elapsed shift(s) as absent, {missed_flagged} as missed punch.")
    return {"success": True, "closed": closed, "missed_flagged": missed_flagged, "skipped": skipped}


def start_attendance_scheduler() -> AsyncIOScheduler:
    """
    Initializes and starts the APScheduler AsyncIOScheduler with Asia/Karachi timezone.
    Schedules daily midnight cron at 00:01 PKT (19:01 UTC).
    """
    global _attendance_scheduler

    if _attendance_scheduler is not None and _attendance_scheduler.running:
        logger.info("[Scheduler] Attendance scheduler is already running.")
        return _attendance_scheduler

    _attendance_scheduler = AsyncIOScheduler(timezone=PK_TZ)

    from app.services.attendance_golive import purge_pre_go_live_attendance

    _attendance_scheduler.add_job(
        purge_pre_go_live_attendance,
        CronTrigger(hour=0, minute=0, timezone=PK_TZ),
        id="attendance_go_live_purge",
        name="Purge 19-20 Aug attendance at go-live midnight PKT",
        replace_existing=True,
    )

    # Schedule daily job at 00:01 PKT
    _attendance_scheduler.add_job(
        run_midnight_attendance_job_now,
        CronTrigger(hour=0, minute=1, timezone=PK_TZ),
        id="midnight_attendance_job",
        name="Daily Midnight Attendance & Missed Punch Processing",
        replace_existing=True,
    )

    # Close shifts throughout the day once each employee's end time has passed
    _attendance_scheduler.add_job(
        close_elapsed_shifts_now,
        IntervalTrigger(minutes=5, timezone=PK_TZ),
        id="close_elapsed_shifts",
        name="Auto-close unpunched shifts after end time",
        replace_existing=True,
        next_run_time=datetime.now(PK_TZ) + timedelta(seconds=15),
    )

    from app.services.mobile_push_scheduler import run_mobile_reminder_tick

    _attendance_scheduler.add_job(
        run_mobile_reminder_tick,
        IntervalTrigger(minutes=1, timezone=PK_TZ),
        id="mobile_punch_reminders",
        name="Shift-relative mobile punch reminders",
        replace_existing=True,
        next_run_time=datetime.now(PK_TZ) + timedelta(seconds=30),
    )

    _attendance_scheduler.start()
    logger.info("[Scheduler] Attendance scheduler started (midnight, shift close, mobile reminders).")
    return _attendance_scheduler


def shutdown_attendance_scheduler() -> None:
    """
    Gracefully shuts down the attendance scheduler.
    """
    global _attendance_scheduler

    if _attendance_scheduler is not None:
        try:
            if _attendance_scheduler.running:
                _attendance_scheduler.shutdown(wait=False)
                logger.info("[Scheduler] Attendance scheduler shut down successfully.")
        except Exception as e:
            logger.warning(f"[Scheduler] Error during attendance scheduler shutdown: {e}")
        finally:
            _attendance_scheduler = None
