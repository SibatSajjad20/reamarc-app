"""Throwaway-DB coverage for HR/Ops/Admin attendance and request gates."""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

TEST_DB = os.getenv("TEST_MONGODB_DB_NAME", "reamarc_no_self_attendance_test")
assert "test" in TEST_DB.lower(), "FATAL: Not using a test database"
assert TEST_DB != "reamarc_db", "FATAL: Attempted to run on production database"
assert "reamarc_db" not in TEST_DB

os.environ["MONGODB_DB_NAME"] = TEST_DB

from fastapi import HTTPException
import httpx

from app.config import settings
from app.core.security import create_access_token
from app.database import close_mongo_connection, connect_to_mongo, get_database
from app.main import app
from app.services.attendance_permissions import can_change_attendance, can_review_request

API = "/api/v1"
DATE = "2026-10-20"

USERS = {
    "hr1": {
        "id": "hr1",
        "email": "hr1@test.local",
        "full_name": "HR One",
        "name": "HR One",
        "role": "hr",
        "department": "HR",
        "primary_department": "HR",
        "is_active": True,
        "access": {"attendance": True, "daily_log": True},
    },
    "ops1": {
        "id": "ops1",
        "email": "ops1@test.local",
        "full_name": "Ops One",
        "name": "Ops One",
        "role": "operations",
        "department": "operations",
        "primary_department": "operations",
        "is_active": True,
        "access": {"attendance": True, "daily_log": False},
    },
    "admin1": {
        "id": "admin1",
        "email": "admin1@test.local",
        "full_name": "Admin One",
        "name": "Admin One",
        "role": "admin",
        "department": "operations",
        "primary_department": "operations",
        "is_active": True,
        "access": {"attendance": True, "daily_log": True},
    },
    "tm1": {
        "id": "tm1",
        "email": "tm1@test.local",
        "full_name": "Team Member One",
        "name": "Team Member One",
        "role": "team_member",
        "department": "content",
        "primary_department": "content",
        "is_active": True,
        "access": {"attendance": True, "daily_log": True},
    },
}


def _token(user: dict) -> str:
    return create_access_token({"sub": user["id"], "email": user["email"]})


