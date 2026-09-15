"""CRM SLA poller — 15/60 minute uncontacted nags."""
from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger("app.crm.sla")


async def start_crm_sla_scheduler() -> None:
    from app.services.crm_assignment import run_sla_tick

    logger.info("[CRM] SLA scheduler started (60s tick).")
    while True:
        try:
            await run_sla_tick()
        except asyncio.CancelledError:
            raise
        except Exception as err:
            logger.warning("[CRM] SLA tick failed: %s", err)
        await asyncio.sleep(60)
