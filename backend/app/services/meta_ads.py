"""
Meta Ads API Fetcher Service.
Pulls live configuration and daily insights for campaigns using the Meta Graph API v19.0.
"""

import logging
import json
import asyncio
import httpx
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

META_GRAPH_API_VERSION = "v19.0"
META_GRAPH_BASE_URL = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}"


async def _execute_meta_request_with_retry(
    client: httpx.AsyncClient,
    url: str,
    params: Dict[str, Any],
    max_retries: int = 3,
) -> httpx.Response:
    """Executes Meta Graph API GET request with exponential backoff retries on rate limits and timeouts."""
    delay = 1.0
    last_response = None
    for attempt in range(1, max_retries + 1):
        try:
            res = await client.get(url, params=params)
            if res.status_code == 200:
                return res
            last_response = res
            if res.status_code in (429, 500, 502, 503, 504):
                logger.warning(f"Meta API returned status {res.status_code} (attempt {attempt}/{max_retries}). Retrying in {delay}s...")
                await asyncio.sleep(delay)
                delay *= 2.0
            else:
                return res
        except (httpx.TimeoutException, httpx.NetworkError) as err:
            logger.warning(f"Network error calling Meta API (attempt {attempt}/{max_retries}): {err}")
            if attempt == max_retries:
                raise
            await asyncio.sleep(delay)
            delay *= 2.0

    return last_response or httpx.Response(500)


def _extract_metrics_from_meta_item(item: Dict[str, Any], objective_name: str) -> tuple[int, int]:
    """
    Extracts primary (leads_conversions, clicks) from Meta API insight item.
    - Clicks: Uses inline_link_clicks (Link Clicks) to match Ads Manager & sheets,
              falling back to clicks (All Clicks) only if inline_link_clicks is absent.
    - Leads/Conversions: Evaluates campaign objective & primary action types without double counting.
    """
    inline_clicks = item.get("inline_link_clicks")
    raw_clicks = item.get("clicks")
    try:
        if inline_clicks is not None:
            clicks = int(inline_clicks)
        else:
            clicks = int(raw_clicks or 0)
    except (ValueError, TypeError):
        clicks = 0

    actions = item.get("actions", [])
    action_map: Dict[str, int] = {}
    if isinstance(actions, list):
        for act in actions:
            if isinstance(act, dict):
                a_type = act.get("action_type")
                val = act.get("value")
                if a_type and val is not None:
                    try:
                        action_map[a_type] = int(float(val))
                    except (ValueError, TypeError):
                        pass

    obj_lower = (objective_name or "").lower()
    leads = 0

    if "lead" in obj_lower:
        for k in ["lead", "onsite_conversion.lead_grouped", "offsite_complete_registration_add_meta_leads", "offsite_conversion.fb_pixel_lead", "leadgen.other"]:
            if k in action_map and action_map[k] > 0:
                leads = action_map[k]
                break
    elif "engagement" in obj_lower or "awareness" in obj_lower:
        if "like" in action_map and action_map["like"] > 0:
            leads = action_map["like"]
        elif "onsite_conversion.messaging_conversation_started_7d" in action_map and action_map["onsite_conversion.messaging_conversation_started_7d"] > 0:
            leads = action_map["onsite_conversion.messaging_conversation_started_7d"]
        elif "onsite_conversion.messaging_first_reply" in action_map and action_map["onsite_conversion.messaging_first_reply"] > 0:
            leads = action_map["onsite_conversion.messaging_first_reply"]
        elif "post_engagement" in action_map and action_map["post_engagement"] > 0:
            leads = action_map["post_engagement"]
        elif "page_engagement" in action_map and action_map["page_engagement"] > 0:
            leads = action_map["page_engagement"]
    elif "sale" in obj_lower or "conversion" in obj_lower:
        for k in ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]:
            if k in action_map and action_map[k] > 0:
                leads = action_map[k]
                break

    if leads == 0:
        for k in [
            "lead",
            "onsite_conversion.lead_grouped",
            "onsite_conversion.messaging_conversation_started_7d",
            "onsite_conversion.messaging_first_reply",
            "like",
            "purchase",
            "submit_application",
            "contact",
            "post_engagement"
        ]:
            if k in action_map and action_map[k] > 0:
                leads = action_map[k]
                break

    return leads, clicks


# Action types that map to leads / conversions
LEAD_ACTION_TYPES = {
    "lead",
    "onsite_conversion.lead_grouped",
    "messaging_conversation_started_7d",
    "contact",
    "submit_application",
    "offsite_conversion.fb_pixel_lead",
    "leadgen.other",
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
}


def _map_objective(raw_obj: Optional[str]) -> str:
    """Maps Meta raw objective strings to human-readable UI display strings."""
    if not raw_obj:
        return "Lead Generation"
    obj_upper = str(raw_obj).strip().upper()
    if obj_upper in ["OUTCOME_LEADS", "LEAD_GENERATION"]:
        return "Lead Generation"
    elif obj_upper in ["OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT"]:
        return "Engagement"
    elif obj_upper in ["OUTCOME_TRAFFIC", "LINK_CLICKS"]:
        return "Traffic"
    elif obj_upper in ["OUTCOME_SALES", "CONVERSIONS"]:
        return "Sales"
    elif obj_upper in ["OUTCOME_AWARENESS", "REACH"]:
        return "Awareness"
    else:
        return raw_obj.replace("OUTCOME_", "").replace("_", " ").title()


