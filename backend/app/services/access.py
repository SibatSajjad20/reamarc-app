"""Reamarc Access Service.

Implements simplified admin-only Access settings:
- Fixed defaults per role and primary department.
- Per-user switch overrides stored on user.access = {module: true | false | null}.
- Extra content stages stored on user.content_stages = ["content" | "creative" | "social_media"].
- Universal helper functions for effective access, tracking, and Mongo query filters.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Set, Union

logger = logging.getLogger(__name__)

MODULES = ("attendance", "daily_log", "sales", "content_calendar", "website", "ads")

VALID_CONTENT_STAGES = ("content", "creative", "social_media")

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

COMPANY_WIDE_ROLES: Set[str] = {"admin", "operations", "hr"}

OPERATIONS_ROLE_ALIASES: Set[str] = {
    "ops",
    "operation",
    "operations_lead",
    "operations_member",
    "ops_lead",
    "ops_member",
    "operationslead",
}


def normalize_role(role: Optional[str]) -> str:
    """Standardize role string to canonical enum value."""
    if not role:
        return "team_member"
    raw = str(role).strip().lower().replace("-", "_").replace(" ", "_")
    if raw in OPERATIONS_ROLE_ALIASES or raw == "operations":
        return "operations"
    if raw in ("admin", "super_admin"):
        return "admin"
    if raw == "hr":
        return "hr"
    if raw in ("lead", "team_lead"):
        return "team_lead"
    if raw in ("member", "team_member"):
        return "team_member"
    if raw == "client":
        return "client"
    return raw


CANONICAL_DEPARTMENTS: List[str] = [
    "Website",
    "Creative",
    "Content",
    "SEO",
    "Performance marketing",
    "Social media",
    "Sales",
    "AI",
    "Software development",
    "HR",
]

_CANONICAL_DEPT_BY_KEY = {d.lower(): d for d in CANONICAL_DEPARTMENTS}
_DEPT_ALIAS_TO_CANONICAL = {
    "social": "Social media",
    "social_media": "Social media",
    "socialmedia": "Social media",
    "performance": "Performance marketing",
    "performance_marketing": "Performance marketing",
    "performancemarketing": "Performance marketing",
    "web development": "Website",
    "webdevelopment": "Website",
    "software": "Website",
    "dev": "Website",
}


def _dept_lookup_key(value: str) -> str:
    return " ".join(str(value).replace("_", " ").replace("-", " ").split()).strip().lower()


def normalize_dept(dept: Optional[str]) -> str:
    """Standardize department strings for uniform matching."""
    if not dept:
        return ""
    d = str(dept).strip().lower()
    if d in ("social", "social_media"):
        return "social media"
    if d in ("performance", "performance_marketing"):
        return "performance marketing"
    if d in ("web development", "software development", "software", "dev"):
        return "website"
    return d


def canonical_department(value: Optional[str]) -> str:
    """Return a canonical department label. Unknown values are kept trimmed, never dropped."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    key = _dept_lookup_key(raw)
    if not key:
        return ""
    if key in _CANONICAL_DEPT_BY_KEY:
        return _CANONICAL_DEPT_BY_KEY[key]
    collapsed = key.replace(" ", "")
    for canon in CANONICAL_DEPARTMENTS:
        if canon.lower().replace(" ", "") == collapsed:
            return canon
    if key in _DEPT_ALIAS_TO_CANONICAL:
        return _DEPT_ALIAS_TO_CANONICAL[key]
    for alias, canon in _DEPT_ALIAS_TO_CANONICAL.items():
        if alias.replace(" ", "").replace("_", "") == collapsed:
            return canon
    return raw


def canonicalize_departments(
    departments: Optional[List[Any]] = None,
    primary: Optional[str] = None,
    department: Optional[str] = None,
) -> Dict[str, Any]:
    """Canonicalise departments: primary first, case-insensitive de-dupe, joined department string."""
    tokens: List[str] = []
    if primary and str(primary).strip():
        tokens.append(str(primary).strip())
    if isinstance(departments, list):
        for item in departments:
            clean = str(item or "").strip()
            if clean:
                tokens.append(clean)
    if isinstance(department, str) and department.strip() and department.strip() not in ("All", "Unassigned"):
        for part in re.split(r"[,;/]|\band\b|&", department, flags=re.IGNORECASE):
            clean = part.strip()
            if clean:
                tokens.append(clean)

    seen: Set[str] = set()
    ordered: List[str] = []
    for token in tokens:
        canon = canonical_department(token)
        if not canon:
            continue
        marker = canon.lower()
        if marker in seen:
            continue
        seen.add(marker)
        ordered.append(canon)

    primary_canon = canonical_department(primary) if primary and str(primary).strip() else (ordered[0] if ordered else "")
    if primary_canon:
        rest = [d for d in ordered if d.lower() != primary_canon.lower()]
        ordered = [primary_canon] + rest
    return {
        "primary_department": primary_canon or None,
        "departments": ordered,
        "department": ", ".join(ordered) if ordered else None,
    }


