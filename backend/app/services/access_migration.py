"""Access Settings Migration (access_settings_v1).

Idempotent migration:
- Leaves collections role_permissions, user_permission_overrides, permission_audit untouched.
- Leaves departments untouched.
- For each non-client user:
  - sets access = {module: None} if not already set.
  - sets content_stages from old departments (keeping content/creative/social_media that differ from primary department).
  - normalizes operations aliases (operations_lead, etc.) to role="operations", department="", primary_department="".
- Logs summary and inserts 1 permission_audit entry.
- Records marker in migrations collection.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.database import get_database
from app.core.tenant import get_global_db
from app.services.access import (
    MODULES,
    VALID_CONTENT_STAGES,
    get_primary_stage,
    get_user_primary_department,
    normalize_dept,
    normalize_role,
    normalize_stage,
    parse_user_departments,
)

logger = logging.getLogger(__name__)
MIGRATION_ID = "access_settings_v1"


async def run_access_settings_migration(
    db=None,
    dry_run: bool = False,
    force: bool = False,
) -> Dict[str, Any]:
    """Execute the access_settings_v1 migration."""
    if db is None:
        db = get_database()
    if db is None:
        raise RuntimeError("Database connection unavailable for migration.")

    now_iso = datetime.now(timezone.utc).isoformat()

    gdb = get_global_db()
    mig_coll = getattr(gdb, "migrations", None) if gdb is not None else getattr(db, "migrations", None)

    from app.core.tenant import get_tenant_context
    ctx = get_tenant_context()
    mig_marker_id = f"{MIGRATION_ID}:{ctx.company_id}" if (ctx and ctx.company_id) else MIGRATION_ID

    # Check marker document
    if not force and mig_coll is not None:
        marker = await mig_coll.find_one({"id": mig_marker_id})
        if marker:
            logger.info("Migration %s already applied at %s", mig_marker_id, marker.get("applied_at"))
            return {
                "status": "ALREADY_APPLIED",
                "marker": marker,
                "users_processed": marker.get("users_processed", 0),
                "roles_normalized": marker.get("roles_normalized", 0),
                "stages_carried": marker.get("stages_carried", 0),
                "overrides_ignored": marker.get("overrides_ignored", 0),
            }

    users_processed = 0
    roles_normalized_count = 0
    stages_carried_count = 0
    user_updates: List[tuple] = []

    cursor = db.users.find({})
    async for user in cursor:
        raw_role = str(user.get("role") or "").strip().lower()
        if raw_role == "client":
            continue

        users_processed += 1
        updates: Dict[str, Any] = {}

        # 1. access dict initialized to all null if not set
        existing_access = user.get("access")
        if existing_access is None or not isinstance(existing_access, dict):
            updates["access"] = {m: None for m in MODULES}

        # 2. content_stages extracted from departments (extra stages differing from primary stage)
        existing_stages = user.get("content_stages")
        if existing_stages is None:
            primary_dept = get_user_primary_department(user)
            primary_stage = get_primary_stage(primary_dept)
            carried: List[str] = []
            for d in parse_user_departments(user):
                st = normalize_stage(d)
                if st and st in VALID_CONTENT_STAGES and st != primary_stage and st not in carried:
                    carried.append(st)
            updates["content_stages"] = carried
            if carried:
                stages_carried_count += 1

        # 3. Normalize operations roles and clear department for operations
        norm_role = normalize_role(user.get("role"))
        if norm_role == "operations":
            if user.get("role") != "operations":
                updates["role"] = "operations"
                roles_normalized_count += 1
            if user.get("department") or user.get("primary_department"):
                updates["department"] = ""
                updates["primary_department"] = ""

        if updates:
            user_updates.append((user["_id"], updates))

    # Count old override documents without deleting or modifying them
    overrides_ignored = 0
    try:
        overrides_ignored = await db.user_permission_overrides.count_documents({})
    except Exception as exc:
        logger.debug("Could not count user_permission_overrides: %s", exc)

    if not dry_run:
        for user_oid, fields in user_updates:
            await db.users.update_one({"_id": user_oid}, {"$set": fields})

        # Insert single permission_audit entry
        audit_entry = {
            "id": str(uuid.uuid4()),
            "at": now_iso,
            "actor_id": "system",
            "actor_name": "System",
            "target_type": "migration",
            "target_id": MIGRATION_ID,
            "target_name": "Access settings v1",
            "department": None,
            "module": "all",
            "before": "—",
            "after": (
                f"Migrated {users_processed} users (roles normalized: {roles_normalized_count}, "
                f"stages carried: {stages_carried_count}, overrides ignored: {overrides_ignored})"
            ),
            "reason": f"{MIGRATION_ID} migration",
        }
        await db.permission_audit.insert_one(audit_entry)

        # Insert migration marker
        marker_doc = {
            "id": mig_marker_id,
            "migration_id": MIGRATION_ID,
            "applied_at": now_iso,
            "users_processed": users_processed,
            "roles_normalized": roles_normalized_count,
            "stages_carried": stages_carried_count,
            "overrides_ignored": overrides_ignored,
        }
        if ctx and ctx.company_id:
            marker_doc["company_id"] = ctx.company_id
        if mig_coll is not None:
            await mig_coll.update_one({"id": mig_marker_id}, {"$set": marker_doc}, upsert=True)

    summary = {
        "status": "DRY_RUN" if dry_run else "APPLIED",
        "users_processed": users_processed,
        "users_updated": len(user_updates),
        "roles_normalized": roles_normalized_count,
        "stages_carried": stages_carried_count,
        "overrides_ignored": overrides_ignored,
    }

    logger.info("Access settings migration summary: %s", summary)
    return summary
