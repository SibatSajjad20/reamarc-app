"""Roles & Permissions API Router.

Endpoints for managing role defaults, member overrides, View as preview, and audit log.
All modification endpoints require Administrator privileges.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.security import require_admin, require_hr_or_admin
from app.database import get_database
from app.services.permissions import (
    MODULE_CONFIG,
    effective_map,
    get_user_primary_department,
    level_gte,
    load_context,
    load_role_defaults,
    normalize_dept,
    parse_user_departments,
    resolve,
)
from app.services.content_calendar_workflow import visible_stages

router = APIRouter(prefix="/settings/permissions", tags=["Roles & Permissions"])


# ──────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────
class OverrideItem(BaseModel):
    department: str
    module: str
    level: str


class RolePermissionsUpdateRequest(BaseModel):
    modules: Dict[str, str] = Field(..., description="Mapping of module name to access level")


class UserPermissionsUpdateRequest(BaseModel):
    primary_department: Optional[str] = None
    departments: Optional[List[str]] = None
    overrides: List[OverrideItem] = []
    capability_overrides: Optional[Dict[str, bool]] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fixed_rules_gone():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Role defaults and per-person overrides are fixed in code and can no longer be edited.",
    )


# ──────────────────────────────────────────────────────────
# 1. Role Defaults Endpoints
# ──────────────────────────────────────────────────────────
@router.get("/roles")
async def get_role_defaults(current_user: dict = Depends(require_hr_or_admin)):
    """Fetch all role default permission settings, module options, and member metrics."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    defaults = await load_role_defaults(db)

    # Count members and custom overrides per role
    all_users = await db.users.find({}, {"id": 1, "role": 1}).to_list(length=1000)
    member_counts: Dict[str, int] = {}
    for u in all_users:
        r = str(u.get("role") or "team_member").lower().strip()
        if r == "member":
            r = "team_member"
        member_counts[r] = member_counts.get(r, 0) + 1

    overrides = await db.user_permission_overrides.find({}, {"user_id": 1}).to_list(length=2000)
    user_override_ids = {str(o.get("user_id")) for o in overrides}

    override_counts_per_role: Dict[str, int] = {}
    for u in all_users:
        uid = str(u.get("id") or "")
        if uid in user_override_ids:
            r = str(u.get("role") or "team_member").lower().strip()
            if r == "member":
                r = "team_member"
            override_counts_per_role[r] = override_counts_per_role.get(r, 0) + 1

    return {
        "roles": ["admin", "hr", "operations", "team_lead", "team_member"],
        "modules": list(MODULE_CONFIG.keys()),
        "module_config": MODULE_CONFIG,
        "defaults": defaults,
        "member_counts": member_counts,
        "override_counts": override_counts_per_role,
    }


@router.put("/roles/{role}")
async def update_role_defaults(
    role: str,
    payload: RolePermissionsUpdateRequest,
    current_user: dict = Depends(require_admin),
):
    """Role defaults are fixed in code."""
    del role, payload, current_user
    _fixed_rules_gone()


@router.post("/roles/{role}/reset")
async def reset_role_defaults(role: str, current_user: dict = Depends(require_admin)):
    """Role defaults are fixed in code."""
    del role, current_user
    _fixed_rules_gone()