def normalize_stage(stage: Optional[str]) -> Optional[str]:
    """Normalize a content stage name to one of VALID_CONTENT_STAGES or None."""
    if not stage:
        return None
    s = str(stage).strip().lower().replace("-", "_").replace(" ", "_")
    if s in ("content", "creative"):
        return s
    if s in ("social", "social_media", "socialmedia"):
        return "social_media"
    return None


def get_primary_stage(department: Optional[str]) -> Optional[str]:
    """Return implicit primary stage if department maps to one; else None."""
    norm = normalize_dept(department)
    if norm == "content":
        return "content"
    if norm == "creative":
        return "creative"
    if norm == "social media":
        return "social_media"
    return None


def parse_user_departments(user: Optional[Dict[str, Any]]) -> List[str]:
    """Parse distinct ordered list of departments from a user dict."""
    if not user:
        return []
    result: List[str] = []
    seen: Set[str] = set()

    packed = canonicalize_departments(
        departments=user.get("departments") if isinstance(user.get("departments"), list) else None,
        primary=str(user.get("primary_department") or "").strip() or None,
        department=user.get("department") if isinstance(user.get("department"), str) else None,
    )
    for name in packed["departments"]:
        marker = name.lower()
        if marker not in seen:
            seen.add(marker)
            result.append(name)
    return result


def get_user_primary_department(user: Optional[Dict[str, Any]]) -> str:
    """Return the user's primary department (empty string for operations)."""
    if not user:
        return ""
    role = normalize_role(user.get("role"))
    if role == "operations":
        return ""
    primary = canonical_department(str(user.get("primary_department") or "").strip())
    if primary:
        return primary
    depts = parse_user_departments(user)
    return depts[0] if depts else ""


def default_access(user: Optional[Dict[str, Any]]) -> Dict[str, bool]:
    """Return the fixed default module switches for a user based on role and primary department.

    Defaults table:
    - Admin: attendance off, daily_log off, sales on, content_calendar on, website on, ads on
    - Operations: attendance on, daily_log off, sales on, content_calendar on, website on, ads on
    - HR: attendance on, daily_log on, all others off
    - Sales lead/member: attendance off, daily_log off, sales on, all others off
    - Content/Creative/Social lead/member: attendance on, daily_log on, content_calendar on, others off
    - Website lead/member: attendance on, daily_log on, website on, others off
    - SEO/Perf marketing lead/member: attendance on, daily_log on, ads on, others off
    - Client: all off
    """
    if not user:
        return {m: False for m in MODULES}

    role = normalize_role(user.get("role"))

    if role == "admin":
        return {
            "attendance": False,
            "daily_log": False,
            "sales": True,
            "content_calendar": True,
            "website": True,
            "ads": True,
        }
    if role == "operations":
        return {
            "attendance": True,
            "daily_log": False,
            "sales": True,
            "content_calendar": True,
            "website": True,
            "ads": True,
        }
    if role == "hr":
        return {
            "attendance": True,
            "daily_log": True,
            "sales": False,
            "content_calendar": False,
            "website": False,
            "ads": False,
        }
    if role == "client":
        return {m: False for m in MODULES}

    # Leads and members follow primary department
    primary = get_user_primary_department(user)
    norm = normalize_dept(primary)

    if norm in SALES_DEPTS:
        return {
            "attendance": False,
            "daily_log": False,
            "sales": True,
            "content_calendar": False,
            "website": False,
            "ads": False,
        }
    if norm in CONTENT_DEPTS:
        return {
            "attendance": True,
            "daily_log": True,
            "sales": False,
            "content_calendar": True,
            "website": False,
            "ads": False,
        }
    if norm in WEBSITE_DEPTS:
        return {
            "attendance": True,
            "daily_log": True,
            "sales": False,
            "content_calendar": False,
            "website": True,
            "ads": False,
        }
    if norm in ADS_DEPTS:
        return {
            "attendance": True,
            "daily_log": True,
            "sales": False,
            "content_calendar": False,
            "website": False,
            "ads": True,
        }

    # General / unmapped department default
    return {
        "attendance": True,
        "daily_log": True,
        "sales": False,
        "content_calendar": False,
        "website": False,
        "ads": False,
    }