def _map_status(raw_eff: Optional[str], raw_st: Optional[str]) -> str:
    """
    Maps Meta's effective_status & status to system statuses:
    - Error: WITH_ISSUES, ACCOUNT_ERROR, CAMPAIGN_GROUP_WITH_ISSUES, ADSET_WITH_ISSUES,
             PAYMENT_ERROR, BILLING_ERROR, PENDING_BILLING_INFO, DISAPPROVED
    - Paused: PAUSED, CAMPAIGN_GROUP_PAUSED, ADSET_PAUSED
    - Stopped: ARCHIVED, DELETED
    - Active: ACTIVE, IN_PROCESS, WITH_WARNINGS, PREAPPROVED
    """
    eff = str(raw_eff or raw_st or "").strip().upper()
    error_statuses = {
        "WITH_ISSUES", "ACCOUNT_ERROR", "CAMPAIGN_GROUP_WITH_ISSUES", "ADSET_WITH_ISSUES",
        "PAYMENT_ERROR", "BILLING_ERROR", "PENDING_BILLING_INFO", "DISAPPROVED", "AD_SET_WITH_ISSUES"
    }
    paused_statuses = {"PAUSED", "CAMPAIGN_GROUP_PAUSED", "ADSET_PAUSED", "AD_SET_PAUSED"}
    stopped_statuses = {"ARCHIVED", "DELETED"}
    active_statuses = {"ACTIVE", "IN_PROCESS", "WITH_WARNINGS", "PREAPPROVED"}

    if eff in error_statuses:
        return "Error"
    elif eff in paused_statuses:
        return "Paused"
    elif eff in stopped_statuses:
        return "Stopped"
    elif eff in active_statuses:
        return "Active"
    else:
        return "Active" if str(raw_st or "").strip().upper() == "ACTIVE" else "Paused"


def _parse_budget(daily_b: Any, lifetime_b: Any, adsets_data: Optional[List[Dict[str, Any]]] = None) -> float:
    """
    Parses Meta daily/lifetime budget values.
    Meta returns budget values in cents/micros (e.g. 50000 = 500.00 currency units).
    Divided by 100.
    Checks campaign-level budget first, then sums adset-level budgets if campaign budget is 0/null.
    """
    try:
        if daily_b is not None and float(daily_b) > 0:
            return round(float(daily_b) / 100.0, 2)
        if lifetime_b is not None and float(lifetime_b) > 0:
            return round(float(lifetime_b) / 100.0, 2)
    except (ValueError, TypeError):
        pass

    # ABO (Ad Set Budget Optimization) Fallback: sum active adsets budget
    if adsets_data and isinstance(adsets_data, list):
        total_adset_budget = 0.0
        for adset in adsets_data:
            ad_d = adset.get("daily_budget")
            ad_l = adset.get("lifetime_budget")
            try:
                if ad_d is not None and float(ad_d) > 0:
                    total_adset_budget += float(ad_d) / 100.0
                elif ad_l is not None and float(ad_l) > 0:
                    total_adset_budget += float(ad_l) / 100.0
            except (ValueError, TypeError):
                continue
        if total_adset_budget > 0:
            return round(total_adset_budget, 2)

    return 0.0


