"""Relaxed / cricket days must count actual check-in → check-out everywhere.

Regression for the Your day card showing 2h 21m (clamped to afternoon shift
start 14:00) after a 12:00–16:21 session on a relaxed day, when 4h 21m was due.

Root cause: get_today_status healed the record (apply_daily_calc_fields) before
bind_relaxed_days, so count_from_actual_check_in was dropped on every refresh.
"""
from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import connect_to_mongo, close_mongo_connection, get_database
from app.core.tenant import TenantContext, set_tenant_context, reset_tenant_context, get_global_db
from app.models.attendance import CalendarEventType
from app.schemas.attendance import CheckOutRequest, SecuritySettingsSchema
from app.services import attendance_service as svc
from app.services.attendance_calculator import calculate_daily_attendance
from app.services.attendance_security import PunchSecurityResult
from app.services.relaxed_day import (
    calc_kwargs_for,
    policy_from_calendar_doc,
    set_relaxed_by_date,
)


class TestRelaxedDayCalculator(unittest.TestCase):
    def test_afternoon_shift_clamps_without_flag(self):
        r = calculate_daily_attendance(
            check_in_time="12:00",
            check_out_time="16:21",
            shift_start="14:00",
            shift_end="20:00",
            break_duration_minutes=0,
            expected_hours=6.0,
        )
        self.assertEqual(r.work_minutes, 141)
        self.assertEqual(r.work_duration_formatted, "02:21")

    def test_afternoon_shift_counts_actual_on_relaxed_day(self):
        r = calculate_daily_attendance(
            check_in_time="12:00",
            check_out_time="16:21",
            shift_start="14:00",
            shift_end="20:00",
            break_duration_minutes=0,
            expected_hours=6.0,
            count_from_actual_check_in=True,
            waive_undertime_after="16:00",
        )
        self.assertEqual(r.work_minutes, 261)
        self.assertEqual(r.work_duration_formatted, "04:21")
        self.assertEqual(r.undertime_minutes, 0)

    def test_policy_kwargs(self):
        policy = policy_from_calendar_doc(
            {
                "event_type": "relaxed_day",
                "date": "2026-10-31",
                "leave_from": "16:00",
                "exclude_wfh": True,
            }
        )
        self.assertIsNotNone(policy)
        kwargs = calc_kwargs_for(policy, "u1", is_wfh=False)
        self.assertTrue(kwargs.get("count_from_actual_check_in"))
        self.assertEqual(kwargs.get("waive_undertime_after"), "16:00")


