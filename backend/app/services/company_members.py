"""Resolve people who belong to the current company.

With MULTI_COMPANY_ENABLED off this is a thin pass-through to db.users.find.
With the flag on, users is a tenant collection keyed by home company_id, so
members granted into another company are loaded from company_memberships and
the global users collection, then overlayed with membership role/department/access.
"""
from __future__ import annotations

import inspect
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.config import settings
from app.database import get_database

MEMBERSHIP_OVERLAY_KEYS = (
    "role",
    "department",
    "departments",
    "primary_department",
    "access",
    "content_stages",
    "needs_setup",
    "membership_id",
    "crm_enabled",
    "crm_paused",
)

ROLES_WITHOUT_DEPARTMENT = frozenset({"admin", "operations", "hr", "client", "ops"})


def _multi_company() -> bool:
    return bool(getattr(settings, "MULTI_COMPANY_ENABLED", False))


def _match_clause(doc: Dict[str, Any], key: str, spec: Any) -> bool:
    if key == "_id":
        value = doc.get("_id")
        if value is None:
            value = doc.get("id")
        else:
            value = str(value) if not isinstance(spec, dict) else value
    else:
        value = doc.get(key)

    if isinstance(spec, dict):
        if "$in" in spec:
            hay = list(spec["$in"])
            return value in hay or (value is not None and str(value) in {str(x) for x in hay})
        if "$nin" in spec:
            hay = list(spec["$nin"])
            return value not in hay and str(value) not in {str(x) for x in hay}
        if "$ne" in spec:
            return value != spec["$ne"] and str(value) != str(spec["$ne"])
        if "$exists" in spec:
            exists = key in doc and doc.get(key) is not None
            return exists if spec["$exists"] else not exists
        if "$regex" in spec:
            flags = re.IGNORECASE if "i" in str(spec.get("$options") or "") else 0
            return bool(re.search(str(spec["$regex"]), str(value or ""), flags))
        return False
    return value == spec or (spec is not None and str(value) == str(spec))


def matches_filter(doc: Dict[str, Any], filt: Optional[Dict[str, Any]]) -> bool:
    """Small matcher for equality, $in, $nin, $ne, $regex, $or, $and."""
    if not filt:
        return True
    if "$and" in filt:
        rest = {k: v for k, v in filt.items() if k != "$and"}
        return all(matches_filter(doc, part) for part in filt["$and"]) and matches_filter(doc, rest)
    if "$or" in filt:
        rest = {k: v for k, v in filt.items() if k != "$or"}
        return any(matches_filter(doc, part) for part in filt["$or"]) and matches_filter(doc, rest)
    for key, spec in filt.items():
        if key.startswith("$"):
            continue
        if not _match_clause(doc, key, spec):
            return False
    return True


