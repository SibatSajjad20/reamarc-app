"""Dashboard/attendance bootstrap guardrails on an in-memory throwaway Mongo."""
from __future__ import annotations

import os
import time
import unittest
from unittest.mock import AsyncMock, patch

from mongomock_motor import AsyncMongoMockClient
from starlette.requests import Request

os.environ.setdefault("SECRET_KEY", "test-dashboard-bootstrap-secret-0123456789")


class TestDashboardBootstrapPerformance(unittest.IsolatedAsyncioTestCase):
    async def test_bootstrap_is_bounded_and_tenant_isolated(self):
        from app.core.tenant import TenantDB, tenant_scope
        from app.routers.dashboard import get_dashboard_bootstrap

        raw = AsyncMongoMockClient().test_dashboard_bootstrap
        await raw.daily_log_entries.insert_many(
            [
                {"company_id": "company-a", "user_id": "user-a", "date": "2026-10-30", "hours_utilized": 3.0},
                {"company_id": "company-a", "user_id": "user-a", "date": "2026-10-31", "hours_utilized": 2.0},
                {"company_id": "company-b", "user_id": "user-a", "date": "2026-10-31", "hours_utilized": 99.0},
            ]
        )
        tenant_db = TenantDB(raw)
        command_count = 0

        class CountingCollection:
            def aggregate(self, pipeline):
                nonlocal command_count
                command_count += 1
                return tenant_db.daily_log_entries.aggregate(pipeline)

        class CountingDB:
            daily_log_entries = CountingCollection()

        db = CountingDB()
        request = Request({"type": "http", "method": "GET", "path": "/api/v1/dashboard/bootstrap", "headers": []})
        user = {
            "id": "user-a",
            "company_id": "company-a",
            "role": "team_member",
            "department": "Engineering",
        }

        with tenant_scope("company-a", user_id="user-a"):
            with (
                patch("app.services.access.is_tracked", side_effect=lambda _user, module: module == "daily_log"),
                patch("app.services.attendance_service.get_daily_matrix", AsyncMock(side_effect=AssertionError("matrix must not be on dashboard bootstrap"))),
                patch("app.routers.dashboard.get_dashboard_summary", AsyncMock(side_effect=AssertionError("summary must not be on dashboard bootstrap"))),
            ):
                await get_dashboard_bootstrap(request=request, current_user=user, db=db)
                started = time.perf_counter()
                payload = await get_dashboard_bootstrap(request=request, current_user=user, db=db)
        wall_ms = (time.perf_counter() - started) * 1000

        self.assertIsNone(payload["matrix"])
        self.assertIsNone(payload["summary"])
        self.assertIsNone(payload["dayTarget"])
        self.assertEqual(len(payload["weeklyLogs"]), 2)
        self.assertEqual(sum(row["hours"] for row in payload["weeklyLogs"]), 5.0)
        self.assertTrue(all(row["hours"] < 99 for row in payload["weeklyLogs"]))
        self.assertLessEqual(command_count, 2)
        self.assertLess(wall_ms, 250)

    async def test_management_attendance_bootstrap_skips_matrix_at_scale(self):
        from app.core.hot_cache import clear_matrix_cache, get_cached_matrix, set_cached_matrix
        from app.routers.attendance import get_attendance_bootstrap, get_daily_attendance_matrix

        clear_matrix_cache()
        user = {
            "id": "admin-a",
            "company_id": "company-a",
            "role": "admin",
        }
        other = {
            "id": "admin-b",
            "company_id": "company-b",
            "role": "admin",
        }

        started = time.perf_counter()
        with patch("app.services.attendance_service.get_daily_matrix", AsyncMock(side_effect=AssertionError("matrix must not block attendance bootstrap"))):
            payload = await get_attendance_bootstrap(current_user=user)
        wall_ms = (time.perf_counter() - started) * 1000

        self.assertEqual(payload["kind"], "management")
        self.assertIsNone(payload["matrix"])
        self.assertLess(wall_ms, 100)

        matrix_a = {"date": "2026-10-31", "rows": [{"company": "a"}], "present_count": 80}
        matrix_b = {"date": "2026-10-31", "rows": [{"company": "b"}], "present_count": 1}
        set_cached_matrix("company-a", "2026-10-31", None, matrix_a)
        set_cached_matrix("company-b", "2026-10-31", None, matrix_b)
        self.assertIs(get_cached_matrix("company-a", "2026-10-31", None), matrix_a)
        self.assertIs(get_cached_matrix("company-b", "2026-10-31", None), matrix_b)

        with patch(
            "app.services.attendance_service.get_daily_matrix",
            AsyncMock(return_value=matrix_a),
        ) as mocked:
            cached = await get_daily_attendance_matrix(
                date="2026-10-31",
                department=None,
                current_user=user,
            )
            self.assertEqual(cached["rows"][0]["company"], "a")
            mocked.assert_not_called()
            isolated = await get_daily_attendance_matrix(
                date="2026-10-31",
                department=None,
                current_user=other,
            )
            self.assertEqual(isolated["rows"][0]["company"], "b")
            mocked.assert_not_called()
