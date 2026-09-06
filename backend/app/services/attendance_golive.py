"""
Attendance go-live cutoff.

Until 21 Aug 2026 00:00 PKT, 19–20 Aug stay available for testing.
At/after midnight on 21 Aug, pre-go-live attendance is deleted and tracking
starts on 21 Aug (unpunched workdays render as absent).
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict
from zoneinfo import ZoneInfo

from app.database import get_database

logger = logging.getLogger("app.attendance_golive")

PK_TZ = ZoneInfo("Asia/Karachi")
ATTENDANCE_GO_LIVE_DATE = "2026-08-21"
ATTENDANCE_TEST_START_DATE = "2026-08-19"


def pkt_today_str() -> str:
    return datetime.now(PK_TZ).strftime("%Y-%m-%d")


def is_go_live_reached(today: str | None = None) -> bool:
    return (today or pkt_today_str()) >= ATTENDANCE_GO_LIVE_DATE


def get_effective_start_date(today: str | None = None) -> str:
    """19 Aug while testing; 21 Aug once go-live midnight has passed."""
    return ATTENDANCE_GO_LIVE_DATE if is_go_live_reached(today) else ATTENDANCE_TEST_START_DATE


def get_employee_attendance_start(user: Dict[str, Any] | None, today: str | None = None) -> str:
    """Per-employee floor: max(company go-live/test start, joining_date)."""
    company = get_effective_start_date(today)
    joining = str((user or {}).get("joining_date") or "").strip()
    if joining and joining > company:
        return joining
    return company


async def purge_pre_joining_attendance(user_id: str, joining_date: str) -> Dict[str, Any]:
    """Delete attendance rows for a user before their joining_date."""
    joining = (joining_date or "").strip()
    if not user_id or not joining:
        return {"purged": False, "attendance_deleted": 0, "reason": "missing_user_or_date"}

    db = get_database()
    if db is None:
        return {"purged": False, "attendance_deleted": 0, "reason": "database_unavailable"}

    result = await db.attendance_records.delete_many(
        {"user_id": user_id, "date": {"$lt": joining}}
    )
    logger.info(
        "[JoiningDate] Purged pre-%s attendance for user %s: deleted=%s",
        joining,
        user_id,
        result.deleted_count,
    )
    return {
        "purged": True,
        "user_id": user_id,
        "joining_date": joining,
        "attendance_deleted": result.deleted_count,
    }


async def purge_pre_go_live_attendance(force: bool = False) -> Dict[str, Any]:
    """
    Deletes attendance (and closed test leave requests) before 21 Aug.
    No-op before go-live so 19–20 Aug can still be used for testing tonight.
    Idempotent after go-live.
    """
    today = pkt_today_str()
    if not force and not is_go_live_reached(today):
        logger.info(
            "[GoLive] Skip purge; PKT today %s is before %s (testing window open).",
            today,
            ATTENDANCE_GO_LIVE_DATE,
        )
        return {
            "purged": False,
            "today": today,
            "go_live_date": ATTENDANCE_GO_LIVE_DATE,
            "attendance_deleted": 0,
            "leave_requests_deleted": 0,
        }

    db = get_database()
    if db is None:
        logger.warning("[GoLive] Database unavailable; cannot purge pre-go-live attendance.")
        return {
            "purged": False,
            "today": today,
            "error": "database_unavailable",
            "attendance_deleted": 0,
            "leave_requests_deleted": 0,
        }

    att_result = await db.attendance_records.delete_many({"date": {"$lt": ATTENDANCE_GO_LIVE_DATE}})
    leave_result = await db.leave_requests.delete_many({"end_date": {"$lt": ATTENDANCE_GO_LIVE_DATE}})

    logger.info(
        "[GoLive] Purged pre-%s data: attendance=%s leave_requests=%s",
        ATTENDANCE_GO_LIVE_DATE,
        att_result.deleted_count,
        leave_result.deleted_count,
    )
    return {
        "purged": True,
        "today": today,
        "go_live_date": ATTENDANCE_GO_LIVE_DATE,
        "attendance_deleted": att_result.deleted_count,
        "leave_requests_deleted": leave_result.deleted_count,
    }
