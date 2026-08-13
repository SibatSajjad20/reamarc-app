import logging
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from typing import Dict, List, Optional
from pydantic import BaseModel

from app.core.security import get_current_user
from app.database import get_database
from app.services.llm import generate_ai_text, _clean_json_response, regenerate_asset_copy
from app.services.obsidian_service import sync_campaign_to_obsidian, save_campaign_to_obsidian, read_client_notes, extract_client_feedback_for_asset
from app.routers.campaigns import get_brand_context_string

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/matrix",
    tags=["Matrix AI"],
    responses={
        400: {"description": "Bad Request"},
        401: {"description": "Unauthorized"},
        500: {"description": "Internal Server Error"},
    }
)



class FilterRule(BaseModel):
    column: str
    operator: str  # "equals" | "contains" | "not_equals" | "is_empty"
    value: str = ""


class SmartSort(BaseModel):
    column: str
    direction: str = "asc"  # "asc" | "desc"


class ParseQueryRequest(BaseModel):
    prompt: str
    available_columns: List[str] = [
        "serial", "campaignType", "creativeType", "contentPillar",
        "contentConcept", "offer", "productionDirection", "primaryText",
        "headlinesHooks", "contentOnCreative", "cta", "hashtagsKeywords",
        "designOwner", "designDue", "approvalStatus", "setupStatus", "notes"
    ]
    schema_options: Optional[Dict[str, List[str]]] = None


class ParseQueryResponse(BaseModel):
    filters: List[FilterRule] = []
    search_keyword: str = ""
    sort: Optional[SmartSort] = None


