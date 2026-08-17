"""
Performance Marketing API Router.
Provides CRUD for marketing campaigns and daily metric upserts.
All endpoints respect workspace context via X-Workspace-ID header.
"""

import logging
import uuid
from datetime import datetime, timezone, date
from typing import Optional, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query, Request, Response
from pydantic import BaseModel

from app.core.security import get_current_user, require_editor_or_admin
from app.core.encryption import encrypt_string, decrypt_string
from app.database import get_database
from app.schemas.marketing import (
    MarketingCampaignCreate,
    MarketingCampaignUpdate,
    MarketingCampaignResponse,
    MetricUpsert,
    DailyMatrixRowResponse,
    AdAccountCredentialCreate,
    AdAccountCredentialResponse,
    SyncNowRequest,
    SyncNowResponse,
    SyncStatusResponse,
)
from app.services.marketing_sync import run_daily_ad_metrics_sync

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/marketing",
    tags=["Performance Marketing"],
    responses={
        400: {"description": "Bad Request"},
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden"},
        500: {"description": "Internal Server Error"},
    }
)


# ── GET /marketing/daily ────────────────────────────────────────────────

async def _fetch_daily_matrix_rows_for_response(
    db,
    target_date: str,
    workspace_id: Optional[str],
    current_user: dict,
    include_inactive: bool = False,
) -> Tuple[List[DailyMatrixRowResponse], int]:
    campaign_filter = {}
    if workspace_id and workspace_id not in ("ALL", "all", "global"):
        campaign_filter["workspace_id"] = workspace_id

    campaigns_cursor = db.marketing_campaigns.find(campaign_filter, {"_id": 0})
    campaigns = await campaigns_cursor.to_list(length=None)
    if not campaigns:
        return [], 0

    campaign_map = {c["id"]: c for c in campaigns}
    campaign_ids = list(campaign_map.keys())

    metrics_cursor = db.daily_campaign_metrics.find(
        {"campaign_id": {"$in": campaign_ids}, "date": target_date},
        {"_id": 0}
    )
    metrics = await metrics_cursor.to_list(length=None)
    metric_map = {m["campaign_id"]: m for m in metrics}

    missing_ids = [cid for cid in campaign_ids if cid not in metric_map]
    if missing_ids:
        latest_pipeline = [
            {"$match": {"campaign_id": {"$in": missing_ids}, "date": {"$gte": "2026-04-01", "$lte": target_date}}},
            {"$sort": {"date": -1}},
            {"$group": {"_id": "$campaign_id", "doc": {"$first": "$$ROOT"}}}
        ]
        latest_res = await db.daily_campaign_metrics.aggregate(latest_pipeline).to_list(length=None)
        for entry in latest_res:
            metric_map[entry["_id"]] = entry["doc"]

    ws_ids = list(set(c.get("workspace_id", "") for c in campaigns if c.get("workspace_id")))
    ws_name_map = {}
    if ws_ids:
        ad_cursor = db.ad_accounts.find({"id": {"$in": ws_ids}}, {"_id": 0, "id": 1, "name": 1})
        ad_docs = await ad_cursor.to_list(length=None)
        ws_name_map = {a["id"]: a.get("name", "") for a in ad_docs}

        ws_cursor = db.workspaces.find({"id": {"$in": ws_ids}}, {"_id": 0, "id": 1, "name": 1})
        ws_docs = await ws_cursor.to_list(length=None)
        for w in ws_docs:
            if w["id"] not in ws_name_map:
                ws_name_map[w["id"]] = w.get("name", "")

    rows: List[DailyMatrixRowResponse] = []
    hidden_count = 0

    for camp in campaigns:
        cid = camp["id"]
        metric = metric_map.get(cid, {})
        status = camp.get("status", "Active")
        ad_spend = metric.get("ad_spend", 0.0)
        impressions = metric.get("impressions", 0)

        is_active_or_error = status in ("Active", "Error")
        has_activity = (ad_spend > 0) or (impressions > 0)

        if not (is_active_or_error or has_activity):
            hidden_count += 1
            if not include_inactive:
                continue

        row = DailyMatrixRowResponse(
            campaign_id=cid,
            workspace_id=camp.get("workspace_id", ""),
            workspace_name=ws_name_map.get(camp.get("workspace_id", ""), ""),
            campaign_name=camp.get("campaign_name", ""),
            platform=camp.get("platform", "Other"),
            objective=camp.get("objective", ""),
            industry=camp.get("industry", ""),
            budget_set=float(metric.get("budget_set")) if (metric.get("budget_set") is not None and float(metric.get("budget_set", 0)) > 0) else float(camp.get("budget_set", 0.0)),
            status=status,
            metric_id=metric.get("id", ""),
            date=target_date,
            ad_spend=ad_spend,
            cpl_cpa=metric.get("cpl_cpa", 0.0),
            leads_conversions=metric.get("leads_conversions", 0),
            impressions=impressions,
            clicks=metric.get("clicks", 0),
            reach=metric.get("reach", 0),
            avg_frequency=metric.get("avg_frequency", 1.0),
            remarks=metric.get("remarks", ""),
        )
        rows.append(row)

    return rows, hidden_count


