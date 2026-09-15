"""CRM Meta Page and Account management — multi-page storage with Fernet encryption."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.config import settings
from app.core.encryption import decrypt_string, encrypt_string
from app.database import get_database

logger = logging.getLogger("app.crm.meta")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable.")
    return db


async def get_page_credentials(page_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Resolve Meta credentials for a specific Page ID.

    1. Checks MongoDB `crm_meta_pages` for dynamic multi-page configurations.
    2. Falls back to static environment variables (CRM_META_PAGE_ID, CRM_META_PAGE_ACCESS_TOKEN).
    """
    db = _db()
    pid = str(page_id).strip() if page_id else ""

    if pid:
        doc = await db.crm_meta_pages.find_one({"page_id": pid, "is_active": {"$ne": False}}, {"_id": 0})
        if doc:
            token = decrypt_string(doc.get("access_token_encrypted") or "")
            secret = decrypt_string(doc.get("app_secret_encrypted") or "") or settings.CRM_META_APP_SECRET
            return {
                "page_id": doc.get("page_id"),
                "page_name": doc.get("page_name") or "Connected Page",
                "access_token": token,
                "app_secret": secret,
                "workspace_id": doc.get("workspace_id"),
                "default_campaign": doc.get("default_campaign"),
                "is_env": False,
            }

    # Fallback to .env configuration
    env_page = (settings.CRM_META_PAGE_ID or "").strip()
    env_token = (settings.CRM_META_PAGE_ACCESS_TOKEN or "").strip()
    env_secret = (settings.CRM_META_APP_SECRET or "").strip()

    if env_token and (not pid or pid == env_page):
        return {
            "page_id": env_page or pid,
            "page_name": "Default Environment Page",
            "access_token": env_token,
            "app_secret": env_secret,
            "workspace_id": None,
            "default_campaign": None,
            "is_env": True,
        }

    return None


async def list_connected_pages() -> List[Dict[str, Any]]:
    """List all connected Meta pages (database and .env), with tokens masked."""
    db = _db()
    cursor = db.crm_meta_pages.find({}, {"_id": 0}).sort("created_at", -1)
    pages: List[Dict[str, Any]] = []
    async for doc in cursor:
        token = decrypt_string(doc.get("access_token_encrypted") or "")
        token_preview = f"{token[:8]}…{token[-4:]}" if len(token) > 12 else "configured"
        pages.append({
            "id": doc.get("id"),
            "page_id": doc.get("page_id"),
            "page_name": doc.get("page_name") or "Unnamed Page",
            "workspace_id": doc.get("workspace_id"),
            "default_campaign": doc.get("default_campaign"),
            "is_active": bool(doc.get("is_active", True)),
            "token_preview": token_preview,
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
            "is_env": False,
        })

    env_page = (settings.CRM_META_PAGE_ID or "").strip()
    env_token = (settings.CRM_META_PAGE_ACCESS_TOKEN or "").strip()
    if env_page or env_token:
        # Check if already present in database records
        if not any(p["page_id"] == env_page for p in pages):
            pages.insert(0, {
                "id": "env_page",
                "page_id": env_page,
                "page_name": "Default Page (.env)",
                "workspace_id": None,
                "default_campaign": None,
                "is_active": bool(env_page and env_token),
                "token_preview": f"{env_token[:8]}…{env_token[-4:]}" if len(env_token) > 12 else "configured",
                "created_at": "",
                "updated_at": "",
                "is_env": True,
            })
    return pages


async def upsert_connected_page(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    """Connect or update a Meta Facebook Page with encrypted access token."""
    db = _db()
    page_id = str(payload.get("page_id") or "").strip()
    page_name = str(payload.get("page_name") or "Facebook Page").strip()
    access_token = str(payload.get("access_token") or "").strip()
    app_secret = str(payload.get("app_secret") or "").strip()
    workspace_id = str(payload.get("workspace_id") or "").strip() or None
    default_campaign = str(payload.get("default_campaign") or "").strip() or None

    if not page_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="page_id is required.")

    existing = await db.crm_meta_pages.find_one({"page_id": page_id})
    now = _now()

    if not access_token:
        if not existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="access_token is required for new page.")
        enc_token = existing.get("access_token_encrypted")
    else:
        enc_token = encrypt_string(access_token)

    enc_secret = encrypt_string(app_secret) if app_secret else (existing.get("app_secret_encrypted") if existing else None)

    doc_id = existing.get("id") if existing else f"mp_{uuid.uuid4().hex[:12]}"
    update_data = {
        "id": doc_id,
        "page_id": page_id,
        "page_name": page_name,
        "access_token_encrypted": enc_token,
        "app_secret_encrypted": enc_secret,
        "workspace_id": workspace_id,
        "default_campaign": default_campaign,
        "is_active": bool(payload.get("is_active", True)),
        "updated_at": now,
        "updated_by": user.get("id"),
    }
    if not existing:
        update_data["created_at"] = now
        update_data["created_by"] = user.get("id")
        await db.crm_meta_pages.insert_one(update_data)
    else:
        await db.crm_meta_pages.update_one({"page_id": page_id}, {"$set": update_data})

    return {
        "id": doc_id,
        "page_id": page_id,
        "page_name": page_name,
        "workspace_id": workspace_id,
        "default_campaign": default_campaign,
        "is_active": update_data["is_active"],
    }


async def delete_connected_page(page_id: str, user: Dict[str, Any]) -> None:
    """Disconnect a Meta page."""
    db = _db()
    res = await db.crm_meta_pages.delete_one({"page_id": page_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found.")
