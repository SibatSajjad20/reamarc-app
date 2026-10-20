from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query, Request, UploadFile, File
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse, GuidelinesUpdate
from app.core.security import (
    require_operations_or_admin,
    get_current_user,
    _MANAGEMENT_ROLES,
)
from app.core.uploads import open_upload_response, authorize_stored_upload, normalize_upload_key
from app.core.limiter import limiter
from app.database import get_database
from app.models.user import UserRole

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


def listing_workspace(doc: dict, *, include_pii: bool, current_user: Optional[dict] = None) -> dict:
    """Team members need workspace names for daily logs; hide billing/POC PII.

    Proposal files are visible to every internal staff role. Clients only receive
    proposal fields for workspaces in their workspace_ids.
    """
    normalized = normalize_workspace(doc)
    role = (current_user or {}).get("role")
    if role in (UserRole.CLIENT.value, "client"):
        allowed = {str(x) for x in ((current_user or {}).get("workspace_ids") or [])}
        if str(normalized.get("id") or "") not in allowed:
            for key in ("proposal_url", "proposal_name", "proposal_size"):
                normalized[key] = None
    if include_pii:
        return normalized
    for key in (
        "poc_name",
        "poc_email",
        "poc_phone",
        "billing_name",
        "billing_email",
        "billing_phone",
    ):
        normalized[key] = None
    normalized["brandGuidelines"] = ""
    return normalized


@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(current_user: dict = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    user_role = current_user.get("role")
    query = {}
    # Non-management users only see active workspaces
    if user_role not in ("admin", "operations"):
        query["status"] = {"$ne": "inactive"}
    if user_role in (UserRole.CLIENT.value, "client"):
        query["id"] = {"$in": [str(x) for x in (current_user.get("workspace_ids") or [])]}

    cursor = db.workspaces.find(query, {"_id": 0})
    workspaces = await cursor.to_list(length=None)

    seen = set()
    unique_workspaces = []
    for ws in workspaces:
        ws_id = ws.get("id")
        if ws_id and ws_id not in seen:
            seen.add(ws_id)
            unique_workspaces.append(
                listing_workspace(
                    ws,
                    include_pii=user_role in ("admin", "operations", "hr"),
                    current_user=current_user,
                )
            )

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

    dumped = ws_update.model_dump(exclude_unset=True)
    if not dumped:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided for update.")

    update_fields = {}
    for k, v in dumped.items():
        if k == "brandColor":
            update_fields["brandColor"] = v
            update_fields["brand_color"] = v
        elif k == "brandGuidelines":
            update_fields["brandGuidelines"] = v
            update_fields["brand_guidelines"] = v
        else:
            update_fields[k] = v

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


def _proposal_url_candidates(file_path: str) -> list:
    raw = (file_path or "").strip()
    normalized = normalize_upload_key(file_path)
    return [raw, normalized, f"/uploads/{normalized}"]


def _forbid_proposal() -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized to access this file.",
    )


@router.get("/download-proposal")
async def download_proposal(
    file_path: str = Query(..., description="File path under /uploads"),
    current_user: dict = Depends(get_current_user),
):
    """Download a workspace proposal file for staff (active clients) and assigned clients."""
    db = get_database()
    candidates = _proposal_url_candidates(file_path)
    lookup = {"proposal_url": {"$in": candidates}}
    company_id = str((current_user or {}).get("company_id") or "").strip()
    if company_id:
        lookup["company_id"] = company_id

    ws = None
    if db is not None:
        ws = await db.workspaces.find_one(lookup)

    if ws:
        role = current_user.get("role")
        ws_id = str(ws.get("id") or "")
        if role in _MANAGEMENT_ROLES:
            return await open_upload_response(db, file_path)
        if role in (UserRole.CLIENT.value, "client"):
            allowed = {str(x) for x in (current_user.get("workspace_ids") or [])}
            if ws_id not in allowed:
                _forbid_proposal()
            return await open_upload_response(db, file_path)
        if str(ws.get("status") or "").lower() == "inactive":
            _forbid_proposal()
        return await open_upload_response(db, file_path)

    await authorize_stored_upload(db, current_user, file_path)
    return await open_upload_response(db, file_path)


@router.post("/upload-proposal")
@limiter.limit("15/minute")
async def upload_proposal(
    request: Request,
    file: UploadFile = File(...),
    store_as: Optional[str] = Query(
        None,
        description="Optional existing /uploads/... path to overwrite (restores proposals without changing DB URLs).",
    ),
    current_user: dict = Depends(require_operations_or_admin),
):
    """Upload or restore a client workspace proposal document (Operations or Admin)."""
    from app.routers.daily_log import upload_deliverable
    return await upload_deliverable(
        request=request,
        file=file,
        store_as=store_as,
        current_user=current_user,
    )

