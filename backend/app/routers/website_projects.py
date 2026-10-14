"""
API Router for Website Project Pipeline module.
Provides endpoints for projects, tasks, approval gates, file links, and activity logs.
"""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from app.core.limiter import limiter
from app.core.security import get_current_user
from app.database import get_database
from app.schemas.website_project import (
    WebsiteProjectCreate,
    WebsiteProjectUpdate,
    WebsiteProjectResponse,
    WebsiteProjectListResponse,
    WebsiteSummaryMetrics,
    StageTransitionRequest,
    ForceStageTransitionRequest,
    WebsiteTaskCreate,
    WebsiteTaskUpdate,
    WebsiteTaskResponse,
    WebsiteTaskCommentCreate,
    WebsiteGateResponse,
    WebsiteGateDecisionRequest,
    WebsiteGateSubmitRequest,
    WebsiteGateRevisionTaskRequest,
    WebsiteFileCreate,
    WebsiteFileResponse,
    WebsiteDriveAttachRequest,
    WebsiteActivityResponse,
    TaskComment,
    WebsiteTeamMemberResponse,
)
from app.services import website_project_service
from app.services.permissions import require_permission
from app.services.website_project_workflow import (
    WorkflowError,
    can_create_project,
    can_view_project,
    can_manage_project,
    is_client,
)

router = APIRouter(prefix="/website-projects", tags=["Website Project Pipeline"])


def _handle_workflow_error(e: WorkflowError):
    raise HTTPException(status_code=e.status_code, detail=e.message)


def can_read_website_projects(user: Dict[str, Any] | None) -> bool:
    """Staff with website view permission, plus clients who view their workspace website projects."""
    if not user or not user.get("is_active", True):
        return False
    if is_client(user):
        return True
    from app.services.permissions import load_ctx, resolve, level_gte
    ctx = load_ctx(user)
    return level_gte("website", resolve(ctx, "website"), "view")


async def require_website_reader(current_user: dict = Depends(get_current_user)) -> dict:
    if not can_read_website_projects(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions: requires website level 'view'.",
        )
    return current_user


@router.get("", response_model=WebsiteProjectListResponse)
@limiter.limit("120/minute")
async def list_projects(
    request: Request,
    workspace_id: Optional[str] = Query(None, description="Filter by workspace ID"),
    stage: Optional[str] = Query(None, description="Filter by pipeline stage"),
    health: Optional[str] = Query(None, description="Filter by health status"),
    website_type: Optional[str] = Query(None, description="Filter by website type"),
    manager_id: Optional[str] = Query(None, description="Filter by PM user ID"),
    search: Optional[str] = Query(None, description="Search term for name or client"),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    current_user: dict = Depends(require_website_reader),
):
    """Lists website projects with filtering, search, and pagination."""
    db = get_database()
    items, total = await website_project_service.get_projects(
        db,
        viewer=current_user,
        workspace_id=workspace_id,
        stage=stage,
        health=health,
        website_type=website_type,
        manager_id=manager_id,
        search=search,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total}


@router.get("/metrics/summary", response_model=WebsiteSummaryMetrics)
@limiter.limit("120/minute")
async def get_summary_metrics(
    request: Request,
    current_user: dict = Depends(require_permission("website", "view")),
):
    """Returns top KPI chip counts for the website projects dashboard."""
    db = get_database()
    return await website_project_service.get_summary_metrics(db, current_user)


@router.get("/team-members", response_model=List[WebsiteTeamMemberResponse])
@limiter.limit("120/minute")
async def list_team_members(
    request: Request,
    current_user: dict = Depends(require_permission("website", "view")),
):
    """Returns active organization team members for task assignment."""
    db = get_database()
    return await website_project_service.list_team_members(db, current_user)


@router.get("/tasks", response_model=List[WebsiteTaskResponse])
@limiter.limit("120/minute")
async def list_all_tasks(
    request: Request,
    project_id: Optional[str] = Query(None, description="Filter by project ID"),
    stage: Optional[str] = Query(None, description="Filter by stage"),
    status: Optional[str] = Query(None, description="Filter by task status"),
    assignee_id: Optional[str] = Query(None, description="Filter by assignee user ID"),
    search: Optional[str] = Query(None, description="Search term for task name or description"),
    current_user: dict = Depends(require_website_reader),
):
    """Returns tasks across visible projects, optionally filtered by project, stage, status, or assignee."""
    db = get_database()
    return await website_project_service.get_all_tasks(
        db,
        viewer=current_user,
        project_id=project_id,
        stage=stage,
        status_filter=status,
        assignee_id=assignee_id,
        search=search,
    )


