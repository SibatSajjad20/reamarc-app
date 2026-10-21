"""CRM SLA poller — 60-minute uncontacted nags only."""
from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger("app.crm.sla")


async def start_crm_sla_scheduler() -> None:
    from app.services.crm_assignment import run_sla_tick
    from app.core.job_locks import job_lease
    from app.core.tenant import for_each_active_company
    from app.config import settings

    logger.info("[CRM] SLA scheduler started (60s tick).")
    while True:
        try:
            async with job_lease("crm_sla_tick", ttl_seconds=60) as acquired:
                if acquired:
                    if getattr(settings, "MULTI_TENANT_ENABLED", False):
                        await for_each_active_company(lambda comp: run_sla_tick())
                    else:
                        await run_sla_tick()
        except asyncio.CancelledError:
            raise
        except Exception as err:
            logger.warning("[CRM] SLA tick failed: %s", err)
        await asyncio.sleep(60)
