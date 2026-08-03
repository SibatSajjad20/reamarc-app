from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse
from app.core.security import get_current_user
from app.database import get_database
import uuid

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])

DEFAULT_INITIAL_WORKSPACES = [
    {
        "id": "ws-1",
        "name": "Nova Luxury Living",
        "initials": "NL",
        "brandColor": "bg-amber-500",
        "industry": "Real Estate & Luxury",
        "isDefault": True,
    },
    {
        "id": "ws-2",
        "name": "TechFlow Enterprise",
        "initials": "TF",
        "brandColor": "bg-indigo-600",
        "industry": "SaaS & Developer Tools",
        "isDefault": False,
    },
]

def normalize_workspace(doc: dict) -> dict:
    return {
        "id": str(doc.get("id", f"ws-{uuid.uuid4().hex[:8]}")),
        "name": str(doc.get("name", "Untitled Workspace")),
        "initials": str(doc.get("initials") or doc.get("name", "WS")[:2].upper()),
        "brandColor": str(doc.get("brandColor") or doc.get("brand_color") or "bg-indigo-500"),
        "industry": str(doc.get("industry", "General B2B")),
        "isDefault": bool(doc.get("isDefault", False)),
    }

@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(current_user: dict = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    user_id = current_user["id"]
    cursor = db.workspaces.find({"user_id": user_id}, {"_id": 0})
    user_workspaces = await cursor.to_list(length=100)

    # If new user has no workspaces yet, seed default workspaces for them
    if not user_workspaces:
        for seed_ws in DEFAULT_INITIAL_WORKSPACES:
            ws_doc = seed_ws.copy()
            ws_doc["user_id"] = user_id
            await db.workspaces.insert_one(ws_doc.copy())
        
        cursor = db.workspaces.find({"user_id": user_id}, {"_id": 0})
        user_workspaces = await cursor.to_list(length=100)

    return [normalize_workspace(ws) for ws in user_workspaces]

@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    ws_in: WorkspaceCreate,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    ws_id = f"ws-{uuid.uuid4().hex[:8]}"
    initials = ws_in.initials if ws_in.initials else ws_in.name[:2].upper()

    ws_doc = {
        "id": ws_id,
        "name": ws_in.name,
        "initials": initials,
        "brandColor": ws_in.brandColor or "bg-indigo-500",
        "industry": ws_in.industry or "General B2B",
        "isDefault": False,
        "user_id": current_user["id"],
    }

    await db.workspaces.insert_one(ws_doc.copy())
    return normalize_workspace(ws_doc)

@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    ws_in: WorkspaceUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    update_fields = {}
    if ws_in.name is not None:
        update_fields["name"] = ws_in.name
    if ws_in.initials is not None:
        update_fields["initials"] = ws_in.initials
    if ws_in.brandColor is not None:
        update_fields["brandColor"] = ws_in.brandColor
    if ws_in.industry is not None:
        update_fields["industry"] = ws_in.industry

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    result = await db.workspaces.update_one(
        {"id": workspace_id, "user_id": current_user["id"]},
        {"$set": update_fields}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    updated_doc = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    return normalize_workspace(updated_doc)

@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    # Prevent deleting if it's the only remaining workspace for this user
    count = await db.workspaces.count_documents({"user_id": current_user["id"]})
    if count <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your only remaining workspace. Create another workspace first."
        )

    res = await db.workspaces.delete_one({"id": workspace_id, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    # Also clean up campaigns, posts, knowledge sources associated with this workspace
    await db.campaigns.delete_many({"workspaceId": workspace_id, "user_id": current_user["id"]})
    await db.posts.delete_many({"workspaceId": workspace_id, "user_id": current_user["id"]})
    await db.knowledge_sources.delete_many({"workspaceId": workspace_id, "user_id": current_user["id"]})

    return {"message": "Workspace deleted successfully."}