def _apply_projection(doc: Dict[str, Any], projection: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = dict(doc)
    out.pop("hashed_password", None)
    if not projection:
        return out
    include = {k for k, v in projection.items() if v}
    exclude = {k for k, v in projection.items() if not v}
    if include:
        keep = set(include)
        if "_id" not in projection or projection.get("_id"):
            keep.add("_id")
        out = {k: out[k] for k in keep if k in out}
        if projection.get("_id") == 0:
            out.pop("_id", None)
        out.pop("hashed_password", None)
        return out
    for k in exclude:
        out.pop(k, None)
    return out


def _sort_docs(docs: List[Dict[str, Any]], sort: Optional[Sequence[Any]]) -> List[Dict[str, Any]]:
    if not sort:
        return docs
    if isinstance(sort, tuple) and len(sort) == 2 and isinstance(sort[0], str):
        pairs: List[Tuple[str, int]] = [(sort[0], int(sort[1]))]
    else:
        pairs = [(str(k), int(d)) for k, d in sort]  # type: ignore[misc]

    def key_fn(doc: Dict[str, Any]) -> tuple:
        parts = []
        for field, direction in pairs:
            val = doc.get(field)
            if val is None:
                val = ""
            parts.append(val)
        return tuple(parts)

    reverse = pairs[0][1] < 0
    return sorted(docs, key=key_fn, reverse=reverse)


def _overlay_membership(user: Dict[str, Any], membership: Dict[str, Any], company_id: str) -> Dict[str, Any]:
    merged = dict(user)
    merged.pop("hashed_password", None)
    merged["role"] = membership.get("role", "team_member")
    merged["department"] = membership.get("department")
    merged["departments"] = membership.get("departments") or []
    merged["primary_department"] = membership.get("primary_department")
    merged["access"] = membership.get("access") or {}
    merged["content_stages"] = membership.get("content_stages") or []
    merged["needs_setup"] = bool(membership.get("needs_setup", False))
    merged["membership_id"] = membership.get("id")
    merged["company_id"] = company_id
    merged["is_active"] = membership.get("status") == "active" and user.get("is_active") is not False
    if "crm_enabled" in membership:
        merged["crm_enabled"] = membership.get("crm_enabled")
    if "crm_paused" in membership:
        merged["crm_paused"] = membership.get("crm_paused")
    return merged


def membership_setup_is_complete(membership: Dict[str, Any]) -> bool:
    role = str(membership.get("role") or "").strip().lower()
    if not role:
        return False
    if role in ROLES_WITHOUT_DEPARTMENT:
        return True
    depts = membership.get("departments") or []
    return bool(
        membership.get("primary_department")
        or membership.get("department")
        or (isinstance(depts, list) and any(str(d).strip() for d in depts))
    )


async def _flags_off_find(db, query, projection, sort, limit) -> list[dict]:
    find = getattr(db.users, "find", None)
    cursor = None
    if callable(find):
        cursor = find(query, projection) if projection is not None else find(query)
        if sort and cursor is not None and hasattr(cursor, "sort"):
            if isinstance(sort, tuple) and len(sort) == 2 and isinstance(sort[0], str):
                cursor = cursor.sort(sort[0], sort[1])
            else:
                cursor = cursor.sort(list(sort))
        to_list = getattr(cursor, "to_list", None)
        if callable(to_list):
            result = to_list(limit)
            docs = await result if inspect.isawaitable(result) else result
            if isinstance(docs, list):
                for doc in docs:
                    if isinstance(doc, dict):
                        doc.pop("hashed_password", None)
                return docs
    find_one = getattr(db.users, "find_one", None)
    if callable(find_one):
        result = find_one(query, projection) if projection is not None else find_one(query)
        doc = await result if inspect.isawaitable(result) else result
        if doc:
            if isinstance(doc, dict):
                doc.pop("hashed_password", None)
            return [doc]
    return []


def access_is_blank(access: Any) -> bool:
    if not access or not isinstance(access, dict):
        return True
    return not any(bool(v) for v in access.values())


async def company_member_users(
    filter: dict | None = None,
    *,
    db=None,
    include_inactive: bool = False,
    projection: Optional[Dict[str, Any]] = None,
    include_needs_setup: bool = False,
    sort: Optional[Sequence[Any]] = None,
    limit: int = 4000,
) -> list[dict]:
    """List people in the current company, overlaying membership fields when multi-company is on."""
    if db is None:
        db = get_database()
    query = filter or {}

    if not _multi_company():
        if db is None:
            return []
        return await _flags_off_find(db, query, projection, sort, limit)

    from app.core.tenant import get_global_db, get_tenant_context

    ctx = get_tenant_context()
    raw_cid = ctx.company_id if ctx else getattr(db, "company_id", None)
    cid = raw_cid if isinstance(raw_cid, str) and raw_cid else None
    gdb = get_global_db()
    if not cid or gdb is None:
        if db is None:
            return []
        return await _flags_off_find(db, query, projection, sort, limit)

    mem_query: Dict[str, Any] = {"company_id": cid}
    if include_inactive:
        mem_query["status"] = {"$in": ["active", "inactive"]}
    else:
        mem_query["status"] = "active"
    mems = await gdb.company_memberships.find(mem_query).to_list(limit)
    if not mems:
        return []
    uids = [m.get("user_id") for m in mems if m.get("user_id")]
    users = await gdb.users.find(
        {
            "$or": [{"id": {"$in": uids}}, {"_id": {"$in": uids}}],
            "is_active": {"$ne": False},
        },
        {"hashed_password": 0},
    ).to_list(limit)
    user_by_id = {str(u.get("id") or u.get("_id")): u for u in users}

    results: List[Dict[str, Any]] = []
    for m in mems:
        u = user_by_id.get(str(m.get("user_id") or ""))
        if not u:
            continue
        merged = _overlay_membership(u, m, cid)
        if not include_needs_setup and merged.get("needs_setup"):
            continue
        if not matches_filter(merged, query):
            continue
        results.append(_apply_projection(merged, projection))
    return _sort_docs(results, sort)[:limit]


async def company_member_user(user_id: Any, db=None) -> dict | None:
    """Load one current-company member by id. Includes needs_setup members."""
    if not user_id:
        return None
    uid = str(user_id)
    if db is None:
        db = get_database()
    if not _multi_company():
        if db is None:
            return None
        doc = await db.users.find_one({"id": uid}, {"hashed_password": 0})
        if not doc:
            doc = await db.users.find_one({"$or": [{"id": uid}, {"_id": uid}]}, {"hashed_password": 0})
        if doc:
            doc.pop("hashed_password", None)
        return doc

    from app.core.tenant import get_global_db, get_tenant_context

    ctx = get_tenant_context()
    cid = ctx.company_id if ctx else getattr(db, "company_id", None)
    gdb = get_global_db()
    if not cid or gdb is None:
        if db is None:
            return None
        doc = await db.users.find_one({"$or": [{"id": uid}, {"_id": uid}]}, {"hashed_password": 0})
        if doc:
            doc.pop("hashed_password", None)
        return doc

    mem = await gdb.company_memberships.find_one({"company_id": cid, "user_id": uid})
    if not mem:
        mem = await gdb.company_memberships.find_one({"company_id": cid, "user_id": user_id})
    if not mem:
        return None
    user = await gdb.users.find_one({"$or": [{"id": uid}, {"_id": uid}]}, {"hashed_password": 0})
    if not user or user.get("is_active") is False:
        return None
    return _overlay_membership(user, mem, cid)


async def company_member_map(ids: Sequence[Any], **kwargs: Any) -> Dict[str, Dict[str, Any]]:
    cleaned = [str(i) for i in ids if i]
    if not cleaned:
        return {}
    users = await company_member_users({"id": {"$in": cleaned}}, include_needs_setup=True, **kwargs)
    return {str(u.get("id")): u for u in users if u.get("id")}