@router.get("/daily", response_model=List[DailyMatrixRowResponse])
async def get_daily_matrix(
    request: Request,
    response: Response,
    date: Optional[str] = Query(default=None, description="ISO date string YYYY-MM-DD, defaults to today"),
    include_inactive: bool = Query(default=False, description="Whether to include inactive $0 spend campaigns"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns all marketing campaigns joined with their daily metric record for target date.
    Strictly reads from local MongoDB tables. No live API fetching or worker queuing.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    target_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    workspace_id = request.headers.get("X-Workspace-ID") or request.headers.get("x-workspace-id")

    rows, hidden_count = await _fetch_daily_matrix_rows_for_response(
        db, target_date, workspace_id, current_user, include_inactive=include_inactive
    )

    response.headers["X-Hidden-Count"] = str(hidden_count)
    response.headers["X-Total-Count"] = str(len(rows) + (hidden_count if not include_inactive else 0))

    return rows


# ── POST /marketing/campaigns ──────────────────────────────────────────

@router.post("/campaigns", status_code=status.HTTP_201_CREATED, response_model=MarketingCampaignResponse)
async def create_marketing_campaign(
    payload: MarketingCampaignCreate,
    current_user: dict = Depends(require_editor_or_admin),
):
    """Create a new marketing campaign record."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    if not payload.workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="workspace_id is required to create a marketing campaign."
        )

    now_str = datetime.now(timezone.utc).isoformat()
    campaign_doc = {
        "id": f"mc-{uuid.uuid4().hex[:8]}",
        "workspace_id": payload.workspace_id,
        "campaign_name": payload.campaign_name.strip(),
        "platform": payload.platform,
        "objective": payload.objective,
        "industry": payload.industry or "",
        "budget_set": payload.budget_set,
        "status": "Active",
        "created_at": now_str,
    }

    await db.marketing_campaigns.insert_one(campaign_doc)
    logger.info(f"✅ Created marketing campaign '{campaign_doc['campaign_name']}' (id={campaign_doc['id']})")

    return MarketingCampaignResponse(**campaign_doc)


# ── POST /marketing/daily/upsert ───────────────────────────────────────

@router.post("/daily/upsert")
async def upsert_daily_metric(
    payload: MetricUpsert,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_editor_or_admin),
):
    """
    Upserts a daily metric record for (campaign_id, date).
    Auto-calculates CPL/CPA if leads_conversions > 0.
    Also updates campaign-level fields (budget_set, status) if provided.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    # Verify campaign exists
    campaign = await db.marketing_campaigns.find_one({"id": payload.campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Marketing campaign '{payload.campaign_id}' not found."
        )

    # Update campaign-level fields if provided
    campaign_updates = {}
    if payload.budget_set is not None:
        campaign_updates["budget_set"] = payload.budget_set
    if payload.status is not None:
        campaign_updates["status"] = payload.status
    if campaign_updates:
        await db.marketing_campaigns.update_one(
            {"id": payload.campaign_id},
            {"$set": campaign_updates}
        )

    # Build metric update dict (only include provided fields)
    now_str = datetime.now(timezone.utc).isoformat()
    metric_update: dict = {"updated_at": now_str}

    if payload.ad_spend is not None:
        metric_update["ad_spend"] = payload.ad_spend
    if payload.leads_conversions is not None:
        metric_update["leads_conversions"] = payload.leads_conversions
    if payload.impressions is not None:
        metric_update["impressions"] = payload.impressions
    if payload.clicks is not None:
        metric_update["clicks"] = payload.clicks
    if payload.reach is not None:
        metric_update["reach"] = payload.reach
    if payload.avg_frequency is not None:
        metric_update["avg_frequency"] = payload.avg_frequency
    if payload.remarks is not None:
        metric_update["remarks"] = payload.remarks

    # Auto-calculate CPL/CPA
    if payload.cpl_cpa is not None:
        metric_update["cpl_cpa"] = payload.cpl_cpa
    elif payload.ad_spend is not None and payload.leads_conversions is not None and payload.leads_conversions > 0:
        metric_update["cpl_cpa"] = round(payload.ad_spend / payload.leads_conversions, 2)

    # Upsert: find existing record for (campaign_id, date) or create new
    existing = await db.daily_campaign_metrics.find_one(
        {"campaign_id": payload.campaign_id, "date": payload.date}
    )

    if existing:
        await db.daily_campaign_metrics.update_one(
            {"campaign_id": payload.campaign_id, "date": payload.date},
            {"$set": metric_update}
        )
        metric_id = existing.get("id", "")
        logger.info(f"📊 Updated daily metric for campaign={payload.campaign_id} date={payload.date}")
    else:
        metric_id = f"dm-{uuid.uuid4().hex[:8]}"
        new_metric = {
            "id": metric_id,
            "campaign_id": payload.campaign_id,
            "date": payload.date,
            "ad_spend": payload.ad_spend or 0.0,
            "cpl_cpa": metric_update.get("cpl_cpa", 0.0),
            "leads_conversions": payload.leads_conversions or 0,
            "impressions": payload.impressions or 0,
            "clicks": payload.clicks or 0,
            "reach": payload.reach or 0,
            "avg_frequency": payload.avg_frequency or 1.0,
            "remarks": payload.remarks or "",
            "updated_at": now_str,
        }
        await db.daily_campaign_metrics.insert_one(new_metric)
        logger.info(f"📊 Created daily metric for campaign={payload.campaign_id} date={payload.date}")

    # Background: Obsidian reporting hook
    try:
        from app.services.obsidian_service import sync_daily_marketing_to_obsidian
        ws_name = campaign.get("campaign_name", "Marketing")
        # Look up actual workspace name
        ws_id = campaign.get("workspace_id")
        if ws_id:
            ws_doc = await db.workspaces.find_one({"id": ws_id}, {"_id": 0, "name": 1})
            if ws_doc:
                ws_name = ws_doc.get("name", ws_name)

        summary = {
            "campaign_name": campaign.get("campaign_name", ""),
            "platform": campaign.get("platform", ""),
            "ad_spend": payload.ad_spend or 0.0,
            "leads_conversions": payload.leads_conversions or 0,
            "cpl_cpa": metric_update.get("cpl_cpa", 0.0),
            "impressions": payload.impressions or 0,
            "remarks": payload.remarks or "",
        }
        background_tasks.add_task(sync_daily_marketing_to_obsidian, ws_name, payload.date, summary)
    except Exception as e:
        logger.warning(f"Failed to queue Obsidian marketing sync: {e}")

    return {
        "message": "Daily metric upserted successfully.",
        "metric_id": metric_id,
        "campaign_id": payload.campaign_id,
        "date": payload.date,
    }


# ── PATCH /marketing/campaigns/{id} ────────────────────────────────────

@router.patch("/campaigns/{campaign_id}", response_model=MarketingCampaignResponse)
async def update_marketing_campaign(
    campaign_id: str,
    payload: MarketingCampaignUpdate,
    current_user: dict = Depends(require_editor_or_admin),
):
    """Update static fields of a marketing campaign."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    existing = await db.marketing_campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Marketing campaign '{campaign_id}' not found."
        )

    updates = {}
    if payload.campaign_name is not None:
        updates["campaign_name"] = payload.campaign_name.strip()
    if payload.platform is not None:
        updates["platform"] = payload.platform
    if payload.objective is not None:
        updates["objective"] = payload.objective
    if payload.industry is not None:
        updates["industry"] = payload.industry
    if payload.budget_set is not None:
        updates["budget_set"] = payload.budget_set
    if payload.status is not None:
        updates["status"] = payload.status

    if updates:
        await db.marketing_campaigns.update_one({"id": campaign_id}, {"$set": updates})

    updated = await db.marketing_campaigns.find_one({"id": campaign_id}, {"_id": 0})
    logger.info(f"✅ Updated marketing campaign '{campaign_id}': {list(updates.keys())}")

    return MarketingCampaignResponse(**updated)


# ── POST /marketing/sync-now ───────────────────────────────────────────

@router.post("/sync-now", status_code=status.HTTP_202_ACCEPTED, response_model=SyncNowResponse)
async def sync_now(
    background_tasks: BackgroundTasks,
    payload: Optional[SyncNowRequest] = None,
    request: Request = None,
    include_inactive: bool = Query(default=False),
    current_user: dict = Depends(require_editor_or_admin),
):
    """
    Decoupled sync route: Enqueues background sync for Meta and Google Ads performance metrics
    and returns 202 Accepted immediately. Does not block HTTP response thread.
    """
    target_ws = None
    target_date = None

    if payload:
        target_ws = payload.workspace_id
        target_date = payload.date

    if not target_ws and request:
        target_ws = request.headers.get("X-Workspace-ID") or request.headers.get("x-workspace-id")

    if not target_date:
        target_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    ws_sync_param = target_ws if target_ws and target_ws != "ALL" else None
    job_key = f"sync_{ws_sync_param or 'global'}"

    db = get_database()
    if db is not None:
        await db.sync_jobs.update_one(
            {"job_key": job_key},
            {
                "$set": {
                    "job_key": job_key,
                    "status": "processing",
                    "message": f"Sync started in background for date {target_date}.",
                    "workspace_id": ws_sync_param or "",
                    "date": target_date,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "completed_at": None,
                    "errors": [],
                }
            },
            upsert=True,
        )

    from app.services.marketing_sync import run_daily_ad_metrics_sync

    # Delegate actual fetching to non-blocking background task
    background_tasks.add_task(
        run_daily_ad_metrics_sync,
        date_str=target_date,
        target_workspace_id=ws_sync_param,
        job_key=job_key,
    )

    msg = f"Sync started in background for date {target_date}."

    return SyncNowResponse(
        status="processing",
        message=msg,
        synced_campaigns_count=0,
        synced_metrics_count=0,
        date=target_date,
        errors=[],
    )


@router.get("/sync-status", response_model=SyncStatusResponse)
async def get_sync_status(
    request: Request,
    workspace_id: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns the real-time background sync job status for the workspace/global context.
    Used by frontend polling mechanism to detect sync completion.
    """
    db = get_database()
    target_ws = workspace_id or request.headers.get("X-Workspace-ID") or request.headers.get("x-workspace-id")
    ws_param = target_ws if target_ws and target_ws != "ALL" else None
    job_key = f"sync_{ws_param or 'global'}"

    if db is not None:
        job_doc = await db.sync_jobs.find_one({"job_key": job_key}, {"_id": 0})
        if job_doc:
            return SyncStatusResponse(**job_doc)

    return SyncStatusResponse(
        status="idle",
        message="No active background sync job found.",
        synced_campaigns_count=0,
        synced_metrics_count=0,
        date="",
        workspace_id=ws_param or "",
        errors=[],
    )


# ── CREDENTIAL MANAGEMENT ENDPOINTS ────────────────────────────────────

import time
import httpx

_RATE_LIMIT_STORE: dict = {}
_RATE_LIMIT_WINDOW = 60  # seconds
_RATE_LIMIT_MAX = 5  # max 5 verification attempts per minute


def check_credential_rate_limit(key: str):
    """Enforces max 5 verification calls per 60 seconds per user."""
    now = time.time()
    history = _RATE_LIMIT_STORE.get(key, [])
    history = [t for t in history if now - t < _RATE_LIMIT_WINDOW]
    if len(history) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded: Max 5 credential verification attempts per minute. Please wait before trying again."
        )
    history.append(now)
    _RATE_LIMIT_STORE[key] = history


async def verify_meta_credentials(account_id: str, access_token: str) -> dict:
    """Verifies that the Meta ad account exists and token is valid."""
    token = (access_token or "").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Meta Access Token is required to authenticate with Meta Graph API."
        )

    act_id = account_id.strip()
    if not act_id.startswith("act_"):
        act_id = f"act_{act_id}"

    url = f"https://graph.facebook.com/v21.0/{act_id}"
    params = {
        "fields": "id,name,account_status,currency,timezone_name",
        "access_token": token,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url, params=params)
            data = res.json()

            if res.status_code != 200 or "error" in data:
                err_obj = data.get("error", {})
                err_msg = err_obj.get("message") or "Authentication failed with Meta API."
                err_code = err_obj.get("code", "Unknown")
                err_type = err_obj.get("type", "OAuthException")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Meta Verification Failed ({err_type} {err_code}): {err_msg}"
                )

            return data
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Meta Graph API connection failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Meta Graph API Connection Error: {str(exc)}"
        )


