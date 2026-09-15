"""Google Ads Lead Form Extension adapter."""
from __future__ import annotations

from typing import Any, Dict, Optional

from app.services import crm_ingest
from app.services.crm_adapters.base import BaseLeadAdapter


class GoogleAdsLeadAdapter(BaseLeadAdapter):
    platform_name = "google_ads"

    async def process_payload(
        self,
        payload: Dict[str, Any],
        *,
        headers: Optional[Dict[str, str]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await crm_ingest.process_google_lead_payload(payload)
