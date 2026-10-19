"""Admin Access Settings Router (/access).

Allows administrators to configure per-person module access (attendance, daily_log, sales,
content_calendar, website, ads) and extra content calendar stages.
All writes are audited, invalidate user context, and bump access_version.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.security import require_admin
from app.database import get_database
from app.services.access import (
    MODULES,
    VALID_CONTENT_STAGES,
    canonicalize_departments,
    default_access,
    effective_access,
    get_primary_stage,
    get_user_primary_department,
    normalize_dept,
    normalize_role,
    normalize_stage,
    parse_user_departments,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/access", tags=["Access"], dependencies=[Depends(require_admin)])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AccessPatchRequest(BaseModel):
    module: Optional[str] = None
    value: Optional[bool] = None
    content_stages: Optional[List[str]] = None


class AccessResetRequest(BaseModel):
    module: Optional[str] = None


class AccessBulkRequest(BaseModel):
    department: Optional[str] = None
    role: Optional[str] = None
    module: str
    value: bool


def _serialize_user_row(user: Dict[str, Any]) -> Dict[str, Any]:
    user_id = str(user.get("id") or user.get("_id") or "")
    name = user.get("full_name") or user.get("name") or "User"
    avatar = user.get("avatar_url") or user.get("avatar")
    role = normalize_role(user.get("role"))
    primary_department = "" if role == "operations" else get_user_primary_department(user)
    packed = canonicalize_departments(
        departments=user.get("departments") if isinstance(user.get("departments"), list) else None,
        primary=primary_department or None,
        department=user.get("department") if isinstance(user.get("department"), str) else None,
    )
    all_depts = packed["departments"] or parse_user_departments(user)
    secondary_departments = [
        d for d in all_depts
        if primary_department and d.lower() != str(primary_department).lower()
    ]

    defaults = default_access(user)
    stored_access = user.get("access") or {}

    modules_res: Dict[str, Dict[str, Any]] = {}
    for m in MODULES:
        if role in ("admin", "client"):
            modules_res[m] = {
                "value": defaults[m],
                "default": defaults[m],
                "changed": False,
            }
        else:
            stored_val = stored_access.get(m)
            has_override = stored_val is not None
            changed = has_override and (bool(stored_val) != defaults[m])
            val = bool(stored_val) if has_override else defaults[m]
            modules_res[m] = {
                "value": val,
                "default": defaults[m],
                "changed": changed,
            }

    primary_stage = get_primary_stage(primary_department)
    stored_stages = user.get("content_stages") or []
    extra_stages: List[str] = []
    if isinstance(stored_stages, list):
        for s in stored_stages:
            st = normalize_stage(s)
            if st and st in VALID_CONTENT_STAGES and st != primary_stage and st not in extra_stages:
                extra_stages.append(st)

    content_stages_res = {
        "locked": primary_stage,
        "extra": extra_stages,
    }

    return {
        "id": user_id,
        "name": name,
        "avatar": avatar,
        "role": role,
        "primary_department": primary_department,
        "departments": all_depts,
        "secondary_departments": secondary_departments,
        "modules": modules_res,
        "content_stages": content_stages_res,
    }


@router.get("/users")
async def list_access_users(
    department: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    changed_only: Optional[bool] = Query(False),
):
    """List users with effective and default access settings for the admin Access page."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    query: Dict[str, Any] = {"role": {"$ne": "client"}}

    if role:
        norm_r = normalize_role(role)
        query["role"] = {"$in": [norm_r, role, role.lower()]}

    cursor = db.users.find(query)
    users = await cursor.to_list(length=2000)

    rows: List[Dict[str, Any]] = []
    dept_filter = normalize_dept(department) if department else None
    q_clean = q.strip().lower() if q else None

    for u in users:
        row = _serialize_user_row(u)

        if dept_filter:
            u_dept = normalize_dept(row["primary_department"])
            if u_dept != dept_filter:
                continue

        if q_clean:
            name = (row["name"] or "").lower()
            email = str(u.get("email") or "").lower()
            if q_clean not in name and q_clean not in email:
                continue

        if changed_only:
            has_mod_change = any(m["changed"] for m in row["modules"].values())
            has_stage_change = bool(row["content_stages"]["extra"])
            if not (has_mod_change or has_stage_change):
                continue

        rows.append(row)

    return rows


