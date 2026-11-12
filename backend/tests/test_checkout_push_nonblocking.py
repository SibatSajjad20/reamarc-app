"""Check-out must persist before Expo/web-push fan-out.

The 15s browser timeout showed "Request timed out" while overtime check-out
awaited staff push. Gates (overtime / undertime / WFH) must still hold.
"""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret-key-checkout-push-0123456789")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException

from app.schemas.attendance import CheckOutRequest, SecuritySettingsSchema
from app.schemas.shift import ShiftResponse
from app.services import attendance_service as svc
from app.services.attendance_security import PunchSecurityResult
from app.models.attendance import LeaveType, LeaveStatus


def _shift() -> ShiftResponse:
    return ShiftResponse(
        id="shift_std",
        name="Standard",
        start_time="09:30",
        end_time="18:30",
        break_duration_minutes=60,
        grace_period_minutes=15,
        overtime_buffer_minutes=5,
        undertime_buffer_minutes=5,
        expected_hours=8.0,
        is_night_shift=False,
        is_active=True,
    )


def _user(**overrides):
    base = {
        "id": "emp_ot_1",
        "full_name": "Overtime Emp",
        "name": "Overtime Emp",
        "department": "Engineering",
        "role": "team_member",
        "is_active": True,
        "company_id": "company_reamarc",
    }
    base.update(overrides)
    return base


