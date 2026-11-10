"""Task chat conversations, unread counts, and read marks."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from app.services.task_access import can_view, uid_of, visibility_query
from app.services.task_comments import comment_preview
from app.services.task_service import get_task_settings, get_visible_or_404


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public_task(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out.pop("_id", None)
    return out


async def _mentioned_task_ids(db, user_id: str) -> List[str]:
    if not user_id:
        return []
    try:
        ids = await db.task_comments.distinct("task_id", {"mentions": user_id, "deleted": {"$ne": True}})
    except Exception:
        ids = []
    return [str(x) for x in ids if x]


async def _conversation_rows(db, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    cfg = await get_task_settings(db)
    uid = uid_of(user)
    vis = visibility_query(user, cfg)
    if vis == {"id": {"$in": []}}:
        return []
    mentioned = await _mentioned_task_ids(db, uid)
    membership: Dict[str, Any] = {"$or": [{"involved_ids": uid}]}
    if mentioned:
        membership["$or"].append({"id": {"$in": mentioned}})
    query: Dict[str, Any] = {"$and": [membership, {"comments_count": {"$gt": 0}}]}
    rows = await db.tasks.find(query).to_list(2000)
    visible = [r for r in rows if can_view(user, r, cfg)]
    if not visible:
        return []

    reads = await db.task_reads.find({"user_id": uid}).to_list(2000)
    last_read = {str(r.get("task_id")): str(r.get("last_read_at") or "") for r in reads}
    ids = [str(t.get("id") or "") for t in visible if t.get("id")]

    last_by_task: Dict[str, Dict[str, Any]] = {}
    unread_by_task: Dict[str, int] = {tid: 0 for tid in ids}
    if ids:
        last_cursor = db.task_comments.aggregate(
            [
                {"$match": {"task_id": {"$in": ids}, "deleted": {"$ne": True}}},
                {"$sort": {"created_at": -1}},
                {"$group": {"_id": "$task_id", "last": {"$first": "$$ROOT"}}},
            ]
        )
        async for row in last_cursor:
            last = row.get("last") or {}
            last_by_task[str(row.get("_id") or last.get("task_id") or "")] = last

        unread_cursor = db.task_comments.aggregate(
            [
                {"$match": {"task_id": {"$in": ids}, "deleted": {"$ne": True}, "user_id": {"$ne": uid}}},
                {"$project": {"task_id": 1, "created_at": 1, "_id": 0}},
            ]
        )
        async for row in unread_cursor:
            tid = str(row.get("task_id") or "")
            created = str(row.get("created_at") or "")
            read_at = last_read.get(tid) or ""
            if not read_at or created > read_at:
                unread_by_task[tid] = unread_by_task.get(tid, 0) + 1

    items: List[Dict[str, Any]] = []
    for task in visible:
        tid = str(task.get("id") or "")
        last = last_by_task.get(tid)
        last_at = str((last or {}).get("created_at") or "")
        items.append(
            {
                "task_id": tid,
                "serial": task.get("serial") or "",
                "title": task.get("title") or "",
                "status": task.get("status") or "todo",
                "last_comment": {
                    "user_name": (last or {}).get("user_name") or "",
                    "text_preview": comment_preview((last or {}).get("text") or ""),
                    "created_at": last_at,
                }
                if last
                else None,
                "unread_count": int(unread_by_task.get(tid) or 0),
                "_sort": last_at,
            }
        )
    items.sort(key=lambda r: r.get("_sort") or "", reverse=True)
    return items


async def list_conversations(
    db,
    user: Dict[str, Any],
    *,
    page: int = 1,
    limit: int = 30,
) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    limit = max(1, min(int(limit or 30), 100))
    items = await _conversation_rows(db, user)
    total = len(items)
    offset = (page - 1) * limit
    page_items = items[offset : offset + limit]
    for row in page_items:
        row.pop("_sort", None)
    return {"items": page_items, "total": total, "page": page, "limit": limit}


async def unread_counts(db, user: Dict[str, Any]) -> Dict[str, Any]:
    rows = await _conversation_rows(db, user)
    by_task = {row["task_id"]: int(row.get("unread_count") or 0) for row in rows if int(row.get("unread_count") or 0) > 0}
    return {"total": sum(by_task.values()), "by_task": by_task}


async def mark_read(db, task_id: str, user: Dict[str, Any], last_read_at: Optional[str] = None) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, user, cfg)
    if not can_view(user, task, cfg):
        raise HTTPException(status_code=404, detail="Task not found")
    stamp = last_read_at or _now_iso()
    uid = uid_of(user)
    await db.task_reads.update_one(
        {"user_id": uid, "task_id": task_id},
        {
            "$set": {"user_id": uid, "task_id": task_id, "last_read_at": stamp, "updated_at": _now_iso()},
            "$setOnInsert": {"id": f"trd_{task_id}_{uid}"},
        },
        upsert=True,
    )
    return {"ok": True, "task_id": task_id, "last_read_at": stamp}