# ──────────────────────────────────────────────────────────
# 2. Members & Overrides Endpoints
# ──────────────────────────────────────────────────────────
@router.get("/users")
async def list_permission_members(
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
    custom: Optional[str] = Query(None),  # 'any', 'has_overrides', 'role_default_only'
    current_user: dict = Depends(require_hr_or_admin),
):
    """List members with department membership, primary indicator, and custom override counts."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    query: Dict[str, Any] = {"is_active": {"$ne": False}}

    if role and role.lower() != "all":
        r = role.lower().strip()
        if r == "team_member":
            query["role"] = {"$in": ["team_member", "member"]}
        else:
            query["role"] = r

    if dept and dept.lower() != "all":
        query["$or"] = [
            {"primary_department": {"$regex": f"^{re.escape(dept)}$", "$options": "i"}},
            {"departments": {"$regex": f"^{re.escape(dept)}$", "$options": "i"}},
            {"department": {"$regex": re.escape(dept), "$options": "i"}},
        ]

    users_cursor = db.users.find(query).sort("name", 1)
    raw_users = await users_cursor.to_list(length=1000)

    # Fetch all overrides to count per user
    overrides_list = await db.user_permission_overrides.find({}).to_list(length=3000)
    user_overrides_map: Dict[str, List[dict]] = {}
    for o in overrides_list:
        uid = str(o.get("user_id") or "")
        user_overrides_map.setdefault(uid, []).append(o)

    members_out = []
    total_custom_count = 0

    for u in raw_users:
        uid = str(u.get("id") or u.get("_id"))
        name = u.get("full_name") or u.get("name") or "User"
        email = u.get("email") or ""
        u_role = str(u.get("role") or "team_member").lower().strip()
        if u_role == "member":
            u_role = "team_member"

        depts = parse_user_departments(u)
        primary = get_user_primary_department(u)
        user_ovs = user_overrides_map.get(uid, [])
        ov_count = len(user_ovs)
        has_custom = ov_count > 0

        if has_custom:
            total_custom_count += 1

        # Filter by custom status if requested
        if custom == "has_overrides" and not has_custom:
            continue
        if custom == "role_default_only" and has_custom:
            continue

        # Filter by search term
        if search:
            st = search.strip().lower()
            if st not in name.lower() and st not in email.lower() and not any(st in d.lower() for d in depts):
                continue

        members_out.append(
            {
                "id": uid,
                "name": name,
                "email": email,
                "role": u_role,
                "departments": depts,
                "primary_department": primary,
                "override_count": ov_count,
                "has_custom": has_custom,
                "avatar_url": u.get("avatar_url"),
            }
        )

    return {
        "members": members_out,
        "total": len(members_out),
        "total_directory": len(raw_users),
        "total_custom": total_custom_count,
    }


@router.get("/users/{user_id}")
async def get_user_permissions(user_id: str, current_user: dict = Depends(require_hr_or_admin)):
    """Fetch user permissions profile, existing overrides, and effective map."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    u = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    ctx = await load_context(u, db=db)
    overrides = await db.user_permission_overrides.find({"user_id": user_id}).to_list(length=100)
    for ov in overrides:
        if "_id" in ov:
            ov["_id"] = str(ov["_id"])

    return {
        "user": {
            "id": user_id,
            "name": u.get("full_name") or u.get("name") or "User",
            "email": u.get("email") or "",
            "role": ctx.role,
            "department": u.get("department"),
            "departments": ctx.departments,
            "primary_department": ctx.primary_department,
            "avatar_url": u.get("avatar_url"),
        },
        "overrides": overrides,
        "capability_overrides": u.get("capability_overrides") or {},
        "effective": effective_map(ctx),
    }


@router.put("/users/{user_id}")
async def update_user_permissions(
    user_id: str,
    payload: UserPermissionsUpdateRequest,
    current_user: dict = Depends(require_admin),
):
    """Update primary and extra departments. Permission overrides are fixed in code."""
    if payload.overrides or payload.capability_overrides is not None:
        _fixed_rules_gone()
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    u = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    now = _now_iso()
    actor_id = str(current_user.get("id") or "")
    actor_name = current_user.get("full_name") or current_user.get("name") or "Administrator"
    target_name = u.get("full_name") or u.get("name") or "User"

    # 1. Update primary_department and departments list if supplied
    update_user_fields = {}
    old_primary = u.get("primary_department") or ""
    if payload.primary_department is not None and payload.primary_department != old_primary:
        update_user_fields["primary_department"] = payload.primary_department
        await db.permission_audit.insert_one(
            {
                "id": str(uuid.uuid4()),
                "at": now,
                "actor_id": actor_id,
                "actor_name": actor_name,
                "target_type": "user",
                "target_id": user_id,
                "target_name": target_name,
                "department": payload.primary_department,
                "module": "primary_department",
                "before": old_primary or "—",
                "after": payload.primary_department,
                "reason": "Primary department updated",
            }
        )

    if payload.departments is not None:
        update_user_fields["departments"] = payload.departments
        update_user_fields["department"] = ", ".join(payload.departments)

    if update_user_fields:
        await db.users.update_one({"$or": [{"id": user_id}, {"_id": user_id}]}, {"$set": update_user_fields})

    updated_user = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    ctx = await load_context(updated_user, db=db, force=True)
    return {
        "message": "Departments updated. Module access follows the fixed role rules.",
        "effective": effective_map(ctx),
    }


@router.delete("/users/{user_id}/overrides")
async def reset_user_overrides(
    user_id: str,
    department: Optional[str] = Query(None),
    current_user: dict = Depends(require_admin),
):
    """Per-person permission overrides are fixed in code."""
    del user_id, department, current_user
    _fixed_rules_gone()


