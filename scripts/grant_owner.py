"""
scripts/grant_owner.py
One-off CLI script to grant super-admin owner privileges.
Only way to set users.is_super_admin = True.
Prints before/after states and appends to the immutable owner_audit hash chain.

Usage:
  python -m scripts.grant_owner --email faizan@reamarc.com --confirm
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.owner_audit import record_owner_audit_event


async def run_grant_owner(uri: str, db_name: str, email: str, confirm: bool):
    client = AsyncIOMotorClient(uri)
    db = client[db_name]

    email_clean = email.strip().lower()
    user = await db.users.find_one({"email": email_clean})
    if not user:
        print(f"[ERROR] User with email '{email_clean}' not found in database '{db_name}'.", file=sys.stderr)
        client.close()
        sys.exit(1)

    print("=" * 60)
    print(" GRANT SUPER-ADMIN OWNER PRIVILEGES")
    print(f" Target User: {user.get('name')} <{email_clean}> (id: {user.get('id')})")
    print(f" Current is_super_admin: {user.get('is_super_admin', False)}")
    print("=" * 60)

    if not confirm:
        print("[NOTICE] Running in dry-run mode. Pass --confirm to apply changes.")
        client.close()
        sys.exit(0)

    # Apply change
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"is_super_admin": True}}
    )

    updated_user = await db.users.find_one({"_id": user["_id"]})
    print("\n[SUCCESS] Privileges updated successfully!")
    print(f" Before: is_super_admin={user.get('is_super_admin', False)}")
    print(f" After:  is_super_admin={updated_user.get('is_super_admin', False)}")

    # Record in immutable owner_audit
    audit_entry = await record_owner_audit_event(
        global_db=db,
        action="grant_owner",
        actor_user_id=str(user.get("id")),
        details={
            "email": email_clean,
            "target_user_id": str(user.get("id")),
            "cli": True,
        }
    )
    print(f" Immutable audit logged with hash: {audit_entry['hash'][:16]}...")
    print("=" * 60)
    client.close()


def main():
    parser = argparse.ArgumentParser(description="Grant is_super_admin to owner account via CLI")
    parser.add_argument("--uri", default=os.environ.get("MONGODB_URL", "mongodb://localhost:27017"))
    parser.add_argument("--db", default=os.environ.get("MONGODB_DB_NAME", "reamarc_test_db"))
    parser.add_argument("--email", required=True, help="Owner's corporate email address")
    parser.add_argument("--confirm", action="store_true", help="Confirm execution of privileges grant")
    args = parser.parse_args()

    asyncio.run(run_grant_owner(args.uri, args.db, args.email, args.confirm))


if __name__ == "__main__":
    main()
