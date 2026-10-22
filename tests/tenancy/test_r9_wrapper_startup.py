"""
tests/tenancy/test_r9_wrapper_startup.py
Unit tests verifying Round 2 requirement R9:
- TenantCollection.aggregate: rewrite $lookup with localField/foreignField into pipeline form.
- An aggregate with localField $lookup doesn't join another company's docs.
- App startup with MT on has no "no tenant context" log errors.
- Per-company migration updates users in two companies.
"""

from __future__ import annotations

import logging
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
root_dir = str(Path(__file__).resolve().parent.parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app.config import settings
from app.database import db_instance, get_database
from app.core.tenant import tenant_scope, for_each_active_company
from app.services.permissions_migration import (
    backfill_primary_departments,
    normalize_operations_role_labels,
)
from app.services.access_migration import run_access_settings_migration
from app.services.content_calendar_service import ensure_indexes, backfill_share_tokens
from motor.motor_asyncio import AsyncIOMotorClient


class TestR9WrapperStartup(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        settings.MULTI_TENANT_ENABLED = True
        settings.MULTI_COMPANY_ENABLED = True

        self.client_mongo = AsyncIOMotorClient("mongodb://localhost:27017")
        self.raw_db = self.client_mongo["reamarc_test_db"]
        db_instance.client = self.client_mongo
        db_instance.db = self.raw_db

        await self._clean_data()

    async def asyncTearDown(self):
        await self._clean_data()
        self.client_mongo.close()

    async def _clean_data(self):
        patterns = ["^r9_"]
        for p in patterns:
            query = {"$regex": p}
            await self.raw_db.companies.delete_many({"id": query})
            await self.raw_db.company_memberships.delete_many({"id": query})
            await self.raw_db.users.delete_many({"$or": [{"id": query}, {"email": query}]})
            await self.raw_db.workspaces.delete_many({"id": query})
            await self.raw_db.content_calendar_items.delete_many({"id": query})
            await self.raw_db.migrations.delete_many({"$or": [{"id": {"$regex": "r9_"}}, {"company_id": query}]})


    async def test_aggregate_localfield_lookup_isolation(self):
        """An aggregate with a localField $lookup doesn't join another company's docs."""
        now = datetime.now(timezone.utc).isoformat()

        # Seed Company A and Company B
        await self.raw_db.companies.insert_many([
            {"id": "r9_comp_a", "slug": "r9-comp-a", "name": "Company A", "status": "active", "created_at": now},
            {"id": "r9_comp_b", "slug": "r9-comp-b", "name": "Company B", "status": "active", "created_at": now},
        ])


        # Company B has user B
        await self.raw_db.users.insert_one({
            "id": "r9_user_b",
            "name": "User B",
            "email": "user_b@r9.test",
            "company_id": "r9_comp_b",
            "role": "team_member",
            "is_active": True,
        })

        # Company A has user A
        await self.raw_db.users.insert_one({
            "id": "r9_user_a",
            "name": "User A",
            "email": "user_a@r9.test",
            "company_id": "r9_comp_a",
            "role": "team_member",
            "is_active": True,
        })

        # Company A workspace referencing user B
        await self.raw_db.workspaces.insert_one({
            "id": "r9_ws_cross",
            "name": "Workspace Cross",
            "company_id": "r9_comp_a",
            "user_id": "r9_user_b",
        })

        # Company A workspace referencing user A
        await self.raw_db.workspaces.insert_one({
            "id": "r9_ws_valid",
            "name": "Workspace Valid",
            "company_id": "r9_comp_a",
            "user_id": "r9_user_a",
        })

        db = get_database()
        with tenant_scope("r9_comp_a"):
            pipeline = [
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "user_id",
                        "foreignField": "id",
                        "as": "joined_user",
                    }
                }
            ]
            cursor = db.workspaces.aggregate(pipeline)
            docs = await cursor.to_list(10)

        docs_by_id = {d["id"]: d for d in docs}

        # The cross workspace joined_user MUST be empty because user B is in comp B
        self.assertIn("r9_ws_cross", docs_by_id)
        self.assertEqual(docs_by_id["r9_ws_cross"]["joined_user"], [])

        # The valid workspace joined_user MUST contain user A
        self.assertIn("r9_ws_valid", docs_by_id)
        self.assertEqual(len(docs_by_id["r9_ws_valid"]["joined_user"]), 1)
        self.assertEqual(docs_by_id["r9_ws_valid"]["joined_user"][0]["id"], "r9_user_a")

    async def test_startup_with_mt_on_has_no_tenant_context_error(self):
        """App startup routines with MT on have no 'no tenant context' errors."""
        now = datetime.now(timezone.utc).isoformat()
        await self.raw_db.companies.insert_one({
            "id": "r9_comp_startup",
            "slug": "r9-comp-startup",
            "name": "Startup Test Co",
            "status": "active",
            "created_at": now,
        })


        # Add a logger handler to spy on warnings/errors
        log_records = []

        class ListHandler(logging.Handler):
            def emit(self, record):
                log_records.append(self.format(record))

        handler = ListHandler()
        root_logger = logging.getLogger()
        root_logger.addHandler(handler)

        try:
            db = get_database()
            # 1. Content calendar indexes (should not throw NoTenantContext)
            await ensure_indexes(db)

            # 2. Per-company migrations
            async def _per_company_startup(company):
                await backfill_primary_departments(db)
                await normalize_operations_role_labels(db)
                await run_access_settings_migration(db)
                await backfill_share_tokens(db)

            await for_each_active_company(_per_company_startup)

            # Assert no "no tenant context" or NoTenantContext in any logged message
            for msg in log_records:
                self.assertNotIn("no tenant context", msg.lower())
                self.assertNotIn("notenantcontext", msg.lower())

        finally:
            root_logger.removeHandler(handler)

    async def test_per_company_migration_updates_users_in_two_companies(self):
        """The per-company migration updates users in two different companies."""
        now = datetime.now(timezone.utc).isoformat()
        await self.raw_db.companies.insert_many([
            {"id": "r9_comp_m1", "slug": "r9-comp-m1", "name": "Company M1", "status": "active", "created_at": now},
            {"id": "r9_comp_m2", "slug": "r9-comp-m2", "name": "Company M2", "status": "active", "created_at": now},
        ])


        # User in company 1 missing primary_department and access
        await self.raw_db.users.insert_one({
            "id": "r9_usr_m1",
            "email": "user_m1@test.com",
            "name": "User M1",
            "company_id": "r9_comp_m1",
            "role": "team_member",
            "departments": ["Design"],
            "primary_department": None,
            "access": None,
            "is_active": True,
        })

        # User in company 2 missing primary_department and access
        await self.raw_db.users.insert_one({
            "id": "r9_usr_m2",
            "email": "user_m2@test.com",
            "name": "User M2",
            "company_id": "r9_comp_m2",
            "role": "team_member",
            "departments": ["Engineering"],
            "primary_department": None,
            "access": None,
            "is_active": True,
        })

        db = get_database()

        async def _per_company_startup(company):
            await backfill_primary_departments(db)
            await normalize_operations_role_labels(db)
            await run_access_settings_migration(db)
            await backfill_share_tokens(db)

        await for_each_active_company(_per_company_startup)

        # Verify user in company 1
        u1 = await self.raw_db.users.find_one({"id": "r9_usr_m1"})
        self.assertEqual(u1.get("primary_department"), "Design")
        self.assertIsInstance(u1.get("access"), dict)
        self.assertIn("attendance", u1.get("access"))

        # Verify user in company 2
        u2 = await self.raw_db.users.find_one({"id": "r9_usr_m2"})
        self.assertEqual(u2.get("primary_department"), "Engineering")
        self.assertIsInstance(u2.get("access"), dict)
        self.assertIn("attendance", u2.get("access"))



if __name__ == "__main__":
    unittest.main()
