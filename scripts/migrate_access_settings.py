"""CLI script to run access_settings_v1 migration.

Usage:
    python scripts/migrate_access_settings.py [--dry-run | --apply] [--db DATABASE_NAME] [--url MONGODB_URL]
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys

# Setup paths so app modules are resolvable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from motor.motor_asyncio import AsyncIOMotorClient

from app.services.access_migration import run_access_settings_migration

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("migrate_access_settings")


async def main():
    parser = argparse.ArgumentParser(description="Run access_settings_v1 migration.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="Apply migration changes.")
    group.add_argument("--dry-run", action="store_true", default=True, help="Perform dry run (default).")
    parser.add_argument(
        "--db",
        type=str,
        default=os.environ.get("MONGODB_DB", "reamarc_db"),
        help="Target MongoDB database name.",
    )
    parser.add_argument(
        "--url",
        type=str,
        default=os.environ.get("MONGODB_URL", "mongodb://localhost:27017"),
        help="MongoDB connection URL.",
    )

    args = parser.parse_args()
    apply_mode = bool(args.apply)

    client = AsyncIOMotorClient(args.url)
    db = client[args.db]

    logger.info("Connecting to MongoDB database '%s' at '%s' (mode: %s)", args.db, args.url, "APPLY" if apply_mode else "DRY-RUN")
    result = await run_access_settings_migration(db=db, dry_run=not apply_mode)

    print("\n================== ACCESS SETTINGS MIGRATION RESULT ==================")
    print(f"Status:            {result.get('status')}")
    print(f"Users Processed:   {result.get('users_processed', 0)}")
    print(f"Users Updated:     {result.get('users_updated', 0)}")
    print(f"Roles Normalized:  {result.get('roles_normalized', 0)}")
    print(f"Stages Carried:    {result.get('stages_carried', 0)}")
    print(f"Overrides Ignored: {result.get('overrides_ignored', 0)}")
    print("======================================================================\n")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
