import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from typing import List, Optional
from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse, GuidelinesUpdate
from app.schemas.error import ErrorResponse
from app.core.security import get_current_user, require_editor_or_admin
from app.database import get_database
from app.services.obsidian_service import update_brand_guidelines

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces",
    tags=["Workspaces"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)


def normalize_workspace(doc: dict) -> dict:
    return {
        "id": str(doc.get("id", f"ws-{uuid.uuid4().hex[:8]}")),
        "name": str(doc.get("name", "Untitled Workspace")),
        "initials": str(doc.get("initials") or doc.get("name", "WS")[:2].upper()),
        "brandColor": str(doc.get("brandColor") or doc.get("brand_color") or "bg-indigo-500"),
        "industry": str(doc.get("industry", "General B2B")),
        "brandGuidelines": str(doc.get("brandGuidelines") or doc.get("brand_guidelines") or ""),
        "isDefault": bool(doc.get("isDefault", False)),
    }

@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(current_user: dict = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    user_role = current_user.get("role", "viewer")
    allowed_ws_ids = current_user.get("workspace_ids", [])

    if user_role == "admin":
        cursor = db.workspaces.find({}, {"_id": 0})
    else:
        cursor = db.workspaces.find(
            {"id": {"$in": allowed_ws_ids}},
            {"_id": 0}
        )

    workspaces = await cursor.to_list(length=None)

    # Deduplicate workspaces by id
    seen = set()
    unique_workspaces = []
    for ws in workspaces:
        ws_id = ws.get("id")
        if ws_id and ws_id not in seen:
            seen.add(ws_id)
            unique_workspaces.append(normalize_workspace(ws))

    return unique_workspaces

@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    ws_in: WorkspaceCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    ws_id = f"ws-{uuid.uuid4().hex[:8]}"
    initials = ws_in.initials if ws_in.initials else ws_in.name[:2].upper()

    ws_doc = {
        "id": ws_id,
        "name": ws_in.name,
        "initials": initials,
        "brandColor": ws_in.brandColor or "bg-indigo-500",
        "industry": ws_in.industry or "General B2B",
        "brandGuidelines": ws_in.brandGuidelines or "",
        "isDefault": False,
        "user_id": current_user["id"],
    }

    await db.workspaces.insert_one(ws_doc.copy())

    # Auto-assign newly created workspace to creator's workspace_ids list
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$addToSet": {"workspace_ids": ws_id}}
    )

    if ws_in.brandGuidelines:
        background_tasks.add_task(update_brand_guidelines, workspace_name=ws_in.name, guidelines_text=ws_in.brandGuidelines)

    return normalize_workspace(ws_doc)

@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    ws_in: WorkspaceUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    ws = await db.workspaces.find_one({"id": workspace_id})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    user_role = current_user.get("role", "viewer")
    allowed_ws_ids = current_user.get("workspace_ids", [])
    if user_role != "admin" and workspace_id not in allowed_ws_ids and ws.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to edit this workspace.")

    update_fields = {}
    if ws_in.name is not None:
        update_fields["name"] = ws_in.name
    if ws_in.initials is not None:
        update_fields["initials"] = ws_in.initials
    if ws_in.brandColor is not None:
        update_fields["brandColor"] = ws_in.brandColor
    if ws_in.industry is not None:
        update_fields["industry"] = ws_in.industry
    if ws_in.brandGuidelines is not None:
        update_fields["brandGuidelines"] = ws_in.brandGuidelines

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$set": update_fields}
    )

    updated_doc = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    ws_name = updated_doc.get("name", "Main Workspace")

    if ws_in.brandGuidelines is not None:
        background_tasks.add_task(update_brand_guidelines, workspace_name=ws_name, guidelines_text=ws_in.brandGuidelines)

    return normalize_workspace(updated_doc)


@router.patch("/{workspace_id}/guidelines")
async def update_workspace_guidelines(
    workspace_id: str,
    payload: GuidelinesUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    ws = await db.workspaces.find_one({"id": workspace_id})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$set": {"brandGuidelines": payload.guidelines_text}}
    )

    workspace_name = ws.get("name", "Main Workspace")
    background_tasks.add_task(update_brand_guidelines, workspace_name=workspace_name, guidelines_text=payload.guidelines_text)
    logger.info(f"🎨 Queued Obsidian brand guidelines update for workspace '{workspace_name}'")

    return {"message": "Brand guidelines updated and Obsidian sync queued.", "workspace_id": workspace_id}


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    ws = await db.workspaces.find_one({"id": workspace_id})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    user_role = current_user.get("role", "viewer")
    allowed_ws_ids = current_user.get("workspace_ids", [])
    if user_role != "admin" and workspace_id not in allowed_ws_ids and ws.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this workspace.")

    # Prevent deleting if it's the only remaining workspace in system
    total_count = await db.workspaces.count_documents({})
    if total_count <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your only remaining workspace. Create another workspace first."
        )

    res = await db.workspaces.delete_one({"id": workspace_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    # Also clean up campaigns, posts, knowledge sources associated with this workspace
    await db.campaigns.delete_many({"workspaceId": workspace_id})
    await db.posts.delete_many({"workspaceId": workspace_id})
    await db.knowledge_sources.delete_many({"workspaceId": workspace_id})

    return {"message": "Workspace deleted successfully."}

