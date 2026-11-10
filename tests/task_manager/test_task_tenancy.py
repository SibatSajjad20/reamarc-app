"""Tenancy isolation and no raw DB in new task modules."""
from __future__ import annotations

import unittest
from pathlib import Path

from mongomock_motor import AsyncMongoMockClient

from app.core.tenant import TENANT_COLLECTIONS, TenantDB, tenant_scope
from app.database import db_instance
from app.services import task_service
from tests.task_manager.conftest import LEAD_CONTENT, MEMBER_C1


class TaskTenancyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        self.db = TenantDB(self.raw)
        await self.raw.users.insert_one(dict(LEAD_CONTENT))
        await self.raw.users.insert_one(dict(MEMBER_C1))

    async def asyncTearDown(self):
        db_instance.db = self._prev

    async def test_collections_registered(self):
        for name in (
            "tasks",
            "task_comments",
            "task_attachments",
            "task_activities",
            "task_counters",
            "task_settings",
            "task_saved_views",
            "task_reads",
        ):
            self.assertIn(name, TENANT_COLLECTIONS)

    async def test_other_company_task_not_visible(self):
        from unittest.mock import AsyncMock, patch
        from fastapi import HTTPException
        from app.config import settings

        object.__setattr__(settings, "MULTI_TENANT_ENABLED", True)
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)
        try:
            with tenant_scope(company_id="company_a"):
                await self.db.users.delete_many({})
                await self.db.users.insert_one({**LEAD_CONTENT, "company_id": "company_a"})
                await self.db.users.insert_one({**MEMBER_C1, "company_id": "company_a"})
                with patch("app.services.task_notifications.notify_assigned", new_callable=AsyncMock):
                    created = await task_service.create_task(
                        self.db, {"title": "A only", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT
                    )
            with tenant_scope(company_id="company_b"):
                with self.assertRaises(HTTPException) as ctx:
                    await task_service.get_task(self.db, created["id"], LEAD_CONTENT)
                self.assertEqual(ctx.exception.status_code, 404)
        finally:
            object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
            object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)


class TestNoRawDbInTaskCode(unittest.TestCase):
    def test_new_task_modules_do_not_call_get_global_db(self):
        root = Path(__file__).resolve().parents[2] / "backend" / "app"
        files = [
            root / "services" / "task_service.py",
            root / "services" / "task_comments.py",
            root / "services" / "task_attachments.py",
            root / "services" / "task_activity.py",
            root / "services" / "task_notifications.py",
            root / "services" / "task_due_scheduler.py",
            root / "services" / "task_chat.py",
            root / "routers" / "tasks.py",
        ]
        for path in files:
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("get_global_db", text, msg=str(path))
            self.assertNotIn("AsyncIOMotorClient", text, msg=str(path))
            self.assertNotIn("db_instance.db", text, msg=str(path))
