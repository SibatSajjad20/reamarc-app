"""Task attachments: Drive (or local-disk fallback), links, and authz-checked streaming."""
from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse

from app.core.uploads import delete_upload, open_upload_response, uploads_root
from app.services.task_access import can_attach, can_view, uid_of
from app.services.task_activity import log_task_activity
from app.services.task_service import get_task_settings, get_visible_or_404

logger = logging.getLogger(__name__)

VIDEO_MAX = 100 * 1024 * 1024
OTHER_MAX = 25 * 1024 * 1024
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".m4v"}
ALLOWED_EXTS = VIDEO_EXTS | {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".svg",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".csv",
    ".zip",
}
_EXT_RE = re.compile(r"^[a-z0-9]{1,8}$")
_DRIVE_UNAVAILABLE = "File storage (Google Drive) isn't configured; attach a Drive file or link instead."
_DRIVE_FAILED = "Google Drive upload failed. Try again, or attach a Drive file or link instead."


def _new_id() -> str:
    return f"tat_{uuid4().hex[:12]}"


def sanitize_display_name(filename: str) -> str:
    base = os.path.basename(str(filename or "upload").replace("\\", "/"))
    cleaned = "".join(ch for ch in base if ch >= " " and ch not in {"/", "\\"})
    cleaned = cleaned.strip() or "upload"
    return cleaned[:200]