def effective_access(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute effective access payload for a user.

    Returns:
    {
        "modules": {m: bool},
        "levels":  {m: "none|own|view|manage|all"},
        "content_stages": [...],
        "capabilities": {"approve_won_deal": bool, "approve_requests": bool},
        "tracked": {"attendance": bool, "daily_log": bool},
        "primary_department": str,
        "access_version": int,
    }
    """
    if not user or user.get("needs_setup"):
        return {
            "modules": {m: False for m in MODULES},
            "levels": {m: "none" for m in MODULES},
            "content_stages": [],
            "capabilities": {"approve_won_deal": False, "approve_requests": False},
            "tracked": {"attendance": False, "daily_log": False},
            "primary_department": "",
            "access_version": 1,
        }

    role = normalize_role(user.get("role"))
    primary_dept = "" if role == "operations" else get_user_primary_department(user)
    is_active = user.get("is_active") is not False
    access_version = int(user.get("access_version") or 1)

    defaults = default_access(user)
    stored_access = user.get("access") or {}

    # Module switches: admin and client rows are read-only; others apply override ?? default
    modules: Dict[str, bool] = {}
    for m in MODULES:
        if role in ("admin", "client"):
            modules[m] = defaults[m]
        else:
            override = stored_access.get(m)
            if override is not None:
                modules[m] = bool(override)
            else:
                modules[m] = defaults.get(m, False)

    # Compute permission levels
    levels: Dict[str, str] = {}
    for m in MODULES:
        if role == "admin":
            levels[m] = "all" if m in ("attendance", "daily_log", "sales") else "manage"
        elif not modules[m]:
            levels[m] = "none"
        else:
            if role == "operations":
                if m == "attendance":
                    levels[m] = "all"
                elif m == "daily_log":
                    levels[m] = "all"
                else:
                    levels[m] = "view"
            elif role == "hr":
                if m in ("attendance", "daily_log"):
                    levels[m] = "all"
                else:
                    levels[m] = "view"
            elif role == "team_lead":
                if m in ("attendance", "daily_log"):
                    levels[m] = "department"
                elif m == "sales":
                    levels[m] = "all"
                else:
                    levels[m] = "manage"
            elif role == "team_member":
                if m in ("attendance", "daily_log"):
                    levels[m] = "own"
                elif m == "sales":
                    levels[m] = "own"
                elif m == "content_calendar":
                    levels[m] = "own_stages"
                elif m == "website":
                    levels[m] = "assigned"
                elif m == "ads":
                    levels[m] = "view"
                else:
                    levels[m] = "own"
            else:
                levels[m] = "none"

    # Active clients is a company-wide view-only directory for internal staff.
    # Manage stays with admin/operations (create/edit workspaces). Clients stay none.
    if role == "admin":
        levels["active_clients"] = "manage"
        levels["exceptions"] = "all"
    elif role == "operations":
        levels["active_clients"] = "manage"
        levels["exceptions"] = "all" if (modules["attendance"] or modules["daily_log"]) else "none"
    elif role == "hr":
        levels["active_clients"] = "view"
        levels["exceptions"] = "all" if modules["daily_log"] else "none"
    elif role == "team_lead":
        levels["active_clients"] = "view"
        levels["exceptions"] = "department" if modules["daily_log"] else "none"
    elif role == "team_member":
        levels["active_clients"] = "view"
        levels["exceptions"] = "none"
    elif role == "client":
        levels["active_clients"] = "none"
        levels["exceptions"] = "none"
    else:
        levels["active_clients"] = "view"
        levels["exceptions"] = "none"

    # Content stages: only when content_calendar is on
    content_stages: List[str] = []
    if modules["content_calendar"]:
        if role in ("admin", "operations"):
            content_stages = list(VALID_CONTENT_STAGES)
        else:
            primary_stage = get_primary_stage(primary_dept)
            if primary_stage:
                content_stages.append(primary_stage)
            stored_stages = user.get("content_stages")
            if stored_stages is None:
                stored_stages = (user.get("access") or {}).get("content_stages")
            if stored_stages is None:
                # Secondary departments never grant stages. Only primary + Access extras.
                stored_stages = []
            if isinstance(stored_stages, list):
                for st in stored_stages:
                    norm_st = normalize_stage(st)
                    if norm_st and norm_st in VALID_CONTENT_STAGES and norm_st not in content_stages:
                        content_stages.append(norm_st)

    # Capabilities
    approve_won_deal = is_active and role in ("admin", "operations")
    approve_requests = is_active and role in ("admin", "operations", "hr")
    capabilities = {
        "approve_won_deal": approve_won_deal,
        "approve_requests": approve_requests,
    }

    # Tracking: Admin is never tracked. Operations is tracked for attendance only (by default).
    # Deactivated users and clients are never tracked.
    tracked_attendance = False
    tracked_daily_log = False
    if is_active and role not in ("client", "admin"):
        tracked_attendance = bool(modules["attendance"])
        tracked_daily_log = bool(modules["daily_log"])

    tracked = {
        "attendance": tracked_attendance,
        "daily_log": tracked_daily_log,
    }

    return {
        "modules": modules,
        "levels": levels,
        "content_stages": content_stages,
        "capabilities": capabilities,
        "tracked": tracked,
        "primary_department": primary_dept,
        "access_version": access_version,
    }


def is_tracked(user: Optional[Dict[str, Any]], module: str) -> bool:
    """Return True if user is actively tracked for attendance or daily_log."""
    if not user or user.get("is_active") is False:
        return False
    eff = effective_access(user)
    return bool(eff["tracked"].get(module, False))


def tracked_user_filter(module: str) -> Dict[str, Any]:
    """MongoDB query filter fragment matching users tracked for attendance or daily_log."""
    if module == "attendance":
        return {
            "is_active": {"$ne": False},
            "role": {"$nin": ["admin", "super_admin", "client"]},
            "$or": [
                {"access.attendance": True},
                {
                    "$and": [
                        {"$or": [{"access.attendance": None}, {"access.attendance": {"$exists": False}}]},
                        {
                            "$or": [
                                {"role": {"$in": ["operations", "ops", "hr"]}},
                                {
                                    "role": {"$nin": ["operations", "ops", "hr"]},
                                    "primary_department": {"$nin": ["sales", "Sales", "SALES"]},
                                    "department": {"$nin": ["sales", "Sales", "SALES"]},
                                },
                            ]
                        },
                    ]
                },
            ],
        }
    elif module == "daily_log":
        return {
            "is_active": {"$ne": False},
            "role": {"$nin": ["admin", "super_admin", "operations", "ops", "client"]},
            "$or": [
                {"access.daily_log": True},
                {
                    "$and": [
                        {"$or": [{"access.daily_log": None}, {"access.daily_log": {"$exists": False}}]},
                        {
                            "$or": [
                                {"role": "hr"},
                                {
                                    "primary_department": {"$nin": ["sales", "Sales", "SALES"]},
                                    "department": {"$nin": ["sales", "Sales", "SALES"]},
                                },
                            ]
                        },
                    ]
                },
            ],
        }
    return {"_id": {"$exists": False}}


async def tracked_users(
    db,
    module: str,
    extra_filter: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Query MongoDB for users tracked for module, applying extra_filter and Python-side verification."""
    if db is None:
        return []

    from app.config import settings
    if getattr(settings, "MULTI_COMPANY_ENABLED", False):
        from app.core.tenant import get_tenant_context, get_global_db
        ctx = get_tenant_context()
        cid = ctx.company_id if ctx else getattr(db, "company_id", None)
        gdb = get_global_db()
        if cid and gdb is not None:
            mems = await gdb.company_memberships.find({"company_id": cid, "status": "active"}).to_list(1000)
            if not mems:
                return []
            uids = [m["user_id"] for m in mems]
            users = await gdb.users.find({
                "$or": [{"id": {"$in": uids}}, {"_id": {"$in": uids}}],
                "is_active": {"$ne": False},
            }).to_list(1000)
            user_by_id = {u.get("id") or str(u.get("_id")): u for u in users}

            results = []
            for m in mems:
                u = user_by_id.get(m["user_id"])
                if not u:
                    continue
                merged = dict(u)
                merged["role"] = m.get("role", "team_member")
                merged["department"] = m.get("department")
                merged["departments"] = m.get("departments") or []
                merged["primary_department"] = m.get("primary_department")
                merged["access"] = m.get("access") or {}
                merged["content_stages"] = m.get("content_stages") or []
                merged["company_id"] = cid
                merged["needs_setup"] = bool(m.get("needs_setup", False))
                merged["membership_id"] = m.get("id")

                if is_tracked(merged, module):
                    results.append(merged)
            return results

    base_filter = tracked_user_filter(module)
    if extra_filter:
        query = {"$and": [base_filter, extra_filter]}
    else:
        query = base_filter

    cursor = db.users.find(query)
    docs = await cursor.to_list(length=None)
    return [u for u in docs if is_tracked(u, module)]
