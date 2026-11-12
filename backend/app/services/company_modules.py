"""Per-company module allow-list.

No row in ``company_modules`` means every module is enabled (today's behaviour).
The ``companies`` collection is never written from this module.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, FrozenSet, Iterable, List, Optional, Tuple, Union

logger = logging.getLogger("app.company_modules")

COMPANY_MODULE_KEYS: Tuple[str, ...] = (
    "dashboard",
    "sales",
    "active_clients",
    "content_calendar",
    "website",
    "ads",
    "attendance",
    "daily_log",
    "finance",
    "tasks",
)

COMPANY_MODULE_KEY_SET = frozenset(COMPANY_MODULE_KEYS)

# Jobs that iterate companies without a module= argument, with the reason they stay ungated.
UNGATED_JOBS: Dict[str, str] = {
    "backend/app/services/crm_sla_scheduler.py": "CRM SLA tick — sales stays on for restricted companies; CRM schedulers stay ungated.",
    "backend/app/services/crm_lead_processor.py": "CRM inbound event queue — sales module.",
    "backend/app/services/crm_ingest.py": "Meta lead ads poll — sales module.",
    "backend/app/services/crm_meeting_reminder_scheduler.py": "CRM meeting reminders — sales module.",
    "backend/app/main.py": "Startup user/department/access migrations plus a content_calendar guard around backfill_share_tokens.",
}

CACHE_TTL_SECONDS = 60.0
_CACHE: Dict[str, Tuple[float, Optional[FrozenSet[str]]]] = {}

PathRequirement = Optional[Union[str, Tuple[str, ...]]]

_LEAD_CONVERT_RE = re.compile(
    r"^/crm/leads/[^/]+/(register-client|convert-to-workspace)$"
)
_ADMIN_REMIND_RE = re.compile(r"^/admin/(members|users)/[^/]+/remind$")
_USERS_ME_RE = re.compile(r"^/users/me(?:/|$)")

_CORE_PREFIXES = (
    "/auth",
    "/web-push",
    "/access",
    "/drive",
    "/owner",
    "/public",
    "/company/branding",
)

_CORE_NOTIFICATION_KINDS = frozenset({
    "custom",
    "test",
    "admin_alert",
})

_ATTENDANCE_KIND_PREFIXES = (
    "attendance",
    "leave_",
    "punch",
    "late_checkin",
    "pre_shift",
    "checkout",
    "missed_",
    "employee_late",
    "shift_change",
)

_DAILY_LOG_KIND_PREFIXES = (
    "daily_log",
    "log_",
    "admin_reminder",
)


def module_enabled(company_modules: Optional[Iterable[str]], key: str) -> bool:
    if company_modules is None:
        return True
    return key in company_modules


def serialize_enabled_modules(company_modules: Optional[Iterable[str]]) -> Optional[List[str]]:
    if company_modules is None:
        return None
    return sorted(company_modules)


def _parse_row(doc: Optional[Dict[str, Any]], company_id: Optional[str] = None) -> Optional[FrozenSet[str]]:
    if not doc:
        return None
    keys = doc.get("enabled_modules")
    if not isinstance(keys, list) or not keys:
        logger.warning(
            "company_modules row for %s has empty or missing enabled_modules; treating as all-enabled",
            company_id or doc.get("company_id") or doc.get("_id"),
        )
        return None
    known = frozenset(str(k) for k in keys if str(k) in COMPANY_MODULE_KEY_SET)
    if not known:
        logger.warning(
            "company_modules row for %s has only unknown keys %s; treating as all-enabled",
            company_id or doc.get("company_id") or doc.get("_id"),
            keys,
        )
        return None
    return known


def invalidate_company_modules(company_id: Optional[str] = None) -> None:
    if company_id is None:
        _CACHE.clear()
        return
    _CACHE.pop(str(company_id), None)


async def get_company_modules(company_id: Optional[str]) -> Optional[FrozenSet[str]]:
    if not company_id:
        return None
    cid = str(company_id)
    now = time.monotonic()
    cached = _CACHE.get(cid)
    if cached and (now - cached[0] < CACHE_TTL_SECONDS):
        return cached[1]

    from app.core.tenant import get_global_db

    gdb = get_global_db()
    doc = None
    if gdb is not None:
        doc = await gdb.company_modules.find_one({"$or": [{"_id": cid}, {"company_id": cid}]})
    parsed = _parse_row(doc, cid)
    _CACHE[cid] = (now, parsed)
    return parsed


async def load_all_company_modules() -> Dict[str, Optional[FrozenSet[str]]]:
    """One find({}) for job runs. Missing companies are omitted (treated as all-enabled)."""
    from app.core.tenant import get_global_db

    gdb = get_global_db()
    out: Dict[str, Optional[FrozenSet[str]]] = {}
    if gdb is None:
        return out
    cursor = gdb.company_modules.find({})
    async for doc in cursor:
        cid = str(doc.get("company_id") or doc.get("_id") or "")
        if not cid:
            continue
        parsed = _parse_row(doc, cid)
        out[cid] = parsed
        _CACHE[cid] = (time.monotonic(), parsed)
    return out


def company_key_for_perm_module(module: str) -> Optional[str]:
    if module == "exceptions":
        return "daily_log"
    if module in COMPANY_MODULE_KEY_SET:
        return module
    return None


def modules_from_user(user: Optional[Dict[str, Any]]) -> Optional[FrozenSet[str]]:
    if not user:
        return None
    raw = user.get("company_modules")
    if raw is None:
        return None
    if isinstance(raw, (set, frozenset)):
        return frozenset(raw) if raw else None
    if isinstance(raw, list):
        known = frozenset(str(k) for k in raw if str(k) in COMPANY_MODULE_KEY_SET)
        return known if known else None
    return None


def _strip_api_prefix(path: str) -> str:
    p = (path or "").split("?", 1)[0]
    if p.startswith("/api/v1"):
        p = p[len("/api/v1"):]
    if not p.startswith("/"):
        p = "/" + p
    if len(p) > 1:
        p = p.rstrip("/")
    return p


def module_for_path(method: str, path: str) -> PathRequirement:
    """Map an HTTP request to the company-module key(s) that must be enabled.

    Returns:
      None — core, never gated
      str — that module must be on
      ("all", ...) — every listed module must be on
      ("any", ...) — at least one listed module must be on
    """
    m = (method or "GET").upper()
    p = _strip_api_prefix(path)

    if p == "/" or p == "":
        return None
    if any(p == prefix or p.startswith(prefix + "/") for prefix in _CORE_PREFIXES):
        return None
    if p.startswith("/company/branding"):
        return None
    if _USERS_ME_RE.match(p):
        return None

    if p.startswith("/mobile"):
        if p in ("/mobile/register-device", "/mobile/device", "/mobile/push-test") or p.startswith(
            "/mobile/notifications"
        ):
            return None
        if (
            p.startswith("/mobile/devices")
            or p == "/mobile/broadcast"
            or p == "/mobile/admin-overview"
        ):
            return "attendance"
        return None

    if _LEAD_CONVERT_RE.match(p):
        return ("all", "sales", "active_clients")

    if m == "POST" and p == "/daily-log/upload":
        return ("any", "sales", "active_clients")

    if p.startswith("/crm"):
        return "sales"

    if p == "/workspaces" and m == "GET":
        return ("any", "active_clients", "content_calendar", "website", "ads")
    if p.startswith("/workspaces"):
        return "active_clients"

    if p.startswith("/admin/workspaces"):
        return "active_clients"
    if p.startswith("/admin/ad-accounts"):
        return "ads"
    if p == "/admin/remind-log" or p == "/admin/members/activity" or _ADMIN_REMIND_RE.match(p):
        return "daily_log"
    if p.startswith("/admin/members") or p.startswith("/admin/users"):
        return None

    if p.startswith("/dashboard"):
        return "dashboard"
    if p.startswith("/content-calendar"):
        return "content_calendar"
    if p.startswith("/website-projects"):
        return "website"
    if p.startswith("/marketing"):
        return "ads"
    if (
        p.startswith("/attendance")
        or p.startswith("/leaves")
        or p.startswith("/shifts")
        or p.startswith("/company-calendar")
    ):
        return "attendance"
    if p.startswith("/daily-log") or p.startswith("/log-exceptions") or p.startswith("/log-variance"):
        return "daily_log"
    if p.startswith("/finance"):
        return "finance"
    if p.startswith("/tasks"):
        return "tasks"

    return None


def path_modules_allowed(company_modules: Optional[Iterable[str]], requirement: PathRequirement) -> bool:
    if requirement is None:
        return True
    if isinstance(requirement, str):
        if not module_enabled(company_modules, requirement):
            return False
        return True
    if not requirement:
        return True
    mode = requirement[0]
    keys = requirement[1:]
    if mode == "all":
        return all(module_enabled(company_modules, k) for k in keys)
    if mode == "any":
        return any(module_enabled(company_modules, k) for k in keys)
    return all(module_enabled(company_modules, k) for k in requirement)


def first_disabled_path_module(
    company_modules: Optional[Iterable[str]], requirement: PathRequirement
) -> Optional[str]:
    if requirement is None:
        return None
    if isinstance(requirement, str):
        return None if module_enabled(company_modules, requirement) else requirement
    if not requirement:
        return None
    mode = requirement[0]
    keys = requirement[1:] if mode in ("all", "any") else requirement
    if mode == "any":
        if any(module_enabled(company_modules, k) for k in keys):
            return None
        return keys[0] if keys else None
    for k in keys:
        if not module_enabled(company_modules, k):
            return k
    return None


def module_for_notification_kind(kind: str) -> Optional[str]:
    k = (kind or "").strip().lower()
    if not k:
        raise ValueError("notification kind is required")
    if k in _CORE_NOTIFICATION_KINDS:
        return None
    if k.startswith("crm"):
        return "sales"
    if k.startswith("task_"):
        return "tasks"
    if k.startswith("content_calendar") or k.startswith("campaign_"):
        return "content_calendar"
    if k.startswith("website_") or k == "revision":
        return "website"
    if k in ("marketing", "ads") or k.startswith("marketing") or k.startswith("ads_"):
        return "ads"
    if k.startswith("invoice") or k.startswith("finance"):
        return "finance"
    if k.startswith(_DAILY_LOG_KIND_PREFIXES):
        return "daily_log"
    if k.startswith(_ATTENDANCE_KIND_PREFIXES):
        return "attendance"
    raise ValueError(f"unclassified notification kind: {kind!r}")


async def apply_to_auth_payload(user_doc: Dict[str, Any], company_id: Optional[str], company_payload: Optional[Dict[str, Any]] = None) -> Optional[List[str]]:
    mods = await get_company_modules(company_id)
    serialized = serialize_enabled_modules(mods)
    user_doc["company_modules"] = serialized
    payload = company_payload if company_payload is not None else user_doc.get("company")
    if isinstance(payload, dict):
        payload["enabled_modules"] = serialized
    return serialized


def module_disabled_http_detail(module_key: str) -> Dict[str, str]:
    return {
        "code": "module_disabled",
        "module": module_key,
        "message": "This module isn't enabled for your company.",
    }
