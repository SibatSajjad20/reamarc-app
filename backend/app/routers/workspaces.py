from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse, GuidelinesUpdate
from app.core.security import require_admin, require_member_or_admin, require_operations_or_admin
from app.database import get_database

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


async def update_brand_guidelines(user_id: str, workspace_id: str, workspace_name: str, guidelines: str):
    """Stub background task for brand guidelines indexing."""
    print(f"[Workspaces] Brand guidelines updated for {workspace_name} ({workspace_id}) by user {user_id}")


def normalize_workspace(doc: dict) -> dict:
    name = str(doc.get("name") or doc.get("client_name") or "Workspace")
    return {
        "id": str(doc.get("id", f"ws-{uuid.uuid4().hex[:8]}")),
        "name": name,
        "initials": str(doc.get("initials") or name[:2].upper()),
        "brandColor": str(doc.get("brandColor") or doc.get("brand_color") or "bg-indigo-600"),
        "status": str(doc.get("status", "active")),
        "proposal_url": doc.get("proposal_url"),
        "proposal_name": doc.get("proposal_name"),
        "proposal_size": doc.get("proposal_size"),
        "project_cycle": doc.get("project_cycle", "Retainer"),
        "priority": doc.get("priority", "Medium"),
        "contract_start_date": doc.get("contract_start_date"),
        "contract_end_date": doc.get("contract_end_date"),
        "services": doc.get("services") or [],
        "health": doc.get("health", "Good"),
        "poc_name": doc.get("poc_name"),
        "poc_email": doc.get("poc_email"),
        "poc_phone": doc.get("poc_phone"),
        "billing_name": doc.get("billing_name"),
        "billing_email": doc.get("billing_email"),
        "billing_phone": doc.get("billing_phone"),
        "brandGuidelines": str(doc.get("brandGuidelines") or doc.get("brand_guidelines") or ""),
        "isDefault": bool(doc.get("isDefault", False)),
    }


@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(current_user: dict = Depends(require_member_or_admin)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    user_role = current_user.get("role")
    query = {}
    # Non-management users only see active workspaces
    if user_role not in ("admin", "operations"):
        query["status"] = {"$ne": "inactive"}

    cursor = db.workspaces.find(query, {"_id": 0})
    workspaces = await cursor.to_list(length=None)

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
    current_user: dict = Depends(require_operations_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    new_id = f"ws-{uuid.uuid4().hex[:8]}"
    initials = ws_in.initials or ws_in.name[:2].upper()
    now_iso = datetime.now(timezone.utc).isoformat()

    workspace_doc = {
        "id": new_id,
        "name": ws_in.name,
        "initials": initials,
        "brandColor": ws_in.brandColor,
        "brand_color": ws_in.brandColor,
        "status": ws_in.status or "active",
        "proposal_url": ws_in.proposal_url,
        "proposal_name": ws_in.proposal_name,
        "proposal_size": ws_in.proposal_size,
        "project_cycle": ws_in.project_cycle or "Retainer",
        "priority": ws_in.priority or "Medium",
        "contract_start_date": ws_in.contract_start_date,
        "contract_end_date": ws_in.contract_end_date,
        "services": ws_in.services or [],
        "health": ws_in.health or "Good",
        "poc_name": ws_in.poc_name,
        "poc_email": ws_in.poc_email,
        "poc_phone": ws_in.poc_phone,
        "billing_name": ws_in.billing_name,
        "billing_email": ws_in.billing_email,
        "billing_phone": ws_in.billing_phone,
        "brandGuidelines": ws_in.brandGuidelines or "",
        "brand_guidelines": ws_in.brandGuidelines or "",
        "isDefault": False,
        "user_id": current_user["id"],
        "created_at": now_iso,
        "updated_at": now_iso,
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
@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    ws_update: WorkspaceUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_operations_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    update_fields = {}
    if ws_update.name is not None:
        update_fields["name"] = ws_update.name
    if ws_update.initials is not None:
        update_fields["initials"] = ws_update.initials
    if ws_update.brandColor is not None:
        update_fields["brandColor"] = ws_update.brandColor
        update_fields["brand_color"] = ws_update.brandColor
    if ws_update.status is not None:
        update_fields["status"] = ws_update.status
    if ws_update.proposal_url is not None:
        update_fields["proposal_url"] = ws_update.proposal_url
    if ws_update.proposal_name is not None:
        update_fields["proposal_name"] = ws_update.proposal_name
    if ws_update.proposal_size is not None:
        update_fields["proposal_size"] = ws_update.proposal_size
    if ws_update.project_cycle is not None:
        update_fields["project_cycle"] = ws_update.project_cycle
    if ws_update.priority is not None:
        update_fields["priority"] = ws_update.priority
    if ws_update.contract_start_date is not None:
        update_fields["contract_start_date"] = ws_update.contract_start_date
    if ws_update.contract_end_date is not None:
        update_fields["contract_end_date"] = ws_update.contract_end_date
    if ws_update.services is not None:
        update_fields["services"] = ws_update.services
    if ws_update.health is not None:
        update_fields["health"] = ws_update.health
    if ws_update.poc_name is not None:
        update_fields["poc_name"] = ws_update.poc_name
    if ws_update.poc_email is not None:
        update_fields["poc_email"] = ws_update.poc_email
    if ws_update.poc_phone is not None:
        update_fields["poc_phone"] = ws_update.poc_phone
    if ws_update.billing_name is not None:
        update_fields["billing_name"] = ws_update.billing_name
    if ws_update.billing_email is not None:
        update_fields["billing_email"] = ws_update.billing_email
    if ws_update.billing_phone is not None:
        update_fields["billing_phone"] = ws_update.billing_phone
    if ws_update.brandGuidelines is not None:
        update_fields["brandGuidelines"] = ws_update.brandGuidelines
        update_fields["brand_guidelines"] = ws_update.brandGuidelines

    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided for update.")

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    res = await db.workspaces.find_one_and_update(
        {"id": workspace_id},
        {"$set": update_fields},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace '{workspace_id}' not found.")

    if ws_update.brandGuidelines:
        background_tasks.add_task(
            update_brand_guidelines,
            current_user["id"],
            workspace_id,
            res.get("name", "Workspace"),
            ws_update.brandGuidelines
        )

    return normalize_workspace(res)


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: str,
    current_user: dict = Depends(require_operations_or_admin)
):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Workspace deletion is disabled. Workspaces can only be marked as Inactive.",
    )
