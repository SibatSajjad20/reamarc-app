"""Personal / Workspace Google Drive storage for content-calendar assets.

Uses an OAuth refresh token for the 5TB account that owns the files.
Folders are created under a root folder (or existing configured folder):

    My Drive / [GOOGLE_DRIVE_FOLDER_ID or Content Calendar] / {client} / {serial} {title} / files
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import threading
from typing import Any, Dict, Optional, List

import httpx
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
]
_ROOT_NAME = "Content Calendar"
_FOLDER_MIME = "application/vnd.google-apps.folder"
_INDEX = "google_drive_folders"
_ITEMS = "content_calendar_items"

_creds = None
_creds_lock = threading.Lock()


def configured() -> bool:
    from app.config import settings

    token = (settings.GOOGLE_DRIVE_REFRESH_TOKEN or "").strip()
    client_id = (settings.GOOGLE_DRIVE_CLIENT_ID or "").strip()
    client_secret = (settings.GOOGLE_DRIVE_CLIENT_SECRET or "").strip()
    client_file = (settings.GOOGLE_DRIVE_OAUTH_CLIENT_FILE or "").strip()
    has_client = bool((client_id and client_secret) or client_file)
    return bool(has_client and token)


def public_path(file_id: str, filename: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", filename or "file") or "file"
    return f"/uploads/gdrive/{file_id}/{safe}"


def file_id_from_path(file_path: str) -> Optional[str]:
    raw = (file_path or "").replace("\\", "/").strip()
    if raw.startswith("/uploads/"):
        raw = raw[len("/uploads/") :]
    elif raw.startswith("uploads/"):
        raw = raw[len("uploads/") :]
    raw = raw.lstrip("/")
    parts = [part for part in raw.split("/") if part]
    if len(parts) >= 2 and parts[0] == "gdrive":
        return parts[1]
    return None


def _folder_name(value: Optional[str], fallback: str) -> str:
    cleaned = re.sub(r"[\\/\x00]", " ", str(value or ""))
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return (cleaned or fallback)[:180]


def item_folder_name(item: Dict[str, Any]) -> str:
    serial = _folder_name(item.get("serial"), "Item")
    title = _folder_name(item.get("content_concept"), "")
    if title and title.lower() not in serial.lower():
        return _folder_name(f"{serial} {title}", serial)
    return serial


def _client_key(client_name: Optional[str], workspace_id: Optional[str]) -> str:
    if workspace_id:
        return f"ws:{workspace_id}"
    name = re.sub(r"\s+", " ", str(client_name or "").strip().lower())
    return f"name:{name or 'unassigned'}"


def _load_client_config() -> tuple[str, str]:
    from app.config import settings

    client_id = (settings.GOOGLE_DRIVE_CLIENT_ID or "").strip()
    client_secret = (settings.GOOGLE_DRIVE_CLIENT_SECRET or "").strip()
    if client_id and client_secret:
        return client_id, client_secret

    path = (settings.GOOGLE_DRIVE_OAUTH_CLIENT_FILE or "").strip()
    if path:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            block = data.get("installed") or data.get("web") or {}
            c_id = block.get("client_id")
            c_sec = block.get("client_secret")
            if c_id and c_sec:
                return c_id, c_sec
        except OSError as exc:
            logger.error("Google Drive OAuth client file could not be read: %s", exc)

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Google Drive client credentials (GOOGLE_DRIVE_CLIENT_ID / CLIENT_SECRET) are missing or invalid.",
    )


def _credentials():
    global _creds
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    client_id, client_secret = _load_client_config()
    from app.config import settings

    refresh_token = (settings.GOOGLE_DRIVE_REFRESH_TOKEN or "").strip()
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GOOGLE_DRIVE_REFRESH_TOKEN is not configured.",
        )

    with _creds_lock:
        if _creds is not None:
            if _creds.valid:
                return _creds
            try:
                _creds.refresh(Request())
                return _creds
            except Exception as exc:
                logger.warning("Existing Google Drive credentials refresh failed: %s; refreshing anew.", exc)
                _creds = None

        _creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=None,
        )
        try:
            _creds.refresh(Request())
        except Exception as exc:
            _creds = None
            logger.error("Google Drive token refresh failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google Drive login expired or invalid. Check client ID, secret, and refresh token.",
            ) from exc
        return _creds


def _service():
    from googleapiclient.discovery import build

    return build("drive", "v3", credentials=_credentials(), cache_discovery=False)


def _drive_http_error(exc: Exception, action: str) -> HTTPException:
    text = str(exc)
    if "accessNotConfigured" in text or "Drive API has not been used" in text:
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Drive API is not enabled on the Google Cloud project for this login. Enable it at https://console.developers.google.com/apis/api/drive.googleapis.com/overview, wait one minute, then try again.",
        )
    logger.error("Google Drive %s failed: %s", action, exc)
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Could not {action} in Google Drive. Try again.",
    )


def _find_folder_by_name(name: str, parent_id: Optional[str] = None) -> Optional[str]:
    try:
        service = _service()
        escaped = name.replace("'", "\\'")
        query = f"mimeType='{_FOLDER_MIME}' and name='{escaped}' and trashed=false"
        if parent_id:
            query += f" and '{parent_id}' in parents"
        results = (
            service.files()
            .list(
                q=query,
                spaces="drive",
                fields="files(id, name)",
                pageSize=1,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        files = results.get("files", [])
        if files:
            return files[0]["id"]
    except Exception as exc:
        logger.warning("Could not find folder by name '%s': %s", name, exc)
    return None


def _create_folder(name: str, parent_id: Optional[str]) -> str:
    body: Dict[str, Any] = {"name": name, "mimeType": _FOLDER_MIME}
    if parent_id:
        body["parents"] = [parent_id]
    try:
        created = (
            _service()
            .files()
            .create(body=body, fields="id", supportsAllDrives=True)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _drive_http_error(exc, f"create folder '{name}'") from exc
    return created["id"]


def _folder_alive(file_id: str) -> bool:
    if not file_id:
        return False
    from googleapiclient.errors import HttpError

    try:
        meta = (
            _service()
            .files()
            .get(fileId=file_id, fields="id,trashed,mimeType", supportsAllDrives=True)
            .execute()
        )
    except HttpError as exc:
        if getattr(exc, "resp", None) is not None and exc.resp.status in (404, 403):
            return False
        raise
    except Exception:
        return False
    return not meta.get("trashed") and meta.get("mimeType") == _FOLDER_MIME


def _upload(parent_id: Optional[str], filename: str, content: bytes, content_type: str) -> Dict[str, Any]:
    from googleapiclient.http import MediaIoBaseUpload

    media = MediaIoBaseUpload(
        io.BytesIO(content),
        mimetype=content_type or "application/octet-stream",
        resumable=len(content) > 5 * 1024 * 1024,
    )
    body: Dict[str, Any] = {"name": filename}
    if parent_id:
        body["parents"] = [parent_id]
    return (
        _service()
        .files()
        .create(
            body=body,
            media_body=media,
            fields="id,webViewLink,size",
            supportsAllDrives=True,
        )
        .execute()
    )


def _delete(file_id: str) -> None:
    from googleapiclient.errors import HttpError

    try:
        _service().files().delete(fileId=file_id, supportsAllDrives=True).execute()
    except HttpError as exc:
        if getattr(exc, "resp", None) is not None and exc.resp.status == 404:
            return
        raise


def _relocate(file_id: str, parent_id: str, name: str) -> None:
    service = _service()
    meta = (
        service.files()
        .get(fileId=file_id, fields="id,name,parents", supportsAllDrives=True)
        .execute()
    )
    current_parents = meta.get("parents") or []
    current_name = meta.get("name")
    if current_name == name and parent_id in current_parents:
        return

    previous = ",".join(current_parents)
    kwargs: Dict[str, Any] = {
        "fileId": file_id,
        "body": {"name": name},
        "fields": "id,parents",
        "supportsAllDrives": True,
    }
    if parent_id and parent_id not in current_parents:
        kwargs["addParents"] = parent_id
        if previous:
            kwargs["removeParents"] = previous
    service.files().update(**kwargs).execute()


def _file_meta(file_id: str) -> Dict[str, Any]:
    return (
        _service()
        .files()
        .get(fileId=file_id, fields="id,name,mimeType,size", supportsAllDrives=True)
        .execute()
    )


def storage_quota() -> Optional[Dict[str, Any]]:
    """Returns storage quota and user info from Google Drive."""
    try:
        about = _service().about().get(fields="storageQuota,user").execute()
    except Exception as exc:
        logger.info("Drive quota lookup unavailable: %s", exc)
        return None
    return about


def list_drive_folders(max_results: int = 50) -> List[Dict[str, Any]]:
    """List folders in Google Drive to inspect or find existing folder IDs."""
    try:
        results = (
            _service()
            .files()
            .list(
                q=f"mimeType='{_FOLDER_MIME}' and trashed=false",
                fields="files(id, name, parents, modifiedTime)",
                pageSize=max_results,
                orderBy="modifiedTime desc",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        return results.get("files", [])
    except Exception as exc:
        logger.warning("Could not list Drive folders: %s", exc)
        return []


async def _ensure_root(db) -> str:
    from app.config import settings

    # 1. Explicit folder ID configured in .env takes priority
    configured_folder = (settings.GOOGLE_DRIVE_FOLDER_ID or "").strip()
    if configured_folder:
        if await asyncio.to_thread(_folder_alive, configured_folder):
            return configured_folder
        logger.warning(
            "Configured GOOGLE_DRIVE_FOLDER_ID %s is not accessible or not found. Falling back to DB index or discovery.",
            configured_folder,
        )

    # 2. Check MongoDB indexed root folder
    coll = db[_INDEX]
    existing = await coll.find_one({"_id": "root"})
    if existing and existing.get("folder_id") and await asyncio.to_thread(_folder_alive, existing["folder_id"]):
        return existing["folder_id"]

    # 3. Check if a folder named _ROOT_NAME already exists in Drive
    found = await asyncio.to_thread(_find_folder_by_name, _ROOT_NAME, None)
    if found:
        await coll.update_one({"_id": "root"}, {"$set": {"folder_id": found, "name": _ROOT_NAME}}, upsert=True)
        return found

    # 4. Create new root folder in Drive
    folder_id = await asyncio.to_thread(_create_folder, _ROOT_NAME, None)
    await coll.update_one({"_id": "root"}, {"$set": {"folder_id": folder_id, "name": _ROOT_NAME}}, upsert=True)
    return folder_id


async def ensure_client_folder(db, client_name: Optional[str], workspace_id: Optional[str]) -> str:
    key = _client_key(client_name, workspace_id)
    coll = db[_INDEX]
    existing = await coll.find_one({"_id": f"client:{key}"})
    if existing and existing.get("folder_id") and await asyncio.to_thread(_folder_alive, existing["folder_id"]):
        return existing["folder_id"]

    root_id = await _ensure_root(db)
    target_name = _folder_name(client_name, "Unassigned client")

    # Check if folder already exists under root_id in Drive
    found = await asyncio.to_thread(_find_folder_by_name, target_name, root_id)
    if found:
        await coll.update_one(
            {"_id": f"client:{key}"},
            {"$set": {"folder_id": found, "name": target_name}},
            upsert=True,
        )
        return found

    folder_id = await asyncio.to_thread(_create_folder, target_name, root_id)
    await coll.update_one(
        {"_id": f"client:{key}"},
        {"$set": {"folder_id": folder_id, "name": target_name}},
        upsert=True,
    )
    return folder_id


async def ensure_item_folder(db, item: Dict[str, Any]) -> str:
    existing = item.get("google_drive_folder_id")
    if existing and await asyncio.to_thread(_folder_alive, existing):
        return existing
    parent = await ensure_client_folder(db, item.get("client_name"), item.get("workspace_id"))
    target_name = item_folder_name(item)

    # Check if folder already exists under parent in Drive
    found = await asyncio.to_thread(_find_folder_by_name, target_name, parent)
    if found:
        await db[_ITEMS].update_one({"id": item["id"]}, {"$set": {"google_drive_folder_id": found}})
        item["google_drive_folder_id"] = found
        return found

    folder_id = await asyncio.to_thread(_create_folder, target_name, parent)
    await db[_ITEMS].update_one({"id": item["id"]}, {"$set": {"google_drive_folder_id": folder_id}})
    item["google_drive_folder_id"] = folder_id
    return folder_id


async def upload_bytes(parent_id: Optional[str], filename: str, content: bytes, content_type: str) -> Dict[str, Any]:
    try:
        return await asyncio.to_thread(_upload, parent_id, filename, content, content_type or "application/octet-stream")
    except HTTPException:
        raise
    except Exception as exc:
        raise _drive_http_error(exc, "upload this file") from exc


async def delete_file(file_id: str) -> None:
    if not file_id or not configured():
        return
    try:
        await asyncio.to_thread(_delete, file_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Google Drive delete failed for %s: %s", file_id, exc)


async def relocate_item_folder(file_id: str, parent_id: str, name: str) -> None:
    if not file_id or not configured():
        return
    try:
        await asyncio.to_thread(_relocate, file_id, parent_id, name)
    except Exception as exc:
        logger.warning("Could not move Drive folder %s: %s", file_id, exc)


async def open_drive_response(file_id: str, filename: str, download: bool = False, range_header: Optional[str] = None):
    from app.core.uploads import _guess_media_type, content_disposition_header

    try:
        meta = await asyncio.to_thread(_file_meta, file_id)
    except Exception as exc:
        logger.warning("Google Drive file lookup failed for %s: %s", file_id, exc)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.") from exc

    creds = _credentials()
    from google.auth.transport.requests import Request
    if not creds.valid or creds.expired:
        with _creds_lock:
            creds.refresh(Request())
    token = creds.token
    headers = {"Authorization": f"Bearer {token}"}
    if range_header:
        headers["Range"] = range_header
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"

    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=None))
    try:
        response = await client.send(client.build_request("GET", url, headers=headers), stream=True)
    except Exception:
        await client.aclose()
        raise

    if response.status_code not in (200, 206):
        logger.warning("Drive stream returned status %s for file_id %s", response.status_code, file_id)
        await response.aclose()
        await client.aclose()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    display = filename or meta.get("name") or "file"
    media_type = meta.get("mimeType") or _guess_media_type(display)
    ext = "." + display.rsplit(".", 1)[-1].lower() if "." in display else ""
    from app.core.uploads import VIEWABLE_EXTENSIONS

    inline = ext in VIEWABLE_EXTENSIONS and not download
    out_headers = {
        "Content-Disposition": content_disposition_header(display, inline=inline),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
    }
    if response.headers.get("content-range"):
        out_headers["Content-Range"] = response.headers["content-range"]
    if response.headers.get("content-length"):
        out_headers["Content-Length"] = response.headers["content-length"]
    elif meta.get("size") and response.status_code == 200:
        out_headers["Content-Length"] = str(meta["size"])

    async def _iter():
        try:
            async for chunk in response.aiter_bytes(256 * 1024):
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(_iter(), status_code=response.status_code, media_type=media_type, headers=out_headers)
