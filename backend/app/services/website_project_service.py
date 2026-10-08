"""
Database operations, auto-advance engine, notifications, and activity logging for Website Projects.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from fastapi import HTTPException, status

from app.schemas.website_project import (
    STAGES,
    STAGE_NAMES,
    GATE_KEYS,
    GATE_NAMES,
    FOLDERS,
    WebsiteProjectCreate,
    WebsiteProjectUpdate,
    WebsiteTaskCreate,
    WebsiteTaskUpdate,
    WebsiteGateDecisionRequest,
    WebsiteGateSubmitRequest,
    WebsiteGateRevisionTaskRequest,
    WebsiteFileCreate,
)
from app.services.website_project_workflow import (
    STAGE_GATE_MAP,
    NEXT_STAGE_MAP,
    WorkflowError,
    calculate_health,
    calculate_progress,
    can_client_review_gate,
    can_edit_task,
    can_manage_project,
    can_view_project,
    check_transition,
    is_client,
    is_admin_or_ops,
    is_website_lead,
    get_user_departments,
    ALLOWED_DEPARTMENTS,
)

logger = logging.getLogger("app.website_projects")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _log_activity(
    db,
    project_id: str,
    act_type: str,
    body: str,
    actor: Dict[str, Any] | None = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    if db is None:
        return
    act_doc = {
        "id": f"wact_{uuid4().hex[:12]}",
        "project_id": project_id,
        "type": act_type,
        "body": body,
        "actor_id": str(actor.get("id")) if actor else None,
        "actor_name": actor.get("full_name") or actor.get("name") if actor else "System",
        "created_at": _now_iso(),
        "meta": meta or {},
    }
    try:
        await db.website_project_activities.insert_one(act_doc)
    except Exception as e:
        logger.warning(f"Failed to log website activity: {e}")


async def _notify_event(
    db,
    project: Dict[str, Any],
    recipients: List[str],
    title: str,
    body: str,
    actor_id: Optional[str] = None,
    kind: str = "website_project",
    data: Optional[Dict[str, Any]] = None,
) -> None:
    if db is None or not recipients:
        return
    try:
        from app.services.push_service import dispatch_to_users
        cleaned = list({str(r) for r in recipients if r and str(r) != str(actor_id)})
        if not cleaned:
            return
        payload_data = {"project_id": project.get("id"), "stage": project.get("stage")}
        if data:
            payload_data.update(data)
        await dispatch_to_users(
            user_ids=cleaned,
            title=title,
            body=body,
            kind=kind,
            sender_id=actor_id,
            data=payload_data,
        )
    except Exception as e:
        logger.warning(f"Failed to dispatch website notification: {e}")


async def _find_client_users_for_workspace(db, workspace_id: Optional[str]) -> List[str]:
    if not db or not workspace_id:
        return []
    cursor = db.users.find(
        {
            "role": "client",
            "is_active": {"$ne": False},
            "$or": [{"workspace_id": workspace_id}, {"workspace_ids": workspace_id}],
        },
        {"id": 1, "_id": 1},
    )
    docs = await cursor.to_list(length=100)
    return [str(d.get("id") or d.get("_id")) for d in docs if (d.get("id") or d.get("_id"))]


async def _find_project_team_members(db, project_id: str) -> List[str]:
    if not db:
        return []
    cursor = db.website_project_tasks.find(
        {"project_id": project_id, "assignee_id": {"$exists": True, "$ne": None}},
        {"assignee_id": 1, "_id": 0},
    )
    tasks = await cursor.to_list(length=500)
    return list({str(t["assignee_id"]) for t in tasks if t.get("assignee_id")})


async def _find_admin_users(db) -> List[str]:
    if not db:
        return []
    cursor = db.users.find(
        {"role": {"$in": ["admin", "super_admin", "operations"]}, "is_active": {"$ne": False}},
        {"id": 1, "_id": 1},
    )
    docs = await cursor.to_list(length=50)
    return [str(d.get("id") or d.get("_id")) for d in docs if (d.get("id") or d.get("_id"))]


async def present_project(db, doc: Dict[str, Any], now_iso: Optional[str] = None) -> Dict[str, Any]:
    """Decorates a raw project document with computed progress, health, and task counts."""
    now_iso = now_iso or _now_iso()
    today = now_iso[:10]
    pid = doc["id"]

    # Gather tasks
    tasks_cursor = db.website_project_tasks.find({"project_id": pid})
    all_tasks = await tasks_cursor.to_list(length=1000)

    # Gather gates
    gates_cursor = db.website_project_gates.find({"project_id": pid})
    all_gates = await gates_cursor.to_list(length=10)

    total_tasks = len(all_tasks)
    completed_tasks = sum(1 for t in all_tasks if str(t.get("status") or "").lower() == "completed")

    overdue_count = sum(
        1 for t in all_tasks
        if str(t.get("status") or "").lower() != "completed"
        and t.get("due_date") and str(t.get("due_date")) < today
    )

    current_stage = doc.get("stage", "strategy")
    current_stage_tasks = [t for t in all_tasks if t.get("stage") == current_stage]
    current_required_open = sum(
        1 for t in current_stage_tasks
        if t.get("required", True) and str(t.get("status") or "").lower() != "completed"
    )

    current_gate_key = STAGE_GATE_MAP.get(current_stage)
    current_stage_gate = next((g for g in all_gates if g.get("gate_key") == current_gate_key), None)

    computed_health = calculate_health(doc, all_gates, overdue_count, today)
    computed_progress = calculate_progress(
        current_stage,
        doc.get("on_hold", False),
        doc.get("frozen_progress"),
        current_stage_tasks,
        current_stage_gate,
    )

    return {
        "id": pid,
        "name": doc.get("name", "Untitled Project"),
        "workspace_id": doc.get("workspace_id", ""),
        "client_name": doc.get("client_name", ""),
        "manager_id": doc.get("manager_id", ""),
        "manager_name": doc.get("manager_name"),
        "start_date": doc.get("start_date"),
        "target_launch_date": doc.get("target_launch_date"),
        "website_type": doc.get("website_type", "other"),
        "stage": current_stage,
        "health": computed_health,
        "on_hold": doc.get("on_hold", False),
        "at_risk_override": doc.get("at_risk_override"),
        "staging_url": doc.get("staging_url"),
        "live_url": doc.get("live_url"),
        "description": doc.get("description"),
        "progress": computed_progress,
        "frozen_progress": doc.get("frozen_progress"),
        "active_gate_key": current_gate_key,
        "overdue_tasks_count": overdue_count,
        "required_tasks_open": current_required_open,
        "total_tasks_count": total_tasks,
        "completed_tasks_count": completed_tasks,
        "created_at": doc.get("created_at", now_iso),
        "updated_at": doc.get("updated_at", now_iso),
    }


async def create_project(db, payload: WebsiteProjectCreate, actor: Dict[str, Any]) -> Dict[str, Any]:
    project_id = f"wp_{uuid4().hex[:12]}"
    now = _now_iso()

    # Snapshot client workspace name
    client_name = payload.client_name
    if not client_name and payload.workspace_id:
        ws = await db.workspaces.find_one({"id": payload.workspace_id})
        if ws:
            client_name = ws.get("name") or ws.get("workspace_name")

    # Snapshot manager name
    manager_name = payload.manager_name
    if not manager_name and payload.manager_id:
        user = await db.users.find_one({"id": payload.manager_id})
        if user:
            manager_name = user.get("full_name") or user.get("name")

    project_doc = {
        "id": project_id,
        "name": payload.name,
        "workspace_id": payload.workspace_id,
        "client_name": client_name or "Client",
        "manager_id": payload.manager_id,
        "manager_name": manager_name or "Project Manager",
        "start_date": payload.start_date,
        "target_launch_date": payload.target_launch_date,
        "website_type": payload.website_type,
        "stage": "strategy",
        "health": "on_track",
        "on_hold": False,
        "at_risk_override": None,
        "staging_url": payload.staging_url,
        "live_url": payload.live_url,
        "description": payload.description,
        "frozen_progress": None,
        "created_at": now,
        "updated_at": now,
    }

    await db.website_projects.insert_one(project_doc)

    # Seed the 5 standard approval gates in 'draft'
    gate_docs = []
    for g_key in GATE_KEYS:
        gate_stage = next((st for st, gk in STAGE_GATE_MAP.items() if gk == g_key), "strategy")
        gate_docs.append({
            "id": f"gate_{project_id}_{g_key}",
            "project_id": project_id,
            "gate_key": g_key,
            "name": GATE_NAMES.get(g_key, g_key.capitalize()),
            "stage": gate_stage,
            "status": "draft",
            "round": 1,
            "history": [],
            "comment_thread": [],
            "linked_files": [],
            "created_at": now,
            "updated_at": now,
        })
    if gate_docs:
        await db.website_project_gates.insert_many(gate_docs)

    await _log_activity(
        db,
        project_id,
        "project_created",
        f"Project '{payload.name}' created by {actor.get('name') or 'PM'}.",
        actor=actor,
    )

    return await present_project(db, project_doc, now)


async def get_projects(
    db,
    viewer: Dict[str, Any],
    workspace_id: Optional[str] = None,
    stage: Optional[str] = None,
    health: Optional[str] = None,
    website_type: Optional[str] = None,
    manager_id: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[List[Dict[str, Any]], int]:
    query: Dict[str, Any] = {}

    if is_client(viewer):
        user_ws = viewer.get("workspace_ids") or []
        query["workspace_id"] = {"$in": [str(w) for w in user_ws]}
    elif not (is_admin_or_ops(viewer) or is_website_lead(viewer)):
        depts = get_user_departments(viewer)
        if not (depts & ALLOWED_DEPARTMENTS):
            query["manager_id"] = str(viewer.get("id") or "")
        elif workspace_id:
            query["workspace_id"] = workspace_id
    elif workspace_id:
        query["workspace_id"] = workspace_id

    if stage:
        query["stage"] = stage.lower().strip()
    if website_type:
        query["website_type"] = website_type.lower().strip()
    if manager_id:
        query["manager_id"] = manager_id

    if search:
        search_rgx = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [{"name": search_rgx}, {"client_name": search_rgx}]

    cursor = db.website_projects.find(query).sort("created_at", -1).skip(skip).limit(limit)
    raw_projects = await cursor.to_list(length=limit)
    total = await db.website_projects.count_documents(query)

    presented = []
    now = _now_iso()
    for doc in raw_projects:
        if not can_view_project(viewer, doc):
            continue
        item = await present_project(db, doc, now)
        if health and item["health"] != health.lower().strip():
            continue
        presented.append(item)

    return presented, total


async def get_project_by_id(db, project_id: str, viewer: Dict[str, Any]) -> Dict[str, Any]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not can_view_project(viewer, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return await present_project(db, project)


async def update_project(
    db,
    project_id: str,
    payload: WebsiteProjectUpdate,
    actor: Dict[str, Any],
) -> Dict[str, Any]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not can_manage_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only PM or Admin can edit project details")

    now = _now_iso()
    updates: Dict[str, Any] = {"updated_at": now}

    CLEARABLE_FIELDS = {"staging_url", "live_url", "description", "start_date", "target_launch_date"}
    data = payload.model_dump(exclude_unset=True)
    data.pop("stage", None)
    data.pop("health", None)
    for k, v in data.items():
        if k == "on_hold" and v is not None:
            updates["on_hold"] = v
            if v is True:
                # Freeze current progress
                current_p = await present_project(db, project, now)
                updates["frozen_progress"] = current_p["progress"]
                await _log_activity(db, project_id, "project_on_hold", "Project placed On Hold.", actor)
            else:
                updates["frozen_progress"] = None
                await _log_activity(db, project_id, "project_resumed", "Project resumed from On Hold.", actor)
        elif k in CLEARABLE_FIELDS:
            updates[k] = None if (v is None or v == "") else v
        elif v is not None:
            updates[k] = v

    if len(updates) > 1:
        await db.website_projects.update_one({"id": project_id}, {"$set": updates})

    updated_doc = await db.website_projects.find_one({"id": project_id})
    return await present_project(db, updated_doc, now)


async def transition_stage(
    db,
    project_id: str,
    target_stage: str,
    actor: Dict[str, Any],
    note: Optional[str] = None,
    is_force: bool = False,
) -> Tuple[Dict[str, Any], List[str]]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not can_manage_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only PM or Admin can move project stages")

    current_stage = project.get("stage", "strategy")
    target_stage = target_stage.lower().strip()

    # Fetch tasks for current stage
    tasks = await db.website_project_tasks.find({"project_id": project_id, "stage": current_stage}).to_list(length=500)

    # Fetch gate for current stage
    gate_key = STAGE_GATE_MAP.get(current_stage)
    stage_gate = None
    if gate_key:
        stage_gate = await db.website_project_gates.find_one({"project_id": project_id, "gate_key": gate_key})

    # Fetch asset tasks if development -> qa
    asset_tasks = None
    if current_stage == "development" and target_stage == "qa":
        asset_tasks = await db.website_project_tasks.find({"project_id": project_id, "stage": "assets"}).to_list(length=500)

    allowed, reason, warnings = check_transition(
        project,
        target_stage,
        tasks,
        stage_gate,
        asset_tasks=asset_tasks,
        is_force=is_force,
    )
    if not allowed:
        raise WorkflowError(reason or "Transition rejected")

    now = _now_iso()
    updates: Dict[str, Any] = {
        "stage": target_stage,
        "updated_at": now,
    }
    if target_stage == "completed":
        updates["health"] = "completed"

    await db.website_projects.update_one({"id": project_id}, {"$set": updates})

    # When advancing to client_review, automatically submit staging gate if it's draft
    if target_stage == "client_review":
        staging_gate = await db.website_project_gates.find_one({"project_id": project_id, "gate_key": "staging"})
        if staging_gate and staging_gate.get("status") == "draft":
            await db.website_project_gates.update_one(
                {"project_id": project_id, "gate_key": "staging"},
                {"$set": {"status": "in_review", "updated_at": now}},
            )
            client_users = await _find_client_users_for_workspace(db, project.get("workspace_id"))
            await _notify_event(
                db,
                project,
                client_users,
                title="Review Requested: Staging Website",
                body=f"Staging Website for {project.get('name')} is ready for your review and approval.",
                kind="website_review_requested",
                actor_id=actor.get("id"),
                data={
                    "gate_key": "staging",
                    "gate_label": "Staging Website",
                    "type": "review_requested",
                    "target": "portal",
                },
            )

    act_body = f"Stage moved from {STAGE_NAMES.get(current_stage, current_stage)} to {STAGE_NAMES.get(target_stage, target_stage)}."
    if note:
        act_body += f" Note: {note}"
    await _log_activity(db, project_id, "stage_moved", act_body, actor, meta={"target_stage": target_stage, "forced": is_force})

    # Dispatch Project Stage Completed or Project Launched notification
    if target_stage != current_stage:
        if target_stage == "completed":
            pm_id = str(project.get("manager_id")) if project.get("manager_id") else None
            team_members = await _find_project_team_members(db, project_id)
            admins = await _find_admin_users(db)
            client_users = await _find_client_users_for_workspace(db, project.get("workspace_id"))
            recipients = list(set(([pm_id] if pm_id else []) + team_members + admins + client_users))
            await _notify_event(
                db,
                project,
                recipients,
                title=f"Project Completed: {project.get('name')} 🚀",
                body=f"Congratulations! {project.get('name')} has successfully completed all stages and is officially launched!",
                kind="website_stage_completed",
                actor_id=actor.get("id"),
                data={
                    "stage": "completed",
                    "prev_stage": current_stage,
                    "type": "stage_completed",
                },
            )
        else:
            from_name = STAGE_NAMES.get(current_stage, current_stage.replace("_", " ").title())
            to_name = STAGE_NAMES.get(target_stage, target_stage.replace("_", " ").title())
            pm_id = str(project.get("manager_id")) if project.get("manager_id") else None
            team_members = await _find_project_team_members(db, project_id)
            admins = await _find_admin_users(db)
            recipients = list(set(([pm_id] if pm_id else []) + team_members + admins))
            await _notify_event(
                db,
                project,
                recipients,
                title=f"Stage Completed: {from_name} ➔ {to_name}",
                body=f"{project.get('name')} completed the {from_name} stage and moved to {to_name}.",
                kind="website_stage_completed",
                actor_id=actor.get("id"),
                data={
                    "stage": target_stage,
                    "prev_stage": current_stage,
                    "type": "stage_completed",
                },
            )

    updated_doc = await db.website_projects.find_one({"id": project_id})
    presented = await present_project(db, updated_doc, now)
    return presented, warnings


async def try_auto_advance(db, project_id: str, actor: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Evaluates if the project satisfies auto-advance criteria and moves it forward if so."""
    project = await db.website_projects.find_one({"id": project_id})
    if not project or project.get("on_hold"):
        return None

    current_stage = project.get("stage", "strategy")
    next_stage = NEXT_STAGE_MAP.get(current_stage)
    if not next_stage:
        return None

    tasks = await db.website_project_tasks.find({"project_id": project_id, "stage": current_stage}).to_list(length=500)
    gate_key = STAGE_GATE_MAP.get(current_stage)
    stage_gate = None
    if gate_key:
        stage_gate = await db.website_project_gates.find_one({"project_id": project_id, "gate_key": gate_key})

    allowed, _, _ = check_transition(project, next_stage, tasks, stage_gate)
    if allowed:
        if actor and can_manage_project(actor, project):
            advance_actor = actor
        else:
            actor_name = actor.get("name") if actor else "System"
            advance_actor = {
                "id": "system",
                "name": f"Workflow Auto-Advance ({actor_name})",
                "role": "admin",
            }
        await transition_stage(db, project_id, next_stage, advance_actor, note="Auto-advanced on criteria completion.")
        return next_stage
    return None