# ──────────────────────────────────────────────────────────
# 3. View As Effective Preview Endpoint (Mock 04)
# ──────────────────────────────────────────────────────────
@router.get("/users/{user_id}/effective")
async def get_view_as_effective(user_id: str, current_user: dict = Depends(require_hr_or_admin)):
    """Compute complete View-As diagnostic preview matching Mock 04."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    u = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    ctx = await load_context(u, db=db)
    m = effective_map(ctx)

    # 1. Sidebar items she sees
    sidebar_items: List[str] = ["Dashboard"]
    if level_gte("content_calendar", m["summary"]["content_calendar"], "view"):
        sidebar_items.append("Content calendar")
    if level_gte("daily_log", m["summary"]["daily_log"], "own"):
        sidebar_items.append("Daily log")
    if level_gte("attendance", m["summary"]["attendance"], "own"):
        sidebar_items.append("Attendance")
    if level_gte("website", m["summary"]["website"], "view"):
        sidebar_items.append("Website pipeline")
    if level_gte("sales", m["summary"]["sales"], "own"):
        sidebar_items.append("Sales pipeline")
    if level_gte("active_clients", m["summary"]["active_clients"], "view"):
        sidebar_items.append("Active clients")

    # 2. Table rows: Module | Scope | Why
    table_rows = []

    # Daily log
    dl_lvl = m["summary"]["daily_log"]
    dl_scope = "Own entries only" if dl_lvl == "own" else ("Department" if dl_lvl == "department" else "All entries")
    dl_why = f"{ctx.role.replace('_', ' ').capitalize()} default"
    table_rows.append({"module": "Daily log", "scope": dl_scope, "why": dl_why})

    # Attendance
    att_lvl = m["summary"]["attendance"]
    att_scope = "Own records" if att_lvl == "own" else ("Department" if att_lvl == "department" else "All records")
    att_why = f"{ctx.role.replace('_', ' ').capitalize()} default"
    table_rows.append({"module": "Attendance", "scope": att_scope, "why": att_why})

    # Content calendar
    cc_parts = []
    cc_has_override = False
    for d in ctx.departments:
        lvl = resolve(ctx, "content_calendar", d)
        lvl_label = "own stages" if lvl == "own_stages" else lvl.capitalize()
        cc_parts.append(f"{d}: {lvl_label}")
        if (normalize_dept(d), "content_calendar") in ctx._override_map:
            cc_has_override = True

    cc_scope = " · ".join(cc_parts) if cc_parts else "No access"
    cc_why = "Custom override" if cc_has_override else "Derived from role & department"
    table_rows.append({"module": "Content calendar", "scope": cc_scope, "why": cc_why})

    # Pipeline stages
    stages = visible_stages(u) or []
    stages_str = ", ".join(stages) if stages else "All stages"
    table_rows.append({
        "module": "Pipeline stages",
        "scope": stages_str,
        "why": "Derived from stage owners",
    })

    # 3. Can't see list (with pill reasons)
    cannot_see = []
    if len(ctx.departments) > 1 and resolve(ctx, "daily_log", ctx.departments[1]) == "none":
        cannot_see.append({"item": f"{ctx.departments[1]} daily logs", "reason": "Secondary dept · off"})

    if ctx.role in ("team_member", "team_lead"):
        cannot_see.append({"item": "Team leads' daily logs", "reason": "Always hidden"})

    if resolve(ctx, "exceptions") == "none":
        cannot_see.append({"item": "Exceptions inbox", "reason": "No access"})

    if resolve(ctx, "sales") == "none":
        cannot_see.append({"item": "Sales pipeline", "reason": "No access"})

    if resolve(ctx, "website") == "none":
        cannot_see.append({"item": "Website pipeline", "reason": "No access"})

    if resolve(ctx, "active_clients") == "none" or resolve(ctx, "ads") == "none":
        cannot_see.append({"item": "Active clients · Ads", "reason": "No access"})

    return {
        "user": {
            "id": user_id,
            "name": u.get("full_name") or u.get("name") or "User",
            "email": u.get("email") or "",
            "role": ctx.role,
            "primary_department": ctx.primary_department,
            "departments": ctx.departments,
        },
        "sidebar_items": sidebar_items,
        "table_rows": table_rows,
        "cannot_see": cannot_see,
        "effective": m,
    }


# ──────────────────────────────────────────────────────────
# 4. Audit Log Endpoint (Mock 05)
# ──────────────────────────────────────────────────────────
@router.get("/audit")
async def get_permission_audit_logs(
    time_filter: Optional[str] = Query("30d"),  # '7d', '30d', '90d', 'all'
    actor: Optional[str] = Query(None),
    target: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(require_hr_or_admin),
):
    """Retrieve filtered audit history for permission changes."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    query: Dict[str, Any] = {}

    # Time filter
    now = datetime.now(timezone.utc)
    if time_filter == "7d":
        since = (now - timedelta(days=7)).isoformat()
        query["at"] = {"$gte": since}
    elif time_filter == "30d":
        since = (now - timedelta(days=30)).isoformat()
        query["at"] = {"$gte": since}
    elif time_filter == "90d":
        since = (now - timedelta(days=90)).isoformat()
        query["at"] = {"$gte": since}

    if actor and actor.lower() != "anyone":
        query["$or"] = [
            {"actor_id": actor},
            {"actor_name": {"$regex": re.escape(actor), "$options": "i"}},
        ]

    if target:
        query["$or"] = [
            {"target_id": target},
            {"target_name": {"$regex": re.escape(target), "$options": "i"}},
        ]

    if search:
        st = re.escape(search.strip())
        query["$or"] = [
            {"actor_name": {"$regex": st, "$options": "i"}},
            {"target_name": {"$regex": st, "$options": "i"}},
            {"module": {"$regex": st, "$options": "i"}},
            {"reason": {"$regex": st, "$options": "i"}},
        ]

    total = await db.permission_audit.count_documents(query)
    cursor = db.permission_audit.find(query).sort("at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)

    for item in items:
        if "_id" in item:
            item["_id"] = str(item["_id"])

    return {
        "items": items,
        "total": total,
        "retention_notice": "5 changes · kept for 1 year",
    }