def stored_extension(filename: str) -> str:
    raw = os.path.splitext(filename or "")[1].lower().lstrip(".")
    if not _EXT_RE.match(raw):
        raise HTTPException(status_code=415, detail="File type is not allowed")
    return f".{raw}"


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _public(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out.pop("_id", None)
    thumb = out.pop("thumb", None)
    thumb_key = out.pop("thumb_key", None)
    out.pop("storage_key", None)
    out["has_thumb"] = bool(thumb or thumb_key or out.get("drive_thumb_file_id"))
    return out


def _is_production() -> bool:
    from app.config import settings

    return str(getattr(settings, "ENVIRONMENT", "") or "").strip().lower() == "production"


def _is_video(filename: str, content_type: Optional[str]) -> bool:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in VIDEO_EXTS:
        return True
    return bool(content_type and content_type.startswith("video/"))


async def ensure_task_folder(db, department: Optional[str]) -> Optional[str]:
    """Tasks/<Department> under the company Drive root."""
    from app.services import google_drive_service as gdrive

    if not gdrive.configured():
        return None
    root = await gdrive._ensure_root(db)
    tasks_name = "Tasks"
    tasks_id = await _ensure_named_folder(db, gdrive, "task_root", tasks_name, root)
    dept_name = (department or "General").strip() or "General"
    return await _ensure_named_folder(db, gdrive, f"task_dept:{dept_name.lower()}", dept_name, tasks_id)


async def _ensure_named_folder(db, gdrive, index_id: str, name: str, parent_id: str) -> str:
    from app.core.tenant import company_singleton_id
    import asyncio

    coll = db.google_drive_folders
    key = company_singleton_id(index_id)
    existing = await coll.find_one({"_id": key})
    if existing and existing.get("folder_id"):
        return existing["folder_id"]
    found = await asyncio.to_thread(gdrive._find_folder_by_name, name, parent_id)
    if not found:
        found = await asyncio.to_thread(gdrive._create_folder, name, parent_id)
    await coll.update_one(
        {"_id": key},
        {"$set": {"folder_id": found, "name": name, "parent_id": parent_id}},
        upsert=True,
    )
    return found


async def _task_item_folder(db, task: Dict[str, Any]) -> str:
    from app.services import google_drive_service as gdrive

    dept_folder = await ensure_task_folder(db, task.get("department"))
    if not dept_folder:
        raise HTTPException(status_code=502, detail=_DRIVE_FAILED)
    serial = str(task.get("serial") or "").strip()
    title = str(task.get("title") or "").strip()
    folder_name = f"{serial} {title}".strip()[:120] or serial or "task"
    return await _ensure_named_folder(db, gdrive, f"task_item:{task.get('id')}", folder_name, dept_folder)


def _write_local_file(task_id: str, stored_name: str, *, content: Optional[bytes] = None, src_path: Optional[str] = None) -> str:
    dest_dir = uploads_root() / "tasks" / task_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / stored_name
    tmp = dest_dir / f".{stored_name}.tmp.{uuid4().hex[:8]}"
    try:
        if content is not None:
            tmp.write_bytes(content)
        elif src_path:
            shutil.copyfile(src_path, tmp)
        else:
            raise ValueError("no content")
        os.replace(str(tmp), str(dest))
    except Exception:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass
        raise
    return f"/uploads/tasks/{task_id}/{stored_name}"


async def _drive_upload_bytes(parent_id: str, filename: str, content: bytes, content_type: str) -> Dict[str, Any]:
    from app.services import google_drive_service as gdrive

    try:
        return await gdrive.upload_bytes(parent_id, filename, content, content_type)
    except HTTPException as exc:
        raise HTTPException(status_code=502, detail=_DRIVE_FAILED) from exc
    except Exception as exc:
        logger.exception("Drive upload_bytes failed: %s", exc)
        raise HTTPException(status_code=502, detail=_DRIVE_FAILED) from exc


async def _drive_upload_path(parent_id: str, filename: str, path: str, content_type: str) -> Dict[str, Any]:
    from app.services import google_drive_service as gdrive

    try:
        return await gdrive.upload_path(parent_id, filename, path, content_type)
    except HTTPException as exc:
        raise HTTPException(status_code=502, detail=_DRIVE_FAILED) from exc
    except Exception as exc:
        logger.exception("Drive upload_path failed: %s", exc)
        raise HTTPException(status_code=502, detail=_DRIVE_FAILED) from exc


async def _store_file(
    db,
    task: Dict[str, Any],
    att_id: str,
    filename: str,
    content_type: str,
    *,
    content: Optional[bytes] = None,
    src_path: Optional[str] = None,
    stored_name: Optional[str] = None,
    use_path_upload: bool = False,
) -> Dict[str, Any]:
    from app.services import google_drive_service as gdrive

    name = stored_name or filename
    if gdrive.configured():
        folder_id = await _task_item_folder(db, task)
        if use_path_upload and src_path:
            uploaded = await _drive_upload_path(folder_id, name, src_path, content_type)
        else:
            if content is None and src_path:
                content = Path(src_path).read_bytes()
            uploaded = await _drive_upload_bytes(folder_id, name, content or b"", content_type)
        file_id = uploaded.get("id")
        if not file_id:
            raise HTTPException(status_code=502, detail=_DRIVE_FAILED)
        return {
            "storage": "drive",
            "drive_file_id": file_id,
            "storage_key": gdrive.public_path(file_id, name),
        }
    if _is_production():
        raise HTTPException(status_code=503, detail=_DRIVE_UNAVAILABLE)
    key = _write_local_file(str(task["id"]), name, content=content, src_path=src_path)
    return {"storage": "local", "drive_file_id": None, "storage_key": key}


async def _delete_stored(db, doc: Dict[str, Any]) -> None:
    if doc.get("kind") not in (None, "upload"):
        return
    storage = doc.get("storage")
    if storage == "drive":
        from app.services import google_drive_service as gdrive

        for fid in (doc.get("drive_file_id"), doc.get("drive_thumb_file_id")):
            if not fid:
                continue
            try:
                await gdrive.delete_file(fid)
            except Exception as exc:
                logger.warning("Drive delete failed for %s: %s", fid, exc)
        return
    for key in (doc.get("storage_key"), doc.get("thumb_key") or doc.get("thumb")):
        if not key:
            continue
        try:
            await delete_upload(db, key)
        except Exception as exc:
            logger.warning("Local/legacy delete failed for %s: %s", key, exc)


async def list_attachments(db, task_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    cfg = await get_task_settings(db)
    await get_visible_or_404(db, task_id, user, cfg)
    rows = await db.task_attachments.find({"task_id": task_id}).to_list(200)
    return [_public(r) for r in rows]


async def upload_attachment(db, task_id: str, file: UploadFile, user: Dict[str, Any]) -> Dict[str, Any]:
    from app.services import google_drive_service as gdrive

    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, user, cfg)
    if not can_attach(user, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot attach files to this task")
    filename = sanitize_display_name(file.filename or "upload.bin")
    content_type = file.content_type or "application/octet-stream"
    ext = stored_extension(filename)
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=415, detail=f"File type '{ext}' is not allowed")
    if not gdrive.configured() and _is_production():
        raise HTTPException(status_code=503, detail=_DRIVE_UNAVAILABLE)

    is_video = _is_video(filename, content_type)
    max_size = VIDEO_MAX if is_video else OTHER_MAX
    att_id = _new_id()
    temp_path = None
    processed_path = None
    stored: Dict[str, Any] = {}
    thumb_stored: Dict[str, Any] = {}
    size = 0
    try:
        if is_video:
            from app.services.content_calendar_service import _copy_upload_to_temp, process_video_upload, _ffmpeg_lock

            temp_path, size = await _copy_upload_to_temp(file, max_size, ext)
            async with _ffmpeg_lock:
                out_path, thumb_bytes, _w, _h, _dur = await asyncio.to_thread(process_video_upload, temp_path, ext)
            processed_path = out_path if out_path else temp_path
            if processed_path and os.path.isfile(processed_path):
                size = os.path.getsize(processed_path)
            stored = await _store_file(
                db,
                task,
                att_id,
                filename,
                content_type,
                src_path=processed_path,
                stored_name=f"{att_id}{ext}",
                use_path_upload=True,
            )
            if thumb_bytes:
                try:
                    thumb_stored = await _store_file(
                        db,
                        task,
                        att_id,
                        f"{att_id}_thumb.jpg",
                        "image/jpeg",
                        content=thumb_bytes,
                        stored_name=f"{att_id}_thumb.jpg",
                        use_path_upload=False,
                    )
                except Exception as exc:
                    logger.warning(
                        "Task %s attachment %s: thumbnail store failed, keeping file without thumb: %s",
                        task_id,
                        att_id,
                        exc,
                    )
                    thumb_stored = {}
        else:
            data = await file.read(max_size + 1)
            if len(data) > max_size:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File '{filename}' exceeds {max_size // (1024 * 1024)}MB size limit.",
                )
            size = len(data)
            stored = await _store_file(
                db,
                task,
                att_id,
                filename,
                content_type,
                content=data,
                stored_name=f"{att_id}{ext}",
                use_path_upload=False,
            )

        doc = {
            "id": att_id,
            "task_id": task_id,
            "kind": "upload",
            "name": filename,
            "mime_type": content_type,
            "size_bytes": size,
            "storage": stored.get("storage"),
            "drive_file_id": stored.get("drive_file_id"),
            "drive_thumb_file_id": thumb_stored.get("drive_file_id"),
            "storage_key": stored.get("storage_key"),
            "thumb_key": thumb_stored.get("storage_key"),
            "uploaded_by": uid_of(user),
            "created_at": _now_iso(),
        }
        try:
            await db.task_attachments.insert_one(doc)
        except Exception:
            await _delete_stored(db, doc)
            raise
        await db.tasks.update_one({"id": task_id}, {"$inc": {"attachments_count": 1}})
        await log_task_activity(db, task, "attachment_added", user, filename)
        return _public(doc)
    finally:
        for p in {temp_path, processed_path}:
            if not p:
                continue
            try:
                os.unlink(p)
            except Exception:
                pass


async def add_link(db, task_id: str, name: str, url: str, user: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, user, cfg)
    if not can_attach(user, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot attach files to this task")
    doc = {
        "id": _new_id(),
        "task_id": task_id,
        "kind": "link",
        "name": name.strip(),
        "mime_type": "text/uri-list",
        "size_bytes": 0,
        "url": url.strip(),
        "thumb": None,
        "uploaded_by": uid_of(user),
        "created_at": _now_iso(),
    }
    await db.task_attachments.insert_one(doc)
    await db.tasks.update_one({"id": task_id}, {"$inc": {"attachments_count": 1}})
    await log_task_activity(db, task, "attachment_added", user, name)
    return _public(doc)


async def add_drive_file(db, task_id: str, payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, user, cfg)
    if not can_attach(user, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot attach files to this task")
    from app.services import google_drive_service as gdrive

    file_id = payload.get("drive_file_id")
    if file_id:
        try:
            await gdrive.record_picker_grants([file_id], actor=user)
        except Exception:
            pass
    doc = {
        "id": _new_id(),
        "task_id": task_id,
        "kind": "drive",
        "name": payload.get("name") or "Drive file",
        "mime_type": payload.get("mime_type"),
        "size_bytes": payload.get("size_bytes") or 0,
        "drive_file_id": file_id,
        "url": payload.get("url"),
        "thumb": payload.get("thumb"),
        "uploaded_by": uid_of(user),
        "created_at": _now_iso(),
    }
    await db.task_attachments.insert_one(doc)
    await db.tasks.update_one({"id": task_id}, {"$inc": {"attachments_count": 1}})
    await log_task_activity(db, task, "attachment_added", user, doc["name"])
    return _public(doc)


async def delete_attachment(db, task_id: str, att_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, user, cfg)
    if not can_attach(user, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot remove attachments")
    doc = await db.task_attachments.find_one({"id": att_id, "task_id": task_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Attachment not found")
    await _delete_stored(db, doc)
    await db.task_attachments.delete_one({"id": att_id})
    await db.tasks.update_one({"id": task_id}, {"$inc": {"attachments_count": -1}})
    await log_task_activity(db, task, "attachment_removed", user, doc.get("name") or att_id)
    return {"ok": True}


async def stream_attachment(
    db,
    task_id: str,
    att_id: str,
    user: Dict[str, Any],
    range_header: Optional[str] = None,
    download: bool = False,
):
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, user, cfg)
    if not can_view(user, task, cfg):
        raise HTTPException(status_code=404, detail="Task not found")
    doc = await db.task_attachments.find_one({"id": att_id, "task_id": task_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if doc.get("kind") != "upload" or not doc.get("storage_key"):
        raise HTTPException(status_code=404, detail="No file to stream")
    if download and doc.get("storage") == "drive" and doc.get("drive_file_id"):
        from app.services.drive_direct import direct_download_url

        direct = await direct_download_url(
            doc["drive_file_id"],
            company_id=str(task.get("company_id") or user.get("company_id") or ""),
        )
        if direct:
            return RedirectResponse(direct, status_code=307, headers={"Cache-Control": "private, no-store"})
    return await open_upload_response(db, doc["storage_key"], range_header=range_header, download=download)


async def stream_thumb(db, task_id: str, att_id: str, user: Dict[str, Any], range_header: Optional[str] = None):
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, user, cfg)
    if not can_view(user, task, cfg):
        raise HTTPException(status_code=404, detail="Task not found")
    doc = await db.task_attachments.find_one({"id": att_id, "task_id": task_id})
    key = (doc or {}).get("thumb_key") or (doc or {}).get("thumb")
    if not doc or not key:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return await open_upload_response(db, key, range_header=range_header)


async def picker_config(db, task_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    cfg = await get_task_settings(db)
    task = await get_visible_or_404(db, task_id, user, cfg)
    if not can_attach(user, task, cfg):
        raise HTTPException(status_code=403, detail="You cannot attach files to this task")
    from app.services import google_drive_service as gdrive

    if not gdrive.configured():
        raise HTTPException(status_code=503, detail="Google Drive integration is not configured on this server.")
    folder_id = await ensure_task_folder(db, task.get("department"))
    root_id = await gdrive._ensure_root(db)
    return gdrive.picker_public_payload(folder_id, root_id, actor=user, item_id=task_id, context="tasks")
