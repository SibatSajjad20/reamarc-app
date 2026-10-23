"""Serial collisions on create: auto serials from two members at once both succeed;
a typed serial that is already used gets a clear 409, not a 500.

Runs against a throwaway Mongo (MONGODB_DB_NAME must contain 'test')."""
from __future__ import annotations

import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "test-secret-key-serial-collision-0123")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.database import connect_to_mongo
from app.schemas.content_calendar import ContentCalendarItemCreate
from app.services import content_calendar_service as svc

TEST_DB = os.environ.get("SERIAL_TEST_DB", "reamarc_test_cc_serial")


class TestSerialCollision(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._old_db = settings.MONGODB_DB_NAME
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in settings.MONGODB_DB_NAME.lower() and settings.MONGODB_DB_NAME != "reamarc_db"
        await connect_to_mongo()
        from app.database import db_instance
        await db_instance.client.drop_database(TEST_DB)
        from app.core.tenant import TenantContext, TenantDB, set_tenant_context
        set_tenant_context(TenantContext(company_id="company_test_serial", user_id="u1"))
        self.db = TenantDB(db_instance.client[TEST_DB])
        svc._indexes_ready = False
        await svc.ensure_indexes(self.db)

    async def asyncTearDown(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", self._old_db)
        from app.database import db_instance
        await db_instance.client.drop_database(TEST_DB)
        db_instance.client.close()
        db_instance.client = None
        db_instance.db = None

    def scope(self):
        from app.core.tenant import TenantContext, set_tenant_context
        set_tenant_context(TenantContext(company_id="company_test_serial", user_id="u1"))

    async def test_two_auto_creates_at_once_both_succeed(self):
        self.scope()
        import asyncio
        a, b = await asyncio.gather(
            svc.create_item(self.db, ContentCalendarItemCreate(client_name="Acme", content_concept="A"), "u1", "U1"),
            svc.create_item(self.db, ContentCalendarItemCreate(client_name="Acme", content_concept="B"), "u2", "U2"),
        )
        self.assertNotEqual(a["serial"], b["serial"])

    async def test_typed_serial_already_used_is_409(self):
        from fastapi import HTTPException
        self.scope()
        await svc.create_item(self.db, ContentCalendarItemCreate(client_name="Acme", serial="AC-050", content_concept="A"), "u1", "U1")
        with self.assertRaises(HTTPException) as cm:
            await svc.create_item(self.db, ContentCalendarItemCreate(client_name="Acme", serial="AC-050", content_concept="B"), "u2", "U2")
        self.assertEqual(cm.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
