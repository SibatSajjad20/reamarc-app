"""
Executive Command Center Dashboard API Router.
Provides aggregate metrics, pending action queue, system alerts, and workspace health.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query, Request
from app.core.security import get_current_user
from app.database import get_database
from app.schemas.dashboard import (
    DashboardSummaryResponse,
    PerformanceKPIs,
    ActionQueue,
    ActionQueueItem,
    WorkspaceHealth,
    RAGFileSummary,
)

logger = logging.getLogger(__name__)

EXCHANGE_RATES_TO_USD = {
    "USD": 1.0,
    "PKR": 1.0 / 278.5,
    "GBP": 1.27,
    "EUR": 1.09,
    "AED": 1.0 / 3.67,
}

router = APIRouter(
    prefix="/dashboard",
    tags=["Executive Dashboard"],
)


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    request: Request,
    workspace_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns an aggregated overview for the Executive Command Center:
    1. Performance KPIs (Ad Spend, Leads/Conversions, Blended CPA, Active Campaigns)
    2. Action Queue (Pending Approvals, System Alerts)
    3. Workspace Health (Total Workspaces, Users, Recent Obsidian/RAG Files)
    """
    db = get_database()
    if db is None:
        return DashboardSummaryResponse(
            performance_kpis=PerformanceKPIs(),
            action_queue=ActionQueue(),
            workspace_health=WorkspaceHealth(),
        )

    # 1. Workspace Context Resolution
    target_ws = workspace_id or request.headers.get("X-Workspace-ID") or request.headers.get("x-workspace-id")
    ws_filter = target_ws if target_ws and target_ws not in ("ALL", "all") else None

    # Date Range Resolution (Defaults to last 30 days up to today)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")

    s_date = start_date or thirty_days_ago
    e_date = end_date or today

    # Pre-fetch all workspace mappings for fast title lookups
    workspaces_list = await db.workspaces.find({}, {"_id": 0, "id": 1, "name": 1, "currency": 1}).to_list(length=500)
    ws_map = {w["id"]: w.get("name", "Workspace") for w in workspaces_list}
    ws_currency_map = {w["id"]: w.get("currency", "USD").upper() for w in workspaces_list}

    # ------------------------------------------------------------------
    # OBJECT 1: Performance KPIs
    # ------------------------------------------------------------------
    target_currency = "USD"
    is_normalized = False

    campaign_filter: Dict[str, Any] = {}
    if ws_filter:
        campaign_filter["workspace_id"] = ws_filter
        ws_doc = await db.workspaces.find_one({"id": ws_filter}, {"_id": 0, "currency": 1})
        if ws_doc and ws_doc.get("currency"):
            target_currency = ws_doc.get("currency").upper()
    else:
        user_role = current_user.get("role", "viewer")
        if user_role != "admin":
            user_ws_ids = current_user.get("workspace_ids", [])
            if user_ws_ids:
                campaign_filter["workspace_id"] = {"$in": user_ws_ids}
            else:
                campaign_filter["workspace_id"] = "NONE_ALLOWED"
        is_normalized = True

    campaigns = await db.marketing_campaigns.find(campaign_filter, {"_id": 0, "id": 1, "workspace_id": 1, "status": 1}).to_list(length=10000)
    campaign_ids = [c["id"] for c in campaigns if "id" in c]
    camp_ws_map = {c["id"]: c.get("workspace_id") for c in campaigns if "id" in c}

    total_spend = 0.0
    total_leads = 0

    if campaign_ids:
        metrics_docs = await db.daily_campaign_metrics.find(
            {
                "campaign_id": {"$in": campaign_ids},
                "date": {"$gte": s_date, "$lte": e_date}
            },
            {"_id": 0}
        ).to_list(length=20000)

        # Fallback for single date view if metrics_docs is empty or missing campaigns
        if s_date == e_date:
            metric_map = {m["campaign_id"]: m for m in metrics_docs}
            missing_ids = [cid for cid in campaign_ids if cid not in metric_map]
            if missing_ids:
                fallback_pipeline = [
                    {"$match": {"campaign_id": {"$in": missing_ids}, "date": {"$lte": e_date}}},
                    {"$sort": {"date": -1}},
                    {"$group": {"_id": "$campaign_id", "doc": {"$first": "$$ROOT"}}}
                ]
                fallback_res = await db.daily_campaign_metrics.aggregate(fallback_pipeline).to_list(length=5000)
                for entry in fallback_res:
                    metric_map[entry["_id"]] = entry["doc"]
            metrics_docs = list(metric_map.values())

        for m in metrics_docs:
            spend = float(m.get("ad_spend") or m.get("adSpend") or 0.0)
            leads = int(m.get("leads_conversions") or m.get("leadsConversions") or m.get("conversions") or 0)
            
            if is_normalized:
                cid = m.get("campaign_id")
                w_id = camp_ws_map.get(cid)
                curr = ws_currency_map.get(w_id, "USD")
                rate = EXCHANGE_RATES_TO_USD.get(curr, 1.0)
                spend = spend * rate

            total_spend += spend
            total_leads += leads

    blended_cpa = round(total_spend / total_leads, 2) if total_leads > 0 else 0.0

    # Count active campaigns
    active_campaigns_count = sum(1 for c in campaigns if c.get("status") in ("Active", "active", "ACTIVE"))

    CURRENCY_SYMBOLS = {
        "USD": "$",
        "PKR": "Rs ",
        "GBP": "£",
        "EUR": "€",
        "AED": "AED ",
    }
    symbol = CURRENCY_SYMBOLS.get(target_currency, "$")

    performance_kpis = PerformanceKPIs(
        ad_spend=round(total_spend, 2),
        leads_conversions=total_leads,
        blended_cpa=blended_cpa,
        active_campaigns_count=active_campaigns_count,
        currency=target_currency,
        currency_symbol=symbol,
        is_normalized=is_normalized,
    )

    # ------------------------------------------------------------------
    # OBJECT 2: Action Queue
    # ------------------------------------------------------------------
    # 2a. Pending Approvals (limit 5)
    pending_approvals: List[ActionQueueItem] = []

    # Check marketing campaigns in review / pending
    pending_camp_query: Dict[str, Any] = {
        "status": {"$in": ["In Review", "in_review", "Pending", "pending", "Draft", "draft"]}
    }
    if ws_filter:
        pending_camp_query["workspace_id"] = ws_filter

    pending_camps = await db.marketing_campaigns.find(pending_camp_query, {"_id": 0}).limit(5).to_list(length=5)
    for c in pending_camps:
        w_id = c.get("workspace_id") or c.get("workspaceId") or ""
        pending_approvals.append(
            ActionQueueItem(
                id=str(c.get("id") or c.get("campaign_id") or "camp-1"),
                title=c.get("campaign_name") or c.get("title") or "Untitled Campaign",
                workspace_name=ws_map.get(w_id, "Main Workspace"),
                status=c.get("status", "In Review"),
                updated_at=c.get("updated_at") or c.get("created_at") or today,
                platform=c.get("platform", "Meta"),
            )
        )

    # If pending approvals < 5, supplement with posts in review
    if len(pending_approvals) < 5:
        post_query: Dict[str, Any] = {"status": {"$in": ["pending", "in_review", "draft"]}}
        if ws_filter:
            post_query["workspace_id"] = ws_filter
        pending_posts = await db.posts.find(post_query, {"_id": 0}).limit(5 - len(pending_approvals)).to_list(length=5)
        for p in pending_posts:
            w_id = p.get("workspace_id") or ""
            title_text = (p.get("copy") or p.get("title") or "Content Draft")[:40] + "..."
            pending_approvals.append(
                ActionQueueItem(
                    id=str(p.get("id", "post-1")),
                    title=title_text,
                    workspace_name=ws_map.get(w_id, "Main Workspace"),
                    status="In Review",
                    updated_at=p.get("date") or today,
                    platform=p.get("platform", "Social"),
                )
            )

    # 2b. System Alerts (Error / WITH_ISSUES / Stopped)
    system_alerts: List[ActionQueueItem] = []
    error_camp_query: Dict[str, Any] = {
        "status": {"$in": ["Error", "error", "WITH_ISSUES", "Stopped", "stopped"]}
    }
    if ws_filter:
        error_camp_query["workspace_id"] = ws_filter

    error_camps = await db.marketing_campaigns.find(error_camp_query, {"_id": 0}).limit(10).to_list(length=10)
    for c in error_camps:
        w_id = c.get("workspace_id") or ""
        st = c.get("status", "Error")
        msg = f"Campaign reported status '{st}'. Review ad credentials or billing details."
        system_alerts.append(
            ActionQueueItem(
                id=str(c.get("id") or c.get("campaign_id") or "err-1"),
                title=c.get("campaign_name") or c.get("title") or "Campaign Alert",
                workspace_name=ws_map.get(w_id, "Main Workspace"),
                status=st,
                updated_at=c.get("updated_at") or today,
                platform=c.get("platform", "Meta"),
                message=msg,
            )
        )

    action_queue = ActionQueue(
        pending_approvals=pending_approvals,
        system_alerts=system_alerts,
    )

    # ------------------------------------------------------------------
    # OBJECT 3: Workspace Health
    # ------------------------------------------------------------------
    total_workspaces = await db.workspaces.count_documents({})
    total_users = await db.users.count_documents({})

    # Fetch 3 most recently updated Obsidian / RAG files
    rag_sources = await db.knowledge_sources.find({}, {"_id": 0}).sort("dateAdded", -1).limit(3).to_list(length=3)
    recent_rag_files: List[RAGFileSummary] = []

    for s in rag_sources:
        w_id = s.get("workspaceId") or s.get("workspace_id") or ""
        recent_rag_files.append(
            RAGFileSummary(
                id=str(s.get("id") or "ks-1"),
                name=s.get("name", "Document.pdf"),
                type=s.get("type", "pdf"),
                workspace_name=ws_map.get(w_id, "Main Workspace"),
                date_added=s.get("dateAdded") or s.get("lastSynced") or today,
            )
        )

    workspace_health = WorkspaceHealth(
        total_workspaces=total_workspaces,
        total_users=total_users,
        recent_rag_files=recent_rag_files,
    )

    return DashboardSummaryResponse(
        performance_kpis=performance_kpis,
        action_queue=action_queue,
        workspace_health=workspace_health,
    )
