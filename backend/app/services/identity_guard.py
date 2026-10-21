"""Rules for who may change a person's global login (email, password, name, phone, photo, is_active).

Reviewed get_global_db call site: identity is one user across companies.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

from fastapi import HTTPException, status

from app.config import settings
from app.core.security import invalidate_auth_cache
from app.core.tenant import get_global_db

logger = logging.getLogger("app.identity_guard")

HOME_LOGIN_MSG = "This person's login is managed by their home company."
SUPER_ADMIN_MSG = "This account can only be edited by the owner or the person themselves."
LAST_ADMIN_MSG = "Every company needs at least one Admin"
HR_PRIVILEGED_MSG = "HR cannot modify Admin or Operations accounts."
ADMIN_PEER_MSG = "Only the platform owner can edit another Admin."
OWN_ROLE_MSG = "You can't change your own role"
HR_ROLE_MSG = "HR cannot set a role to or from Admin or Operations."
ADMIN_EDIT_DENIED_MSG = "You cannot change another Admin's details."

PRIVILEGED_ROLES: Set[str] = {"admin", "operations"}
ADMIN_ROLES: Set[str] = {"admin"}

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


def _norm_role(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "value"):
        value = value.value
    return str(value or "").lower().strip()


def caller_role_in_company(caller: Optional[Dict[str, Any]]) -> str:
    return _norm_role((caller or {}).get("role"))


def target_role_value(target_role_in_company: Any, target_user: Optional[Dict[str, Any]] = None) -> str:
    role = _norm_role(target_role_in_company)
    if role:
        return role
    return _norm_role((target_user or {}).get("role"))


@dataclass(frozen=True)
class MemberEditFlags:
    can_edit: bool
    can_edit_identity: bool
    can_edit_role: bool
    deny_reason: Optional[str] = None


def _payload_dict(payload_fields: Any) -> Dict[str, Any]:
    if payload_fields is None:
        return {}
    if isinstance(payload_fields, dict):
        return dict(payload_fields)
    dump = getattr(payload_fields, "model_dump", None)
    if callable(dump):
        try:
            return dump(exclude_unset=True)
        except TypeError:
            return dump()
    return dict(payload_fields)


def _names_equal(left: Any, right: Any) -> bool:
    return str(left or "").strip() == str(right or "").strip()


def requested_identity_changes(payload: Dict[str, Any], target: Dict[str, Any]) -> Set[str]:
    changes: Set[str] = set()
    if "email" in payload and payload.get("email") is not None:
        if str(payload.get("email") or "").lower() != str(target.get("email") or "").lower():
            changes.add("email")
    if payload.get("password") or payload.get("hashed_password"):
        pwd = payload.get("password")
        if pwd is None or str(pwd).strip():
            changes.add("password")
    if "full_name" in payload and payload.get("full_name") is not None:
        if not _names_equal(payload.get("full_name"), target.get("full_name") or target.get("name")):
            changes.add("full_name")
    if "name" in payload and payload.get("name") is not None:
        if not _names_equal(payload.get("name"), target.get("name") or target.get("full_name")):
            changes.add("name")
    if "phone" in payload and payload.get("phone") is not None:
        if str(payload.get("phone") or "").strip() != str(target.get("phone") or target.get("phone_number") or "").strip():
            changes.add("phone")
    if "phone_number" in payload and payload.get("phone_number") is not None:
        if str(payload.get("phone_number") or "").strip() != str(
            target.get("phone_number") or target.get("phone") or ""
        ).strip():
            changes.add("phone_number")
    for key in ("avatar_url", "avatar_public_id", "photo"):
        if key in payload and payload.get(key) != target.get(key):
            changes.add(key)
    return changes


def requested_role_change(payload: Dict[str, Any], current_role: str) -> Optional[str]:
    if "role" not in payload or payload.get("role") is None:
        return None
    new_role = _norm_role(payload.get("role"))
    if new_role == current_role:
        return None
    return new_role


def _is_removal_payload(payload: Dict[str, Any]) -> bool:
    if payload.get("_delete") or payload.get("delete") or payload.get("_remove"):
        return True
    action = str(payload.get("_action") or "").lower()
    return action in {"delete", "remove"}


def assert_super_admin_protected(caller: dict, target: dict) -> None:
    """Even with flags off, only the person or the owner may edit a super-admin account."""
    if target.get("is_super_admin") and not (is_self(caller, target) or is_owner_actor(caller)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SUPER_ADMIN_MSG)


async def can_edit_global_identity(
    caller: dict,
    target: dict,
    *,
    extra_active_memberships: Optional[int] = None,
) -> bool:
    if target.get("is_super_admin") and not (is_self(caller, target) or is_owner_actor(caller)):
        return False
    if is_owner_actor(caller):
        return True
    if target.get("is_super_admin"):
        return is_self(caller, target)

    if not getattr(settings, "MULTI_COMPANY_ENABLED", False):
        return True

    caller_cid = caller.get("company_id")
    home = target.get("company_id")
    if not home or home != caller_cid:
        return False

    if extra_active_memberships is not None:
        return extra_active_memberships == 0

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
    assert_super_admin_protected(caller, target)
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
    if getattr(settings, "MULTI_COMPANY_ENABLED", False):
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
        return

    db = gdb
    if db is None:
        from app.database import get_database
        db = get_database()
    if db is None:
        return
    cursor = db.users.find({"role": "admin", "is_active": {"$ne": False}})
    admins = await cursor.to_list(200)
    remaining = 0
    for row in admins:
        if excluding_user_id and _uid(row) == str(excluding_user_id):
            continue
        remaining += 1
    if remaining < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=LAST_ADMIN_MSG)


async def member_edit_flags(
    caller: dict,
    target_user: dict,
    target_role_in_company: Any,
    *,
    extra_active_memberships: Optional[int] = None,
) -> MemberEditFlags:
    """UI/API flags for the current caller against one member row."""
    target_role = target_role_value(target_role_in_company, target_user)
    actor_role = caller_role_in_company(caller)
    owner = is_owner_actor(caller)
    self_edit = is_self(caller, target_user)

    if target_user.get("is_super_admin") and not (self_edit or owner):
        return MemberEditFlags(False, False, False, SUPER_ADMIN_MSG)

    if actor_role == "hr" and not owner and target_role in PRIVILEGED_ROLES:
        return MemberEditFlags(False, False, False, HR_PRIVILEGED_MSG)

    if actor_role == "admin" and not owner and target_role in ADMIN_ROLES and not self_edit:
        return MemberEditFlags(False, False, False, ADMIN_PEER_MSG)

    may_identity = await can_edit_global_identity(
        caller,
        target_user,
        extra_active_memberships=extra_active_memberships,
    )

    can_role = True
    if self_edit and actor_role == "admin" and not owner:
        can_role = False
    if actor_role == "hr" and not owner and target_role in PRIVILEGED_ROLES:
        can_role = False

    return MemberEditFlags(True, may_identity, can_role, None)


async def assert_can_edit_member(
    caller: dict,
    target_user: dict,
    target_role_in_company: Any,
    payload_fields: Any,
) -> MemberEditFlags:
    """Enforce directory edit rules 1-4 and 6. Returns the flags used."""
    payload = _payload_dict(payload_fields)
    target_role = target_role_value(target_role_in_company, target_user)
    new_role = requested_role_change(payload, target_role)
    deactivating = payload.get("is_active") is False
    removing = _is_removal_payload(payload)
    target_is_admin = target_role in ADMIN_ROLES or bool(target_user.get("is_super_admin"))

    if target_is_admin and (new_role is not None or deactivating or removing):
        gdb = get_global_db()
        if not getattr(settings, "MULTI_COMPANY_ENABLED", False):
            from app.database import get_database
            gdb = gdb or get_database()
        await assert_company_keeps_an_admin(
            gdb,
            str(caller.get("company_id") or target_user.get("company_id") or ""),
            excluding_user_id=_uid(target_user),
        )

    flags = await member_edit_flags(caller, target_user, target_role)

    identity_changes = requested_identity_changes(payload, target_user)

    if not flags.can_edit and payload:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=flags.deny_reason or ADMIN_EDIT_DENIED_MSG,
        )

    if identity_changes and not flags.can_edit_identity:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=HOME_LOGIN_MSG)

    if new_role is not None:
        actor_role = caller_role_in_company(caller)
        owner = is_owner_actor(caller)
        if not flags.can_edit_role:
            if is_self(caller, target_user) and actor_role == "admin" and not owner:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=OWN_ROLE_MSG)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=flags.deny_reason or OWN_ROLE_MSG,
            )
        if actor_role == "hr" and not owner:
            if new_role in PRIVILEGED_ROLES or target_role in PRIVILEGED_ROLES:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=HR_ROLE_MSG)

    return flags


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
