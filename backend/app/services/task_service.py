"""Task Manager CRUD, transitions, assignment chain, serials, and indexes."""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple
from uuid import uuid4
from zoneinfo import ZoneInfo

from pymongo import ASCENDING, DESCENDING, IndexModel, ReturnDocument
from pymongo.errors import DuplicateKeyError
from fastapi import HTTPException, status

from app.core.tenant import company_singleton_id, company_tz
from app.schemas.task import DEFAULT_REMINDER_OFFSETS, OPEN_STATUSES, TASK_PRIORITIES
from app.services.access import canonical_department, get_user_primary_department, parse_user_departments
from app.services.company_members import company_member_user, company_member_users
from app.services.task_access import (
    TaskAccessError,
    assignable_users,
    can_add_watcher,
    can_assign_to,
    can_attach,
    can_cancel,
    can_comment,
    can_delete,
    can_edit,
    can_edit_checklist,
    can_open_module,
    can_reassign,
    can_transition,
    can_view,
    chain_from_ids,
    default_task_settings,
    dept_set,
    display_name,
    is_admin,
    is_lead,
    is_self_assigned,
    is_task_excluded,
    is_view_only,
    uid_of,
    visibility_query,
)
from app.services.task_activity import description_meta, log_task_activity
from app.services import task_notifications as task_notify

logger = logging.getLogger("app.tasks")

COLLECTION = "tasks"
_indexes_ready = False
_index_lock = asyncio.Lock()

SERIAL_RE = re.compile(r"^T-(\d+)$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str = "tsk") -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _public(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    out = dict(doc)
    out.pop("_id", None)
    return out


def _tzinfo(company: Optional[Dict[str, Any]] = None) -> ZoneInfo:
    name = company_tz(company) or "Asia/Karachi"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("Asia/Karachi")


def local_now(company: Optional[Dict[str, Any]] = None, now: Optional[datetime] = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current.astimezone(_tzinfo(company))


def parse_due_datetime(task: Dict[str, Any], company: Optional[Dict[str, Any]] = None) -> Optional[datetime]:
    due_date = str(task.get("due_date") or "").strip()
    if not due_date:
        return None
    due_time = str(task.get("due_time") or "").strip() or "23:59:59"
    if len(due_time) == 5:
        due_time = due_time + ":59"
    try:
        naive = datetime.strptime(f"{due_date} {due_time[:8]}", "%Y-%m-%d %H:%M:%S")
        return naive.replace(tzinfo=_tzinfo(company))
    except Exception:
        return None


def progress_from_checklist(checklist: Optional[Sequence[Dict[str, Any]]], fallback: int = 0) -> int:
    items = [c for c in (checklist or []) if isinstance(c, dict)]
    if not items:
        return max(0, min(100, int(fallback or 0)))
    done = sum(1 for c in items if c.get("done"))
    return int(round(100 * done / len(items)))


def rebuild_involved(task: Dict[str, Any]) -> List[str]:
    ids: List[str] = []
    seen = set()
    for key in ("creator_id", "assignee_id", "assigner_id"):
        val = str(task.get(key) or "").strip()
        if val and val not in seen:
            seen.add(val)
            ids.append(val)
    for hop in task.get("assignment_chain") or []:
        if not isinstance(hop, dict):
            continue
        for key in ("from_id", "to_id"):
            val = str(hop.get(key) or "").strip()
            if val and val not in seen:
                seen.add(val)
                ids.append(val)
    for extra in task.get("watcher_ids") or []:
        val = str(extra or "").strip()
        if val and val not in seen:
            seen.add(val)
            ids.append(val)
    return ids


async def ensure_task_indexes(db) -> None:
    global _indexes_ready
    if _indexes_ready or db is None:
        return
    async with _index_lock:
        if _indexes_ready:
            return
        try:
            from app.core.index_migration import ensure_company_unique_index

            tasks = db.tasks
            raw = getattr(tasks, "_coll", tasks)
            await ensure_company_unique_index(
                raw, ["idx_task_id"], [[("id", 1)]], [("company_id", 1), ("id", 1)], "uniq_company_task_id"
            )
            await ensure_company_unique_index(
                raw,
                ["idx_task_serial"],
                [[("serial", 1)]],
                [("company_id", 1), ("serial", 1)],
                "uniq_company_task_serial",
            )
            await tasks.create_indexes(
                [
                    IndexModel([("company_id", ASCENDING), ("assignee_id", ASCENDING), ("status", ASCENDING), ("due_date", ASCENDING)], name="idx_task_assignee_status_due"),
                    IndexModel([("company_id", ASCENDING), ("involved_ids", ASCENDING), ("status", ASCENDING)], name="idx_task_involved_status"),
                    IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("due_date", ASCENDING)], name="idx_task_status_due"),
                    IndexModel([("company_id", ASCENDING), ("department", ASCENDING), ("status", ASCENDING)], name="idx_task_dept_status"),
                    IndexModel([("company_id", ASCENDING), ("parent_id", ASCENDING)], name="idx_task_parent"),
                ]
            )
            comments = db.task_comments
            raw_c = getattr(comments, "_coll", comments)
            await ensure_company_unique_index(
                raw_c, ["idx_task_comment_id"], [[("id", 1)]], [("company_id", 1), ("id", 1)], "uniq_company_task_comment_id"
            )
            await comments.create_indexes(
                [
                    IndexModel([("company_id", ASCENDING), ("task_id", ASCENDING), ("created_at", ASCENDING)], name="idx_task_comments_task"),
                    IndexModel([("company_id", ASCENDING), ("mentions", ASCENDING)], name="idx_task_comments_mentions"),
                ]
            )
            atts = db.task_attachments
            raw_a = getattr(atts, "_coll", atts)
            await ensure_company_unique_index(
                raw_a, ["idx_task_att_id"], [[("id", 1)]], [("company_id", 1), ("id", 1)], "uniq_company_task_att_id"
            )
            await atts.create_indexes(
                [IndexModel([("company_id", ASCENDING), ("task_id", ASCENDING)], name="idx_task_atts_task")]
            )
            acts = db.task_activities
            raw_act = getattr(acts, "_coll", acts)
            await ensure_company_unique_index(
                raw_act, ["idx_task_act_id"], [[("id", 1)]], [("company_id", 1), ("id", 1)], "uniq_company_task_act_id"
            )
            await acts.create_indexes(
                [IndexModel([("company_id", ASCENDING), ("task_id", ASCENDING), ("created_at", DESCENDING)], name="idx_task_acts_task")]
            )
            views = db.task_saved_views
            raw_v = getattr(views, "_coll", views)
            await ensure_company_unique_index(
                raw_v, ["idx_task_view_id"], [[("id", 1)]], [("company_id", 1), ("id", 1)], "uniq_company_task_view_id"
            )
            reads = db.task_reads
            raw_r = getattr(reads, "_coll", reads)
            await ensure_company_unique_index(
                raw_r,
                ["idx_task_read_user_task"],
                [[("user_id", 1), ("task_id", 1)]],
                [("company_id", 1), ("user_id", 1), ("task_id", 1)],
                "uniq_company_task_read",
            )
        except Exception as exc:
            logger.warning("Task index ensure failed: %s", exc)
        finally:
            _indexes_ready = True