@router.patch("/users/{user_id}")
async def patch_user_access(
    user_id: str,
    payload: AccessPatchRequest,
    current_user: dict = Depends(require_admin),
):
    """Update a user's module switch or extra content calendar stages."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    target = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target_role = normalize_role(target.get("role"))
    if target_role in ("admin", "client"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Admin and client rows are read-only.",
        )

    actor_id = str(current_user.get("id") or current_user.get("_id") or "admin")
    actor_name = current_user.get("full_name") or current_user.get("name") or "Administrator"
    target_name = target.get("full_name") or target.get("name") or "User"
    now_iso = _now_iso()

    # Handle module toggle
    if payload.module is not None:
        if payload.module not in MODULES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid module '{payload.module}'. Valid: {', '.join(MODULES)}",
            )
        if payload.value is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Field 'value' (boolean) is required when module is specified.",
            )

        defaults = default_access(target)
        default_val = defaults[payload.module]
        # Store null if value equals default; else store boolean value
        stored_val = None if payload.value == default_val else bool(payload.value)

        old_stored = (target.get("access") or {}).get(payload.module)
        old_val = bool(old_stored) if old_stored is not None else default_val

        await db.users.update_one(
            {"_id": target["_id"]},
            {
                "$set": {f"access.{payload.module}": stored_val},
                "$inc": {"access_version": 1},
            },
        )

        audit_entry = {
            "id": str(uuid.uuid4()),
            "at": now_iso,
            "actor_id": actor_id,
            "actor_name": actor_name,
            "target_type": "user",
            "target_id": user_id,
            "target_name": target_name,
            "department": target.get("primary_department"),
            "module": payload.module,
            "before": "ON" if old_val else "OFF",
            "after": "ON" if payload.value else "OFF",
            "reason": "Admin updated access switch",
        }
        await db.permission_audit.insert_one(audit_entry)

    # Handle content stages
    if payload.content_stages is not None:
        primary_dept = get_user_primary_department(target)
        primary_stage = get_primary_stage(primary_dept)

        cleaned_stages: List[str] = []
        for s in payload.content_stages:
            st = normalize_stage(s)
            if not st or st not in VALID_CONTENT_STAGES:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid stage '{s}'. Stages must be one of: {', '.join(VALID_CONTENT_STAGES)}.",
                )
            if st not in cleaned_stages:
                cleaned_stages.append(st)

        # Primary department stage cannot be removed if user has one
        if primary_stage and primary_stage not in cleaned_stages:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Primary department stage '{primary_stage}' cannot be removed from content_stages.",
            )

        # Extra stages are those distinct from the primary department stage
        extra_to_store = [s for s in cleaned_stages if s != primary_stage]
        old_extra = target.get("content_stages") or []

        await db.users.update_one(
            {"_id": target["_id"]},
            {
                "$set": {"content_stages": extra_to_store},
                "$inc": {"access_version": 1},
            },
        )

        audit_entry = {
            "id": str(uuid.uuid4()),
            "at": now_iso,
            "actor_id": actor_id,
            "actor_name": actor_name,
            "target_type": "user",
            "target_id": user_id,
            "target_name": target_name,
            "department": primary_dept,
            "module": "content_calendar",
            "before": f"Stages: {', '.join(old_extra) if old_extra else 'none'}",
            "after": f"Stages: {', '.join(extra_to_store) if extra_to_store else 'none'}",
            "reason": "Admin updated extra content stages",
        }
        await db.permission_audit.insert_one(audit_entry)

    # Return refreshed serialized user
    updated = await db.users.find_one({"_id": target["_id"]})
    return _serialize_user_row(updated)


@router.post("/users/{user_id}/reset")
async def reset_user_access(
    user_id: str,
    payload: AccessResetRequest = AccessResetRequest(),
    current_user: dict = Depends(require_admin),
):
    """Reset one module or all modules to default for a user."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    target = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target_role = normalize_role(target.get("role"))
    if target_role in ("admin", "client"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Admin and client rows are read-only.",
        )

    actor_id = str(current_user.get("id") or current_user.get("_id") or "admin")
    actor_name = current_user.get("full_name") or current_user.get("name") or "Administrator"
    target_name = target.get("full_name") or target.get("name") or "User"
    now_iso = _now_iso()

    if payload.module:
        if payload.module not in MODULES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid module '{payload.module}'. Valid: {', '.join(MODULES)}",
            )
        await db.users.update_one(
            {"_id": target["_id"]},
            {
                "$set": {f"access.{payload.module}": None},
                "$inc": {"access_version": 1},
            },
        )
        mod_label = payload.module
    else:
        # Reset whole row
        null_access = {m: None for m in MODULES}
        await db.users.update_one(
            {"_id": target["_id"]},
            {
                "$set": {"access": null_access, "content_stages": []},
                "$inc": {"access_version": 1},
            },
        )
        mod_label = "all modules"

    audit_entry = {
        "id": str(uuid.uuid4()),
        "at": now_iso,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "target_type": "user",
        "target_id": user_id,
        "target_name": target_name,
        "department": target.get("primary_department"),
        "module": mod_label,
        "before": "Customized",
        "after": "Default",
        "reason": f"Reset {mod_label} to default",
    }
    await db.permission_audit.insert_one(audit_entry)

    updated = await db.users.find_one({"_id": target["_id"]})
    return _serialize_user_row(updated)