@unittest.skipUnless(os.environ.get("MONGO_URL"), "MONGO_URL required")
class TestRelaxedDayTodayStatus(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        os.environ.setdefault("MULTI_TENANT_ENABLED", "true")
        await connect_to_mongo()
        self.db = get_database()
        self.token = set_tenant_context(TenantContext(company_id="company_reamarc"))
        self.uid = "emp_relaxed_day_1"
        self.date_str = "2026-10-31"
        for name in (
            "users",
            "shifts",
            "user_shift_assignments",
            "attendance_records",
            "company_calendar",
            "leave_requests",
        ):
            await self.db[name].delete_many(
                {
                    "$or": [
                        {"user_id": self.uid},
                        {"id": self.uid},
                        {"id": "shift_relaxed_afternoon"},
                        {"date": self.date_str, "event_type": CalendarEventType.RELAXED_DAY.value},
                    ]
                }
            )

        gdb = get_global_db()
        if gdb is not None:
            await gdb.companies.update_one(
                {"id": "company_reamarc"},
                {
                    "$set": {
                        "id": "company_reamarc",
                        "name": "Reamarc",
                        "slug": "reamarc",
                        "is_active": True,
                    }
                },
                upsert=True,
            )

        self.user = {
            "id": self.uid,
            "email": "emp_relaxed_day_1@test.local",
            "full_name": "Relaxed Day Emp",
            "department": "Engineering",
            "role": "team_member",
            "is_active": True,
            "company_id": "company_reamarc",
        }
        await self.db.users.update_one({"id": self.uid}, {"$set": self.user}, upsert=True)
        await self.db.shifts.update_one(
            {"id": "shift_relaxed_afternoon"},
            {
                "$set": {
                    "id": "shift_relaxed_afternoon",
                    "name": "Afternoon",
                    "shift_type": "afternoon",
                    "start_time": "14:00",
                    "end_time": "20:00",
                    "break_duration_minutes": 0,
                    "grace_period_minutes": 15,
                    "expected_hours": 6.0,
                    "is_night_shift": False,
                    "is_active": True,
                    "hidden": False,
                    "company_id": "company_reamarc",
                    "overtime_buffer_minutes": 5,
                    "undertime_buffer_minutes": 5,
                }
            },
            upsert=True,
        )
        await self.db.user_shift_assignments.update_one(
            {"user_id": self.uid},
            {
                "$set": {
                    "user_id": self.uid,
                    "shift_id": "shift_relaxed_afternoon",
                    "company_id": "company_reamarc",
                }
            },
            upsert=True,
        )
        await self.db.company_calendar.update_one(
            {"id": "cal_relaxed_test"},
            {
                "$set": {
                    "id": "cal_relaxed_test",
                    "title": "Cricket day",
                    "date": self.date_str,
                    "event_type": CalendarEventType.RELAXED_DAY.value,
                    "leave_from": "16:00",
                    "exclude_wfh": True,
                    "exclude_user_ids": [],
                    "is_off_day": False,
                    "is_workday_override": False,
                    "company_id": "company_reamarc",
                }
            },
            upsert=True,
        )
        # Intentionally store the WRONG (shift-clamped) minutes, as if an older
        # heal path had rewritten the record after a correct checkout.
        await self.db.attendance_records.update_one(
            {"user_id": self.uid, "date": self.date_str},
            {
                "$set": {
                    "id": f"att_{self.uid}_{self.date_str}",
                    "user_id": self.uid,
                    "user_name": self.user["full_name"],
                    "department": "Engineering",
                    "date": self.date_str,
                    "shift_id": "shift_relaxed_afternoon",
                    "shift_name": "Afternoon",
                    "check_in": "12:00",
                    "check_out": "16:21",
                    "punch_in": "12:00",
                    "punch_out": "16:21",
                    "working_hours_minutes": 141,
                    "work_hours": 2.35,
                    "work_duration_formatted": "02:21",
                    "undertime_minutes": 0,
                    "undertime_hours": 0.0,
                    "overtime_minutes": 0,
                    "overtime_status": "not_applicable",
                    "status": "present",
                    "is_late": False,
                    "late_minutes": 0,
                    "is_wfh": False,
                    "company_id": "company_reamarc",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )

        self._sec = patch.object(
            svc,
            "get_security_settings",
            new=AsyncMock(
                return_value=SecuritySettingsSchema(
                    enforce_ip_whitelist=False,
                    enforce_gps_geofence=False,
                    allow_wfh_bypass=True,
                )
            ),
        )
        self._sec.start()

    async def asyncTearDown(self):
        self._sec.stop()
        set_relaxed_by_date({})
        reset_tenant_context(self.token)
        await close_mongo_connection()

    async def test_heal_before_bind_used_to_clamp_hours(self):
        """Without binding, heal must not be the path get_today_status takes anymore."""
        set_relaxed_by_date({})  # simulate forgotten bind
        rec = await self.db.attendance_records.find_one(
            {"user_id": self.uid, "date": self.date_str}, {"_id": 0}
        )
        shift = await svc.get_shift_for_user(self.uid, "Engineering", self.date_str)
        # Call the private heal — it now binds internally, so hours become 261.
        healed = await svc._heal_overtime_request_for_record(self.user, dict(rec), shift)
        self.assertEqual(int(healed.get("working_hours_minutes") or 0), 261)
        self.assertEqual(healed.get("work_duration_formatted"), "04:21")

    async def test_today_status_shows_actual_span(self):
        with patch.object(svc, "get_current_date_str", return_value=self.date_str), patch.object(
            svc, "get_now_pkt", return_value=datetime(2026, 10, 31, 17, 0, tzinfo=svc.PKT_TIMEZONE)
        ):
            status = await svc.get_today_status(self.user, date_str=self.date_str)
        self.assertTrue(status.count_from_actual_check_in)
        self.assertEqual(status.relaxed_leave_from, "16:00")
        self.assertIsNotNone(status.record)
        self.assertEqual(int(status.record.working_hours_minutes or 0), 261)
        self.assertEqual(status.record.work_duration_formatted, "04:21")

    async def test_resync_and_checkout_persist_actual_span(self):
        updated = await svc.resync_attendance_hours_for_date(self.date_str)
        self.assertGreaterEqual(updated, 1)
        rec = await self.db.attendance_records.find_one(
            {"user_id": self.uid, "date": self.date_str}, {"_id": 0}
        )
        self.assertEqual(int(rec.get("working_hours_minutes") or 0), 261)

        # Fresh checkout path
        await self.db.attendance_records.update_one(
            {"user_id": self.uid, "date": self.date_str},
            {
                "$set": {
                    "check_out": None,
                    "punch_out": None,
                    "working_hours_minutes": 0,
                    "work_duration_formatted": "00:00",
                },
                "$unset": {"undertime_reason": "", "overtime_reason": ""},
            },
        )
        ok = PunchSecurityResult(
            authorized=True,
            error=None,
            ip_verified=True,
            gps_verified=False,
            distance_meters=0.0,
            client_ip="127.0.0.1",
        )
        req = CheckOutRequest(notes="Cricket day", detected_public_ip="127.0.0.1")
        with patch("app.services.attendance_service.validate_punch_security", return_value=ok),              patch("app.services.device_registry.enforce_mobile_punch", new=AsyncMock(return_value=None)),              patch("app.services.attendance_service._notify_staff_punch_event", new=AsyncMock(return_value=None)),              patch("app.services.log_compliance.recompute_day_score", new=AsyncMock(return_value=None)):
            out = await svc.process_check_out(
                self.user,
                req,
                custom_date=self.date_str,
                custom_time="16:21",
                client_ip="127.0.0.1",
            )
        self.assertEqual(int(out.working_hours_minutes or 0), 261)
        self.assertEqual(out.work_duration_formatted, "04:21")


if __name__ == "__main__":
    unittest.main()
