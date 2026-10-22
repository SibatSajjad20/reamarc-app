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


def invalidate_auth_cache(user_id: Optional[str] = None, membership_id: Optional[str] = None) -> None:
    """Invalidate cached user, membership, or company entries."""
    if not user_id and not membership_id:
        _AUTH_CACHE.clear()
        return
    keys_to_del = [
        k for k in list(_AUTH_CACHE.keys())
        if (user_id and (k == user_id or k.startswith(f"{user_id}:")))
        or (membership_id and k.endswith(f":{membership_id}"))
    ]
    for k in keys_to_del:
        _AUTH_CACHE.pop(k, None)


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

def create_impersonation_token(
    user_id: str,
    company_id: str,
    read_only: bool = True,
    reason: str = "",
    tv: Optional[int] = None,
    jti: Optional[str] = None,
) -> str:
    """Owner impersonation token. Read-only lasts 60m, edit lasts 30m."""
    duration_minutes = 60 if read_only else 30
    expire = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
    token_jti = jti or uuid.uuid4().hex
    to_encode = {
        "sub": user_id,
        "cid": company_id,
        "imp_cid": company_id,
        "ro": read_only,
        "reason_id": reason,
        "jti": token_jti,
        "exp": expire,
        "type": "access",
        "typ": "imp",
    }
    if tv is not None:
        to_encode["tv"] = int(tv)
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
    res = await db.users.update_one(
        {"$or": [{"id": user_id}, {"_id": user_id}]},
        {"$inc": {"session_epoch": 1}, "$set": {"refresh_jtis": []}},
    )
    if getattr(res, "matched_count", 0) == 0:
        from app.core.tenant import get_global_db
        gdb = get_global_db()
        if gdb is not None:
            await gdb.users.update_one(
                {"$or": [{"id": user_id}, {"_id": user_id}]},
                {"$inc": {"session_epoch": 1}, "$set": {"refresh_jtis": []}},
            )


async def remember_refresh_jti(db: Any, user_id: str, jti: str) -> None:
    if db is None or not user_id or not jti:
        return
    res = await db.users.update_one(
        {"$or": [{"id": user_id}, {"_id": user_id}]},
        {"$push": {"refresh_jtis": {"$each": [jti], "$slice": -_MAX_REFRESH_JTIS}}},
    )
    if getattr(res, "matched_count", 0) == 0:
        from app.core.tenant import get_global_db
        gdb = get_global_db()
        if gdb is not None:
            await gdb.users.update_one(
                {"$or": [{"id": user_id}, {"_id": user_id}]},
                {"$push": {"refresh_jtis": {"$each": [jti], "$slice": -_MAX_REFRESH_JTIS}}},
            )


