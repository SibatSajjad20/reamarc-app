from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timedelta, timezone
import uuid
import re
import secrets
import logging

logger = logging.getLogger(__name__)
from app.schemas.auth import (
    UserLogin, TokenResponse, UserResponse,
    ForgotPasswordRequest, VerifyResetCodeRequest, ResetPasswordRequest,
    ForgotPasswordResponse, VerifyResetCodeResponse, ResetPasswordResponse,
)
from app.schemas.error import ErrorResponse
from app.core.security import (
    get_password_hash, verify_password,
    create_access_token, create_refresh_token,
    decode_refresh_token, get_current_user,
    _normalize_role,
)
from app.services.email_service import EmailService
from app.database import get_database
from app.config import settings

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)
limiter = Limiter(key_func=get_remote_address)

def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    is_prod = settings.IS_PRODUCTION
    cookie_opts = dict(
        httponly=True,
        samesite="none" if is_prod else "lax",
        secure=True if is_prod else settings.COOKIE_SECURE
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **cookie_opts,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        **cookie_opts,
    )


def _build_user_response(user_doc: dict) -> dict:
    role_str = _normalize_role(user_doc.get("role"))
    return {
        "id": user_doc.get("id") or str(user_doc.get("_id")),
        "email": user_doc["email"],
        "name": user_doc.get("full_name") or user_doc.get("name", "User"),
        "role": role_str,
        "department": user_doc.get("department"),
        "designation": user_doc.get("designation"),
        "is_active": user_doc.get("is_active", True),
        "workspace_ids": user_doc.get("workspace_ids", []),
    }


@router.options("/login")
async def options_auth_handler():
    return Response(status_code=200)


# ──────────────────────────────────────────────────────────
# Public registration is DISABLED — admin-only user creation
# ──────────────────────────────────────────────────────────
@router.post("/register", status_code=status.HTTP_403_FORBIDDEN)
async def register_disabled():
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Public registration is disabled. Contact your administrator to create an account.",
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, user_in: UserLogin, response: Response):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection to MongoDB is currently unavailable.",
        )

    email_clean = str(user_in.email).lower().strip()
    user_doc = await db.users.find_one({"email": email_clean})
    if not user_doc:
        # Fallback to case-insensitive match if stored in mixed case
        user_doc = await db.users.find_one({"email": {"$regex": f"^{re.escape(email_clean)}$", "$options": "i"}})

    if not user_doc or not verify_password(user_in.password, user_doc.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )

    role_str = _normalize_role(user_doc.get("role"))
    claims = {
        "sub": user_doc.get("id") or str(user_doc.get("_id")),
        "email": user_doc["email"],
        "name": user_doc.get("full_name") or user_doc.get("name", "User"),
        "role": role_str,
        "workspace_ids": user_doc.get("workspace_ids", []),
    }
    user_id = user_doc.get("id") or str(user_doc.get("_id"))
    if user_in.device_uuid:
        from app.services.device_registry import assert_device_login_allowed
        await assert_device_login_allowed(user_id, user_in.device_uuid)

    access_token = create_access_token(claims)
    refresh_token = create_refresh_token(claims)
    _set_auth_cookies(response, access_token, refresh_token)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": _build_user_response(user_doc),
    }


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        try:
            payload_json = await request.json()
            if isinstance(payload_json, dict):
                token = (payload_json.get("refresh_token") or "").strip() or None
        except Exception:
            token = None
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing.")

    payload = decode_refresh_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")

    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database unavailable.")

    user_doc = await db.users.find_one({"id": payload["sub"]})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")

    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account deactivated.")

    role_str = _normalize_role(user_doc.get("role"))
    claims = {
        "sub": user_doc.get("id") or str(user_doc.get("_id")),
        "email": user_doc["email"],
        "name": user_doc.get("full_name") or user_doc.get("name", "User"),
        "role": role_str,
        "workspace_ids": user_doc.get("workspace_ids", []),
    }
    new_access_token = create_access_token(claims)
    new_refresh_token = create_refresh_token(claims)
    _set_auth_cookies(response, new_access_token, new_refresh_token)

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "user": _build_user_response(user_doc),
    }


