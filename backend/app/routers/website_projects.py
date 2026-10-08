"""
API Router for Website Project Pipeline module.
Provides endpoints for projects, tasks, approval gates, file links, and activity logs.
"""
import asyncio
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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
    WebsiteActivityResponse,
    TaskComment,
    WebsiteTeamMemberResponse,
)
from app.services import website_project_service
from app.services.website_project_workflow import (
    WorkflowError,
    can_view_project,
    can_manage_project,
    is_client,
)

router = APIRouter(prefix="/website-projects", tags=["Website Project Pipeline"])


def _handle_workflow_error(e: WorkflowError):
    raise HTTPException(status_code=e.status_code, detail=e.message)


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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
):
    """Returns top KPI chip counts for the website projects dashboard."""
    db = get_database()
    return await website_project_service.get_summary_metrics(db, current_user)


@router.get("/team-members", response_model=List[WebsiteTeamMemberResponse])
@limiter.limit("120/minute")
async def list_team_members(
    request: Request,
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
    if is_client(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Clients cannot create projects.")
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
    current_user: dict = Depends(get_current_user),
):
    """Returns credentials, active OAuth access token, and client website folder ID for Google Picker."""
    db = get_database()
    project = await website_project_service.get_project_by_id(db, project_id, current_user)
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
    token = await asyncio.to_thread(gdrive.get_access_token)
    from app.config import settings
    client_id = (settings.GOOGLE_DRIVE_WEB_CLIENT_ID or settings.GOOGLE_DRIVE_CLIENT_ID or "").strip()
    return {
        "developer_key": (settings.GOOGLE_DRIVE_API_KEY or "").strip(),
        "client_id": client_id,
        "app_id": client_id.split("-")[0] if "-" in client_id else "",
        "access_token": token,
        "folder_id": folder_id,
        "root_folder_id": await gdrive._ensure_root(db),
    }


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


@router.get("/{project_id}/picker-config")
@limiter.limit("60/minute")
async def get_website_drive_picker_config(
    request: Request,
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Returns credentials, active OAuth access token, and website project folder ID for Google Picker."""
    db = get_database()
    project = await db.website_projects.find_one({"id": project_id})
    if not project or not can_view_project(current_user, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
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
    picker_cfg = await gdrive.get_picker_config(
        db,
        client_name=project.get("client_name"),
        workspace_id=project.get("workspace_id"),
        category="Website",
    )
    picker_cfg["folder_id"] = folder_id
    return picker_cfg


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
