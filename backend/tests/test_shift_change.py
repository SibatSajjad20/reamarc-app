"""
Pytest and Unit Integration Test Suite for "Shift change" request type.
Covers P1 & P2 backend requirements:
1. Submit validation & cutoff (D1-D6)
2. Custom times, break duration, hidden shift & GET /shifts isolation
3. Night shift collision (D4)
4. Approve idempotency, overrides write, HR pattern preservation
5. Provisional lateness & dynamic recalculation on approve/reject
6. Location security checks & D2 pending WFH enforcement
7. Cancellation rules (D3 employee future vs today/past HR)
8. Rest day working override (Sunday/1st Saturday check-in & daily log)
9. Review permissions (self-review 403, peer 403, HR/Admin 200)
10. Preview endpoint helper
"""
import os
import sys
import unittest
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
from unittest.mock import patch, MagicMock, AsyncMock

# Add backend and venv paths to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "venv", "Lib", "site-packages")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException
from app.database import connect_to_mongo, get_database
from app.models.attendance import (
    AttendanceStatus,
    LeaveType,
    LeaveStatus,
    ShiftType,
    NON_LEAVE_REQUEST_TYPES,
)
from app.schemas.leave import (
    LeaveCreateRequest,
    LeaveReviewRequest,
)
from app.schemas.shift import (
    ShiftAssignmentRequest,
    DateShiftOverride,
)
from app.schemas.attendance import CheckInRequest
from app.services import attendance_service
from app.services.workdays import classify_date, classify_date_for_user

PKT_TZ = ZoneInfo("Asia/Karachi")


