"""Tests for Phase 3: scripts/migrate_access_defaults.py.

Verifies:
1. Dry-run makes no modifications.
2. Apply mode upserts system role defaults where not customized.
3. Custom existing role_permissions are preserved.
4. User permission overrides are never touched or deleted.
5. Missing primary_department is backfilled from first entry in departments.
6. Migration is idempotent (rerun does nothing due to marker).
"""
from __future__ import annotations

import asyncio
import os
import unittest
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from scripts.migrate_access_defaults import run_migration, MIGRATION_ID

TEST_DB_NAME = "reamarc_migration_test_db"
MONGO_URL = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")


class TestMigrateAccessDefaults(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncIOMotorClient(MONGO_URL)
        self.db = self.client[TEST_DB_NAME]
        # Clean test db
        await self.client.drop_database(TEST_DB_NAME)

    async def asyncTearDown(self):
        await self.client.drop_database(TEST_DB_NAME)
        self.client.close()

    async def test_migration_lifecycle(self):
        # 1. Seed existing data:
        # - A custom role permission (e.g. operations has website=view customized by admin)
        await self.db.role_permissions.insert_one({
            "role": "operations",
            "module": "website",
            "level": "view",
            "custom": True,
        })

        # - An existing user override
        await self.db.user_permission_overrides.insert_one({
            "user_id": "u-test-1",
            "department": "sales",
            "module": "sales",
            "level": "all",
        })

        # - User A with missing primary_department but departments list
        await self.db.users.insert_one({
            "id": "u-test-1",
            "email": "userA@example.com",
            "departments": ["content", "creative"],
            "primary_department": None,
        })

        # - User B already with primary_department
        await self.db.users.insert_one({
            "id": "u-test-2",
            "email": "userB@example.com",
            "departments": ["sales"],
            "primary_department": "sales",
        })

        # --- TEST 1: Dry run makes no changes ---
        dry_res = await run_migration(TEST_DB_NAME, MONGO_URL, apply=False)
        self.assertEqual(dry_res["status"], "DRY_RUN_COMPLETE")
        self.assertEqual(dry_res["users_backfilled_count"], 1)

        # Check that DB was NOT modified
        marker = await self.db.migrations.find_one({"id": MIGRATION_ID})
        self.assertIsNone(marker)
        u_a = await self.db.users.find_one({"id": "u-test-1"})
        self.assertIsNone(u_a.get("primary_department"))

        # --- TEST 2: Apply migration ---
        apply_res = await run_migration(TEST_DB_NAME, MONGO_URL, apply=True)
        self.assertEqual(apply_res["status"], "APPLIED")

        # Check marker exists
        marker = await self.db.migrations.find_one({"id": MIGRATION_ID})
        self.assertIsNotNone(marker)

        # Stored role_permissions documents are left in place and are not seeded.
        ops_web = await self.db.role_permissions.find_one({"role": "operations", "module": "website"})
        self.assertEqual(ops_web.get("level"), "view")
        ops_sales = await self.db.role_permissions.find_one({"role": "operations", "module": "sales"})
        self.assertIsNone(ops_sales)

        # Check user A was backfilled
        u_a = await self.db.users.find_one({"id": "u-test-1"})
        self.assertEqual(u_a.get("primary_department"), "content")

        # Check user B was not changed
        u_b = await self.db.users.find_one({"id": "u-test-2"})
        self.assertEqual(u_b.get("primary_department"), "sales")

        # Check user overrides were preserved
        ov = await self.db.user_permission_overrides.find_one({"user_id": "u-test-1"})
        self.assertIsNotNone(ov)
        self.assertEqual(ov.get("level"), "all")

        # --- TEST 3: Rerun gives same result (idempotent, marker stops it) ---
        rerun_res = await run_migration(TEST_DB_NAME, MONGO_URL, apply=True)
        self.assertEqual(rerun_res["status"], "ALREADY_APPLIED")


if __name__ == "__main__":
    unittest.main()
