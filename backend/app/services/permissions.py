"""Reamarc Permissions Service & Resolver.

Implements unified RBAC + per-department permission resolution according to
permissions-plan.md.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Union

from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

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

ADS_DEPTS: Set[str] = {
    "seo",
    "performance marketing",
    "performance",
    "performance_marketing",
    "ads",
}

# Named capabilities layered on top of module levels (not a sales-module grant).
CAPABILITIES: Dict[str, Dict[str, Any]] = {
    "approve_won_deal": {
        "default_roles": ("admin", "operations"),
    },
}

# Fixed role rules. Stored role_permissions and user_permission_overrides are not read.
COMPANY_WIDE_ROLES = {"admin", "operations", "hr"}

# Base system default role permissions matrix. This plus department logic is the only access input.
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
        "active_clients": "none",
        "ads": "none",
    },
    # View every module. Writes are rejected except won-deal approval and HR-style approvals.
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
        "content_calendar": "none",  # Department grants these per Phase 1
        "website": "none",
        "sales": "none",
        "active_clients": "none",
        "ads": "none",
    },
    "team_member": {
        "daily_log": "own",
        "attendance": "own",
        "exceptions": "none",
        "content_calendar": "none",  # Department grants these per Phase 1
        "website": "none",
        "sales": "none",
        "active_clients": "none",
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
        # Split on comma, semicolon, slash, '&', and 'and'
        tokens = re.split(r"[,;/&]|\band\b", dept_str, flags=re.IGNORECASE)
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
    """Kept so older callers import. Role rules are no longer cached from the database."""
    return None


def _capability_role(user: Optional[Dict[str, Any]]) -> str:
    role = str((user or {}).get("role") or "").lower().strip()
    if role == "member":
        return "team_member"
    return role


def has_capability(user: Optional[Dict[str, Any]], capability: str) -> bool:
    """Named capabilities come only from the fixed role table."""
    if not user or user.get("is_active") is False:
        return False
    spec = CAPABILITIES.get(capability)
    if not spec:
        return False
    return _capability_role(user) in spec.get("default_roles", ())


def require_capability(capability: str):
    """FastAPI dependency: current user must hold the named capability."""

    async def _dependency(current_user: Dict[str, Any] = Depends(get_current_user)) -> dict:
        ctx = await load_context(current_user)
        if not has_capability(ctx.user, capability):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing capability: {capability}.",
            )
        return ctx.user

    return _dependency


async def load_role_defaults(db=None) -> Dict[str, Dict[str, str]]:
    """Return the fixed role table. Documents in role_permissions are ignored."""
    del db
    return {role: dict(levels) for role, levels in SYSTEM_ROLE_DEFAULTS.items()}


def load_ctx(
    user: Optional[Dict[str, Any]],
    overrides: Optional[List[Dict[str, Any]]] = None,
    role_defaults: Optional[Dict[str, Dict[str, str]]] = None,
) -> PermCtx:
    """Build a permission context from the fixed rules only.

    `overrides` and `role_defaults` are accepted so existing callers keep working.
    They do not change the result. Stored per-person overrides are not applied.
    """
    del overrides, role_defaults
    if not user:
        return PermCtx(user={}, overrides=[], role_defaults=SYSTEM_ROLE_DEFAULTS)
    if isinstance(user, dict) and "_perm_ctx" in user and isinstance(user["_perm_ctx"], PermCtx):
        return user["_perm_ctx"]

    ctx = PermCtx(user=user, overrides=[], role_defaults=SYSTEM_ROLE_DEFAULTS)
    if isinstance(user, dict):
        user["_perm_ctx"] = ctx
    return ctx


async def load_context(user: Dict[str, Any], db=None, force: bool = False) -> PermCtx:
    """Load the fixed permission context. Does not read override collections."""
    del db
    if not force and isinstance(user, dict) and "_perm_ctx" in user and isinstance(user["_perm_ctx"], PermCtx):
        return user["_perm_ctx"]

    ctx = PermCtx(user=user or {}, overrides=[], role_defaults=SYSTEM_ROLE_DEFAULTS)
    if isinstance(user, dict):
        user["_perm_ctx"] = ctx
        user["_perm_ctx_loaded_from_db"] = True
    return ctx


def _department_default_level(
    role: str,
    module: str,
    department: str,
    base_level: str,
    is_secondary: bool = False,
    primary_department: Optional[str] = None,
) -> str:
    """Compute role default for department-scoped work modules.

    Grants apply only to primary department.
    Secondary departments return 'none' for all modules except content_calendar stages
    (where secondary contributes stages if primary is in CONTENT_DEPTS).
    """
    dept_norm = normalize_dept(department)

    # Secondary departments grant only content_calendar stages.
    if is_secondary:
        if module == "content_calendar":
            primary_norm = normalize_dept(primary_department)
            if primary_norm in CONTENT_DEPTS and dept_norm in CONTENT_DEPTS:
                if role in ("team_lead", "lead"):
                    return "manage"
                if role in ("team_member", "member"):
                    return "own_stages"
        return "none"

    if module == "content_calendar":
        if dept_norm in CONTENT_DEPTS:
            if role in ("team_lead", "lead"):
                return "manage"
            if role in ("team_member", "member"):
                return "own_stages"
        return "none"

    if module == "website":
        if dept_norm in WEBSITE_DEPTS:
            if role in ("team_lead", "lead"):
                return "manage"
            if role in ("team_member", "member"):
                return "assigned"
        return "none"

    if module == "sales":
        if dept_norm in SALES_DEPTS:
            if role in ("team_lead", "lead"):
                return "all"
            if role in ("team_member", "member"):
                return "own"
        return "none"

    if module == "ads":
        if dept_norm in ADS_DEPTS:
            if role in ("team_lead", "lead"):
                return "manage"
            if role in ("team_member", "member"):
                return "view"
        return "none"

    if module == "active_clients":
        if dept_norm in SALES_DEPTS:
            return "view"
        return "none"

    return base_level


def resolve(ctx: Union[PermCtx, Dict[str, Any]], module: str, department: Optional[str] = None) -> str:
    """Resolve the effective permission level for (user, module, department).

    Enforces invariants:
    - Admin is always max ('all' or 'manage').
    - Client is always 'none' (workspace-scoped only).
    - Operations and HR use the fixed company-wide table. Department does not narrow them.
    - Secondary departments default to 'none' for log-like modules, website, sales, and ads.
    - Stored role defaults and per-person overrides are not applied.
    """
    if isinstance(ctx, dict):
        ctx = load_ctx(ctx)

    if module not in MODULE_LEVELS:
        return "none"

    # Invariant 1: Admin always has full power
    if ctx.role == "admin":
        return "all" if "all" in MODULE_LEVELS[module] else "manage"

    # Invariant 2: Client has no internal module access
    if ctx.role == "client":
        return "none"

    # Admin, operations, and HR are company-wide. Primary department does not limit them.
    if ctx.role in COMPANY_WIDE_ROLES:
        return SYSTEM_ROLE_DEFAULTS.get(ctx.role, {}).get(module, "none")

    dept = department or ctx.primary_department or (ctx.departments[0] if ctx.departments else "")
    norm_dept = normalize_dept(dept)

    # Secondary department rule:
    is_secondary = False
    if ctx.primary_department and norm_dept:
        if norm_dept != normalize_dept(ctx.primary_department):
            is_secondary = True

    if is_secondary:
        # Rule 8: Secondary departments grant only content_calendar stages.
        # A secondary sales, website, SEO or performance marketing department
        # does not unlock that module, the daily log or team hours.
        if module in LOG_LIKE_MODULES or module in ("website", "sales", "ads"):
            return "none"

    # 3. Role default lookup
    role_dict = ctx.role_defaults.get(ctx.role, SYSTEM_ROLE_DEFAULTS.get(ctx.role, {}))
    base_level = role_dict.get(module, "none")

    # If it's a department-scoped work module, apply role department rules
    if module in {"content_calendar", "website", "sales", "ads", "active_clients"}:
        return _department_default_level(
            ctx.role,
            module,
            dept,
            base_level,
            is_secondary=is_secondary,
            primary_department=ctx.primary_department,
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

        return False

    return False


def effective_map(ctx: Union[PermCtx, Dict[str, Any]]) -> Dict[str, Any]:
    """Return effective permission map for client-side /auth/me payload."""
    if isinstance(ctx, dict):
        ctx = load_ctx(ctx)

    depts = ctx.departments if ctx.departments else ([ctx.primary_department] if ctx.primary_department else [])

    per_dept_modules: Dict[str, Dict[str, str]] = {}
    summary: Dict[str, str] = {}

    for mod in MODULE_LEVELS.keys():
        per_dept_modules[mod] = {}
        primary_lvl = resolve(ctx, mod, ctx.primary_department) if ctx.primary_department else resolve(ctx, mod, None)
        highest_lvl = primary_lvl

        if not depts:
            lvl = resolve(ctx, mod, None)
            per_dept_modules[mod]["default"] = lvl
            highest_lvl = lvl
        else:
            for d in depts:
                lvl = resolve(ctx, mod, d)
                per_dept_modules[mod][d] = lvl
                # Only content_calendar stages can be broadened by secondary depts
                if mod == "content_calendar":
                    if level_gte(mod, lvl, highest_lvl):
                        highest_lvl = lvl

        summary[mod] = highest_lvl

    capabilities = {
        name: has_capability(ctx.user, name) for name in CAPABILITIES.keys()
    }

    return {
        "primary_department": ctx.primary_department,
        "departments": ctx.departments,
        "modules": per_dept_modules,
        "summary": summary,
        "capabilities": capabilities,
        "role": ctx.role,
        "is_admin": ctx.role == "admin",
        "is_lead": ctx.role in ("team_lead", "lead"),
        "view_only": ctx.role == "operations",
        "company_wide": ctx.role in COMPANY_WIDE_ROLES,
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
    async def _dependency(ctx: PermCtx = Depends(get_request_perm_ctx)) -> dict:
        lvl = resolve(ctx, module)
        if not level_gte(module, lvl, min_level):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions: requires {module} level '{min_level}'.",
            )
        return ctx.user

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

# Won-deal approve/reject stays available. Leave, WFH, shift, and attendance
# approvals live outside these prefixes and stay available too. Client workspace
# creation and conversion from leads stays available for operations.
_OPS_WRITE_ALLOW = re.compile(
    r"^/api/v1/crm/(?:approvals/won-deals/[^/]+/(?:approve|reject)|deals/[^/]+/approve-won|leads/[^/]+/approve-won|leads/[^/]+/register-client|leads/[^/]+/convert-to-workspace)$"
)


def operations_mutation_blocked(method: str, path: str, role: str) -> bool:
    """True when an operations user is attempting a work-module write."""
    if str(role or "").lower().strip() not in ("operations", "ops"):
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
    if role in ("operations", "ops"):
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
            user = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
        except Exception:
            user = None
        if user:
            role = str(user.get("role") or "").lower().strip()
            return "operations" if role == "ops" else role
    role = str(payload.get("role") or "").lower().strip()
    return "operations" if role == "ops" else role