@router.post("/bulk")
async def bulk_apply_access(
    payload: AccessBulkRequest,
    current_user: dict = Depends(require_admin),
):
    """Apply an ON/OFF value for a module across all users in a department and/or role."""
    if payload.module not in MODULES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid module '{payload.module}'. Valid: {', '.join(MODULES)}",
        )

    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    query: Dict[str, Any] = {"role": {"$nin": ["admin", "super_admin", "client"]}}
    if payload.role:
        norm_r = normalize_role(payload.role)
        query["role"] = {"$in": [norm_r, payload.role, payload.role.lower()]}

    users = await db.users.find(query).to_list(length=2000)

    actor_id = str(current_user.get("id") or current_user.get("_id") or "admin")
    actor_name = current_user.get("full_name") or current_user.get("name") or "Administrator"
    now_iso = _now_iso()

    dept_filter = normalize_dept(payload.department) if payload.department else None
    changed_count = 0

    for u in users:
        if dept_filter:
            u_dept = normalize_dept(get_user_primary_department(u))
            if u_dept != dept_filter:
                continue

        defaults = default_access(u)
        default_val = defaults[payload.module]
        stored_val = None if payload.value == default_val else bool(payload.value)

        # Check existing stored value
        existing_stored = (u.get("access") or {}).get(payload.module)
        if existing_stored == stored_val:
            continue

        await db.users.update_one(
            {"_id": u["_id"]},
            {
                "$set": {f"access.{payload.module}": stored_val},
                "$inc": {"access_version": 1},
            },
        )
        changed_count += 1

        u_id = str(u.get("id") or u.get("_id"))
        u_name = u.get("full_name") or u.get("name") or "User"
        audit_entry = {
            "id": str(uuid.uuid4()),
            "at": now_iso,
            "actor_id": actor_id,
            "actor_name": actor_name,
            "target_type": "user",
            "target_id": u_id,
            "target_name": u_name,
            "department": u.get("primary_department"),
            "module": payload.module,
            "before": "—",
            "after": "ON" if payload.value else "OFF",
            "reason": f"Bulk apply {payload.module} to {payload.department or 'all'} {payload.role or 'roles'}",
        }
        await db.permission_audit.insert_one(audit_entry)

    return {"changed": changed_count}
