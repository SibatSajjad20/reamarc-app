"""Daily Log hours include pending overtime; payroll work_hours stay gated."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.log_compliance import compute_time_at_work_hours, loggable_work_hours


def _at_work(**overrides):
    kwargs = dict(
        date_str="2026-11-06",
        check_in="09:30",
        check_out="19:30",
        work_hours=8.0,
        has_checkin=True,
        has_checkout=True,
        is_wfh=False,
        expected_hours=8.0,
        pending_overtime_minutes=0,
    )
    kwargs.update(overrides)
    return compute_time_at_work_hours(**kwargs)


class TestLoggableWorkHours(unittest.TestCase):
    def test_adds_pending_minutes(self):
        self.assertEqual(loggable_work_hours(8.0, 60), 9.0)

    def test_zero_or_missing_pending_unchanged(self):
        self.assertEqual(loggable_work_hours(8.0, 0), 8.0)
        self.assertEqual(loggable_work_hours(8.0), 8.0)
        self.assertEqual(loggable_work_hours(8.0, None), 8.0)

    def test_approved_ot_already_in_work_hours(self):
        self.assertEqual(loggable_work_hours(9.0, 0), 9.0)


class TestComputeTimeAtWorkPendingOt(unittest.TestCase):
    def test_checkout_plus_pending_ot(self):
        self.assertEqual(_at_work(work_hours=8.0, pending_overtime_minutes=60), 9.0)

    def test_approved_zero_pending_unchanged(self):
        self.assertEqual(_at_work(work_hours=9.0, pending_overtime_minutes=0), 9.0)

    def test_rejected_pending_zero_unchanged(self):
        self.assertEqual(_at_work(work_hours=8.0, pending_overtime_minutes=0), 8.0)


if __name__ == "__main__":
    unittest.main()
