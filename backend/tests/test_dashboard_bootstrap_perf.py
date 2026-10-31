"""Dashboard bootstrap guardrails on an in-memory throwaway Mongo."""
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

        summary = {
            "meta": {"generatedAt": "2026-10-31T00:00:00Z", "role": "team_member"},
            "crm": None,
            "content": None,
            "website": None,
            "approvals": None,
            "attendanceToday": None,
            "logs": None,
        }
        # Match a warmed FastAPI worker: routers/config are imported during app startup.
        import app.routers.daily_log  # noqa: F401
        import app.routers.dashboard  # noqa: F401
        import app.config  # noqa: F401
        # Prime the event loop / import path before measuring the hot path.
        await AsyncMock(return_value=None)()
        started = time.perf_counter()
        with tenant_scope("company-a", user_id="user-a"):
            with (
                patch("app.routers.dashboard.get_dashboard_summary", AsyncMock(return_value=summary)),
                patch("app.services.access.is_tracked", side_effect=lambda _user, module: module == "daily_log"),
                patch("app.routers.daily_log.get_day_target", AsyncMock(return_value={"logged_hours": 2.0})),
            ):
                payload = await get_dashboard_bootstrap(request=request, current_user=user, db=db)
        wall_ms = (time.perf_counter() - started) * 1000

        # One aggregate is the only unmocked Mongo command in this focused endpoint test.
        self.assertEqual(len(payload["weeklyLogs"]), 2)
        self.assertEqual(sum(row["hours"] for row in payload["weeklyLogs"]), 5.0)
        self.assertTrue(all(row["hours"] < 99 for row in payload["weeklyLogs"]))
        self.assertLessEqual(command_count, 1)
        self.assertLess(wall_ms, 250)
