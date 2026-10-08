"""
Periodic background job for Website Projects: due date reminders and overdue detection.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from app.database import get_database

logger = logging.getLogger("app.website.scheduler")


async def run_website_due_tick() -> None:
    db = get_database()
    if db is None:
        return

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        # Find active projects
        projects_cursor = db.website_projects.find({"stage": {"$ne": "completed"}})
        projects = await projects_cursor.to_list(length=1000)

        for p in projects:
            pid = p["id"]
            tasks_cursor = db.website_project_tasks.find({
                "project_id": pid,
                "status": {"$ne": "completed"},
            })
            open_tasks = await tasks_cursor.to_list(length=500)

            # Check tasks due today or overdue
            for t in open_tasks:
                due = t.get("due_date")
                if not due:
                    continue
                due_str = str(due)[:10]

                assignee_id = t.get("assignee_id")
                if not assignee_id:
                    continue

                if due_str == today:
                    receipt_key = f"notif_task_due_{t['id']}_{today}"
                    already_notified = await db.website_project_activities.find_one({
                        "project_id": pid,
                        "type": receipt_key,
                    })
                    if already_notified:
                        continue

                    from app.services.push_service import dispatch_to_users
                    await dispatch_to_users(
                        user_ids=[assignee_id],
                        title=f"Website Task Due Today: {t.get('name')}",
                        body=f"Task '{t.get('name')}' on {p.get('name')} is due today.",
                        kind="website_task_due",
                        data={
                            "project_id": pid,
                            "task_id": t["id"],
                            "stage": t.get("stage"),
                            "type": "task_due",
                        },
                    )
                    await db.website_project_activities.insert_one({
                        "id": f"wact_{today}_{t['id']}_due",
                        "project_id": pid,
                        "type": receipt_key,
                        "body": f"Due today reminder sent to {assignee_id}",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
                elif due_str < today:
                    receipt_key = f"notif_task_overdue_{t['id']}_{today}"
                    already_notified = await db.website_project_activities.find_one({
                        "project_id": pid,
                        "type": receipt_key,
                    })
                    if already_notified:
                        continue

                    recipients = [assignee_id]
                    pm_id = p.get("manager_id")
                    if pm_id and str(pm_id) != str(assignee_id):
                        recipients.append(str(pm_id))

                    from app.services.push_service import dispatch_to_users
                    await dispatch_to_users(
                        user_ids=recipients,
                        title=f"Website Task Overdue: {t.get('name')} ⚠️",
                        body=f"Task '{t.get('name')}' on {p.get('name')} is overdue since {due_str}.",
                        kind="website_task_overdue",
                        data={
                            "project_id": pid,
                            "task_id": t["id"],
                            "stage": t.get("stage"),
                            "type": "task_overdue",
                        },
                    )
                    await db.website_project_activities.insert_one({
                        "id": f"wact_{today}_{t['id']}_overdue",
                        "project_id": pid,
                        "type": receipt_key,
                        "body": f"Overdue reminder sent to {', '.join(recipients)}",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
    except Exception as e:
        logger.warning(f"Website due tick encountered error: {e}")


async def start_website_due_scheduler() -> None:
    logger.info("[Website Pipeline] Due/Overdue scheduler started (1 hour tick).")
    while True:
        try:
            await run_website_due_tick()
        except asyncio.CancelledError:
            logger.info("[Website Pipeline] Due scheduler stopped.")
            raise
        except Exception as err:
            logger.warning(f"[Website Pipeline] Due scheduler tick error: {err}")
        # Run check once per hour
        await asyncio.sleep(3600)
