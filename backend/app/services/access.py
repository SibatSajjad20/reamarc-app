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

    primary = str(user.get("primary_department") or "").strip()
    if primary:
        result.append(primary)
        seen.add(primary.lower())

    depts = user.get("departments")
    if isinstance(depts, list):
        for item in depts:
            clean = str(item or "").strip()
            if clean and clean.lower() not in seen:
                seen.add(clean.lower())
                result.append(clean)

    dept_str = user.get("department")
    if isinstance(dept_str, str) and dept_str.strip():
        tokens = re.split(r"[,;/&]|\band\b", dept_str, flags=re.IGNORECASE)
        for tok in tokens:
            clean = tok.strip()
            if clean and clean.lower() not in seen:
                seen.add(clean.lower())
                result.append(clean)

    return result


def get_user_primary_department(user: Optional[Dict[str, Any]]) -> str:
    """Return the user's primary department (empty string for operations)."""
    if not user:
        return ""
    role = normalize_role(user.get("role"))
    if role == "operations":
        return ""
    primary = str(user.get("primary_department") or "").strip()
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
    if not user:
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

    # Compatibility keys for existing callers: active_clients and exceptions
    if role == "admin":
        levels["active_clients"] = "manage"
        levels["exceptions"] = "all"
    elif role == "operations":
        levels["active_clients"] = "manage" if modules["sales"] else "none"
        levels["exceptions"] = "all" if (modules["attendance"] or modules["daily_log"]) else "none"
    elif role == "hr":
        levels["active_clients"] = "none"
        levels["exceptions"] = "all" if modules["daily_log"] else "none"
    elif role == "team_lead":
        levels["active_clients"] = "view" if modules["sales"] else "none"
        levels["exceptions"] = "department" if modules["daily_log"] else "none"
    elif role == "team_member":
        levels["active_clients"] = "view" if modules["sales"] else "none"
        levels["exceptions"] = "none"
    else:
        levels["active_clients"] = "none"
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
            stored_stages = user.get("content_stages") or (user.get("access") or {}).get("content_stages") or []
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
    base_filter = tracked_user_filter(module)
    if extra_filter:
        query = {"$and": [base_filter, extra_filter]}
    else:
        query = base_filter

    cursor = db.users.find(query)
    docs = await cursor.to_list(length=None)
    return [u for u in docs if is_tracked(u, module)]