async def verify_google_credentials(
    account_id: str,
    client_id: str,
    client_secret: str,
    refresh_token: str,
    developer_token: str,
) -> dict:
    """Verifies Google Ads Customer ID and OAuth tokens."""
    cust_id = account_id.strip().replace("-", "")
    if not cust_id.isdigit() or len(cust_id) != 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Google Ads Customer ID format. Must be 10 digits (e.g. 123-456-7890 or 1234567890)."
        )

    r_token = (refresh_token or "").strip()
    c_id = (client_id or "").strip()
    c_secret = (client_secret or "").strip()
    d_token = (developer_token or "").strip()

    if not r_token:
        raise HTTPException(status_code=400, detail="Google Ads OAuth Refresh Token is required.")
    if not c_id or not c_secret:
        raise HTTPException(status_code=400, detail="Google Ads Client ID and Client Secret are required.")
    if not d_token:
        raise HTTPException(status_code=400, detail="Google Ads Developer Token is required.")

    token_url = "https://oauth2.googleapis.com/token"
    token_payload = {
        "client_id": c_id,
        "client_secret": c_secret,
        "refresh_token": r_token,
        "grant_type": "refresh_token",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(token_url, data=token_payload)
            data = res.json()

            if res.status_code != 200 or "error" in data:
                err_msg = data.get("error_description") or data.get("error") or "OAuth verification failed."
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Google Ads OAuth Failed: {err_msg}"
                )

            return data
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Google Ads OAuth connection failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google Ads OAuth Connection Error: {str(exc)}"
        )


