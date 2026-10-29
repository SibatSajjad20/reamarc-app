from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional
import asyncio
import uuid
import re
import secrets
import logging

from app.schemas.auth import (
    UserLogin, TokenResponse, UserResponse, SwitchCompanyRequest,
    ForgotPasswordRequest, VerifyResetCodeRequest, ResetPasswordRequest,
    ForgotPasswordResponse, VerifyResetCodeResponse, ResetPasswordResponse,
)
from app.schemas.error import ErrorResponse
from app.core.security import (
    get_password_hash, verify_password,
    create_access_token, create_refresh_token,
    decode_refresh_token, decode_access_token, get_current_user,
    _normalize_role, user_session_epoch, token_session_epoch,
    bump_session_epoch, claims_with_session,
    remember_refresh_jti, rotate_refresh_jti,
    decide_refresh_action, retired_jti_is_recent, accept_retired_refresh,
    revoke_refresh_jtis, _AUTH_CACHE, invalidate_auth_cache,
)
from app.core.limiter import limiter, get_client_ip
from app.core.rate_limit_store import enforce_shared_rate_limit
from app.services.email_service import EmailService
from app.database import get_database
from app.core.tenant import get_global_db, tenant_scope
from app.config import settings

logger = logging.getLogger(__name__)
_DUMMY_PASSWORD_HASH = get_password_hash("timing-dummy-not-a-real-password")

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


def _wants_json_tokens(request: Request, device_uuid: Optional[str] = None) -> bool:
    """Mobile clients need JWTs in the body; browsers use HttpOnly cookies only."""
    # Only the native app header — a body device_uuid must not flip browser sessions to JSON tokens.
    return (request.headers.get("X-Client") or request.headers.get("x-client") or "").strip().lower() == "mobile"


def _cookie_domain_for_request(request: Optional[Request] = None) -> str:
    """Cookie Domain for Worklane hosts so apex/subdomains share one first-party session.

    - Explicit COOKIE_DOMAIN env wins when set.
    - Else, if the browser-facing host is oneworklane.com / *.oneworklane.com,
      use ``.oneworklane.com`` (safe: all those hosts are ours; isolation is membership).
    - vercel.app and other hosts stay host-only (no Domain) so they keep working.
    """
    explicit = (getattr(settings, "COOKIE_DOMAIN", None) or "").strip()
    if explicit:
        return explicit
    if request is None:
        return ""
    try:
        from app.core.origins import request_public_hosts
        base = (getattr(settings, "APP_BASE_DOMAIN", None) or "oneworklane.com").strip().lower().rstrip(".")
        for host in request_public_hosts(request):
            if host == base or host.endswith(f".{base}"):
                return f".{base}"
    except Exception:
        return ""
    return ""


def _set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    request: Optional[Request] = None,
) -> None:
    is_prod = settings.IS_PRODUCTION
    # Same-site subdomains (*.oneworklane.com) work with Lax; None kept in prod for
    # any remaining cross-origin tooling. Prefer Lax when we know it's Worklane.
    cookie_domain = _cookie_domain_for_request(request)
    use_lax = bool(cookie_domain) or not is_prod
    cookie_opts = dict(
        httponly=True,
        samesite="lax" if use_lax else "none",
        secure=True if is_prod else settings.COOKIE_SECURE,
    )
    if cookie_domain:
        cookie_opts["domain"] = cookie_domain
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


def _issue_token_pair(claims: dict, session_id: str) -> tuple[str, str]:
    """Access and refresh tokens for one browser. session_id is that browser's sid."""
    access_claims = dict(claims)
    access_claims["sid"] = session_id
    refresh_claims = dict(claims)
    refresh_claims["jti"] = session_id
    return create_access_token(access_claims), create_refresh_token(refresh_claims)


def _token_payload(access_token: str, refresh_token: str, user_doc: dict, include_tokens: bool = True) -> dict:
    payload = {
        "token_type": "bearer",
        "user": _build_user_response(user_doc),
    }
    if "companies" in user_doc:
        payload["companies"] = user_doc["companies"]
    if include_tokens:
        payload["access_token"] = access_token
        payload["refresh_token"] = refresh_token
    else:
        payload["access_token"] = None
        payload["refresh_token"] = None
    return payload


