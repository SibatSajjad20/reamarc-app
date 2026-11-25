"""Per-request lookups must not repeat per employee / per notification kind.

In-memory mongomock only: no network, no real database.
"""
from __future__ import annotations

import os
import unittest
from unittest import mock

from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("SECRET_KEY", "test-request-lookup-counts-secret-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"

from app.config import settings

CID = "company_lookup_counts"
DAY = "2026-11-18"  # Wednesday


def _user(uid: str, role: str = "team_member") -> dict:
    return {
        "id": uid,
        "email": f"{uid}@lookup-test.com",
        "full_name": uid,
        "name": uid,
        "role": role,
        "is_active": True,
        "company_id": CID,
        "department": "Content",
        "departments": ["Content"],
        "primary_department": "Content",
        "joining_date": "2026-09-01",
        "workspace_ids": [],
        "access": {"attendance": True, "tasks": True, "daily_log": True},
    }


class _DBCase(unittest.IsolatedAsyncioTestCase):
    employees = 6

    async def asyncSetUp(self):
        from app.database import db_instance
        from app.core.tenant import TenantContext, set_tenant_context, reset_tenant_context

        for p in (
            mock.patch.object(settings, "MULTI_COMPANY_ENABLED", False),
            mock.patch.object(db_instance, "client", None),
            mock.patch.object(db_instance, "db", AsyncMongoMockClient()["reamarc_test_lookup_counts"]),
        ):
            p.start()
            self.addCleanup(p.stop)
        self.raw = db_instance.db
        tok = set_tenant_context(TenantContext(company_id=CID))
        self.addCleanup(reset_tenant_context, tok)
        await self.raw.companies.insert_one({"id": CID, "name": CID, "slug": CID, "status": "active"})
        self.users = [_user("lc_admin", "admin")] + [_user(f"lc_e{i}") for i in range(self.employees)]
        await self.raw.users.insert_many([dict(u) for u in self.users])
        await self.raw.company_calendar.insert_one(
            {"id": "cal1", "company_id": CID, "date": DAY, "event_type": "relaxed_day", "title": "Cricket",
             "leave_from": "16:00", "exclude_wfh": True}
        )
        for u in self.users[1:]:
            await self.raw.attendance_records.insert_one(
                {"id": f"att_{u['id']}", "company_id": CID, "user_id": u["id"], "date": DAY, "status": "present",
                 "check_in": f"{DAY}T08:30:00+05:00", "check_out": f"{DAY}T16:10:00+05:00"}
            )

    def _count_binds(self):
        from app.services import attendance_service as svc

        real = svc.bind_relaxed_days
        calls = []

        async def counting(start, end):
            calls.append((start, end))
            return await real(start, end)

        return mock.patch.object(svc, "bind_relaxed_days", counting), calls


class TestMatrixRelaxedLookup(_DBCase):
    async def test_matrix_reads_relaxed_days_once_not_per_employee(self):
        from app.core.hot_cache import clear_matrix_cache
        from app.services import attendance_service as svc

        clear_matrix_cache()
        patcher, calls = self._count_binds()
        with patcher:
            res = await svc.get_daily_matrix(DAY)
        self.assertEqual(len({r.user_id for r in res.rows} & {u["id"] for u in self.users[1:]}), self.employees)
        self.assertEqual(calls, [(DAY, DAY)])


class TestMatrixParity(_DBCase):
    async def test_matrix_rows_match_per_row_lookup(self):
        """Same rows as the old path that re-read the calendar for every employee."""
        from app.core.hot_cache import clear_matrix_cache
        from app.services import attendance_service as svc

        real_heal = svc._heal_overtime_request_for_record

        async def old_heal(user, rec, shift, relaxed_for=None):
            return await real_heal(user, rec, shift)

        snapshot = [d async for d in self.raw.attendance_records.find({}, {"_id": 0})]
        clear_matrix_cache()
        with mock.patch.object(svc, "_heal_overtime_request_for_record", old_heal):
            old = (await svc.get_daily_matrix(DAY)).model_dump()
        await self.raw.attendance_records.delete_many({})
        await self.raw.overtime_requests.delete_many({})
        await self.raw.attendance_records.insert_many([dict(d) for d in snapshot])
        clear_matrix_cache()
        new = (await svc.get_daily_matrix(DAY)).model_dump()
        for payload in (old, new):
            payload.pop("generated_at", None)
        self.assertEqual(old, new)


class TestTodayRelaxedLookup(_DBCase):
    async def test_today_reads_relaxed_days_once(self):
        from app.services import attendance_service as svc

        patcher, calls = self._count_binds()
        with patcher:
            await svc.get_today_status(dict(self.users[1]), DAY)
        self.assertEqual(calls, [(DAY, DAY)])

    async def test_today_while_checked_in_reads_relaxed_days_once(self):
        from app.services import attendance_service as svc

        uid = self.users[2]["id"]
        await self.raw.attendance_records.update_one({"user_id": uid}, {"$unset": {"check_out": ""}})
        patcher, calls = self._count_binds()
        with patcher:
            res = await svc.get_today_status(dict(self.users[2]), DAY)
        self.assertTrue(res.can_punch_out)
        self.assertEqual(calls, [(DAY, DAY)])


class TestInboxLookups(_DBCase):
    async def test_inbox_reads_recipient_and_task_settings_once(self):
        from app.services import push_service, task_service

        uid = self.users[1]["id"]
        kinds = ["task_assigned", "task_comment", "task_stage", "task_due", "attendance_reminder",
                 "leave_update", "daily_log_reminder", "admin_alert"]
        await self.raw.mobile_notifications.insert_many(
            [{"id": f"n{i}", "company_id": CID, "user_id": uid, "kind": kinds[i % len(kinds)], "title": "t",
              "body": "b", "read": False, "created_at": f"2026-11-18T10:{i:02d}:00+00:00"} for i in range(40)]
        )
        real_users = push_service.company_member_users
        real_settings = task_service.get_task_settings
        counts = {"users": 0, "settings": 0}

        async def users(*a, **k):
            counts["users"] += 1
            return await real_users(*a, **k)

        async def task_settings(*a, **k):
            counts["settings"] += 1
            return await real_settings(*a, **k)

        with (
            mock.patch.object(push_service, "company_member_users", users),
            mock.patch.object(task_service, "get_task_settings", task_settings),
        ):
            rows = await push_service.list_notifications(uid)
        self.assertTrue(rows)
        self.assertEqual(counts, {"users": 1, "settings": 1})


if __name__ == "__main__":
    unittest.main()
