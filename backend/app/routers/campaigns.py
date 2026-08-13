import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from app.schemas.campaign import (
    CampaignCreate, CampaignResponse, DayPlanSchema, DayPlanUpdate, CampaignPreviewRequest,
    CampaignMatrixGenerateRequest, CampaignMatrixUpdateRequest
)
from app.schemas.error import ErrorResponse
from app.core.security import get_current_user, require_editor_or_admin
from app.database import get_database
from app.services.llm import (
    generate_campaign_plan_with_gemini, generate_single_day_plan_with_gemini,
    generate_campaign_matrix_with_gemini
)
from app.services.campaign_generator import generate_campaign_matrix
from app.services import rag_service
from app.services.obsidian_service import sync_campaign_to_obsidian, read_client_notes, extract_client_feedback_for_asset

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/campaigns",
    tags=["Campaigns"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)

@router.post("/preview-plan", response_model=List[DayPlanSchema])
async def preview_campaign_plan(
    req: CampaignPreviewRequest,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    query_str = f"{req.title} {req.target_audience} {req.tone}"
    brand_context = await get_brand_context_string(db, current_user["id"], req.workspace_id, query_str)

    target_duration = req.duration_days or 7

    ai_plan = await generate_campaign_plan_with_gemini(
        title=req.title,
        target_audience=req.target_audience,
        tone=req.tone,
        platforms=req.platforms,
        duration_days=target_duration,
        brand_context=brand_context
    )
    return ai_plan

import time

_BRAND_CONTEXT_CACHE: dict[tuple[str, str, str], tuple[float, str]] = {}
CACHE_TTL_SECONDS = 180

async def get_brand_context_string(db, user_id: str, workspace_id: str, query_text: str = "") -> str:
    """Perform RAG vector search retrieval for semantically relevant document chunks."""
    cache_key = (user_id, workspace_id, query_text.strip().lower()[:100])
    now = time.time()

    if cache_key in _BRAND_CONTEXT_CACHE:
        timestamp, cached_text = _BRAND_CONTEXT_CACHE[cache_key]
        if now - timestamp < CACHE_TTL_SECONDS:
            return cached_text

    try:
        # Perform RAG semantic similarity search
        chunks = await rag_service.retrieve_relevant_chunks(
            db=db,
            user_id=user_id,
            workspace_id=workspace_id,
            query_text=query_text or "brand guidelines voice tone target audience",
            top_k=6
        )

        if chunks:
            sources_found = list(set(c.get("source_name", "Document") for c in chunks))
            logger.info(f"🎯 RAG Retrieval Success: Found {len(chunks)} chunks from sources {sources_found} for query '{query_text}'")
            formatted_chunks = []
            for c in chunks:
                source_name = c.get("source_name", "Document")
                text = c.get("text", "").strip()
                if text:
                    formatted_chunks.append(f"[Source: {source_name}]\n{text}")
            
            context_text = "\n\n---\n\n".join(formatted_chunks)
            _BRAND_CONTEXT_CACHE[cache_key] = (now, context_text)
            return context_text

        # Fallback if no RAG chunks exist yet
        ks_cursor = db.knowledge_sources.find(
            {"workspaceId": workspace_id, "user_id": user_id},
            {"extracted_text": 1, "name": 1, "_id": 0}
        )
        ks_docs = await ks_cursor.to_list(length=5)
        context_parts = [
            f"[Source: {doc.get('name', 'Document')}]\n{doc['extracted_text']}"
            for doc in ks_docs
            if doc.get("extracted_text", "").strip()
        ]
        if context_parts:
            context_text = "\n\n---\n\n".join(context_parts[:3])[:10000]
            _BRAND_CONTEXT_CACHE[cache_key] = (now, context_text)
            return context_text
    except Exception as e:
        logger.warning(f"Could not fetch RAG brand context: {e}")
    return ""

def invalidate_brand_context_cache(user_id: str, workspace_id: str):
    """Invalidate cached brand context when knowledge sources are updated or deleted."""
    keys_to_del = [k for k in _BRAND_CONTEXT_CACHE.keys() if k[0] == user_id and k[1] == workspace_id]
    for k in keys_to_del:
        _BRAND_CONTEXT_CACHE.pop(k, None)

def normalize_campaign(doc: dict) -> dict:
    """Normalize campaign document from MongoDB to camelCase frontend schema."""
    raw_date = doc.get("createdAt") or doc.get("created_at") or datetime.now(timezone.utc).isoformat()
    plan = doc.get("plan") or []
    plan_len = len(plan) if isinstance(plan, list) and len(plan) > 0 else None
    matrix_rows = doc.get("matrixRows") or []
    matrix_len = len(matrix_rows) if isinstance(matrix_rows, list) and len(matrix_rows) > 0 else None

    total_days = doc.get("totalDays") or doc.get("total_days") or doc.get("durationDays") or plan_len or matrix_len or 7

    return {
        "id": str(doc.get("id", f"camp-{uuid.uuid4().hex[:8]}")),
        "title": str(doc.get("title", "Untitled Campaign")),
        "status": str(doc.get("status", "Active")),
        "currentDay": int(doc.get("currentDay") or doc.get("current_day") or 1),
        "totalDays": int(total_days),
        "workspaceId": str(doc.get("workspaceId") or doc.get("workspace_id") or ""),
        "platforms": doc.get("platforms") or ["LinkedIn"],
        "targetAudience": str(doc.get("targetAudience") or doc.get("target_audience") or "General Audience"),
        "tone": str(doc.get("tone", "Punchy")),
        "createdAt": str(raw_date),
        "plan": plan,
        "matrixRows": matrix_rows,
    }

def campaign_access_query(campaign_id: str, current_user: dict) -> dict:
    if current_user.get("role") == "admin":
        return {"id": campaign_id}
    allowed_ws = current_user.get("workspace_ids", [])
    return {
        "id": campaign_id,
        "$or": [
            {"workspaceId": {"$in": allowed_ws}},
            {"workspace_id": {"$in": allowed_ws}},
            {"user_id": current_user["id"]}
        ]
    }

@router.get("", response_model=List[CampaignResponse])
async def list_campaigns(
    workspace_id: Optional[str] = Query(None, alias="workspaceId"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    query = {}
    if workspace_id and workspace_id != "all":
        query["$or"] = [{"workspaceId": workspace_id}, {"workspace_id": workspace_id}]
    else:
        if current_user.get("role") != "admin":
            allowed_ws = current_user.get("workspace_ids", [])
            query["$or"] = [
                {"workspaceId": {"$in": allowed_ws}},
                {"workspace_id": {"$in": allowed_ws}},
                {"user_id": current_user["id"]}
            ]

    cursor = db.campaigns.find(query, {"_id": 0}).skip(skip).limit(limit)
    campaigns = await cursor.to_list(length=limit)
    return [normalize_campaign(c) for c in campaigns]

@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    campaign_in: CampaignCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    campaign_id = f"camp-{uuid.uuid4().hex[:8]}"
    target_duration = campaign_in.duration_days or (len(campaign_in.plan) if campaign_in.plan else 7)

    if campaign_in.plan and len(campaign_in.plan) > 0:
        ai_plan = [p.dict() if hasattr(p, "dict") else p for p in campaign_in.plan]
    else:
        query_str = f"{campaign_in.title} {campaign_in.target_audience} {campaign_in.tone}"
        brand_context = await get_brand_context_string(db, current_user["id"], campaign_in.workspace_id, query_str)
        ai_plan = await generate_campaign_plan_with_gemini(
            title=campaign_in.title,
            target_audience=campaign_in.target_audience,
            tone=campaign_in.tone,
            platforms=campaign_in.platforms,
            duration_days=target_duration,
            brand_context=brand_context
        )

    # Generate or assign matrixRows
    if campaign_in.matrixRows and len(campaign_in.matrixRows) > 0:
        matrix_rows = campaign_in.matrixRows
    else:
        query_str = f"{campaign_in.title} {campaign_in.target_audience} {campaign_in.offer or ''} {campaign_in.customPrompt or ''}"
        brand_context = await get_brand_context_string(db, current_user["id"], campaign_in.workspace_id, query_str)
        matrix_rows = await generate_campaign_matrix_with_gemini(
            title=campaign_in.title,
            campaign_type=campaign_in.campaignType or "Acquire – Cold Audience Awareness",
            target_audience=campaign_in.target_audience,
            tone=campaign_in.tone,
            offer=campaign_in.offer or "Free Sample Pack",
            cta=campaign_in.cta or "Request Free Sample Pack",
            pain_points=campaign_in.painPoints or "",
            duration_days=target_duration,
            platforms=campaign_in.platforms,
            custom_prompt=campaign_in.customPrompt or "",
            brand_context=brand_context
        )

    iso_created = datetime.now(timezone.utc).isoformat()
    init_status = campaign_in.status if campaign_in.status in ["Active", "Pending Plan Approval", "Completed"] else "Active"

    new_campaign = {
        "id": campaign_id,
        "title": campaign_in.title,
        "status": init_status,
        "currentDay": 1,
        "totalDays": target_duration,
        "workspaceId": campaign_in.workspace_id,
        "platforms": campaign_in.platforms,
        "targetAudience": campaign_in.target_audience,
        "tone": campaign_in.tone,
        "createdAt": iso_created,
        "plan": ai_plan,
        "matrixRows": matrix_rows,
        "user_id": current_user["id"],
    }

    await db.campaigns.insert_one(new_campaign.copy())

    # Sync generated matrix rows to Obsidian asynchronously
    if matrix_rows:
        ws_name = "Main Workspace"
        if campaign_in.workspace_id:
            ws = await db.workspaces.find_one({"id": campaign_in.workspace_id})
            if ws and "name" in ws:
                ws_name = ws["name"]
        for row in matrix_rows:
            row_asset = row.copy() if isinstance(row, dict) else row.dict()
            row_asset["campaign"] = campaign_in.title
            background_tasks.add_task(sync_campaign_to_obsidian, asset=row_asset, workspace_name=ws_name)
        logger.info(f"✨ Queued Obsidian sync for {len(matrix_rows)} matrix rows in campaign '{campaign_in.title}'")

    # If activated on creation/deployment, immediately push Day 1 post to inbox
    if init_status == "Active" and ai_plan:
        day1 = ai_plan[0]
        iso_now = datetime.now(timezone.utc).isoformat()
        new_post = {
            "id": f"post-{uuid.uuid4().hex[:8]}",
            "campaign_id": campaign_id,
            "campaign": campaign_in.title,
            "platform": day1.get("platform", "LinkedIn"),
            "date": iso_now,
            "target_date": iso_now,
            "dayNumber": 1,
            "workspaceId": campaign_in.workspace_id,
            "status": "pending",
            "targetAudience": campaign_in.target_audience,
            "copy": f"{day1.get('preview')}\n\nGenerated by Reamarc AI for {campaign_in.target_audience}.",
            "lastModified": iso_now,
            "user_id": current_user["id"],
        }
        await db.posts.insert_one(new_post)

    return normalize_campaign(new_campaign)

@router.post("/{campaign_id}/activate", response_model=CampaignResponse)
async def activate_campaign(
    campaign_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    query = campaign_access_query(campaign_id, current_user)
    camp = await db.campaigns.find_one(query)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found or permission denied.")

    await db.campaigns.update_one(
        query,
        {"$set": {"status": "Active"}}
    )

    # Push Day 1 post to inbox
    ai_plan = camp.get("plan", [])
    if ai_plan:
        day1 = ai_plan[0]
        iso_now = datetime.now(timezone.utc).isoformat()
        new_post = {
            "id": f"post-{uuid.uuid4().hex[:8]}",
            "campaign_id": campaign_id,
            "campaign": camp["title"],
            "platform": day1.get("platform", "LinkedIn"),
            "date": iso_now,
            "target_date": iso_now,
            "dayNumber": 1,
            "workspaceId": camp.get("workspaceId", ""),
            "status": "pending",
            "targetAudience": camp.get("targetAudience", "General Audience"),
            "copy": f"{day1.get('preview')}\n\nGenerated by Reamarc AI for {camp.get('targetAudience', 'your audience')}.",
            "lastModified": iso_now,
            "user_id": current_user["id"],
        }
        await db.posts.insert_one(new_post)

    updated_camp = await db.campaigns.find_one(query, {"_id": 0})
    return normalize_campaign(updated_camp)


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    query = campaign_access_query(campaign_id, current_user)
    camp = await db.campaigns.find_one(query)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found or permission denied.")

    camp_title = camp.get("title")

    await db.campaigns.delete_one(query)

    delete_query = {"$or": [{"campaign_id": campaign_id}]}
    if camp_title:
        delete_query["$or"].append({"campaign": camp_title})

    await db.posts.delete_many(delete_query)

    return {"message": f"Campaign '{camp_title}' and associated posts deleted successfully."}

@router.patch("/{campaign_id}/plan/{day_number}", response_model=CampaignResponse)
async def update_day_plan_item(
    campaign_id: str,
    day_number: int,
    item_in: DayPlanUpdate,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    query = campaign_access_query(campaign_id, current_user)
    camp = await db.campaigns.find_one(query)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found or permission denied.")

    plan = camp.get("plan", [])
    updated = False
    for day_item in plan:
        if day_item.get("day") == day_number:
            if item_in.topic is not None:
                day_item["topic"] = item_in.topic
            if item_in.platform is not None:
                day_item["platform"] = item_in.platform
            if item_in.preview is not None:
                day_item["preview"] = item_in.preview
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail=f"Day {day_number} plan item not found.")

    await db.campaigns.update_one(
        query,
        {"$set": {"plan": plan}}
    )

    updated_camp = await db.campaigns.find_one(query, {"_id": 0})
    return normalize_campaign(updated_camp)

@router.post("/{campaign_id}/plan/{day_number}/regenerate", response_model=CampaignResponse)
async def regenerate_day_plan_item(
    campaign_id: str,
    day_number: int,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    query = campaign_access_query(campaign_id, current_user)
    camp = await db.campaigns.find_one(query)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found or permission denied.")

    plan = camp.get("plan", [])
    target_index = -1
    for i, day_item in enumerate(plan):
        if day_item.get("day") == day_number:
            target_index = i
            break

    if target_index == -1:
        raise HTTPException(status_code=404, detail=f"Day {day_number} plan item not found.")

    target_item = plan[target_index]
    title = camp.get("title", "Campaign")
    audience = camp.get("targetAudience", "General Audience")
    tone = camp.get("tone", "Punchy")
    platform = target_item.get("platform", "LinkedIn")
    workspace_id = camp.get("workspaceId", "ws-1")

    workspace_name = "Main Workspace"
    if workspace_id:
        ws = await db.workspaces.find_one({"id": workspace_id})
        if ws and "name" in ws:
            workspace_name = ws["name"]

    vault_notes = read_client_notes(workspace_name)
    client_feedback_text = extract_client_feedback_for_asset(vault_notes, asset_id=f"Day {day_number}", serial=f"Day {day_number}")

    log_msg = f"⛔ Injected client feedback for Campaign '{title}' Day {day_number}: '{client_feedback_text}'"
    logger.info(log_msg)
    print(f"\n[AI REGEN] {log_msg}\n", flush=True)

    query_str = f"{title} Day {day_number} {platform} {audience}"
    brand_context = await get_brand_context_string(db, current_user["id"], workspace_id, query_str)

    new_day_plan = await generate_single_day_plan_with_gemini(
        day=day_number,
        title=title,
        target_audience=audience,
        tone=tone,
        platform=platform,
        brand_context=brand_context,
        client_feedback_text=client_feedback_text
    )


    plan[target_index] = new_day_plan

    await db.campaigns.update_one(
        query,
        {"$set": {"plan": plan}}
    )

    updated_camp = await db.campaigns.find_one(query, {"_id": 0})
    return normalize_campaign(updated_camp)


@router.post("/generate-matrix", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def generate_production_matrix(
    req: CampaignMatrixGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    campaign_id = f"camp-{uuid.uuid4().hex[:8]}"

    # Fetch RAG brand context
    query_str = f"{req.title} {req.targetAudience} {req.offer} {req.customPrompt or ''}"
    brand_context = await get_brand_context_string(db, current_user["id"], req.workspaceId, query_str)

    # Generate N structured matrix rows using Gemini AI
    matrix_rows = await generate_campaign_matrix_with_gemini(
        title=req.title,
        campaign_type=req.campaignType or "Acquire – Cold Audience Awareness",
        target_audience=req.targetAudience,
        tone=req.tone,
        offer=req.offer or "Free Sample Pack",
        cta=req.cta or "Request Free Sample Pack",
        pain_points=req.painPoints or "",
        duration_days=req.durationDays,
        platforms=req.platforms,
        custom_prompt=req.customPrompt or "",
        brand_context=brand_context
    )

    # Generate N-day strategy plan
    ai_plan = await generate_campaign_plan_with_gemini(
        title=req.title,
        target_audience=req.targetAudience,
        tone=req.tone,
        platforms=req.platforms,
        duration_days=req.durationDays,
        brand_context=brand_context
    )

    iso_created = datetime.now(timezone.utc).isoformat()
    new_campaign = {
        "id": campaign_id,
        "title": req.title,
        "status": "Active",
        "currentDay": 1,
        "totalDays": req.durationDays,
        "workspaceId": req.workspaceId,
        "platforms": req.platforms,
        "targetAudience": req.targetAudience,
        "tone": req.tone,
        "createdAt": iso_created,
        "plan": ai_plan,
        "matrixRows": matrix_rows,
        "user_id": current_user["id"],
    }

    await db.campaigns.insert_one(new_campaign.copy())

    # Sync generated matrix rows to Obsidian asynchronously
    if matrix_rows:
        ws_name = "Main Workspace"
        if req.workspaceId:
            ws = await db.workspaces.find_one({"id": req.workspaceId})
            if ws and "name" in ws:
                ws_name = ws["name"]
        for row in matrix_rows:
            row_asset = row.copy() if isinstance(row, dict) else row.dict()
            row_asset["campaign"] = req.title
            background_tasks.add_task(sync_campaign_to_obsidian, asset=row_asset, workspace_name=ws_name)
        logger.info(f"✨ Queued Obsidian sync for {len(matrix_rows)} matrix rows in generated campaign '{req.title}'")

    logger.info(f"🚀 Created Production Matrix Campaign '{req.title}' ({campaign_id}) with {len(matrix_rows)} assets.")

    return normalize_campaign(new_campaign)


@router.get("/{campaign_id}/matrix")
async def get_campaign_matrix(
    campaign_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    query = campaign_access_query(campaign_id, current_user)
    camp = await db.campaigns.find_one(query, {"_id": 0})
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    return {
        "campaignId": campaign_id,
        "matrixRows": camp.get("matrixRows", [])
    }


@router.patch("/{campaign_id}/matrix")
async def update_campaign_matrix(
    campaign_id: str,
    update_req: CampaignMatrixUpdateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_editor_or_admin)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    query = campaign_access_query(campaign_id, current_user)
    camp = await db.campaigns.find_one(query)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found or permission denied.")

    await db.campaigns.update_one(
        query,
        {"$set": {"matrixRows": update_req.matrixRows, "lastModified": datetime.now(timezone.utc).isoformat()}}
    )

    # Sync updated/approved matrix rows to Obsidian asynchronously
    if update_req.matrixRows:
        ws_name = "Main Workspace"
        camp_title = camp.get("title", "Matrix Campaign")
        ws_id = camp.get("workspaceId")
        if ws_id:
            ws = await db.workspaces.find_one({"id": ws_id})
            if ws and "name" in ws:
                ws_name = ws["name"]

        for row in update_req.matrixRows:
            row_asset = row.copy() if isinstance(row, dict) else row.dict()
            row_asset["campaign"] = camp_title
            background_tasks.add_task(sync_campaign_to_obsidian, asset=row_asset, workspace_name=ws_name)
        logger.info(f"✨ Queued Obsidian sync for {len(update_req.matrixRows)} updated matrix rows in campaign '{camp_title}'")

    return {"message": "Production matrix updated successfully.", "rowCount": len(update_req.matrixRows)}

