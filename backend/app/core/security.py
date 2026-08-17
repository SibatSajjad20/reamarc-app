from datetime import datetime, timedelta, timezone
from typing import Optional, List
import jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from app.config import settings
from app.models.user import UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode("utf-8")[:72]
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(pwd_bytes, hashed_bytes)

def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except jwt.PyJWTError:
        return None

def decode_refresh_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except jwt.PyJWTError:
        return None

def _normalize_role(raw_role: Optional[str]) -> str:
    """Normalizes role strings to supported UserRole values."""
    if not raw_role:
        return UserRole.TEAM_MEMBER.value
    r = str(raw_role).lower().strip()
    if r in (UserRole.ADMIN.value, "admin"):
        return UserRole.ADMIN.value
    if r in (UserRole.HR.value, "hr"):
        return UserRole.HR.value
    if r in (UserRole.TEAM_LEAD.value, "team_lead", "lead"):
        return UserRole.TEAM_LEAD.value
    if r in (UserRole.CLIENT.value, "client"):
        return UserRole.CLIENT.value
    return UserRole.TEAM_MEMBER.value

async def get_current_user(
    request: Request,
    token_from_header: Optional[str] = Depends(oauth2_scheme)
) -> dict:
    token = token_from_header or request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Access token missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    email: str = payload.get("email")
    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing required user claims.",
        )

    # Fetch live user record for up-to-date role / is_active / department / designation
    from app.database import get_database
    db = get_database()
    user_doc = None
    if db is not None:
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})

    if user_doc and not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )

    effective_role = _normalize_role(
        user_doc.get("role") if user_doc else payload.get("role")
    )

    return {
        "id": user_id,
        "email": email,
        "name": payload.get("name", user_doc.get("full_name", "User") if user_doc else "User"),
        "full_name": user_doc.get("full_name", payload.get("name", "User")) if user_doc else "User",
        "role": effective_role,
        "department": user_doc.get("department") if user_doc else None,
        "designation": user_doc.get("designation") if user_doc else None,
        "is_active": user_doc.get("is_active", True) if user_doc else True,
        "workspace_ids": user_doc.get("workspace_ids", []) if user_doc else payload.get("workspace_ids", []),
    }


def require_roles(allowed_roles: List[str]):
    """Dependency factory that enforces role-based access control."""
    normalized_allowed = [_normalize_role(r) for r in allowed_roles]
    async def _check_role(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role", UserRole.TEAM_MEMBER.value)
        if user_role not in normalized_allowed and user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(allowed_roles)}.",
            )
        return current_user
    return _check_role


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency guard strictly requiring UserRole.ADMIN."""
    if current_user.get("role") != UserRole.ADMIN.value and current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required.",
        )
    return current_user


async def require_hr_or_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency guard requiring HR or Admin privileges."""
    role = current_user.get("role")
    if role not in (UserRole.ADMIN.value, UserRole.HR.value, "admin", "hr"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR or Administrative privileges required.",
        )
    return current_user


async def require_internal_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency guard requiring an internal team member/lead/hr/admin (blocks external clients)."""
    role = current_user.get("role")
    if role in (UserRole.CLIENT.value, "client"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Internal agency access only.",
        )
    return current_user


async def require_member_or_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency guard requiring internal staff privileges."""
    return await require_internal_user(current_user)


async def get_workspace_context(
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> Optional[str]:
    """Extracts optional X-Workspace-ID / X-Account-ID header or returns None."""
    workspace_id = (
        request.headers.get("X-Workspace-ID")
        or request.headers.get("x-workspace-id")
        or request.headers.get("X-Account-ID")
        or request.headers.get("x-account-id")
    )
    return workspace_id or "global"


require_editor_or_admin = require_roles(["admin", "hr", "team_lead", "team_member"])