# ==========================================
# Task Operations
# ==========================================

async def create_task(db, project_id: str, payload: WebsiteTaskCreate, actor: Dict[str, Any]) -> Dict[str, Any]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not can_manage_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create tasks on this project")

    task_id = f"task_{uuid4().hex[:10]}"
    now = _now_iso()

    assignee_name = payload.assignee_name
    if payload.assignee_id and not assignee_name:
        user = await db.users.find_one({"id": payload.assignee_id})
        if user:
            assignee_name = user.get("full_name") or user.get("name")

    task_doc = {
        "id": task_id,
        "project_id": project_id,
        "stage": payload.stage,
        "name": payload.name,
        "assignee_id": payload.assignee_id,
        "assignee_name": assignee_name,
        "department": payload.department,
        "due_date": payload.due_date,
        "status": payload.status,
        "priority": payload.priority,
        "kind": payload.kind,
        "description": payload.description,
        "required": payload.required,
        "comments": [],
        "created_at": now,
        "updated_at": now,
    }
    await db.website_project_tasks.insert_one(task_doc)

    await _log_activity(
        db,
        project_id,
        "task_created",
        f"Created task '{payload.name}' in {STAGE_NAMES.get(payload.stage, payload.stage)}.",
        actor,
        meta={"task_id": task_id, "kind": payload.kind},
    )

    if payload.assignee_id:
        stage_name = STAGE_NAMES.get(payload.stage, payload.stage.replace("_", " ").title())
        due_text = f" Due: {payload.due_date}." if payload.due_date else ""
        await _notify_event(
            db,
            project,
            [payload.assignee_id],
            title=f"New Task Assigned: {payload.name}",
            body=f"You were assigned '{payload.name}' on {project.get('name')} in {stage_name}.{due_text}",
            kind="website_task_assigned",
            actor_id=actor.get("id"),
            data={
                "task_id": task_id,
                "task_name": payload.name,
                "stage": payload.stage,
                "type": "task_assigned",
            },
        )

    return task_doc