async def _scan_max_serial(coll) -> int:
    if coll is None:
        return 0
    max_num = 0
    try:
        cursor = coll.find({}, {"serial": 1, "_id": 0})
        async for doc in cursor:
            m = SERIAL_RE.match(str(doc.get("serial") or ""))
            if m:
                max_num = max(max_num, int(m.group(1)))
    except Exception:
        pass
    return max_num


async def reserve_next_serial(db) -> str:
    if db is None:
        return "T-0001"
    counter = db.task_counters
    counter_id = company_singleton_id("task_serial")
    try:
        existing = await counter.find_one({"_id": counter_id})
        if existing is None:
            max_num = await _scan_max_serial(db.tasks)
            try:
                await counter.update_one({"_id": counter_id}, {"$setOnInsert": {"seq": max_num}}, upsert=True)
            except Exception:
                pass
        res = await counter.find_one_and_update(
            {"_id": counter_id},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        next_num = int((res or {}).get("seq") or 1)
        return f"T-{next_num:04d}"
    except Exception:
        max_num = await _scan_max_serial(db.tasks)
        return f"T-{max_num + 1:04d}"


async def get_task_settings(db) -> Dict[str, Any]:
    defaults = default_task_settings()
    if db is None:
        return {**defaults, "_id": company_singleton_id("task_settings")}
    doc = await db.task_settings.find_one({"_id": company_singleton_id("task_settings")})
    if not doc:
        return {**defaults, "_id": company_singleton_id("task_settings")}
    merged = {**defaults, **doc}
    merged["_id"] = doc.get("_id") or company_singleton_id("task_settings")
    return merged


async def patch_task_settings(db, payload: Dict[str, Any], actor: Dict[str, Any]) -> Dict[str, Any]:
    if not is_admin(actor):
        raise HTTPException(status_code=403, detail="Only admins can change task settings")
    current = await get_task_settings(db)
    updates: Dict[str, Any] = {}
    if "excluded_roles" in payload and payload["excluded_roles"] is not None:
        updates["excluded_roles"] = [str(r).strip().lower() for r in payload["excluded_roles"]]
    if "excluded_departments" in payload and payload["excluded_departments"] is not None:
        updates["excluded_departments"] = [str(d) for d in payload["excluded_departments"]]
    if "wip_limit" in payload:
        updates["wip_limit"] = payload["wip_limit"]
    if "sla" in payload and payload["sla"] is not None:
        updates["sla"] = payload["sla"]
    updates["updated_at"] = _now_iso()
    updates["updated_by"] = uid_of(actor)
    await db.task_settings.update_one(
        {"_id": company_singleton_id("task_settings")},
        {"$set": updates, "$setOnInsert": {"_id": company_singleton_id("task_settings")}},
        upsert=True,
    )
    return await get_task_settings(db)


async def get_user(db, user_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not user_id:
        return None
    try:
        return await company_member_user(str(user_id), db=db)
    except Exception:
        if db is None:
            return None
        return await db.users.find_one({"id": str(user_id)})


async def list_candidate_users(db) -> List[Dict[str, Any]]:
    users = await company_member_users(
        {"is_active": {"$ne": False}, "role": {"$nin": ["client"]}},
        db=db,
        projection={"_id": 0, "hashed_password": 0},
        limit=4000,
    )
    return users or []


def capture_department(assignee: Optional[Dict[str, Any]], actor: Optional[Dict[str, Any]]) -> str:
    if not assignee:
        return canonical_department(get_user_primary_department(actor)) if actor else ""
    assignee_depts = [canonical_department(d) for d in parse_user_departments(assignee) if canonical_department(d)]
    if len(assignee_depts) > 1 and is_lead(actor):
        shared = [d for d in assignee_depts if d in dept_set(actor)]
        if shared:
            return shared[0]
    return canonical_department(get_user_primary_department(assignee)) or (assignee_depts[0] if assignee_depts else "")


def default_due_for_priority(priority: str, company: Optional[Dict[str, Any]] = None, now: Optional[datetime] = None) -> str:
    local = local_now(company, now)
    hours = 24 if (priority or "").lower() == "urgent" else 72
    return (local + timedelta(hours=hours)).strftime("%Y-%m-%d")


async def require_module_user(db, user: Dict[str, Any]) -> Dict[str, Any]:
    settings = await get_task_settings(db)
    if not can_open_module(user, settings):
        raise HTTPException(status_code=403, detail="You do not have access to Tasks")
    return settings


async def get_visible_or_404(db, task_id: str, user: Dict[str, Any], settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    task = await db.tasks.find_one({"id": task_id})
    cfg = settings if settings is not None else await get_task_settings(db)
    if not task or not can_view(user, task, cfg):
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def decorate(task: Dict[str, Any], user: Dict[str, Any], settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    out = _public(task) or {}
    out["view_only"] = is_view_only(user, task, settings)
    return out


async def _attach_subtask_counts(db, items: List[Dict[str, Any]]) -> None:
    ids = [t.get("id") for t in items if t.get("id")]
    if not ids:
        return
    cursor = db.tasks.find({"parent_id": {"$in": ids}, "status": {"$ne": "cancelled"}}, {"parent_id": 1, "status": 1})
    counts: Dict[str, int] = {}
    done: Dict[str, int] = {}
    async for row in cursor:
        pid = row.get("parent_id")
        if pid:
            counts[pid] = counts.get(pid, 0) + 1
            if row.get("status") == "completed":
                done[pid] = done.get(pid, 0) + 1
    for item in items:
        item["subtasks_count"] = counts.get(item.get("id"), item.get("subtasks_count") or 0)
        item["subtasks_done"] = done.get(item.get("id"), item.get("subtasks_done") or 0)


async def create_task(db, payload: Dict[str, Any], actor: Dict[str, Any], settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = settings if settings is not None else await get_task_settings(db)
    if not can_open_module(actor, cfg):
        raise HTTPException(status_code=403, detail="You do not have access to Tasks")
    assignee_id = str(payload.get("assignee_id") or "").strip() or uid_of(actor)
    assignee = await get_user(db, assignee_id)
    if not assignee:
        raise HTTPException(status_code=422, detail="Assignee not found")
    if not can_assign_to(actor, assignee, cfg):
        raise HTTPException(status_code=403, detail="You cannot assign this person")
    parent_id = payload.get("parent_id")
    if parent_id:
        parent = await get_visible_or_404(db, parent_id, actor, cfg)
        if parent.get("parent_id"):
            raise HTTPException(status_code=422, detail="Subtasks cannot have subtasks")
    watchers = [str(w) for w in (payload.get("watcher_ids") or []) if str(w).strip()]
    now = _now_iso()
    checklist = []
    for item in payload.get("checklist") or []:
        text = str(item.get("text") if isinstance(item, dict) else item).strip()
        if text:
            checklist.append({"id": _new_id("tci"), "text": text, "done": False, "done_by": None, "done_at": None})
    priority = str(payload.get("priority") or "medium")
    due_date = payload.get("due_date")
    if not due_date and priority == "urgent":
        due_date = default_due_for_priority(priority)
    department = capture_department(assignee, actor)
    actor_id = uid_of(actor)
    actor_name = display_name(actor)
    hop = {
        "from_id": actor_id,
        "from_name": actor_name,
        "to_id": uid_of(assignee),
        "to_name": display_name(assignee),
        "department": department,
        "at": now,
        "note": None,
    }
    doc: Dict[str, Any] = {
        "id": _new_id("tsk"),
        "title": payload["title"],
        "description": payload.get("description") or "",
        "status": "todo",
        "priority": priority,
        "blocked": bool(payload.get("blocked")),
        "blocked_reason": payload.get("blocked_reason") if payload.get("blocked") else None,
        "creator_id": actor_id,
        "creator_name": actor_name,
        "assignee_id": uid_of(assignee),
        "assignee_name": display_name(assignee),
        "assigner_id": actor_id,
        "assigner_name": actor_name,
        "department": department,
        "assignment_chain": [hop],
        "watcher_ids": watchers,
        "start_date": payload.get("start_date"),
        "due_date": due_date,
        "due_time": payload.get("due_time"),
        "reminder_offsets": payload.get("reminder_offsets") if payload.get("reminder_offsets") is not None else list(DEFAULT_REMINDER_OFFSETS),
        "estimate_hours": payload.get("estimate_hours"),
        "checklist": checklist,
        "progress": progress_from_checklist(checklist, payload.get("progress") or 0),
        "parent_id": parent_id,
        "related": payload.get("related") if isinstance(payload.get("related"), dict) else (payload.get("related").model_dump() if hasattr(payload.get("related"), "model_dump") else payload.get("related")),
        "recurrence": payload.get("recurrence") if not hasattr(payload.get("recurrence"), "model_dump") else payload["recurrence"].model_dump(),
        "recurrence_source_id": payload.get("recurrence_source_id"),
        "attachments_count": 0,
        "comments_count": 0,
        "completed_at": None,
        "completed_by": None,
        "cancelled_at": None,
        "cancelled_by": None,
        "cancel_reason": None,
        "review_requested_at": None,
        "last_overdue_notified_on": None,
        "created_at": now,
        "updated_at": now,
    }
    if hasattr(doc.get("related"), "model_dump"):
        doc["related"] = doc["related"].model_dump()
    doc["involved_ids"] = rebuild_involved(doc)

    last_error = None
    for _attempt in range(3):
        doc.pop("_id", None)
        doc["serial"] = await reserve_next_serial(db)
        try:
            await db.tasks.insert_one(doc)
            last_error = None
            break
        except Exception as exc:
            is_dup = isinstance(exc, DuplicateKeyError) or "duplicate key" in str(exc).lower() or "e11000" in str(exc).lower()
            if is_dup:
                last_error = exc
                continue
            raise
    if last_error:
        raise last_error

    await log_task_activity(db, doc, "created", actor, f"Created {doc['serial']} — {doc['title']}")
    if uid_of(assignee) != actor_id:
        await log_task_activity(
            db, doc, "assigned", actor, f"Assigned to {display_name(assignee)}", meta={"to": uid_of(assignee)}
        )
        await task_notify.notify_assigned(doc, actor)
    if parent_id:
        parent = await db.tasks.find_one({"id": parent_id})
        if parent:
            await log_task_activity(db, parent, "subtask_added", actor, f"Subtask {doc['serial']} added")
    return decorate(doc, actor, cfg)


async def get_task(db, task_id: str, user: Dict[str, Any], settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = settings if settings is not None else await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, user, cfg)
    out = decorate(task, user, cfg)
    subtasks = await db.tasks.find({"parent_id": task_id}).to_list(200)
    visible = [s for s in subtasks if can_view(user, s, cfg)]
    out["subtasks"] = [_public(s) for s in visible]
    out["subtasks_count"] = len(visible)
    return out


def _scope_clause(scope: Optional[str], user: Dict[str, Any]) -> Dict[str, Any]:
    uid = uid_of(user)
    s = (scope or "all").strip().lower()
    if s in ("mine", "assigned_to_me", "my"):
        return {"assignee_id": uid}
    if s in ("assigned_by_me", "assigned"):
        return {"assigner_id": uid}
    if s in ("created_by_me", "created"):
        return {"creator_id": uid}
    if s in ("watching", "watched"):
        return {"watcher_ids": uid}
    return {}


def _and(query: Dict[str, Any], extra: Dict[str, Any]) -> Dict[str, Any]:
    if not extra:
        return query
    if not query:
        return extra
    return {"$and": [query, extra]}


async def _stage_counts(db, query: Dict[str, Any]) -> Dict[str, int]:
    counts = {s: 0 for s in ("todo", "in_progress", "in_review", "completed", "cancelled")}
    try:
        cursor = db.tasks.aggregate([{"$match": query or {}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}])
        async for row in cursor:
            key = str(row.get("_id") or "")
            if key in counts:
                counts[key] = int(row.get("n") or 0)
        return counts
    except Exception:
        rows = await db.tasks.find(query or {}, {"status": 1}).to_list(10000)
        for row in rows:
            key = str(row.get("status") or "")
            if key in counts:
                counts[key] += 1
        return counts


async def list_tasks(
    db,
    user: Dict[str, Any],
    *,
    scope: Optional[str] = None,
    stage: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[str] = None,
    assigner_id: Optional[str] = None,
    department: Optional[str] = None,
    due_from: Optional[str] = None,
    due_to: Optional[str] = None,
    blocked: Optional[bool] = None,
    q: Optional[str] = None,
    parent_id: Optional[str] = None,
    include_cancelled: bool = False,
    has_attachments: Optional[bool] = None,
    related_client: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    settings: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    cfg = settings if settings is not None else await get_task_settings(db)
    query = visibility_query(user, cfg)
    query = _and(query, _scope_clause(scope, user))
    if stage and stage != "all":
        query = _and(query, {"status": stage})
    elif not include_cancelled:
        query = _and(query, {"status": {"$ne": "cancelled"}})
    if priority and priority != "all":
        query = _and(query, {"priority": priority})
    if assignee_id:
        query = _and(query, {"assignee_id": assignee_id})
    if assigner_id:
        query = _and(query, {"assigner_id": assigner_id})
    if department:
        query = _and(query, {"department": canonical_department(department)})
    if due_from or due_to:
        due_q: Dict[str, Any] = {}
        if due_from:
            due_q["$gte"] = due_from
        if due_to:
            due_q["$lte"] = due_to
        query = _and(query, {"due_date": due_q})
    if blocked is not None:
        query = _and(query, {"blocked": bool(blocked)})
    if parent_id == "none":
        query = _and(query, {"parent_id": None})
    elif parent_id:
        query = _and(query, {"parent_id": parent_id})
    if has_attachments:
        query = _and(query, {"attachments_count": {"$gt": 0}})
    if related_client:
        query = _and(query, {"$or": [{"related.client_name": related_client}, {"related.workspace_id": related_client}]})
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query = _and(query, {"$or": [{"serial": rx}, {"title": rx}, {"description": rx}]})

    page = max(1, int(page or 1))
    limit = max(1, min(int(limit or 50), 500))
    total = await db.tasks.count_documents(query)
    cursor = db.tasks.find(query).sort([("due_date", ASCENDING), ("created_at", DESCENDING)]).skip((page - 1) * limit).limit(limit)
    rows = await cursor.to_list(limit)
    items = [decorate(r, user, cfg) for r in rows]
    await _attach_subtask_counts(db, items)
    counts_query = visibility_query(user, cfg)
    counts_query = _and(counts_query, _scope_clause(scope, user))
    if not include_cancelled:
        counts_query = _and(counts_query, {"status": {"$ne": "cancelled"}})
    if priority and priority != "all":
        counts_query = _and(counts_query, {"priority": priority})
    if assignee_id:
        counts_query = _and(counts_query, {"assignee_id": assignee_id})
    if assigner_id:
        counts_query = _and(counts_query, {"assigner_id": assigner_id})
    if department:
        counts_query = _and(counts_query, {"department": canonical_department(department)})
    if due_from or due_to:
        due_q: Dict[str, Any] = {}
        if due_from:
            due_q["$gte"] = due_from
        if due_to:
            due_q["$lte"] = due_to
        counts_query = _and(counts_query, {"due_date": due_q})
    if blocked is not None:
        counts_query = _and(counts_query, {"blocked": bool(blocked)})
    if parent_id == "none":
        counts_query = _and(counts_query, {"parent_id": None})
    elif parent_id:
        counts_query = _and(counts_query, {"parent_id": parent_id})
    if has_attachments:
        counts_query = _and(counts_query, {"attachments_count": {"$gt": 0}})
    if related_client:
        counts_query = _and(counts_query, {"$or": [{"related.client_name": related_client}, {"related.workspace_id": related_client}]})
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        counts_query = _and(counts_query, {"$or": [{"serial": rx}, {"title": rx}, {"description": rx}]})
    stage_counts = await _stage_counts(db, counts_query)
    return {"items": items, "total": total, "page": page, "limit": limit, "stage_counts": stage_counts}


def follow_up_bucket(task: Dict[str, Any], company: Optional[Dict[str, Any]] = None, now: Optional[datetime] = None) -> Optional[str]:
    if str(task.get("status") or "") not in OPEN_STATUSES:
        return None
    due = parse_due_datetime(task, company)
    local = local_now(company, now)
    if due is None:
        return "no_due"
    if due < local:
        return "overdue"
    if due.date() == local.date():
        return "today"
    return "upcoming"


async def follow_up_buckets(db, user: Dict[str, Any], settings: Optional[Dict[str, Any]] = None, company: Optional[Dict[str, Any]] = None, now: Optional[datetime] = None) -> Dict[str, List[Dict[str, Any]]]:
    cfg = settings if settings is not None else await get_task_settings(db)
    query = _and(visibility_query(user, cfg), {"status": {"$in": list(OPEN_STATUSES)}})
    rows = await db.tasks.find(query).to_list(2000)
    buckets = {"overdue": [], "today": [], "upcoming": [], "no_due": []}
    local = local_now(company, now)
    week = (local + timedelta(days=7)).date()
    for row in rows:
        bucket = follow_up_bucket(row, company, now)
        if not bucket:
            continue
        item = decorate(row, user, cfg)
        if bucket == "upcoming":
            due = parse_due_datetime(row, company)
            if due and due.date() > week:
                item["_later"] = True
        buckets.setdefault(bucket, []).append(item)
    return buckets


async def calendar_tasks(db, user: Dict[str, Any], start: str, end: str, settings: Optional[Dict[str, Any]] = None, company: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    cfg = settings if settings is not None else await get_task_settings(db)
    query = _and(
        visibility_query(user, cfg),
        {"due_date": {"$gte": start, "$lte": end}, "status": {"$ne": "cancelled"}},
    )
    rows = await db.tasks.find(query).to_list(2000)
    return [decorate(r, user, cfg) for r in rows]


async def counts(db, user: Dict[str, Any], settings: Optional[Dict[str, Any]] = None, company: Optional[Dict[str, Any]] = None, now: Optional[datetime] = None) -> Dict[str, int]:
    cfg = settings if settings is not None else await get_task_settings(db)
    base = visibility_query(user, cfg)
    result = {
        "todo": 0,
        "in_progress": 0,
        "in_review": 0,
        "completed": 0,
        "cancelled": 0,
        "overdue": 0,
        "today": 0,
        "upcoming": 0,
        "no_due": 0,
        "blocked": 0,
        "open": 0,
    }
    rows = await db.tasks.find(base, {"status": 1, "due_date": 1, "due_time": 1, "blocked": 1}).to_list(5000)
    for row in rows:
        st = str(row.get("status") or "todo")
        if st in result:
            result[st] += 1
        if st in OPEN_STATUSES:
            result["open"] += 1
            if row.get("blocked"):
                result["blocked"] += 1
            bucket = follow_up_bucket(row, company, now)
            if bucket == "overdue":
                result["overdue"] += 1
            elif bucket == "today":
                result["today"] += 1
            elif bucket == "upcoming":
                result["upcoming"] += 1
            elif bucket == "no_due":
                result["no_due"] += 1
    return result


async def overview(db, user: Dict[str, Any], settings: Optional[Dict[str, Any]] = None, company: Optional[Dict[str, Any]] = None, now: Optional[datetime] = None) -> Dict[str, Any]:
    cfg = settings if settings is not None else await get_task_settings(db)
    query = _and(visibility_query(user, cfg), {"status": {"$in": list(OPEN_STATUSES)}})
    rows = await db.tasks.find(query).to_list(5000)
    by_person: Dict[str, Dict[str, Any]] = {}
    by_dept: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        pid = str(row.get("assignee_id") or "unassigned")
        person = by_person.setdefault(
            pid,
            {"id": pid, "name": row.get("assignee_name") or "Unassigned", "department": row.get("department") or "", "open": 0, "overdue": 0, "in_review": 0, "blocked": 0},
        )
        person["open"] += 1
        if follow_up_bucket(row, company, now) == "overdue":
            person["overdue"] += 1
        if row.get("status") == "in_review":
            person["in_review"] += 1
        if row.get("blocked"):
            person["blocked"] += 1
        dept = row.get("department") or "Unassigned"
        d = by_dept.setdefault(dept, {"department": dept, "open": 0, "overdue": 0, "blocked": 0})
        d["open"] += 1
        if follow_up_bucket(row, company, now) == "overdue":
            d["overdue"] += 1
        if row.get("blocked"):
            d["blocked"] += 1
    return {
        "people": sorted(by_person.values(), key=lambda x: (-x["open"], x["name"])),
        "departments": sorted(by_dept.values(), key=lambda x: (-x["open"], x["department"])),
        "counts": await counts(db, user, cfg, company, now),
    }


async def list_assignable(db, actor: Dict[str, Any], task_id: Optional[str] = None) -> List[Dict[str, Any]]:
    cfg = await get_task_settings(db)
    if not can_open_module(actor, cfg):
        raise HTTPException(status_code=403, detail="You do not have access to Tasks")
    candidates = await list_candidate_users(db)
    allowed = assignable_users(actor, candidates, cfg)
    out = []
    for u in allowed:
        out.append(
            {
                "id": uid_of(u),
                "name": display_name(u),
                "role": u.get("role"),
                "department": get_user_primary_department(u),
                "departments": parse_user_departments(u),
                "avatar": u.get("avatar") or u.get("avatar_url"),
            }
        )
    return out


def _user_payload(u: Dict[str, Any], *, will_add_watcher: bool = False) -> Dict[str, Any]:
    return {
        "id": uid_of(u),
        "name": display_name(u),
        "role": u.get("role"),
        "department": get_user_primary_department(u),
        "departments": parse_user_departments(u),
        "avatar": u.get("avatar") or u.get("avatar_url"),
        "will_add_watcher": will_add_watcher,
    }


async def list_mentionable(db, actor: Dict[str, Any], task_id: str) -> List[Dict[str, Any]]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    candidates = await list_candidate_users(db)
    seen: set = set()
    out: List[Dict[str, Any]] = []
    for u in candidates:
        cid = uid_of(u)
        if not cid or cid in seen:
            continue
        if can_view(u, task, cfg):
            seen.add(cid)
            out.append(_user_payload(u, will_add_watcher=False))
    if can_add_watcher(actor, task, cfg):
        for u in assignable_users(actor, candidates, cfg):
            cid = uid_of(u)
            if not cid or cid in seen:
                continue
            if is_task_excluded(u, cfg):
                continue
            seen.add(cid)
            row = _user_payload(u, will_add_watcher=True)
            row["name"] = f"{display_name(u)} (will be added as watcher)"
            out.append(row)
    return out


async def review_recipient_ids(
    db,
    task: Dict[str, Any],
    actor: Optional[Dict[str, Any]] = None,
    *,
    include_admins: bool = False,
) -> List[str]:
    """Approvers for notifications: chain from_ids + department leads, minus assignee and actor.

    Review-requested drops admins; send-back FYI keeps other approvers including admins.
    """
    cfg = await get_task_settings(db)
    ids = set(chain_from_ids(task))
    dept = canonical_department(str(task.get("department") or ""))
    for u in await list_candidate_users(db):
        if is_lead(u) and dept and dept in dept_set(u):
            ids.add(uid_of(u))
        if include_admins and is_admin(u):
            ids.add(uid_of(u))
    ids.discard(str(task.get("assignee_id") or ""))
    if actor:
        ids.discard(uid_of(actor))
    kept: List[str] = []
    for uid in ids:
        u = await get_user(db, uid)
        if not u:
            continue
        if not include_admins and is_admin(u):
            continue
        if is_task_excluded(u, cfg):
            continue
        kept.append(uid)
    return kept


_EDITABLE = {
    "title",
    "description",
    "priority",
    "start_date",
    "due_date",
    "due_time",
    "reminder_offsets",
    "estimate_hours",
    "progress",
    "related",
    "recurrence",
}


async def patch_task(db, task_id: str, payload: Dict[str, Any], actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    if_updated_at = payload.pop("if_updated_at", None)
    if if_updated_at and str(task.get("updated_at") or "") != str(if_updated_at):
        raise HTTPException(status_code=409, detail="Someone else changed this task, reload")
    if not can_edit(actor, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot edit this task")
    updates: Dict[str, Any] = {}
    diffs: Dict[str, Any] = {}
    for field in _EDITABLE:
        if field not in payload or payload[field] is None and field not in payload:
            continue
        if field not in payload:
            continue
        new_val = payload[field]
        if hasattr(new_val, "model_dump"):
            new_val = new_val.model_dump()
        old_val = task.get(field)
        if new_val == old_val:
            continue
        updates[field] = new_val
        if field == "description":
            diffs[field] = [description_meta(old_val), description_meta(new_val)]
        else:
            diffs[field] = [old_val, new_val]
    if "watcher_ids" in payload and payload["watcher_ids"] is not None:
        if not can_add_watcher(actor, task, cfg) and not is_admin(actor):
            raise HTTPException(status_code=403, detail="You cannot change watchers")
        watchers = [str(w) for w in payload["watcher_ids"] if str(w).strip()]
        updates["watcher_ids"] = watchers
    if not updates:
        return decorate(task, actor, cfg)
    if "progress" in updates and task.get("checklist"):
        updates.pop("progress", None)
    updates["updated_at"] = _now_iso()
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    task.update(updates)
    if "watcher_ids" in updates:
        involved = rebuild_involved(task)
        await db.tasks.update_one({"id": task_id}, {"$set": {"involved_ids": involved}})
        task["involved_ids"] = involved
    if diffs:
        await log_task_activity(db, task, "field_changed", actor, "Updated fields", meta=diffs)
        notify_fields = [f for f in diffs if f in ("due_date", "due_time", "priority")]
        if notify_fields:
            await task_notify.notify_updated(task, notify_fields, actor)
    return decorate(task, actor, cfg)


async def change_stage(db, task_id: str, dest: str, actor: Dict[str, Any], reason: Optional[str] = None) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    ok, message = can_transition(actor, task, dest, reason, cfg)
    if not ok:
        raise HTTPException(status_code=422, detail=message)
    current = str(task.get("status") or "todo")
    if dest == current:
        return decorate(task, actor, cfg)
    now = _now_iso()
    updates: Dict[str, Any] = {"status": dest, "updated_at": now}
    act_type = "status_changed"
    body = f"Moved from {current} to {dest}"
    if dest == "in_review":
        updates["review_requested_at"] = now
        act_type = "review_requested"
        body = "Submitted for review"
    if dest == "completed":
        updates["completed_at"] = now
        updates["completed_by"] = uid_of(actor)
        act_type = "approved" if current == "in_review" else "status_changed"
        body = "Completed"
    if dest == "in_progress" and current == "in_review":
        act_type = "sent_back"
        body = reason or "Sent back"
        updates["review_requested_at"] = None
    if dest == "in_progress" and current == "completed":
        act_type = "reopened"
        body = "Reopened"
        updates["completed_at"] = None
        updates["completed_by"] = None
    if dest == "cancelled":
        return await cancel_task(db, task_id, reason or "Cancelled", actor)
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    task.update(updates)
    await log_task_activity(db, task, act_type, actor, body, meta={"from": current, "to": dest, "reason": reason})
    if dest == "in_review":
        extra = await review_recipient_ids(db, task, actor, include_admins=False)
        await task_notify.notify_review_requested(task, actor, extra=extra)
    elif dest == "completed":
        await task_notify.notify_completed(task, actor)
        await maybe_spawn_recurrence(db, task, actor)
    elif act_type == "sent_back":
        extra = await review_recipient_ids(db, task, actor, include_admins=True)
        await task_notify.notify_sent_back(task, reason or "", actor, extra=extra)
    elif act_type == "reopened":
        await task_notify.notify_reopened(task, actor)
    return decorate(task, actor, cfg)


async def assign_task(db, task_id: str, assignee_id: str, actor: Dict[str, Any], note: Optional[str] = None) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    target = await get_user(db, assignee_id)
    if not target:
        raise HTTPException(status_code=422, detail="Assignee not found")
    if not can_assign_to(actor, target, cfg):
        raise HTTPException(status_code=403, detail="You cannot assign this person")
    status = str(task.get("status") or "").strip().lower()
    if status not in OPEN_STATUSES:
        raise HTTPException(status_code=422, detail="Reopen the task first")
    if not can_reassign(actor, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot reassign this task")
    actor_id = uid_of(actor)
    old_assignee = str(task.get("assignee_id") or "")
    now = _now_iso()
    department = capture_department(target, actor)
    hop = {
        "from_id": actor_id,
        "from_name": display_name(actor),
        "to_id": uid_of(target),
        "to_name": display_name(target),
        "department": department,
        "at": now,
        "note": note,
    }
    chain = list(task.get("assignment_chain") or [])
    chain.append(hop)
    new_status = "todo" if task.get("status") == "in_review" else task.get("status")
    updates = {
        "assignee_id": uid_of(target),
        "assignee_name": display_name(target),
        "assigner_id": actor_id,
        "assigner_name": display_name(actor),
        "department": department,
        "assignment_chain": chain,
        "status": new_status,
        "updated_at": now,
    }
    task.update(updates)
    updates["involved_ids"] = rebuild_involved(task)
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    task.update(updates)
    was_on_me = old_assignee == actor_id
    act = "delegated" if was_on_me else "reassigned"
    await log_task_activity(db, task, act, actor, f"{act.capitalize()} to {display_name(target)}", meta={"to": uid_of(target), "note": note})
    await task_notify.notify_assigned(task, actor)
    if was_on_me:
        await task_notify.notify_delegated(task, actor)
    else:
        await task_notify.notify_reassigned(task, actor, old_assignee_id=old_assignee)
    return decorate(task, actor, cfg)


async def set_blocked(db, task_id: str, blocked: bool, reason: Optional[str], actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    if not (is_admin(actor) or uid_of(actor) in (task.get("assignee_id"), task.get("assigner_id"), task.get("creator_id"))):
        raise HTTPException(status_code=403, detail="You cannot block this task")
    if blocked and not (reason or "").strip():
        raise HTTPException(status_code=422, detail="A reason is required when blocking")
    updates = {
        "blocked": bool(blocked),
        "blocked_reason": (reason or "").strip() if blocked else None,
        "updated_at": _now_iso(),
    }
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    task.update(updates)
    act = "blocked" if blocked else "unblocked"
    await log_task_activity(db, task, act, actor, reason or act)
    await task_notify.notify_blocked(task, actor)
    return decorate(task, actor, cfg)


async def cancel_task(db, task_id: str, reason: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    if not can_cancel(actor, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot cancel this task")
    if not (reason or "").strip():
        raise HTTPException(status_code=422, detail="A reason is required")
    now = _now_iso()
    updates = {
        "status": "cancelled",
        "cancelled_at": now,
        "cancelled_by": uid_of(actor),
        "cancel_reason": reason.strip(),
        "updated_at": now,
        "blocked": False,
    }
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    task.update(updates)
    await log_task_activity(db, task, "cancelled", actor, reason.strip())
    await task_notify.notify_cancelled(task, actor)
    return decorate(task, actor, cfg)


async def _purge_task_files_and_comments(db, task_id: str) -> None:
    from app.services.task_attachments import _delete_stored

    atts = await db.task_attachments.find({"task_id": task_id}).to_list(500)
    for att in atts:
        try:
            await _delete_stored(db, att)
        except Exception:
            pass
    await db.task_comments.delete_many({"task_id": task_id})
    await db.task_attachments.delete_many({"task_id": task_id})
    await db.task_activities.delete_many({"task_id": task_id})


async def delete_task(db, task_id: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await db.tasks.find_one({"id": task_id})
    if not task or not can_view(actor, task, cfg):
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_delete(actor, task, cfg):
        raise HTTPException(status_code=403, detail="Only admins can delete tasks")
    subtasks = await db.tasks.find({"parent_id": task_id}).to_list(500)
    for sub in subtasks:
        sid = sub.get("id")
        if not sid:
            continue
        await _purge_task_files_and_comments(db, sid)
        await log_task_activity(
            db,
            {"id": sid, "serial": sub.get("serial"), "title": sub.get("title"), "status": "deleted"},
            "deleted",
            actor,
            f"Deleted {sub.get('serial')}",
            meta={"serial": sub.get("serial"), "title": sub.get("title")},
        )
        await db.tasks.delete_one({"id": sid})
    await _purge_task_files_and_comments(db, task_id)
    tombstone = {
        "id": task.get("id"),
        "serial": task.get("serial"),
        "title": task.get("title"),
        "status": "deleted",
    }
    await log_task_activity(db, tombstone, "deleted", actor, f"Deleted {task.get('serial')}", meta={"serial": task.get("serial"), "title": task.get("title")})
    await db.tasks.delete_one({"id": task_id})
    return {"ok": True, "id": task_id}


async def batch_update(db, items: List[Dict[str, Any]], actor: Dict[str, Any]) -> List[Dict[str, Any]]:
    from pydantic import ValidationError
    from app.schemas.task import TaskStagePatch, TaskUpdate

    results = []
    for item in items:
        tid = item.get("id")
        row: Dict[str, Any] = {"id": tid, "ok": False}
        try:
            reason = item.get("cancel_reason") or item.get("reason")
            if item.get("cancel"):
                if not (reason or "").strip():
                    raise HTTPException(status_code=422, detail="A reason is required")
                await cancel_task(db, tid, reason, actor)
            elif item.get("stage"):
                TaskStagePatch(to=item["stage"], reason=reason)
                await change_stage(db, tid, item["stage"], actor, reason)
            elif item.get("assignee_id"):
                await assign_task(db, tid, item["assignee_id"], actor)
            else:
                patch: Dict[str, Any] = {}
                if item.get("priority"):
                    patch["priority"] = item["priority"]
                if "due_date" in item:
                    patch["due_date"] = item.get("due_date")
                if patch:
                    TaskUpdate(**patch)
                    await patch_task(db, tid, patch, actor)
            row["ok"] = True
        except HTTPException as exc:
            row["error"] = exc.detail
            row["status"] = exc.status_code
        except ValidationError as exc:
            row["error"] = exc.errors()[0].get("msg") if exc.errors() else str(exc)
            row["status"] = 422
        except Exception as exc:
            row["error"] = str(exc)
            row["status"] = 500
        results.append(row)
    return results


async def add_checklist_item(db, task_id: str, text: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    if not can_edit_checklist(actor, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot edit the checklist")
    item = {"id": _new_id("tci"), "text": text.strip(), "done": False, "done_by": None, "done_at": None}
    checklist = list(task.get("checklist") or [])
    checklist.append(item)
    progress = progress_from_checklist(checklist)
    await db.tasks.update_one({"id": task_id}, {"$set": {"checklist": checklist, "progress": progress, "updated_at": _now_iso()}})
    task["checklist"] = checklist
    task["progress"] = progress
    await log_task_activity(db, task, "checklist_item_added", actor, text.strip())
    return decorate(task, actor, cfg)


async def patch_checklist_item(db, task_id: str, item_id: str, payload: Dict[str, Any], actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    if not can_edit_checklist(actor, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot edit the checklist")
    checklist = list(task.get("checklist") or [])
    found = None
    for item in checklist:
        if item.get("id") == item_id:
            found = item
            break
    if not found:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    act = None
    if "text" in payload and payload["text"] is not None:
        found["text"] = str(payload["text"]).strip()
    if "done" in payload and payload["done"] is not None:
        found["done"] = bool(payload["done"])
        found["done_by"] = uid_of(actor) if found["done"] else None
        found["done_at"] = _now_iso() if found["done"] else None
        act = "checklist_item_checked" if found["done"] else "checklist_item_unchecked"
    progress = progress_from_checklist(checklist)
    await db.tasks.update_one({"id": task_id}, {"$set": {"checklist": checklist, "progress": progress, "updated_at": _now_iso()}})
    task["checklist"] = checklist
    task["progress"] = progress
    await log_task_activity(db, task, act or "field_changed", actor, found.get("text") or "")
    return decorate(task, actor, cfg)


async def delete_checklist_item(db, task_id: str, item_id: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    if not can_edit_checklist(actor, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot edit the checklist")
    checklist = [c for c in (task.get("checklist") or []) if c.get("id") != item_id]
    progress = progress_from_checklist(checklist)
    await db.tasks.update_one({"id": task_id}, {"$set": {"checklist": checklist, "progress": progress, "updated_at": _now_iso()}})
    task["checklist"] = checklist
    task["progress"] = progress
    await log_task_activity(db, task, "checklist_item_removed", actor, item_id)
    return decorate(task, actor, cfg)


async def add_watcher(db, task_id: str, user_id: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    if not can_add_watcher(actor, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot add watchers")
    target = await get_user(db, user_id)
    if not target or is_task_excluded(target, cfg):
        raise HTTPException(status_code=422, detail="User cannot be added")
    watchers = list(task.get("watcher_ids") or [])
    if user_id not in watchers:
        watchers.append(user_id)
    task["watcher_ids"] = watchers
    involved = rebuild_involved(task)
    await db.tasks.update_one({"id": task_id}, {"$set": {"watcher_ids": watchers, "involved_ids": involved, "updated_at": _now_iso()}})
    task["involved_ids"] = involved
    await log_task_activity(db, task, "watcher_added", actor, display_name(target), meta={"user_id": user_id})
    return decorate(task, actor, cfg)


async def remove_watcher(db, task_id: str, user_id: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, actor, cfg)
    if not can_add_watcher(actor, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot remove watchers")
    watchers = [w for w in (task.get("watcher_ids") or []) if w != user_id]
    task["watcher_ids"] = watchers
    involved = rebuild_involved(task)
    await db.tasks.update_one({"id": task_id}, {"$set": {"watcher_ids": watchers, "involved_ids": involved, "updated_at": _now_iso()}})
    task["involved_ids"] = involved
    await log_task_activity(db, task, "watcher_removed", actor, user_id, meta={"user_id": user_id})
    return decorate(task, actor, cfg)


def next_occurrence(due_date: Optional[str], recurrence: Dict[str, Any]) -> Optional[str]:
    if not due_date or not recurrence:
        return None
    try:
        current = datetime.strptime(due_date, "%Y-%m-%d").date()
    except Exception:
        return None
    freq = str(recurrence.get("freq") or "weekly")
    interval = max(1, int(recurrence.get("interval") or 1))
    if freq == "daily":
        nxt = current + timedelta(days=interval)
    elif freq == "monthly":
        month = current.month - 1 + interval
        year = current.year + month // 12
        month = month % 12 + 1
        day = min(current.day, 28)
        nxt = current.replace(year=year, month=month, day=day)
    else:
        nxt = current + timedelta(weeks=interval)
    until = recurrence.get("until")
    if until:
        try:
            if nxt > datetime.strptime(until, "%Y-%m-%d").date():
                return None
        except Exception:
            pass
    return nxt.isoformat()


async def maybe_spawn_recurrence(db, task: Dict[str, Any], actor: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    rec = task.get("recurrence")
    if not rec:
        source_id = task.get("recurrence_source_id")
        if source_id:
            template = await db.tasks.find_one({"id": source_id})
            if template:
                return await maybe_spawn_recurrence(db, template, actor)
        return None
    template = task
    if task.get("recurrence_source_id"):
        found = await db.tasks.find_one({"id": task["recurrence_source_id"]})
        if found:
            template = found
            rec = found.get("recurrence") or rec
    due = template.get("due_date") or task.get("due_date")
    nxt = next_occurrence(due, rec)
    if not nxt:
        return None
    existing = await db.tasks.find_one({"recurrence_source_id": template.get("id"), "due_date": nxt})
    if existing:
        return _public(existing)
    checklist = []
    for item in template.get("checklist") or []:
        checklist.append({"id": _new_id("tci"), "text": item.get("text"), "done": False, "done_by": None, "done_at": None})
    payload = {
        "title": template.get("title"),
        "description": template.get("description") or "",
        "priority": template.get("priority") or "medium",
        "assignee_id": template.get("assignee_id"),
        "due_date": nxt,
        "due_time": template.get("due_time"),
        "reminder_offsets": template.get("reminder_offsets"),
        "estimate_hours": template.get("estimate_hours"),
        "checklist": checklist,
        "related": template.get("related"),
        "recurrence_source_id": template.get("id"),
        "status": "todo",
    }
    actor_doc = actor or {
        "id": template.get("assigner_id") or template.get("creator_id"),
        "full_name": template.get("assigner_name") or template.get("creator_name"),
        "role": "admin",
    }
    created = await create_task(db, payload, actor_doc)
    await log_task_activity(db, created, "recurrence_created", actor_doc, f"Instance {created.get('serial')} for {nxt}")
    await db.tasks.update_one({"id": template["id"]}, {"$set": {"due_date": nxt, "updated_at": _now_iso()}})
    return created


async def list_saved_views(db, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = await db.task_saved_views.find({"user_id": uid_of(user)}).to_list(100)
    return [_public(r) for r in rows]


async def create_saved_view(db, user: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    doc = {
        "id": _new_id("tsv"),
        "user_id": uid_of(user),
        "name": payload["name"],
        "view": payload.get("view") or "list",
        "filters": payload.get("filters") or {},
        "created_at": _now_iso(),
    }
    await db.task_saved_views.insert_one(doc)
    return _public(doc) or doc


async def delete_saved_view(db, view_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    doc = await db.task_saved_views.find_one({"id": view_id})
    if not doc or (doc.get("user_id") != uid_of(user) and not is_admin(user)):
        raise HTTPException(status_code=404, detail="Saved view not found")
    await db.task_saved_views.delete_one({"id": view_id})
    return {"ok": True}
