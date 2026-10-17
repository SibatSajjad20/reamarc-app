"""
scripts/migrate_memberships.py
Phase 1 Migration: Populates company_memberships from existing users collection.

Usage:
  # Dry-run (default, makes zero changes)
  python -m scripts.migrate_memberships --dry-run
  python -m scripts.migrate_memberships --db reamarc_test_db --dry-run

  # Apply migration (batched, idempotent, resumable)
  python -m scripts.migrate_memberships --apply
  python -m scripts.migrate_memberships --db reamarc_test_db --apply
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pymongo
from pymongo import MongoClient
from pymongo.collection import Collection
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(env_path)

MODULE_KEYS = ("attendance", "daily_log", "sales", "content_calendar", "website", "ads")


def build_membership_doc(user_doc: Dict[str, Any]) -> Dict[str, Any]:
    user_id = str(user_doc.get("id") or user_doc.get("_id"))
    company_id = str(user_doc.get("company_id") or "company_reamarc")

    role = str(user_doc.get("role") or "team_member").lower().strip()
    primary_dept = user_doc.get("primary_department") or user_doc.get("department")

    depts = user_doc.get("departments")
    if depts is None:
        depts = [primary_dept] if primary_dept else []
    elif isinstance(depts, list):
        depts = [str(d) for d in depts if d]
    else:
        depts = [str(depts)]

    content_stages = user_doc.get("content_stages")
    if not isinstance(content_stages, list):
        content_stages = []

    user_access = user_doc.get("access") or {}
    access = {}
    for mod in MODULE_KEYS:
        val = user_access.get(mod)
        access[mod] = val if val is not None else False

    is_active = bool(user_doc.get("is_active", True))
    status = "active" if is_active else "removed"

    now_iso = datetime.now(timezone.utc).isoformat()
    created_at = user_doc.get("created_at") or now_iso
    updated_at = user_doc.get("updated_at") or now_iso

    return {
        "id": f"mem_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "company_id": company_id,
        "role": role,
        "primary_department": primary_dept,
        "departments": depts,
        "content_stages": content_stages,
        "access": access,
        "status": status,
        "granted_by": "migration",
        "granted_at": created_at,
        "removed_by": None if is_active else "migration",
        "removed_at": None if is_active else updated_at,
        "needs_setup": False,
        "token_version": int(user_doc.get("token_version", 0) or 0),
    }


def compute_users_checksum(coll: Collection) -> str:
    """Compute a deterministic checksum of the users collection to verify zero changes."""
    cursor = coll.find({}, {"_id": 1, "company_id": 1, "role": 1, "email": 1, "updated_at": 1}).sort("_id", 1)
    hasher = hashlib.sha256()
    for doc in cursor:
        doc_str = json.dumps(doc, sort_keys=True, default=str)
        hasher.update(doc_str.encode("utf-8"))
    return hasher.hexdigest()


def ensure_membership_indexes(db: pymongo.database.Database):
    coll = db["company_memberships"]
    coll.create_index(
        [("user_id", 1), ("company_id", 1)],
        unique=True,
        name="uniq_user_company_membership",
    )
    coll.create_index(
        [("company_id", 1), ("status", 1)],
        name="idx_company_memberships_company_status",
    )
    coll.create_index(
        [("user_id", 1), ("status", 1)],
        name="idx_company_memberships_user_status",
    )


def run_dry_run(db: pymongo.database.Database, batch_size: int = 100):
    print("=" * 70)
    print(f" MEMBERSHIP MIGRATION DRY-RUN — Database: '{db.name}'")
    print("=" * 70)

    users_coll = db["users"]
    memberships_coll = db["company_memberships"]

    total_users = users_coll.count_documents({})
    users_with_company = users_coll.count_documents({"company_id": {"$exists": True, "$ne": None}})
    existing_memberships = memberships_coll.count_documents({})

    would_insert = 0
    already_present = 0

    cursor = users_coll.find({"company_id": {"$exists": True, "$ne": None}}).batch_size(batch_size)
    for u in cursor:
        uid = str(u.get("id") or u.get("_id"))
        cid = str(u.get("company_id"))
        exists = memberships_coll.find_one({"user_id": uid, "company_id": cid})
        if exists:
            already_present += 1
        else:
            would_insert += 1

    print(f"Total users in DB:                   {total_users}")
    print(f"Users with company_id:               {users_with_company}")
    print(f"Existing company_memberships:        {existing_memberships}")
    print(f"Memberships to create (would insert): {would_insert}")
    print(f"Memberships already up-to-date:      {already_present}")
    print("=" * 70)
    print("[DRY-RUN COMPLETE] Zero changes made to the database.")
    return {"would_insert": would_insert, "already_present": already_present}


def apply_migration(db: pymongo.database.Database, batch_size: int = 100) -> Dict[str, Any]:
    print("=" * 70)
    print(f" APPLYING MEMBERSHIP MIGRATION — Database: '{db.name}'")
    print("=" * 70)

    users_coll = db["users"]
    memberships_coll = db["company_memberships"]

    # 1. Ensure indexes
    ensure_membership_indexes(db)
    print("[OK] Verified company_memberships indexes.")

    # 2. Checksum pre-state of users
    pre_user_count = users_coll.count_documents({})
    pre_checksum = compute_users_checksum(users_coll)

    inserted_count = 0
    skipped_count = 0

    cursor = users_coll.find({"company_id": {"$exists": True, "$ne": None}}).batch_size(batch_size)
    batch: List[Dict[str, Any]] = []

    for u in cursor:
        uid = str(u.get("id") or u.get("_id"))
        cid = str(u.get("company_id"))

        existing = memberships_coll.find_one({"user_id": uid, "company_id": cid})
        if existing:
            skipped_count += 1
            continue

        doc = build_membership_doc(u)
        batch.append(doc)

        if len(batch) >= batch_size:
            memberships_coll.insert_many(batch)
            inserted_count += len(batch)
            batch = []

    if batch:
        memberships_coll.insert_many(batch)
        inserted_count += len(batch)

    # 3. Verify users collection was unchanged
    post_user_count = users_coll.count_documents({})
    post_checksum = compute_users_checksum(users_coll)

    if pre_user_count != post_user_count or pre_checksum != post_checksum:
        print("[ERROR] Users collection changed during membership migration!", file=sys.stderr)
        sys.exit(1)

    # 4. Invariant count checks
    users_with_company = users_coll.count_documents({"company_id": {"$exists": True, "$ne": None}})
    total_memberships = memberships_coll.count_documents({})

    print(f"[OK] Memberships inserted:          {inserted_count}")
    print(f"[OK] Memberships skipped (existing): {skipped_count}")
    print(f"[OK] Total memberships in DB:       {total_memberships}")
    print(f"[OK] Users with company_id:         {users_with_company}")
    print(f"[OK] Users collection unchanged:    100% matched checksum")

    if total_memberships != users_with_company:
        print(f"[ERROR] Counts mismatch: {total_memberships} memberships vs {users_with_company} users with company", file=sys.stderr)
        sys.exit(1)

    print("=" * 70)
    print(f"[SUCCESS] Membership migration completed: {inserted_count} inserted, {skipped_count} skipped.")
    print("=" * 70)
    return {
        "inserted": inserted_count,
        "skipped": skipped_count,
        "total": total_memberships,
    }


def main():
    parser = argparse.ArgumentParser(description="Multi-company memberships additive migration")
    parser.add_argument("--uri", default=os.environ.get("MONGODB_URL", "mongodb://localhost:27017"))
    parser.add_argument("--db", default=os.environ.get("MONGODB_DB_NAME", "reamarc_test_db"))
    parser.add_argument("--dry-run", action="store_true", help="Print planned migration changes without writing")
    parser.add_argument("--apply", action="store_true", help="Execute additive membership migration")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size for reads/writes")
    args = parser.parse_args()

    client = MongoClient(args.uri)
    db = client[args.db]

    if args.apply:
        apply_migration(db, batch_size=args.batch_size)
    else:
        run_dry_run(db, batch_size=args.batch_size)

    client.close()


if __name__ == "__main__":
    main()
