"""Reamarc Permissions Service & Resolver.

Implements unified RBAC + per-department permission resolution according to
permissions-plan.md.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import Depends, HTTPException, Request, status

from app.core.security import get_current_user
from app.database import get_database

logger = logging.getLogger(__name__)

# Ordered levels per module (index 0 is lowest / no access)
MODULE_LEVELS: Dict[str, List[str]] = {
    "daily_log": ["none", "own", "department", "all"],
    "attendance": ["none", "own", "department", "all"],
    "exceptions": ["none", "department", "all"],
    "content_calendar": ["none", "view", "own_stages", "manage"],
    "website": ["none", "view", "assigned", "manage"],
    "sales": ["none", "own", "department", "all"],
    "active_clients": ["none", "view", "manage"],
    "ads": ["none", "view", "manage"],
}

LOG_LIKE_MODULES: Set[str] = {"daily_log", "attendance", "exceptions"}
WORK_MODULES: Set[str] = {
    "content_calendar",
    "website",
    "sales",
    "active_clients",
    "ads",
}

# Module display labels and available level choices for UI / validation
MODULE_CONFIG = {
    "daily_log": {
        "label": "Daily log",
        "levels": [
            ("own", "Own only"),
            ("department", "Department"),
            ("all", "All"),
        ],
        "notes": "Secondary departments: off by default",
        "has_none": True,
    },
    "attendance": {
        "label": "Attendance",
        "levels": [
            ("own", "Own only"),
            ("department", "Department"),
            ("all", "All"),
        ],
        "notes": "Secondary departments: off by default",
        "has_none": True,
    },
    "exceptions": {
        "label": "Exceptions",
        "levels": [
            ("none", "No access"),
            ("department", "Department"),
            ("all", "All"),
        ],
        "notes": "Secondary departments: off by default",
        "has_none": True,
    },
    "content_calendar": {
        "label": "Content calendar",
        "levels": [
            ("none", "No access"),
            ("view", "View"),
            ("own_stages", "Work on own stages"),
            ("manage", "Manage"),
        ],
        "notes": "Applies per department",
        "has_none": True,
    },
    "website": {
        "label": "Website pipeline",
        "levels": [
            ("none", "No access"),
            ("view", "View"),
            ("assigned", "Assigned tasks"),
            ("manage", "Manage"),
        ],
        "notes": "Applies per department",
        "has_none": True,
    },
    "sales": {
        "label": "Sales pipeline",
        "levels": [
            ("none", "No access"),
            ("own", "Own leads"),
            ("department", "Department"),
            ("all", "All"),
        ],
        "notes": "—",
        "has_none": True,
    },
    "active_clients": {
        "label": "Active clients",
        "levels": [
            ("none", "No access"),
            ("view", "View"),
            ("manage", "Manage"),
        ],
        "notes": "—",
        "has_none": True,
    },
    "ads": {
        "label": "Ads",
        "levels": [
            ("none", "No access"),
            ("view", "View"),
            ("manage", "Manage"),
        ],
        "notes": "—",
        "has_none": True,
    },
}

# Department clusters
CONTENT_DEPTS: Set[str] = {
    "content",
    "creative",
    "social media",
    "social",
    "performance marketing",
    "performance",
    "performance_marketing",
    "content and creative",
    "content & creative",
}

WEBSITE_DEPTS: Set[str] = {
    "website",
    "web development",
    "software development",
    "software",
    "dev",
}

SALES_DEPTS: Set[str] = {
    "sales",
}

# Base system default role permissions matrix (plan §2.4)
SYSTEM_ROLE_DEFAULTS: Dict[str, Dict[str, str]] = {
    "admin": {
        "daily_log": "all",
        "attendance": "all",
        "exceptions": "all",
        "content_calendar": "manage",
        "website": "manage",
        "sales": "all",
        "active_clients": "manage",
        "ads": "manage",
    },
    "hr": {
        "daily_log": "all",
        "attendance": "all",
        "exceptions": "all",
        "content_calendar": "none",
        "website": "none",
        "sales": "none",
        "active_clients": "view",
        "ads": "none",
    },
    "operations": {
        "daily_log": "all",
        "attendance": "all",
        "exceptions": "none",
        "content_calendar": "none",
        "website": "manage",
        "sales": "all",
        "active_clients": "view",
        "ads": "none",
    },
    "team_lead": {
        "daily_log": "department",
        "attendance": "own",
        "exceptions": "department",
        "content_calendar": "manage",  # Applies when dept in CONTENT_DEPTS, else none
        "website": "manage",           # Applies when dept in WEBSITE_DEPTS, else view
        "sales": "all",                # Applies when dept in SALES_DEPTS, else none
        "active_clients": "view",
        "ads": "none",
    },
    "team_member": {
        "daily_log": "own",
        "attendance": "own",
        "exceptions": "none",
        "content_calendar": "own_stages", # If content/creative/social; view if perf; else none
        "website": "assigned",            # If website dept; else none
        "sales": "own",                   # If sales dept; else none
        "active_clients": "view",
        "ads": "none",
    },
}


def normalize_dept(dept: Optional[str]) -> str:
    """Standardize department strings for uniform casing and trimming."""
    if not dept:
        return ""
    d = str(dept).strip().lower()
    # Normalize synonyms
    if d in ("social", "social_media"):
        return "social media"
    if d in ("performance", "performance_marketing"):
        return "performance marketing"
    if d in ("web development", "software development", "software", "dev"):
        return "website"
    return d


def parse_user_departments(user: Optional[Dict[str, Any]]) -> List[str]:
    """Parse distinct ordered list of departments from a user dict."""
    if not user:
        return []
    result: List[str] = []
    seen: Set[str] = set()

    # 1. Primary department if set
    primary = str(user.get("primary_department") or "").strip()
    if primary:
        result.append(primary)
        seen.add(primary.lower())

    # 2. departments list
    depts = user.get("departments")
    if isinstance(depts, list):
        for item in depts:
            clean = str(item or "").strip()
            if clean and clean.lower() not in seen:
                seen.add(clean.lower())
                result.append(clean)

    # 3. department string fallback
    dept_str = user.get("department")
    if isinstance(dept_str, str) and dept_str.strip():
        # Split on comma, semicolon, slash, and 'and'
        tokens = re.split(r"[,;/]|\band\b", dept_str, flags=re.IGNORECASE)
        for tok in tokens:
            clean = tok.strip()
            if clean and clean.lower() not in seen:
                seen.add(clean.lower())
                result.append(clean)

    return result


def get_user_primary_department(user: Optional[Dict[str, Any]]) -> str:
    if not user:
        return ""
    primary = str(user.get("primary_department") or "").strip()
    if primary:
        return primary
    depts = parse_user_departments(user)
    return depts[0] if depts else ""


def level_rank(module: str, level: str) -> int:
    levels = MODULE_LEVELS.get(module, ["none"])
    try:
        return levels.index(level)
    except ValueError:
        return -1


def level_gte(module: str, current: str, target: str) -> bool:
    """Return True if current level is >= target level in the module hierarchy."""
    return level_rank(module, current) >= level_rank(module, target)


class PermCtx:
    """Loaded permission context for a user request."""

    def __init__(
        self,
        user: Dict[str, Any],
        overrides: List[Dict[str, Any]],
        role_defaults: Dict[str, Dict[str, str]],
    ):
        self.user = user
        self.user_id = str(user.get("id") or "")
        raw_role = str(user.get("role") or "team_member").lower().strip()
        if raw_role == "member":
            raw_role = "team_member"
        self.role = raw_role
        self.departments = parse_user_departments(user)
        self.primary_department = get_user_primary_department(user)
        self.overrides = overrides
        self.role_defaults = role_defaults

        # Build fast lookup map for overrides: (normalized_dept, module) -> level
        self._override_map: Dict[tuple[str, str], str] = {}
        for ov in overrides:
            dept_key = normalize_dept(ov.get("department"))
            mod_key = str(ov.get("module") or "").strip()
            lvl = str(ov.get("level") or "").strip()
            if mod_key in MODULE_LEVELS and lvl in MODULE_LEVELS[mod_key]:
                self._override_map[(dept_key, mod_key)] = lvl


# In-memory cache for role defaults from database
_ROLE_DEFAULTS_CACHE: Optional[Dict[str, Dict[str, str]]] = None


def invalidate_role_defaults_cache():
    global _ROLE_DEFAULTS_CACHE
    _ROLE_DEFAULTS_CACHE = None


async def load_role_defaults(db=None) -> Dict[str, Dict[str, str]]:
    """Fetch role defaults from role_permissions collection, or fall back to system defaults."""
    global _ROLE_DEFAULTS_CACHE
    if _ROLE_DEFAULTS_CACHE is not None:
        return _ROLE_DEFAULTS_CACHE

    if db is None:
        db = get_database()

    role_map: Dict[str, Dict[str, str]] = {
        role: dict(defaults) for role, defaults in SYSTEM_ROLE_DEFAULTS.items()
    }

    if db is not None:
        try:
            cursor = db.role_permissions.find({})
            async for doc in cursor:
                role = str(doc.get("role") or "").lower().strip()
                module = str(doc.get("module") or "").strip()
                level = str(doc.get("level") or "").strip()
                if role in role_map and module in MODULE_LEVELS:
                    if level in MODULE_LEVELS[module]:
                        role_map[role][module] = level
        except Exception as e:
            logger.warning("Failed to load role_permissions from MongoDB: %s", e)

    _ROLE_DEFAULTS_CACHE = role_map
    return role_map


async def load_context(user: Dict[str, Any], db=None) -> PermCtx:
    """Load permission context for a user in one query (overrides) + cached defaults."""
    if db is None:
        db = get_database()

    role_defaults = await load_role_defaults(db)
    user_id = str(user.get("id") or "")
    overrides: List[Dict[str, Any]] = []

    if db is not None and user_id:
        try:
            cursor = db.user_permission_overrides.find({"user_id": user_id})
            overrides = await cursor.to_list(length=100)
        except Exception as e:
            logger.warning("Failed to load user_permission_overrides for %s: %s", user_id, e)

    return PermCtx(user=user, overrides=overrides, role_defaults=role_defaults)


def _department_default_level(
    role: str,
    module: str,
    department: str,
    base_level: str,
    is_secondary: bool = False,
) -> str:
    """Compute role default for department-scoped work modules."""
    dept_norm = normalize_dept(department)

    if module == "content_calendar":
        if role == "team_lead":
            if is_secondary:
                # Secondary department does not automatically confer lead powers
                return "own_stages" if dept_norm in CONTENT_DEPTS else "none"
            return base_level if dept_norm in CONTENT_DEPTS else "none"
        if role == "team_member":
            if dept_norm in {"performance marketing"}:
                return "view"
            if dept_norm in CONTENT_DEPTS:
                return base_level  # "own_stages"
            return "none"

    if module == "website":
        if role == "team_lead":
            if is_secondary:
                # Secondary website dept gets view, not lead manage
                return "view"
            return base_level if dept_norm in WEBSITE_DEPTS else "view"
        if role == "team_member":
            if is_secondary:
                # Secondary website member gets view
                return "view" if dept_norm in WEBSITE_DEPTS else "none"
            return base_level if dept_norm in WEBSITE_DEPTS else "none"

    if module == "sales":
        if role == "team_lead":
            return base_level if dept_norm in SALES_DEPTS else "none"
        if role == "team_member":
            return base_level if dept_norm in SALES_DEPTS else "none"

    return base_level


def resolve(ctx: PermCtx, module: str, department: Optional[str] = None) -> str:
    """Resolve the effective permission level for (user, module, department).

    Enforces invariants:
    - Admin is always max ('all' or 'manage').
    - Client is always 'none' (workspace-scoped only).
    - Secondary departments default to 'none' for log_like modules.
    - Explicit user overrides take precedence over role defaults.
    """
    if module not in MODULE_LEVELS:
        return "none"

    # Invariant 1: Admin always has full power
    if ctx.role == "admin":
        return "all" if "all" in MODULE_LEVELS[module] else "manage"

    # Invariant 2: Client has no internal module access
    if ctx.role == "client":
        return "none"

    dept = department or ctx.primary_department or (ctx.departments[0] if ctx.departments else "")
    norm_dept = normalize_dept(dept)

    # 1. Check explicit user override
    if (norm_dept, module) in ctx._override_map:
        return ctx._override_map[(norm_dept, module)]

    # 2. Check secondary department rule (§2.1):
    # If this is a secondary department and no override was specified:
    is_secondary = False
    if ctx.primary_department and norm_dept:
        if norm_dept != normalize_dept(ctx.primary_department):
            is_secondary = True

    if is_secondary and module in LOG_LIKE_MODULES:
        # Daily log, attendance, and exceptions default to none for secondary depts
        return "none"

    # 3. Role default lookup
    role_dict = ctx.role_defaults.get(ctx.role, SYSTEM_ROLE_DEFAULTS.get(ctx.role, {}))
    base_level = role_dict.get(module, "none")

    # If it's a department-scoped work module, apply role department rules
    if module in {"content_calendar", "website", "sales"}:
        return _department_default_level(
            ctx.role, module, dept, base_level, is_secondary=is_secondary
        )

    return base_level


def departments_with(ctx: PermCtx, module: str, min_level: str) -> List[str]:
    """Return list of departments where this user has >= min_level."""
    matched: List[str] = []
    # If user has no departments list, evaluate on primary or general
    depts = ctx.departments if ctx.departments else ([ctx.primary_department] if ctx.primary_department else [""])
    for d in depts:
        lvl = resolve(ctx, module, d)
        if level_gte(module, lvl, min_level):
            matched.append(d)
    return matched


def can_see_user_logs(ctx: PermCtx, author: Dict[str, Any]) -> bool:
    """Enforce hard invariants and department scoping for viewing daily logs & exceptions."""
    if ctx.role == "admin":
        return True
    if ctx.role == "hr":
        return True

    author_id = str(author.get("id") or "")
    if ctx.user_id and author_id == ctx.user_id:
        return True

    author_role = str(author.get("role") or "team_member").lower().strip()
    if author_role == "member":
        author_role = "team_member"

    # Hard Invariant: Team members NEVER see team leads' or admins' logs
    if ctx.role == "team_member":
        return False

    # Hard Invariant: Team leads NEVER see other team leads' or admins' logs
    if ctx.role == "team_lead" and author_role in ("team_lead", "admin"):
        return False

    if ctx.role == "operations":
        # Operations has daily_log: all
        return True

    if ctx.role == "team_lead":
        # Can only see team members in their authorized daily_log departments
        if author_role != "team_member":
            return False

        # Lead must have daily_log >= 'department' in author's primary department
        lead_depts = [normalize_dept(d) for d in departments_with(ctx, "daily_log", "department")]
        author_primary = normalize_dept(get_user_primary_department(author))

        if author_primary and author_primary in lead_depts:
            return True

        # Check if author has an explicit override enabling daily_log on a secondary department matching lead
        author_overrides = author.get("overrides") or []
        for ov in author_overrides:
            ov_dept = normalize_dept(ov.get("department"))
            if ov.get("module") == "daily_log" and ov.get("level") in ("department", "all") and ov_dept in lead_depts:
                return True

        return False

    return False


def effective_map(ctx: PermCtx) -> Dict[str, Any]:
    """Return effective permission map for client-side /auth/me payload."""
    depts = ctx.departments if ctx.departments else ([ctx.primary_department] if ctx.primary_department else [])

    per_dept_modules: Dict[str, Dict[str, str]] = {}
    summary: Dict[str, str] = {}

    for mod in MODULE_LEVELS.keys():
        per_dept_modules[mod] = {}
        highest_lvl = "none"
        if not depts:
            lvl = resolve(ctx, mod, None)
            per_dept_modules[mod]["default"] = lvl
            highest_lvl = lvl
        else:
            for d in depts:
                lvl = resolve(ctx, mod, d)
                per_dept_modules[mod][d] = lvl
                if level_gte(mod, lvl, highest_lvl):
                    highest_lvl = lvl
        summary[mod] = highest_lvl

    return {
        "primary_department": ctx.primary_department,
        "departments": ctx.departments,
        "modules": per_dept_modules,
        "summary": summary,
        "role": ctx.role,
        "is_admin": ctx.role == "admin",
        "is_lead": ctx.role == "team_lead",
    }


async def get_request_perm_ctx(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> PermCtx:
    """Dependency that caches PermCtx on request.state to avoid duplicate queries."""
    if hasattr(request.state, "perm_ctx"):
        return request.state.perm_ctx

    ctx = await load_context(current_user)
    request.state.perm_ctx = ctx
    return ctx


def require_permission(module: str, min_level: str):
    """FastAPI dependency factory enforcing a minimum permission level."""
    async def _dependency(ctx: PermCtx = Depends(get_request_perm_ctx)) -> PermCtx:
        lvl = resolve(ctx, module)
        if not level_gte(module, lvl, min_level):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions: requires {module} level '{min_level}'.",
            )
        return ctx

    return _dependency