class TestNoSelfAttendance(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in settings.MONGODB_DB_NAME.lower()
        assert settings.MONGODB_DB_NAME != "reamarc_db"
        await connect_to_mongo()
        self.db = get_database()
        self.assertIsNotNone(self.db)
        self.assertEqual(self.db.name, TEST_DB)

        from app.core.limiter import limiter

        limiter.enabled = False
        if hasattr(app.state, "limiter"):
            app.state.limiter.enabled = False

        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

        await self.db.users.delete_many({"id": {"$in": list(USERS.keys())}})
        await self.db.leave_requests.delete_many({"id": {"$regex": "^lr_test_"}})
        await self.db.attendance_records.delete_many({"user_id": {"$in": list(USERS.keys())}})
        await self.db.daily_log_day_scores.delete_many({"user_id": {"$in": list(USERS.keys())}})
        await self.db.users.insert_many(list(USERS.values()))
        await self.db.leave_requests.insert_many(
            [
                {
                    "id": "lr_test_tm1",
                    "user_id": "tm1",
                    "user_name": "Team Member One",
                    "user_role": "team_member",
                    "leave_type": "wfh",
                    "start_date": DATE,
                    "end_date": DATE,
                    "reason": "WFH",
                    "status": "pending",
                },
                {
                    "id": "lr_test_ops1",
                    "user_id": "ops1",
                    "user_name": "Ops One",
                    "user_role": "operations",
                    "leave_type": "wfh",
                    "start_date": DATE,
                    "end_date": DATE,
                    "reason": "WFH",
                    "status": "pending",
                },
                {
                    "id": "lr_test_hr1",
                    "user_id": "hr1",
                    "user_name": "HR One",
                    "user_role": "hr",
                    "leave_type": "wfh",
                    "start_date": DATE,
                    "end_date": DATE,
                    "reason": "WFH",
                    "status": "pending",
                },
                {
                    "id": "lr_test_ops_own",
                    "user_id": "ops1",
                    "user_name": "Ops One",
                    "user_role": "operations",
                    "leave_type": "wfh",
                    "start_date": "2026-10-21",
                    "end_date": "2026-10-21",
                    "reason": "own",
                    "status": "pending",
                },
                {
                    "id": "lr_test_hr_own",
                    "user_id": "hr1",
                    "user_name": "HR One",
                    "user_role": "hr",
                    "leave_type": "wfh",
                    "start_date": "2026-10-21",
                    "end_date": "2026-10-21",
                    "reason": "own",
                    "status": "pending",
                },
            ]
        )

    async def asyncTearDown(self):
        if getattr(self, "db", None) is not None:
            await self.db.users.delete_many({"id": {"$in": list(USERS.keys())}})
            await self.db.leave_requests.delete_many({"id": {"$regex": "^lr_test_"}})
            await self.db.attendance_records.delete_many({"user_id": {"$in": list(USERS.keys())}})
            await self.db.daily_log_day_scores.delete_many({"user_id": {"$in": list(USERS.keys())}})
        if getattr(self, "client", None) is not None:
            await self.client.aclose()
        await close_mongo_connection()

    def _auth(self, user_id: str) -> dict:
        return {"Authorization": f"Bearer {_token(USERS[user_id])}"}

    async def _manual_entry(self, actor: str, target: str):
        return await self.client.post(
            f"{API}/attendance/admin/manual-entry",
            headers=self._auth(actor),
            json={
                "user_id": target,
                "date": DATE,
                "check_in": "09:30",
                "check_out": "18:30",
                "status": "present",
                "notes": "test override",
            },
        )

    async def _review(self, actor: str, request_id: str):
        return await self.client.patch(
            f"{API}/leaves/requests/{request_id}/status",
            headers=self._auth(actor),
            json={"status": "approved", "review_comments": "ok"},
        )

    async def test_attendance_and_request_gates_and_recompute(self):
        self.assertEqual((await self._manual_entry("hr1", "tm1")).status_code, 200)
        self.assertEqual((await self._manual_entry("hr1", "ops1")).status_code, 200)
        self.assertEqual((await self._manual_entry("hr1", "hr1")).status_code, 403)

        self.assertEqual((await self._manual_entry("ops1", "tm1")).status_code, 403)
        self.assertEqual((await self._manual_entry("ops1", "ops1")).status_code, 403)
        self.assertEqual((await self._manual_entry("ops1", "hr1")).status_code, 403)

        self.assertEqual((await self._manual_entry("admin1", "hr1")).status_code, 200)
        self.assertEqual((await self._manual_entry("admin1", "admin1")).status_code, 403)

        rec = await self.db.attendance_records.find_one({"user_id": "tm1", "date": DATE})
        self.assertTrue(rec and rec.get("id"))
        override = await self.client.patch(
            f"{API}/attendance/records/{rec['id']}/override",
            headers=self._auth("hr1"),
            json={
                "date": DATE,
                "punch_in": "09:35",
                "punch_out": "18:30",
                "status": "present",
                "notes": "record override",
            },
        )
        self.assertEqual(override.status_code, 200, override.text)

        score = await self.db.daily_log_day_scores.find_one({"user_id": "tm1", "date": DATE})
        self.assertIsNotNone(score)
        self.assertEqual(score.get("role"), "team_member")

        self.assertEqual((await self._review("ops1", "lr_test_tm1")).status_code, 200)
        self.assertEqual((await self._review("ops1", "lr_test_ops_own")).status_code, 403)
        self.assertEqual((await self._review("ops1", "lr_test_hr1")).status_code, 403)
        self.assertEqual((await self._review("hr1", "lr_test_ops1")).status_code, 200)
        self.assertEqual((await self._review("hr1", "lr_test_hr_own")).status_code, 403)
        self.assertEqual((await self._review("admin1", "lr_test_hr1")).status_code, 200)


class TestNoSelfAttendanceHelpers(unittest.TestCase):
    def test_permission_helpers_raise_403(self):
        hr = USERS["hr1"]
        ops = USERS["ops1"]
        admin = USERS["admin1"]
        tm = USERS["tm1"]

        self.assertTrue(can_change_attendance(hr, tm))
        self.assertTrue(can_change_attendance(hr, ops))
        with self.assertRaises(HTTPException) as ctx:
            can_change_attendance(hr, hr)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("own attendance", str(ctx.exception.detail))

        for target in (tm, ops, hr):
            with self.assertRaises(HTTPException) as ctx:
                can_change_attendance(ops, target)
            self.assertEqual(ctx.exception.status_code, 403)

        self.assertTrue(can_change_attendance(admin, hr))
        with self.assertRaises(HTTPException) as ctx:
            can_change_attendance(admin, admin)
        self.assertEqual(ctx.exception.status_code, 403)

        self.assertTrue(can_review_request(ops, tm))
        with self.assertRaises(HTTPException) as ctx:
            can_review_request(ops, ops)
        self.assertEqual(ctx.exception.status_code, 403)
        with self.assertRaises(HTTPException) as ctx:
            can_review_request(ops, hr)
        self.assertEqual(ctx.exception.status_code, 403)

        self.assertTrue(can_review_request(hr, ops))
        with self.assertRaises(HTTPException) as ctx:
            can_review_request(hr, hr)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertTrue(can_review_request(admin, hr))
