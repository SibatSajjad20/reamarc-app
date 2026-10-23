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
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm"}
VIDEO_PREFIX_BYTES = 8 * 1024 * 1024  # uploads are faststart, so the first frame is near the start
_VIDEO_MISS_TTL = 600.0
_video_misses: dict[str, float] = {}
_ffmpeg_sem = asyncio.Semaphore(1)
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


def _frame_from_video_bytes(data: bytes, suffix: str) -> Optional[bytes]:
    """One JPEG frame from the first bytes of a video, via the bundled ffmpeg. Never raises."""
    import os
    import subprocess
    import tempfile

    try:
        from app.services.content_calendar_service import _ffmpeg_bin
        ffmpeg = _ffmpeg_bin()
    except Exception:
        ffmpeg = None
    if not ffmpeg or not data:
        return None
    src = out = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix or ".mp4", delete=False) as f:
            f.write(data)
            src = f.name
        out = src + ".jpg"
        for seek in ("1", "0"):
            res = subprocess.run(
                [ffmpeg, "-y", "-ss", seek, "-i", src, "-frames:v", "1", "-vf", "scale=800:-2", out],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15,
            )
            if res.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
                with open(out, "rb") as fh:
                    return fh.read()
        return None
    except Exception:
        return None
    finally:
        for path in (src, out):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass


async def _read_prefix(db, relative: str, limit: int) -> Optional[bytes]:
    from app.core.uploads import open_upload_response

    resp = await open_upload_response(db, relative)
    if isinstance(resp, FileResponse):
        def _rd():
            with open(resp.path, "rb") as fh:
                return fh.read(limit)
        return await asyncio.to_thread(_rd)
    it = getattr(resp, "body_iterator", None)
    if it is None:
        return None
    buf = bytearray()
    try:
        async for chunk in it:
            buf.extend(chunk if isinstance(chunk, (bytes, bytearray)) else str(chunk).encode())
            if len(buf) >= limit:
                break
    finally:
        close = getattr(it, "aclose", None)
        if close:
            try:
                await close()
            except Exception:
                pass
    return bytes(buf[:limit])


async def video_still_bytes(db, relative: str) -> Optional[bytes]:
    """A still for a stored video (caller already checked access).

    Drive: Drive's own preview first, then one frame from the first 8 MB.
    Uploaded to the app: one frame from the first 8 MB. Failures are remembered for 10 minutes.
    """
    import time

    now = time.monotonic()
    miss = _video_misses.get(relative)
    if miss and now - miss < _VIDEO_MISS_TTL:
        return None
    suffix = Path(relative).suffix.lower() or ".mp4"
    raw: Optional[bytes] = None
    try:
        if relative.startswith("gdrive/"):
            from app.services import google_drive_service as gdrive

            file_id = gdrive.file_id_from_path(relative)
            if file_id:
                try:
                    raw = await gdrive.fetch_drive_thumbnail_bytes(file_id, 800)
                except Exception as exc:
                    logger.info("drive video preview failed: %s", type(exc).__name__)
                if not raw:
                    prefix = await gdrive.download_file_prefix(file_id, VIDEO_PREFIX_BYTES)
                    if prefix:
                        async with _ffmpeg_sem:
                            raw = await asyncio.to_thread(_frame_from_video_bytes, prefix, suffix)
        else:
            prefix = await _read_prefix(db, relative, VIDEO_PREFIX_BYTES)
            if prefix:
                async with _ffmpeg_sem:
                    raw = await asyncio.to_thread(_frame_from_video_bytes, prefix, suffix)
    except HTTPException:
        raw = None
    except Exception as exc:
        logger.info("video still failed: %s", type(exc).__name__)
        raw = None
    if not raw:
        _video_misses[relative] = now
        return None
    _video_misses.pop(relative, None)
    return raw


async def thumbnail_response(db, *, company_id: str, relative: str, width: int, if_none_match: Optional[str]) -> Response:
    """Serve (and cache) a WebP preview. Access must already be checked by the caller."""
    from app.core.tenant import get_global_db

    is_video = Path(relative).suffix.lower() in VIDEO_EXTS
    if not is_video and Path(relative).suffix.lower() not in IMAGE_EXTS:
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
                raw = await (video_still_bytes(db, relative) if is_video else _read_source(db, relative))
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