@router.post("", response_model=WebsiteProjectResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def create_project(
    request: Request,
    payload: WebsiteProjectCreate,
    current_user: dict = Depends(get_current_user),
):
    """Creates a new website project, seeding 8 stages and 5 draft approval gates."""
    if not can_create_project(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin, PM, or website department members can create website projects.",
        )
    db = get_database()
    return await website_project_service.create_project(db, payload, current_user)


@router.get("/{project_id}", response_model=WebsiteProjectResponse)
@limiter.limit("120/minute")
async def get_project(
    request: Request,
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Fetches details of a single website project."""
    db = get_database()
    return await website_project_service.get_project_by_id(db, project_id, current_user)


@router.patch("/{project_id}", response_model=WebsiteProjectResponse)
@limiter.limit("60/minute")
async def update_project(
    request: Request,
    project_id: str,
    payload: WebsiteProjectUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Updates website project metadata or toggles On Hold status."""
    db = get_database()
    return await website_project_service.update_project(db, project_id, payload, current_user)


@router.post("/{project_id}/transition", response_model=WebsiteProjectResponse)
@limiter.limit("60/minute")
async def transition_project_stage(
    request: Request,
    project_id: str,
    payload: StageTransitionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Moves project to the next stage after validating gates and required tasks."""
    db = get_database()
    try:
        project, warnings = await website_project_service.transition_stage(
            db,
            project_id=project_id,
            target_stage=payload.target_stage,
            actor=current_user,
            note=payload.note,
            is_force=False,
        )
        return project
    except WorkflowError as e:
        _handle_workflow_error(e)


@router.post("/{project_id}/force-transition", response_model=WebsiteProjectResponse)
@limiter.limit("30/minute")
async def force_transition_project_stage(
    request: Request,
    project_id: str,
    payload: ForceStageTransitionRequest,
    current_user: dict = Depends(get_current_user),
):
    """PM or Admin force-moves a project stage with a required explanatory reason."""
    db = get_database()
    try:
        project, _ = await website_project_service.transition_stage(
            db,
            project_id=project_id,
            target_stage=payload.target_stage,
            actor=current_user,
            note=payload.reason,
            is_force=True,
        )
        return project
    except WorkflowError as e:
        _handle_workflow_error(e)


# ==========================================
# Tasks Endpoints
# ==========================================

@router.get("/{project_id}/tasks", response_model=List[WebsiteTaskResponse])
@limiter.limit("120/minute")
async def list_tasks(
    request: Request,
    project_id: str,
    stage: Optional[str] = Query(None),
    assignee_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Returns tasks for a project, optionally filtered by stage or assignee."""
    db = get_database()
    return await website_project_service.get_tasks(db, project_id, current_user, stage, assignee_id)


@router.post("/{project_id}/tasks", response_model=WebsiteTaskResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def create_task(
    request: Request,
    project_id: str,
    payload: WebsiteTaskCreate,
    current_user: dict = Depends(get_current_user),
):
    """Creates a new task in a project stage."""
    db = get_database()
    return await website_project_service.create_task(db, project_id, payload, current_user)


@router.patch("/{project_id}/tasks/{task_id}", response_model=WebsiteTaskResponse)
@limiter.limit("60/minute")
async def update_task(
    request: Request,
    project_id: str,
    task_id: str,
    payload: WebsiteTaskUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Updates a task status, priority, or assignee."""
    db = get_database()
    return await website_project_service.update_task(db, project_id, task_id, payload, current_user)


@router.delete("/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_task(
    request: Request,
    project_id: str,
    task_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Deletes a task from a project."""
    db = get_database()
    await website_project_service.delete_task(db, project_id, task_id, current_user)


@router.post("/{project_id}/tasks/{task_id}/comments", response_model=List[TaskComment])
@limiter.limit("60/minute")
async def add_task_comment(
    request: Request,
    project_id: str,
    task_id: str,
    payload: WebsiteTaskCommentCreate,
    current_user: dict = Depends(get_current_user),
):
    """Adds a comment to a task discussion thread."""
    db = get_database()
    return await website_project_service.add_task_comment(db, project_id, task_id, payload.text, current_user)


# ==========================================
# Approval Gates Endpoints
# ==========================================

@router.get("/{project_id}/gates", response_model=List[WebsiteGateResponse])
@limiter.limit("120/minute")
async def list_gates(
    request: Request,
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Returns the five approval gates and their decision histories."""
    db = get_database()
    return await website_project_service.get_gates(db, project_id, current_user)


@router.post("/{project_id}/gates/{gate_key}/submit", response_model=WebsiteGateResponse)
@limiter.limit("60/minute")
async def submit_gate(
    request: Request,
    project_id: str,
    gate_key: str,
    payload: WebsiteGateSubmitRequest,
    current_user: dict = Depends(get_current_user),
):
    """Submits an approval gate to the client for review."""
    db = get_database()
    return await website_project_service.submit_gate_for_review(db, project_id, gate_key, payload, current_user)


@router.post("/{project_id}/gates/{gate_key}/decision", response_model=WebsiteGateResponse)
@limiter.limit("60/minute")
async def record_gate_decision(
    request: Request,
    project_id: str,
    gate_key: str,
    payload: WebsiteGateDecisionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Client approves or requests changes on a deliverable gate."""
    db = get_database()
    return await website_project_service.record_gate_decision(db, project_id, gate_key, payload, current_user)


@router.post("/{project_id}/gates/{gate_key}/revision-task", response_model=WebsiteTaskResponse)
@limiter.limit("60/minute")
async def create_revision_task(
    request: Request,
    project_id: str,
    gate_key: str,
    payload: WebsiteGateRevisionTaskRequest,
    current_user: dict = Depends(get_current_user),
):
    """Converts client change request feedback into an assigned revision task."""
    db = get_database()
    return await website_project_service.create_revision_task_from_gate(db, project_id, gate_key, payload, current_user)


@router.get("/{project_id}/picker-config")
@limiter.limit("60/minute")
async def get_website_project_picker_config(
    request: Request,
    project_id: str,
    response: Response,
    task_id: Optional[str] = Query(None, description="Optional task ID to check task assignee access"),
    current_user: dict = Depends(get_current_user),
):
    """Returns Picker API keys and the client website folder ID. Org Drive tokens stay server-side."""
    db = get_database()
    project = await db.website_projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    has_manage = can_manage_project(current_user, project)
    is_task_assignee = False
    if not has_manage and task_id:
        task = await db.website_project_tasks.find_one({"id": task_id, "project_id": project_id})
        if task and str(task.get("assignee_id") or "").strip() == str(current_user.get("id") or "").strip():
            is_task_assignee = True

    if not has_manage and not is_task_assignee:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to attach files to this project.",
        )

    from app.services import google_drive_service as gdrive
    if not gdrive.configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Drive integration is not configured on this server.",
        )
    folder_id = await gdrive.ensure_website_folder(
        db,
        client_name=project.get("client_name"),
        workspace_id=project.get("workspace_id"),
        project_name=project.get("name"),
    )
    response.headers["Cache-Control"] = "no-store"
    return gdrive.picker_public_payload(
        folder_id,
        await gdrive._ensure_root(db),
        actor=current_user,
        item_id=project_id,
        workspace_id=project.get("workspace_id"),
        context="website",
    )


# ==========================================
# Files Endpoints
# ==========================================

@router.get("/{project_id}/files", response_model=List[WebsiteFileResponse])
@limiter.limit("120/minute")
async def list_files(
    request: Request,
    project_id: str,
    folder: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Returns files for a project, optionally filtered by folder."""
    db = get_database()
    return await website_project_service.get_files(db, project_id, current_user, folder)


@router.post("/{project_id}/files", response_model=WebsiteFileResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def create_file(
    request: Request,
    project_id: str,
    payload: WebsiteFileCreate,
    current_user: dict = Depends(get_current_user),
):
    """Attaches an uploaded file storage key or external link to a project folder."""
    db = get_database()
    return await website_project_service.create_file_record(db, project_id, payload, current_user)


@router.post("/{project_id}/files/from-drive", response_model=List[WebsiteFileResponse], status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def attach_files_from_drive(
    request: Request,
    project_id: str,
    payload: WebsiteDriveAttachRequest,
    current_user: dict = Depends(get_current_user),
):
    """Attaches Google Drive files to a website project folder or task."""
    db = get_database()
    project = await db.website_projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    has_manage = can_manage_project(current_user, project)
    is_task_assignee = False
    if not has_manage and payload.task_id:
        task = await db.website_project_tasks.find_one({"id": payload.task_id, "project_id": project_id})
        if task and str(task.get("assignee_id") or "").strip() == str(current_user.get("id") or "").strip():
            is_task_assignee = True

    if not has_manage and not is_task_assignee:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to attach Drive files to this project.",
        )

    from app.services import google_drive_service as gdrive

    dest_folder_id = None
    if gdrive.configured():
        dest_folder_id = await gdrive.ensure_website_folder(
            db,
            client_name=project.get("client_name"),
            workspace_id=project.get("workspace_id"),
            project_name=project.get("name"),
        )

    results: List[Dict[str, Any]] = []
    for f in payload.files:
        file_id = f.id
        name = f.name
        mime_type = f.mimeType
        size_bytes = f.sizeBytes
        external_url = f.url
        if gdrive.configured() and file_id:
            meta = await gdrive.ingest_picked_file(file_id, dest_folder_id)
            file_id = str(meta.get("id") or file_id)
            name = meta.get("name") or name
            mime_type = meta.get("mimeType") or mime_type
            size_bytes = int(meta.get("size") or size_bytes or 0)
            external_url = meta.get("webViewLink") or external_url
        file_payload = WebsiteFileCreate(
            folder=payload.folder,
            name=name,
            storage_key=f"drive:{file_id}",
            external_url=external_url,
            file_size=size_bytes,
            mime_type=mime_type,
            task_id=payload.task_id,
            gate_id=payload.gate_id,
        )
        rec = await website_project_service.create_file_record(db, project_id, file_payload, current_user)
        results.append(rec)

    return results


@router.delete("/{project_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_file(
    request: Request,
    project_id: str,
    file_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Removes a file record from a project."""
    db = get_database()
    await website_project_service.delete_file_record(db, project_id, file_id, current_user)


# ==========================================
# Activities Endpoint
# ==========================================

@router.get("/{project_id}/activities", response_model=List[WebsiteActivityResponse])
@limiter.limit("120/minute")
async def list_activities(
    request: Request,
    project_id: str,
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Returns reverse chronological audit trail and activity log for a project."""
    db = get_database()
    return await website_project_service.get_activities(db, project_id, current_user, limit)
