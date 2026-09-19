"""Authenticated upload storage with path-traversal protection.

Files are dual-written to local disk (fast local/dev) and MongoDB GridFS
(survives Render/ephemeral redeploys). Downloads prefer disk, then GridFS.
"""
from __future__ import annotations

import io
import logging
import mimetypes
import os
import re
from pathlib import Path
from typing import AsyncIterator, Optional, Tuple
from dataclasses import dataclass

from fastapi import HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)

_GRIDFS_BUCKET = "uploads"
VIEWABLE_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt"}


@dataclass(frozen=True)
class UploadAuthz:
    workspace_id: Optional[str] = None
    uploaded_by: Optional[str] = None


def _guess_media_type(filename: str, fallback_meta: Optional[str] = None) -> str:
    if fallback_meta and fallback_meta != "application/octet-stream":
        return fallback_meta
    guessed, _ = mimetypes.guess_type(filename)
    if guessed:
        return guessed
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return "application/pdf"
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        return f"image/{ext.lstrip('.')}"
    return "application/octet-stream"


def uploads_root() -> Path:
    """
    Root directory for on-disk uploads.
    Prefer UPLOADS_DIR (Render persistent disk) when set; otherwise backend/uploads.
    """
    override = (os.getenv("UPLOADS_DIR") or "").strip()
    if override:
        return Path(override).expanduser().resolve()
    # backend/app/core/uploads.py → backend/uploads
    return Path(__file__).resolve().parents[2] / "uploads"


def normalize_upload_key(file_path: str) -> str:
    """Normalize a stored proposal/deliverable URL to a GridFS/disk-relative key."""
    raw = (file_path or "").replace("\\", "/").strip()
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    # Absolute backend URLs → path only
    if raw.startswith("http://") or raw.startswith("https://"):
        try:
            from urllib.parse import urlparse

            parsed = urlparse(raw)
            raw = parsed.path or ""
        except Exception:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    relative = raw
    if relative.startswith("/uploads/"):
        relative = relative[len("/uploads/") :]
    elif relative.startswith("uploads/"):
        relative = relative[len("uploads/") :]
    relative = relative.lstrip("/")

    if not relative or Path(relative).is_absolute() or ".." in Path(relative).parts:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    return relative.replace("\\", "/")


def resolve_upload_file(file_path: str) -> Path:
    """
    Resolve a user-supplied path under /uploads to a real on-disk file.
    Rejects traversal and missing files. Prefer open_upload_response() for downloads
    so GridFS fallbacks work after ephemeral disk wipes.
    """
    relative = normalize_upload_key(file_path)
    base = uploads_root().resolve()
    full = (base / relative).resolve()
    try:
        full.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    if not full.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    return full


def _display_name(raw_filename: str, fallback: Optional[str] = None) -> str:
    name = fallback or raw_filename
    return re.sub(r"^[a-f0-9]{10}_", "", name)


def content_disposition_header(display: str, *, inline: bool) -> str:
    """Build a header-safe Content-Disposition (no CR/LF/quotes)."""
    from urllib.parse import quote

    cleaned = re.sub(r'[\r\n"]+', "", str(display or "")).strip() or "download"
    cleaned = cleaned[:180]
    disposition = "inline" if inline else "attachment"
    return f"{disposition}; filename=\"{cleaned}\"; filename*=UTF-8''{quote(cleaned)}"


def _gridfs_bucket(db) -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(db, bucket_name=_GRIDFS_BUCKET)


async def _delete_gridfs_by_name(bucket: AsyncIOMotorGridFSBucket, key: str) -> None:
    try:
        cursor = bucket.find({"filename": key})
        async for doc in cursor:
            file_id = getattr(doc, "_id", None)
            if file_id is None and isinstance(doc, dict):
                file_id = doc.get("_id")
            if file_id is not None:
                await bucket.delete(file_id)
    except PyMongoError as exc:
        logger.warning("GridFS delete failed for %s: %s", key, exc)


async def save_upload_bytes(
    db,
    *,
    relative_key: str,
    content: bytes,
    original_name: str,
    content_type: Optional[str] = None,
    extra_metadata: Optional[dict] = None,
) -> str:
    """
    Persist upload to MongoDB GridFS (required when DB is up) and best-effort disk cache.
    Returns public path `/uploads/<relative_key>`.

    GridFS is the source of truth so Render/ephemeral redeploys cannot wipe proposals.
    If Mongo is available and GridFS write fails, the upload fails — we never silently
    accept a disk-only save that would break after the next deploy.
    """
    key = normalize_upload_key(
        relative_key
        if relative_key.startswith("uploads/") or relative_key.startswith("/uploads/")
        else f"/uploads/{relative_key.lstrip('/')}"
    )
    stored_path = f"/uploads/{key}"

    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable — cannot store upload durably. Try again shortly.",
        )

    try:
        bucket = _gridfs_bucket(db)
        await _delete_gridfs_by_name(bucket, key)
        await bucket.upload_from_stream(
            key,
            io.BytesIO(content),
            metadata={
                "original_name": original_name,
                "content_type": content_type or "application/octet-stream",
                "stored_path": stored_path,
                **{k: v for k, v in (extra_metadata or {}).items() if v},
            },
        )
        # Verify bytes are readable before telling the client the upload succeeded.
        probe = await bucket.open_download_stream_by_name(key)
        try:
            await probe.read(1)
        finally:
            try:
                probe.close()
            except Exception:
                pass
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("GridFS upload failed for %s: %s", key, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to store file in durable storage. Please try uploading again.",
        ) from exc

    # Best-effort local/cache disk write (optional; never the only copy).
    try:
        base = uploads_root()
        full = base / key
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(content)
    except Exception as exc:
        logger.warning("Disk cache write failed for %s (GridFS OK): %s", key, exc)

    return stored_path


