import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from typing import List, Optional
from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse, GuidelinesUpdate
from app.schemas.error import ErrorResponse
from app.core.security import get_current_user, require_admin, require_member_or_admin
from app.database import get_database
from app.services.obsidian_service import update_brand_guidelines

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces",
    tags=["Workspaces / Ad Accounts"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)


def normalize_workspace(doc: dict) -> dict:
    name = str(doc.get("name", "Untitled Ad Account"))
    platform = doc.get("platform")
    if not platform or platform in ("Meta / Google", "Meta Ads / Google Ads"):
        # Only ED&C (Elegant Design) is Meta & Google; all other accounts are strictly Meta Ads
        if any(keyword in name.lower() for keyword in ["ed&c", "ednc", "elegant design"]):
            platform = "Meta & Google"
        else:
            platform = "Meta Ads"

    return {
        "id": str(doc.get("id", f"ws-{uuid.uuid4().hex[:8]}")),
        "name": name,
        "platform": platform,
        "initials": str(doc.get("initials") or name[:2].upper()),
        "brandColor": str(doc.get("brandColor") or doc.get("brand_color") or "bg-indigo-500"),
        "industry": str(doc.get("industry", "General B2B")),
        "brandGuidelines": str(doc.get("brandGuidelines") or doc.get("brand_guidelines") or ""),
        "isDefault": bool(doc.get("isDefault", False)),
    }


@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(current_user: dict = Depends(require_member_or_admin)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    cursor = db.workspaces.find({}, {"_id": 0})
    workspaces = await cursor.to_list(length=None)

    # Deduplicate workspaces by id
    seen = set()
    unique_workspaces = []
    for ws in workspaces:
        ws_id = ws.get("id")
        if ws_id and ws_id not in seen:
            seen.add(ws_id)
            unique_workspaces.append(normalize_workspace(ws))

    unique_workspaces.sort(key=lambda w: w.get("name", "").lower())
    return unique_workspaces


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    ws_in: WorkspaceCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    new_id = f"ws-{uuid.uuid4().hex[:8]}"
    initials = ws_in.initials or ws_in.name[:2].upper()
    platform = ws_in.platform or ("Meta & Google" if any(k in ws_in.name.lower() for k in ["ed&c", "ednc", "elegant design"]) else "Meta Ads")

    workspace_doc = {
        "id": new_id,
        "name": ws_in.name,
        "platform": platform,
        "initials": initials,
        "brandColor": ws_in.brandColor,
        "brand_color": ws_in.brandColor,
        "industry": ws_in.industry,
        "brandGuidelines": ws_in.brandGuidelines or "",
        "brand_guidelines": ws_in.brandGuidelines or "",
        "isDefault": False,
        "user_id": current_user["id"],
    }

    await db.workspaces.insert_one(workspace_doc)

    if ws_in.brandGuidelines:
        background_tasks.add_task(
            update_brand_guidelines,
            current_user["id"],
            new_id,
            ws_in.name,
            ws_in.brandGuidelines
        )

    return normalize_workspace(workspace_doc)


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    ws_update: WorkspaceUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    update_fields = {}
    if ws_update.name is not None:
        update_fields["name"] = ws_update.name
    if ws_update.platform is not None:
        update_fields["platform"] = ws_update.platform
    if ws_update.initials is not None:
        update_fields["initials"] = ws_update.initials
    if ws_update.brandColor is not None:
        update_fields["brandColor"] = ws_update.brandColor
        update_fields["brand_color"] = ws_update.brandColor
    if ws_update.industry is not None:
        update_fields["industry"] = ws_update.industry
    if ws_update.brandGuidelines is not None:
        update_fields["brandGuidelines"] = ws_update.brandGuidelines
        update_fields["brand_guidelines"] = ws_update.brandGuidelines

    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided for update.")

    res = await db.workspaces.find_one_and_update(
        {"id": workspace_id},
        {"$set": update_fields},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ad Account '{workspace_id}' not found.")

    if ws_update.brandGuidelines:
        background_tasks.add_task(
            update_brand_guidelines,
            current_user["id"],
            workspace_id,
            res.get("name", "Untitled Ad Account"),
            ws_update.brandGuidelines
        )

    return normalize_workspace(res)


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: str,
    current_user: dict = Depends(require_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    res = await db.workspaces.delete_one({"id": workspace_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ad Account '{workspace_id}' not found.")

    return {"message": f"Ad Account '{workspace_id}' deleted successfully."}
