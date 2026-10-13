"""Migration & Seeding Service for Roles & Permissions.

Creates collections, builds indexes, seeds system role defaults, and backfills
primary_department for users.
Idempotent and safe to run multiple times.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from app.database import get_database
from app.services.permissions import (
    SYSTEM_ROLE_DEFAULTS,
    parse_user_departments,
    invalidate_role_defaults_cache,
)

logger = logging.getLogger(__name__)


async def run_permissions_migration(db=None) -> Dict[str, Any]:
    """Execute the idempotent permissions migration."""
    if db is None:
        db = get_database()
    if db is None:
        raise RuntimeError("Database connection unavailable for migration.")

    now_iso = datetime.now(timezone.utc).isoformat()
    report: Dict[str, Any] = {
        "indexes_created": 0,
        "role_permissions_upserted": 0,
        "users_backfilled": 0,
        "multi_dept_audited": 0,
    }

    # 1. Create indexes
    try:
        await db.role_permissions.create_index(
            [("role", 1), ("module", 1)],
            unique=True,
            name="uniq_role_module",
        )
        await db.user_permission_overrides.create_index(
            [("user_id", 1), ("department", 1), ("module", 1)],
            unique=True,
            name="uniq_user_dept_module",
        )
        await db.user_permission_overrides.create_index(
            [("user_id", 1)],
            name="idx_override_user_id",
        )
        await db.permission_audit.create_index(
            [("at", -1)],
            name="idx_audit_at_desc",
        )
        await db.permission_audit.create_index(
            [("target_id", 1), ("at", -1)],
            name="idx_audit_target_at",
        )
        await db.users.create_index(
            [("primary_department", 1)],
            name="idx_users_primary_dept",
        )
        report["indexes_created"] = 6
    except Exception as e:
        logger.warning("Error creating indexes in permissions migration: %s", e)

    # 2. Seed / Upsert role defaults
    for role, mod_dict in SYSTEM_ROLE_DEFAULTS.items():
        for module, level in mod_dict.items():
            res = await db.role_permissions.update_one(
                {"role": role, "module": module},
                {
                    "$setOnInsert": {
                        "level": level,
                        "updated_at": now_iso,
                        "updated_by": "system",
                    }
                },
                upsert=True,
            )
            if res.upserted_id or res.modified_count:
                report["role_permissions_upserted"] += 1

    invalidate_role_defaults_cache()

    # 3. Backfill users.primary_department
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

    logger.info("Permissions migration completed: %s", report)
    return report
