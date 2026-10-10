import logging
from typing import Optional, Tuple
from fastapi import HTTPException, UploadFile, status

from app.config import settings

logger = logging.getLogger("app.services.avatar")

MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 MB


def is_cloudinary_configured() -> bool:
    """True when all required Cloudinary credentials are provided."""
    return bool(
        (settings.CLOUDINARY_CLOUD_NAME or "").strip()
        and (settings.CLOUDINARY_API_KEY or "").strip()
        and (settings.CLOUDINARY_API_SECRET or "").strip()
    )


def sniff_image_type(data: bytes) -> str:
    """
    Validate and return image mime type by magic bytes.
    Accepts JPEG, PNG, or WebP only. Never trusts client headers or extensions.
    """
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Unsupported image format. Allowed formats: JPEG, PNG, WebP.",
    )


async def read_and_validate_avatar_file(file: UploadFile) -> bytes:
    """
    Reads an uploaded avatar file in chunks, enforcing the 5 MB maximum size limit
    and magic-byte sniffing.
    """
    chunk_size = 64 * 1024
    buffer = bytearray()

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > MAX_AVATAR_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File too large. Maximum size is 5 MB.",
            )

    file_bytes = bytes(buffer)
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file uploaded.",
        )

    # Sniff real file type from payload bytes
    sniff_image_type(file_bytes)
    return file_bytes


def init_cloudinary():
    """Initializes cloudinary SDK config with project credentials."""
    if not is_cloudinary_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Profile photos are not configured.",
        )
    import cloudinary
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME.strip(),
        api_key=settings.CLOUDINARY_API_KEY.strip(),
        api_secret=settings.CLOUDINARY_API_SECRET.strip(),
        secure=True,
    )


async def upload_user_avatar(
    user_id: str,
    file_bytes: bytes,
    current_avatar_public_id: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Uploads avatar to Cloudinary in folder reamarc/avatars with user_id public_id,
    applying 512x512 face crop (c_fill, g_face, w_512, h_512, f_auto, q_auto).
    Deletes the previous avatar if public_id differs.
    Returns (secure_url, public_id).
    """
    init_cloudinary()
    import cloudinary.uploader

    try:
        result = cloudinary.uploader.upload(
            file_bytes,
            folder="reamarc/avatars",
            public_id=user_id,
            overwrite=True,
            invalidate=True,
            resource_type="image",
            transformation=[
                {
                    "width": 512,
                    "height": 512,
                    "crop": "fill",
                    "gravity": "face",
                    "fetch_format": "auto",
                    "quality": "auto",
                }
            ],
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Cloudinary upload failed for user %s: %s", user_id, type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to upload avatar to image service.",
        )

    new_public_id = result.get("public_id")
    secure_url = result.get("secure_url")

    # If previous public_id was different, delete it
    if current_avatar_public_id and current_avatar_public_id != new_public_id:
        try:
            cloudinary.uploader.destroy(current_avatar_public_id, invalidate=True)
        except Exception as del_exc:
            logger.warning(
                "Could not delete old avatar %s: %s",
                current_avatar_public_id,
                type(del_exc).__name__,
            )

    return secure_url, new_public_id


async def delete_user_avatar(public_id: Optional[str]) -> None:
    """
    Destroys the avatar asset in Cloudinary if configured and public_id exists.
    """
    if not is_cloudinary_configured() or not public_id:
        return
    init_cloudinary()
    import cloudinary.uploader

    try:
        cloudinary.uploader.destroy(public_id, invalidate=True)
    except Exception as exc:
        logger.warning("Could not delete avatar %s: %s", public_id, type(exc).__name__)