from app.schemas.user import UserProfileUpdate


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.put("/me/profile", response_model=UserResponse)
@router.patch("/me/profile", response_model=UserResponse)
async def update_my_profile(
    profile_in: UserProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user_id = current_user["id"]
    user_doc = await db.users.find_one({"id": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found.")

    update_fields = {}

    if profile_in.full_name is not None and profile_in.full_name.strip():
        update_fields["full_name"] = profile_in.full_name.strip()
        update_fields["name"] = profile_in.full_name.strip()

    if profile_in.email is not None:
        new_email = str(profile_in.email).lower().strip()
        if new_email != user_doc.get("email"):
            existing = await db.users.find_one({"email": new_email, "id": {"$ne": user_id}})
            if existing:
                raise HTTPException(status_code=400, detail="Email is already taken by another account.")
            update_fields["email"] = new_email

    if profile_in.phone is not None and profile_in.phone.strip():
        update_fields["phone"] = profile_in.phone.strip()
        update_fields["phone_number"] = profile_in.phone.strip()

    if profile_in.new_password:
        if len(profile_in.new_password) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")

        current_hash = user_doc.get("hashed_password")
        if current_hash:
            if not profile_in.current_password or not verify_password(profile_in.current_password, current_hash):
                raise HTTPException(status_code=400, detail="Current password is incorrect.")

        update_fields["hashed_password"] = get_password_hash(profile_in.new_password)

    if not update_fields:
        return _build_user_response(user_doc)

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated_doc = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": update_fields},
        return_document=True
    )

    return _build_user_response(updated_doc or user_doc)


@router.post("/logout")
async def logout(response: Response):
    is_prod = settings.IS_PRODUCTION
    cookie_opts = dict(
        httponly=True,
        samesite="none" if is_prod else "lax",
        secure=True if is_prod else settings.COOKIE_SECURE
    )
    response.delete_cookie("access_token", **cookie_opts)
    response.delete_cookie("refresh_token", **cookie_opts)
    return {"message": "Successfully logged out."}


# ──────────────────────────────────────────────────────────
# Password Reset Flow (Forgot Password, Verify Code, Reset)
# ──────────────────────────────────────────────────────────

@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("10/minute")
async def forgot_password(request: Request, payload: ForgotPasswordRequest):
    """
    Step 1: Initiates password reset by dispatching a 6-digit OTP code to the registered email.
    Returns generic success message to prevent account enumeration.
    """
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is currently unavailable.",
        )

    email_clean = str(payload.email).lower().strip()
    user_doc = await db.users.find_one({"email": email_clean})
    if not user_doc:
        user_doc = await db.users.find_one({"email": {"$regex": f"^{re.escape(email_clean)}$", "$options": "i"}})

    # Generic success response to prevent user enumeration attacks
    generic_response = {"message": "If an account with that email exists, a verification code has been sent."}

    if user_doc and user_doc.get("is_active", True):
        # Generate secure random 6-digit numeric verification code
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        code_hash = get_password_hash(code)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=10)

        # Clear any prior unused reset requests for this email
        await db.password_resets.delete_many({"email": email_clean})

        # Insert new reset record
        await db.password_resets.insert_one({
            "id": str(uuid.uuid4()),
            "email": email_clean,
            "code_hash": code_hash,
            "created_at": now,
            "expires_at": expires_at,
            "attempts": 0,
            "used": False,
        })

        # Dispatch branded email asynchronously with error resilience
        recipient_name = user_doc.get("full_name") or user_doc.get("name", "User")
        try:
            await EmailService.send_password_reset_code(
                recipient_email=email_clean,
                code=code,
                recipient_name=recipient_name,
            )
        except Exception as err:
            logger.error(f"Error during forgot_password email dispatch: {err}")

    return generic_response


from pymongo import ReturnDocument