def _build_user_response(user_doc: dict) -> dict:
    role_str = _normalize_role(user_doc.get("role"))
    from app.services.permissions import (
        parse_user_departments,
        get_user_primary_department,
        load_ctx,
        effective_map,
    )
    safe = {k: v for k, v in (user_doc or {}).items() if not str(k).startswith("_")}
    if "role" in safe:
        safe["role"] = role_str
    ctx = load_ctx(safe)
    eff_map = effective_map(ctx)
    return {
        "id": user_doc.get("id") or str(user_doc.get("_id")),
        "email": user_doc["email"],
        "name": user_doc.get("full_name") or user_doc.get("name", "User"),
        "role": role_str,
        "department": user_doc.get("department"),
        "departments": parse_user_departments(user_doc),
        "primary_department": get_user_primary_department(user_doc),
        "permissions": eff_map,
        "content_stages": eff_map.get("content_stages") or [],
        "designation": user_doc.get("designation"),
        "joining_date": user_doc.get("joining_date"),
        "employment_type": user_doc.get("employment_type") or "contract",
        "is_active": user_doc.get("is_active", True),
        "workspace_ids": user_doc.get("workspace_ids", []),
        "crm_enabled": user_doc.get("crm_enabled"),
        "crm_paused": user_doc.get("crm_paused"),
        "avatar_url": user_doc.get("avatar_url"),
        "company_id": user_doc.get("company_id") or (None if getattr(settings, "MULTI_TENANT_ENABLED", False) else "company_reamarc"),
        "is_super_admin": bool(user_doc.get("is_super_admin", False)),
        "company": user_doc.get("company"),
        "needs_setup": bool(user_doc.get("needs_setup", False)),
        "membership_id": user_doc.get("membership_id"),
        "companies": user_doc.get("companies"),
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


# Per-IP limits must allow a whole office (one NAT IP) or every user behind the
# Vercel /api rewrite to sign in together at 9 AM. Brute force is bounded per
# email (login-email below), not per IP. See live-regression-oct23-followup.md §7.
LOGIN_IP_LIMIT_PER_MINUTE = 60
REFRESH_IP_LIMIT_PER_MINUTE = 300


@router.post("/login", response_model=TokenResponse)
@limiter.limit(f"{LOGIN_IP_LIMIT_PER_MINUTE}/minute")
async def login(request: Request, user_in: UserLogin, response: Response):
    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection to MongoDB is currently unavailable.",
        )

    email_clean = str(user_in.email).lower().strip()
    await enforce_shared_rate_limit(f"login-email:{email_clean}", 10, 3600)
    await enforce_shared_rate_limit(f"login-ip:{get_client_ip(request)}", LOGIN_IP_LIMIT_PER_MINUTE, 60)
    user_doc = await gdb.users.find_one({"email": email_clean})
    if not user_doc:
        # Fallback to case-insensitive match if stored in mixed case
        user_doc = await gdb.users.find_one({"email": {"$regex": f"^{re.escape(email_clean)}$", "$options": "i"}})

    stored_hash = (user_doc or {}).get("hashed_password") or _DUMMY_PASSWORD_HASH
    password_ok = await asyncio.to_thread(verify_password, user_in.password, stored_hash)
    if not user_doc or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )

    user_id = user_doc.get("id") or str(user_doc.get("_id"))
    multi_company = getattr(settings, "MULTI_COMPANY_ENABLED", False)
    target_membership = None
    user_companies = []

    if multi_company:
        memberships = await gdb.company_memberships.find({"user_id": user_id, "status": "active"}).to_list(100)
        if not memberships:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No active company memberships found for this user.",
            )
        # Build company map to filter to active companies
        comp_ids = [m["company_id"] for m in memberships]
        comp_docs = await gdb.companies.find({"id": {"$in": comp_ids}}).to_list(100)
        comp_map = {c["id"]: c for c in comp_docs}

        # Filter memberships to only those whose company exists and is active (not suspended)
        active_memberships = [
            m for m in memberships
            if m["company_id"] in comp_map and comp_map[m["company_id"]].get("status") != "suspended"
        ]

        if not active_memberships:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="None of your companies are active.",
            )

        # Prefer company implied by Host subdomain when the user is a member.
        # Never trust the subdomain alone — membership is required. Otherwise
        # fall back to last_company_id, then the first active membership.
        last_cid = user_doc.get("last_company_id")
        target_membership = None
        try:
            from app.core.tenant import resolve_company_from_host
            host_cid = await resolve_company_from_host(request)
            if host_cid:
                for m in active_memberships:
                    if m.get("company_id") == host_cid:
                        target_membership = m
                        break
        except Exception:
            target_membership = None
        if not target_membership and last_cid:
            for m in active_memberships:
                if m.get("company_id") == last_cid:
                    target_membership = m
                    break
        if not target_membership:
            # Prefer the membership marked primary (normal "home" company), else first.
            for m in active_memberships:
                if m.get("is_primary"):
                    target_membership = m
                    break
        if not target_membership:
            target_membership = active_memberships[0]

        cid = target_membership["company_id"]
        company_doc = comp_map[cid]

        for m in active_memberships:
            c = comp_map[m["company_id"]]
            c_brand = c.get("display_name") or c.get("brand_name") or c.get("name")
            c_logo = c.get("logo_url")
            if c_logo and c_logo.startswith("/assets/"):
                c_logo = None
            user_companies.append({
                "id": c["id"],
                "name": c["name"],
                "display_name": c_brand,
                "brand_name": c_brand,
                "slug": c.get("slug"),
                "logo_url": c_logo,
                "role": m.get("role", "team_member"),
                "accent_color": c.get("accent_color", "#6847E0"),
            })

        await gdb.users.update_one({"id": user_id}, {"$set": {"last_company_id": cid}})

        user_doc["role"] = target_membership.get("role")
        user_doc["department"] = target_membership.get("primary_department")
        user_doc["primary_department"] = target_membership.get("primary_department")
        user_doc["departments"] = target_membership.get("departments") or []
        user_doc["access"] = target_membership.get("access") or {}
        user_doc["content_stages"] = target_membership.get("content_stages")
        user_doc["company_id"] = cid
        user_doc["needs_setup"] = bool(target_membership.get("needs_setup", False))
        user_doc["membership_id"] = target_membership.get("id")
        user_doc["companies"] = user_companies
    else:
        from app.core.security import lookup_company
        mt_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)
        cid = user_doc.get("company_id") or (None if mt_enabled else "company_reamarc")
        if mt_enabled and not cid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not linked to a company",
            )
        if (
            not mt_enabled
            and cid not in ("company_reamarc", "reamarc")
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This workspace isn't available yet.",
            )
        company_doc = await lookup_company(cid)
        if not company_doc and not mt_enabled:
            company_doc = await lookup_company("reamarc")
        if mt_enabled and not company_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not linked to a company",
            )

        if company_doc and company_doc.get("status") == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This company's access is paused.",
            )

    if company_doc:
        c_brand = company_doc.get("display_name") or company_doc.get("brand_name") or company_doc.get("name")
        c_logo = company_doc.get("logo_url")
        if c_logo and c_logo.startswith("/assets/"):
            c_logo = None
        user_doc["company"] = {
            "id": company_doc.get("id"),
            "name": company_doc.get("name"),
            "display_name": c_brand,
            "brand_name": c_brand,
            "slug": company_doc.get("slug"),
            "logo_url": c_logo,
            "accent_color": company_doc.get("accent_color", "#6847E0"),
            "timezone": company_doc.get("timezone", "Asia/Karachi"),
        }

    role_str = _normalize_role(user_doc.get("role"))
    base_claims = {
        "sub": user_id,
        "email": user_doc["email"],
        "name": user_doc.get("full_name") or user_doc.get("name", "User"),
        "role": role_str,
        "cid": cid,
        "workspace_ids": user_doc.get("workspace_ids", []),
    }
    if target_membership:
        base_claims["mid"] = target_membership.get("id")
        base_claims["mtv"] = int(target_membership.get("token_version", 0) or 0)

    claims = claims_with_session(user_doc, base_claims, company_doc=company_doc, membership_doc=target_membership)
    if user_in.device_uuid:
        from app.services.device_registry import assert_device_login_allowed
        with tenant_scope(cid):
            await assert_device_login_allowed(user_id, user_in.device_uuid)

    session_id = uuid.uuid4().hex
    access_token, refresh_token = _issue_token_pair(claims, session_id)
    # A new login adds a session. It does not revoke any other browser or account.
    db = get_database()
    with tenant_scope(cid):
        await remember_refresh_jti(db, user_id, session_id)
    if target_membership:
        _AUTH_CACHE.pop(f"{user_id}:{target_membership['id']}", None)
    _AUTH_CACHE.pop(user_id, None)
    wants_json = _wants_json_tokens(request, user_in.device_uuid)
    if not wants_json:
        # Browsers use HttpOnly cookies; mobile uses Bearer tokens only.
        # Setting cookies for mobile pollutes Android's cookie jar and can trip CSRF on later logins.
        _set_auth_cookies(response, access_token, refresh_token, request)

    return _token_payload(access_token, refresh_token, user_doc, wants_json)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(f"{REFRESH_IP_LIMIT_PER_MINUTE}/minute")
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

    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database unavailable.")

    user_doc = await gdb.users.find_one({"id": payload["sub"]})
    if not user_doc:
        user_doc = await gdb.users.find_one({"_id": payload["sub"]})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")

    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account deactivated.")

    if token_session_epoch(payload) != user_session_epoch(user_doc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")

    user_id = user_doc.get("id") or str(user_doc.get("_id"))
    old_jti = str(payload.get("jti") or "").strip()
    existing_jtis = [str(j) for j in (user_doc.get("refresh_jtis") or []) if j]

    multi_company = getattr(settings, "MULTI_COMPANY_ENABLED", False)
    token_mid = payload.get("mid")
    token_mtv = payload.get("mtv")
    target_membership = None

    if (multi_company or token_mid) and token_mid:
        target_membership = await gdb.company_memberships.find_one({"id": token_mid})
        if not target_membership:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Membership not found.")
        if str(target_membership.get("user_id")) != user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Membership does not belong to user.")
        if target_membership.get("status") != "active":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Membership session revoked.")
        if token_mtv is not None and int(target_membership.get("token_version", 0)) != int(token_mtv):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Membership session revoked.")
        cid = target_membership.get("company_id")
        company_doc = await gdb.companies.find_one({"id": cid})
        role_str = _normalize_role(target_membership.get("role"))
        user_doc["role"] = role_str
        user_doc["department"] = target_membership.get("primary_department")
        user_doc["primary_department"] = target_membership.get("primary_department")
        user_doc["departments"] = target_membership.get("departments") or []
        user_doc["access"] = target_membership.get("access") or {}
        user_doc["content_stages"] = target_membership.get("content_stages")
        user_doc["company_id"] = cid
        user_doc["needs_setup"] = bool(target_membership.get("needs_setup", False))
        user_doc["membership_id"] = target_membership.get("id")
    elif multi_company and not token_mid:
        memberships = await gdb.company_memberships.find({"user_id": user_id, "status": "active"}).to_list(100)
        if memberships:
            last_cid = user_doc.get("last_company_id")
            if last_cid:
                for m in memberships:
                    if m.get("company_id") == last_cid:
                        target_membership = m
                        break
            if not target_membership:
                target_membership = memberships[0]
            cid = target_membership.get("company_id")
            company_doc = await gdb.companies.find_one({"id": cid})
            role_str = _normalize_role(target_membership.get("role"))
            user_doc["role"] = role_str
            user_doc["department"] = target_membership.get("primary_department")
            user_doc["primary_department"] = target_membership.get("primary_department")
            user_doc["departments"] = target_membership.get("departments") or []
            user_doc["access"] = target_membership.get("access") or {}
            user_doc["content_stages"] = target_membership.get("content_stages")
            user_doc["company_id"] = cid
            user_doc["needs_setup"] = bool(target_membership.get("needs_setup", False))
            user_doc["membership_id"] = target_membership.get("id")
        else:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No active company membership found.")
    else:
        from app.core.security import lookup_company
        mt_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)
        cid = user_doc.get("company_id") or (None if mt_enabled else "company_reamarc")
        if mt_enabled and not cid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not linked to a company",
            )
        if (
            not mt_enabled
            and cid not in ("company_reamarc", "reamarc")
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This workspace isn't available yet.",
            )
        company_doc = await lookup_company(cid)
        if not company_doc and not mt_enabled:
            company_doc = await lookup_company("reamarc")
        if mt_enabled and not company_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not linked to a company",
            )
        role_str = _normalize_role(user_doc.get("role"))

    if company_doc and company_doc.get("status") == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This company's access is paused.")

    if company_doc:
        user_doc["company"] = {
            "id": company_doc.get("id"),
            "name": company_doc.get("name"),
            "slug": company_doc.get("slug"),
            "logo_url": company_doc.get("logo_url"),
            "accent_color": company_doc.get("accent_color", "#6847E0"),
            "timezone": company_doc.get("timezone", "Asia/Karachi"),
        }

    base_claims = {
        "sub": user_id,
        "email": user_doc["email"],
        "name": user_doc.get("full_name") or user_doc.get("name", "User"),
        "role": role_str,
        "cid": cid,
        "workspace_ids": user_doc.get("workspace_ids", []),
    }
    if target_membership:
        base_claims["mid"] = target_membership.get("id")
        base_claims["mtv"] = int(target_membership.get("token_version", 0) or 0)
    claims = claims_with_session(user_doc, base_claims, company_doc=company_doc, membership_doc=target_membership)

    session_id = uuid.uuid4().hex
    new_access_token, new_refresh_token = _issue_token_pair(claims, session_id)
    recently_retired = bool(old_jti) and retired_jti_is_recent(
        user_doc.get("refresh_retired"), old_jti
    )
    action = decide_refresh_action(
        old_jti, existing_jtis, recently_retired=recently_retired
    )

    db = get_database()
    with tenant_scope(cid):
        if action == "rotate":
            rotated = await rotate_refresh_jti(db, user_id, old_jti, session_id)
            if not rotated:
                granted = await accept_retired_refresh(db, user_id, old_jti, session_id, fresh_doc=user_doc)
                if not granted:
                    logger.info("refresh reject user=%s reason=lost_rotation", user_id)
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")
                if granted != session_id:
                    session_id = granted
                    new_access_token, new_refresh_token = _issue_token_pair(claims, session_id)
                logger.info("refresh grace user=%s", user_id)
            else:
                logger.info("refresh rotate user=%s", user_id)
        elif action == "grace":
            granted = await accept_retired_refresh(db, user_id, old_jti, session_id, fresh_doc=user_doc)
            if not granted:
                logger.info("refresh reject user=%s reason=grace_expired", user_id)
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")
            if granted != session_id:
                session_id = granted
                new_access_token, new_refresh_token = _issue_token_pair(claims, session_id)
            logger.info("refresh grace user=%s", user_id)
        elif action == "legacy":
            # Legacy refresh tokens (no jti list yet) are accepted once, then tracked.
            await remember_refresh_jti(db, user_id, session_id)
        else:
            # Stale token from another browser. Reject this token only.
            logger.info("refresh reject user=%s reason=stale", user_id)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")
    if target_membership:
        _AUTH_CACHE.pop(f"{user_id}:{target_membership['id']}", None)
    _AUTH_CACHE.pop(user_id, None)

    wants_json = _wants_json_tokens(request)
    if not wants_json:
        _set_auth_cookies(response, new_access_token, new_refresh_token, request)

    return _token_payload(new_access_token, new_refresh_token, user_doc, wants_json)


