"""Primary-department backfill.

Role rules are fixed in code. This module does not seed or edit role_permissions.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.database import get_database
from app.services.permissions import parse_user_departments

OPERATIONS_ROLE_ALIASES = {
    "ops",
    "operation",
    "operations_lead",
    "operations_member",
    "ops_lead",
    "ops_member",
    "operationslead",
}


def operations_canonical_role(user: Dict[str, Any]) -> Optional[str]:
    """Return 'operations' when a stored role is an operations alias; else None."""
    raw = str(user.get("role") or "").strip()
    key = raw.lower().replace("-", "_").replace(" ", "_")
    if key in OPERATIONS_ROLE_ALIASES:
        return "operations"
    if key == "operations":
        return None
    return None

logger = logging.getLogger(__name__)


async def backfill_primary_departments(db=None) -> Dict[str, Any]:
    """Fill missing primary_department values. Does not read or write role rules."""
    if db is None:
        db = get_database()
    if db is None:
        raise RuntimeError("Database connection unavailable for migration.")

    now_iso = datetime.now(timezone.utc).isoformat()
    report: Dict[str, Any] = {
        "users_backfilled": 0,
        "multi_dept_audited": 0,
    }

    try:
        await db.users.create_index(
            [("primary_department", 1)],
            name="idx_users_primary_dept",
        )
    except Exception as e:
        logger.warning("Error creating primary_department index: %s", e)

    # Backfill users.primary_department
    cursor = db.users.find({})
    async for user in cursor:
        existing_primary = user.get("primary_department")
        depts = parse_user_departments(user)
        user_id = str(user.get("id") or user.get("_id"))
        user_name = user.get("full_name") or user.get("name") or "User"

        if not existing_primary and depts:
            primary = depts[0]
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"primary_department": primary}},
            )
            report["users_backfilled"] += 1

            # If multi-department member, audit for review
            if len(depts) > 1:
                audit_id = str(uuid.uuid4())
                await db.permission_audit.insert_one(
                    {
                        "id": audit_id,
                        "at": now_iso,
                        "actor_id": "system",
                        "actor_name": "System",
                        "target_type": "user",
                        "target_id": user_id,
                        "target_name": user_name,
                        "department": primary,
                        "module": "all",
                        "before": "—",
                        "after": f"Primary: {primary} ({', '.join(depts)})",
                        "reason": "needs review (migration)",
                    }
                )
                report["multi_dept_audited"] += 1

    # 4. Initial system audit entry if none exists
    initial_audit = await db.permission_audit.find_one({"target_type": "role", "target_id": "all"})
    if not initial_audit:
        await db.permission_audit.insert_one(
            {
                "id": str(uuid.uuid4()),
                "at": now_iso,
                "actor_id": "system",
                "actor_name": "System",
                "target_type": "role",
                "target_id": "all",
                "target_name": "All roles",
                "department": None,
                "module": "Defaults seeded (migration)",
                "before": "—",
                "after": "Current behaviour",
                "reason": "Defaults seeded (migration)",
            }
        )

    logger.info("Primary department backfill completed: %s", report)
    return report


async def normalize_operations_role_labels(db=None, dry_run: bool = False) -> Dict[str, Any]:
    """Idempotent: alias operations roles become role=operations. Deletes nothing."""
    if db is None:
        db = get_database()
    if db is None:
        raise RuntimeError("Database connection unavailable for migration.")

    now_iso = datetime.now(timezone.utc).isoformat()
    report: Dict[str, Any] = {"scanned": 0, "normalized": 0, "dry_run": dry_run}

    cursor = db.users.find({})
    async for user in cursor:
        report["scanned"] += 1
        next_role = operations_canonical_role(user)
        if not next_role:
            continue
        user_id = str(user.get("id") or user.get("_id"))
        user_name = user.get("full_name") or user.get("name") or "User"
        old_role = user.get("role")
        logger.info(
            "Normalize operations role: user=%s %s %s -> %s",
            user_id,
            user_name,
            old_role,
            next_role,
        )
        if dry_run:
            report["normalized"] += 1
            continue
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"role": next_role}})
        await db.permission_audit.insert_one(
            {
                "id": str(uuid.uuid4()),
                "at": now_iso,
                "actor_id": "system",
                "actor_name": "System",
                "target_type": "user",
                "target_id": user_id,
                "target_name": user_name,
                "department": user.get("department"),
                "module": "role",
                "before": str(old_role),
                "after": next_role,
                "reason": "Normalized operations role alias (no lead/member level)",
            }
        )
        report["normalized"] += 1

    logger.info("Operations role label normalization: %s", report)
    return report


async def run_permissions_migration(db=None) -> Dict[str, Any]:
    """Startup entry kept for older callers. It only backfills primary_department."""
    return await backfill_primary_departments(db)
