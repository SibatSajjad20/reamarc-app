"""
Google Ads API Fetcher Service.
Pulls daily campaign metrics using Google Ads REST API v25 with OAuth2 token refresh support.
"""

import logging
import asyncio
import httpx
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

GOOGLE_ADS_API_VERSION = "v25"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


async def _post_google_ads_with_retry(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    json_body: Dict[str, Any],
    max_retries: int = 3,
) -> httpx.Response:
    """Executes Google Ads API POST request with exponential backoff retries."""
    delay = 1.0
    last_response = None
    for attempt in range(1, max_retries + 1):
        try:
            res = await client.post(url, headers=headers, json=json_body)
            if res.status_code == 200:
                return res
            last_response = res
            if res.status_code in (429, 500, 502, 503, 504):
                logger.warning(f"Google Ads API returned status {res.status_code} (attempt {attempt}/{max_retries}). Retrying in {delay}s...")
                await asyncio.sleep(delay)
                delay *= 2.0
            else:
                return res
        except (httpx.TimeoutException, httpx.NetworkError) as err:
            logger.warning(f"Network error calling Google Ads API (attempt {attempt}/{max_retries}): {err}")
            if attempt == max_retries:
                raise
            await asyncio.sleep(delay)
            delay *= 2.0

    return last_response or httpx.Response(500)



async def refresh_google_access_token(
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> Optional[str]:
    """Exchanges refresh token for a new Google OAuth2 access token."""
    if not all([client_id, client_secret, refresh_token]):
        return None

    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(GOOGLE_TOKEN_URL, data=payload)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("access_token")
            else:
                logger.error(f"Failed to refresh Google token: {resp.text}")
                return None
    except Exception as e:
        logger.error(f"Exception during Google token refresh: {e}")
        return None


def _map_google_status(raw_status: Optional[str]) -> str:
    """
    Maps Google Ads campaign status strings to standard UI statuses:
    - ENABLED -> "Active"
    - PAUSED -> "Paused"
    - REMOVED -> "Stopped"
    """
    if not raw_status:
        return "Active"
    st_upper = str(raw_status).strip().upper()
    if st_upper == "ENABLED":
        return "Active"
    elif st_upper == "PAUSED":
        return "Paused"
    elif st_upper == "REMOVED":
        return "Stopped"
    else:
        return "Active" if st_upper == "ENABLED" else "Paused"


async def fetch_google_insights(
    account_id: str,
    access_token: str,
    developer_token: str,
    date_str: str,
    client_id: Optional[str] = None,
    client_secret: Optional[str] = None,
    refresh_token: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetches campaign metrics for a target date using Google Ads REST API v25.
    Auto-refreshes OAuth2 access token if client_id, client_secret, and refresh_token are provided.
    """
    if not account_id:
        logger.warning("Google Ads Fetcher: Missing account_id")
        return []

    # Clean customer ID (remove dashes)
    customer_id = account_id.replace("-", "").strip()

    # Always attempt token refresh if OAuth parameters are provided to avoid 401 Expiration
    active_token = access_token
    if client_id and client_secret and refresh_token:
        refreshed = await refresh_google_access_token(client_id, client_secret, refresh_token)
        if refreshed:
            active_token = refreshed

    if not active_token:
        logger.warning(f"Google Ads Fetcher: No valid access token for customer {customer_id}")
        return []

    url = f"https://googleads.googleapis.com/{GOOGLE_ADS_API_VERSION}/customers/{customer_id}/googleAds:searchStream"

    query = (
        f"SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, "
        f"metrics.clicks, metrics.conversions FROM campaign WHERE segments.date = '{date_str}'"
    )

    headers = {
        "Authorization": f"Bearer {active_token}",
        "developer-token": developer_token or "",
        "Content-Type": "application/json",
    }

    body = {"query": query}

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await _post_google_ads_with_retry(client, url, headers, body)


        if response.status_code != 200:
            err_detail = response.text
            try:
                err_json = response.json()
                if isinstance(err_json, list) and len(err_json) > 0:
                    err_obj = err_json[0].get("error", {})
                    details = err_obj.get("details", [])
                    if details and "errors" in details[0]:
                        messages = [e.get("message", "") for e in details[0]["errors"]]
                        err_detail = " | ".join(messages)
                    else:
                        err_detail = err_obj.get("message", err_detail)
            except Exception:
                pass

            logger.error(f"Google Ads API error for customer {customer_id} (Status {response.status_code}): {err_detail}")
            return []

        results: List[Dict[str, Any]] = []
        batch_list = response.json()

        if isinstance(batch_list, list):
            for batch in batch_list:
                results_arr = batch.get("results", [])
                for row in results_arr:
                    campaign = row.get("campaign", {})
                    metrics = row.get("metrics", {})

                    c_id = str(campaign.get("id", ""))
                    c_name = str(campaign.get("name", "Unnamed Google Campaign"))
                    c_status_raw = campaign.get("status", "ENABLED")
                    c_status = _map_google_status(c_status_raw)

                    cost_micros = float(metrics.get("costMicros", 0.0))
                    spend = round(cost_micros / 1_000_000.0, 2)
                    impressions = int(metrics.get("impressions", 0))
                    clicks = int(metrics.get("clicks", 0))
                    conversions = int(float(metrics.get("conversions", 0.0)))

                    cpl_cpa = round(spend / conversions, 2) if conversions > 0 else 0.0

                    results.append({
                        "external_campaign_id": c_id,
                        "campaign_name": c_name,
                        "platform": "Google",
                        "status": c_status,
                        "ad_spend": spend,
                        "impressions": impressions,
                        "clicks": clicks,
                        "reach": 0,  # Reach is not directly returned by Google Ads campaign search
                        "leads_conversions": conversions,
                        "cpl_cpa": cpl_cpa,
                        "avg_frequency": 1.0,
                        "remarks": f"Auto-synced from Google Ads API ({date_str})",
                    })

        logger.info(f"Successfully fetched {len(results)} campaign insights from Google Ads for customer {customer_id}")
        return results

    except Exception as e:
        logger.error(f"Exception while fetching Google Ads insights: {e}")
        return []
