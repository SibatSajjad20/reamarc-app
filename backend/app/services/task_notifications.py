"""Task Manager notifications: event → recipients → dispatch_to_users."""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set

from app.services.task_access import chain_from_ids, uid_of

_MENTION_RE = re.compile(r"@\[([^\]]+)\]\(([^)]+)\)")


def comment_preview(text: str, limit: int = 140) -> str:
    plain = _MENTION_RE.sub(lambda m: f"@{m.group(1)}", text or "").strip()
    if len(plain) > limit:
        return plain[:limit] + "…"
    return plain

logger = logging.getLogger("app.tasks")


def _clean_ids(values: Iterable[Any], exclude: Optional[Iterable[str]] = None) -> List[str]:
    skip = {str(x) for x in (exclude or []) if x}
    out: List[str] = []
    seen: Set[str] = set()
    for raw in values or []:
        uid = str(raw or "").strip()
        if not uid or uid in skip or uid in seen:
            continue
        seen.add(uid)
        out.append(uid)
    return out


def chain_ids(task: Dict[str, Any]) -> List[str]:
    ids: List[str] = []
    for hop in task.get("assignment_chain") or []:
        if not isinstance(hop, dict):
            continue
        ids.append(hop.get("from_id"))
        ids.append(hop.get("to_id"))
    ids.append(task.get("creator_id"))
    ids.append(task.get("assigner_id"))
    ids.append(task.get("assignee_id"))
    return _clean_ids(ids)


def involved_except(task: Dict[str, Any], exclude: Optional[Iterable[str]] = None) -> List[str]:
    ids = list(task.get("involved_ids") or [])
    ids.extend(task.get("watcher_ids") or [])
    ids.extend(chain_ids(task))
    return _clean_ids(ids, exclude)


def actor_name(actor: Optional[Dict[str, Any]]) -> str:
    if not actor:
        return "Someone"
    return str(actor.get("full_name") or actor.get("name") or "Someone").strip() or "Someone"


def recipients_for(
    kind: str,
    task: Dict[str, Any],
    actor_id: Optional[str] = None,
    extra: Optional[Sequence[str]] = None,
) -> List[str]:
    """Return recipient user ids for a task_* kind, always excluding the actor."""
    k = (kind or "").strip().lower()
    actor = str(actor_id or "").strip() or None
    exclude = [actor] if actor else []
    assignee = str(task.get("assignee_id") or "").strip()
    assigner = str(task.get("assigner_id") or "").strip()
    creator = str(task.get("creator_id") or "").strip()
    watchers = list(task.get("watcher_ids") or [])

    if k == "task_assigned":
        return _clean_ids([assignee], exclude)
    if k == "task_delegated":
        prev = chain_from_ids(task)
        return _clean_ids(prev, exclude)
    if k == "task_reassigned":
        return _clean_ids(list(extra or []), exclude)
    if k == "task_review_requested":
        if extra is not None:
            return _clean_ids(list(extra), exclude)
        return _clean_ids([assigner, creator], exclude)
    if k == "task_completed":
        return _clean_ids([assignee, creator, *chain_from_ids(task), *watchers], exclude)
    if k == "task_sent_back":
        return _clean_ids([assignee, *(extra or [])], exclude)
    if k == "task_blocked":
        return _clean_ids([assigner, creator], exclude)
    if k in ("task_due_soon", "task_due_today"):
        return _clean_ids([assignee], exclude)
    if k == "task_overdue":
        if extra:
            return _clean_ids(list(extra), exclude)
        return _clean_ids([assignee, assigner, creator], exclude)
    if k == "task_mention":
        return _clean_ids(list(extra or []), exclude)
    if k == "task_comment":
        mentioned = set(_clean_ids(list(extra or [])))
        return [uid for uid in involved_except(task, exclude) if uid not in mentioned]
    if k == "task_updated":
        return _clean_ids([assignee], exclude)
    if k in ("task_cancelled", "task_reopened"):
        return _clean_ids([assignee, *chain_from_ids(task)], exclude)
    return _clean_ids(list(extra or []), exclude)


