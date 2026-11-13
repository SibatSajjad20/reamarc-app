"""Task Manager API router."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.database import get_database
from app.schemas.task import (
    TaskAssignRequest,
    TaskBatchRequest,
    TaskBlockRequest,
    TaskBulkImportRequest,
    TaskBulkImportResponse,
    TaskCancelRequest,
    TaskCommentCreate,
    TaskCommentPatch,
    TaskCreate,
    TaskDriveAttachment,
    TaskLinkAttachment,
    TaskSavedViewCreate,
    TaskSettingsPatch,
    TaskStagePatch,
    TaskUpdate,
    TaskWatcherRequest,
    ChecklistItemCreate,
    ChecklistItemPatch,
)
from app.services import task_activity, task_attachments, task_chat, task_comments, task_service
from app.services.task_access import can_open_module, is_admin
from app.services.task_service import require_module_user

router = APIRouter(prefix="/tasks", tags=["Task Manager"])


async def require_tasks_user(current_user: dict = Depends(get_current_user)) -> dict:
    db = get_database()
    settings = await task_service.get_task_settings(db)
    if not can_open_module(current_user, settings):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to Tasks")
    return current_user


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return db


def _company_of(user: dict) -> Optional[Dict[str, Any]]:
    company = user.get("company")
    if isinstance(company, dict):
        return company
    cid = user.get("company_id")
    if cid:
        return {"id": cid, "timezone": "Asia/Karachi"}
    return None


@router.get("/counts")
@limiter.limit("120/minute")
async def get_counts(request: Request, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    await task_service.ensure_task_indexes(db)
    return await task_service.counts(db, current_user, company=_company_of(current_user))


@router.get("/follow-up")
@limiter.limit("120/minute")
async def get_follow_up(request: Request, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return await task_service.follow_up_buckets(db, current_user, company=_company_of(current_user))


@router.get("/calendar")
@limiter.limit("120/minute")
async def get_calendar(
    request: Request,
    start: Optional[str] = Query(None, alias="from"),
    end: Optional[str] = Query(None, alias="to"),
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    if not start or not end:
        raise HTTPException(status_code=422, detail="from and to are required (YYYY-MM-DD)")
    return {"items": await task_service.calendar_tasks(db, current_user, start, end, company=_company_of(current_user))}


@router.get("/overview")
@limiter.limit("120/minute")
async def get_overview(request: Request, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return await task_service.overview(db, current_user, company=_company_of(current_user))


@router.get("/assignable-users")
@limiter.limit("120/minute")
async def get_assignable_users(
    request: Request,
    task_id: Optional[str] = None,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return {"items": await task_service.list_assignable(db, current_user, task_id)}


@router.get("/settings")
@limiter.limit("60/minute")
async def get_settings(request: Request, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can view task settings")
    doc = await task_service.get_task_settings(db)
    doc.pop("_id", None)
    return doc


@router.patch("/settings")
@limiter.limit("30/minute")
async def patch_settings(
    request: Request,
    payload: TaskSettingsPatch,
    current_user: dict = Depends(get_current_user),
):
    db = _db()
    doc = await task_service.patch_task_settings(db, payload.model_dump(exclude_unset=True), current_user)
    doc.pop("_id", None)
    return doc


@router.get("/activity")
@limiter.limit("60/minute")
async def company_activity(
    request: Request,
    type: Optional[str] = None,
    actor_id: Optional[str] = None,
    task_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(require_tasks_user),
):
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can view company-wide activity")
    db = _db()
    offset = max(0, (page - 1) * limit)
    items = await task_activity.list_company_activity(
        db,
        limit=limit,
        offset=offset,
        act_type=type,
        actor_id=actor_id,
        task_id=task_id,
        date_from=date_from,
        date_to=date_to,
    )
    return {"items": items}


@router.get("/conversations")
@limiter.limit("60/minute")
async def list_conversations(
    request: Request,
    page: int = 1,
    limit: int = 30,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    await task_service.ensure_task_indexes(db)
    return await task_chat.list_conversations(db, current_user, page=page, limit=limit)


@router.get("/chat/unread")
@limiter.limit("60/minute")
async def chat_unread(request: Request, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return await task_chat.unread_counts(db, current_user)


@router.get("/saved-views")
@limiter.limit("60/minute")
async def list_saved_views(request: Request, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return {"items": await task_service.list_saved_views(db, current_user)}


@router.post("/saved-views")
@limiter.limit("30/minute")
async def create_saved_view(
    request: Request,
    payload: TaskSavedViewCreate,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.create_saved_view(db, current_user, payload.model_dump())


@router.delete("/saved-views/{view_id}")
@limiter.limit("30/minute")
async def delete_saved_view(request: Request, view_id: str, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return await task_service.delete_saved_view(db, view_id, current_user)


@router.patch("/batch")
@limiter.limit("30/minute")
async def batch_update(
    request: Request,
    payload: TaskBatchRequest,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    items = await task_service.batch_update(db, [i.model_dump() for i in payload.items], current_user)
    return {"results": items}


@router.get("")
@limiter.limit("120/minute")
async def list_tasks(
    request: Request,
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
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    await task_service.ensure_task_indexes(db)
    return await task_service.list_tasks(
        db,
        current_user,
        scope=scope,
        stage=stage,
        priority=priority,
        assignee_id=assignee_id,
        assigner_id=assigner_id,
        department=department,
        due_from=due_from,
        due_to=due_to,
        blocked=blocked,
        q=q,
        parent_id=parent_id,
        include_cancelled=include_cancelled,
        has_attachments=has_attachments,
        related_client=related_client,
        page=page,
        limit=limit,
    )


@router.post("/bulk-import", response_model=TaskBulkImportResponse, status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def bulk_import_tasks(
    request: Request,
    payload: TaskBulkImportRequest,
    current_user: dict = Depends(require_tasks_user),
):
    """Bulk import tasks from Excel. Upsert by T-NNNN serial, with the same sanitization as content calendar."""
    db = _db()
    await task_service.ensure_task_indexes(db)
    return await task_service.bulk_import_tasks(
        db,
        payload.items,
        current_user,
        upsert_by_serial=payload.upsert_by_serial,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def create_task(
    request: Request,
    payload: TaskCreate,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    await task_service.ensure_task_indexes(db)
    data = payload.model_dump()
    if payload.related:
        data["related"] = payload.related.model_dump()
    if payload.recurrence:
        data["recurrence"] = payload.recurrence.model_dump()
    if payload.checklist:
        data["checklist"] = [c.model_dump() for c in payload.checklist]
    return await task_service.create_task(db, data, current_user)


@router.get("/{task_id}/mentionable")
@limiter.limit("60/minute")
async def mentionable_users(request: Request, task_id: str, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return {"items": await task_service.list_mentionable(db, current_user, task_id)}


@router.post("/{task_id}/read")
@limiter.limit("60/minute")
async def mark_task_read(request: Request, task_id: str, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return await task_chat.mark_read(db, task_id, current_user)


@router.get("/{task_id}")
@limiter.limit("120/minute")
async def get_task(request: Request, task_id: str, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return await task_service.get_task(db, task_id, current_user)


@router.patch("/{task_id}")
@limiter.limit("60/minute")
async def patch_task(
    request: Request,
    task_id: str,
    payload: TaskUpdate,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    data = payload.model_dump(exclude_unset=True)
    if payload.related is not None:
        data["related"] = payload.related.model_dump()
    if payload.recurrence is not None:
        data["recurrence"] = payload.recurrence.model_dump()
    return await task_service.patch_task(db, task_id, data, current_user)


@router.patch("/{task_id}/stage")
@limiter.limit("60/minute")
async def patch_stage(
    request: Request,
    task_id: str,
    payload: TaskStagePatch,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.change_stage(db, task_id, payload.to, current_user, payload.reason)


@router.post("/{task_id}/assign")
@limiter.limit("60/minute")
async def assign_task(
    request: Request,
    task_id: str,
    payload: TaskAssignRequest,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.assign_task(db, task_id, payload.assignee_id, current_user, payload.note)


@router.post("/{task_id}/block")
@limiter.limit("60/minute")
async def block_task(
    request: Request,
    task_id: str,
    payload: TaskBlockRequest,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.set_blocked(db, task_id, payload.blocked, payload.reason, current_user)


@router.post("/{task_id}/cancel")
@limiter.limit("30/minute")
async def cancel_task(
    request: Request,
    task_id: str,
    payload: TaskCancelRequest,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.cancel_task(db, task_id, payload.reason, current_user)


@router.delete("/{task_id}")
@limiter.limit("30/minute")
async def delete_task(request: Request, task_id: str, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return await task_service.delete_task(db, task_id, current_user)


@router.post("/{task_id}/checklist")
@limiter.limit("60/minute")
async def add_checklist(
    request: Request,
    task_id: str,
    payload: ChecklistItemCreate,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.add_checklist_item(db, task_id, payload.text, current_user)


@router.patch("/{task_id}/checklist/{item_id}")
@limiter.limit("60/minute")
async def patch_checklist(
    request: Request,
    task_id: str,
    item_id: str,
    payload: ChecklistItemPatch,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.patch_checklist_item(db, task_id, item_id, payload.model_dump(exclude_unset=True), current_user)


@router.delete("/{task_id}/checklist/{item_id}")
@limiter.limit("60/minute")
async def delete_checklist(
    request: Request,
    task_id: str,
    item_id: str,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.delete_checklist_item(db, task_id, item_id, current_user)


@router.post("/{task_id}/watchers")
@limiter.limit("60/minute")
async def add_watcher(
    request: Request,
    task_id: str,
    payload: TaskWatcherRequest,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.add_watcher(db, task_id, payload.user_id, current_user)


@router.delete("/{task_id}/watchers/{user_id}")
@limiter.limit("60/minute")
async def remove_watcher(
    request: Request,
    task_id: str,
    user_id: str,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_service.remove_watcher(db, task_id, user_id, current_user)


@router.get("/{task_id}/comments")
@limiter.limit("120/minute")
async def list_comments(
    request: Request,
    task_id: str,
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_comments.list_comments(db, task_id, current_user, page=page, limit=limit)


@router.post("/{task_id}/comments")
@limiter.limit("30/minute")
async def add_comment(
    request: Request,
    task_id: str,
    payload: TaskCommentCreate,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_comments.add_comment(
        db,
        task_id,
        payload.text,
        current_user,
        question=payload.question,
        add_watchers=payload.add_watchers,
    )


@router.patch("/{task_id}/comments/{cid}")
@limiter.limit("30/minute")
async def edit_comment(
    request: Request,
    task_id: str,
    cid: str,
    payload: TaskCommentPatch,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_comments.edit_comment(db, task_id, cid, payload.text, current_user)


@router.delete("/{task_id}/comments/{cid}")
@limiter.limit("30/minute")
async def delete_comment(
    request: Request,
    task_id: str,
    cid: str,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_comments.delete_comment(db, task_id, cid, current_user)


@router.get("/{task_id}/attachments")
@limiter.limit("60/minute")
async def list_attachments(request: Request, task_id: str, current_user: dict = Depends(require_tasks_user)):
    db = _db()
    return {"items": await task_attachments.list_attachments(db, task_id, current_user)}


@router.post("/{task_id}/attachments")
@limiter.limit("20/minute")
async def upload_attachment(
    request: Request,
    task_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_attachments.upload_attachment(db, task_id, file, current_user)


@router.post("/{task_id}/attachments/link")
@limiter.limit("30/minute")
async def add_link(
    request: Request,
    task_id: str,
    payload: TaskLinkAttachment,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_attachments.add_link(db, task_id, payload.name, payload.url, current_user)


@router.post("/{task_id}/attachments/from-drive")
@limiter.limit("30/minute")
async def add_drive(
    request: Request,
    task_id: str,
    payload: TaskDriveAttachment,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_attachments.add_drive_file(db, task_id, payload.model_dump(), current_user)


@router.delete("/{task_id}/attachments/{aid}")
@limiter.limit("30/minute")
async def delete_attachment(
    request: Request,
    task_id: str,
    aid: str,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_attachments.delete_attachment(db, task_id, aid, current_user)


@router.get("/{task_id}/attachments/{aid}/file")
@limiter.limit("120/minute")
async def stream_attachment(
    request: Request,
    task_id: str,
    aid: str,
    download: int = Query(0),
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_attachments.stream_attachment(
        db,
        task_id,
        aid,
        current_user,
        range_header=request.headers.get("range"),
        download=bool(download),
    )


@router.get("/{task_id}/attachments/{aid}/thumb")
@limiter.limit("120/minute")
async def stream_thumb(
    request: Request,
    task_id: str,
    aid: str,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    return await task_attachments.stream_thumb(
        db, task_id, aid, current_user, range_header=request.headers.get("range")
    )


@router.get("/{task_id}/picker-config")
@limiter.limit("60/minute")
async def picker_config(
    request: Request,
    task_id: str,
    response: Response,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    response.headers["Cache-Control"] = "no-store"
    return await task_attachments.picker_config(db, task_id, current_user)


@router.get("/{task_id}/activity")
@limiter.limit("60/minute")
async def task_activity_log(
    request: Request,
    task_id: str,
    current_user: dict = Depends(require_tasks_user),
):
    db = _db()
    await task_service.get_visible_or_404(db, task_id, current_user)
    items = await task_activity.list_task_activity(db, task_id)
    return {"items": items}