@router.post("/verify-reset-code", response_model=VerifyResetCodeResponse)
@limiter.limit("20/minute")
async def verify_reset_code(request: Request, payload: VerifyResetCodeRequest):
    """
    Step 2: Validates the 6-digit OTP code before displaying new password input fields.
    Tracks attempts and locks reset request after 5 failed attempts.
    """
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is currently unavailable.",
        )

    email_clean = str(payload.email).lower().strip()
    code_clean = payload.code.strip()

    reset_doc = await db.password_resets.find_one(
        {"email": email_clean, "used": False},
        sort=[("created_at", -1)]
    )

    if not reset_doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code. Please request a new code.",
        )

    current_attempts = reset_doc.get("attempts", 0)
    if current_attempts >= 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many failed attempts. This verification code has been locked. Please request a new code.",
        )

    now = datetime.now(timezone.utc)
    expires_at = reset_doc.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except Exception:
            expires_at = None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if not expires_at or now > expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new code.",
        )

    if not verify_password(code_clean, reset_doc.get("code_hash", "")):
        updated = await db.password_resets.find_one_and_update(
            {"_id": reset_doc["_id"]},
            {"$inc": {"attempts": 1}},
            return_document=ReturnDocument.AFTER
        )
        new_attempts = updated.get("attempts", current_attempts + 1) if updated else current_attempts + 1
        remaining = max(0, 5 - new_attempts)
        if remaining == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many failed attempts. This verification code has been locked. Please request a new code.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining.",
        )

    return {"message": "Verification code is valid.", "valid": True}


@router.post("/reset-password", response_model=ResetPasswordResponse)
@limiter.limit("10/minute")
async def reset_password(request: Request, payload: ResetPasswordRequest):
    """
    Step 3: Verifies the code one final time, hashes the new password with bcrypt,
    updates the user document in MongoDB, and marks the reset record as used.
    """
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is currently unavailable.",
        )

    if len(payload.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long.",
        )

    email_clean = str(payload.email).lower().strip()
    code_clean = payload.code.strip()

    user_doc = await db.users.find_one({"email": email_clean})
    if not user_doc:
        user_doc = await db.users.find_one({"email": {"$regex": f"^{re.escape(email_clean)}$", "$options": "i"}})

    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account associated with this email was not found.",
        )

    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )

    reset_doc = await db.password_resets.find_one(
        {"email": email_clean, "used": False},
        sort=[("created_at", -1)]
    )

    if not reset_doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code. Please request a new code.",
        )

    current_attempts = reset_doc.get("attempts", 0)
    if current_attempts >= 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many failed attempts. This verification code has been locked. Please request a new code.",
        )

    now = datetime.now(timezone.utc)
    expires_at = reset_doc.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except Exception:
            expires_at = None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if not expires_at or now > expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new code.",
        )

    if not verify_password(code_clean, reset_doc.get("code_hash", "")):
        updated = await db.password_resets.find_one_and_update(
            {"_id": reset_doc["_id"]},
            {"$inc": {"attempts": 1}},
            return_document=ReturnDocument.AFTER
        )
        new_attempts = updated.get("attempts", current_attempts + 1) if updated else current_attempts + 1
        remaining = max(0, 5 - new_attempts)
        if remaining == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many failed attempts. This verification code has been locked. Please request a new code.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining.",
        )

    # Invalidate the reset record atomically to prevent race-condition re-use
    updated_reset = await db.password_resets.find_one_and_update(
        {"_id": reset_doc["_id"], "used": False},
        {"$set": {"used": True, "used_at": now}}
    )
    if not updated_reset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has already been used. Please request a new code.",
        )

    # Hash new password and update user record
    new_hashed_password = get_password_hash(payload.new_password)
    await db.users.update_one(
        {"_id": user_doc["_id"]},
        {"$set": {
            "hashed_password": new_hashed_password,
            "updated_at": now.isoformat(),
        }}
    )

    # Invalidate / mark used all other pending reset tokens for this user
    await db.password_resets.update_many(
        {"email": email_clean, "used": False},
        {"$set": {"used": True, "used_at": now}}
    )

    return {"message": "Password has been successfully reset. You can now log in with your new password."}

