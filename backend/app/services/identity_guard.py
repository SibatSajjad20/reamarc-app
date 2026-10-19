"""Rules for who may change a person's global login (email, password, name, phone, photo, is_active).

Reviewed get_global_db call site: identity is one user across companies.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Set

from fastapi import HTTPException, status

from app.config import settings
from app.core.security import invalidate_auth_cache
from app.core.tenant import get_global_db

logger = logging.getLogger("app.identity_guard")

HOME_LOGIN_MSG = "This person's login is managed by their home company."
SUPER_ADMIN_MSG = "This account can only be edited by the owner or the person themselves."

IDENTITY_USER_KEYS: Set[str] = {
    "email",
    "password",
    "hashed_password",
    "is_active",
    "full_name",
    "name",
    "phone",
    "phone_number",
    "avatar_url",
    "avatar_public_id",
    "photo",
}


def _uid(user: Optional[Dict[str, Any]]) -> str:
    if not user:
        return ""
    return str(user.get("id") or user.get("_id") or "")


def is_owner_actor(caller: Optional[Dict[str, Any]]) -> bool:
    if not caller:
        return False
    return bool(caller.get("is_super_admin") or caller.get("role") == "owner")


def is_self(caller: Optional[Dict[str, Any]], target: Optional[Dict[str, Any]]) -> bool:
    a = _uid(caller)
    b = _uid(target)
    return bool(a and b and a == b)


def assert_super_admin_protected(caller: dict, target: dict) -> None:
    """Even with flags off, only the person or the owner may edit a super-admin account."""
    if target.get("is_super_admin") and not (is_self(caller, target) or is_owner_actor(caller)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SUPER_ADMIN_MSG)


async def can_edit_global_identity(caller: dict, target: dict) -> bool:
    assert_super_admin_protected(caller, target)
    if target.get("is_super_admin"):
        return is_self(caller, target) or is_owner_actor(caller)

    if not getattr(settings, "MULTI_COMPANY_ENABLED", False):
        return True

    caller_cid = caller.get("company_id")
    home = target.get("company_id")
    if not home or home != caller_cid:
        return False

    gdb = get_global_db()
    if gdb is None:
        return False
    extras = await gdb.company_memberships.count_documents(
        {
            "user_id": _uid(target),
            "status": "active",
            "company_id": {"$ne": home},
        }
    )
    return extras == 0


async def assert_can_edit_global_identity(caller: dict, target: dict) -> None:
    if not await can_edit_global_identity(caller, target):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=HOME_LOGIN_MSG)


def identity_keys_in_update(update_fields: Dict[str, Any]) -> Set[str]:
    return {k for k in update_fields if k in IDENTITY_USER_KEYS}


async def invalidate_global_login(user_id: str) -> None:
    """End every other session for this login (all companies)."""
    if not user_id:
        return
    gdb = get_global_db()
    if gdb is None:
        return
    await gdb.users.update_one(
        {"$or": [{"id": user_id}, {"_id": user_id}]},
        {
            "$inc": {"token_version": 1, "session_epoch": 1},
            "$set": {"refresh_jtis": []},
        },
    )
    invalidate_auth_cache(user_id=user_id)


async def remove_company_membership(user_id: str, company_id: str) -> None:
    gdb = get_global_db()
    if gdb is None or not user_id or not company_id:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    await gdb.company_memberships.update_one(
        {"user_id": user_id, "company_id": company_id, "status": "active"},
        {
            "$set": {"status": "removed", "updated_at": now_iso},
            "$inc": {"token_version": 1},
        },
    )
    mem = await gdb.company_memberships.find_one({"user_id": user_id, "company_id": company_id})
    invalidate_auth_cache(user_id=user_id, membership_id=(mem or {}).get("id"))


def emails_allowed() -> bool:
    return bool(getattr(settings, "EMAILS_ENABLED", True))


async def create_password_reset_link(email: str, *, hours: int = 72) -> str:
    """Store a hashed one-time token and return the frontend URL. Does not set a password."""
    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    email_clean = email.lower().strip()
    await gdb.password_resets.insert_one(
        {
            "id": str(uuid.uuid4()),
            "email": email_clean,
            "token_hash": token_hash,
            "purpose": "link",
            "created_at": now,
            "expires_at": now + timedelta(hours=hours),
            "attempts": 0,
            "used": False,
        }
    )
    base = (getattr(settings, "APP_FRONTEND_URL", None) or "http://localhost:5173").rstrip("/")
    return f"{base}/reset-password?token={raw}"


async def send_password_reset_link_email(email: str, name: str, link: str) -> None:
    if not emails_allowed():
        logger.info("Email kill-switch on; password reset link not sent.")
        return
    try:
        from app.services.email_service import EmailService

        html = (
            f"<p>Hi {name or 'there'},</p>"
            f"<p>Use this link to set a new password. It expires and can only be used once.</p>"
            f'<p><a href="{link}">Set your password</a></p>'
        )
        await EmailService.send_html_email(
            recipient_email=email,
            subject="Reset your password",
            html=html,
            recipient_name=name,
        )
    except Exception as exc:
        logger.error("Failed to send password reset link: %s", type(exc).__name__)