@router.post("/credentials", response_model=AdAccountCredentialResponse, status_code=status.HTTP_201_CREATED)
async def save_ad_account_credential(
    payload: AdAccountCredentialCreate,
    current_user: dict = Depends(require_editor_or_admin),
):
    """Verifies live API authentication with Meta/Google Ads and saves credentials."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    # Enforce rate limiting
    user_key = current_user.get("id") or current_user.get("email") or "anonymous"
    check_credential_rate_limit(user_key)

    import re
    now_str = datetime.now(timezone.utc).isoformat()
    target_ws_id = (payload.workspace_id or "").strip()
    target_ws_name = (payload.workspace_name or "").strip()
    norm_platform = "Google" if payload.platform.lower().startswith("google") else "Meta"

    # Step 1: Live API Verification against Meta or Google Ads
    if norm_platform == "Meta":
        await verify_meta_credentials(payload.account_id, payload.access_token or "")
    elif norm_platform == "Google":
        await verify_google_credentials(
            account_id=payload.account_id,
            client_id=payload.client_id or "",
            client_secret=payload.client_secret or "",
            refresh_token=payload.refresh_token or "",
            developer_token=payload.developer_token or "",
        )

    # Step 2: Resolve / Auto-create Workspace with strict platform tag
    if target_ws_name:
        existing_ws = await db.workspaces.find_one(
            {"name": {"$regex": f"^{re.escape(target_ws_name)}$", "$options": "i"}},
            {"_id": 0}
        )
        if existing_ws:
            target_ws_id = existing_ws["id"]
            target_ws_name = existing_ws.get("name", target_ws_name)
        else:
            # Auto-create new Ad Account / Workspace
            new_ws_id = f"ws-{uuid.uuid4().hex[:8]}"
            initials = "".join([p[0] for p in target_ws_name.split() if p])[:2].upper() or target_ws_name[:2].upper()
            
            if any(k in target_ws_name.lower() for k in ["ed&c", "ednc", "elegant design"]):
                platform_tag = "Meta & Google"
            elif norm_platform == "Google":
                platform_tag = "Google Ads"
            else:
                platform_tag = "Meta Ads"

            new_ws_doc = {
                "id": new_ws_id,
                "name": target_ws_name,
                "platform": platform_tag,
                "initials": initials,
                "brandColor": "bg-emerald-600" if norm_platform == "Google" else "bg-indigo-600",
                "brand_color": "bg-emerald-600" if norm_platform == "Google" else "bg-indigo-600",
                "industry": "Performance Marketing",
                "brandGuidelines": "",
                "brand_guidelines": "",
                "isDefault": False,
                "user_id": current_user.get("id", ""),
            }
            await db.workspaces.insert_one(new_ws_doc)
            target_ws_id = new_ws_id
    elif target_ws_id:
        ws_doc = await db.workspaces.find_one({"id": target_ws_id}, {"_id": 0, "name": 1})
        if ws_doc:
            target_ws_name = ws_doc.get("name", "")
    else:
        raise HTTPException(status_code=400, detail="Please provide an Ad Account or Client Brand name.")

    # Step 3: Save or update credentials
    clean_account_id = payload.account_id.strip()
    if norm_platform == "Meta" and not clean_account_id.startswith("act_"):
        clean_account_id = f"act_{clean_account_id}"

    existing = await db.ad_account_credentials.find_one({
        "workspace_id": target_ws_id,
        "platform": norm_platform,
        "account_id": clean_account_id,
    })

    cred_doc = {
        "workspace_id": target_ws_id,
        "platform": norm_platform,
        "account_id": clean_account_id,
        "access_token": encrypt_string(payload.access_token or ""),
        "refresh_token": encrypt_string(payload.refresh_token or ""),
        "developer_token": encrypt_string(payload.developer_token or ""),
        "client_id": payload.client_id or "",
        "client_secret": encrypt_string(payload.client_secret or ""),
        "is_active": payload.is_active,
        "updated_at": now_str,
    }

    if existing:
        await db.ad_account_credentials.update_one(
            {"id": existing["id"]},
            {"$set": cred_doc}
        )
        cred_doc["id"] = existing["id"]
        cred_doc["created_at"] = existing.get("created_at", now_str)
        logger.info(f"Updated verified ad credential '{cred_doc['id']}' for {norm_platform} ({clean_account_id})")
    else:
        cred_id = f"cred-{uuid.uuid4().hex[:8]}"
        cred_doc["id"] = cred_id
        cred_doc["created_at"] = now_str
        await db.ad_account_credentials.insert_one(cred_doc)
        logger.info(f"Created verified ad credential '{cred_id}' for {norm_platform} ({clean_account_id})")

    resp_doc = dict(cred_doc)
    resp_doc["workspace_name"] = target_ws_name
    resp_doc["access_token"] = decrypt_string(resp_doc["access_token"])
    resp_doc["refresh_token"] = decrypt_string(resp_doc["refresh_token"])
    resp_doc["developer_token"] = decrypt_string(resp_doc["developer_token"])
    resp_doc["client_secret"] = decrypt_string(resp_doc["client_secret"])

    return AdAccountCredentialResponse(**resp_doc)


@router.get("/credentials", response_model=List[AdAccountCredentialResponse])
async def list_ad_account_credentials(
    request: Request,
    workspace_id: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Lists registered ad account credentials with resolved workspace brand names."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    target_ws = workspace_id or request.headers.get("X-Workspace-ID") or request.headers.get("x-workspace-id")
    query = {}
    if target_ws and target_ws != "ALL":
        query["workspace_id"] = target_ws

    creds = await db.ad_account_credentials.find(query, {"_id": 0}).to_list(length=None)

    # Resolve workspace names map
    ws_docs = await db.workspaces.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(length=None)
    ws_name_map = {w["id"]: w.get("name", "") for w in ws_docs}

    res_list = []
    for c in creds:
        c_copy = dict(c)
        c_copy["workspace_name"] = ws_name_map.get(c_copy.get("workspace_id", ""), "")
        c_copy["access_token"] = decrypt_string(c_copy.get("access_token", ""))
        c_copy["refresh_token"] = decrypt_string(c_copy.get("refresh_token", ""))
        c_copy["developer_token"] = decrypt_string(c_copy.get("developer_token", ""))
        c_copy["client_secret"] = decrypt_string(c_copy.get("client_secret", ""))
        res_list.append(AdAccountCredentialResponse(**c_copy))

    return res_list



@router.delete("/credentials/{credential_id}")
async def delete_ad_account_credential(
    credential_id: str,
    current_user: dict = Depends(require_editor_or_admin),
):
    """Deletes an ad account credential record."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    result = await db.ad_account_credentials.delete_one({"id": credential_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Credential record not found.")

    return {"message": "Ad credential deleted successfully."}