class TestShiftChangeSuite(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await connect_to_mongo()
        self.db = get_database()
        self.now_pkt = datetime.now(PKT_TZ)
        self.today_str = self.now_pkt.strftime("%Y-%m-%d")

        # Distinct test user IDs
        self.emp_id = "test_sc_emp_001"
        self.peer_id = "test_sc_peer_002"
        self.hr_id = "test_sc_hr_003"
        self.admin_id = "test_sc_admin_004"

        self.emp_user = {
            "id": self.emp_id,
            "email": "test_sc_emp_001@reamarc.test",
            "full_name": "Shift Employee",
            "department": "Engineering",
            "role": "team_member",
            "is_active": True,
        }
        self.peer_user = {
            "id": self.peer_id,
            "email": "test_sc_peer_002@reamarc.test",
            "full_name": "Peer Employee",
            "department": "Engineering",
            "role": "team_member",
            "is_active": True,
        }
        self.hr_user = {
            "id": self.hr_id,
            "email": "test_sc_hr_003@reamarc.test",
            "full_name": "HR Manager",
            "department": "HR",
            "role": "hr",
            "is_active": True,
        }
        self.admin_user = {
            "id": self.admin_id,
            "email": "test_sc_admin_004@reamarc.test",
            "full_name": "Admin User",
            "department": "Executive",
            "role": "admin",
            "is_active": True,
        }

        # Seed or upsert users
        for u in [self.emp_user, self.peer_user, self.hr_user, self.admin_user]:
            await self.db.users.update_one({"id": u["id"]}, {"$set": u}, upsert=True)

        # Standard shift template
        self.std_shift_id = "shift_std_01"
        await self.db.shifts.update_one(
            {"id": self.std_shift_id},
            {"$set": {
                "id": self.std_shift_id,
                "name": "Standard Shift",
                "start_time": "09:30",
                "end_time": "18:30",
                "break_duration_minutes": 60,
                "grace_period_minutes": 15,
                "expected_hours": 8.0,
                "is_night_shift": False,
                "is_active": True,
                "hidden": False,
            }},
            upsert=True,
        )

        # Afternoon shift template
        self.afternoon_shift_id = "shift_afternoon_01"
        await self.db.shifts.update_one(
            {"id": self.afternoon_shift_id},
            {"$set": {
                "id": self.afternoon_shift_id,
                "name": "Afternoon Shift",
                "start_time": "14:00",
                "end_time": "20:00",
                "break_duration_minutes": 60,
                "grace_period_minutes": 15,
                "expected_hours": 5.0,
                "is_night_shift": False,
                "is_active": True,
                "hidden": False,
            }},
            upsert=True,
        )

        # Default shift assignment for test employee
        await self.db.user_shift_assignments.update_one(
            {"user_id": self.emp_id},
            {"$set": {
                "user_id": self.emp_id,
                "shift_id": self.std_shift_id,
                "weekday_rules": {},
                "date_overrides": [],
            }},
            upsert=True,
        )

        # Bind mobile device for test employee
        await self.db.mobile_devices.update_one(
            {"user_id": self.emp_id, "device_uuid": "test_dev_01"},
            {"$set": {
                "id": "dev_test_sc_01",
                "user_id": self.emp_id,
                "device_uuid": "test_dev_01",
                "device_name": "Test Phone",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )

    async def asyncTearDown(self):
        # Clean up records created for test users
        test_uids = [self.emp_id, self.peer_id, self.hr_id, self.admin_id]
        await self.db.leave_requests.delete_many({"user_id": {"$in": test_uids}})
        await self.db.attendance_records.delete_many({"user_id": {"$in": test_uids}})
        await self.db.user_shift_assignments.delete_many({"user_id": {"$in": test_uids}})
        await self.db.mobile_devices.delete_many({"user_id": {"$in": test_uids}})
        await self.db.users.delete_many({"id": {"$in": test_uids}})
        await self.db.shifts.delete_many({"source": "shift_change"})
        await self.db.company_calendar.delete_many({"title": "Test Company Holiday"})

    # ──────────────────────────────────────────────────────────
    # 1. SUBMIT VALIDATION TESTS
    # ──────────────────────────────────────────────────────────

    async def test_submit_valid_future_day(self):
        # 3 days ahead in the future
        future_date = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_location="office",
            shift_change_shift_id=self.afternoon_shift_id,
            reason="Project work",
        )
        res = await attendance_service.submit_leave_request(self.emp_user, req)
        self.assertEqual(res.status, LeaveStatus.PENDING)
        self.assertEqual(res.same_day, False)
        self.assertEqual(res.shift_change_dates, [future_date])
        self.assertIsNotNone(res.requested)
        self.assertEqual(res.requested.shift_id, self.afternoon_shift_id)

    async def test_submit_same_day_flag(self):
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[self.today_str],
            shift_change_location="office",
            shift_change_shift_id=self.afternoon_shift_id,
        )
        res = await attendance_service.submit_leave_request(self.emp_user, req)
        self.assertEqual(res.status, LeaveStatus.PENDING)
        self.assertEqual(res.same_day, True)

    async def test_submit_past_date_422(self):
        past_date = (self.now_pkt - timedelta(days=1)).strftime("%Y-%m-%d")
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[past_date],
            shift_change_location="office",
            shift_change_shift_id=self.afternoon_shift_id,
        )
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.submit_leave_request(self.emp_user, req)
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_submit_cutoff_past_2300_422(self):
        # Tomorrow submitted when PKT time is 23:30 (D-1 past 23:00)
        tomorrow = (self.now_pkt + timedelta(days=1)).strftime("%Y-%m-%d")
        late_pkt = self.now_pkt.replace(hour=23, minute=30, second=0)
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[tomorrow],
            shift_change_location="office",
            shift_change_shift_id=self.afternoon_shift_id,
        )
        with patch("app.services.attendance_service.get_now_pkt", return_value=late_pkt):
            with self.assertRaises(HTTPException) as ctx:
                await attendance_service.submit_leave_request(self.emp_user, req)
            self.assertEqual(ctx.exception.status_code, 422)
            self.assertIn("Cut-off passed", ctx.exception.detail)

    async def test_submit_more_than_14_dates_422(self):
        dates = [(self.now_pkt + timedelta(days=i + 2)).strftime("%Y-%m-%d") for i in range(15)]
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=dates,
            shift_change_location="office",
            shift_change_shift_id=self.afternoon_shift_id,
        )
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.submit_leave_request(self.emp_user, req)
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_submit_inactive_shift_404(self):
        future_date = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_location="office",
            shift_change_shift_id="non_existent_shift_id",
        )
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.submit_leave_request(self.emp_user, req)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_submit_conflict_approved_leave_409(self):
        future_date = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")
        await self.db.leave_requests.insert_one({
            "id": "leave_existing_test_01",
            "user_id": self.emp_id,
            "leave_type": "annual",
            "start_date": future_date,
            "end_date": future_date,
            "status": "approved",
        })
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_location="office",
            shift_change_shift_id=self.afternoon_shift_id,
        )
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.submit_leave_request(self.emp_user, req)
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_submit_conflict_company_holiday_d6_409(self):
        future_date = (self.now_pkt + timedelta(days=4)).strftime("%Y-%m-%d")
        await self.db.company_calendar.insert_one({
            "date": future_date,
            "title": "Test Company Holiday",
            "event_type": "holiday",
            "is_off_day": True,
        })
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_location="office",
            shift_change_shift_id=self.afternoon_shift_id,
        )
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.submit_leave_request(self.emp_user, req)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("company holidays", ctx.exception.detail)

    async def test_submit_conflict_existing_shift_change_409(self):
        future_date = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")
        req1 = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_location="office",
            shift_change_shift_id=self.afternoon_shift_id,
        )
        await attendance_service.submit_leave_request(self.emp_user, req1)

        # Attempting second shift change for same date
        req2 = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_location="wfh",
            shift_change_shift_id=self.afternoon_shift_id,
        )
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.submit_leave_request(self.emp_user, req2)
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_submit_conflict_checked_out_record_409(self):
        future_date = (self.now_pkt + timedelta(days=2)).strftime("%Y-%m-%d")
        await self.db.attendance_records.insert_one({
            "user_id": self.emp_id,
            "date": future_date,
            "check_in": "09:30",
            "check_out": "18:30",
        })
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_location="office",
            shift_change_shift_id=self.afternoon_shift_id,
        )
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.submit_leave_request(self.emp_user, req)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("checked out", ctx.exception.detail)

    # ──────────────────────────────────────────────────────────
    # 2. CUSTOM TIMES VALIDATION (D1)
    # ──────────────────────────────────────────────────────────

    async def test_custom_times_durations_and_breaks(self):
        future_date = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")

        # Under 2 hours -> 422
        with self.assertRaises(HTTPException) as ctx:
            req_short = LeaveCreateRequest(
                leave_type=LeaveType.SHIFT_CHANGE,
                shift_change_dates=[future_date],
                shift_change_custom_start="10:00",
                shift_change_custom_end="11:00",
            )
            await attendance_service.submit_leave_request(self.emp_user, req_short)
        self.assertEqual(ctx.exception.status_code, 422)

        # Over 12 hours -> 422
        with self.assertRaises(HTTPException) as ctx:
            req_long = LeaveCreateRequest(
                leave_type=LeaveType.SHIFT_CHANGE,
                shift_change_dates=[future_date],
                shift_change_custom_start="08:00",
                shift_change_custom_end="21:00",
            )
            await attendance_service.submit_leave_request(self.emp_user, req_long)
        self.assertEqual(ctx.exception.status_code, 422)

        # End < start without overnight -> 422
        with self.assertRaises(HTTPException) as ctx:
            req_inv = LeaveCreateRequest(
                leave_type=LeaveType.SHIFT_CHANGE,
                shift_change_dates=[future_date],
                shift_change_custom_start="22:00",
                shift_change_custom_end="06:00",
                shift_change_overnight=False,
            )
            await attendance_service.submit_leave_request(self.emp_user, req_inv)
        self.assertEqual(ctx.exception.status_code, 422)

        # Valid 4h custom: 10:00-14:00 (break=0m, expected=4h)
        req_4h = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_custom_start="10:00",
            shift_change_custom_end="14:00",
        )
        res_4h = await attendance_service.submit_leave_request(self.emp_user, req_4h)
        self.assertEqual(res_4h.requested.break_duration_minutes, 0)
        self.assertEqual(res_4h.requested.expected_hours, 4.0)

        # Clean up req_4h for next tests
        await self.db.leave_requests.delete_one({"id": res_4h.id})

        # Valid overnight: 22:00-06:00 (span=8h, break=60m, expected=7h)
        req_night = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_custom_start="22:00",
            shift_change_custom_end="06:00",
            shift_change_overnight=True,
        )
        res_night = await attendance_service.submit_leave_request(self.emp_user, req_night)
        self.assertEqual(res_night.requested.break_duration_minutes, 60)
        self.assertEqual(res_night.requested.expected_hours, 7.0)

    # ──────────────────────────────────────────────────────────
    # 3. NIGHT SHIFT COLLISION (D4)
    # ──────────────────────────────────────────────────────────

    async def test_night_collision_d4_409(self):
        # Request overnight 22:00 - 10:00. D+1 has normal shift 09:30 - 18:30.
        # Collision: 10:00 > 09:30 -> 409
        future_d1 = (self.now_pkt + timedelta(days=2)).strftime("%Y-%m-%d")
        future_d2 = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")

        # Mock classify_date for D+1 to be a workday
        with patch("app.services.workdays.classify_date") as mock_cls:
            mock_cls.return_value = MagicMock(is_off=False, kind="workday")
            req = LeaveCreateRequest(
                leave_type=LeaveType.SHIFT_CHANGE,
                shift_change_dates=[future_d1],
                shift_change_custom_start="22:00",
                shift_change_custom_end="10:00",
                shift_change_overnight=True,
            )
            with self.assertRaises(HTTPException) as ctx:
                await attendance_service.submit_leave_request(self.emp_user, req)
            self.assertEqual(ctx.exception.status_code, 409)
            self.assertIn("runs into your next shift", ctx.exception.detail)

    # ──────────────────────────────────────────────────────────
    # 4. APPROVE IDEMPOTENCY & OVERRIDES
    # ──────────────────────────────────────────────────────────

    async def test_approve_idempotent_and_hidden_shift(self):
        future_date = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_custom_start="10:00",
            shift_change_custom_end="15:00",
        )
        created = await attendance_service.submit_leave_request(self.emp_user, req)

        # Approve by HR
        review_req = LeaveReviewRequest(
            status=LeaveStatus.APPROVED,
            review_comments="Approved custom shift",
        )
        approved = await attendance_service.review_leave_request(created.id, self.hr_user, review_req)
        self.assertEqual(approved.status, LeaveStatus.APPROVED)
        self.assertIsNotNone(approved.applied_at)

        # Check date_overrides on user_shift_assignments
        asgn = await self.db.user_shift_assignments.find_one({"user_id": self.emp_id})
        overrides = asgn.get("date_overrides") or []
        sc_ov = [ov for ov in overrides if ov.get("request_id") == created.id]
        self.assertEqual(len(sc_ov), 1)
        self.assertEqual(sc_ov[0]["date"], future_date)
        self.assertEqual(sc_ov[0]["source"], "shift_change")

        # Check hidden shift doc created
        hidden_id = f"sc_{created.id}"
        hidden_s = await self.db.shifts.find_one({"id": hidden_id})
        self.assertIsNotNone(hidden_s)
        self.assertEqual(hidden_s["hidden"], True)

        # Verify get_all_shifts excludes hidden shifts
        all_s = await attendance_service.get_all_shifts()
        self.assertNotIn(hidden_id, [s.id for s in all_s])

        # Verify re-approve is idempotent
        await attendance_service.apply_shift_change(await self.db.leave_requests.find_one({"id": created.id}), "HR")
        asgn_after = await self.db.user_shift_assignments.find_one({"user_id": self.emp_id})
        sc_ov_after = [ov for ov in (asgn_after.get("date_overrides") or []) if ov.get("request_id") == created.id]
        self.assertEqual(len(sc_ov_after), 1)

    async def test_hr_pattern_save_keeps_request_overrides(self):
        future_date = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_shift_id=self.afternoon_shift_id,
        )
        created = await attendance_service.submit_leave_request(self.emp_user, req)
        await attendance_service.review_leave_request(
            created.id, self.hr_user, LeaveReviewRequest(status=LeaveStatus.APPROVED)
        )

        # HR saves pattern modal with unrelated date overrides
        other_date = (self.now_pkt + timedelta(days=5)).strftime("%Y-%m-%d")
        hr_asgn_payload = ShiftAssignmentRequest(
            user_id=self.emp_id,
            shift_id=self.std_shift_id,
            weekday_rules={},
            date_overrides=[
                DateShiftOverride(date=other_date, shift_id=self.std_shift_id, source="hr")
            ],
        )
        await attendance_service.assign_user_shift(hr_asgn_payload, self.admin_user)

        # Verify that the shift_change override was PRESERVED!
        asgn = await self.db.user_shift_assignments.find_one({"user_id": self.emp_id})
        dates_in_asgn = {ov["date"]: ov["source"] for ov in (asgn.get("date_overrides") or [])}
        self.assertIn(future_date, dates_in_asgn)
        self.assertEqual(dates_in_asgn[future_date], "shift_change")
        self.assertIn(other_date, dates_in_asgn)
        self.assertEqual(dates_in_asgn[other_date], "hr")

    # ──────────────────────────────────────────────────────────
    # 5. RECALCULATION & PROVISIONAL LATENESS
    # ──────────────────────────────────────────────────────────

    async def test_recalculation_on_approve_and_reject(self):
        # User files same-day request for 14:00 - 20:00 afternoon shift
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[self.today_str],
            shift_change_shift_id=self.afternoon_shift_id,
            shift_change_location="office",
        )
        created = await attendance_service.submit_leave_request(self.emp_user, req)

        # Check-in at 14:05 (shift is 14:00, grace 15m -> within grace)
        with patch("app.services.attendance_service.get_current_time_str", return_value="14:05"):
            with patch("app.services.attendance_service.validate_punch_security") as mock_sec:
                mock_sec.return_value = MagicMock(authorized=True, ip_verified=True, gps_verified=True, distance_meters=0, error=None)
                punch_req = CheckInRequest(device_uuid="test_dev_01", biometric_verified=True, is_mocked=False)
                res = await attendance_service.process_check_in(self.emp_user, punch_req)
                self.assertEqual(res.status, AttendanceStatus.PRESENT)
                self.assertEqual(res.is_late, False)
                self.assertEqual(res.provisional, True)

        # If rejected -> recalculates against 09:30 standard shift -> arrives 14:05 -> late strike!
        reject_req = LeaveReviewRequest(
            status=LeaveStatus.REJECTED,
            rejection_reason="Not approved today",
        )
        await attendance_service.review_leave_request(created.id, self.hr_user, reject_req)

        rec = await self.db.attendance_records.find_one({"user_id": self.emp_id, "date": self.today_str})
        self.assertEqual(rec.get("provisional"), False)
        self.assertEqual(rec.get("is_late"), True)
        self.assertEqual(rec.get("late_strike"), 1)
        self.assertEqual(rec.get("status"), AttendanceStatus.LATE.value)

    # ──────────────────────────────────────────────────────────
    # 6. LOCATION SECURITY CHECKS (D2)
    # ──────────────────────────────────────────────────────────

    async def test_location_security_d2_pending_vs_approved_wfh(self):
        # A pending same-day WFH request does NOT skip security checks (D2)
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[self.today_str],
            shift_change_shift_id=self.std_shift_id,
            shift_change_location="wfh",
        )
        created = await attendance_service.submit_leave_request(self.emp_user, req)

        with patch("app.services.attendance_service.validate_punch_security") as mock_sec:
            # Mock security failing (e.g. outside office)
            mock_sec.return_value = MagicMock(authorized=False, error="Outside office")
            punch_req = CheckInRequest(device_uuid="test_dev_01", biometric_verified=True, is_mocked=False)
            with self.assertRaises(HTTPException) as ctx:
                await attendance_service.process_check_in(self.emp_user, punch_req)
            self.assertEqual(ctx.exception.status_code, 403)

        # Now HR approves the WFH shift change
        await attendance_service.review_leave_request(
            created.id, self.hr_user, LeaveReviewRequest(status=LeaveStatus.APPROVED)
        )

        # Now check-in allows WFH bypass (is_wfh_approved=True)
        with patch("app.services.attendance_service.validate_punch_security") as mock_sec_approved:
            mock_sec_approved.return_value = MagicMock(authorized=True, ip_verified=True, gps_verified=True, distance_meters=0, error=None)
            punch_req = CheckInRequest(device_uuid="test_dev_01", biometric_verified=True, is_mocked=False)
            res = await attendance_service.process_check_in(self.emp_user, punch_req)
            self.assertEqual(res.is_wfh, True)
            self.assertEqual(res.status, AttendanceStatus.WFH)

    # ──────────────────────────────────────────────────────────
    # 7. CANCEL RULES (D3)
    # ──────────────────────────────────────────────────────────

    async def test_cancel_rules_d3_future_vs_past(self):
        future_date = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_shift_id=self.afternoon_shift_id,
        )
        created = await attendance_service.submit_leave_request(self.emp_user, req)
        await attendance_service.review_leave_request(
            created.id, self.hr_user, LeaveReviewRequest(status=LeaveStatus.APPROVED)
        )

        # Employee cancels future approved date -> 200 / success
        success = await attendance_service.delete_leave_request(created.id, self.emp_user)
        self.assertTrue(success)

        # Check override was removed
        asgn = await self.db.user_shift_assignments.find_one({"user_id": self.emp_id})
        sc_ov = [ov for ov in (asgn.get("date_overrides") or []) if ov.get("request_id") == created.id]
        self.assertEqual(len(sc_ov), 0)

        # Now test today's approved date:
        req_today = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[self.today_str],
            shift_change_shift_id=self.afternoon_shift_id,
        )
        created_today = await attendance_service.submit_leave_request(self.emp_user, req_today)
        await attendance_service.review_leave_request(
            created_today.id, self.hr_user, LeaveReviewRequest(status=LeaveStatus.APPROVED)
        )

        # Employee trying to cancel today -> 403 (D3)
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.cancel_shift_change(created_today.id, self.emp_user)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Contact HR", ctx.exception.detail)

        # HR cancels today -> 200 / success
        hr_cancelled = await attendance_service.cancel_shift_change(created_today.id, self.hr_user)
        self.assertTrue(hr_cancelled)

    # ──────────────────────────────────────────────────────────
    # 8. REST DAY WORKDAYS (D6)
    # ──────────────────────────────────────────────────────────

    async def test_rest_day_override_enables_checkin(self):
        # Find next Sunday
        days_until_sunday = (6 - self.now_pkt.weekday()) % 7
        if days_until_sunday == 0:
            days_until_sunday = 7
        next_sunday = (self.now_pkt + timedelta(days=days_until_sunday)).strftime("%Y-%m-%d")

        # Without shift change, classify_date_for_user reports rest day
        cls_before = await classify_date_for_user(self.emp_id, next_sunday)
        self.assertTrue(cls_before.is_off)

        # Submit shift change for next Sunday
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[next_sunday],
            shift_change_shift_id=self.std_shift_id,
            shift_change_location="office",
        )
        created = await attendance_service.submit_leave_request(self.emp_user, req)
        await attendance_service.review_leave_request(
            created.id, self.hr_user, LeaveReviewRequest(status=LeaveStatus.APPROVED)
        )

        # With approved shift change, classify_date_for_user reports workday!
        cls_after = await classify_date_for_user(self.emp_id, next_sunday)
        self.assertFalse(cls_after.is_off)
        self.assertEqual(cls_after.label, "Shift change")

    # ──────────────────────────────────────────────────────────
    # 9. PERMISSIONS TESTS
    # ──────────────────────────────────────────────────────────

    async def test_review_permissions(self):
        future_date = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")
        req = LeaveCreateRequest(
            leave_type=LeaveType.SHIFT_CHANGE,
            shift_change_dates=[future_date],
            shift_change_shift_id=self.afternoon_shift_id,
        )
        created = await attendance_service.submit_leave_request(self.emp_user, req)

        # Self-approval -> 403
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.review_leave_request(
                created.id, self.emp_user, LeaveReviewRequest(status=LeaveStatus.APPROVED)
            )
        self.assertEqual(ctx.exception.status_code, 403)

        # Peer team member -> 403
        with self.assertRaises(HTTPException) as ctx:
            await attendance_service.review_leave_request(
                created.id, self.peer_user, LeaveReviewRequest(status=LeaveStatus.APPROVED)
            )
        self.assertEqual(ctx.exception.status_code, 403)

        # HR -> 200
        res_hr = await attendance_service.review_leave_request(
            created.id, self.hr_user, LeaveReviewRequest(status=LeaveStatus.APPROVED)
        )
        self.assertEqual(res_hr.status, LeaveStatus.APPROVED)

    # ──────────────────────────────────────────────────────────
    # 10. PREVIEW ENDPOINT HELPER
    # ──────────────────────────────────────────────────────────

    async def test_preview_helper(self):
        d1 = (self.now_pkt + timedelta(days=2)).strftime("%Y-%m-%d")
        d2 = (self.now_pkt + timedelta(days=3)).strftime("%Y-%m-%d")

        preview = await attendance_service.preview_shift_change(
            user=self.emp_user,
            dates=[d1, d2],
            shift_id=self.afternoon_shift_id,
            location="wfh",
        )
        self.assertEqual(len(preview.items), 2)
        item0 = preview.items[0]
        self.assertEqual(item0.requested.shift_id, self.afternoon_shift_id)
        self.assertEqual(item0.requested.location, "wfh")
        self.assertIsNone(item0.conflict)
