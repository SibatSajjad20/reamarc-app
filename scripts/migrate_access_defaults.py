"""One-time migration script for access control defaults (Phase 3).

Usage:
    python scripts/migrate_access_defaults.py [--dry-run | --apply] [--db DATABASE_NAME]

Actions:
    1. Upserts the new system role defaults into role_permissions collection
       ONLY where an admin has NOT already customized them. Existing custom values are preserved.
    2. Backfills missing primary_department on users from the first entry in departments.
    3. Writes a migration marker into the migrations collection so reruns do nothing.
    4. Never deletes or overwrites user overrides.
    5. Fully idempotent.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient

# Setup path so backend modules can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.services.permissions import (
    parse_user_departments,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("migrate_access_defaults")

MIGRATION_ID = "access_control_phase3_v1"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_migration(db_name: str, mongo_url: str, apply: bool) -> Dict[str, Any]:
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    logger.info("Connecting to database: %s (mode: %s)", db_name, "APPLY" if apply else "DRY-RUN")

    # 1. Check migration marker
    marker = await db.migrations.find_one({"id": MIGRATION_ID})
    if marker:
        logger.info("Migration marker '%s' already exists (applied at %s). Nothing to do.", MIGRATION_ID, marker.get("applied_at"))
        client.close()
        return {
            "status": "ALREADY_APPLIED",
            "marker": marker,
            "role_permissions_diff": [],
            "users_backfilled": [],
        }

    users_backfilled: List[Dict[str, Any]] = []
    now = _now_iso()
    logger.info("Role rules are fixed in code. role_permissions documents are left unchanged.")

    # Primary-department backfill only.
    users = await db.users.find({}).to_list(5000)
    for u in users:
        uid = str(u.get("id") or u.get("_id") or "")
        current_primary = str(u.get("primary_department") or "").strip()
        if not current_primary:
            depts = parse_user_departments(u)
            if depts:
                inferred_primary = depts[0]
                users_backfilled.append({
                    "id": uid,
                    "email": u.get("email"),
                    "name": u.get("full_name") or u.get("name"),
                    "departments": depts,
                    "backfilled_primary_department": inferred_primary,
                })
                if apply:
                    await db.users.update_one(
                        {"id": uid},
                        {"$set": {"primary_department": inferred_primary, "updated_at": now}},
                    )

    # 4. Write migration marker if apply mode
    if apply:
        await db.migrations.update_one(
            {"id": MIGRATION_ID},
            {
                "$set": {
                    "id": MIGRATION_ID,
                    "applied_at": now,
                    "role_permissions_upserted_count": 0,
                    "users_backfilled_count": len(users_backfilled),
                }
            },
            upsert=True,
        )
        logger.info("Wrote migration marker '%s'.", MIGRATION_ID)

    summary = {
        "status": "APPLIED" if apply else "DRY_RUN_COMPLETE",
        "role_permissions_diff_count": 0,
        "role_permissions_diff": [],
        "users_backfilled_count": len(users_backfilled),
        "users_backfilled": users_backfilled,
    }

    logger.info(
        "Summary: role rules unchanged, %d users primary_department backfilled.",
        len(users_backfilled),
    )

    client.close()
    return summary


async def run_ops_exceptions_migration(db_name: str, mongo_url: str, apply: bool) -> Dict[str, Any]:
    del db_name, mongo_url, apply
    logger.info("Operations exceptions migration is retired. Role rules are fixed in code.")
    return {"status": "RETIRED", "planned": 0, "applied": 0, "changes": []}


def main():
    parser = argparse.ArgumentParser(description="Migrate access control defaults (Phase 3).")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="Apply the migration changes to the database.")
    group.add_argument("--dry-run", action="store_true", default=True, help="Perform dry run without modifying database (default).")
    parser.add_argument("--db", type=str, default="reamarc_test_db", help="Target MongoDB database name (default: reamarc_test_db).")
    parser.add_argument("--url", type=str, default=os.environ.get("MONGODB_URL", "mongodb://localhost:27017"), help="MongoDB connection URL.")

    args = parser.parse_args()
    is_apply = bool(args.apply)

    res = asyncio.run(run_migration(args.db, args.url, is_apply))
    ops = asyncio.run(run_ops_exceptions_migration(args.db, args.url, is_apply))
    print(f"\n--- MIGRATION RESULT ({'APPLY' if is_apply else 'DRY-RUN'}) ---")
    print(f"Status: {res['status']}")
    print(f"Role defaults affected: {res.get('role_permissions_diff_count', 0)}")
    print(f"Users backfilled: {res.get('users_backfilled_count', 0)}")
    print(f"\n--- OPS EXCEPTIONS (access_ops_exceptions_v1) ---")
    print(f"Status: {ops.get('status')}")
    print(f"Planned changes: {ops.get('planned', 0)}")
    print(f"Applied changes: {ops.get('applied', 0)}")
    if ops.get("changes"):
        for change in ops["changes"]:
            print(
                f"  {change.get('role')}.{change.get('module')}: "
                f"{change.get('before')} -> {change.get('after')}"
            )
    if not is_apply:
        print("\nTo apply these changes, re-run with: python scripts/migrate_access_defaults.py --apply")


if __name__ == "__main__":
    main()
