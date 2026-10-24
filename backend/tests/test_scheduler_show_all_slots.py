"""Public scheduler returns every working-hours slot with a status; unbookable ones are rejected.

Throwaway Mongo only (name contains 'test'); outbound network blocked; clock frozen at 11:57 PKT.
"""
from __future__ import annotations

import os
import socket
import sys
import unittest
from datetime import datetime as _real_dt, timezone
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test-secret-key-scheduler-slots-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException

from app.config import settings
from app.database import connect_to_mongo

TEST_DB = "reamarc_test_scheduler_slots"
CID = "company_test_sched"
DAY = "2026-10-24"  # Saturday
FROZEN = _real_dt(2026, 10, 24, 6, 57, tzinfo=timezone.utc)  # 11:57 PKT

_real_connect = socket.socket.connect


def _loopback_only(self, addr, *a, **k):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *a, **k)
    raise OSError("outbound blocked in tests")


class _FrozenDT(_real_dt):
    @classmethod
    def now(cls, tz=None):
        return FROZEN.astimezone(tz) if tz else FROZEN.replace(tzinfo=None)


class TestSchedulerShowAllSlots(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        for p in (
            mock.patch.object(socket.socket, "connect", new=_loopback_only),
            mock.patch.object(settings, "MULTI_COMPANY_ENABLED", True),
            mock.patch("app.services.crm_scheduler.datetime", _FrozenDT),
        ):
            p.start()
            self.addCleanup(p.stop)
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in TEST_DB
        await connect_to_mongo()
        from app.database import db_instance
        from app.core.tenant import TenantContext, set_tenant_context, reset_tenant_context

        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        await self.db.companies.insert_one({"id": CID, "name": "Sched Co", "slug": "sched", "status": "active"})
        tok = set_tenant_context(TenantContext(company_id=CID))
        self.addCleanup(reset_tenant_context, tok)
        await self.db.crm_scheduler_settings.insert_one({
            "key": "crm_scheduler_settings", "company_id": CID, "start_hour": "11:00", "end_hour": "23:00",
            "duration_minutes": 30, "working_days": [1, 2, 3, 4, 5, 6], "notice_hours": 1,
            "timezone": "Asia/Karachi", "max_days_advance": 30,
        })
        await self.db.crm_leads.insert_one({
            "id": "lead_secret", "company_id": CID, "name": "Secret Person", "email": "secret@example.com",
            "meeting": {"status": "scheduled", "date": DAY, "slot_time": "15:00"},
        })

    async def asyncTearDown(self):
        from app.database import db_instance

        await db_instance.client.drop_database(TEST_DB)
        db_instance.client = None
        db_instance.db = None

    async def test_every_working_slot_is_returned_with_status(self):
        from app.services.crm_scheduler import get_available_slots

        res = await get_available_slots(DAY)
        slots = {s["time"]: s for s in res["slots"]}
        self.assertEqual(len(slots), 24)
        self.assertEqual(min(slots), "11:00")
        self.assertEqual(max(slots), "22:30")
        expect = {"11:00": "passed", "11:30": "passed", "12:00": "too_soon", "12:30": "too_soon",
                  "13:00": "available", "15:00": "booked", "22:30": "available"}
        for t, st in expect.items():
            self.assertEqual(slots[t].get("status"), st, t)
            self.assertEqual(slots[t]["available"], st == "available", t)
        self.assertEqual(slots["15:00"]["reason"], "Booked")
        self.assertEqual(slots["11:00"]["reason"], "Passed")
        self.assertEqual(slots["12:00"]["reason"], "Too soon")

    async def test_booked_slot_leaks_nothing_about_booker(self):
        from app.services.crm_scheduler import get_available_slots

        res = await get_available_slots(DAY)
        booked = next(s for s in res["slots"] if s["time"] == "15:00")
        self.assertEqual(set(booked), {"time", "label", "iso_start", "iso_end", "available", "status", "reason"})
        self.assertNotIn("Secret", str(res))
        self.assertNotIn("secret@", str(res))
        self.assertNotIn("lead_secret", str(res))

    async def test_booking_unbookable_slots_is_rejected(self):
        from app.services.crm_scheduler import book_meeting

        base = {"name": "Sara Ahmed", "email": "v@example.com", "phone": "+923001234567", "date": DAY}
        for t, word in (("11:00", "passed"), ("12:00", "too soon"), ("15:00", "booked")):
            with self.assertRaises(HTTPException) as cm:
                await book_meeting(dict(base, slot_time=t, time=t))
            self.assertEqual(cm.exception.status_code, 409, (t, cm.exception.detail))
            self.assertIn(word, str(cm.exception.detail).lower(), t)
            self.assertNotIn("Secret", str(cm.exception.detail))
        self.assertEqual(await self.db.crm_leads.count_documents({}), 1)


if __name__ == "__main__":
    unittest.main()
