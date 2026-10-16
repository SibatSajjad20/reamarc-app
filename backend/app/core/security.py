from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any, Dict
import time
import uuid
import jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from app.config import settings
from app.models.user import UserRole

_AUTH_CACHE: Dict[str, Dict[str, Any]] = {}
_AUTH_CACHE_TTL_SECONDS = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)
JWT_ALGORITHM = "HS256"
_MAX_REFRESH_JTIS = 8
_MAX_RETIRED_REFRESH_JTIS = 32
# Parallel refreshes in one browser present the same token. Treat that replay as
# a race for this long, then reject it without signing out any other session.
REFRESH_ROTATION_GRACE_SECONDS = 60

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode("utf-8")[:72]
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(pwd_bytes, hashed_bytes)

async def lookup_company(company_id_or_slug: str) -> Optional[dict]:
    """Allowed global lookup for companies during authentication."""
    from app.core.tenant import get_global_db
    gdb = get_global_db()
    if gdb is None:
        return None
    comp = await gdb.companies.find_one({"id": company_id_or_slug})
    if not comp:
        comp = await gdb.companies.find_one({"slug": company_id_or_slug})
    return comp

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
    if "jti" not in to_encode:
        to_encode["jti"] = uuid.uuid4().hex
    to_encode.update({
        "exp": expire,
        "type": to_encode.get("type", "access"),
        "typ": to_encode.get("typ", "access"),
    })
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    if not to_encode.get("jti"):
        to_encode["jti"] = uuid.uuid4().hex
    to_encode.update({
        "exp": expire,
        "type": "refresh",
        "typ": "refresh",
    })
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)

def create_owner_token(user_id: str, company_id: Optional[str] = None) -> str:
    """15-minute owner re-auth session token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode = {
        "sub": user_id,
        "cid": company_id or "company_reamarc",
        "jti": uuid.uuid4().hex,
        "exp": expire,
        "type": "owner",
        "typ": "owner",
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)

def create_impersonation_token(user_id: str, company_id: str, read_only: bool = True, reason: str = "") -> str:
    """Owner impersonation token. Read-only lasts 60m, edit lasts 30m."""
    duration_minutes = 60 if read_only else 30
    expire = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
    to_encode = {
        "sub": user_id,
        "cid": company_id,
        "imp_cid": company_id,
        "ro": read_only,
        "reason_id": reason,
        "jti": uuid.uuid4().hex,
        "exp": expire,
        "type": "access",
        "typ": "imp",
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
        typ = payload.get("typ") or payload.get("type")
        if typ not in ("access", "imp"):
            return None
        return payload
    except jwt.PyJWTError:
        return None

def decode_refresh_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
        typ = payload.get("typ") or payload.get("type")
        if typ != "refresh":
            return None
        return payload
    except jwt.PyJWTError:
        return None

def decode_owner_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
        typ = payload.get("typ") or payload.get("type")
        if typ != "owner":
            return None
        return payload
    except jwt.PyJWTError:
        return None


def user_session_epoch(user_doc: Optional[dict]) -> int:
    """Integer bumped on password change or legacy logout to invalidate outstanding JWTs."""
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
    now = datetime.now(timezone.utc).isoformat()
    result = await db.users.update_one(
        {"id": user_id, "refresh_jtis": old_jti},
        {
            "$set": {"refresh_jtis.$": new_jti},
            "$push": {
                "refresh_retired": {
                    "$each": [{"jti": old_jti, "at": now}],
                    "$slice": -_MAX_RETIRED_REFRESH_JTIS,
                }
            },
        },
    )
    return int(getattr(result, "modified_count", 0) or 0) == 1


async def revoke_refresh_jtis(db: Any, user_id: str, jtis: List[str]) -> None:
    """Drop one browser's refresh ids. Other browsers of this account stay signed in."""
    ids = [str(j) for j in jtis if j]
    if db is None or not user_id or not ids:
        return
    await db.users.update_one(
        {"id": user_id},
        {"$pull": {"refresh_jtis": {"$in": ids}}},
    )


