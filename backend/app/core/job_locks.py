"""
backend/app/core/job_locks.py
Distributed Mongo lease locks for background jobs.
Ensures single-runner execution across multiple instances/workers
(e.g., during Render rolling deploys or horizontally scaled containers).
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import logging
import uuid
from typing import AsyncGenerator, Optional

from pymongo.errors import DuplicateKeyError

from app.core.tenant import get_global_db

logger = logging.getLogger("app.job_locks")


async def acquire_job_lease(name: str, ttl_seconds: int = 60, worker_id: Optional[str] = None) -> bool:
    """
    Attempts to acquire or renew an atomic lease lock for a given job.
    Returns True if the lock was successfully acquired or renewed, False otherwise.
    """
    gdb = get_global_db()
    if gdb is None:
        return True  # If no DB configured yet, fail open safely for local startup

    coll = gdb.job_locks
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ttl_seconds)
    wid = worker_id or str(uuid.uuid4())

    try:
        # 1. Try to take over an expired lock or renew our own lock
        res = await coll.find_one_and_update(
            {
                "_id": name,
                "$or": [
                    {"expires_at": {"$lte": now}},
                    {"worker_id": wid},
                ],
            },
            {
                "$set": {
                    "locked_at": now,
                    "expires_at": expires_at,
                    "worker_id": wid,
                }
            },
        )
        if res is not None:
            return True

        # 2. If no existing expired lock, try to insert a new lock record
        await coll.insert_one({
            "_id": name,
            "name": name,
            "locked_at": now,
            "expires_at": expires_at,
            "worker_id": wid,
        })
        return True
    except DuplicateKeyError:
        # Another worker holds an active lease
        return False
    except Exception as e:
        logger.warning(f"Error acquiring job lease for '{name}': {e}")
        return False


async def release_job_lease(name: str, worker_id: Optional[str] = None) -> None:
    """
    Releases a held job lease so other workers can run next.
    """
    gdb = get_global_db()
    if gdb is None:
        return

    coll = gdb.job_locks
    query = {"_id": name}
    if worker_id:
        query["worker_id"] = worker_id

    try:
        await coll.delete_one(query)
    except Exception as e:
        logger.warning(f"Error releasing job lease for '{name}': {e}")


@asynccontextmanager
async def job_lease(name: str, ttl_seconds: int = 60, worker_id: Optional[str] = None) -> AsyncGenerator[bool, None]:
    """
    Async context manager for job leases.
    Usage:
        async with job_lease("daily_log_reminders", ttl_seconds=30) as acquired:
            if not acquired:
                return
            ...
    """
    wid = worker_id or str(uuid.uuid4())
    acquired = await acquire_job_lease(name, ttl_seconds=ttl_seconds, worker_id=wid)
    try:
        yield acquired
    finally:
        if acquired:
            await release_job_lease(name, worker_id=wid)
