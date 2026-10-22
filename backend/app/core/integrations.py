"""
backend/app/core/integrations.py
Multi-tenant integration resolver.
Resolves credentials for external services (SMTP, Google Drive, Meta Ingest, etc.)
scoped strictly to the current or specified company.
Non-Reamarc tenants never fall back to Reamarc's default env credentials.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.config import settings
from app.core.tenant import get_global_db, get_tenant_context

logger = logging.getLogger("app.integrations")

REAMARC_TENANT_IDS = {"company_reamarc", "tnt_comp_a"}


def is_reamarc_company(cid: Optional[str]) -> bool:
    """True for Reamarc tenant ids, or when cid is missing and multi-tenant is off."""
    if cid is not None and str(cid).strip() in REAMARC_TENANT_IDS:
        return True
    if cid is None and not getattr(settings, "MULTI_TENANT_ENABLED", False):
        return True
    return False


def current_company_id() -> Optional[str]:
    ctx = get_tenant_context()
    return ctx.company_id if ctx else None


async def get_integration(
    company: Optional[Dict[str, Any]] = None,
    kind: str = "smtp",
) -> Optional[Dict[str, Any]]:
    """
    Retrieves the integration configuration for the specified company and kind.
    If company is not passed, attempts to resolve it from the active TenantContext.

    Rules:
    - For Reamarc (or single-tenant legacy mode): falls back to env settings.
    - For other tenants: strictly queries the `company_integrations` global collection.
      If not found or not connected, returns None / connected=False.
    """
    cid: Optional[str] = None
    if company:
        cid = company.get("id") or str(company.get("_id"))
    else:
        ctx = get_tenant_context()
        if ctx:
            cid = ctx.company_id

    if is_reamarc_company(cid):
        return _get_reamarc_env_integration(kind)

    # Scoped non-Reamarc tenant lookup
    gdb = get_global_db()
    if gdb is None:
        return None

    try:
        doc = await gdb.company_integrations.find_one({
            "company_id": cid,
            "kind": kind,
            "enabled": {"$ne": False},
        })
        if not doc or not doc.get("connected"):
            return None
        return doc
    except Exception as e:
        logger.error(f"Error fetching integration '{kind}' for company '{cid}': {e}")
        return None


def _get_reamarc_env_integration(kind: str) -> Optional[Dict[str, Any]]:
    """Returns integration dictionary from global environment variables for Reamarc."""
    if kind == "smtp":
        has_smtp = bool(settings.SMTP_HOST and settings.SMTP_USER)
        has_brevo = bool(settings.BREVO_API_KEY)
        has_sendgrid = bool(settings.SENDGRID_API_KEY)
        if not (has_smtp or has_brevo or has_sendgrid):
            return None
        return {
            "kind": "smtp",
            "connected": True,
            "host": settings.SMTP_HOST,
            "port": settings.SMTP_PORT,
            "user": settings.SMTP_USER,
            "password": settings.SMTP_PASSWORD,
            "from_name": settings.SMTP_FROM_NAME,
            "from_email": settings.SMTP_FROM_EMAIL or settings.SMTP_USER,
            "use_tls": getattr(settings, "SMTP_USE_TLS", True),
        }

    if kind == "google_drive":
        # Google Drive environment integration
        client_email = getattr(settings, "GOOGLE_CLIENT_EMAIL", None)
        private_key = getattr(settings, "GOOGLE_PRIVATE_KEY", None)
        folder_id = getattr(settings, "GOOGLE_DRIVE_FOLDER_ID", None)
        if not (client_email and private_key):
            return None
        return {
            "kind": "google_drive",
            "connected": True,
            "client_email": client_email,
            "private_key": private_key,
            "folder_id": folder_id,
        }

    return None


async def is_integration_connected(
    company: Optional[Dict[str, Any]] = None,
    kind: str = "smtp",
) -> bool:
    """Returns True if the requested integration is connected and active for the company."""
    integ = await get_integration(company=company, kind=kind)
    if not integ:
        return False
    return bool(integ.get("connected", False))