def decide_refresh_action(
    old_jti: str,
    existing_jtis: List[str],
    *,
    recently_retired: bool,
) -> str:
    """How to treat one refresh token without affecting other browsers.

    rotate: this browser's token is current.
    grace: this token was rotated moments ago by a parallel request.
    legacy: this account has no tracked refresh tokens yet.
    reject: this token is stale. The caller must not revoke other sessions.
    """
    if old_jti and old_jti in existing_jtis:
        return "rotate"
    if old_jti and recently_retired:
        return "grace"
    if not existing_jtis:
        return "legacy"
    return "reject"


def retired_jti_is_recent(
    entries: Optional[List[Any]],
    jti: str,
    *,
    now: Optional[datetime] = None,
    grace_seconds: int = REFRESH_ROTATION_GRACE_SECONDS,
) -> bool:
    if not jti or not entries:
        return False
    current = now or datetime.now(timezone.utc)
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("jti") or "") != jti or entry.get("consumed"):
            continue
        stamp = _parse_iso(str(entry.get("at") or ""))
        if stamp is None:
            continue
        if (current - stamp).total_seconds() <= grace_seconds:
            return True
    return False


def _parse_iso(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


async def accept_retired_refresh(
    db: Any, user_id: str, old_jti: str, new_jti: str, fresh_doc: Optional[dict] = None
) -> bool:
    """Accept one replay of a just-rotated refresh token.

    The winning request already kept that browser signed in. A second copy of the
    same token must not bump session_epoch, or every other browser of this account
    is signed out.
    """
    if db is None or not user_id or not old_jti or not new_jti:
        return False
    if fresh_doc is not None and "refresh_retired" in fresh_doc:
        refresh_retired = fresh_doc.get("refresh_retired")
    else:
        fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "refresh_retired": 1})
        refresh_retired = (fresh or {}).get("refresh_retired")
    if not retired_jti_is_recent(refresh_retired, old_jti):
        return False
    consumed = await db.users.update_one(
        {
            "id": user_id,
            "refresh_retired": {"$elemMatch": {"jti": old_jti, "consumed": {"$ne": True}}},
        },
        {"$set": {"refresh_retired.$.consumed": True}},
    )
    if int(getattr(consumed, "modified_count", 0) or 0) != 1:
        return False
    await remember_refresh_jti(db, user_id, new_jti)
    return True


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
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing required user claims.",
        )

    now_mono = time.monotonic()
    cached = _AUTH_CACHE.get(user_id)
    if cached and (now_mono - cached["time"] < _AUTH_CACHE_TTL_SECONDS):
        user_doc = cached["user"]
        company_doc = cached["company"]
    else:
        from app.core.tenant import get_global_db
        gdb = get_global_db()
        if gdb is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database unavailable. Authentication cannot be verified.",
            )

        user_doc = await gdb.users.find_one({"id": user_id}, {"hashed_password": 0})
        if not user_doc:
            user_doc = await gdb.users.find_one({"_id": user_id}, {"hashed_password": 0})
        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account not found.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        cid_from_user = user_doc.get("company_id") or "company_reamarc"
        company_doc = await gdb.companies.find_one({"id": cid_from_user})
        if not company_doc:
            company_doc = await gdb.companies.find_one({"slug": "reamarc"})

        _AUTH_CACHE[user_id] = {
            "user": user_doc,
            "company": company_doc,
            "time": now_mono,
        }

    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )

    token_cid = payload.get("cid")
    token_tv = payload.get("tv")
    token_ctv = payload.get("ctv")
    typ = payload.get("typ") or payload.get("type", "access")
    is_imp = (typ == "imp")

    if is_imp:
        if not user_doc.get("is_super_admin"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Impersonation token invalid for non-super-admin user.",
            )
        target_cid = token_cid or payload.get("imp_cid")
        if target_cid:
            from app.core.tenant import get_global_db
            gdb_inst = get_global_db()
            if gdb_inst is not None:
                imp_comp = await gdb_inst.companies.find_one({"id": target_cid})
                if imp_comp:
                    company_doc = imp_comp

    # Multi-tenancy checks
    if (getattr(settings, "MULTI_TENANT_ENABLED", False) or token_cid) and not is_imp:
        expected_cid = user_doc.get("company_id") or "company_reamarc"
        if token_cid and token_cid != expected_cid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token company mismatch.",
            )

        if token_tv is not None:
            if int(user_doc.get("token_version", 0)) != int(token_tv):
                _AUTH_CACHE.pop(user_id, None)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session revoked. Please sign in again.",
                )

        if company_doc:
            if company_doc.get("status") == "suspended":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This company's access is paused.",
                )
            if token_ctv is not None and int(company_doc.get("token_version", 0)) != int(token_ctv):
                _AUTH_CACHE.pop(user_id, None)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Company session revoked.",
                )
    elif not is_imp:
        if token_session_epoch(payload) != user_session_epoch(user_doc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Legacy sid check
    session_id = str(payload.get("sid") or "").strip()
    if session_id:
        active_sessions = [str(j) for j in (user_doc.get("refresh_jtis") or []) if j]
        if session_id not in active_sessions:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    effective_cid = token_cid or user_doc.get("company_id") or "company_reamarc"
    is_imp = (typ == "imp")
    is_ro = bool(is_imp and payload.get("ro", True))

    from app.core.tenant import set_tenant_context, TenantContext
    set_tenant_context(TenantContext(
        company_id=effective_cid,
        user_id=user_id,
        is_owner=bool(user_doc.get("is_super_admin", False)),
        impersonating=is_imp,
        read_only=is_ro,
        request_id=request.headers.get("X-Request-ID"),
    ))

    # Read-only impersonation restrictions
    if is_imp:
        if is_ro and request.method not in ("GET", "HEAD", "OPTIONS"):
            raise HTTPException(status_code=403, detail="Writes are disabled during read-only owner session")
        req_path = request.url.path
        if "/owner" in req_path or "/change-password" in req_path:
            raise HTTPException(status_code=403, detail="Owner actions blocked during impersonation")

    effective_role = _normalize_role(user_doc.get("role"))

    company_payload = None
    if company_doc:
        company_payload = {
            "id": company_doc.get("id"),
            "name": company_doc.get("name"),
            "slug": company_doc.get("slug"),
            "logo_url": company_doc.get("logo_url"),
            "accent_color": company_doc.get("accent_color", "#6847E0"),
            "timezone": company_doc.get("timezone", "Asia/Karachi"),
        }

    return {
        "id": user_id,
        "email": user_doc.get("email") or email or user_doc.get("email"),
        "name": user_doc.get("full_name") or user_doc.get("name") or payload.get("name", "User"),
        "full_name": user_doc.get("full_name") or user_doc.get("name") or payload.get("name", "User"),
        "role": effective_role,
        "department": user_doc.get("department"),
        "departments": user_doc.get("departments") or [],
        "primary_department": user_doc.get("primary_department"),
        "designation": user_doc.get("designation"),
        "is_active": user_doc.get("is_active", True),
        "workspace_ids": user_doc.get("workspace_ids", []),
        "crm_enabled": user_doc.get("crm_enabled"),
        "crm_paused": user_doc.get("crm_paused"),
        "access": user_doc.get("access") or {},
        "content_stages": user_doc.get("content_stages"),
        "access_version": user_doc.get("access_version") or 1,
        "company_id": effective_cid,
        "is_super_admin": bool(user_doc.get("is_super_admin", False)),
        "company": company_payload,
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


async def require_owner(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency guard requiring super-admin owner privileges.
    Fails closed with 404 (Not Found) for non-owners to prevent route enumeration.
    Blocks owner actions while in an active impersonation session.
    """
    if not current_user.get("is_super_admin"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found",
        )
    from app.core.tenant import get_tenant_context
    ctx = get_tenant_context()
    if ctx and ctx.impersonating:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner actions blocked during impersonation",
        )
    return current_user


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
# Ad-account secrets: admin only, or ads=manage via override (operations removed).
async def require_ad_credential_admin(current_user: dict = Depends(get_current_user)) -> dict:
    from app.services.permissions import load_ctx, resolve
    ctx = load_ctx(current_user)
    if ctx.role == "admin" or resolve(ctx, "ads") == "manage":
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Ad credential administrative privileges required.",
    )
