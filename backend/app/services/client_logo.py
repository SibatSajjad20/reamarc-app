"""Client workspace logo helpers (folder, sanitise, initials, audit)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status

from app.config import settings

WORKSPACE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
LEGAL_SUFFIXES = {"llc", "ltd", "inc", "pvt", "co"}


def default_workspace_initials(name: str) -> str:
    tokens = re.split(r"[\s\W_]+", (name or "").strip())
    words = [t for t in tokens if t and t[0].isalpha()]
    while len(words) > 1 and words[-1].lower().rstrip(".") in LEGAL_SUFFIXES:
        words.pop()
    if not words:
        return "?"
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[-1][0]).upper()


def sanitize_client_logo_url(url: Any) -> Optional[str]:
    cloud = (settings.CLOUDINARY_CLOUD_NAME or "").strip()
    if not isinstance(url, str) or not cloud:
        return None
    prefix = f"https://res.cloudinary.com/{cloud}/image/upload/"
    if url.startswith(prefix):
        return url
    return None


def client_logo_folder(workspace_id: str, company_id: Optional[str] = None) -> str:
    if not WORKSPACE_ID_RE.fullmatch(workspace_id or ""):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid workspace id.")
    if getattr(settings, "MULTI_TENANT_ENABLED", False):
        cid = company_id
        if not cid:
            try:
                from app.core.tenant import get_tenant_context
                ctx = get_tenant_context()
                if ctx and ctx.company_id:
                    cid = ctx.company_id
            except Exception:
                pass
        if not cid:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Multi-company tenant context required for client logos.",
            )
        return f"companies/{cid}/clients/{workspace_id}/logo"
    return f"reamarc/clients/{workspace_id}/logo"


def can_destroy_client_logo(public_id: Optional[str], workspace_id: str, company_id: Optional[str] = None) -> bool:
    if not public_id:
        return False
    try:
        folder = client_logo_folder(workspace_id, company_id=company_id)
        return str(public_id).startswith(folder + "/")
    except HTTPException:
        return False


async def record_workspace_audit(
    db,
    *,
    action: str,
    workspace_id: str,
    workspace_name: str,
    actor: dict,
) -> None:
    await db.workspace_audit.insert_one(
        {
            "id": str(uuid.uuid4()),
            "action": action,
            "workspace_id": workspace_id,
            "workspace_name": workspace_name,
            "actor_user_id": actor.get("id"),
            "actor_name": actor.get("full_name") or actor.get("name"),
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )
