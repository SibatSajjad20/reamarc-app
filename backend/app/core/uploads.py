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
import shutil
import time
from pathlib import Path
from typing import AsyncIterator, Optional, Tuple
from dataclasses import dataclass

from fastapi import HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)

_GDRIVE_AUTH_CACHE: dict[tuple[str, str], tuple[float, bool]] = {}
_GDRIVE_AUTH_TTL = 60.0
_GDRIVE_ITEM_PROJECTION = {
    "_id": 0,
    "id": 1,
    "company_id": 1,
    "workspace_id": 1,
    "assigned_to": 1,
    "created_by": 1,
    "stage": 1,
    "client_name": 1,
}

_GRIDFS_BUCKET = "uploads"
VIEWABLE_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".txt",
    ".mp4", ".mov", ".webm", ".m4v"
}


@dataclass(frozen=True)
class UploadAuthz:
    workspace_id: Optional[str] = None
    uploaded_by: Optional[str] = None
    company_id: Optional[str] = None


def sanitize_svg(content: bytes) -> bytes:
    """Strip malicious script tags and event handlers from SVG images to prevent XSS."""
    try:
        text = content.decode("utf-8", errors="ignore")
        text = re.sub(r"(?i)<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>", "", text)
        text = re.sub(r"(?i)javascript:[^\"]*", "", text)
        text = re.sub(r"(?i)\s+on[a-z]+\s*=\s*\"[^\"]*\"", "", text)
        text = re.sub(r"(?i)\s+on[a-z]+\s*=\s*'[^']*'", "", text)
        return text.encode("utf-8")
    except Exception:
        return content


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
    if ext == ".svg":
        return "image/svg+xml"
    if ext == ".mp4":
        return "video/mp4"
    if ext == ".webm":
        return "video/webm"
    if ext in (".mov", ".m4v"):
        return "video/quicktime"
    if ext == ".docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if ext == ".doc":
        return "application/msword"
    return "application/octet-stream"


def playable_media_type(filename: str, declared: Optional[str] = None) -> str:
    """Prefer browser-playable types for common video extensions.

    Drive often labels WhatsApp .mp4 files as application/octet-stream; Chrome
    will not decode that in <video>, even though the bytes are valid.
    """
    ext = Path(filename).suffix.lower()
    if ext in (".mp4", ".m4v"):
        return "video/mp4"
    if ext == ".webm":
        return "video/webm"
    return _guess_media_type(filename, declared)


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
    raw_db = db
    if hasattr(type(db), "raw") and callable(getattr(db, "raw", None)):
        raw_db = db.raw()
    return AsyncIOMotorGridFSBucket(raw_db, bucket_name=_GRIDFS_BUCKET)


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
        meta = {
            "original_name": original_name,
            "content_type": content_type or "application/octet-stream",
            "stored_path": stored_path,
            **{k: v for k, v in (extra_metadata or {}).items() if v},
        }
        if not meta.get("company_id"):
            from app.core.tenant import get_tenant_context

            ctx = get_tenant_context()
            if ctx and ctx.company_id:
                meta["company_id"] = ctx.company_id
        await bucket.upload_from_stream(
            key,
            io.BytesIO(content),
            metadata=meta,
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


async def save_upload_from_path(
    db,
    *,
    relative_key: str,
    path: str,
    original_name: str,
    content_type: Optional[str] = None,
    extra_metadata: Optional[dict] = None,
) -> str:
    """Persist an on-disk file to GridFS by streaming; never slurp the whole file."""
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
        with open(path, "rb") as fh:
            await bucket.upload_from_stream(
                key,
                fh,
                metadata={
                    "original_name": original_name,
                    "content_type": content_type or "application/octet-stream",
                    "stored_path": stored_path,
                    **{k: v for k, v in (extra_metadata or {}).items() if v},
                },
            )
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

    try:
        base = uploads_root()
        full = base / key
        full.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, full)
    except Exception as exc:
        logger.warning("Disk cache write failed for %s (GridFS OK): %s", key, exc)

    return stored_path


async def delete_upload(db, file_path: str) -> bool:
    """Delete an upload from MongoDB GridFS and local disk cache if present."""
    if not file_path:
        return False
    try:
        key = normalize_upload_key(file_path)
    except HTTPException:
        return False

    if key.startswith("gdrive/"):
        from app.services.google_drive_service import delete_file, file_id_from_path

        file_id = file_id_from_path(key)
        if file_id:
            await delete_file(file_id)
        return True

    if db is not None:
        try:
            bucket = _gridfs_bucket(db)
            await _delete_gridfs_by_name(bucket, key)
        except Exception as exc:
            logger.warning("Failed deleting GridFS file %s: %s", key, exc)

    try:
        base = uploads_root().resolve()
        full = (base / key).resolve()
        full.relative_to(base)
        if full.is_file():
            full.unlink(missing_ok=True)
    except Exception:
        pass
    return True



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
            cid = meta.get("company_id")
            return UploadAuthz(
                workspace_id=str(ws).strip() if ws else None,
                uploaded_by=str(uploader).strip() if uploader else None,
                company_id=str(cid).strip() if cid else None,
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


def _caller_company_id(current_user: dict) -> Optional[str]:
    from app.core.tenant import get_tenant_context

    ctx = get_tenant_context()
    if ctx and ctx.company_id:
        return ctx.company_id
    return current_user.get("company_id")


def _file_company_allowed(caller_cid: Optional[str], file_cid: Optional[str]) -> bool:
    if file_cid:
        return bool(caller_cid and file_cid == caller_cid)
    return caller_cid == "company_reamarc"


async def authorize_stored_upload(db, current_user: dict, file_path: str) -> None:
    relative = normalize_upload_key(file_path)
    caller_cid = _caller_company_id(current_user)

    if relative.startswith("gdrive/"):
        from app.services.content_calendar_workflow import can_view_item
        from app.services.google_drive_service import file_id_from_path

        file_id = file_id_from_path(relative)
        uid = str(current_user.get("id") or "")
        cache_key = (uid, file_id or "")
        now = time.monotonic()
        cached = _GDRIVE_AUTH_CACHE.get(cache_key)
        if cached and cached[0] > now:
            if cached[1]:
                return
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this file.",
            )
        item = None
        if file_id and db is not None:
            item = await db.content_calendar_items.find_one(
                {
                    "$or": [
                        {"attachments.google_drive_file_id": file_id},
                        {"attachments.google_drive_thumb_file_id": file_id},
                    ]
                },
                _GDRIVE_ITEM_PROJECTION,
            )
        allowed = bool(item and can_view_item(current_user, item))
        if item:
            _GDRIVE_AUTH_CACHE[cache_key] = (now + _GDRIVE_AUTH_TTL, allowed)
            if len(_GDRIVE_AUTH_CACHE) > 512:
                expired = [k for k, (exp, _) in _GDRIVE_AUTH_CACHE.items() if exp <= now]
                for key in expired:
                    _GDRIVE_AUTH_CACHE.pop(key, None)
        if allowed:
            return
        if item:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this file.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested file not found.",
        )

    if relative.startswith("content_calendar/"):
        from app.services.content_calendar_workflow import can_view_item

        parts = relative.split("/")
        item = None
        if len(parts) >= 2 and db is not None:
            item_id = parts[1]
            item = await db.content_calendar_items.find_one(
                {"$or": [{"id": item_id}, {"serial": item_id}]}
            )
        if item and can_view_item(current_user, item):
            return
        if item:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this file.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested file not found.",
        )

    if relative.startswith("website_projects/"):
        from app.services.website_project_workflow import (
            is_admin_or_ops,
            is_website_lead,
            is_client,
            can_view_project,
        )

        parts = relative.split("/")
        project_id = parts[1] if len(parts) >= 2 else None
        project = None
        if project_id and db is not None:
            project = await db.website_projects.find_one({"id": project_id})
        if project and (is_admin_or_ops(current_user) or is_website_lead(current_user)):
            return
        if project:
            if is_client(current_user):
                client_workspaces = [str(w) for w in (current_user.get("workspace_ids") or [])]
                if str(project.get("workspace_id")) in client_workspaces:
                    return
            elif can_view_project(current_user, project):
                return
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested file not found.",
        )

    meta = await get_upload_authz(db, file_path)
    if relative.startswith("deliverables/") or relative.startswith("proposals/"):
        if not _file_company_allowed(caller_cid, meta.company_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Requested file not found.",
            )
    elif meta.company_id and not _file_company_allowed(caller_cid, meta.company_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested file not found.",
        )
    from app.core.security import _MANAGEMENT_ROLES

    if current_user.get("role") in _MANAGEMENT_ROLES and not _file_company_allowed(caller_cid, meta.company_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested file not found.",
        )
    authorize_upload_key(current_user, meta.workspace_id, meta.uploaded_by)


