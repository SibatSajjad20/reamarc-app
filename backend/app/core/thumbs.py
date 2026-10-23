"""Small cached previews for grids, so cards never download full originals.

Callers MUST run their normal access check first (authorize_stored_upload for staff,
the share-token checks for public review links). Every cached thumb is keyed by the
caller's company id, so a thumb can never be served across companies.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, status
from fastapi.responses import FileResponse, Response

logger = logging.getLogger(__name__)

ALLOWED_WIDTHS = (200, 400, 800)
MAX_SOURCE_BYTES = 25 * 1024 * 1024
THUMB_COLLECTION = "media_thumbs"
THUMB_CACHE_CONTROL = "private, max-age=2592000, immutable"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif", ".tif", ".tiff"}

_gen_locks: dict[str, asyncio.Lock] = {}


def clamp_width(w: Optional[int]) -> int:
    try:
        w = int(w or 400)
    except (TypeError, ValueError):
        w = 400
    return min(ALLOWED_WIDTHS, key=lambda a: abs(a - w))


def thumb_cache_key(company_id: str, relative: str, width: int) -> str:
    return hashlib.sha1(f"{company_id}|{relative}|{width}".encode()).hexdigest()


def if_none_match_hits(header: Optional[str], etag: str) -> bool:
    if not header:
        return False
    tags = [t.strip() for t in header.split(",")]
    return "*" in tags or etag in tags or f"W/{etag}" in tags


def resize_to_webp(raw: bytes, width: int) -> bytes:
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(raw)) as im:
        im.draft("RGB", (width * 2, width * 2))  # fast JPEG downscale on decode
        im = ImageOps.exif_transpose(im)
        im.thumbnail((width, width))
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        out = io.BytesIO()
        im.save(out, "WEBP", quality=75, method=4)
        return out.getvalue()


async def _read_source(db, relative: str) -> Optional[bytes]:
    """Original bytes (capped). Drive: its own thumbnail first, then a capped download."""
    from app.core.uploads import open_upload_response

    if relative.startswith("gdrive/"):
        from app.services import google_drive_service as gdrive

        file_id = gdrive.file_id_from_path(relative)
        if not file_id:
            return None
        try:
            raw = await gdrive.fetch_drive_thumbnail_bytes(file_id, 800)
            if raw:
                return raw
        except Exception as exc:  # fall back to the original
            logger.info("drive thumbnail fetch failed: %s", type(exc).__name__)
        raw = await gdrive.download_file_prefix(file_id, MAX_SOURCE_BYTES + 1)
        return raw if raw and len(raw) <= MAX_SOURCE_BYTES else None

    resp = await open_upload_response(db, relative)
    if isinstance(resp, FileResponse):
        p = Path(resp.path)
        if p.stat().st_size > MAX_SOURCE_BYTES:
            return None
        return await asyncio.to_thread(p.read_bytes)
    buf = bytearray()
    it = getattr(resp, "body_iterator", None)
    if it is None:
        return None
    try:
        async for chunk in it:
            buf.extend(chunk if isinstance(chunk, (bytes, bytearray)) else str(chunk).encode())
            if len(buf) > MAX_SOURCE_BYTES:
                return None
    finally:
        close = getattr(it, "aclose", None)
        if close:
            try:
                await close()
            except Exception:
                pass
        bg = getattr(resp, "background", None)
        if bg is not None:
            try:
                await bg()
            except Exception:
                pass
    return bytes(buf)


async def thumbnail_response(db, *, company_id: str, relative: str, width: int, if_none_match: Optional[str]) -> Response:
    """Serve (and cache) a WebP preview. Access must already be checked by the caller."""
    from app.core.tenant import get_global_db

    if Path(relative).suffix.lower() not in IMAGE_EXTS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No preview for this file.")
    width = clamp_width(width)
    cid = str(company_id or "none")
    key = thumb_cache_key(cid, relative, width)
    gdb = get_global_db()
    coll = gdb[THUMB_COLLECTION] if gdb is not None else None

    async def _cached():
        if coll is None:
            return None
        return await coll.find_one({"_id": key, "company_id": cid})

    doc = await _cached()
    if doc is None:
        lock = _gen_locks.setdefault(key, asyncio.Lock())
        async with lock:
            doc = await _cached()
            if doc is None:
                raw = await _read_source(db, relative)
                if not raw:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No preview for this file.")
                try:
                    data = await asyncio.to_thread(resize_to_webp, raw, width)
                except Exception:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No preview for this file.")
                doc = {
                    "_id": key,
                    "company_id": cid,
                    "key": relative,
                    "w": width,
                    "data": data,
                    "etag": '"t-' + hashlib.sha1(data).hexdigest()[:20] + '"',
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                if coll is not None:
                    try:
                        await coll.replace_one({"_id": key}, doc, upsert=True)
                    except Exception as exc:
                        logger.warning("thumb cache write failed: %s", type(exc).__name__)
        _gen_locks.pop(key, None)

    headers = {"ETag": doc["etag"], "Cache-Control": THUMB_CACHE_CONTROL, "Vary": "Cookie"}
    if if_none_match_hits(if_none_match, doc["etag"]):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(content=bytes(doc["data"]), media_type="image/webp", headers=headers)
