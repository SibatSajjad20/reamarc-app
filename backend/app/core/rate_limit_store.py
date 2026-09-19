"""Shared Mongo-backed counters so SlowAPI limits hold across gunicorn workers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from pymongo import ReturnDocument

from app.database import get_database

_INDEX_READY = False


async def _ensure_ttl_index(db) -> None:
    global _INDEX_READY
    if _INDEX_READY or db is None:
        return
    try:
        await db.rate_limit_counters.create_index("expire_at", expireAfterSeconds=0)
        _INDEX_READY = True
    except Exception:
        pass


async def enforce_shared_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    """Increment a per-key counter for the current window. Raises 429 when exceeded."""
    db = get_database()
    if db is None:
        return
    await _ensure_ttl_index(db)

    now = datetime.now(timezone.utc)
    window_id = int(now.timestamp() // max(1, window_seconds))
    doc_id = f"{key}:{window_id}"
    expire_at = now + timedelta(seconds=window_seconds * 2)
    doc = await db.rate_limit_counters.find_one_and_update(
        {"_id": doc_id},
        {
            "$inc": {"count": 1},
            "$setOnInsert": {"expire_at": expire_at, "key": key},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    count = int((doc or {}).get("count") or 0)
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Try again shortly.",
        )
