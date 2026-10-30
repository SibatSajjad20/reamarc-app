"""Check-out must be idempotent: a second call after success returns the saved record, not 400.

Regression for the production symptom where a double-click / parallel retry showed
"Check-out failed" / "Already checked out at HH:MM" even though the punch-out was saved;
a refresh then showed the correct checked-out state.
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
from app.schemas.attendance import CheckOutRequest, SecuritySettingsSchema
from app.services import attendance_service as svc
from app.services.attendance_security import PunchSecurityResult


@unittest.skipUnless(os.environ.get("MONGO_URL"), "MONGO_URL required")
class TestCheckoutIdempotent(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await connect_to_mongo()
        self.db = get_database()
        self.token = set_tenant_context(TenantContext(company_id="company_reamarc"))
        self.uid = "emp_checkout_idem_1"
        for name in ("users", "shifts", "user_shift_assignments", "attendance_records", "leave_requests"):
            await self.db[name].delete_many({"$or": [{"user_id": self.uid}, {"id": self.uid}, {"id": "shift_checkout_idem"}]})

        gdb = get_global_db()
        if gdb is not None:
            await gdb.companies.update_one(
                {"id": "company_reamarc"},
                {"$set": {"id": "company_reamarc", "name": "Reamarc", "slug": "reamarc", "is_active": True}},
                upsert=True,
            )

        self.user = {
            "id": self.uid,
            "email": "emp_checkout_idem_1@test.local",
            "full_name": "Checkout Idem Emp",
            "department": "Engineering",
            "role": "team_member",
            "is_active": True,
            "company_id": "company_reamarc",
        }
        await self.db.users.update_one({"id": self.uid}, {"$set": self.user}, upsert=True)
        await self.db.shifts.update_one(
            {"id": "shift_checkout_idem"},
            {
                "$set": {
                    "id": "shift_checkout_idem",
                    "name": "Standard",
                    "start_time": "09:30",
                    "end_time": "18:30",
                    "break_duration_minutes": 60,
                    "grace_period_minutes": 15,
                    "expected_hours": 8.0,
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
            {"$set": {"user_id": self.uid, "shift_id": "shift_checkout_idem", "company_id": "company_reamarc"}},
            upsert=True,
        )

        self.today = svc.get_current_date_str()
        await self.db.attendance_records.delete_many({"user_id": self.uid, "date": self.today})
        await self.db.attendance_records.insert_one(
            {
                "id": f"att_{self.uid}_{self.today}",
                "user_id": self.uid,
                "user_name": self.user["full_name"],
                "employee_name": self.user["full_name"],
                "department": "Engineering",
                "date": self.today,
                "shift_id": "shift_checkout_idem",
                "shift_name": "Standard",
                "check_in": "09:35",
                "punch_in": "09:35",
                "check_out": None,
                "punch_out": None,
                "break_minutes": 60,
                "is_wfh": False,
                "is_missed_punch": False,
                "status": "present",
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
        )

        self.sec = SecuritySettingsSchema(
            enforce_ip_whitelist=False,
            enforce_gps_geofence=False,
            office_latitude=31.5,
            office_longitude=74.3,
            geofence_radius_meters=300,
        )
        self.ok = PunchSecurityResult(
            authorized=True,
            error=None,
            ip_verified=True,
            gps_verified=False,
            distance_meters=0.0,
            client_ip="127.0.0.1",
        )

    async def asyncTearDown(self):
        reset_tenant_context(self.token)
        await close_mongo_connection()

    async def test_second_checkout_returns_saved_record_not_400(self):
        req = CheckOutRequest(notes="Shift check-out", detected_public_ip="127.0.0.1")
        with patch("app.services.attendance_service.get_security_settings", new=AsyncMock(return_value=self.sec)), \
             patch("app.services.attendance_service.validate_punch_security", return_value=self.ok), \
             patch("app.services.device_registry.enforce_mobile_punch", new=AsyncMock(return_value=None)), \
             patch("app.services.attendance_service._notify_staff_punch_event", new=AsyncMock(return_value=None)), \
             patch("app.services.log_compliance.recompute_day_score", new=AsyncMock(return_value=None)):
            first = await svc.process_check_out(self.user, req, custom_time="18:32", client_ip="127.0.0.1")
            second = await svc.process_check_out(self.user, req, custom_time="18:32", client_ip="127.0.0.1")

        self.assertEqual(first.check_out, "18:32")
        self.assertEqual(second.check_out, "18:32")
        rec = await self.db.attendance_records.find_one({"user_id": self.uid, "date": self.today}, {"_id": 0})
        self.assertEqual(rec.get("check_out") or rec.get("punch_out"), "18:32")


if __name__ == "__main__":
    unittest.main()
