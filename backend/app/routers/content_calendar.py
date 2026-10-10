"""
API Router for Content Calendar module.
Provides endpoints for viewing, managing, creating, updating, and transitioning content items.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status, File, Form, UploadFile
from app.core.limiter import limiter
from app.services.content_calendar_access import (
    require_content_calendar_reader,
    require_content_calendar_user,
)
from app.database import get_database
from app.schemas.content_calendar import (
    ContentCalendarItemCreate,
    ContentCalendarItemUpdate,
    ContentCalendarItemResponse,
    ContentCalendarListResponse,
    ContentCalendarConstantsResponse,
    ContentCalendarConstantsUpdate,
    StageMoveRequest,
    BatchUpdateRequest,
    BulkImportRequest,
    BulkImportResponse,
    AssetReorderRequest,
    LinkAssetCreate,
    DriveAssetAttachRequest,
    DrivePickerConfigResponse,
)
from app.services import content_calendar_service
from app.services.content_calendar_workflow import (
    WorkflowError,
    can_create,
    is_admin,
    is_content_lead,
    is_creative_lead,
    is_performance,
)

router = APIRouter(prefix="/content-calendar", tags=["Content Calendar"])


@router.get("", response_model=ContentCalendarListResponse)
@limiter.limit("120/minute")
async def list_content_items(
    request: Request,
    workspace_id: Optional[str] = Query(None, description="Filter by workspace ID"),
    client_name: Optional[str] = Query(None, description="Filter by client name"),
    stage: Optional[str] = Query(None, description="Filter by pipeline stage"),
    creative_type: Optional[str] = Query(None, description="Filter by creative type"),
    approval_status: Optional[str] = Query(None, description="Filter by approval status"),
    search: Optional[str] = Query(None, description="Search term for serial, concept, copy, hashtags"),
    start_date: Optional[str] = Query(None, description="Start date for calendar range YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date for calendar range YYYY-MM-DD"),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    current_user: dict = Depends(require_content_calendar_reader),
):
    """Lists content calendar items with filtering, search, pagination, and stage breakdown."""
    db = get_database()
    res = await content_calendar_service.get_items(
        db,
        workspace_id=workspace_id,
        client_name=client_name,
        stage=stage,
        creative_type=creative_type,
        approval_status=approval_status,
        search=search,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit,
        viewer=current_user,
    )
    return res


@router.get("/constants", response_model=ContentCalendarConstantsResponse)
@limiter.limit("120/minute")
async def get_content_constants(
    request: Request,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Returns all allowed dropdown options and pipeline stages matching the Excel workbook or custom settings."""
    db = get_database()
    return await content_calendar_service.get_constants_from_db(db)