from app.schemas.user import UserProfileUpdate


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    from app.services.permissions import load_context, effective_map
    ctx = await load_context(current_user)
    resp = dict(current_user)
    resp["departments"] = ctx.departments
    resp["primary_department"] = ctx.primary_department
    eff_map = effective_map(ctx)
    resp["permissions"] = eff_map
    resp["content_stages"] = eff_map.get("content_stages") or []

    from app.services.access import effective_access
    eff_acc = effective_access(current_user)
    resp["effective_access"] = eff_acc["modules"]

    gdb = get_global_db()
    if gdb is not None:
        active_mems = await gdb.company_memberships.find({"user_id": current_user["id"], "status": "active"}).to_list(100)
        cids = [m["company_id"] for m in active_mems]
        comps = await gdb.companies.find({"id": {"$in": cids}}).to_list(100)
        cmap = {c["id"]: c for c in comps}
        user_companies = []
        for m in active_mems:
            c = cmap.get(m["company_id"])
            if c and c.get("status") != "suspended":
                c_brand = c.get("display_name") or c.get("brand_name") or c.get("name")
                c_logo = c.get("logo_url")
                if c_logo and c_logo.startswith("/assets/"):
                    c_logo = None
                user_companies.append({
                    "id": c["id"],
                    "name": c["name"],
                    "display_name": c_brand,
                    "brand_name": c_brand,
                    "slug": c.get("slug"),
                    "logo_url": c_logo,
                    "role": m.get("role", "team_member"),
                    "accent_color": c.get("accent_color", "#6847E0"),
                })
        resp["companies"] = user_companies

    # Format current company if present
    curr_comp = current_user.get("company")
    if curr_comp:
        c_brand = curr_comp.get("display_name") or curr_comp.get("brand_name") or curr_comp.get("name")
        c_logo = curr_comp.get("logo_url")
        if c_logo and c_logo.startswith("/assets/"):
            c_logo = None
        resp["company"] = {
            "id": curr_comp.get("id"),
            "name": curr_comp.get("name"),
            "display_name": c_brand,
            "brand_name": c_brand,
            "slug": curr_comp.get("slug"),
            "logo_url": c_logo,
            "accent_color": curr_comp.get("accent_color", "#6847E0"),
            "timezone": curr_comp.get("timezone", "Asia/Karachi"),
        }

    return resp


