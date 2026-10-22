"""
scripts/migrate_companies.py
Additive backfill migration: assigns every existing record to the Reamarc company.

Usage:
  # Dry run (default, modifies nothing)
  python -m scripts.migrate_companies --db reamarc_test_db --dry-run

  # Apply migration (resumable, batched, idempotent)
  python -m scripts.migrate_companies --db reamarc_test_db --apply

  # Prod run (requires verified backup archive)
  python -m scripts.migrate_companies --db reamarc --apply --i-have-a-backup reamarc-prod-YYYYMMDD.gz

  # Rollback plan
  python -m scripts.migrate_companies --rollback-plan
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import pymongo
from pymongo import MongoClient
from pymongo.collection import Collection
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(env_path)

from app.core.tenant import TENANT_COLLECTIONS
from scripts.snapshot_counts import take_snapshot, compare_snapshots
try:
    from scripts._prod_guard import enforce_prod_guard_before_connect, is_prod
except ImportError:
    from _prod_guard import enforce_prod_guard_before_connect, is_prod

REAMARC_COMPANY_ID = "company_reamarc"
REAMARC_SLUG = "reamarc"
REAMARC_DEFAULTS = {
    "id": REAMARC_COMPANY_ID,
    "name": "Reamarc",
    "slug": REAMARC_SLUG,
    "logo_url": "/assets/reamarc-logo.svg",
    "accent_color": "#6847E0",
    "timezone": "Asia/Karachi",
    "week_start": "Monday",
    "status": "active",
    "token_version": 0,
    "plan": "standard",
    "limits": {"max_users": 100},
    "custom_domain": None,
    "created_at": datetime.now(timezone.utc),
    "created_by": "system",
}

SINGLETON_COLLECTIONS = [
    "system_config",
    "crm_scheduler_settings",
    "daily_log_columns",
    "crm_pipeline",
    "crm_assignment_rules",
    "content_calendar_counters",
]


def print_rollback_plan(backup_file: str = "reamarc-prod-YYYYMMDD.gz"):
    print("=" * 60)
    print(" MULTI-TENANT COMPANIES: ROLLBACK PLAN")
    print("=" * 60)
    print("1. Instant Flag Rollback (Recommended):")
    print("   Set MULTI_TENANT_ENABLED=false in Render environment variables.")
    print("   The backfill is strictly additive: existing queries ignore company_id.")
    print("   Legacy application code continues running identically.")
    print("\n2. Full Database Restore (Last Resort):")
    print(f"   mongorestore --uri \"$MONGO_URI\" --gzip --archive=\"{backup_file}\" --drop")
    print("=" * 60)


def get_collection_stats(coll: Collection) -> tuple[int, int]:
    """Returns (total_count, missing_company_id_count)."""
    total = coll.count_documents({})
    missing = coll.count_documents({"company_id": {"$exists": False}})
    return total, missing


def run_dry_run(db: pymongo.database.Database):
    print("=" * 70)
    print(f" MIGRATION DRY-RUN REPORT — Database: '{db.name}'")
    print("=" * 70)
    print(f"{'Collection Name':<35} {'Total Docs':<12} {'Missing company_id':<20}")
    print("-" * 70)

    total_all = 0
    missing_all = 0

    for coll_name in sorted(TENANT_COLLECTIONS):
        coll = db[coll_name]
        total, missing = get_collection_stats(coll)
        total_all += total
        missing_all += missing
        status_flag = f"{missing} (would update)" if missing > 0 else "0 (up to date)"
        print(f"{coll_name:<35} {total:<12} {status_flag:<20}")

    print("-" * 70)
    print(f"{'TOTAL':<35} {total_all:<12} {missing_all:<20}")
    print("=" * 70)
    print("[DRY-RUN COMPLETE] No database modifications were performed.")


def apply_migration(
    db: pymongo.database.Database,
    batch_size: int = 1000,
    force_fail_after_collection: str | None = None,
) -> Dict[str, Any]:
    print("=" * 70)
    print(f" APPLYING ADDITIVE BACKFILL MIGRATION — Database: '{db.name}'")
    print("=" * 70)

    # 1. Ensure Reamarc Company exists
    companies_coll = db["companies"]
    existing_reamarc = companies_coll.find_one({"slug": REAMARC_SLUG})
    if not existing_reamarc:
        companies_coll.insert_one(dict(REAMARC_DEFAULTS))
        print(f"[OK] Created Reamarc default company record (id: {REAMARC_COMPANY_ID})")
    else:
        print(f"[OK] Reamarc company already present (id: {existing_reamarc.get('id')})")

    # 2. Resumability tracker in migrations collection
    migrations_coll = db["migrations"]
    progress_doc = migrations_coll.find_one({"id": "companies_backfill"}) or {
        "id": "companies_backfill",
        "status": "in_progress",
        "started_at": datetime.now(timezone.utc),
        "collections": {},
    }
    colls_progress = progress_doc.get("collections", {})

    total_updated = 0

    for coll_name in sorted(TENANT_COLLECTIONS):
        coll = db[coll_name]
        coll_prog = colls_progress.get(coll_name, {})

        if coll_prog.get("completed", False):
            print(f"[{coll_name}] already completed in previous run (updated {coll_prog.get('updated', 0)} docs). Skipping.")
            continue

        last_id = coll_prog.get("last_id", None)
        coll_updated = coll_prog.get("updated", 0)

        while True:
            query: Dict[str, Any] = {"company_id": {"$exists": False}}
            if last_id is not None:
                query["_id"] = {"$gt": last_id}

            batch = list(coll.find(query, {"_id": 1}).sort("_id", pymongo.ASCENDING).limit(batch_size))
            if not batch:
                break

            batch_ids = [d["_id"] for d in batch]
            update_res = coll.update_many(
                {"_id": {"$in": batch_ids}},
                {"$set": {"company_id": REAMARC_COMPANY_ID}}
            )

            last_id = batch_ids[-1]
            coll_updated += update_res.modified_count
            total_updated += update_res.modified_count

            # Record checkpoint
            colls_progress[coll_name] = {
                "last_id": last_id,
                "updated": coll_updated,
                "completed": False,
                "last_checkpoint": datetime.now(timezone.utc),
            }
            migrations_coll.update_one(
                {"id": "companies_backfill"},
                {"$set": {"collections": colls_progress}},
                upsert=True
            )

        colls_progress[coll_name] = {
            "last_id": last_id,
            "updated": coll_updated,
            "completed": True,
            "completed_at": datetime.now(timezone.utc),
        }
        migrations_coll.update_one(
            {"id": "companies_backfill"},
            {"$set": {"collections": colls_progress}},
            upsert=True
        )
        print(f"[{coll_name}] backfill completed ({coll_updated} docs updated)")

        # In-test simulated crash injection for mid-run recovery gate test
        if force_fail_after_collection and coll_name == force_fail_after_collection:
            raise RuntimeError(f"Simulated mid-run crash after collection '{coll_name}'")

    # 3. Global Singletons: set company_id
    for s_name in SINGLETON_COLLECTIONS:
        coll = db[s_name]
        coll.update_many(
            {"company_id": {"$exists": False}},
            {"$set": {"company_id": REAMARC_COMPANY_ID}}
        )

    # 4. Set token_version: 0 where missing on users
    user_tv_res = db.users.update_many(
        {"token_version": {"$exists": False}},
        {"$set": {"token_version": 0}}
    )
    if user_tv_res.modified_count > 0:
        print(f"[users] seeded token_version=0 on {user_tv_res.modified_count} user docs")

    migrations_coll.update_one(
        {"id": "companies_backfill"},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc),
            "total_updated": total_updated,
        }},
        upsert=True
    )

    print("=" * 70)
    print(f"[SUCCESS] Backfill migration completed: {total_updated} documents updated.")
    print("=" * 70)
    return {"status": "completed", "total_updated": total_updated}


def verify_migration(uri: str, db_name: str, pre_snapshot_path: Path):
    """Takes post-migration snapshot and confirms invariant checksums and 0 missing company_id."""
    print("\n[VERIFICATION] Generating post-migration snapshot...")
    post_snapshot_path = take_snapshot(uri, db_name)

    print("[VERIFICATION] Comparing pre- and post-migration snapshots...")
    match, diffs = compare_snapshots(pre_snapshot_path, post_snapshot_path)

    client = pymongo.MongoClient(uri)
    db = client[db_name]

    # Verify zero documents missing company_id
    missing_docs = {}
    for cname in sorted(TENANT_COLLECTIONS):
        m = db[cname].count_documents({"company_id": {"$exists": False}})
        if m > 0:
            missing_docs[cname] = m

    client.close()

    if missing_docs:
        print(f"[FAIL] Found collections still missing company_id: {missing_docs}", file=sys.stderr)
        sys.exit(1)

    if not match:
        print(f"[FAIL] Invariant checksum verification failed ({len(diffs)} diffs):", file=sys.stderr)
        for d in diffs:
            print(f"  - {d}", file=sys.stderr)
        sys.exit(1)

    print("[VERIFICATION SUCCESS] Zero documents missing company_id. Invariant checksums 100% matched!")


def main():
    parser = argparse.ArgumentParser(description="Multi-tenant additive backfill migration")
    parser.add_argument("--uri", default=os.environ.get("MONGODB_URL", "mongodb://localhost:27017"))
    parser.add_argument("--db", default=os.environ.get("MONGODB_DB_NAME", "reamarc_test_db"))
    parser.add_argument("--dry-run", action="store_true", help="Print planned changes without writing to DB")
    parser.add_argument("--apply", action="store_true", help="Execute additive backfill migration")
    parser.add_argument("--i-have-a-backup", help="Path to verified pre-flight backup archive (required on prod)")
    parser.add_argument("--rollback-plan", action="store_true", help="Print rollback instructions")
    args = parser.parse_args()

    if args.rollback_plan:
        print_rollback_plan(args.i_have_a_backup or "reamarc-prod-YYYYMMDD.gz")
        sys.exit(0)

    enforce_prod_guard_before_connect(args.uri, args.db, args)

    client = pymongo.MongoClient(args.uri)
    db = client[args.db]

    if args.apply:
        # Take pre-snapshot
        print(f"Taking pre-migration snapshot of '{args.db}'...")
        pre_snap = take_snapshot(args.uri, args.db)

        # Apply migration
        apply_migration(db)

        # Verify
        verify_migration(args.uri, args.db, pre_snap)
    else:
        # Default is dry-run
        run_dry_run(db)

    client.close()


if __name__ == "__main__":
    main()