async def migrate_disk_uploads_to_gridfs(db) -> Tuple[int, int]:
    """Copy any on-disk uploads missing from GridFS. Returns (migrated, skipped)."""
    if db is None:
        return 0, 0

    base = uploads_root()
    if not base.is_dir():
        return 0, 0

    bucket = _gridfs_bucket(db)
    migrated = 0
    skipped = 0

    for path in base.rglob("*"):
        if not path.is_file():
            continue
        try:
            key = path.relative_to(base).as_posix()
        except ValueError:
            continue

        try:
            existing = await bucket.find({"filename": key}).to_list(1)
            if existing:
                skipped += 1
                continue
            content = path.read_bytes()
            await bucket.upload_from_stream(
                key,
                io.BytesIO(content),
                metadata={
                    "original_name": _display_name(path.name),
                    "content_type": "application/octet-stream",
                    "stored_path": f"/uploads/{key}",
                    "migrated_from_disk": True,
                },
            )
            migrated += 1
        except Exception as exc:
            logger.warning("Failed migrating %s to GridFS: %s", path, exc)

    if migrated:
        logger.info("Migrated %s upload file(s) from disk to GridFS (%s already present)", migrated, skipped)
    return migrated, skipped


async def get_upload_authz(db, file_path: str) -> UploadAuthz:
    """Return GridFS workspace_id / uploaded_by metadata when present."""
    if db is None:
        return UploadAuthz()
    try:
        key = normalize_upload_key(file_path)
    except HTTPException:
        return UploadAuthz()
    try:
        bucket = _gridfs_bucket(db)
        grid_out = await bucket.open_download_stream_by_name(key)
        try:
            meta = getattr(grid_out, "metadata", None) or {}
            if not isinstance(meta, dict):
                return UploadAuthz()
            ws = meta.get("workspace_id")
            uploader = meta.get("uploaded_by")
            return UploadAuthz(
                workspace_id=str(ws).strip() if ws else None,
                uploaded_by=str(uploader).strip() if uploader else None,
            )
        finally:
            try:
                grid_out.close()
            except Exception:
                pass
    except Exception:
        return UploadAuthz()
    return UploadAuthz()


async def get_upload_workspace_id(db, file_path: str) -> Optional[str]:
    """Return GridFS workspace_id metadata when present (legacy files return None)."""
    return (await get_upload_authz(db, file_path)).workspace_id


def authorize_upload_key(
    current_user: dict,
    workspace_id: Optional[str],
    uploaded_by: Optional[str] = None,
) -> None:
    """Enforce workspace membership when stamped; otherwise uploader, leads, or management."""
    from app.core.security import assert_workspace_access, _MANAGEMENT_ROLES
    from app.models.user import UserRole

    if workspace_id:
        assert_workspace_access(current_user, workspace_id)
        return

    role = current_user.get("role")
    if role in _MANAGEMENT_ROLES or role in (UserRole.TEAM_LEAD.value, "team_lead"):
        return
    uid = str(current_user.get("id") or "")
    if uploaded_by and uid and str(uploaded_by) == uid:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized to access this file.",
    )


async def authorize_stored_upload(db, current_user: dict, file_path: str) -> None:
    meta = await get_upload_authz(db, file_path)
    authorize_upload_key(current_user, meta.workspace_id, meta.uploaded_by)


async def open_upload_response(db, file_path: str, download: bool = False) -> StreamingResponse | FileResponse:
    """Return an inline view or download response from GridFS first, then disk cache."""
    relative = normalize_upload_key(file_path)
    display = _display_name(Path(relative).name)
    ext = Path(display).suffix.lower()
    is_viewable = ext in VIEWABLE_EXTENSIONS
    headers = {"Content-Disposition": content_disposition_header(display, inline=not (download or not is_viewable))}

    # 1) Durable GridFS (source of truth — survives Render ephemeral disk)
    if db is not None:
        bucket = _gridfs_bucket(db)
        try:
            grid_out = await bucket.open_download_stream_by_name(relative)
            meta = getattr(grid_out, "metadata", None) or {}
            if isinstance(meta, dict) and meta.get("original_name"):
                display = _display_name(str(meta["original_name"]))
                ext = Path(display).suffix.lower()
                is_viewable = ext in VIEWABLE_EXTENSIONS
                headers = {
                    "Content-Disposition": content_disposition_header(
                        display, inline=not (download or not is_viewable)
                    )
                }

            media_type = _guess_media_type(
                display,
                meta.get("content_type") if isinstance(meta, dict) else None,
            )

            async def _iter() -> AsyncIterator[bytes]:
                try:
                    while True:
                        chunk = await grid_out.read(256 * 1024)
                        if not chunk:
                            break
                        yield chunk
                finally:
                    try:
                        grid_out.close()
                    except Exception:
                        pass

            return StreamingResponse(
                _iter(),
                media_type=media_type,
                headers=headers,
            )
        except Exception:
            logger.info("GridFS miss for %s — trying disk cache", relative)

    # 2) Local / persistent disk fallback (legacy files not yet migrated)
    base = uploads_root().resolve()
    full = (base / relative).resolve()
    try:
        full.relative_to(base)
        if full.is_file():
            media_type = _guess_media_type(display)
            return FileResponse(
                path=str(full),
                filename=display,
                media_type=media_type,
                headers=headers,
            )
    except ValueError:
        pass

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")
