"""
Automated Background Sync Worker for Performance Marketing.
Iterates over active platform credentials in parallel, fetches daily ad metrics,
matches/creates campaigns, and upserts daily metrics into MongoDB.
"""

import logging
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple

from app.database import get_database
from app.core.encryption import decrypt_string
from app.services.meta_ads import fetch_meta_insights
from app.services.google_ads import fetch_google_insights
from app.services.obsidian_service import sync_daily_marketing_to_obsidian

logger = logging.getLogger(__name__)


async def _sync_single_credential(
    cred: Dict[str, Any],
    date_str: str,
    db: Any,
    sem: asyncio.Semaphore,
) -> Tuple[int, int, List[str]]:
    async with sem:
        ws_id = cred.get("workspace_id", "")
        platform = cred.get("platform", "").strip()
        account_id = cred.get("account_id", "").strip()

        # Decrypt tokens if encrypted
        access_token = decrypt_string(cred.get("access_token", ""))
        refresh_token = decrypt_string(cred.get("refresh_token", ""))
        developer_token = decrypt_string(cred.get("developer_token", ""))
        client_secret = decrypt_string(cred.get("client_secret", ""))
        client_id = cred.get("client_id", "")

        logger.info(f"🔄 Syncing {platform} metrics for workspace={ws_id}, account={account_id}, date={date_str}")

        fetched_metrics: List[Dict[str, Any]] = []
        errors: List[str] = []
        synced_campaigns = 0
        synced_metrics = 0

        try:
            if platform.lower() == "meta":
                fetched_metrics = await fetch_meta_insights(
                    account_id=account_id,
                    access_token=access_token,
                    date_str=date_str,
                )
            elif platform.lower() == "google":
                fetched_metrics = await fetch_google_insights(
                    account_id=account_id,
                    access_token=access_token,
                    developer_token=developer_token,
                    date_str=date_str,
                    client_id=client_id,
                    client_secret=client_secret,
                    refresh_token=refresh_token,
                )
            else:
                logger.warning(f"Unsupported platform: {platform}")
                return 0, 0, []


        except Exception as e:
            err_msg = f"Error fetching from {platform} ({account_id}): {e}"
            logger.error(err_msg)
            return 0, 0, [err_msg]

        # Pre-fetch existing campaigns for this workspace to eliminate N+1 queries
        existing_campaigns_list = await db.marketing_campaigns.find({"workspace_id": ws_id}).to_list(length=None)
        campaign_by_name = {c.get("campaign_name"): c for c in existing_campaigns_list if c.get("campaign_name")}
        campaign_by_ext_id = {c.get("external_campaign_id"): c for c in existing_campaigns_list if c.get("external_campaign_id")}

        # Pre-fetch existing daily metrics for this date
        campaign_ids = [c["id"] for c in existing_campaigns_list if "id" in c]
        existing_metrics_list = []
        if campaign_ids:
            existing_metrics_list = await db.daily_campaign_metrics.find({
                "campaign_id": {"$in": campaign_ids},
                "date": date_str
            }).to_list(length=None)
        existing_metric_by_cid = {m["campaign_id"]: m for m in existing_metrics_list if "campaign_id" in m}

        now_iso = datetime.now(timezone.utc).isoformat()

        from pymongo import UpdateOne, InsertOne

        campaign_ops = []
        metric_ops = []

        # Process each fetched campaign metric in memory
        for item in fetched_metrics:
            c_name = item.get("campaign_name", "Unnamed Campaign")
            ext_id = item.get("external_campaign_id", "")

            # Look for matching MarketingCampaign in memory
            campaign = campaign_by_ext_id.get(ext_id) or campaign_by_name.get(c_name)

            new_status = item.get("status", "Active")
            new_budget = float(item.get("budget_set", 0.0))
            new_objective = item.get("objective", "Lead Generation")

            if not campaign:
                # Auto-create campaign in marketing_campaigns
                cid = f"mc-{uuid.uuid4().hex[:8]}"
                campaign = {
                    "id": cid,
                    "workspace_id": ws_id,
                    "campaign_name": c_name,
                    "external_campaign_id": ext_id,
                    "platform": platform,
                    "objective": new_objective,
                    "industry": "",
                    "budget_set": new_budget,
                    "status": new_status,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
                campaign_ops.append(InsertOne(campaign))
                campaign_by_name[c_name] = campaign
                if ext_id:
                    campaign_by_ext_id[ext_id] = campaign
                synced_campaigns += 1
            else:
                # Sync live config updates (name, status, budget, objective)
                update_fields: Dict[str, Any] = {
                    "campaign_name": c_name,
                    "status": new_status,
                    "external_campaign_id": ext_id,
                    "updated_at": now_iso,
                }
                if new_budget > 0:
                    update_fields["budget_set"] = new_budget
                if new_objective:
                    update_fields["objective"] = new_objective

                campaign_ops.append(UpdateOne(
                    {"id": campaign["id"]},
                    {"$set": update_fields}
                ))

            campaign_id = campaign["id"]

            # Upsert daily metric record
            metric_update = {
                "ad_spend": item.get("ad_spend", 0.0),
                "impressions": item.get("impressions", 0),
                "clicks": item.get("clicks", 0),
                "reach": item.get("reach", 0),
                "leads_conversions": item.get("leads_conversions", 0),
                "cpl_cpa": item.get("cpl_cpa", 0.0),
                "avg_frequency": item.get("avg_frequency", 1.0),
                "remarks": item.get("remarks", f"Synced from {platform}"),
                "updated_at": now_iso,
            }

            existing_metric = existing_metric_by_cid.get(campaign_id)

            if existing_metric:
                metric_ops.append(UpdateOne(
                    {"campaign_id": campaign_id, "date": date_str},
                    {"$set": metric_update}
                ))
            else:
                metric_doc = {
                    "id": f"dm-{uuid.uuid4().hex[:8]}",
                    "campaign_id": campaign_id,
                    "date": date_str,
                    **metric_update
                }
                metric_ops.append(InsertOne(metric_doc))
                existing_metric_by_cid[campaign_id] = metric_doc

            synced_metrics += 1

        # Execute bulk batch operations to MongoDB Atlas in chunks of 500
        if campaign_ops:
            for i in range(0, len(campaign_ops), 500):
                await db.marketing_campaigns.bulk_write(campaign_ops[i:i+500], ordered=False)
        if metric_ops:
            for i in range(0, len(metric_ops), 500):
                await db.daily_campaign_metrics.bulk_write(metric_ops[i:i+500], ordered=False)

        return synced_campaigns, synced_metrics, errors


async def run_daily_ad_metrics_sync(
    date_str: Optional[str] = None,
    target_workspace_id: Optional[str] = None,
    job_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes automated parallel sync of daily ad performance metrics for active credentials,
    updating job status in MongoDB for real-time frontend status polling.
    Includes atomic job locking to prevent concurrent redundant execution.
    """
    db = get_database()
    if not date_str:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    resolved_job_key = job_key or f"sync_{target_workspace_id or 'global'}"

    if db is None:
        logger.error("Marketing Sync Worker: Database unavailable.")
        return {
            "synced_campaigns_count": 0,
            "synced_metrics_count": 0,
            "date": date_str,
            "errors": ["Database unavailable."],
        }

    # Job Mutex Lock Check: Skip if job is already processing within 15 minutes
    existing_job = await db.sync_jobs.find_one({"job_key": resolved_job_key})
    if existing_job and existing_job.get("status") == "processing":
        started_at_str = existing_job.get("started_at")
        if started_at_str:
            try:
                started_dt = datetime.fromisoformat(started_at_str)
                if started_dt.tzinfo is None:
                    started_dt = started_dt.replace(tzinfo=timezone.utc)
                now_dt = datetime.now(timezone.utc)
                if (now_dt - started_dt).total_seconds() < 900:  # 15 min lock
                    logger.warning(f"Sync job '{resolved_job_key}' is already processing. Skipping redundant execution.")
                    return {
                        "synced_campaigns_count": 0,
                        "synced_metrics_count": 0,
                        "date": date_str,
                        "errors": ["Sync job is already in progress."],
                    }
            except Exception as e:
                logger.warning(f"Failed parsing started_at date for job lock: {e}")

    # Update job status to processing
    await db.sync_jobs.update_one(
        {"job_key": resolved_job_key},
        {
            "$set": {
                "job_key": resolved_job_key,
                "status": "processing",
                "message": f"Sync in progress for date {date_str}...",
                "workspace_id": target_workspace_id or "",
                "date": date_str,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": None,
                "errors": [],
            }
        },
        upsert=True,
    )


    try:
        cred_query: Dict[str, Any] = {"is_active": True}
        if target_workspace_id and target_workspace_id != "ALL":
            cred_query["workspace_id"] = target_workspace_id

        credentials = await db.ad_account_credentials.find(cred_query, {"_id": 0}).to_list(length=None)

        if not credentials:
            logger.info(f"Marketing Sync Worker: No active ad credentials found for workspace_id={target_workspace_id}")
            result = {
                "synced_campaigns_count": 0,
                "synced_metrics_count": 0,
                "date": date_str,
                "errors": [],
            }
            await db.sync_jobs.update_one(
                {"job_key": resolved_job_key},
                {
                    "$set": {
                        "status": "completed",
                        "message": "No active credentials found.",
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                        "synced_campaigns_count": 0,
                        "synced_metrics_count": 0,
                        "errors": [],
                    }
                },
            )
            return result

        sem = asyncio.Semaphore(10)
        tasks = [_sync_single_credential(cred, date_str, db, sem) for cred in credentials]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        total_synced_campaigns = 0
        total_synced_metrics = 0
        all_errors: List[str] = []

        for res in results:
            if isinstance(res, Exception):
                all_errors.append(str(res))
            else:
                c_count, m_count, errs = res
                total_synced_campaigns += c_count
                total_synced_metrics += m_count
                all_errors.extend(errs)

        final_status = "error" if (all_errors and total_synced_metrics == 0) else "completed"
        msg = f"Sync complete for {date_str}. Synced {total_synced_metrics} metrics."

        await db.sync_jobs.update_one(
            {"job_key": resolved_job_key},
            {
                "$set": {
                    "status": final_status,
                    "message": msg,
                    "synced_campaigns_count": total_synced_campaigns,
                    "synced_metrics_count": total_synced_metrics,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "errors": all_errors,
                }
            },
        )

        logger.info(f"✅ Parallel Marketing Sync Complete for {date_str}: {total_synced_metrics} metrics across {len(credentials)} credentials.")

        return {
            "synced_campaigns_count": total_synced_campaigns,
            "synced_metrics_count": total_synced_metrics,
            "date": date_str,
            "errors": all_errors,
        }

    except Exception as exc:
        logger.error(f"Sync task failed with exception: {exc}")
        await db.sync_jobs.update_one(
            {"job_key": resolved_job_key},
            {
                "$set": {
                    "status": "error",
                    "message": f"Sync failed: {exc}",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "errors": [str(exc)],
                }
            },
        )
        return {
            "synced_campaigns_count": 0,
            "synced_metrics_count": 0,
            "date": date_str,
            "errors": [str(exc)],
        }