@router.put("/me/profile", response_model=UserResponse)
@router.patch("/me/profile", response_model=UserResponse)
async def update_my_profile(
    profile_in: UserProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    gdb = get_global_db()
    db = gdb if gdb is not None else get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user_id = current_user["id"]
    user_doc = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found.")

    update_fields = {}

    if profile_in.full_name is not None and profile_in.full_name.strip():
        update_fields["full_name"] = profile_in.full_name.strip()
        update_fields["name"] = profile_in.full_name.strip()

    if profile_in.email is not None:
        new_email = str(profile_in.email).lower().strip()
        stored_email = str(user_doc.get("email") or "").lower().strip()
        if new_email and new_email != stored_email:
            caller_role = _normalize_role(user_doc.get("role") or current_user.get("role"))
            if caller_role != "admin":
                raise HTTPException(
                    status_code=400,
                    detail="Email changes must be requested through HR.",
                )
            conflict = await db.users.find_one({"email": new_email, "$or": [{"id": {"$ne": user_id}}, {"_id": {"$ne": user_id}}]})
            if conflict:
                raise HTTPException(
                    status_code=400,
                    detail="Email is already taken by another user.",
                )
            update_fields["email"] = new_email

    if profile_in.phone is not None and profile_in.phone.strip():
        update_fields["phone"] = profile_in.phone.strip()
        update_fields["phone_number"] = profile_in.phone.strip()

    if profile_in.new_password:
        if len(profile_in.new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

        current_hash = user_doc.get("hashed_password")
        if not profile_in.current_password or not current_hash or not await asyncio.to_thread(
            verify_password, profile_in.current_password, current_hash
        ):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")

        update_fields["hashed_password"] = await asyncio.to_thread(get_password_hash, profile_in.new_password)
        update_fields["token_version"] = int(user_doc.get("token_version") or 0) + 1
        update_fields["session_epoch"] = user_session_epoch(user_doc) + 1
        update_fields["refresh_jtis"] = []

        if gdb is not None:
            await gdb.company_memberships.update_many(
                {"user_id": user_id},
                {"$inc": {"token_version": 1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        invalidate_auth_cache(user_id=user_id)

    if not update_fields:
        return _build_user_response(user_doc)

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated_doc = await db.users.find_one_and_update(
        {"$or": [{"id": user_id}, {"_id": user_id}]},
        {"$set": update_fields},
        return_document=True
    )
    invalidate_auth_cache(user_id=user_id)

    return _build_user_response(updated_doc or user_doc)


def _extract_any_token(request: Request) -> Optional[str]:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return request.cookies.get("access_token") or request.cookies.get("refresh_token")


def _logout_target(request: Request) -> tuple[Optional[str], list[str]]:
    """User id plus the session ids belonging to this browser only."""
    user_id = None
    session_ids: list[str] = []
    access = _extract_any_token(request)
    access_payload = decode_access_token(access) if access else None
    if access_payload:
        user_id = access_payload.get("sub")
        sid = str(access_payload.get("sid") or "").strip()
        if sid:
            session_ids.append(sid)
    refresh = request.cookies.get("refresh_token")
    refresh_payload = decode_refresh_token(refresh) if refresh else None
    if refresh_payload is None and access and access_payload is None:
        refresh_payload = decode_refresh_token(access)
    if refresh_payload:
        user_id = user_id or refresh_payload.get("sub")
        jti = str(refresh_payload.get("jti") or "").strip()
        if jti and jti not in session_ids:
            session_ids.append(jti)
    return (str(user_id) if user_id else None), session_ids


@router.post("/logout")
async def logout(request: Request, response: Response):
    user_id, session_ids = _logout_target(request)
    if user_id and _wants_json_tokens(request):
        device_uuid = (request.headers.get("X-Device-UUID") or request.headers.get("x-device-uuid") or "").strip()
        if not device_uuid:
            try:
                payload = await request.json()
            except Exception:
                payload = None
            if isinstance(payload, dict):
                device_uuid = str(payload.get("device_uuid") or "").strip()
        from app.services.device_registry import clear_push_token_on_logout
        await clear_push_token_on_logout(user_id, device_uuid or None)
    if user_id:
        from app.core.tenant import get_global_db
        gdb = get_global_db()
        db_to_use = gdb if gdb is not None else get_database()
        if session_ids:
            await revoke_refresh_jtis(db_to_use, user_id, session_ids)
        else:
            # Legacy tokens have no session id, so this browser cannot be split out.
            await bump_session_epoch(db_to_use, user_id)
            await db_to_use.users.update_one(
                {"$or": [{"id": user_id}, {"_id": user_id}]},
                {"$inc": {"token_version": 1}},
            )
            invalidate_auth_cache(user_id=user_id)

    is_prod = settings.IS_PRODUCTION
    cookie_opts = dict(
        httponly=True,
        samesite="none" if is_prod else "lax",
        secure=True if is_prod else settings.COOKIE_SECURE
    )
    cookie_domain = (getattr(settings, "COOKIE_DOMAIN", None) or "").strip()
    if cookie_domain:
        cookie_opts["domain"] = cookie_domain
    response.delete_cookie("access_token", **cookie_opts)
    response.delete_cookie("refresh_token", **cookie_opts)
    return {"message": "Successfully logged out."}


@router.post("/switch-company", response_model=TokenResponse)
@limiter.limit("10/minute")
async def switch_company(
    request: Request,
    body: SwitchCompanyRequest,
    response: Response,
    current_user: dict = Depends(get_current_user),
):
    if not getattr(settings, "MULTI_COMPANY_ENABLED", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database unavailable.",
        )

    user_id = current_user["id"]
    target_cid = body.company_id.strip()

    company_doc = await gdb.companies.find_one({"id": target_cid})
    if not company_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    if company_doc.get("status") == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This company's access is paused.")

    membership = await gdb.company_memberships.find_one({
        "user_id": user_id,
        "company_id": target_cid,
        "status": "active",
    })
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    _, prev_session_ids = _logout_target(request)
    if current_user.get("session_id") and current_user["session_id"] not in prev_session_ids:
        prev_session_ids.append(current_user["session_id"])
    if prev_session_ids:
        await revoke_refresh_jtis(gdb, user_id, prev_session_ids)

    await gdb.users.update_one({"id": user_id}, {"$set": {"last_company_id": target_cid}})

    from app.core.tenant import log_security_event
    await log_security_event("company_switch", {
        "user_id": user_id,
        "previous_company_id": current_user.get("company_id"),
        "target_company_id": target_cid,
        "membership_id": membership["id"],
    })

    user_doc = await gdb.users.find_one({"id": user_id}) or current_user
    role_str = _normalize_role(membership.get("role"))

    base_claims = {
        "sub": user_id,
        "email": current_user["email"],
        "name": current_user.get("name") or current_user.get("full_name"),
        "role": role_str,
        "cid": target_cid,
        "mid": membership.get("id"),
        "mtv": int(membership.get("token_version", 0) or 0),
        "workspace_ids": user_doc.get("workspace_ids", []),
    }
    claims = claims_with_session(user_doc, base_claims, company_doc=company_doc, membership_doc=membership)

    session_id = uuid.uuid4().hex
    access_token, refresh_token = _issue_token_pair(claims, session_id)

    db = get_database()
    with tenant_scope(target_cid):
        await remember_refresh_jti(db, user_id, session_id)

    _AUTH_CACHE.pop(f"{user_id}:{membership['id']}", None)
    _AUTH_CACHE.pop(user_id, None)

    active_mems = await gdb.company_memberships.find({"user_id": user_id, "status": "active"}).to_list(100)
    cids = [m["company_id"] for m in active_mems]
    all_comps = await gdb.companies.find({"id": {"$in": cids}}).to_list(100)
    cmap = {c["id"]: c for c in all_comps}
    companies_list = []
    for m in active_mems:
        c = cmap.get(m["company_id"])
        if c and c.get("status") != "suspended":
            c_brand = c.get("display_name") or c.get("brand_name") or c.get("name")
            c_logo = c.get("logo_url")
            if c_logo and c_logo.startswith("/assets/"):
                c_logo = None
            companies_list.append({
                "id": c["id"],
                "name": c["name"],
                "display_name": c_brand,
                "brand_name": c_brand,
                "slug": c.get("slug"),
                "logo_url": c_logo,
                "role": m.get("role", "team_member"),
                "accent_color": c.get("accent_color", "#6847E0"),
            })

    c_brand = company_doc.get("display_name") or company_doc.get("brand_name") or company_doc.get("name")
    c_logo = company_doc.get("logo_url")
    if c_logo and c_logo.startswith("/assets/"):
        c_logo = None

    actor_doc = dict(user_doc)
    actor_doc["role"] = role_str
    actor_doc["department"] = membership.get("primary_department")
    actor_doc["primary_department"] = membership.get("primary_department")
    actor_doc["departments"] = membership.get("departments") or []
    actor_doc["access"] = membership.get("access") or {}
    actor_doc["content_stages"] = membership.get("content_stages")
    actor_doc["company_id"] = target_cid
    actor_doc["needs_setup"] = bool(membership.get("needs_setup", False))
    actor_doc["membership_id"] = membership.get("id")
    actor_doc["company"] = {
        "id": company_doc.get("id"),
        "name": company_doc.get("name"),
        "display_name": c_brand,
        "brand_name": c_brand,
        "slug": company_doc.get("slug"),
        "logo_url": c_logo,
        "accent_color": company_doc.get("accent_color", "#6847E0"),
        "timezone": company_doc.get("timezone", "Asia/Karachi"),
    }
    actor_doc["companies"] = companies_list

    wants_json = _wants_json_tokens(request)
    if not wants_json:
        _set_auth_cookies(response, access_token, refresh_token, request)

    return _token_payload(access_token, refresh_token, actor_doc, wants_json)


@router.get("/my-companies")
async def get_my_companies(current_user: dict = Depends(get_current_user)):
    """List all active company memberships of the current user for the switcher."""
    if not getattr(settings, "MULTI_COMPANY_ENABLED", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database unavailable.",
        )

    user_id = current_user["id"]
    current_cid = current_user.get("company_id")

    active_mems = await gdb.company_memberships.find({"user_id": user_id, "status": "active"}).to_list(100)
    cids = [m["company_id"] for m in active_mems]
    all_comps = await gdb.companies.find({"id": {"$in": cids}}).to_list(100)
    cmap = {c["id"]: c for c in all_comps}

    result = []
    for m in active_mems:
        c = cmap.get(m["company_id"])
        if c and c.get("status") != "suspended":
            c_brand = c.get("display_name") or c.get("brand_name") or c.get("name")
            c_logo = c.get("logo_url")
            if c_logo and c_logo.startswith("/assets/"):
                c_logo = None
            result.append({
                "id": c["id"],
                "name": c["name"],
                "display_name": c_brand,
                "brand_name": c_brand,
                "slug": c.get("slug"),
                "logo_url": c_logo,
                "accent_color": c.get("accent_color", "#6847E0"),
                "role": m.get("role", "team_member"),
                "is_current": (c["id"] == current_cid),
            })
    return result


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
    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is currently unavailable.",
        )

    email_clean = str(payload.email).lower().strip()
    user_doc = await gdb.users.find_one({"email": email_clean})
    if not user_doc:
        user_doc = await gdb.users.find_one({"email": {"$regex": f"^{re.escape(email_clean)}$", "$options": "i"}})

    # Generic success response to prevent user enumeration attacks
    generic_response = {"message": "If an account with that email exists, a verification code has been sent."}

    if user_doc and user_doc.get("is_active", True):
        # Generate secure random 6-digit numeric verification code
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        code_hash = await asyncio.to_thread(get_password_hash, code)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=10)

        # Clear any prior unused reset requests for this email
        await gdb.password_resets.delete_many({"email": email_clean})

        # Insert new reset record
        await gdb.password_resets.insert_one({
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
        company_doc = None
        try:
            from app.core.tenant import resolve_company_from_host
            host_cid = await resolve_company_from_host(request)
            uid = user_doc.get("id")
            memberships = []
            if uid:
                memberships = await gdb.company_memberships.find(
                    {"user_id": uid, "status": "active"},
                    {"company_id": 1, "is_primary": 1},
                ).to_list(50)
            chosen = None
            mem_cids = [m.get("company_id") for m in memberships if m.get("company_id")]
            if host_cid and host_cid in mem_cids:
                chosen = host_cid
            elif len(mem_cids) == 1:
                chosen = mem_cids[0]
            elif mem_cids:
                primary = next((m.get("company_id") for m in memberships if m.get("is_primary")), None)
                chosen = primary or mem_cids[0]
            elif user_doc.get("company_id"):
                chosen = user_doc.get("company_id")
            if chosen:
                company_doc = await gdb.companies.find_one({"id": chosen}, {"_id": 0})
        except Exception as resolve_err:
            logger.warning("Password reset company resolve failed: %s", resolve_err)
        try:
            await EmailService.send_password_reset_code(
                recipient_email=email_clean,
                code=code,
                recipient_name=recipient_name,
                company=company_doc,
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
    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is currently unavailable.",
        )

    email_clean = str(payload.email).lower().strip()
    code_clean = payload.code.strip()

    reset_doc = await gdb.password_resets.find_one(
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

    if not await asyncio.to_thread(verify_password, code_clean, reset_doc.get("code_hash", "")):
        updated = await gdb.password_resets.find_one_and_update(
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



from pydantic import BaseModel

class InviteVerifyRequest(BaseModel):
    token: str

class InviteAcceptRequest(BaseModel):
    token: str
    password: str

@router.post("/invite/verify")
async def verify_invite(request: Request, payload: InviteVerifyRequest):
    """Verifies invite token validity and returns basic recipient information."""
    import hashlib
    await enforce_shared_rate_limit(f"invite-ip:{get_client_ip(request)}", 10, 3600)
    raw_token = payload.token.strip()
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token missing.")
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database unavailable.")

    user_doc = await gdb.users.find_one({"invite_token_hash": token_hash})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invite link.")

    if user_doc.get("invite_used_at"):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has already been used.")

    now = datetime.now(timezone.utc)
    exp = user_doc.get("invite_expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and now > exp:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has expired.")

    return {
        "valid": True,
        "email": user_doc.get("email"),
        "name": user_doc.get("name") or user_doc.get("full_name"),
        "company_id": user_doc.get("company_id"),
    }

@router.post("/invite/accept")
async def accept_invite(request: Request, payload: InviteAcceptRequest):
    """Accepts single-use invite, sets admin password, and activates account."""
    import hashlib
    from pymongo import ReturnDocument
    await enforce_shared_rate_limit(f"invite-accept-ip:{get_client_ip(request)}", 10, 3600)
    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters.")

    raw_token = payload.token.strip()
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database unavailable.")

    user_doc = await gdb.users.find_one({"invite_token_hash": token_hash})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invite link.")

    if user_doc.get("invite_used_at"):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has already been used.")

    now = datetime.now(timezone.utc)
    exp = user_doc.get("invite_expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and now > exp:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has expired.")

    hashed_pwd = await asyncio.to_thread(get_password_hash, payload.password)
    mt_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)
    cid = user_doc.get("company_id") or (None if mt_enabled else "company_reamarc")
    if mt_enabled and not cid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not linked to a company",
        )
    db = get_database()
    with tenant_scope(cid):
        updated = await db.users.find_one_and_update(
            {"_id": user_doc["_id"], "invite_used_at": None},
            {
                "$set": {
                    "hashed_password": hashed_pwd,
                    "invite_used_at": now,
                    "is_active": True,
                },
                "$inc": {"token_version": 1},
            },
            return_document=ReturnDocument.AFTER,
        )
    if not updated:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has already been used.")

    from app.core.security import _AUTH_CACHE
    _AUTH_CACHE.pop(str(user_doc.get("id")), None)

    return {"message": "Invite accepted successfully. You can now log in.", "email": user_doc.get("email")}

