"""Scheduler: Karachi time, reminders, overdue digest, dedupe, recurrence."""
from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

from mongomock_motor import AsyncMongoMockClient

from app.core.tenant import TenantDB
from app.services.task_due_scheduler import run_task_due_tick
from tests.task_manager.conftest import LEAD_CONTENT, MEMBER_C1


KARACHI = ZoneInfo("Asia/Karachi")


class SchedulerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self.db = TenantDB(self.raw)
        self.company = {"id": "company_reamarc", "timezone": "Asia/Karachi"}
        self.claims = set()

        async def claim(uid, date_str, kind):
            key = (uid, date_str, kind)
            if key in self.claims:
                return False
            self.claims.add(key)
            return True

        self._claim = patch("app.services.task_due_scheduler._claim", side_effect=claim)
        self._claim.start()
        self._dispatch = patch("app.services.task_due_scheduler.dispatch_task_event", new_callable=AsyncMock)
        self.mocked = self._dispatch.start()
        self._log = patch("app.services.task_due_scheduler.log_task_activity", new_callable=AsyncMock)
        self._log.start()
        self._spawn = patch("app.services.task_due_scheduler.maybe_spawn_recurrence", new_callable=AsyncMock, return_value={"id": "tsk_next"})
        self._spawn.start()

    async def asyncTearDown(self):
        patch.stopall()

    async def _insert(self, **kwargs):
        doc = {
            "id": kwargs.get("id", "tsk_due"),
            "serial": "T-0099",
            "title": "Due task",
            "status": "todo",
            "assignee_id": MEMBER_C1["id"],
            "assigner_id": LEAD_CONTENT["id"],
            "creator_id": LEAD_CONTENT["id"],
            "reminder_offsets": [1440],
            "last_overdue_notified_on": None,
            "recurrence": None,
            "recurrence_source_id": None,
        }
        doc.update(kwargs)
        await self.raw.tasks.insert_one(doc)
        return doc

    async def test_due_today_at_nine_local_not_utc(self):
        await self._insert(due_date="2026-11-10", due_time=None)
        # 09:00 Asia/Karachi = 04:00 UTC
        now = datetime(2026, 11, 10, 9, 0, tzinfo=KARACHI)
        stats = await run_task_due_tick(self.db, company=self.company, now=now)
        self.assertEqual(stats["due_today"], 1)
        utc_morning = datetime(2026, 11, 10, 0, 30, tzinfo=KARACHI)
        self.mocked.reset_mock()
        stats2 = await run_task_due_tick(self.db, company=self.company, now=utc_morning)
        self.assertEqual(stats2["due_today"], 0)

    async def test_overdue_and_dedupe_second_tick(self):
        await self._insert(due_date="2026-11-09", due_time="12:00")
        now = datetime(2026, 11, 10, 10, 0, tzinfo=KARACHI)
        stats = await run_task_due_tick(self.db, company=self.company, now=now)
        self.assertEqual(stats["overdue"], 1)
        stats2 = await run_task_due_tick(self.db, company=self.company, now=now)
        self.assertEqual(stats2["overdue"], 0)

    async def test_daily_digest_after_first_day(self):
        await self._insert(due_date="2026-11-08", last_overdue_notified_on="2026-11-09")
        now = datetime(2026, 11, 10, 10, 0, tzinfo=KARACHI)
        stats = await run_task_due_tick(self.db, company=self.company, now=now)
        self.assertEqual(stats["overdue"], 0)
        self.assertGreaterEqual(stats["digests"], 1)

    async def test_24h_and_1h_reminders_once_in_karachi(self):
        await self._insert(id="tsk_rem", due_date="2026-11-11", due_time="10:00")
        now_24 = datetime(2026, 11, 10, 10, 5, tzinfo=KARACHI)
        stats = await run_task_due_tick(self.db, company=self.company, now=now_24)
        self.assertEqual(stats["reminders"], 1)
        stats2 = await run_task_due_tick(self.db, company=self.company, now=now_24)
        self.assertEqual(stats2["reminders"], 0)
        now_1h = datetime(2026, 11, 11, 9, 5, tzinfo=KARACHI)
        stats3 = await run_task_due_tick(self.db, company=self.company, now=now_1h)
        self.assertEqual(stats3["reminders"], 1)
        stats4 = await run_task_due_tick(self.db, company=self.company, now=now_1h)
        self.assertEqual(stats4["reminders"], 0)

    async def test_reminder_dedupe_crosses_local_midnight(self):
        await self._insert(id="tsk_mid", due_date="2026-11-11", due_time="10:00")
        before = datetime(2026, 11, 10, 23, 0, tzinfo=KARACHI)
        after = datetime(2026, 11, 11, 0, 15, tzinfo=KARACHI)
        stats = await run_task_due_tick(self.db, company=self.company, now=before)
        self.assertEqual(stats["reminders"], 1)
        stats2 = await run_task_due_tick(self.db, company=self.company, now=after)
        self.assertEqual(stats2["reminders"], 0)

    async def test_recurrence_spawns_when_date_arrives(self):
        await self._insert(
            id="tsk_rec",
            due_date="2026-11-09",
            recurrence={"freq": "daily", "interval": 1},
            recurrence_source_id=None,
            status="todo",
        )
        now = datetime(2026, 11, 10, 10, 0, tzinfo=KARACHI)
        stats = await run_task_due_tick(self.db, company=self.company, now=now)
        self.assertGreaterEqual(stats["recurrence"], 1)
