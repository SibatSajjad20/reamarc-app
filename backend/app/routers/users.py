from datetime import datetime, timezone
import logging
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.database import get_database
from app.core.limiter import limiter
from app.core.security import get_current_user
from app.routers.auth import _build_user_response
from app.schemas.auth import UserResponse
from app.services import avatar_service

logger = logging.getLogger("app.routers.users")

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/me/avatar", response_model=UserResponse)
@limiter.limit("10/minute")
async def upload_my_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload and set avatar for the current authenticated user (owner only).
    Enforces magic byte validation (JPEG, PNG, WebP) and 5 MB size limit.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user_id = current_user["id"]
    user_doc = await db.users.find_one({"id": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found.")

    # Read and validate payload
    file_bytes = await avatar_service.read_and_validate_avatar_file(file)

    # Upload to Cloudinary and delete old image if needed
    current_public_id = user_doc.get("avatar_public_id")
    secure_url, new_public_id = await avatar_service.upload_user_avatar(
        user_id=user_id,
        file_bytes=file_bytes,
        current_avatar_public_id=current_public_id,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "avatar_url": secure_url,
                "avatar_public_id": new_public_id,
                "updated_at": now_iso,
            }
        },
    )

    updated_doc = await db.users.find_one({"id": user_id})
    return _build_user_response(updated_doc or user_doc)


@router.delete("/me/avatar", response_model=UserResponse)
@limiter.limit("10/minute")
async def delete_my_avatar(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Remove avatar for the current authenticated user (owner only).
    Destroys the asset on Cloudinary and clears user avatar fields.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user_id = current_user["id"]
    user_doc = await db.users.find_one({"id": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found.")

    current_public_id = user_doc.get("avatar_public_id")
    if current_public_id:
        await avatar_service.delete_user_avatar(current_public_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "avatar_url": None,
                "avatar_public_id": None,
                "updated_at": now_iso,
            }
        },
    )

    updated_doc = await db.users.find_one({"id": user_id})
    return _build_user_response(updated_doc or user_doc)
