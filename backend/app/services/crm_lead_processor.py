"""CRM Asynchronous Lead Event Buffer & Retry Processor.

Ensures zero dropped leads from Meta, Google Ads, and other social webhooks by:
1. Immediately acknowledging webhooks (<100ms) with HTTP 200 after signature verification.
2. Persisting raw event payloads to `crm_lead_events`.
3. Asynchronously processing lead retrieval and assignment.
4. Automatically retrying with exponential backoff on downstream network / Graph API errors.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.database import get_database

logger = logging.getLogger("app.crm.lead_processor")

RETRY_DELAYS_SECONDS = [30, 120, 600, 1800, 3600]
MAX_RETRY_ATTEMPTS = 5


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable.")
    return db


async def queue_webhook_event(
    platform: str,
    payload: Dict[str, Any],
    *,
    headers: Optional[Dict[str, str]] = None,
    source_id: Optional[str] = None,
) -> str:
    """Store an incoming webhook event immediately and schedule async processing."""
    db = _db()
    event_id = f"evt_{uuid.uuid4().hex[:12]}"
    now = _now()
    doc = {
        "id": event_id,
        "platform": platform.lower().strip(),
        "status": "pending",
        "payload": payload,
        "headers": headers or {},
        "source_id": source_id,
        "attempts": 0,
        "max_attempts": MAX_RETRY_ATTEMPTS,
        "last_error": None,
        "next_retry_at": None,
        "created_at": now,
        "updated_at": now,
        "processed_at": None,
        "result": None,
    }
    await db.crm_lead_events.insert_one(doc)

    # Schedule immediate non-blocking processing
    asyncio.create_task(_safe_process_event(event_id))
    return event_id


async def _safe_process_event(event_id: str) -> None:
    try:
        await process_lead_event(event_id)
    except Exception as err:
        logger.warning("[CRM Processor] Async processing error for %s: %s", event_id, err)


async def process_lead_event(event_id: str) -> Dict[str, Any]:
    """Execute processing for a single queued lead event with atomic status transitions."""
    db = _db()
    now = _now()

    # Atomically lock event for processing
    event = await db.crm_lead_events.find_one_and_update(
        {"id": event_id, "status": {"$in": ["pending", "retry"]}},
        {"$set": {"status": "processing", "updated_at": now}},
        return_document=True,
    )
    if not event:
        # Already processing or completed
        return {"ok": False, "reason": "Event already processing or finalized."}

    platform = event.get("platform")
    payload = event.get("payload") or {}
    attempts = int(event.get("attempts") or 0)

    try:
        from app.services import crm_ingest

        if platform == "meta":
            result = await crm_ingest.process_meta_webhook_payload(payload)
            # If errors occurred and nothing succeeded, treat as transient failure
            errors = result.get("errors") or []
            created = result.get("created", 0)
            duplicates = result.get("duplicates", 0)
            if errors and (created == 0 and duplicates == 0):
                raise RuntimeError(f"Meta leadgen processing failed: {'; '.join(errors)}")
        elif platform == "google_ads":
            result = await crm_ingest.process_google_lead_payload(payload)
        else:
            raise ValueError(f"Unknown webhook platform: {platform}")

        # Mark completed
        await db.crm_lead_events.update_one(
            {"id": event_id},
            {
                "$set": {
                    "status": "completed",
                    "result": result,
                    "processed_at": _now(),
                    "updated_at": _now(),
                    "last_error": None,
                }
            },
        )
        return {"ok": True, "result": result}

    except Exception as exc:
        new_attempts = attempts + 1
        err_msg = str(exc)
        logger.warning("[CRM Processor] Event %s failed (attempt %d/%d): %s", event_id, new_attempts, MAX_RETRY_ATTEMPTS, err_msg)

        if new_attempts < MAX_RETRY_ATTEMPTS:
            delay_sec = RETRY_DELAYS_SECONDS[min(attempts, len(RETRY_DELAYS_SECONDS) - 1)]
            next_retry = datetime.now(timezone.utc) + timedelta(seconds=delay_sec)
            await db.crm_lead_events.update_one(
                {"id": event_id},
                {
                    "$set": {
                        "status": "retry",
                        "attempts": new_attempts,
                        "last_error": err_msg,
                        "next_retry_at": next_retry.isoformat(),
                        "updated_at": _now(),
                    }
                },
            )
        else:
            await db.crm_lead_events.update_one(
                {"id": event_id},
                {
                    "$set": {
                        "status": "failed",
                        "attempts": new_attempts,
                        "last_error": err_msg,
                        "updated_at": _now(),
                    }
                },
            )
        return {"ok": False, "error": err_msg}


async def run_event_queue_tick() -> None:
    """Poller tick: finds pending or ready-to-retry events and executes them."""
    db = _db()
    now_iso = _now()
    cursor = db.crm_lead_events.find(
        {
            "$or": [
                {"status": "pending"},
                {"status": "retry", "next_retry_at": {"$lte": now_iso}},
            ]
        }
    ).limit(20)

    events = await cursor.to_list(20)
    for ev in events:
        asyncio.create_task(_safe_process_event(ev["id"]))


async def start_crm_lead_queue_scheduler() -> None:
    """Lifespan task: periodic check every 20 seconds for queued/retry lead events."""
    logger.info("[CRM Processor] Ingest event queue scheduler started (20s interval).")
    while True:
        try:
            await run_event_queue_tick()
        except asyncio.CancelledError:
            raise
        except Exception as err:
            logger.warning("[CRM Processor] Queue scheduler tick failed: %s", err)
        await asyncio.sleep(20)


async def get_queue_stats() -> Dict[str, Any]:
    """Return health metrics for the lead event queue."""
    db = _db()
    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    counts = {"pending": 0, "processing": 0, "completed": 0, "retry": 0, "failed": 0}
    async for row in db.crm_lead_events.aggregate(pipeline):
        status_key = row.get("_id")
        if status_key in counts:
            counts[status_key] = row.get("count", 0)
    return counts
