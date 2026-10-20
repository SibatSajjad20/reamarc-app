"""Signed Cloudinary uploads wrapped so they don't block the event loop."""

from __future__ import annotations

import asyncio
import logging
from typing import Iterable, Optional, Sequence, Tuple

from fastapi import HTTPException, status

from app.config import settings

logger = logging.getLogger("app.services.cloudinary")


def is_configured() -> bool:
    return bool(
        (settings.CLOUDINARY_CLOUD_NAME or "").strip()
        and (settings.CLOUDINARY_API_KEY or "").strip()
        and (settings.CLOUDINARY_API_SECRET or "").strip()
    )


def _configure(not_configured_detail: str) -> None:
    if not is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=not_configured_detail,
        )
    import cloudinary

    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME.strip(),
        api_key=settings.CLOUDINARY_API_KEY.strip(),
        api_secret=settings.CLOUDINARY_API_SECRET.strip(),
        secure=True,
    )


def _upload_sync(
    data: bytes,
    *,
    folder: str,
    public_id: str,
    tags: Optional[Sequence[str]],
    overwrite: bool,
    invalidate: bool,
    transformation: Optional[list],
    not_configured_detail: str,
) -> Tuple[str, str]:
    _configure(not_configured_detail)
    import cloudinary.uploader

    kwargs = {
        "folder": folder,
        "public_id": public_id,
        "overwrite": overwrite,
        "invalidate": invalidate,
        "resource_type": "image",
    }
    if tags:
        kwargs["tags"] = list(tags)
    if transformation:
        kwargs["transformation"] = transformation
    result = cloudinary.uploader.upload(data, **kwargs)
    return result.get("secure_url"), result.get("public_id")


def _destroy_sync(public_id: str) -> None:
    if not is_configured() or not public_id:
        return
    _configure("Image storage is not configured.")
    import cloudinary.uploader

    cloudinary.uploader.destroy(public_id, invalidate=True)


async def upload_image(
    data: bytes,
    *,
    folder: str,
    public_id: str,
    tags: Optional[Iterable[str]] = None,
    overwrite: bool = False,
    invalidate: bool = False,
    transformation: Optional[list] = None,
    not_configured_detail: str = "Couldn't upload the image. Try again.",
    upload_error_detail: str = "Couldn't upload the image. Try again.",
) -> Tuple[str, str]:
    try:
        return await asyncio.to_thread(
            _upload_sync,
            data,
            folder=folder,
            public_id=public_id,
            tags=list(tags) if tags is not None else None,
            overwrite=overwrite,
            invalidate=invalidate,
            transformation=transformation,
            not_configured_detail=not_configured_detail,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Cloudinary upload failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=upload_error_detail,
        )


async def destroy(public_id: Optional[str]) -> None:
    if not public_id:
        return
    try:
        await asyncio.to_thread(_destroy_sync, public_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Could not delete image %s: %s", public_id, type(exc).__name__)
