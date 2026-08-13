from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.schemas.auth import UserLogin, TokenResponse, UserResponse
from app.schemas.error import ErrorResponse
from app.core.security import (
    get_password_hash, verify_password,
    create_access_token, create_refresh_token,
    decode_refresh_token, get_current_user,
)
from app.database import get_database
from app.config import settings
import uuid

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
    response.set_cookie(key="access_token", value=access_token, **cookie_opts)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        **cookie_opts,
    )


def _build_user_response(user_doc: dict) -> dict:
    return {
        "id": user_doc["id"],
        "email": user_doc["email"],
        "name": user_doc.get("full_name") or user_doc.get("name", "User"),
        "role": user_doc.get("role", "editor"),
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

    user_doc = await db.users.find_one({"email": user_in.email})
    if not user_doc or not verify_password(user_in.password, user_doc["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )

    claims = {
        "sub": user_doc["id"],
        "email": user_doc["email"],
        "name": user_doc.get("full_name") or user_doc.get("name", "User"),
        "role": user_doc.get("role", "editor"),
        "workspace_ids": user_doc.get("workspace_ids", []),
    }
    access_token = create_access_token(claims)
    refresh_token = create_refresh_token(claims)
    _set_auth_cookies(response, access_token, refresh_token)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": _build_user_response(user_doc),
    }


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
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

    claims = {
        "sub": user_doc["id"],
        "email": user_doc["email"],
        "name": user_doc.get("full_name") or user_doc.get("name", "User"),
        "role": user_doc.get("role", "editor"),
        "workspace_ids": user_doc.get("workspace_ids", []),
    }
    new_access_token = create_access_token(claims)
    new_refresh_token = create_refresh_token(claims)
    _set_auth_cookies(response, new_access_token, new_refresh_token)

    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "user": _build_user_response(user_doc),
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Successfully logged out."}
