from datetime import datetime, timedelta, timezone
from typing import Optional, List
import jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from app.config import settings

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

    # Fetch live user record for up-to-date role / is_active / workspace_ids
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

    return {
        "id": user_id,
        "email": email,
        "name": payload.get("name", user_doc.get("full_name", "User") if user_doc else "User"),
        "role": user_doc.get("role", "editor") if user_doc else payload.get("role", "editor"),
        "is_active": user_doc.get("is_active", True) if user_doc else True,
        "workspace_ids": user_doc.get("workspace_ids", []) if user_doc else payload.get("workspace_ids", []),
    }


def require_roles(allowed_roles: List[str]):
    """Dependency factory that enforces role-based access control."""
    async def _check_role(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(allowed_roles)}.",
            )
        return current_user
    return _check_role


async def get_workspace_context(
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> str:
    """Extracts X-Workspace-ID header and verifies user authorization."""
    workspace_id = request.headers.get("X-Workspace-ID") or request.headers.get("x-workspace-id")
    if not workspace_id:
        if current_user.get("workspace_ids"):
            return current_user["workspace_ids"][0]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace specified and user has no assigned workspaces.",
        )

    # Admins have access to all workspaces
    if current_user.get("role") == "admin":
        return workspace_id

    # Check user membership
    user_workspaces = current_user.get("workspace_ids", [])
    if workspace_id not in user_workspaces:
        # Verify in DB if user is workspace owner or member
        from app.database import get_database
        db = get_database()
        if db is not None:
            ws = await db.workspaces.find_one({"id": workspace_id, "$or": [{"user_id": current_user["id"]}, {"member_ids": current_user["id"]}]})
            if ws:
                return workspace_id

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied to workspace '{workspace_id}'. User is not a authorized member.",
        )

    return workspace_id


require_editor_or_admin = require_roles(["admin", "editor"])

