"""Direct-from-Drive downloads, so file bytes skip this server (Render bills outbound bandwidth).

How it works
- When someone who is already allowed to download a Drive-backed file asks for it, we add a
  temporary "anyone with the link can view" permission to THAT ONE FILE (not its folder, not
  discoverable in search) and send the browser to Google's own download URL.
- The grant is recorded in the global `drive_link_shares` collection and removed after
  DRIVE_DIRECT_TTL_HOURS by `revoke_expired_shares` (scheduler + opportunistic sweep).
- If a file was already shared publicly before we touched it, we never remove that sharing.
- Any failure (Drive admin policy blocks link sharing, quota, Drive not configured) returns None and
  callers fall back to the old proxy stream, so downloads keep working.

The org Drive token is never sent to a browser: a Drive OAuth token cannot be limited to one file,
so handing it out would expose the whole Drive.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from urllib.parse import quote

logger = logging.getLogger(__name__)

COLLECTION = "drive_link_shares"
REUSE_MARGIN = timedelta(minutes=30)


def direct_url(file_id: str) -> str:
    # confirm=t skips Google's "can't scan large files for viruses" page.
    return f"https://drive.usercontent.google.com/download?id={quote(file_id, safe='')}&export=download&confirm=t"


def _enabled() -> bool:
    from app.config import settings
    from app.services import google_drive_service as gdrive

    return bool(getattr(settings, "DRIVE_DIRECT_DOWNLOADS", False)) and gdrive.configured()


def _ttl() -> timedelta:
    from app.config import settings

    hours = int(getattr(settings, "DRIVE_DIRECT_TTL_HOURS", 6) or 6)
    return timedelta(hours=max(1, min(hours, 48)))


def _grant_anyone_reader(file_id: str) -> Tuple[str, bool]:
    """Returns (permission_id, preexisting). Blocking; run in a thread."""
    from app.services import google_drive_service as gdrive

    svc = gdrive._service()
    perms = (
        svc.permissions()
        .list(fileId=file_id, fields="permissions(id,type,role)", supportsAllDrives=True)
        .execute()
        .get("permissions", [])
    )
    for p in perms:
        if p.get("type") == "anyone":
            return str(p.get("id")), True
    created = (
        svc.permissions()
        .create(
            fileId=file_id,
            body={"type": "anyone", "role": "reader", "allowFileDiscovery": False},
            fields="id",
            supportsAllDrives=True,
            sendNotificationEmail=False,
        )
        .execute()
    )
    return str(created.get("id")), False


def _remove_permission(file_id: str, permission_id: str) -> None:
    from app.services import google_drive_service as gdrive

    try:
        gdrive._service().permissions().delete(
            fileId=file_id, permissionId=permission_id, supportsAllDrives=True
        ).execute()
    except Exception as exc:  # already gone / file deleted
        if "404" not in str(exc):
            raise


def _gdb():
    from app.core.tenant import get_global_db

    return get_global_db()


async def direct_download_url(file_id: str, *, company_id: str = "") -> Optional[str]:
    """Google download URL for one Drive file the caller is already allowed to download, or None."""
    clean = str(file_id or "").strip()
    if not clean or not _enabled():
        return None
    gdb = _gdb()
    if gdb is None:
        return None
    now = datetime.now(timezone.utc)
    try:
        share = await gdb[COLLECTION].find_one({"file_id": clean})
        if share and (share.get("preexisting") or _aware(share.get("expires_at")) > now + REUSE_MARGIN):
            return direct_url(clean)
        perm_id, preexisting = await asyncio.to_thread(_grant_anyone_reader, clean)
        await gdb[COLLECTION].update_one(
            {"file_id": clean},
            {
                "$set": {
                    "permission_id": perm_id,
                    "preexisting": preexisting,
                    "expires_at": now + _ttl(),
                    "updated_at": now,
                },
                "$setOnInsert": {"file_id": clean, "company_id": company_id or None, "created_at": now},
            },
            upsert=True,
        )
    except Exception as exc:
        logger.warning("Direct Drive download unavailable for %s, falling back to proxy: %s", clean, exc)
        return None
    return direct_url(clean)


def _aware(value) -> datetime:
    if not isinstance(value, datetime):
        return datetime.min.replace(tzinfo=timezone.utc)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def revoke_expired_shares(limit: int = 200) -> int:
    """Remove temporary link sharing whose window has passed. Safe to run often."""
    gdb = _gdb()
    if gdb is None:
        return 0
    now = datetime.now(timezone.utc)
    removed = 0
    for _ in range(limit):
        doc = await gdb[COLLECTION].find_one_and_delete(
            {"expires_at": {"$lt": now}, "preexisting": {"$ne": True}}
        )
        if not doc:
            break
        try:
            await asyncio.to_thread(_remove_permission, doc["file_id"], doc["permission_id"])
            removed += 1
        except Exception as exc:
            logger.warning("Could not remove temporary Drive link for %s; will retry: %s", doc.get("file_id"), exc)
            doc["expires_at"] = now  # retry next sweep
            doc.pop("_id", None)
            await gdb[COLLECTION].update_one({"file_id": doc["file_id"]}, {"$setOnInsert": doc}, upsert=True)
            break
    return removed


async def start_drive_share_sweeper(interval_seconds: int = 1800) -> None:
    while True:
        try:
            from app.core.job_locks import job_lease

            async with job_lease("drive_link_share_sweep", ttl_seconds=600) as acquired:
                if acquired:
                    await revoke_expired_shares()
        except asyncio.CancelledError:
            break
        except Exception as err:
            logger.error("Drive link share sweep failed: %s", err)
        await asyncio.sleep(interval_seconds)
