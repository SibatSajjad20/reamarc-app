"""Reamarc Permissions Service & Resolver.

Re-implemented on top of app.services.access.
Delegates all access resolution to effective_access while preserving
existing function signatures and invariants for callers.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Set, Union

from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.core.security import get_current_user
from app.database import get_database
from app.services.company_members import company_member_user
from app.services.access import (
    ADS_DEPTS,
    COMPANY_WIDE_ROLES,
    CONTENT_DEPTS,
    MODULES,
    SALES_DEPTS,
    VALID_CONTENT_STAGES,
    WEBSITE_DEPTS,
    default_access,
    effective_access,
    get_primary_stage,
    get_user_primary_department,
    is_tracked,
    normalize_dept,
    normalize_role,
    normalize_stage,
    parse_user_departments,
    tracked_user_filter,
    tracked_users,
)

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
        "notes": "View-only for all internal staff",
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

CAPABILITIES: Dict[str, Dict[str, Any]] = {
    "approve_won_deal": {
        "default_roles": ("admin", "operations"),
    },
}

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
        "exceptions": "all",
        "content_calendar": "view",
        "website": "view",
        "sales": "all",
        "active_clients": "manage",
        "ads": "view",
    },
    "team_lead": {
        "daily_log": "department",
        "attendance": "own",
        "exceptions": "department",
        "content_calendar": "none",
        "website": "none",
        "sales": "none",
        "active_clients": "view",
        "ads": "none",
    },
    "team_member": {
        "daily_log": "own",
        "attendance": "own",
        "exceptions": "none",
        "content_calendar": "none",
        "website": "none",
        "sales": "none",
        "active_clients": "view",
        "ads": "none",
    },
}


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
    """Permission context for a user request, delegating to effective_access."""

    def __init__(
        self,
        user: Dict[str, Any],
        overrides: Optional[List[Dict[str, Any]]] = None,
        role_defaults: Optional[Dict[str, Dict[str, str]]] = None,
    ):
        del overrides, role_defaults
        self.user = user or {}
        self.user_id = str(self.user.get("id") or "")
        self.role = normalize_role(self.user.get("role"))
        self.departments = parse_user_departments(self.user)
        self.primary_department = get_user_primary_department(self.user)
        self.overrides: List[Dict[str, Any]] = []
        self.role_defaults: Dict[str, Dict[str, str]] = SYSTEM_ROLE_DEFAULTS
        self._eff = effective_access(self.user)

    def __await__(self):
        async def _identity():
            return self
        return _identity().__await__()

    def get(self, key: str, default: Any = None) -> Any:
        return self.user.get(key, default) if isinstance(self.user, dict) else default

    def __getitem__(self, key: str) -> Any:
        return self.user[key]

    def __contains__(self, key: str) -> bool:
        return key in self.user if isinstance(self.user, dict) else False

    def keys(self):
        return self.user.keys() if isinstance(self.user, dict) else [].keys()


def invalidate_role_defaults_cache():
    """Kept for backward compatibility."""
    return None


def has_capability(user: Optional[Dict[str, Any]], capability: str) -> bool:
    """Check named capability from effective_access."""
    if not user or user.get("is_active") is False:
        return False
    eff = effective_access(user)
    return bool(eff.get("capabilities", {}).get(capability, False))


def require_capability(capability: str):
    """FastAPI dependency: current user must hold the named capability."""

    async def _dependency(current_user: Dict[str, Any] = Depends(get_current_user)) -> dict:
        if not has_capability(current_user, capability):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing capability: {capability}.",
            )
        return current_user

    return _dependency


async def load_role_defaults(db=None) -> Dict[str, Dict[str, str]]:
    del db
    return {role: dict(levels) for role, levels in SYSTEM_ROLE_DEFAULTS.items()}


def load_ctx(
    user: Optional[Dict[str, Any]],
    overrides: Optional[List[Dict[str, Any]]] = None,
    role_defaults: Optional[Dict[str, Dict[str, str]]] = None,
) -> PermCtx:
    del overrides, role_defaults
    if not user:
        return PermCtx(user={})
    if isinstance(user, dict) and "_perm_ctx" in user and isinstance(user["_perm_ctx"], PermCtx):
        return user["_perm_ctx"]
    ctx = PermCtx(user=user)
    if isinstance(user, dict):
        user["_perm_ctx"] = ctx
    return ctx


async def load_context(user: Dict[str, Any], db=None, force: bool = False) -> PermCtx:
    del db
    if not force and isinstance(user, dict) and "_perm_ctx" in user and isinstance(user["_perm_ctx"], PermCtx):
        return user["_perm_ctx"]
    ctx = PermCtx(user=user or {})
    if isinstance(user, dict):
        user["_perm_ctx"] = ctx
        user["_perm_ctx_loaded_from_db"] = True
    return ctx


def resolve(
    ctx: Union[PermCtx, Dict[str, Any]],
    module: str,
    department: Optional[str] = None,
) -> str:
    """Resolve effective permission level for (user, module, department)."""
    user = ctx.user if isinstance(ctx, PermCtx) else (ctx or {})
    role = normalize_role(user.get("role"))

    if module not in MODULE_LEVELS and module not in ("active_clients", "exceptions"):
        return "none"

    if role == "admin":
        return "all" if "all" in MODULE_LEVELS.get(module, ["none"]) else "manage"

    if role == "client":
        return "none"

    eff = effective_access(user)

    # Operations & HR are company-wide; department does not narrow them
    if role in COMPANY_WIDE_ROLES:
        return eff["levels"].get(module, "none")

    # If department is explicitly specified for a lead/member, check secondary department rules
    primary_dept = normalize_dept(get_user_primary_department(user))
    if department:
        target_dept = normalize_dept(department)
        if primary_dept and target_dept and target_dept != primary_dept:
            # Secondary department rule: grants ONLY content_calendar stages
            if module == "content_calendar":
                if target_dept in CONTENT_DEPTS and eff["modules"].get("content_calendar"):
                    return eff["levels"].get("content_calendar", "none")
            return "none"

    return eff["levels"].get(module, "none")


def departments_with(ctx: PermCtx, module: str, min_level: str) -> List[str]:
    """Return list of departments where this user has >= min_level."""
    matched: List[str] = []
    depts = ctx.departments if ctx.departments else ([ctx.primary_department] if ctx.primary_department else [""])
    for d in depts:
        lvl = resolve(ctx, module, d)
        if level_gte(module, lvl, min_level):
            matched.append(d)
    return matched


def can_see_user_logs(ctx: Union[PermCtx, Dict[str, Any]], author: Dict[str, Any]) -> bool:
    """Check if viewer can view author's daily logs.

    Enforces invariants:
    - Admin, HR, Operations see logs.
    - Viewer can see their own logs.
    - Team members never see others' logs.
    - Team leads see logs only for active members whose PRIMARY department matches the lead's own.
    - Extra stages never widen daily log visibility.
    """
    user = ctx.user if isinstance(ctx, PermCtx) else (ctx or {})
    viewer_role = normalize_role(user.get("role"))
    viewer_id = str(user.get("id") or "")

    if not user or user.get("is_active") is False:
        return False

    if viewer_role in ("admin", "hr", "operations"):
        return True

    author_id = str(author.get("id") or "")
    if viewer_id and author_id == viewer_id:
        return True

    if viewer_role == "team_member":
        return False

    if viewer_role == "team_lead":
        author_role = normalize_role(author.get("role"))
        if author_role != "team_member":
            return False
        if author.get("is_active") is False:
            return False

        # Lead must have daily_log module switch ON
        lead_eff = effective_access(user)
        if not lead_eff["modules"].get("daily_log"):
            return False

        lead_primary = normalize_dept(get_user_primary_department(user))
        author_primary = normalize_dept(get_user_primary_department(author))

        return bool(lead_primary and author_primary and lead_primary == author_primary)

    return False


def effective_map(ctx: Union[PermCtx, Dict[str, Any]]) -> Dict[str, Any]:
    """Return effective permission map for client-side /auth/me payload."""
    user = ctx.user if isinstance(ctx, PermCtx) else (ctx or {})
    eff = effective_access(user)
    role = normalize_role(user.get("role"))
    depts = parse_user_departments(user)
    primary_dept = get_user_primary_department(user)

    per_dept_modules: Dict[str, Dict[str, str]] = {}
    for mod in MODULE_LEVELS.keys():
        per_dept_modules[mod] = {}
        for d in (depts or [primary_dept] or ["default"]):
            per_dept_modules[mod][d] = eff["levels"].get(mod, "none")

    return {
        "primary_department": eff["primary_department"],
        "departments": depts,
        "modules": eff["modules"],
        "levels": eff["levels"],
        "summary": eff["levels"],
        "content_stages": eff["content_stages"],
        "capabilities": eff["capabilities"],
        "tracked": eff["tracked"],
        "access_version": eff.get("access_version", 1),
        "role": role,
        "is_admin": role == "admin",
        "is_lead": role == "team_lead",
        "view_only": role == "operations",
        "company_wide": role in COMPANY_WIDE_ROLES,
    }


async def get_request_perm_ctx(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> PermCtx:
    """Dependency that caches PermCtx on request.state to avoid duplicate computations."""
    if hasattr(request.state, "perm_ctx"):
        return request.state.perm_ctx

    ctx = await load_context(current_user)
    request.state.perm_ctx = ctx
    return ctx


def require_permission(module: str, min_level: str):
    """FastAPI dependency factory enforcing a minimum permission level."""

    async def _dependency(current_user: Dict[str, Any] = Depends(get_current_user)) -> dict:
        eff = effective_access(current_user)
        lvl = eff["levels"].get(module, "none")
        if not level_gte(module, lvl, min_level):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions: requires {module} level '{min_level}'.",
            )
        return current_user

    return _dependency


require_module = require_permission

_OPS_WRITE_PREFIXES = (
    "/api/v1/crm",
    "/api/v1/content-calendar",
    "/api/v1/website-projects",
    "/api/v1/marketing",
    "/api/v1/daily-log",
    "/api/v1/admin/ad-accounts",
)

_OPS_WRITE_ALLOW = re.compile(
    r"^(?:/api/v1/crm/(?:approvals/won-deals/[^/]+/(?:approve|reject)|deals/[^/]+/approve-won|leads/[^/]+/approve-won|leads/[^/]+/register-client|leads/[^/]+/convert-to-workspace)|/api/v1/daily-log/upload)$"
)


def operations_mutation_blocked(method: str, path: str, role: str) -> bool:
    """True when an operations user is attempting a work-module write."""
    if normalize_role(role) != "operations":
        return False
    if str(method or "").upper() in ("GET", "HEAD", "OPTIONS"):
        return False
    clean = str(path or "").split("?", 1)[0].rstrip("/") or "/"
    if _OPS_WRITE_ALLOW.match(clean):
        return False
    return any(clean == prefix or clean.startswith(prefix + "/") for prefix in _OPS_WRITE_PREFIXES)


async def operations_view_only_middleware(request: Request, call_next):
    """Reject operations writes on work modules. View requests pass through."""
    if not operations_mutation_blocked(request.method, request.url.path, "operations"):
        return await call_next(request)
    role = await _role_for_write_guard(request)
    if normalize_role(role) == "operations":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "Operations has view-only access to this module."},
        )
    return await call_next(request)


async def _role_for_write_guard(request: Request) -> str:
    if request.method.upper() in ("GET", "HEAD", "OPTIONS"):
        return ""
    token = ""
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        token = request.cookies.get("access_token") or ""
    if not token:
        return ""
    from app.core.security import decode_access_token

    payload = decode_access_token(token)
    if not payload:
        return ""
    user_id = str(payload.get("sub") or "")
    db = get_database()
    if db is not None and user_id:
        try:
            user = await company_member_user(user_id, db=db)
        except Exception:
            user = None
        if user:
            return normalize_role(user.get("role"))
    return normalize_role(payload.get("role"))
