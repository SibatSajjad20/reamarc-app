"""Shared square-logo validation for client logos and company branding."""

from __future__ import annotations

import asyncio
import io

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.services import avatar_service

MAX_LOGO_BYTES = 2 * 1024 * 1024
MAX_CONTENT_LENGTH = int(2.5 * 1024 * 1024)
MIN_SIDE = 128
MAX_SIDE = 4096
MAX_OUTPUT = 512

Image.MAX_IMAGE_PIXELS = MAX_SIDE * MAX_SIDE


def _detect_svg(data: bytes) -> bool:
    stripped = data.lstrip(b"\xef\xbb\xbf \t\r\n")
    return stripped[:1] == b"<" or b"<svg" in data[:1024].lower()


def _process_square_logo(data: bytes, *, label: str) -> bytes:
    if _detect_svg(data):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="SVG isn't accepted. Upload a PNG, JPG or WebP.",
        )
    avatar_service.sniff_image_type(data)

    try:
        with Image.open(io.BytesIO(data)) as img:
            width, height = img.size
            if width < MIN_SIDE or height < MIN_SIDE:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"{label} must be at least 128 × 128 px.",
                )
            if width > MAX_SIDE or height > MAX_SIDE:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"{label} can't be larger than 4096 × 4096 px.",
                )
            img = ImageOps.exif_transpose(img).convert("RGBA")
            side = max(img.size)
            canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            canvas.paste(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2), img)
            canvas.thumbnail((MAX_OUTPUT, MAX_OUTPUT))
            out = io.BytesIO()
            canvas.save(out, format="PNG", optimize=True)
            return out.getvalue()
    except HTTPException:
        raise
    except Image.DecompressionBombError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} can't be larger than 4096 × 4096 px.",
        )
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Couldn't read that image. Upload a PNG, JPG or WebP.",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Couldn't read that image. Upload a PNG, JPG or WebP.",
        )


async def read_validate_square_logo(file: UploadFile, *, label: str = "Logo") -> bytes:
    content_length = file.headers.get("content-length") if getattr(file, "headers", None) else None
    if content_length:
        try:
            if int(content_length) > MAX_CONTENT_LENGTH:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"{label} must be 2 MB or smaller.",
                )
        except ValueError:
            pass

    buffer = bytearray()
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > MAX_LOGO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"{label} must be 2 MB or smaller.",
            )

    data = bytes(buffer)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file uploaded.")

    return await asyncio.to_thread(_process_square_logo, data, label=label)
