import logging
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.core.security import get_current_user
from app.database import get_database
from app.services.obsidian_service import (
    save_campaign_to_obsidian,
    sync_campaign_to_obsidian,
    append_client_note
)

logger = logging.getLogger(__name__)



router = APIRouter(
    prefix="/portal",
    tags=["Client Portal"],
)


def require_client_or_above(current_user: dict = Depends(get_current_user)) -> dict:
    """Allow client, editor, admin — block viewer from portal endpoints."""
    if current_user.get("role") not in ("admin", "editor", "client"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return current_user


def _client_workspace_ids(current_user: dict) -> list[str]:
    """Return workspace IDs the client is allowed to see. Admins see all (via query)."""
    return current_user.get("workspace_ids", [])


def _ws_match_query(workspace_ids: list[str], role: str) -> dict:
    if role == "admin":
        return {}
    if not workspace_ids:
        return {"workspaceId": "__none__"}
    return {"workspaceId": {"$in": workspace_ids}}


class RevisionPayload(BaseModel):
    category: str  # 'Copy Text' | 'Creative Direction' | 'Other'
    notes: str


# ─── GET /portal/dashboard ────────────────────────────────────────────────────

@router.get("/dashboard")
async def portal_dashboard(current_user: dict = Depends(require_client_or_above)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    role = current_user.get("role")
    ws_ids = _client_workspace_ids(current_user)
    ws_query = _ws_match_query(ws_ids, role)

    # Fetch all matrix rows across campaigns in scope
    campaigns_cursor = db.campaigns.find({**ws_query}, {"_id": 0, "matrixRows": 1, "title": 1, "id": 1, "workspaceId": 1})
    campaigns = await campaigns_cursor.to_list(length=200)

    pending_review = []
    approved = []
    all_assets = []

    for camp in campaigns:
        for row in (camp.get("matrixRows") or []):
            row["_campaignId"] = camp["id"]
            row["_campaignTitle"] = camp.get("title", "")
            row["_workspaceId"] = camp.get("workspaceId", "")
            ast = row.get("approvalStatus", "Draft")
            if ast == "In Client Review":
                pending_review.append(row)
            elif ast == "Approved":
                approved.append(row)
            all_assets.append(row)

    return {
        "pending_review_count": len(pending_review),
        "approved_count": len(approved),
        "pending_review": pending_review,
        "all_assets": all_assets,
    }


# ─── POST /portal/assets/{campaign_id}/{row_id}/approve ───────────────────────

@router.post("/assets/{campaign_id}/{row_id}/approve")
async def approve_asset(
    campaign_id: str,
    row_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_client_or_above),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    role = current_user.get("role")
    ws_ids = _client_workspace_ids(current_user)

    query = {"id": campaign_id}
    if role != "admin":
        query["workspaceId"] = {"$in": ws_ids}

    camp = await db.campaigns.find_one(query)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found or access denied.")

    rows = camp.get("matrixRows") or []
    updated = False
    target_row = None
    for row in rows:
        if row.get("id") == row_id:
            row["approvalStatus"] = "Approved"
            row["client_feedback"] = None
            updated = True
            target_row = row
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Asset row not found.")

    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"matrixRows": rows}})
    logger.info(f"Client approved asset {row_id} in campaign {campaign_id}")

    # Fetch workspace name for Obsidian sync
    workspace_name = "Main Workspace"
    ws_id = camp.get("workspaceId")
    if ws_id:
        ws = await db.workspaces.find_one({"id": ws_id})
        if ws and "name" in ws:
            workspace_name = ws["name"]

    if target_row:
        asset_sync_data = target_row.copy()
        asset_sync_data["campaign"] = camp.get("title", "Campaign Asset")
        background_tasks.add_task(sync_campaign_to_obsidian, asset=asset_sync_data, workspace_name=workspace_name)
        logger.info(f"✨ Queued Obsidian sync for approved asset {row_id}")

    return {"message": "Asset approved & synced to Obsidian.", "row_id": row_id}


# ─── POST /portal/assets/{campaign_id}/{row_id}/revision ──────────────────────

