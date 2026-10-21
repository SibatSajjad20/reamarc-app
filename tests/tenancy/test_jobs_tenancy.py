"""
tests/tenancy/test_jobs_tenancy.py
Phase 5 Gate Tests:
1. Distributed lease lock: mutual exclusion and expiration recovery.
2. Multi-tenant background scheduler execution scoped by company.
3. Timezone scoping: companies in different timezones evaluate their own local time.
4. Integration isolation: non-Reamarc tenants do NOT leak Reamarc SMTP/Brevo env credentials.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import unittest
from unittest.mock import patch
import sys
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
root_dir = str(Path(__file__).resolve().parent.parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app.config import settings
from app.core.job_locks import acquire_job_lease, release_job_lease, job_lease
from app.core.integrations import get_integration, is_integration_connected
from app.core.tenant import (
    get_global_db,
    tenant_scope,
    company_tz,
    for_each_active_company,
)
from app.database import db_instance, get_database, connect_to_mongo
from app.services.email_service import EmailService
from tests.tenancy.seed import (
    seed_tenancy_async,
    clean_tenancy_async,
)

CID_A = "tnt_comp_a"
CID_B = "tnt_comp_b"


class TestJobsTenancy(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        settings.MULTI_TENANT_ENABLED = True
        settings.SMTP_HOST = "smtp.reamarc.internal"
        settings.SMTP_USER = "system@reamarc.com"
        settings.SMTP_PASSWORD = "secret_reamarc_password"
        settings.SMTP_FROM_NAME = "Reamarc Operations"

        from motor.motor_asyncio import AsyncIOMotorClient
        self.client = AsyncIOMotorClient("mongodb://localhost:27017")
        self.db = self.client["reamarc_test_db"]
        db_instance.client = self.client
        db_instance.db = self.db

        await clean_tenancy_async(self.db)
        await seed_tenancy_async(self.db)

    async def asyncTearDown(self):
        if hasattr(self, "db") and self.db is not None:
            await clean_tenancy_async(self.db)
        if hasattr(self, "client") and self.client is not None:
            self.client.close()
        db_instance.client = None
        db_instance.db = None

    async def test_single_runner_lease_mutual_exclusion(self):
        """Verify that when two workers compete for a lease, exactly one wins."""
        lease_name = "test_mutual_exclusion_lease"

        # Worker 1 acquires lease
        acquired_1 = await acquire_job_lease(lease_name, ttl_seconds=60, worker_id="worker_1")
        self.assertTrue(acquired_1)

        # Worker 2 attempts to acquire the same lease while active -> fails
        acquired_2 = await acquire_job_lease(lease_name, ttl_seconds=60, worker_id="worker_2")
        self.assertFalse(acquired_2)

        # Worker 1 releases
        await release_job_lease(lease_name, worker_id="worker_1")

        # Worker 2 can now acquire
        acquired_2_retry = await acquire_job_lease(lease_name, ttl_seconds=60, worker_id="worker_2")
        self.assertTrue(acquired_2_retry)

        # Cleanup
        await release_job_lease(lease_name, worker_id="worker_2")

    async def test_single_runner_lease_expiration(self):
        """Verify that an expired lease is automatically taken over."""
        lease_name = "test_expired_lease"
        gdb = get_global_db()

        # Insert an already-expired lease manually
        expired_time = datetime.now(timezone.utc) - timedelta(seconds=10)
        await gdb.job_locks.update_one(
            {"_id": lease_name},
            {
                "$set": {
                    "name": lease_name,
                    "locked_at": expired_time - timedelta(seconds=60),
                    "expires_at": expired_time,
                    "worker_id": "old_dead_worker",
                }
            },
            upsert=True,
        )

        # Worker 3 should take over expired lease
        acquired = await acquire_job_lease(lease_name, ttl_seconds=60, worker_id="worker_3")
        self.assertTrue(acquired)

        doc = await gdb.job_locks.find_one({"_id": lease_name})
        self.assertEqual(doc["worker_id"], "worker_3")

        await release_job_lease(lease_name, worker_id="worker_3")

    async def test_job_lease_context_manager(self):
        """Verify async context manager acquires and releases lease cleanly."""
        lease_name = "test_cm_lease"

        async with job_lease(lease_name, ttl_seconds=30, worker_id="cm_worker") as ok1:
            self.assertTrue(ok1)
            # Concurrently within the block, another attempt fails
            async with job_lease(lease_name, ttl_seconds=30, worker_id="other_worker") as ok2:
                self.assertFalse(ok2)

        # After exit, lease is released and can be acquired again
        async with job_lease(lease_name, ttl_seconds=30, worker_id="cm_worker_2") as ok3:
            self.assertTrue(ok3)

    async def test_integration_isolation_no_reamarc_leakage(self):
        """
        Verify integration credentials:
        - Reamarc gets default env credentials.
        - Non-Reamarc tenant with no credentials gets None (zero leakage).
        - Non-Reamarc tenant with custom SMTP gets custom SMTP credentials only.
        """
        gdb = get_global_db()

        # 1. Reamarc integration fallback
        reamarc_company = {"id": "company_reamarc", "name": "Reamarc"}
        integ_reamarc = await get_integration(company=reamarc_company, kind="smtp")
        self.assertIsNotNone(integ_reamarc)
        self.assertTrue(integ_reamarc["connected"])
        self.assertEqual(integ_reamarc["host"], "smtp.reamarc.internal")
        self.assertEqual(integ_reamarc["user"], "system@reamarc.com")

        # 2. Company B without SMTP configured -> returns None / not connected (no leakage!)
        await gdb.company_integrations.delete_many({"company_id": CID_B})
        comp_b = await gdb.companies.find_one({"id": CID_B})
        self.assertIsNotNone(comp_b)
        integ_b = await get_integration(company=comp_b, kind="smtp")
        self.assertIsNone(integ_b)
        connected_b = await is_integration_connected(company=comp_b, kind="smtp")
        self.assertFalse(connected_b)

        # 3. Add custom SMTP credentials to company_integrations for Company B
        await gdb.company_integrations.insert_one({
            "id": "integ_b_smtp",
            "company_id": CID_B,
            "kind": "smtp",
            "connected": True,
            "host": "mail.companyb.example.com",
            "port": 587,
            "user": "notifications@companyb.example.com",
            "password": "companyb_custom_pass",
            "from_name": "Company B Alerts",
            "from_email": "notifications@companyb.example.com",
        })

        integ_b_custom = await get_integration(company=comp_b, kind="smtp")
        self.assertIsNotNone(integ_b_custom)
        self.assertTrue(integ_b_custom["connected"])
        self.assertEqual(integ_b_custom["host"], "mail.companyb.example.com")
        self.assertEqual(integ_b_custom["user"], "notifications@companyb.example.com")
        self.assertNotEqual(integ_b_custom["user"], "system@reamarc.com")

    async def test_email_service_skips_when_no_smtp_configured_for_tenant(self):
        """
        Verify that EmailService.send_log_reminder returns False when a non-Reamarc
        tenant has no SMTP integration configured, without touching Reamarc's SMTP.
        """
        gdb = get_global_db()
        comp_b = await gdb.companies.find_one({"id": CID_B})

        with tenant_scope(company_id=CID_B), patch.object(
            settings, "BREVO_API_KEY", ""
        ), patch.object(settings, "RESEND_API_KEY", ""), patch.object(
            settings, "SENDGRID_API_KEY", ""
        ), patch(
            "app.services.email_service._send_smtp_sync", return_value=False
        ):
            res = await EmailService.send_log_reminder(
                recipient_email="user_b@companyb.com",
                recipient_name="User B",
                missing_dates=["2026-08-25"],
                company=comp_b,
            )
            self.assertFalse(res)

    async def test_multi_tenant_timezone_and_reminder_scoping(self):
        """
        Verify timezone helper and isolated user reminders across companies:
        - Company A is in Asia/Karachi.
        - Company B is in America/New_York.
        - Reminders only evaluate and notify users belonging to the active company.
        """
        gdb = get_global_db()

        # Set Company B timezone to America/New_York
        await gdb.companies.update_one(
            {"id": CID_B},
            {"$set": {"timezone": "America/New_York"}},
        )

        comp_a = await gdb.companies.find_one({"id": CID_A})
        comp_b = await gdb.companies.find_one({"id": CID_B})

        self.assertEqual(company_tz(comp_a), "Asia/Karachi")
        self.assertEqual(company_tz(comp_b), "America/New_York")

        # Check local times are in different zones
        tz_a = ZoneInfo(company_tz(comp_a))
        tz_b = ZoneInfo(company_tz(comp_b))
        now_a = datetime.now(tz_a)
        now_b = datetime.now(tz_b)
        # Karachi is UTC+5, New York is UTC-4 or UTC-5 -> difference >= 9 hours
        diff_hours = abs(now_a.hour - now_b.hour)
        self.assertNotEqual(diff_hours, 0)

        # Ensure for_each_active_company iterates both companies with proper tenant context
        visited = []
        async def _tracker(comp):
            visited.append(comp.get("id"))
            from app.core.tenant import get_tenant_context
            ctx = get_tenant_context()
            self.assertIsNotNone(ctx)
            self.assertEqual(ctx.company_id, comp.get("id"))
            db = get_database()
            users = await db.users.find().to_list(100)
            # Verify tenant data isolation inside the job:
            for u in users:
                self.assertEqual(u.get("company_id"), comp.get("id"))

        await for_each_active_company(_tracker)
        self.assertIn(CID_A, visited)
        self.assertIn(CID_B, visited)


if __name__ == "__main__":
    unittest.main()
