"""Append-only task activity log."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger_name = "app.tasks"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def description_meta(text: Optional[str]) -> Dict[str, Any]:
    raw = text or ""
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return {"len": len(raw), "hash": digest}


def log_id() -> str:
    return f"tac_{uuid4().hex[:12]}"


async def log_task_activity(
    db,
    task: Dict[str, Any],
    act_type: str,
    actor: Optional[Dict[str, Any]] = None,
    body: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    if db is None or not task:
        return None
    doc = {
        "id": log_id(),
        "task_id": task.get("id"),
        "serial": task.get("serial"),
        "type": act_type,
        "actor_id": str(actor.get("id")) if actor else None,
        "actor_name": (actor.get("full_name") or actor.get("name") or "System") if actor else "System",
        "body": body or "",
        "meta": meta or {},
        "created_at": _now_iso(),
    }
    try:
        await db.task_activities.insert_one(doc)
        return doc
    except Exception:
        import logging

        logging.getLogger(logger_name).warning("Failed to log task activity %s", act_type, exc_info=True)
        return None


async def list_task_activity(db, task_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    if db is None:
        return []
    cursor = (
        db.task_activities.find({"task_id": task_id})
        .sort("created_at", -1)
        .skip(max(0, offset))
        .limit(min(max(limit, 1), 500))
    )
    rows = await cursor.to_list(min(max(limit, 1), 500))
    for row in rows:
        row.pop("_id", None)
    rows.reverse()
    return rows


async def list_company_activity(
    db,
    limit: int = 100,
    offset: int = 0,
    act_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    task_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if db is None:
        return []
    query: Dict[str, Any] = {}
    if act_type:
        query["type"] = act_type
    if actor_id:
        query["actor_id"] = actor_id
    if task_id:
        query["task_id"] = task_id
    if date_from or date_to:
        created: Dict[str, Any] = {}
        if date_from:
            created["$gte"] = date_from
        if date_to:
            created["$lte"] = date_to + "T23:59:59" if len(date_to) == 10 else date_to
        query["created_at"] = created
    cursor = (
        db.task_activities.find(query)
        .sort("created_at", -1)
        .skip(max(0, offset))
        .limit(min(max(limit, 1), 500))
    )
    rows = await cursor.to_list(min(max(limit, 1), 500))
    for row in rows:
        row.pop("_id", None)
    return rows