async def open_upload_response(
    db,
    file_path: str,
    download: bool = False,
    range_header: Optional[str] = None,
    if_none_match: Optional[str] = None,
) -> StreamingResponse | FileResponse:
    """Return an inline view or download response from GridFS first, then disk cache."""
    relative = normalize_upload_key(file_path)
    if relative.startswith("gdrive/"):
        from app.services.google_drive_service import file_id_from_path, open_drive_response

        file_id = file_id_from_path(relative)
        if not file_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")
        filename = Path(relative).name
        return await open_drive_response(
            file_id, filename, download=download, range_header=range_header, if_none_match=if_none_match
        )

    display = _display_name(Path(relative).name)
    ext = Path(display).suffix.lower()
    is_viewable = ext in VIEWABLE_EXTENSIONS
    headers = {
        "Content-Disposition": content_disposition_header(display, inline=not (download or not is_viewable)),
        "Accept-Ranges": "bytes",
    }

    base = uploads_root().resolve()
    full = (base / relative).resolve()
    try:
        full.relative_to(base)
        if full.is_file():
            media_type = playable_media_type(display)
            return FileResponse(
                path=str(full),
                filename=display,
                media_type=media_type,
                headers=headers,
            )
    except (ValueError, Exception):
        pass

    # 2) Durable GridFS fallback (source of truth — survives Render ephemeral disk)
    if db is not None:
        bucket = _gridfs_bucket(db)
        try:
            grid_out = await bucket.open_download_stream_by_name(relative)
            meta = getattr(grid_out, "metadata", None) or {}
            if isinstance(meta, dict) and meta.get("original_name"):
                display = _display_name(str(meta["original_name"]))
                ext = Path(display).suffix.lower()
                is_viewable = ext in VIEWABLE_EXTENSIONS
                headers["Content-Disposition"] = content_disposition_header(
                    display, inline=not (download or not is_viewable)
                )

            media_type = playable_media_type(
                display,
                meta.get("content_type") if isinstance(meta, dict) else None,
            )

            total_size = getattr(grid_out, "length", None)
            if range_header and total_size and total_size > 0 and range_header.startswith("bytes="):
                try:
                    range_val = range_header.replace("bytes=", "").strip()
                    parts = range_val.split("-")
                    start = int(parts[0]) if parts[0] else 0
                    end = int(parts[1]) if len(parts) > 1 and parts[1] else total_size - 1
                    if start <= end and start < total_size:
                        end = min(end, total_size - 1)
                        content_length = end - start + 1
                        grid_out.seek(start)
                        headers["Content-Range"] = f"bytes {start}-{end}/{total_size}"
                        headers["Content-Length"] = str(content_length)

                        async def _iter_range() -> AsyncIterator[bytes]:
                            remaining = content_length
                            try:
                                while remaining > 0:
                                    chunk_to_read = min(256 * 1024, remaining)
                                    chunk = await grid_out.read(chunk_to_read)
                                    if not chunk:
                                        break
                                    remaining -= len(chunk)
                                    yield chunk
                            finally:
                                try:
                                    grid_out.close()
                                except Exception:
                                    pass

                        return StreamingResponse(
                            _iter_range(),
                            status_code=status.HTTP_206_PARTIAL_CONTENT,
                            media_type=media_type,
                            headers=headers,
                        )
                except Exception as range_exc:
                    logger.debug("Failed parsing Range header '%s': %s", range_header, range_exc)

            if total_size is not None and total_size > 0:
                headers["Content-Length"] = str(total_size)

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
        except HTTPException:
            raise
        except Exception:
            logger.info("GridFS miss for %s", relative)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")
