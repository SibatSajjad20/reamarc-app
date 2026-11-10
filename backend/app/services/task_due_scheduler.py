"""Due / overdue / reminder / recurrence scheduler for Task Manager.

Tick every 15 minutes. Uses company timezone (default Asia/Karachi), not UTC date.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.database import get_database
from app.schemas.task import DEFAULT_REMINDER_OFFSETS, OPEN_STATUSES
from app.services.task_activity import log_task_activity
from app.services.task_notifications import dispatch_task_event
from app.services.task_service import (
    follow_up_bucket,
    get_task_settings,
    local_now,
    maybe_spawn_recurrence,
    parse_due_datetime,
)

logger = logging.getLogger("app.tasks.scheduler")

TICK_SECONDS = 15 * 60


async def _claim(user_id: str, date_str: str, kind: str) -> bool:
    from app.services.push_service import try_claim_scheduled_push

    try:
        return await try_claim_scheduled_push(user_id, date_str, kind)
    except Exception:
        return False


async def run_task_due_tick(
    db=None,
    company: Optional[Dict[str, Any]] = None,
    now: Optional[datetime] = None,
) -> Dict[str, int]:
    """One scheduler pass. `now` is injectable for frozen-time tests."""
    if db is None:
        db = get_database()
    if db is None:
        return {"skipped": 1}

    local = local_now(company, now)
    today = local.strftime("%Y-%m-%d")
    hour = local.hour
    stats = {
        "reminders": 0,
        "due_today": 0,
        "overdue": 0,
        "digests": 0,
        "recurrence": 0,
    }

    open_tasks = await db.tasks.find({"status": {"$in": list(OPEN_STATUSES)}}).to_list(5000)
    digest_ids: Dict[str, List[Dict[str, Any]]] = {}

    for task in open_tasks:
        due_at = parse_due_datetime(task, company)
        bucket = follow_up_bucket(task, company, now)

        # Reminders are automatic: 24h and 1h before due. Task reminder_offsets are ignored.
        offsets = list(DEFAULT_REMINDER_OFFSETS)
        due_date_key = str(task.get("due_date") or "")
        if due_at is not None and due_date_key:
            for offset in offsets:
                try:
                    minutes = int(offset)
                except Exception:
                    continue
                fire_at = due_at - timedelta(minutes=minutes)
                if fire_at <= local < due_at:
                    assignee = str(task.get("assignee_id") or "")
                    if assignee and await _claim(assignee, due_date_key, f"task_due_soon:{task.get('id')}:{minutes}"):
                        await dispatch_task_event(
                            task,
                            "task_due_soon",
                            f"Due soon: {task.get('serial')}",
                            f"{task.get('serial')} — {task.get('title')} is due {due_date_key}",
                        )
                        await log_task_activity(db, task, "reminder_sent", None, f"offset {minutes}")
                        stats["reminders"] += 1

        # Due today at 09:00 company tz
        if bucket == "today" and hour == 9:
            assignee = str(task.get("assignee_id") or "")
            if assignee and await _claim(assignee, today, f"task_due_today:{task.get('id')}"):
                await dispatch_task_event(
                    task,
                    "task_due_today",
                    f"Due today: {task.get('serial')}",
                    f"{task.get('serial')} — {task.get('title')} is due {today}",
                )
                stats["due_today"] += 1

        # Overdue: first per-task alert, then daily digest
        if bucket == "overdue":
            recipients = [
                str(task.get("assignee_id") or ""),
                str(task.get("assigner_id") or ""),
                str(task.get("creator_id") or ""),
            ]
            last = str(task.get("last_overdue_notified_on") or "")
            if last != today:
                if not last:
                    sent = False
                    for uid in {r for r in recipients if r}:
                        if await _claim(uid, today, f"task_overdue:{task.get('id')}"):
                            sent = True
                    if sent:
                        await dispatch_task_event(
                            task,
                            "task_overdue",
                            f"Overdue: {task.get('serial')}",
                            f"{task.get('serial')} — {task.get('title')} was due {task.get('due_date')}",
                        )
                        await log_task_activity(db, task, "overdue_notified", None, today)
                        stats["overdue"] += 1
                else:
                    for uid in {r for r in recipients if r}:
                        digest_ids.setdefault(uid, []).append(task)
                await db.tasks.update_one({"id": task["id"]}, {"$set": {"last_overdue_notified_on": today}})

        # Recurrence: next date arrived
        rec = task.get("recurrence")
        source = task.get("recurrence_source_id")
        if rec and not source:
            from app.services.task_service import next_occurrence

            nxt = next_occurrence(task.get("due_date"), rec)
            if nxt and nxt <= today:
                spawned = await maybe_spawn_recurrence(db, task)
                if spawned:
                    stats["recurrence"] += 1

    for uid, tasks in digest_ids.items():
        if not tasks:
            continue
        if await _claim(uid, today, "task_overdue_digest"):
            n = len(tasks)
            # Send against the first task so data.task_id still deep-links somewhere useful.
            await dispatch_task_event(
                tasks[0],
                "task_overdue",
                f"You have {n} overdue task{'s' if n != 1 else ''}",
                ", ".join(str(t.get("serial") or "") for t in tasks[:8]),
                extra=[uid],
            )
            stats["digests"] += 1

    return stats


async def _tick_company(company: Dict[str, Any]) -> None:
    db = get_database()
    await run_task_due_tick(db, company=company)


async def start_task_due_scheduler() -> None:
    from app.core.job_locks import job_lease
    from app.core.tenant import for_each_active_company
    from app.config import settings

    logger.info("[Task Manager] Due/overdue scheduler started (15 min tick).")
    while True:
        try:
            async with job_lease("task_due_tick", ttl_seconds=TICK_SECONDS) as acquired:
                if acquired:
                    if getattr(settings, "MULTI_TENANT_ENABLED", False):
                        await for_each_active_company(_tick_company)
                    else:
                        await run_task_due_tick()
        except asyncio.CancelledError:
            logger.info("[Task Manager] Due scheduler stopped.")
            raise
        except Exception as err:
            logger.warning("[Task Manager] Due scheduler tick error: %s", err)
        await asyncio.sleep(TICK_SECONDS)


def stop_task_due_scheduler() -> None:
    return None


async def run_once(now: Optional[datetime] = None) -> Dict[str, int]:
    from app.core.tenant import for_each_active_company
    from app.config import settings

    totals = {"reminders": 0, "due_today": 0, "overdue": 0, "digests": 0, "recurrence": 0}

    async def _one(company):
        stats = await run_task_due_tick(company=company, now=now)
        for k, v in stats.items():
            totals[k] = totals.get(k, 0) + int(v)

    if getattr(settings, "MULTI_TENANT_ENABLED", False):
        await for_each_active_company(_one)
    else:
        stats = await run_task_due_tick(now=now)
        for k, v in stats.items():
            totals[k] = totals.get(k, 0) + int(v)
    return totals


def _hosts_are_local(uri: str) -> bool:
    import pymongo.uri_parser
    from urllib.parse import urlparse

    hosts: list[str] = []
    try:
        parsed = pymongo.uri_parser.parse_uri(uri)
        hosts = [h[0].lower() for h in parsed.get("nodelist", [])]
    except Exception:
        try:
            p = urlparse(uri)
            if p.hostname:
                hosts = [p.hostname.lower()]
        except Exception:
            hosts = []
    if not hosts:
        return False
    return all(h in {"localhost", "127.0.0.1", "::1"} for h in hosts)


def _refuse_remote() -> None:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)
    from app.config import settings

    uri = str(getattr(settings, "MONGODB_URL", "") or os.environ.get("MONGODB_URL", "")).strip()
    db_name = str(getattr(settings, "MONGODB_DB_NAME", "") or os.environ.get("MONGODB_DB_NAME", "")).strip()
    env = str(os.environ.get("ENVIRONMENT") or getattr(settings, "ENVIRONMENT", "") or "").strip().lower()
    if env == "production" or db_name != "reamarc_test_db" or not _hosts_are_local(uri):
        print("[ERROR] Refusing to run task scheduler against a non-local reamarc_test_db.", file=sys.stderr)
        sys.exit(1)


async def _cli_once() -> None:
    from app.database import connect_to_mongo, close_mongo_connection

    _refuse_remote()
    await connect_to_mongo()
    try:
        stats = await run_once()
        print(stats)
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    if "--once" in sys.argv:
        asyncio.run(_cli_once())
    else:
        print("Usage: python -m app.services.task_due_scheduler --once")
        sys.exit(2)