def _event_data(task: Dict[str, Any], kind: str, extra_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data = {
        "type": "task",
        "event": kind,
        "task_id": task.get("id"),
        "serial": task.get("serial"),
        "company_id": task.get("company_id"),
    }
    if extra_data:
        data.update(extra_data)
    return data


async def dispatch_task_event(
    task: Dict[str, Any],
    kind: str,
    title: str,
    body: str,
    actor: Optional[Dict[str, Any]] = None,
    extra: Optional[Sequence[str]] = None,
    extra_data: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        from app.services.push_service import dispatch_to_users
    except Exception as exc:
        logger.warning("push_service unavailable: %s", exc)
        return
    actor_id = uid_of(actor) if actor else None
    recipients = recipients_for(kind, task, actor_id, extra)
    if not recipients:
        return
    data = _event_data(task, kind, extra_data)
    try:
        await dispatch_to_users(
            user_ids=recipients,
            title=title,
            body=body,
            kind=kind,
            sender_id=actor_id,
            sender_name=(actor.get("full_name") or actor.get("name")) if actor else None,
            sender_role=str(actor.get("role") or "") if actor else None,
            data=data,
            item=task,
        )
    except Exception as exc:
        logger.warning("Failed to dispatch %s: %s", kind, exc)


def _serial(task: Dict[str, Any]) -> str:
    return str(task.get("serial") or "")


def _title(task: Dict[str, Any]) -> str:
    return str(task.get("title") or "a task")


async def notify_assigned(task: Dict[str, Any], actor: Optional[Dict[str, Any]] = None) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    await dispatch_task_event(
        task,
        "task_assigned",
        f"{name} assigned you {serial}",
        _title(task),
        actor=actor,
    )


async def notify_delegated(task: Dict[str, Any], actor: Optional[Dict[str, Any]] = None) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    await dispatch_task_event(
        task,
        "task_delegated",
        f"{name} delegated {serial} to {task.get('assignee_name') or 'someone'}",
        _title(task),
        actor=actor,
    )


async def notify_reassigned(
    task: Dict[str, Any],
    actor: Optional[Dict[str, Any]] = None,
    old_assignee_id: Optional[str] = None,
) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    extra = [old_assignee_id, task.get("assignee_id")]
    await dispatch_task_event(
        task,
        "task_reassigned",
        f"{name} reassigned {serial} to {task.get('assignee_name') or 'someone'}",
        _title(task),
        actor=actor,
        extra=extra,
    )


async def notify_review_requested(
    task: Dict[str, Any],
    actor: Optional[Dict[str, Any]] = None,
    extra: Optional[Sequence[str]] = None,
) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    await dispatch_task_event(
        task,
        "task_review_requested",
        f"{name} submitted {serial} for review",
        _title(task),
        actor=actor,
        extra=extra,
    )


async def notify_completed(task: Dict[str, Any], actor: Optional[Dict[str, Any]] = None) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    await dispatch_task_event(
        task,
        "task_completed",
        f"{name} approved {serial}",
        _title(task),
        actor=actor,
    )


async def notify_sent_back(
    task: Dict[str, Any],
    reason: str,
    actor: Optional[Dict[str, Any]] = None,
    extra: Optional[Sequence[str]] = None,
) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    await dispatch_task_event(
        task,
        "task_sent_back",
        f"{name} sent back {serial}",
        reason or f"{serial} was sent back",
        actor=actor,
        extra=extra,
    )


async def notify_blocked(task: Dict[str, Any], actor: Optional[Dict[str, Any]] = None) -> None:
    serial = _serial(task)
    verb = "blocked" if task.get("blocked") else "unblocked"
    name = actor_name(actor)
    await dispatch_task_event(
        task,
        "task_blocked",
        f"{name} {verb} {serial}",
        f"{serial} was {verb}" + (f" — {task.get('blocked_reason')}" if task.get("blocked") and task.get("blocked_reason") else ""),
        actor=actor,
    )


async def notify_updated(task: Dict[str, Any], fields: Sequence[str], actor: Optional[Dict[str, Any]] = None) -> None:
    serial = _serial(task)
    label = ", ".join(fields) if fields else "fields"
    name = actor_name(actor)
    await dispatch_task_event(
        task,
        "task_updated",
        f"{name} updated {serial}",
        f"{label} changed on {serial}",
        actor=actor,
    )


async def notify_cancelled(task: Dict[str, Any], actor: Optional[Dict[str, Any]] = None) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    reason = str(task.get("cancel_reason") or "").strip()
    await dispatch_task_event(
        task,
        "task_cancelled",
        f"{name} cancelled {serial}",
        reason or f"{serial} was cancelled",
        actor=actor,
    )


async def notify_reopened(task: Dict[str, Any], actor: Optional[Dict[str, Any]] = None) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    await dispatch_task_event(
        task,
        "task_reopened",
        f"{name} reopened {serial}",
        _title(task),
        actor=actor,
    )


async def notify_mention(
    task: Dict[str, Any],
    mentioned_ids: Sequence[str],
    actor: Optional[Dict[str, Any]] = None,
    question: bool = False,
    preview: Optional[str] = None,
) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    title = f"{name} asked you a question on {serial}" if question else f"{name} mentioned you on {serial}"
    await dispatch_task_event(
        task,
        "task_mention",
        title,
        preview if preview is not None else comment_preview(""),
        actor=actor,
        extra=mentioned_ids,
    )


async def notify_comment(
    task: Dict[str, Any],
    actor: Optional[Dict[str, Any]] = None,
    mentioned_ids: Optional[Sequence[str]] = None,
    preview: Optional[str] = None,
) -> None:
    serial = _serial(task)
    name = actor_name(actor)
    await dispatch_task_event(
        task,
        "task_comment",
        f"{name} on {serial}",
        preview if preview is not None else f"{name} commented on {serial}",
        actor=actor,
        extra=mentioned_ids or [],
    )