@router.post("/assets/{campaign_id}/{row_id}/revision")
async def request_revision(
    campaign_id: str,
    row_id: str,
    payload: RevisionPayload,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_client_or_above),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    role = current_user.get("role")
    ws_ids = _client_workspace_ids(current_user)

    query = {"id": campaign_id}
    if role != "admin":
        query["workspaceId"] = {"$in": ws_ids}

    camp = await db.campaigns.find_one(query)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found or access denied.")

    rows = camp.get("matrixRows") or []
    updated = False
    target_row = None
    for row in rows:
        if row.get("id") == row_id:
            row["approvalStatus"] = "Revision Requested"
            row["client_feedback"] = {
                "category": payload.category,
                "notes": payload.notes,
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "submitted_by": current_user.get("email", "client"),
            }
            updated = True
            target_row = row
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Asset row not found.")

    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"matrixRows": rows}})
    logger.info(f"Client requested revision on asset {row_id} in campaign {campaign_id}")

    # Fetch workspace name
    workspace_name = "Main Workspace"
    ws_id = camp.get("workspaceId")
    if ws_id:
        ws = await db.workspaces.find_one({"id": ws_id})
        if ws and "name" in ws:
            workspace_name = ws["name"]

    campaign_title = camp.get("title", "Campaign Asset")

    if target_row:
        asset_sync_data = target_row.copy()
        asset_sync_data["campaign"] = campaign_title
        # 1. Update status to 'Revision Requested' in campaign note
        background_tasks.add_task(sync_campaign_to_obsidian, asset=asset_sync_data, workspace_name=workspace_name)

        # 2. Append client feedback note to Client Notes - {workspace_name}.md
        feedback_text = f"**Category**: {payload.category}\n**Feedback**: {payload.notes}\n**Submitted By**: {current_user.get('email', 'client')}"
        serial_label = target_row.get("serial", row_id)
        note_title = f"{campaign_title} ({serial_label})"
        background_tasks.add_task(append_client_note, workspace_name=workspace_name, campaign_name=note_title, revision_notes=feedback_text)
        logger.info(f"📝 Queued Obsidian background tasks for revision on asset {row_id}")

    return {"message": "Revision request submitted and logged to Obsidian.", "row_id": row_id}



# ─── GET /portal/notifications ────────────────────────────────────────────────
# Used by internal team bell — returns all 'Revision Requested' assets

@router.get("/notifications")
async def get_revision_notifications(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Internal team only.")

    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    role = current_user.get("role")
    ws_ids = current_user.get("workspace_ids", [])
    ws_query = _ws_match_query(ws_ids, role)

    campaigns_cursor = db.campaigns.find({**ws_query}, {"_id": 0, "matrixRows": 1, "title": 1, "id": 1})
    campaigns = await campaigns_cursor.to_list(length=200)

    notifications = []
    for camp in campaigns:
        for row in (camp.get("matrixRows") or []):
            if row.get("approvalStatus") == "Revision Requested":
                notifications.append({
                    "campaignId": camp["id"],
                    "campaignTitle": camp.get("title", ""),
                    "rowId": row.get("id"),
                    "serial": row.get("serial", ""),
                    "contentConcept": row.get("contentConcept", ""),
                    "client_feedback": row.get("client_feedback"),
                })

    return {"count": len(notifications), "items": notifications}


# ─── POST /portal/assets/{campaign_id}/{row_id}/reset-to-review ───────────────
# Editor resets a 'Revision Requested' row back to 'In Client Review'

@router.post("/assets/{campaign_id}/{row_id}/reset-to-review")
async def reset_to_review(
    campaign_id: str,
    row_id: str,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Internal team only.")

    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    camp = await db.campaigns.find_one({"id": campaign_id})
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    rows = camp.get("matrixRows") or []
    for row in rows:
        if row.get("id") == row_id:
            row["approvalStatus"] = "In Client Review"
            row["client_feedback"] = None
            break

    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"matrixRows": rows}})
    return {"message": "Asset reset to In Client Review."}