async def fetch_meta_insights(
    account_id: str,
    access_token: str,
    date_str: str,
) -> List[Dict[str, Any]]:
    """
    Fetches campaign configurations and daily performance insights from Meta Graph API
    for a given ad account and target date.
    """
    if not account_id or not access_token:
        logger.warning("Meta Ads Fetcher: Missing account_id or access_token")
        return []

    # Format account ID
    formatted_account_id = account_id.strip()
    if not formatted_account_id.startswith("act_"):
        formatted_account_id = f"act_{formatted_account_id}"

    # 1. Fetch live campaign configuration shell metadata
    campaign_config_lookup: Dict[str, Dict[str, Any]] = {}
    async with httpx.AsyncClient(timeout=25.0) as client:
        try:
            camp_url = f"{META_GRAPH_BASE_URL}/{formatted_account_id}/campaigns"
            camp_params = {
                "fields": "id,name,status,effective_status,objective,daily_budget,lifetime_budget,adsets{daily_budget,lifetime_budget}",
                "access_token": access_token,
                "limit": 250,
            }
            camp_res = await _execute_meta_request_with_retry(client, camp_url, camp_params)
            if camp_res.status_code == 200:
                c_data = camp_res.json().get("data", [])
                for c_item in c_data:
                    c_id = str(c_item.get("id", ""))
                    if not c_id:
                        continue
                    adsets_info = c_item.get("adsets", {}).get("data", []) if isinstance(c_item.get("adsets"), dict) else []
                    b_val = _parse_budget(c_item.get("daily_budget"), c_item.get("lifetime_budget"), adsets_info)
                    cfg = {
                        "external_campaign_id": c_id,
                        "campaign_name": c_item.get("name", "Unnamed Meta Campaign"),
                        "status": _map_status(c_item.get("effective_status"), c_item.get("status")),
                        "objective": _map_objective(c_item.get("objective")),
                        "budget_set": b_val,
                    }
                    campaign_config_lookup[c_id] = cfg
                    campaign_config_lookup[cfg["campaign_name"]] = cfg
            else:
                err_body = camp_res.json().get("error", {})
                err_msg = err_body.get("message", camp_res.text)
                raise RuntimeError(f"Meta Graph API error ({formatted_account_id}): {err_msg}")
        except Exception as e:
            logger.warning(f"Failed to fetch campaign configuration map for {formatted_account_id}: {e}")
            if "Session has expired" in str(e) or "access token" in str(e).lower():
                raise RuntimeError(f"Meta API Auth Error ({formatted_account_id}): {e}")

        # 2. Fetch campaign insights metrics for date_str
        insights_url = f"{META_GRAPH_BASE_URL}/{formatted_account_id}/insights"
        time_range = json.dumps({"since": date_str, "until": date_str})
        params = {
            "level": "campaign",
            "fields": "campaign_id,campaign_name,spend,impressions,clicks,reach,inline_link_clicks,actions,frequency",
            "time_range": time_range,
            "access_token": access_token,
            "limit": 100,
        }

        try:
            response = await _execute_meta_request_with_retry(client, insights_url, params)

            if response.status_code != 200:
                err_body = response.json().get("error", {})
                err_msg = err_body.get("message", response.text)
                logger.error(f"Meta Graph API error for {formatted_account_id}: {err_msg}")
                raise RuntimeError(f"Meta Graph API error ({formatted_account_id}): {err_msg}")

            data = response.json().get("data", [])

            # If no insight data for date_str, query historical maximum preset
            if not data:
                logger.info(f"Meta Graph API returned 0 campaign insights for {formatted_account_id} on {date_str}. Querying history...")
                params_max = dict(params)
                params_max.pop("time_range", None)
                params_max["date_preset"] = "maximum"
                res_max = await _execute_meta_request_with_retry(client, insights_url, params_max)
                if res_max.status_code == 200:
                    data = res_max.json().get("data", [])

            results: List[Dict[str, Any]] = []
            processed_ids = set()

            for item in data:
                c_id = str(item.get("campaign_id", ""))
                c_name = str(item.get("campaign_name", "Unnamed Meta Campaign"))
                processed_ids.add(c_id)
                processed_ids.add(c_name)

                spend = float(item.get("spend", 0.0))
                impressions = int(item.get("impressions", 0))
                reach = int(item.get("reach", 0))
                avg_freq = float(item.get("frequency", 1.0))

                # Match parent configuration shell
                cfg = campaign_config_lookup.get(c_id) or campaign_config_lookup.get(c_name) or {}
                obj_name = cfg.get("objective", "Lead Generation")

                # Extract objective-aware conversions/leads and link clicks
                leads, clicks = _extract_metrics_from_meta_item(item, obj_name)
                cpl_cpa = round(spend / leads, 2) if leads > 0 else 0.0

                results.append({
                    "external_campaign_id": c_id,
                    "campaign_name": cfg.get("campaign_name", c_name),
                    "platform": "Meta",
                    "objective": cfg.get("objective", "Lead Generation"),
                    "budget_set": cfg.get("budget_set", 0.0),
                    "status": cfg.get("status", "Active"),
                    "ad_spend": spend,
                    "impressions": impressions,
                    "clicks": clicks,
                    "reach": reach,
                    "leads_conversions": leads,
                    "cpl_cpa": cpl_cpa,
                    "avg_frequency": avg_freq,
                    "remarks": f"Auto-synced from Meta Graph API ({date_str})",
                })

            # Include campaigns from campaign_config_lookup that were not in insights (with 0 metrics for date_str)
            for c_id, cfg in campaign_config_lookup.items():
                if c_id in processed_ids or cfg.get("campaign_name") in processed_ids:
                    continue
                if not c_id.isdigit():
                    continue
                processed_ids.add(c_id)
                processed_ids.add(cfg["campaign_name"])

                results.append({
                    "external_campaign_id": c_id,
                    "campaign_name": cfg["campaign_name"],
                    "platform": "Meta",
                    "objective": cfg["objective"],
                    "budget_set": cfg["budget_set"],
                    "status": cfg["status"],
                    "ad_spend": 0.0,
                    "impressions": 0,
                    "clicks": 0,
                    "reach": 0,
                    "leads_conversions": 0,
                    "cpl_cpa": 0.0,
                    "avg_frequency": 1.0,
                    "remarks": f"Synced campaign configuration from Meta ({date_str})",
                })

            logger.info(f"Successfully fetched {len(results)} campaign insights/configs from Meta for {formatted_account_id}")
            return results

        except Exception as e:
            logger.error(f"Exception while fetching Meta Ads insights: {e}")
            raise