@router.patch("/constants", response_model=ContentCalendarConstantsResponse)
@limiter.limit("60/minute")
async def update_content_constants(
    request: Request,
    payload: ContentCalendarConstantsUpdate,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Updates custom dropdown options such as creative_types."""
    if is_performance(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Performance Marketing cannot edit field constants.",
        )
    if not (is_admin(current_user) or is_content_lead(current_user) or is_creative_lead(current_user)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and team leads can edit field constants.",
        )
    db = get_database()
    return await content_calendar_service.update_constants(
        db, payload.model_dump(exclude_unset=True)
    )


@router.get("/next-serial")
@limiter.limit("120/minute")
async def get_next_serial(
    request: Request,
    client_name: Optional[str] = Query(None, description="Client name to derive prefix from"),
    current_user: dict = Depends(require_content_calendar_user),
):
    """Returns the next sequential serial ID for a client, formatted as C + Client Abbr + Number."""
    db = get_database()
    serial = await content_calendar_service.get_next_serial(db, client_name)
    return {"serial": serial}


@router.get("/creative-assignees")
@limiter.limit("120/minute")
async def list_creative_assignees(
    request: Request,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Creative people a creative team lead can assign."""
    if not (is_admin(current_user) or is_creative_lead(current_user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a creative team lead can assign creative work.")
    db = get_database()
    return {"assignees": await content_calendar_service.list_creative_assignees(db)}


@router.get("/content-assignees")
@limiter.limit("120/minute")
async def list_content_assignees(
    request: Request,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Content people a content team lead can assign."""
    if not (is_admin(current_user) or is_content_lead(current_user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a content team lead can assign content work.")
    db = get_database()
    return {"assignees": await content_calendar_service.list_content_assignees(db)}



@router.post("", response_model=ContentCalendarItemResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def create_content_item(
    request: Request,
    payload: ContentCalendarItemCreate,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Creates a new content item record."""
    if not can_create(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the content team can create a campaign.")
    db = get_database()
    user_id = current_user.get("id") or str(current_user.get("_id", ""))
    user_name = current_user.get("full_name") or current_user.get("name")
    return await content_calendar_service.create_item(db, payload, user_id=user_id, user_name=user_name)


@router.post("/seed-excel", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def seed_from_excel(
    request: Request,
    force: bool = Query(False, description="Force overwrite / reload from Excel"),
    current_user: dict = Depends(require_content_calendar_user),
):
    """Seed or re-sync content calendar items directly from 'Apex Campaign Content Plan.xlsx'."""
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an admin can seed the content calendar from the original workbook.")
    db = get_database()
    seeded = await content_calendar_service.seed_from_excel_if_needed(db, force=force)
    return {"message": f"Seeding completed. {seeded} items processed.", "count": seeded}


@router.patch("/batch", status_code=status.HTTP_200_OK)
@limiter.limit("180/minute")
async def batch_update_content_items(
    request: Request,
    payload: BatchUpdateRequest,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Batch updates multiple items and fields in a single optimized DB transaction."""
    if is_performance(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Performance Marketing can view the calendar but cannot change it.")
    db = get_database()
    try:
        return await content_calendar_service.batch_update_items(db, payload.updates, viewer=current_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/bulk-import", response_model=BulkImportResponse, status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def bulk_import_content_items(
    request: Request,
    payload: BulkImportRequest,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Bulk imports campaign records from Excel, supporting upsert and client mapping."""
    if not can_create(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the content team can import campaigns.")
    db = get_database()
    user_id = current_user.get("id") or str(current_user.get("_id", ""))
    user_name = current_user.get("full_name") or current_user.get("name") or current_user.get("email") or "Content Creator"
    return await content_calendar_service.bulk_import_items(
        db,
        items=payload.items,
        upsert_by_serial=payload.upsert_by_serial,
        default_client_name=payload.default_client_name,
        user_id=user_id,
        user_name=user_name,
        viewer=current_user,
    )


@router.get("/{item_id}", response_model=ContentCalendarItemResponse)
@limiter.limit("120/minute")
async def get_content_item(
    request: Request,
    item_id: str,
    current_user: dict = Depends(require_content_calendar_reader),
):
    """Gets details of a single content item."""
    db = get_database()
    item = await content_calendar_service.get_item_by_id(db, item_id, viewer=current_user)
    if not item:
        raise HTTPException(status_code=404, detail="Content calendar item not found")
    return item


@router.patch("/{item_id}", response_model=ContentCalendarItemResponse)
@limiter.limit("180/minute")
async def update_content_item(
    request: Request,
    item_id: str,
    payload: ContentCalendarItemUpdate,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Updates an existing content item."""
    db = get_database()
    try:
        updated = await content_calendar_service.update_item(db, item_id, payload, viewer=current_user)
    except WorkflowError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Content calendar item not found")
    return updated


@router.patch("/{item_id}/stage", response_model=ContentCalendarItemResponse)
@limiter.limit("60/minute")
async def move_content_item_stage(
    request: Request,
    item_id: str,
    payload: StageMoveRequest,
    current_user: dict = Depends(require_content_calendar_reader),
):
    """Moves a content item through one legal workflow action."""
    db = get_database()
    try:
        updated = await content_calendar_service.transition_item(
            db,
            item_id,
            current_user,
            payload.action,
            note=payload.note,
            assignee_id=payload.assignee_id,
            assignee_name=payload.assignee_name,
            target_stage=payload.target_stage,
        )
    except WorkflowError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not updated:
        raise HTTPException(status_code=404, detail="Content calendar item not found")
    return updated


@router.delete("/{item_id}", status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def delete_content_item(
    request: Request,
    item_id: str,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Deletes a content item by ID."""
    db = get_database()
    try:
        success = await content_calendar_service.delete_item(db, item_id, viewer=current_user)
    except WorkflowError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not success:
        raise HTTPException(status_code=404, detail="Content calendar item not found")
    return {"message": "Content item deleted successfully", "id": item_id}


@router.post("/{item_id}/assets", response_model=ContentCalendarItemResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def upload_content_assets(
    request: Request,
    item_id: str,
    files: List[UploadFile] = File(...),
    role: str = Form("primary"),
    current_user: dict = Depends(require_content_calendar_user),
):
    """Uploads media (images, videos, documents) and attaches them to a content calendar item."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided for upload.")
    db = get_database()
    return await content_calendar_service.attach_assets(
        db,
        item_id=item_id,
        files=files,
        role=role,
        viewer=current_user,
    )


@router.post("/{item_id}/links", response_model=ContentCalendarItemResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_content_link(
    request: Request,
    item_id: str,
    payload: LinkAssetCreate,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Adds an external deliverable link (Figma, Canva, Google Drive, Loom, etc.) as an asset."""
    db = get_database()
    return await content_calendar_service.attach_link(
        db,
        item_id=item_id,
        url=payload.url,
        title=payload.title,
        role=payload.role,
        viewer=current_user,
    )


@router.get("/{item_id}/picker-config", response_model=DrivePickerConfigResponse)
@limiter.limit("60/minute")
async def get_drive_picker_config(
    request: Request,
    item_id: str,
    response: Response,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Returns credentials, active OAuth access token, and campaign folder ID for Google Picker."""
    db = get_database()
    item = await content_calendar_service.get_item_by_id(db, item_id, viewer=current_user)
    if not item:
        raw_doc = await db[content_calendar_service.COLLECTION_NAME].find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
        if not raw_doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content item not found.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this content item.")

    if not content_calendar_service.can_manage_assets(current_user, item):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to manage assets for this content item.",
        )

    from app.services import google_drive_service as gdrive
    if not gdrive.configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Drive integration is not configured on this server.",
        )
    response.headers["Cache-Control"] = "no-store"
    return await gdrive.get_picker_config(db, item_id=item_id, category="Content")


@router.post("/{item_id}/assets/from-drive", response_model=ContentCalendarItemResponse)
@limiter.limit("60/minute")
async def attach_drive_assets_endpoint(
    request: Request,
    item_id: str,
    payload: DriveAssetAttachRequest,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Attaches files picked or uploaded via Google Drive Picker to a content item."""
    db = get_database()
    return await content_calendar_service.attach_drive_assets(
        db,
        item_id=item_id,
        files=payload.files,
        default_role=payload.role or "primary",
        viewer=current_user,
    )


@router.delete("/{item_id}/assets/{asset_id}", response_model=ContentCalendarItemResponse)
@limiter.limit("60/minute")
async def delete_content_asset(
    request: Request,
    item_id: str,
    asset_id: str,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Removes an attached asset from a content item and deletes the stored file."""
    db = get_database()
    return await content_calendar_service.delete_asset(
        db,
        item_id=item_id,
        asset_id=asset_id,
        viewer=current_user,
    )


@router.patch("/{item_id}/assets/reorder", response_model=ContentCalendarItemResponse)
@limiter.limit("60/minute")
async def reorder_content_assets(
    request: Request,
    item_id: str,
    payload: AssetReorderRequest,
    current_user: dict = Depends(require_content_calendar_user),
):
    """Reorders the attached assets of a content item (useful for carousel slides)."""
    db = get_database()
    return await content_calendar_service.reorder_assets(
        db,
        item_id=item_id,
        asset_ids=payload.asset_ids,
        viewer=current_user,
    )


class PublicReviewActionPayload(BaseModel):
    action: str  # "approve" | "request_revision"
    reviewer_name: Optional[str] = Field(None, max_length=120)
    note: Optional[str] = Field(None, max_length=2000)


@router.get("/public/review/{token}")
@limiter.limit("60/minute")
async def get_public_campaign_review(
    request: Request,
    token: str,
):
    """Unauthenticated public review endpoint for clients using a magic link."""
    db = get_database()
    return await content_calendar_service.get_public_review_item(db, token=token)


@router.post("/public/review/{token}/action")
@limiter.limit("30/minute")
async def submit_public_campaign_review(
    request: Request,
    token: str,
    payload: PublicReviewActionPayload,
):
    """Submit approval or revision request from an unauthenticated client review link."""
    db = get_database()
    return await content_calendar_service.action_public_review_item(
        db,
        token=token,
        action=payload.action,
        reviewer_name=payload.reviewer_name,
        note=payload.note,
    )


@router.get("/public/review/{token}/assets/{asset_id}")
@limiter.limit("120/minute")
async def get_public_campaign_asset(
    request: Request,
    token: str,
    asset_id: str,
    thumb: bool = Query(False, description="Stream thumbnail if available"),
):
    """Streams media assets for unauthenticated clients viewing through a verified magic link."""
    db = get_database()
    return await content_calendar_service.stream_public_asset(
        db,
        token=token,
        asset_id=asset_id,
        thumb=thumb,
        request=request,
    )


