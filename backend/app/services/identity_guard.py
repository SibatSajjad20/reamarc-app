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
LAST_ADMIN_MSG = "This company must keep at least one active admin."

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
    return bool(caller.get("is_super_admin"))


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


async def assert_company_keeps_an_admin(
    gdb: Any,
    company_id: str,
    *,
    excluding_user_id: Optional[str] = None,
) -> None:
    """Refuse actions that would leave a company with zero active admins."""
    if gdb is None or not company_id:
        return
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": "active",
        "role": "admin",
    }
    if excluding_user_id:
        query["user_id"] = {"$ne": excluding_user_id}
    remaining = await gdb.company_memberships.count_documents(query)
    if remaining < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=LAST_ADMIN_MSG)


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
