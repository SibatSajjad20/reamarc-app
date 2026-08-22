"""
When a directory member is deleted, wipe every record keyed to them.
Also removes leftover rows whose user no longer exists (failed / old deletes).
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Set

logger = logging.getLogger(__name__)

RELATED_COLLECTIONS = (
    "attendance_records",
    "leave_requests",
    "leave_balances",
    "user_shift_assignments",
    "daily_log_day_scores",
    "notifications",
)


def _id_set(user_doc: dict, fallback_id: str) -> List[str]:
    ids: Set[str] = set()
    for raw in (
        fallback_id,
        user_doc.get("id"),
        str(user_doc.get("_id") or ""),
    ):
        if raw:
            ids.add(str(raw).strip())
    return [i for i in ids if i]


def _name_set(user_doc: dict) -> List[str]:
    names: Set[str] = set()
    for raw in (user_doc.get("full_name"), user_doc.get("name")):
        if raw and str(raw).strip():
            names.add(str(raw).strip())
    return list(names)


def _log_match_filter(ids: List[str], names: List[str]) -> Dict[str, Any]:
    clauses: List[Dict[str, Any]] = []
    if ids:
        clauses.append({"user_id": {"$in": ids}})
    # Name match is only for legacy rows that have no user_id. Never delete
    # another live employee's logs just because they share a display name.
    if names:
        name_match = [
            {"resource_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
            for name in names
        ]
        clauses.append({
            "$and": [
                {"$or": [{"user_id": {"$exists": False}}, {"user_id": None}, {"user_id": ""}]},
                {"$or": name_match} if len(name_match) > 1 else name_match[0],
            ]
        })
    if not clauses:
        return {"user_id": {"$in": ids or ["__none__"]}}
    return {"$or": clauses} if len(clauses) > 1 else clauses[0]


async def purge_user_related_records(db, user_doc: dict, user_id: str) -> Dict[str, int]:
    """Delete attendance, leave, daily logs, and related docs for one member."""
    ids = _id_set(user_doc, user_id)
    names = _name_set(user_doc)
    email = str(user_doc.get("email") or "").strip().lower()
    counts: Dict[str, int] = {}

    log_filter = _log_match_filter(ids, names)
    result = await db.daily_log_entries.delete_many(log_filter)
    counts["daily_log_entries"] = int(result.deleted_count)

    id_filter = {"user_id": {"$in": ids}} if ids else {"user_id": user_id}
    for coll in RELATED_COLLECTIONS:
        try:
            result = await db[coll].delete_many(id_filter)
            counts[coll] = int(result.deleted_count)
        except Exception as exc:
            logger.warning("Could not purge %s for user %s: %s", coll, user_id, exc)
            counts[coll] = 0

    if email:
        try:
            result = await db.password_resets.delete_many({"email": email})
            counts["password_resets"] = int(result.deleted_count)
        except Exception:
            counts["password_resets"] = 0

    logger.info("Purged member %s related records: %s", user_id, counts)
    return counts


async def _live_user_index(db) -> tuple[Set[str], Set[str]]:
    users = await db.users.find({}, {"_id": 1, "id": 1, "full_name": 1, "name": 1}).to_list(4000)
    live_ids: Set[str] = set()
    live_names: Set[str] = set()
    for user in users:
        if user.get("id"):
            live_ids.add(str(user["id"]).strip())
        if user.get("_id") is not None:
            live_ids.add(str(user["_id"]).strip())
        for raw in (user.get("full_name"), user.get("name")):
            if raw and str(raw).strip():
                live_names.add(str(raw).strip().lower())
    return live_ids, live_names


async def purge_orphaned_member_records(db) -> Dict[str, int]:
    """Remove attendance/logs/leave rows whose owner is no longer in the directory."""
    live_ids, live_names = await _live_user_index(db)
    if not live_ids:
        return {}

    live_id_list = list(live_ids)
    orphan_user_filter = {
        "$and": [
            {"user_id": {"$exists": True}},
            {"user_id": {"$nin": live_id_list + [None, ""]}},
        ]
    }
    counts: Dict[str, int] = {}

    result = await db.daily_log_entries.delete_many(orphan_user_filter)
    counts["daily_log_entries"] = int(result.deleted_count)

    nameless = await db.daily_log_entries.distinct(
        "resource_name",
        {"$or": [{"user_id": {"$exists": False}}, {"user_id": None}, {"user_id": ""}]},
    )
    orphan_names = [
        n for n in nameless
        if n and str(n).strip() and str(n).strip().lower() not in live_names
    ]
    if orphan_names:
        result = await db.daily_log_entries.delete_many(
            {
                "resource_name": {"$in": orphan_names},
                "$or": [{"user_id": {"$exists": False}}, {"user_id": None}, {"user_id": ""}],
            }
        )
        counts["daily_log_entries"] += int(result.deleted_count)

    for coll in RELATED_COLLECTIONS:
        try:
            result = await db[coll].delete_many(orphan_user_filter)
            counts[coll] = int(result.deleted_count)
        except Exception as exc:
            logger.warning("Could not purge orphaned %s: %s", coll, exc)
            counts[coll] = 0

    if any(counts.values()):
        logger.info("Purged orphaned member records: %s", counts)
    return counts