@router.post("/parse-query", response_model=ParseQueryResponse)
async def parse_natural_language_query(
    req: ParseQueryRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Convert a natural language query into structured filter rules for the Production Matrix.
    Uses dynamic schema-aware prompting to map user phrasing, plurals, typos, and synonyms
    to exact table options.
    """
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prompt cannot be empty."
        )

    columns_desc = ", ".join(req.available_columns)

    schema_context_str = ""
    if req.schema_options:
        opts_lines = []
        for col, opts in req.schema_options.items():
            if opts and len(opts) > 0:
                opts_formatted = ", ".join([f'"{o}"' for o in opts[:20]])
                opts_lines.append(f"   - {col} options: [{opts_formatted}]")
        if opts_lines:
            schema_context_str = "\nDISTINCT DROPDOWN SCHEMA VALUES:\n" + "\n".join(opts_lines) + "\n"

    system_prompt = f"""You are an expert database query parser for a marketing production matrix tool.
Your job is to translate the user's natural language request into structured filter criteria.
Map user terminology, typos, plurals, and synonyms to the closest matching exact value from the provided column options.

AVAILABLE COLUMNS: {columns_desc}
{schema_context_str}
OPERATORS:
- "equals": exact match (case-insensitive)
- "contains": case-insensitive substring match (PREFERRED for dropdowns and text fields)
- "not_equals": exclusion match
- "is_empty": checks if field is empty (value = "")

SYNONYM AND PLURAL MAPPING RULES:
- If the user says 'videos', 'video', 'reels', 'clips', 'mp4', or 'shorts', map column 'creativeType' to 'contains' with value 'Video'.
- If the user says 'images', 'statics', 'photos', 'banners', or 'carousels', map 'creativeType' to 'contains' with value 'Image' or 'Static'.
- If the user mentions 'lead magnets' or 'freebie', map column 'offer' to 'contains' with value 'Lead Magnet'.
- If the user mentions 'sample packs' or 'samples', map column 'offer' to 'contains' with value 'Sample Pack'.
- If the user mentions 'industry demands', 'demand', or 'pillar', map column 'contentPillar' to 'contains' with value 'Industry Demand'.
- If the user mentions 'urgent' or 'urgency', map column 'contentPillar' or 'contentConcept' to 'contains' with value 'Urgency'.
- Map 'approved' -> approvalStatus contains 'Approved'.
- Map 'pending', 'review', or 'in review' -> approvalStatus contains 'Pending'.
- Map 'not started' or 'unstarted' -> setupStatus contains 'Not Started'.

Return ONLY valid JSON matching this exact structure with no markdown code blocks:
{{
  "filters": [
    {{ "column": "creativeType", "operator": "contains", "value": "Video" }}
  ],
  "search_keyword": "",
  "sort": {{ "column": "serial", "direction": "asc" }}
}}

If no sort is requested, set sort to null.
If no specific column matches a keyword, put general text search terms in search_keyword.
Always prefer "contains" over "equals" unless the user explicitly requests an exact match.
"""

    user_message = f"User request: \"{req.prompt.strip()}\"\n\nReturn structured filter JSON now:"

    full_prompt = f"{system_prompt}\n\n{user_message}"

    raw_response = await generate_ai_text(full_prompt)

    if raw_response:
        try:
            clean = _clean_json_response(raw_response)
            parsed = json.loads(clean)

            filters = []
            for f in parsed.get("filters", []):
                if isinstance(f, dict) and "column" in f and "operator" in f:
                    filters.append(FilterRule(
                        column=f.get("column", ""),
                        operator=f.get("operator", "contains"),
                        value=str(f.get("value", ""))
                    ))

            sort_raw = parsed.get("sort")
            sort_obj = None
            if sort_raw and isinstance(sort_raw, dict) and "column" in sort_raw:
                sort_obj = SmartSort(
                    column=sort_raw.get("column", "serial"),
                    direction=sort_raw.get("direction", "asc")
                )

            search_kw = str(parsed.get("search_keyword", "")).strip()

            logger.info(
                f"✨ AI query parsed: {len(filters)} filters, keyword='{search_kw}', sort={sort_obj}"
            )

            return ParseQueryResponse(
                filters=filters,
                search_keyword=search_kw,
                sort=sort_obj
            )

        except Exception as err:
            logger.warning(f"Failed to parse AI query response JSON: {err} | raw={raw_response[:200]}")

    # Deterministic fallback logic handling plurals & synonyms
    prompt_lower = req.prompt.lower()
    fallback_filters: List[FilterRule] = []

    if any(k in prompt_lower for k in ["video", "videos", "reel", "reels", "clip", "clips", "mp4"]):
        fallback_filters.append(FilterRule(column="creativeType", operator="contains", value="Video"))
    elif any(k in prompt_lower for k in ["image", "images", "static", "statics", "graphic", "carousels"]):
        fallback_filters.append(FilterRule(column="creativeType", operator="contains", value="Image"))

    if any(k in prompt_lower for k in ["industry demand", "industry demands", "demand", "demands"]):
        fallback_filters.append(FilterRule(column="contentPillar", operator="contains", value="Industry Demand"))
    elif any(k in prompt_lower for k in ["sample pack", "sample packs", "samples"]):
        fallback_filters.append(FilterRule(column="offer", operator="contains", value="Sample Pack"))
    elif any(k in prompt_lower for k in ["lead magnet", "lead magnets", "freebie"]):
        fallback_filters.append(FilterRule(column="offer", operator="contains", value="Lead Magnet"))

    if "approved" in prompt_lower:
        fallback_filters.append(FilterRule(column="approvalStatus", operator="contains", value="Approved"))
    elif any(k in prompt_lower for k in ["pending", "review"]):
        fallback_filters.append(FilterRule(column="approvalStatus", operator="contains", value="Pending"))

    if "urgent" in prompt_lower or "urgency" in prompt_lower:
        fallback_filters.append(FilterRule(column="contentPillar", operator="contains", value="Urgency"))

    fallback_sort = None
    if "sort" in prompt_lower or "order" in prompt_lower:
        fallback_sort = SmartSort(column="serial", direction="asc")

    logger.info(f"Returning fallback filter result for prompt: '{req.prompt[:60]}'")
    return ParseQueryResponse(
        filters=fallback_filters,
        search_keyword="",
        sort=fallback_sort
    )
from app.database import get_database


class SyncObsidianRequest(BaseModel):
    campaign_name: str
    workspace_name: str = "Main Workspace"
    content_concept: str = ""
    creative_copy: str = ""
    status: str = "Approved"


class MatrixAssetPayload(BaseModel):
    campaign_id: Optional[str] = None
    campaign: Optional[str] = "Matrix Campaign"
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = "Main Workspace"
    serial: Optional[str] = None
    creativeType: Optional[str] = "Image"
    contentPillar: Optional[str] = ""
    contentConcept: Optional[str] = ""
    offer: Optional[str] = ""
    productionDirection: Optional[str] = ""
    primaryText: Optional[str] = ""
    headlinesHooks: Optional[str] = ""
    contentOnCreative: Optional[str] = ""
    cta: Optional[str] = ""
    approvalStatus: Optional[str] = "Draft"
    notes: Optional[str] = ""


@router.post("/assets", status_code=status.HTTP_201_CREATED)
async def create_matrix_asset(
    payload: MatrixAssetPayload,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    On POST /matrix/assets (Creation): Call sync_campaign_to_obsidian via background task.
    """
    db = get_database()
    asset_id = f"ac-{uuid.uuid4().hex[:6]}"
    serial_str = payload.serial or f"AC-{uuid.uuid4().hex[:3].upper()}"

    asset_dict = {
        "id": asset_id,
        "serial": serial_str,
        "campaign": payload.campaign,
        "campaign_id": payload.campaign_id,
        "workspaceId": payload.workspace_id or "",
        "creativeType": payload.creativeType or "Image",
        "contentPillar": payload.contentPillar or "",
        "contentConcept": payload.contentConcept or "",
        "offer": payload.offer or "",
        "productionDirection": payload.productionDirection or "",
        "primaryText": payload.primaryText or "",
        "headlinesHooks": payload.headlinesHooks or "",
        "contentOnCreative": payload.contentOnCreative or "",
        "cta": payload.cta or "",
        "approvalStatus": payload.approvalStatus or "Draft",
        "notes": payload.notes or ""
    }

    ws_name = payload.workspace_name or "Main Workspace"

    if db is not None and payload.campaign_id:
        camp = await db.campaigns.find_one({"id": payload.campaign_id})
        if camp:
            if "name" in camp:
                ws_name = camp.get("name")
            matrix_rows = camp.get("matrixRows") or []
            matrix_rows.append(asset_dict)
            await db.campaigns.update_one({"id": payload.campaign_id}, {"$set": {"matrixRows": matrix_rows}})

    # Background task for Obsidian Sync
    background_tasks.add_task(sync_campaign_to_obsidian, asset=asset_dict, workspace_name=ws_name)
    logger.info(f"✨ Created matrix asset {asset_id} & queued Obsidian background sync")

    return {"message": "Matrix asset created.", "asset": asset_dict}


@router.patch("/assets/{asset_id}")
async def update_matrix_asset(
    asset_id: str,
    payload: MatrixAssetPayload,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    On PATCH /matrix/assets/{id} (Updates/Regeneration): Call sync_campaign_to_obsidian via background task.
    """
    db = get_database()
    ws_name = payload.workspace_name or "Main Workspace"
    updated_asset = payload.dict(exclude_unset=True)
    updated_asset["id"] = asset_id

    if db is not None:
        camp = await db.campaigns.find_one({"$or": [{"matrixRows.id": asset_id}, {"matrixRows.serial": asset_id}]})
        if camp:
            campaign_title = camp.get("title", "Matrix Campaign")
            updated_asset["campaign"] = campaign_title
            ws_id = camp.get("workspaceId")
            if ws_id:
                ws = await db.workspaces.find_one({"id": ws_id})
                if ws and "name" in ws:
                    ws_name = ws["name"]

            rows = camp.get("matrixRows", [])
            for row in rows:
                if row.get("id") == asset_id or row.get("serial") == asset_id:
                    for k, v in payload.dict(exclude_unset=True).items():
                        if v is not None:
                            row[k] = v
                    updated_asset = row.copy()
                    updated_asset["campaign"] = campaign_title
                    break
            await db.campaigns.update_one({"id": camp["id"]}, {"$set": {"matrixRows": rows}})

    # Background task for Obsidian Sync
    background_tasks.add_task(sync_campaign_to_obsidian, asset=updated_asset, workspace_name=ws_name)
    logger.info(f"✨ Updated matrix asset {asset_id} & queued Obsidian background sync")

    return {"message": "Matrix asset updated.", "asset": updated_asset}


@router.post("/sync-obsidian")
async def sync_to_obsidian(
    payload: SyncObsidianRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    asset_dict = {
        "campaign": payload.campaign_name,
        "contentConcept": payload.content_concept,
        "primaryText": payload.creative_copy,
        "approvalStatus": payload.status
    }
    background_tasks.add_task(sync_campaign_to_obsidian, asset=asset_dict, workspace_name=payload.workspace_name)
    return {"message": "Queued sync to Obsidian", "campaign": payload.campaign_name}


@router.post("/assets/{asset_id}/approve")
async def approve_and_sync_asset(
    asset_id: str,
    background_tasks: BackgroundTasks,
    payload: Optional[SyncObsidianRequest] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()

    if payload:
        asset_dict = {
            "campaign": payload.campaign_name,
            "contentConcept": payload.content_concept,
            "primaryText": payload.creative_copy,
            "approvalStatus": payload.status
        }
        background_tasks.add_task(sync_campaign_to_obsidian, asset=asset_dict, workspace_name=payload.workspace_name)
        return {"message": "Asset approved and obsidian sync queued", "asset_id": asset_id}

    campaign_name = "Campaign Asset"
    workspace_name = "Main Workspace"
    asset_dict = {"id": asset_id, "approvalStatus": "Approved"}

    if db is not None:
        post = await db.posts.find_one({"id": asset_id})
        if post:
            await db.posts.update_one({"id": asset_id}, {"$set": {"status": "approved"}})
            campaign_name = post.get("campaign", "Campaign Post")
            workspace_id = post.get("workspaceId", "")
            if workspace_id:
                ws = await db.workspaces.find_one({"id": workspace_id})
                if ws and "name" in ws:
                    workspace_name = ws["name"]
            asset_dict = {
                "id": asset_id,
                "campaign": campaign_name,
                "contentConcept": post.get("targetAudience", ""),
                "primaryText": post.get("copy", ""),
                "approvalStatus": "Approved"
            }
        else:
            camp = await db.campaigns.find_one({"$or": [{"matrixRows.id": asset_id}, {"matrixRows.serial": asset_id}]})
            if camp:
                campaign_name = camp.get("title", "Matrix Campaign")
                workspace_id = camp.get("workspaceId", "")
                if workspace_id:
                    ws = await db.workspaces.find_one({"id": workspace_id})
                    if ws and "name" in ws:
                        workspace_name = ws["name"]

                matrix_rows = camp.get("matrixRows", [])
                for row in matrix_rows:
                    if row.get("id") == asset_id or row.get("serial") == asset_id:
                        row["approvalStatus"] = "Approved"
                        asset_dict = row.copy()
                        asset_dict["campaign"] = campaign_name
                        break

                await db.campaigns.update_one({"id": camp["id"]}, {"$set": {"matrixRows": matrix_rows}})

    background_tasks.add_task(sync_campaign_to_obsidian, asset=asset_dict, workspace_name=workspace_name)
    logger.info(f"✨ Approved matrix asset {asset_id} & queued Obsidian sync with status=Approved")
    return {"message": "Asset approved and queued for Obsidian sync", "asset_id": asset_id}


@router.post("/assets/{asset_id}/regenerate")
async def regenerate_single_matrix_asset(
    asset_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Single-asset regeneration endpoint.
    1. Reads `Client Notes - {workspace_name}.md` from Obsidian vault.
    2. Extracts feedback associated with asset ID / serial (e.g. AC-001) or general workspace feedback.
    3. Injects negative constraints into LLM prompt and logs in FastAPI terminal.
    4. Regenerates asset copy and syncs updated row to Obsidian.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable.")

    camp = await db.campaigns.find_one({"$or": [{"matrixRows.id": asset_id}, {"matrixRows.serial": asset_id}]})
    post = None
    target_row = None
    workspace_name = "Main Workspace"
    workspace_id = "ws-1"

    if camp:
        workspace_id = camp.get("workspaceId") or "ws-1"
        if workspace_id:
            ws = await db.workspaces.find_one({"id": workspace_id})
            if ws and "name" in ws:
                workspace_name = ws["name"]

        matrix_rows = camp.get("matrixRows", [])
        for row in matrix_rows:
            if row.get("id") == asset_id or row.get("serial") == asset_id:
                target_row = row
                break

    if not target_row:
        post = await db.posts.find_one({"id": asset_id})
        if post:
            workspace_id = post.get("workspaceId") or "ws-1"
            if workspace_id:
                ws = await db.workspaces.find_one({"id": workspace_id})
                if ws and "name" in ws:
                    workspace_name = ws["name"]
            target_row = {
                "id": post.get("id"),
                "serial": post.get("id"),
                "creativeType": post.get("platform", "Feed Post"),
                "primaryText": post.get("copy", ""),
                "contentConcept": post.get("targetAudience", "")
            }

    if not target_row:
        raise HTTPException(status_code=404, detail=f"Matrix asset '{asset_id}' not found.")

    vault_notes = read_client_notes(workspace_name)
    serial = target_row.get("serial", "")
    
    client_feedback_text = extract_client_feedback_for_asset(vault_notes, asset_id=asset_id, serial=serial)

    db_feedback = target_row.get("client_feedback")
    if isinstance(db_feedback, dict) and db_feedback.get("notes"):
        if client_feedback_text:
            client_feedback_text += f"\nRow Feedback: {db_feedback.get('notes')}"
        else:
            client_feedback_text = f"Row Feedback: {db_feedback.get('notes')}"

    log_msg = f"⛔ Injected client feedback for asset {asset_id} ({serial}): '{client_feedback_text}'"
    logger.info(log_msg)
    print(f"\n[AI REGEN] {log_msg}\n", flush=True)

    query_str = f"{target_row.get('contentConcept', '')} {target_row.get('offer', '')}"
    brand_context = await get_brand_context_string(db, current_user.get("id", ""), workspace_id, query_str)

    updated_row = await regenerate_asset_copy(
        asset=target_row,
        client_feedback_text=client_feedback_text,
        brand_context=brand_context
    )
    updated_row["approvalStatus"] = "In Review"

    if camp:
        matrix_rows = camp.get("matrixRows", [])
        for i, r in enumerate(matrix_rows):
            if r.get("id") == asset_id or r.get("serial") == asset_id:
                matrix_rows[i] = updated_row
                break
        await db.campaigns.update_one({"id": camp["id"]}, {"$set": {"matrixRows": matrix_rows}})
    elif post:
        await db.posts.update_one({"id": asset_id}, {"$set": {"copy": updated_row.get("primaryText", "")}})

    background_tasks.add_task(sync_campaign_to_obsidian, asset=updated_row, workspace_name=workspace_name)

    return {
        "message": "Asset copy regenerated successfully with client constraints.",
        "asset": updated_row,
        "client_feedback_injected": client_feedback_text
    }