async def get_tasks(
    db,
    project_id: str,
    viewer: Dict[str, Any],
    stage: Optional[str] = None,
    assignee_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_view_project(viewer, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    q: Dict[str, Any] = {"project_id": project_id}
    if stage:
        q["stage"] = stage.lower().strip()
    if assignee_id:
        q["assignee_id"] = assignee_id

    cursor = db.website_project_tasks.find(q).sort("created_at", 1)
    tasks = await cursor.to_list(length=1000)
    proj_name = project.get("name", "")
    for t in tasks:
        t.pop("_id", None)
        t["project_name"] = proj_name
    return tasks


async def get_all_tasks(
    db,
    viewer: Dict[str, Any],
    project_id: Optional[str] = None,
    stage: Optional[str] = None,
    status_filter: Optional[str] = None,
    assignee_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 2000,
) -> List[Dict[str, Any]]:
    """Returns tasks across all visible projects, optionally filtered by project, stage, status, or assignee."""
    cursor = db.website_projects.find({}, {"_id": 0, "id": 1, "name": 1, "workspace_id": 1, "manager_id": 1})
    all_projects = await cursor.to_list(length=1000)
    visible_projects = [p for p in all_projects if can_view_project(viewer, p)]
    if not visible_projects:
        return []

    project_map = {p["id"]: p.get("name", "") for p in visible_projects}
    visible_ids = list(project_map.keys())

    if project_id and project_id != "all":
        if project_id not in project_map:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for requested project")
        target_ids = [project_id]
    else:
        target_ids = visible_ids

    q: Dict[str, Any] = {"project_id": {"$in": target_ids}}
    if stage and stage != "all":
        q["stage"] = stage.lower().strip()
    if status_filter and status_filter != "all":
        q["status"] = status_filter.lower().strip()
    if assignee_id and assignee_id != "all":
        q["assignee_id"] = assignee_id
    if search and search.strip():
        rgx = {"$regex": re.escape(search.strip()), "$options": "i"}
        q["$or"] = [{"name": rgx}, {"description": rgx}]

    t_cursor = db.website_project_tasks.find(q).sort("created_at", -1)
    tasks = await t_cursor.to_list(length=limit)
    for t in tasks:
        t.pop("_id", None)
        t["project_name"] = project_map.get(t.get("project_id", ""), "")
    return tasks


async def update_task(
    db,
    project_id: str,
    task_id: str,
    payload: WebsiteTaskUpdate,
    actor: Dict[str, Any],
) -> Dict[str, Any]:
    project = await db.website_projects.find_one({"id": project_id})
    task = await db.website_project_tasks.find_one({"id": task_id, "project_id": project_id})
    if not project or not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if not can_edit_task(actor, project, task):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit this task")

    now = _now_iso()
    updates: Dict[str, Any] = {"updated_at": now}
    data = payload.model_dump(exclude_unset=True)

    old_status = task.get("status")
    old_assignee = task.get("assignee_id")
    for k, v in data.items():
        if v is not None:
            updates[k] = v

    await db.website_project_tasks.update_one({"id": task_id}, {"$set": updates})
    updated_task = await db.website_project_tasks.find_one({"id": task_id})
    updated_task.pop("_id", None)

    # Activity logging
    new_status = updates.get("status")
    if new_status and new_status != old_status:
        if new_status == "completed":
            await _log_activity(
                db,
                project_id,
                "task_completed",
                f"Task '{task.get('name')}' marked completed.",
                actor,
                meta={"task_id": task_id},
            )
            # Try auto advance!
            await try_auto_advance(db, project_id, actor)

    # Task Assignment notification on reassignment or initial assignment
    new_assignee = updates.get("assignee_id")
    if new_assignee and str(new_assignee) != str(old_assignee or ""):
        task_stage = updated_task.get("stage", "strategy")
        stage_name = STAGE_NAMES.get(task_stage, str(task_stage).replace("_", " ").title())
        due_val = updated_task.get("due_date")
        due_text = f" Due: {due_val}." if due_val else ""
        await _notify_event(
            db,
            project,
            [new_assignee],
            title=f"New Task Assigned: {updated_task.get('name')}",
            body=f"You were assigned '{updated_task.get('name')}' on {project.get('name')} in {stage_name}.{due_text}",
            kind="website_task_assigned",
            actor_id=actor.get("id"),
            data={
                "task_id": task_id,
                "task_name": updated_task.get("name"),
                "stage": task_stage,
                "type": "task_assigned",
            },
        )

    return updated_task


async def delete_task(db, project_id: str, task_id: str, actor: Dict[str, Any]) -> None:
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_manage_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only PM or Admin can delete tasks")

    res = await db.website_project_tasks.delete_one({"id": task_id, "project_id": project_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    await _log_activity(db, project_id, "task_deleted", f"Task '{task_id}' was deleted.", actor)


async def add_task_comment(
    db,
    project_id: str,
    task_id: str,
    text: str,
    actor: Dict[str, Any],
) -> List[Dict[str, Any]]:
    project = await db.website_projects.find_one({"id": project_id})
    task = await db.website_project_tasks.find_one({"id": task_id, "project_id": project_id})
    if not project or not task or not can_view_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    comment = {
        "id": f"tc_{uuid4().hex[:8]}",
        "user_id": str(actor.get("id")),
        "user_name": actor.get("full_name") or actor.get("name") or "User",
        "text": text.strip(),
        "created_at": _now_iso(),
    }
    await db.website_project_tasks.update_one(
        {"id": task_id},
        {"$push": {"comments": comment}, "$set": {"updated_at": _now_iso()}},
    )

    # Notify assignee / PM if someone else commented
    is_client_actor = actor.get("role") == "client"
    if is_client_actor:
        # Client feedback on a task
        recipients = [task.get("assignee_id")] if task.get("assignee_id") else []
        pm_id = str(project.get("manager_id")) if project.get("manager_id") else None
        if pm_id and pm_id not in recipients:
            recipients.append(pm_id)
        if not recipients:
            recipients = await _find_admin_users(db)

        await _notify_event(
            db,
            project,
            recipients,
            title=f"Client Feedback on Task: {task.get('name')}",
            body=f"{comment['user_name']} left feedback on '{task.get('name')}': {text[:80]}",
            kind="website_client_feedback",
            actor_id=actor.get("id"),
            data={
                "task_id": task_id,
                "type": "client_feedback",
            },
        )
    elif task.get("assignee_id") and str(task.get("assignee_id")) != str(actor.get("id")):
        await _notify_event(
            db,
            project,
            [task.get("assignee_id")],
            title=f"New Task Comment: {task.get('name')}",
            body=f"{comment['user_name']} commented on '{task.get('name')}': {text[:80]}",
            kind="website_task_comment",
            actor_id=actor.get("id"),
            data={
                "task_id": task_id,
                "type": "task_comment",
            },
        )

    updated = await db.website_project_tasks.find_one({"id": task_id})
    return updated.get("comments", [])


# ==========================================
# Approval Gates Operations
# ==========================================

async def get_gates(db, project_id: str, viewer: Dict[str, Any]) -> List[Dict[str, Any]]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_view_project(viewer, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    gates = await db.website_project_gates.find({"project_id": project_id}).to_list(length=10)
    for g in gates:
        g.pop("_id", None)
    return gates


async def submit_gate_for_review(
    db,
    project_id: str,
    gate_key: str,
    payload: WebsiteGateSubmitRequest,
    actor: Dict[str, Any],
) -> Dict[str, Any]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_manage_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only PM or Admin can submit gates for review")

    gate = await db.website_project_gates.find_one({"project_id": project_id, "gate_key": gate_key})
    if not gate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gate not found")

    now = _now_iso()
    updates: Dict[str, Any] = {
        "status": "in_review",
        "updated_at": now,
    }
    if payload.file_ids:
        updates["linked_files"] = list(set((gate.get("linked_files") or []) + payload.file_ids))

    if payload.notes:
        comment = {
            "id": f"gc_{uuid4().hex[:8]}",
            "user_id": str(actor.get("id")),
            "user_name": actor.get("full_name") or actor.get("name") or "Project Manager",
            "text": f"Submitted for review (Round {gate.get('round', 1)}): {payload.notes.strip()}",
            "created_at": now,
        }
        await db.website_project_gates.update_one({"id": gate["id"]}, {"$push": {"comment_thread": comment}})

    await db.website_project_gates.update_one({"id": gate["id"]}, {"$set": updates})

    gate_label = GATE_NAMES.get(gate_key, gate_key)
    await _log_activity(
        db,
        project_id,
        "review_requested",
        f"{gate_label} (Round {gate.get('round', 1)}) submitted to client for review.",
        actor,
    )

    # Notify client workspace users
    ws_id = project.get("workspace_id")
    client_recipients = await _find_client_users_for_workspace(db, ws_id)
    notes_str = f': "{payload.notes.strip()}"' if payload.notes else ""
    await _notify_event(
        db,
        project,
        client_recipients,
        title=f"Review Requested: {gate_label}",
        body=f"{gate_label} for {project.get('name')} is ready for your review and approval{notes_str}.",
        kind="website_review_requested",
        actor_id=actor.get("id"),
        data={
            "gate_key": gate_key,
            "gate_label": gate_label,
            "type": "review_requested",
            "target": "portal",
        },
    )

    updated_gate = await db.website_project_gates.find_one({"id": gate["id"]})
    updated_gate.pop("_id", None)
    return updated_gate


async def record_gate_decision(
    db,
    project_id: str,
    gate_key: str,
    payload: WebsiteGateDecisionRequest,
    actor: Dict[str, Any],
) -> Dict[str, Any]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    gate = await db.website_project_gates.find_one({"project_id": project_id, "gate_key": gate_key})
    if not gate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gate not found")

    # Client can only review gates in their workspace; staff PM/Admin can also review/override
    is_client_user = is_client(actor)
    if is_client_user:
        if not can_client_review_gate(actor, project):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to review gates for this workspace")
    elif not can_manage_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only client or PM can record decisions")

    now = _now_iso()
    decision = payload.decision  # approved | changes_requested
    history_entry = {
        "decision": decision,
        "actor_id": str(actor.get("id")),
        "actor_name": actor.get("full_name") or actor.get("name") or "Reviewer",
        "round": gate.get("round", 1),
        "comment": payload.comment,
        "timestamp": now,
    }

    updates: Dict[str, Any] = {
        "status": decision,
        "updated_at": now,
    }

    if payload.comment:
        comment_entry = {
            "id": f"gc_{uuid4().hex[:8]}",
            "user_id": str(actor.get("id")),
            "user_name": history_entry["actor_name"],
            "text": f"[{decision.replace('_', ' ').title()}] {payload.comment.strip()}",
            "created_at": now,
        }
        await db.website_project_gates.update_one(
            {"id": gate["id"]},
            {"$push": {"comment_thread": comment_entry, "history": history_entry}},
        )
    else:
        await db.website_project_gates.update_one(
            {"id": gate["id"]},
            {"$push": {"history": history_entry}},
        )

    await db.website_project_gates.update_one({"id": gate["id"]}, {"$set": updates})

    gate_label = GATE_NAMES.get(gate_key, gate_key)
    act_type = "approval_received" if decision == "approved" else "feedback_received"
    act_text = f"{gate_label} (Round {gate.get('round', 1)}) was {decision.replace('_', ' ')}."
    if payload.comment:
        act_text += f" Feedback: {payload.comment[:100]}"
    await _log_activity(db, project_id, act_type, act_text, actor)

    # Dispatch Client Approval or Client Feedback notifications
    actor_name = actor.get("full_name") or actor.get("name") or "Client"
    pm_id = str(project.get("manager_id")) if project.get("manager_id") else None
    team_members = await _find_project_team_members(db, project_id)

    if decision == "approved":
        admins = await _find_admin_users(db)
        recipients = list(set(([pm_id] if pm_id else []) + team_members + admins))
        note_str = f' with note: "{payload.comment.strip()}"' if payload.comment else ""
        await _notify_event(
            db,
            project,
            recipients,
            title=f"Client Approval Received: {gate_label} 🎉",
            body=f"{gate_label} for {project.get('name')} was approved by {actor_name}{note_str}.",
            kind="website_client_approval",
            actor_id=actor.get("id"),
            data={
                "gate_key": gate_key,
                "gate_label": gate_label,
                "decision": decision,
                "type": "client_approval",
            },
        )
    else:
        recipients = list(set(([pm_id] if pm_id else []) + team_members))
        if not recipients:
            recipients = await _find_admin_users(db)
        comment_str = f': "{payload.comment.strip()}"' if payload.comment else "."
        await _notify_event(
            db,
            project,
            recipients,
            title=f"Client Feedback Received: {gate_label} ⚠️",
            body=f"{actor_name} requested changes on {gate_label} for {project.get('name')}{comment_str}",
            kind="website_client_feedback",
            actor_id=actor.get("id"),
            data={
                "gate_key": gate_key,
                "gate_label": gate_label,
                "decision": decision,
                "type": "client_feedback",
            },
        )

    # If approved, try auto-advance!
    if decision == "approved":
        await try_auto_advance(db, project_id, actor)

    updated_gate = await db.website_project_gates.find_one({"id": gate["id"]})
    updated_gate.pop("_id", None)
    return updated_gate


async def create_revision_task_from_gate(
    db,
    project_id: str,
    gate_key: str,
    payload: WebsiteGateRevisionTaskRequest,
    actor: Dict[str, Any],
) -> Dict[str, Any]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_manage_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only PM or Admin can create revision tasks")

    gate = await db.website_project_gates.find_one({"project_id": project_id, "gate_key": gate_key})
    if not gate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gate not found")

    # Extract latest client feedback comment
    latest_comment = ""
    history = gate.get("history") or []
    for h in reversed(history):
        if h.get("decision") == "changes_requested" and h.get("comment"):
            latest_comment = h.get("comment")
            break

    gate_label = GATE_NAMES.get(gate_key, gate_key)
    task_name = payload.name or f"Revise: {gate_label} (Round {gate.get('round', 1)})"

    task_payload = WebsiteTaskCreate(
        name=task_name,
        stage=gate.get("stage", "strategy"),
        assignee_id=payload.assignee_id,
        assignee_name=payload.assignee_name,
        department=payload.department,
        due_date=payload.due_date,
        status="todo",
        priority=payload.priority,
        kind="revision",
        description=latest_comment or "Client requested changes.",
        required=True,
    )
    task = await create_task(db, project_id, task_payload, actor)

    # Bump gate round for upcoming resubmission
    await db.website_project_gates.update_one(
        {"id": gate["id"]},
        {"$inc": {"round": 1}, "$set": {"updated_at": _now_iso()}},
    )

    return task


# ==========================================
# File & Asset Operations
# ==========================================

async def create_file_record(db, project_id: str, payload: WebsiteFileCreate, actor: Dict[str, Any]) -> Dict[str, Any]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_view_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    file_id = f"wfile_{uuid4().hex[:10]}"
    now = _now_iso()

    doc = {
        "id": file_id,
        "project_id": project_id,
        "folder": payload.folder,
        "name": payload.name,
        "storage_key": payload.storage_key,
        "external_url": payload.external_url,
        "file_size": payload.file_size,
        "mime_type": payload.mime_type,
        "task_id": payload.task_id,
        "gate_id": payload.gate_id,
        "created_by": actor.get("full_name") or actor.get("name") or "User",
        "created_at": now,
    }
    await db.website_project_files.insert_one(doc)

    await _log_activity(
        db,
        project_id,
        "file_uploaded",
        f"Added file/link '{payload.name}' to folder '{payload.folder.capitalize()}'.",
        actor,
        meta={"file_id": file_id},
    )

    doc.pop("_id", None)
    return doc


async def get_files(
    db,
    project_id: str,
    viewer: Dict[str, Any],
    folder: Optional[str] = None,
) -> List[Dict[str, Any]]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_view_project(viewer, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    q: Dict[str, Any] = {"project_id": project_id}
    if folder:
        q["folder"] = folder.lower().strip()

    cursor = db.website_project_files.find(q).sort("created_at", -1)
    files = await cursor.to_list(length=500)
    for f in files:
        f.pop("_id", None)
    return files


async def delete_file_record(db, project_id: str, file_id: str, actor: Dict[str, Any]) -> None:
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_manage_project(actor, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only PM or Admin can delete files")

    res = await db.website_project_files.delete_one({"id": file_id, "project_id": project_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    await _log_activity(db, project_id, "file_deleted", f"File '{file_id}' deleted.", actor)


# ==========================================
# Activities & Summary Metrics
# ==========================================

async def get_activities(db, project_id: str, viewer: Dict[str, Any], limit: int = 50) -> List[Dict[str, Any]]:
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_view_project(viewer, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    cursor = db.website_project_activities.find({"project_id": project_id}).sort("created_at", -1).limit(limit)
    acts = await cursor.to_list(length=limit)
    for a in acts:
        a.pop("_id", None)
    return acts


async def get_summary_metrics(db, viewer: Dict[str, Any]) -> Dict[str, int]:
    base_q: Dict[str, Any] = {}
    if is_client(viewer):
        user_ws = viewer.get("workspace_ids") or []
        base_q["workspace_id"] = {"$in": [str(w) for w in user_ws]}
    elif not (is_admin_or_ops(viewer) or is_website_lead(viewer)):
        depts = get_user_departments(viewer)
        if not (depts & ALLOWED_DEPARTMENTS):
            base_q["manager_id"] = str(viewer.get("id") or "")

    raw_projects = await db.website_projects.find(base_q).to_list(length=2000)
    projects = [p for p in raw_projects if can_view_project(viewer, p)]
    now = _now_iso()
    today = now[:10]
    in_30_days = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")

    active_count = 0
    waiting_on_client_count = 0
    at_risk_count = 0
    on_hold_count = 0
    launches_30_days_count = 0
    overdue_tasks_total = 0
    pending_approvals_total = 0

    # Project IDs list
    pids = [p["id"] for p in projects]

    # Pre-fetch tasks and gates
    tasks = await db.website_project_tasks.find({"project_id": {"$in": pids}}).to_list(length=10000)
    gates = await db.website_project_gates.find({"project_id": {"$in": pids}}).to_list(length=5000)

    tasks_by_proj: Dict[str, List[Dict[str, Any]]] = {}
    for t in tasks:
        tasks_by_proj.setdefault(t["project_id"], []).append(t)

    gates_by_proj: Dict[str, List[Dict[str, Any]]] = {}
    for g in gates:
        gates_by_proj.setdefault(g["project_id"], []).append(g)

    for p in projects:
        pid = p["id"]
        stage = p.get("stage", "strategy")
        if stage != "completed":
            active_count += 1

        if p.get("on_hold"):
            on_hold_count += 1

        p_tasks = tasks_by_proj.get(pid, [])
        p_gates = gates_by_proj.get(pid, [])

        p_overdue = sum(
            1 for t in p_tasks
            if str(t.get("status") or "").lower() != "completed"
            and t.get("due_date") and str(t.get("due_date")) < today
        )
        overdue_tasks_total += p_overdue

        p_pending = sum(1 for g in p_gates if str(g.get("status") or "").lower() == "in_review")
        pending_approvals_total += p_pending

        h = calculate_health(p, p_gates, p_overdue, today)
        if h == "waiting_on_client":
            waiting_on_client_count += 1
        elif h == "at_risk":
            at_risk_count += 1

        target_launch = str(p.get("target_launch_date") or "").strip()
        if target_launch and today <= target_launch <= in_30_days and stage != "completed":
            launches_30_days_count += 1

    return {
        "active_projects": active_count,
        "waiting_on_client": waiting_on_client_count,
        "at_risk": at_risk_count,
        "overdue_tasks": overdue_tasks_total,
        "launches_next_30_days": launches_30_days_count,
        "pending_approvals": pending_approvals_total,
        "on_hold": on_hold_count,
    }


async def list_team_members(db, viewer: Dict[str, Any]) -> List[Dict[str, Any]]:
    if is_client(viewer):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    cursor = db.users.find(
        {"is_active": {"$ne": False}, "role": {"$ne": "client"}},
        {"_id": 0, "id": 1, "name": 1, "full_name": 1, "email": 1, "role": 1, "department": 1},
    ).sort("name", 1)
    users = await cursor.to_list(length=300)
    out = []
    for u in users:
        fn = u.get("full_name") or u.get("name") or "User"
        out.append({
            "id": str(u.get("id")),
            "name": fn,
            "full_name": fn,
            "email": u.get("email") or "",
            "role": u.get("role") or "team_member",
            "department": u.get("department") or "",
        })
    return out

