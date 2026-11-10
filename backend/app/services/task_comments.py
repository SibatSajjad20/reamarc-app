"""Task comments and @mention parsing."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple
from uuid import uuid4

from fastapi import HTTPException

from app.services.task_access import can_add_watcher, can_comment, can_view, is_admin, is_task_excluded, uid_of
from app.services.task_activity import log_task_activity
from app.services.task_service import get_task_settings, get_visible_or_404, add_watcher

MENTION_RE = re.compile(r"@\[([^\]]+)\]\(([^)]+)\)")
EDIT_WINDOW = timedelta(minutes=15)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def parse_mentions(text: str) -> List[Tuple[str, str]]:
    """Return (name, user_id) pairs from @[Name](user_id) tokens."""
    return [(m.group(1), m.group(2)) for m in MENTION_RE.finditer(text or "")]


def mention_ids(text: str) -> List[str]:
    ids: List[str] = []
    seen: Set[str] = set()
    for _name, uid in parse_mentions(text):
        if uid and uid not in seen:
            seen.add(uid)
            ids.append(uid)
    return ids


def render_mentions_plain(text: str) -> str:
    """Turn @[Name](id) tokens into @Name for notification previews."""
    return MENTION_RE.sub(lambda m: f"@{m.group(1)}", text or "")


def comment_preview(text: str, limit: int = 140) -> str:
    plain = render_mentions_plain(text).strip()
    if len(plain) > limit:
        return plain[:limit] + "…"
    return plain


def validate_mentions(
    text: str,
    actor: Dict[str, Any],
    task: Dict[str, Any],
    users_by_id: Dict[str, Dict[str, Any]],
    settings: Optional[Dict[str, Any]],
    add_watchers: Optional[Sequence[str]] = None,
    *,
    allow_watcher_adds: bool = True,
) -> List[str]:
    """Keep mentions that can view, or that the actor opted to add as watchers. Never raise."""
    allowed_extra = {str(x) for x in (add_watchers or []) if x}
    kept: List[str] = []
    seen: Set[str] = set()
    for uid in mention_ids(text):
        if uid in seen:
            continue
        target = users_by_id.get(uid)
        if not target:
            continue
        if can_view(target, task, settings):
            seen.add(uid)
            kept.append(uid)
            continue
        if (
            allow_watcher_adds
            and can_add_watcher(actor, task, settings)
            and not is_task_excluded(target, settings)
            and uid in allowed_extra
        ):
            seen.add(uid)
            kept.append(uid)
    return kept


def _public(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out.pop("_id", None)
    return out


async def list_comments(db, task_id: str, user: Dict[str, Any], page: int = 1, limit: int = 50) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    await get_visible_or_404(db, task_id, user, cfg)
    page = max(1, int(page or 1))
    limit = max(1, min(int(limit or 50), 200))
    query = {"task_id": task_id}
    total = await db.task_comments.count_documents(query)
    cursor = db.task_comments.find(query).sort("created_at", 1).skip((page - 1) * limit).limit(limit)
    rows = await cursor.to_list(limit)
    items = []
    for row in rows:
        item = _public(row)
        if item.get("deleted"):
            item["text"] = ""
        items.append(item)
    return {"items": items, "total": total, "page": page, "limit": limit}


async def _load_users(db, ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    from app.services.task_service import get_user

    users_by_id: Dict[str, Dict[str, Any]] = {}
    for uid in {str(x) for x in ids if x}:
        u = await get_user(db, uid)
        if u:
            users_by_id[uid] = u
    return users_by_id


async def add_comment(
    db,
    task_id: str,
    text: str,
    actor: Dict[str, Any],
    *,
    question: bool = False,
    add_watchers: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    if not can_comment(actor, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot comment on this task")
    body = (text or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="Comment cannot be empty")
    if question and not body.startswith("❓"):
        body = f"❓ Question {body}"

    raw_ids = mention_ids(body)
    users_by_id = await _load_users(db, set(raw_ids) | set(add_watchers or []))
    for uid in add_watchers or []:
        target = users_by_id.get(uid)
        if not target or can_view(target, task, cfg):
            continue
        if can_add_watcher(actor, task, cfg) and not is_task_excluded(target, cfg):
            try:
                await add_watcher(db, task_id, uid, actor)
                task = await db.tasks.find_one({"id": task_id}) or task
            except Exception:
                pass
    mentions = validate_mentions(body, actor, task, users_by_id, cfg, add_watchers, allow_watcher_adds=True)
    doc = {
        "id": f"tcm_{uuid4().hex[:12]}",
        "task_id": task_id,
        "user_id": uid_of(actor),
        "user_name": actor.get("full_name") or actor.get("name") or "",
        "text": body,
        "mentions": mentions,
        "question": bool(question),
        "edited_at": None,
        "deleted": False,
        "created_at": _now_iso(),
    }
    await db.task_comments.insert_one(doc)
    await db.tasks.update_one({"id": task_id}, {"$inc": {"comments_count": 1}, "$set": {"updated_at": _now_iso()}})
    try:
        from app.services.task_chat import mark_read

        await mark_read(db, task_id, actor, last_read_at=doc["created_at"])
    except Exception:
        pass
    await log_task_activity(db, task, "comment_added", actor, body[:200])
    from app.services import task_notifications as task_notify

    preview = comment_preview(body)
    if mentions:
        await log_task_activity(db, task, "mention", actor, ", ".join(mentions), meta={"mentions": mentions})
        await task_notify.notify_mention(task, mentions, actor, question=question, preview=preview)
    await task_notify.notify_comment(task, actor, mentions, preview=preview)
    return _public(doc)


async def edit_comment(db, task_id: str, comment_id: str, text: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    doc = await db.task_comments.find_one({"id": comment_id, "task_id": task_id})
    if not doc or doc.get("deleted"):
        raise HTTPException(status_code=404, detail="Comment not found")
    if doc.get("user_id") != uid_of(actor) and not is_admin(actor):
        raise HTTPException(status_code=403, detail="You can only edit your own comments")
    created = doc.get("created_at")
    if not is_admin(actor) and created:
        try:
            created_dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
            if created_dt.tzinfo is None:
                created_dt = created_dt.replace(tzinfo=timezone.utc)
            if _now() - created_dt > EDIT_WINDOW:
                raise HTTPException(status_code=422, detail="Edit window has closed")
        except HTTPException:
            raise
        except Exception:
            pass
    body = (text or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="Comment cannot be empty")
    users_by_id = await _load_users(db, mention_ids(body))
    mentions = validate_mentions(body, actor, task, users_by_id, cfg, add_watchers=None, allow_watcher_adds=False)
    previous = {str(x) for x in (doc.get("mentions") or []) if x}
    newly = [uid for uid in mentions if uid not in previous]
    await db.task_comments.update_one(
        {"id": comment_id},
        {"$set": {"text": body, "mentions": mentions, "edited_at": _now_iso()}},
    )
    await log_task_activity(db, task, "comment_edited", actor, body[:200])
    if newly:
        from app.services import task_notifications as task_notify

        await task_notify.notify_mention(task, newly, actor, question=bool(doc.get("question")), preview=comment_preview(body))
    doc.update({"text": body, "mentions": mentions, "edited_at": _now_iso()})
    return _public(doc)


async def delete_comment(db, task_id: str, comment_id: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    doc = await db.task_comments.find_one({"id": comment_id, "task_id": task_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Comment not found")
    if doc.get("user_id") != uid_of(actor) and not is_admin(actor):
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    already = bool(doc.get("deleted"))
    await db.task_comments.update_one({"id": comment_id}, {"$set": {"deleted": True, "text": ""}})
    if not already:
        current = int(task.get("comments_count") or 0)
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {"comments_count": max(0, current - 1), "updated_at": _now_iso()}},
        )
    await log_task_activity(db, task, "comment_deleted", actor, comment_id)
    return {"ok": True, "id": comment_id}
