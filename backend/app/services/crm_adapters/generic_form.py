"""Generic Webhook Adapter for WordPress, Elementor, CF7, and web landing pages."""
from __future__ import annotations

from typing import Any, Dict, Optional

from app.services import crm_ingest
from app.services.crm_adapters.base import BaseLeadAdapter


class GenericFormAdapter(BaseLeadAdapter):
    platform_name = "wordpress"

    async def process_payload(
        self,
        payload: Dict[str, Any],
        *,
        headers: Optional[Dict[str, str]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        source = (context or {}).get("source") or {}
        raw_token = (context or {}).get("token") or ""
        source_lbl = str(payload.get("source") or source.get("default_source") or "website")

        attribution = crm_ingest.extract_attribution(payload, default_platform=source_lbl)

        return await crm_ingest.ingest_lead(
            fields=payload,
            source_label=source_lbl,
            campaign=payload.get("campaign") or source.get("default_campaign"),
            external_id=payload.get("external_id") or payload.get("id"),
            raw_payload=payload,
            ingest_source_id=source.get("id"),
            attribution=attribution,
        )