def _open_record(*, is_wfh: bool = False, is_short_leave: bool = False) -> dict:
    return {
        "id": "att_emp_ot_1_2026-11-11",
        "user_id": "emp_ot_1",
        "user_name": "Overtime Emp",
        "employee_name": "Overtime Emp",
        "department": "Engineering",
        "date": "2026-11-11",
        "shift_id": "shift_std",
        "shift_name": "Standard",
        "check_in": "09:35",
        "punch_in": "09:35",
        "check_out": None,
        "punch_out": None,
        "break_minutes": 60,
        "is_wfh": is_wfh,
        "is_short_leave": is_short_leave,
        "short_leave_hours": 2.0 if is_short_leave else 0.0,
        "is_missed_punch": False,
        "status": "wfh" if is_wfh else ("short_leave" if is_short_leave else "present"),
        "late_minutes": 0,
        "is_late": False,
        "late_strike": 0,
        "ip_verified": True,
        "gps_verified": False,
        "check_in_ip": "127.0.0.1",
        "company_id": "company_reamarc",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


class FakeAttendanceRecords:
    def __init__(self, rec: dict):
        self.rec = rec
        self.updated = False

    async def find_one(self, *args, **kwargs):
        return dict(self.rec)

    async def find_one_and_update(self, filt, update, **kwargs):
        self.updated = True
        self.rec = {**self.rec, **(update.get("$set") or {})}
        return dict(self.rec)


def _ok_security():
    settings = SecuritySettingsSchema(
        enforce_ip_whitelist=False,
        enforce_gps_geofence=False,
        office_latitude=31.5,
        office_longitude=74.3,
        geofence_radius_meters=300,
    )
    ok = PunchSecurityResult(
        authorized=True,
        error=None,
        ip_verified=True,
        gps_verified=False,
        distance_meters=0.0,
        client_ip="127.0.0.1",
    )
    return settings, ok


class TestScheduleBackground(unittest.IsolatedAsyncioTestCase):
    async def test_does_not_wait_for_slow_coro(self):
        gate = asyncio.Event()

        async def hang():
            await gate.wait()

        started = time_monotonic()
        svc._schedule_background(hang(), what="test")
        elapsed = time_monotonic() - started
        self.assertLess(elapsed, 0.25)
        gate.set()
        await asyncio.sleep(0)


def time_monotonic() -> float:
    return asyncio.get_running_loop().time()


class TestUpsertOvertimeSkipsPush(unittest.IsolatedAsyncioTestCase):
    async def test_insert_does_not_dispatch_push(self):
        db = MagicMock()
        db.leave_requests.find_one = AsyncMock(return_value=None)
        db.leave_requests.insert_one = AsyncMock()
        dispatch = AsyncMock()
        get_hr = AsyncMock(return_value=["hr_1"])
        with patch.object(svc, "get_database", return_value=db), patch.object(
            svc.push_service, "dispatch_to_users", dispatch
        ), patch.object(svc.push_service, "get_hr_and_ops_user_ids", get_hr):
            req_id = await svc._upsert_overtime_request(
                user=_user(),
                date_str="2026-11-11",
                reason="Working on Apex and DataViz",
                category=None,
                overtime_minutes=75,
                shift_end="18:30",
                check_out="19:45",
            )
        self.assertTrue(req_id)
        db.leave_requests.insert_one.assert_awaited()
        dispatch.assert_not_awaited()
        get_hr.assert_not_awaited()
        inserted = db.leave_requests.insert_one.await_args.args[0]
        self.assertEqual(inserted["leave_type"], LeaveType.OVERTIME.value)
        self.assertEqual(inserted["status"], LeaveStatus.PENDING.value)
        self.assertEqual(inserted["reason"], "Working on Apex and DataViz")


class TestCheckoutGatesAndNonblockingPush(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.hang_gate = asyncio.Event()
        self.records = FakeAttendanceRecords(_open_record())
        self.db = MagicMock()
        self.db.attendance_records = self.records
        self.settings, self.ok = _ok_security()
        self.upsert = AsyncMock(return_value="leave_ot_test")
        self.staff_push = AsyncMock(side_effect=self._hang)
        self.ot_push = AsyncMock(side_effect=self._hang)

    async def _hang(self, *args, **kwargs):
        await self.hang_gate.wait()

    async def asyncTearDown(self):
        self.hang_gate.set()
        await asyncio.sleep(0)

    def _patches(self, *, auto_wfh: bool = False):
        return (
            patch.object(svc, "get_database", return_value=self.db),
            patch("app.services.device_registry.enforce_mobile_punch", new=AsyncMock(return_value=None)),
            patch.object(svc, "get_shift_for_user", new=AsyncMock(return_value=_shift())),
            patch.object(svc, "is_auto_wfh_for_date", new=AsyncMock(return_value=auto_wfh)),
            patch.object(svc, "get_security_settings", new=AsyncMock(return_value=self.settings)),
            patch.object(svc, "validate_punch_security", return_value=self.ok),
            patch.object(svc, "bind_relaxed_days", new=AsyncMock(return_value={})),
            patch.object(svc, "extra_for_record", return_value={}),
            patch.object(svc, "_upsert_overtime_request", self.upsert),
            patch.object(svc, "_notify_staff_punch_event", self.staff_push),
            patch.object(svc, "_notify_overtime_request_submitted", self.ot_push),
            patch("app.services.log_compliance.recompute_day_score", new=AsyncMock(return_value=None)),
        )

    async def _checkout(self, req: CheckOutRequest, *, time: str, auto_wfh: bool = False):
        patches = self._patches(auto_wfh=auto_wfh)
        for p in patches:
            p.start()
        try:
            return await asyncio.wait_for(
                svc.process_check_out(
                    _user(),
                    req,
                    custom_date="2026-11-11",
                    custom_time=time,
                    client_ip="127.0.0.1",
                ),
                timeout=1.5,
            )
        finally:
            for p in patches:
                p.stop()

    async def test_overtime_without_reason_rejected_and_not_written(self):
        req = CheckOutRequest(notes="Shift check-out", detected_public_ip="127.0.0.1")
        with self.assertRaises(HTTPException) as ctx:
            await self._checkout(req, time="19:45")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("reason for overtime", str(ctx.exception.detail).lower())
        self.assertFalse(self.records.updated)
        self.upsert.assert_not_awaited()
        self.staff_push.assert_not_called()
        self.ot_push.assert_not_called()

    async def test_undertime_without_reason_rejected_and_not_written(self):
        req = CheckOutRequest(notes="Shift check-out", detected_public_ip="127.0.0.1")
        with self.assertRaises(HTTPException) as ctx:
            await self._checkout(req, time="16:00")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("leaving early", str(ctx.exception.detail).lower())
        self.assertFalse(self.records.updated)
        self.upsert.assert_not_awaited()

    async def test_overtime_with_reason_returns_before_push_finishes(self):
        req = CheckOutRequest(
            notes="Shift check-out",
            detected_public_ip="127.0.0.1",
            variance_reason="Working on Apex and DataViz",
        )
        out = await self._checkout(req, time="19:45")
        self.assertEqual(out.check_out, "19:45")
        self.assertTrue(self.records.updated)
        self.assertEqual(self.records.rec.get("overtime_reason"), "Working on Apex and DataViz")
        self.upsert.assert_awaited()
        self.ot_push.assert_called()
        self.staff_push.assert_called()
        self.assertFalse(self.hang_gate.is_set())

    async def test_wfh_overtime_with_reason_is_not_absent_locked(self):
        self.records = FakeAttendanceRecords(_open_record(is_wfh=True))
        self.db.attendance_records = self.records
        req = CheckOutRequest(
            detected_public_ip="127.0.0.1",
            variance_reason="Client deploy after hours",
        )
        out = await self._checkout(req, time="19:45", auto_wfh=True)
        self.assertEqual(out.check_out, "19:45")
        self.assertTrue(out.is_wfh)
        self.assertEqual(self.records.rec.get("status"), "wfh")
        self.assertNotEqual(self.records.rec.get("status"), "absent")
        self.upsert.assert_awaited()

    async def test_wfh_on_time_checkout_skips_overtime_request(self):
        self.records = FakeAttendanceRecords(_open_record(is_wfh=True))
        self.db.attendance_records = self.records
        req = CheckOutRequest(detected_public_ip="127.0.0.1")
        out = await self._checkout(req, time="18:32", auto_wfh=True)
        self.assertEqual(out.check_out, "18:32")
        self.assertTrue(out.is_wfh)
        self.upsert.assert_not_awaited()
        self.ot_push.assert_not_called()
        self.staff_push.assert_called()

    async def test_undertime_with_reason_succeeds(self):
        req = CheckOutRequest(
            detected_public_ip="127.0.0.1",
            variance_reason="Doctor appointment",
        )
        out = await self._checkout(req, time="16:00")
        self.assertEqual(out.check_out, "16:00")
        self.assertEqual(self.records.rec.get("undertime_reason"), "Doctor appointment")
        self.upsert.assert_not_awaited()
        self.ot_push.assert_not_called()
        self.staff_push.assert_called()

    async def test_short_leave_is_not_treated_as_absent(self):
        self.records = FakeAttendanceRecords(_open_record(is_short_leave=True))
        self.db.attendance_records = self.records
        req = CheckOutRequest(
            detected_public_ip="127.0.0.1",
            variance_reason="Short leave remainder",
        )
        out = await self._checkout(req, time="16:00")
        self.assertEqual(out.check_out, "16:00")
        self.assertNotEqual(self.records.rec.get("status"), "absent")


if __name__ == "__main__":
    unittest.main()
