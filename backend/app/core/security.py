from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any
import uuid
import jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from app.config import settings
from app.models.user import UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)
JWT_ALGORITHM = "HS256"
_MAX_REFRESH_JTIS = 8

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
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    if not to_encode.get("jti"):
        to_encode["jti"] = uuid.uuid4().hex
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except jwt.PyJWTError:
        return None

def decode_refresh_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except jwt.PyJWTError:
        return None


def user_session_epoch(user_doc: Optional[dict]) -> int:
    """Integer bumped on logout / password change to invalidate outstanding JWTs."""
    if not user_doc:
        return 0
    try:
        return int(user_doc.get("session_epoch") or 0)
    except (TypeError, ValueError):
        return 0


def token_session_epoch(payload: Optional[dict]) -> int:
    if not payload:
        return 0
    try:
        return int(payload.get("ver") or 0)
    except (TypeError, ValueError):
        return 0


async def bump_session_epoch(db: Any, user_id: str) -> None:
    if db is None or not user_id:
        return
    await db.users.update_one(
        {"id": user_id},
        {"$inc": {"session_epoch": 1}, "$set": {"refresh_jtis": []}},
    )


async def remember_refresh_jti(db: Any, user_id: str, jti: str) -> None:
    if db is None or not user_id or not jti:
        return
    await db.users.update_one(
        {"id": user_id},
        {"$push": {"refresh_jtis": {"$each": [jti], "$slice": -_MAX_REFRESH_JTIS}}},
    )


async def rotate_refresh_jti(db: Any, user_id: str, old_jti: str, new_jti: str) -> bool:
    if db is None or not user_id or not old_jti or not new_jti:
        return False
    result = await db.users.update_one(
        {"id": user_id, "refresh_jtis": old_jti},
        {"$set": {"refresh_jtis.$": new_jti}},
    )
    return int(getattr(result, "modified_count", 0) or 0) == 1


def claims_with_session(user_doc: dict, base: dict) -> dict:
    out = dict(base)
    out["ver"] = user_session_epoch(user_doc)
    return out

def _normalize_role(raw_role: Optional[str]) -> str:
    """Normalizes role strings to supported UserRole values."""
    if not raw_role:
        return UserRole.TEAM_MEMBER.value
    r = str(raw_role).lower().strip()
    if r in (UserRole.ADMIN.value, "admin"):
        return UserRole.ADMIN.value
    if r in (UserRole.HR.value, "hr"):
        return UserRole.HR.value
    if r in (UserRole.OPERATIONS.value, "operations", "ops"):
        return UserRole.OPERATIONS.value
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
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Authentication cannot be verified.",
        )

    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )

    if token_session_epoch(payload) != user_session_epoch(user_doc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    effective_role = _normalize_role(user_doc.get("role"))

    return {
        "id": user_id,
        "email": user_doc.get("email") or email,
        "name": user_doc.get("full_name") or user_doc.get("name") or payload.get("name", "User"),
        "full_name": user_doc.get("full_name") or user_doc.get("name") or payload.get("name", "User"),
        "role": effective_role,
        "department": user_doc.get("department"),
        "designation": user_doc.get("designation"),
        "is_active": user_doc.get("is_active", True),
        "workspace_ids": user_doc.get("workspace_ids", []),
        "crm_enabled": user_doc.get("crm_enabled"),
        "crm_paused": user_doc.get("crm_paused"),
    }


_MANAGEMENT_ROLES = {
    UserRole.ADMIN.value,
    UserRole.HR.value,
    UserRole.OPERATIONS.value,
    "admin",
    "hr",
    "operations",
}


def assert_workspace_access(current_user: dict, workspace_id: Optional[str]) -> Optional[str]:
    """
    Enforce workspace membership for X-Workspace-ID / query workspace_id.
    Returns a concrete workspace id to filter on, or None when management may see all.
    Raises 403 when the caller may not access the requested workspace.
    """
    role = current_user.get("role")
    allowed = list(current_user.get("workspace_ids") or [])
    is_mgmt = role in _MANAGEMENT_ROLES

    if not workspace_id or str(workspace_id).lower() in ("all", "global"):
        if is_mgmt:
            return None
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No workspace access assigned to this account.",
            )
        # Non-management "ALL" collapses to their assigned set; caller must use $in.
        return "__scoped__"

    if is_mgmt:
        return workspace_id

    if workspace_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized for this workspace.",
        )
    return workspace_id


def workspace_mongo_filter(current_user: dict, workspace_id: Optional[str], field: str = "workspace_id") -> dict:
    """Build a Mongo filter fragment for workspace scoping."""
    resolved = assert_workspace_access(current_user, workspace_id)
    if resolved is None:
        return {}
    if resolved == "__scoped__":
        return {field: {"$in": list(current_user.get("workspace_ids") or [])}}
    return {field: resolved}


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


async def require_operations_or_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency guard requiring Operations or Admin privileges."""
    role = current_user.get("role")
    if role not in (UserRole.ADMIN.value, UserRole.OPERATIONS.value, "admin", "operations"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operations or Administrative privileges required.",
        )
    return current_user


async def require_management_role(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency guard requiring Admin, HR, or Operations privileges."""
    role = current_user.get("role")
    if role not in (UserRole.ADMIN.value, UserRole.HR.value, UserRole.OPERATIONS.value, "admin", "hr", "operations"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Management (Admin, HR, or Operations) privileges required.",
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
    """Extracts X-Workspace-ID and enforces membership."""
    workspace_id = (
        request.headers.get("X-Workspace-ID")
        or request.headers.get("x-workspace-id")
        or request.headers.get("X-Account-ID")
        or request.headers.get("x-account-id")
    )
    if not workspace_id:
        return None
    resolved = assert_workspace_access(current_user, workspace_id)
    if resolved == "__scoped__":
        return None
    return resolved


# Campaign editors: any internal staff with workspace membership (asserted per handler).
require_editor_or_admin = require_roles(["admin", "hr", "operations", "team_lead", "team_member"])
# Ad-account secrets: operations/admin only (not every team_member).
require_ad_credential_admin = require_operations_or_admin