async def rotate_refresh_jti(db: Any, user_id: str, old_jti: str, new_jti: str) -> bool:
    if db is None or not user_id or not old_jti or not new_jti:
        return False
    now = datetime.now(timezone.utc).isoformat()
    result = await db.users.update_one(
        {"$or": [{"id": user_id}, {"_id": user_id}], "refresh_jtis": old_jti},
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
    if int(getattr(result, "modified_count", 0) or 0) == 1:
        return True
    from app.core.tenant import get_global_db
    gdb = get_global_db()
    if gdb is not None:
        result = await gdb.users.update_one(
            {"$or": [{"id": user_id}, {"_id": user_id}], "refresh_jtis": old_jti},
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
    return False


async def revoke_refresh_jtis(db: Any, user_id: str, jtis: List[str]) -> None:
    """Drop one browser's refresh ids. Other browsers of this account stay signed in."""
    ids = [str(j) for j in jtis if j]
    if db is None or not user_id or not ids:
        return
    res = await db.users.update_one(
        {"$or": [{"id": user_id}, {"_id": user_id}]},
        {"$pull": {"refresh_jtis": {"$in": ids}}},
    )
    if getattr(res, "matched_count", 0) == 0:
        from app.core.tenant import get_global_db
        gdb = get_global_db()
        if gdb is not None:
            await gdb.users.update_one(
                {"$or": [{"id": user_id}, {"_id": user_id}]},
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


def claims_with_session(
    user_doc: Optional[dict],
    base: dict,
    company_doc: Optional[dict] = None,
    membership_doc: Optional[dict] = None,
) -> dict:
    out = dict(base)
    u = user_doc or {}
    m = membership_doc or {}
    if "ver" not in out:
        out["ver"] = user_session_epoch(u)
    if "mid" not in out and m.get("id"):
        out["mid"] = m.get("id")
    if "mtv" not in out and ("token_version" in m or m.get("id")):
        out["mtv"] = int(m.get("token_version", 0) or 0)
    if "cid" not in out:
        multi_tenant_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)
        fallback_cid = None if multi_tenant_enabled else "company_reamarc"
        out["cid"] = m.get("company_id") or u.get("company_id") or (company_doc.get("id") if company_doc else None) or fallback_cid
    if "tv" not in out:
        out["tv"] = int(u.get("token_version", 0) or 0)
    if "ctv" not in out and company_doc:
        out["ctv"] = int(company_doc.get("token_version", 0) or 0)
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

    token_cid = payload.get("cid")
    token_tv = payload.get("tv")
    token_ctv = payload.get("ctv")
    token_mid = payload.get("mid")
    token_mtv = payload.get("mtv")
    typ = payload.get("typ") or payload.get("type", "access")
    is_imp = (typ == "imp")

    cache_key = f"{user_id}:{token_mid}" if token_mid else user_id
    now_mono = time.monotonic()
    cached = _AUTH_CACHE.get(cache_key)
    membership_doc = None
    if cached and (now_mono - cached["time"] < _AUTH_CACHE_TTL_SECONDS):
        user_doc = cached["user"]
        company_doc = cached["company"]
        membership_doc = cached.get("membership")
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

        multi_tenant_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)
        if token_mid:
            membership_doc = await gdb.company_memberships.find_one({"id": token_mid})
            cid_to_load = membership_doc.get("company_id") if membership_doc else token_cid
        else:
            membership_doc = None
            default_cid = None if multi_tenant_enabled else "company_reamarc"
            cid_to_load = token_cid or user_doc.get("company_id") or default_cid

        company_doc = None
        if cid_to_load:
            company_doc = await gdb.companies.find_one({"id": cid_to_load})
            if not company_doc:
                company_doc = await gdb.companies.find_one({"slug": cid_to_load})
        if not company_doc and not multi_tenant_enabled:
            company_doc = await gdb.companies.find_one({"slug": "reamarc"})

        if multi_tenant_enabled and not company_doc and not is_imp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not linked to a company",
                headers={"WWW-Authenticate": "Bearer"},
            )

        _AUTH_CACHE[cache_key] = {
            "user": user_doc,
            "company": company_doc,
            "membership": membership_doc,
            "time": now_mono,
        }

    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )

    if is_imp:
        if not user_doc.get("is_super_admin"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Impersonation token invalid for non-super-admin user.",
            )
        if token_tv is None:
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Impersonation token missing token version.",
            )
        if int(user_doc.get("token_version", 0)) != int(token_tv):
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Owner session revoked. Please sign in again.",
            )
        session_jti = payload.get("jti")
        if not session_jti:
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Impersonation token missing session identifier.",
            )
        from app.core.tenant import get_global_db
        gdb_inst = get_global_db()
        owner_sess = None
        if gdb_inst is not None:
            owner_sess = await gdb_inst.owner_sessions.find_one({"$or": [{"_id": session_jti}, {"jti": session_jti}]})
        if not owner_sess:
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Impersonation session not found.",
            )
        if owner_sess.get("revoked", False):
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Impersonation session revoked.",
            )
        now_utc = datetime.now(timezone.utc)
        sess_exp = owner_sess.get("exp")
        if sess_exp:
            sess_exp_dt = None
            if isinstance(sess_exp, str):
                try:
                    sess_exp_dt = datetime.fromisoformat(sess_exp.replace("Z", "+00:00"))
                except Exception:
                    pass
            elif isinstance(sess_exp, (int, float)):
                sess_exp_dt = datetime.fromtimestamp(sess_exp, tz=timezone.utc)
            elif isinstance(sess_exp, datetime):
                sess_exp_dt = sess_exp
            if sess_exp_dt:
                if sess_exp_dt.tzinfo is None:
                    sess_exp_dt = sess_exp_dt.replace(tzinfo=timezone.utc)
                if now_utc > sess_exp_dt:
                    _AUTH_CACHE.pop(cache_key, None)
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Impersonation session expired.",
                    )
        payload_exp = payload.get("exp")
        if payload_exp is not None:
            try:
                if now_utc.timestamp() > float(payload_exp):
                    _AUTH_CACHE.pop(cache_key, None)
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Impersonation token expired.",
                    )
            except (ValueError, TypeError):
                pass
        target_cid = token_cid or payload.get("imp_cid")
        if target_cid and gdb_inst is not None:
            imp_comp = await gdb_inst.companies.find_one({"id": target_cid})
            if imp_comp:
                company_doc = imp_comp

    # Multi-company validation
    multi_company_enabled = getattr(settings, "MULTI_COMPANY_ENABLED", False)
    if (multi_company_enabled or token_mid) and not is_imp:
        if not token_mid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing membership identifier.",
            )
        if not membership_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Company membership not found.",
            )
        if str(membership_doc.get("user_id")) != user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Membership does not belong to user.",
            )
        if membership_doc.get("status") != "active":
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Company membership is revoked or removed.",
            )
        expected_cid = membership_doc.get("company_id")
        if token_cid and token_cid != expected_cid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token company mismatch with membership.",
            )
        if token_mtv is not None and int(membership_doc.get("token_version", 0)) != int(token_mtv):
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Membership session revoked.",
            )
        if token_tv is not None and int(user_doc.get("token_version", 0)) != int(token_tv):
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session revoked. Please sign in again.",
            )

        if not company_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Company not found.",
            )
        if company_doc.get("status") == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This company's access is paused.",
            )
        if token_ctv is not None and int(company_doc.get("token_version", 0)) != int(token_ctv):
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Company session revoked.",
            )
        if token_session_epoch(payload) != user_session_epoch(user_doc):
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    elif not is_imp:
        # Multi-tenancy legacy checks when not using membership validation
        if (getattr(settings, "MULTI_TENANT_ENABLED", False) or token_cid):
            multi_tenant_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)
            expected_cid = user_doc.get("company_id") or (None if multi_tenant_enabled else "company_reamarc")
            if token_cid and token_cid != expected_cid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token company mismatch.",
                )

            if token_tv is not None:
                if int(user_doc.get("token_version", 0)) != int(token_tv):
                    _AUTH_CACHE.pop(cache_key, None)
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
                    _AUTH_CACHE.pop(cache_key, None)
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Company session revoked.",
                    )
        if token_session_epoch(payload) != user_session_epoch(user_doc):
            _AUTH_CACHE.pop(cache_key, None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Legacy sid check
    session_id = str(payload.get("sid") or "").strip()
    if session_id:
        active_sessions = [str(j) for j in (user_doc.get("refresh_jtis") or []) if j]
        if session_id not in active_sessions and cached:
            _AUTH_CACHE.pop(cache_key, None)
            from app.core.tenant import get_global_db
            gdb = get_global_db()
            if gdb is not None:
                fresh_user = await gdb.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]}, {"hashed_password": 0})
                if fresh_user:
                    user_doc = fresh_user
                    active_sessions = [str(j) for j in (user_doc.get("refresh_jtis") or []) if j]
        if session_id not in active_sessions:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    if membership_doc:
        effective_role = _normalize_role(membership_doc.get("role"))
        effective_cid = membership_doc.get("company_id")
        effective_dept = membership_doc.get("primary_department")
        effective_depts = membership_doc.get("departments") or []
        effective_primary_dept = membership_doc.get("primary_department")
        effective_access = membership_doc.get("access") or {}
        effective_content_stages = membership_doc.get("content_stages")
        needs_setup = bool(membership_doc.get("needs_setup", False))
        membership_id = membership_doc.get("id")
    else:
        effective_role = _normalize_role(user_doc.get("role"))
        effective_cid = token_cid or user_doc.get("company_id") or "company_reamarc"
        effective_dept = user_doc.get("department")
        effective_depts = user_doc.get("departments") or []
        effective_primary_dept = user_doc.get("primary_department")
        effective_access = user_doc.get("access") or {}
        effective_content_stages = user_doc.get("content_stages")
        needs_setup = False
        membership_id = None

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
        req_path = request.url.path.rstrip("/")
        is_exit_call = req_path.endswith("/owner/exit")
        if is_ro and not is_exit_call and request.method not in ("GET", "HEAD", "OPTIONS"):
            raise HTTPException(status_code=403, detail="Writes are disabled during read-only owner session")
        if ("/owner" in req_path and not is_exit_call) or "/change-password" in req_path:
            raise HTTPException(status_code=403, detail="Owner actions blocked during impersonation")

    company_payload = None
    if company_doc:
        c_brand = company_doc.get("display_name") or company_doc.get("brand_name") or company_doc.get("name")
        c_logo = company_doc.get("logo_url")
        if c_logo and c_logo.startswith("/assets/"):
            c_logo = None
        company_payload = {
            "id": company_doc.get("id"),
            "name": company_doc.get("name"),
            "display_name": c_brand,
            "brand_name": c_brand,
            "slug": company_doc.get("slug"),
            "logo_url": c_logo,
            "accent_color": company_doc.get("accent_color", "#6847E0"),
            "timezone": company_doc.get("timezone", "Asia/Karachi"),
        }

    return {
        "id": user_id,
        "email": user_doc.get("email") or email or user_doc.get("email"),
        "name": user_doc.get("full_name") or user_doc.get("name") or payload.get("name", "User"),
        "full_name": user_doc.get("full_name") or user_doc.get("name") or payload.get("name", "User"),
        "role": effective_role,
        "department": effective_dept,
        "departments": effective_depts,
        "primary_department": effective_primary_dept,
        "designation": user_doc.get("designation"),
        "phone": user_doc.get("phone"),
        "joining_date": user_doc.get("joining_date"),
        "employment_type": user_doc.get("employment_type") or "contract",
        "avatar_url": user_doc.get("avatar_url"),
        "is_active": user_doc.get("is_active", True),
        "workspace_ids": user_doc.get("workspace_ids", []),
        "crm_enabled": user_doc.get("crm_enabled"),
        "crm_paused": user_doc.get("crm_paused"),
        "access": effective_access,
        "content_stages": effective_content_stages,
        "access_version": user_doc.get("access_version") or 1,
        "company_id": effective_cid,
        "is_super_admin": bool(user_doc.get("is_super_admin", False)),
        "company": company_payload,
        "impersonating": is_imp,
        "read_only": is_ro,
        "needs_setup": needs_setup,
        "membership_id": membership_id,
        "session_id": session_id or None,
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


async def require_owner(request: Request, current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency guard requiring super-admin owner privileges.
    Fails closed with 404 (Not Found) for non-owners to prevent route enumeration.
    Blocks owner actions while in an active impersonation session (except /owner/exit).
    """
    if not current_user.get("is_super_admin"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found",
        )
    from app.core.tenant import get_tenant_context
    ctx = get_tenant_context()
    path = request.url.path.rstrip("/")
    if ctx and ctx.impersonating and not path.endswith("/owner/exit"):
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
