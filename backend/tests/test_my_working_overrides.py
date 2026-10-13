"""HTTP coverage for GET /api/v1/attendance/my-working-overrides."""
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.security import require_internal_user
from app.routers.attendance import router as attendance_router


def _app_for_role(role: str) -> FastAPI:
    app = FastAPI()
    app.include_router(attendance_router, prefix="/api/v1")

    async def _user():
        return {
            "id": f"test_overrides_{role}",
            "email": f"{role}@reamarc.test",
            "full_name": role,
            "role": role,
            "is_active": True,
        }

    app.dependency_overrides[require_internal_user] = _user
    return app


class TestMyWorkingOverrides(unittest.TestCase):
    def test_get_database_import_is_app_database(self):
        import inspect
        from app.routers import attendance as attendance_mod

        source = inspect.getsource(attendance_mod.get_my_working_overrides)
        self.assertIn("from app.database import get_database", source)
        self.assertNotIn("from app.core.database import get_database", source)

    def test_returns_200_for_internal_roles(self):
        db = MagicMock()
        db.user_shift_assignments.find_one = AsyncMock(return_value={
            "user_id": "u",
            "date_overrides": [
                {"date": "2026-10-12", "working_day": True},
                {"date": "2026-10-05", "source": "shift_change"},
            ],
        })

        for role in ("team_member", "team_lead", "hr", "admin"):
            with self.subTest(role=role):
                with patch("app.database.get_database", return_value=db):
                    client = TestClient(_app_for_role(role))
                    res = client.get("/api/v1/attendance/my-working-overrides")
                self.assertEqual(res.status_code, 200, res.text)
                self.assertEqual(res.json(), ["2026-10-05", "2026-10-12"])

    def test_empty_when_database_unavailable(self):
        with patch("app.database.get_database", return_value=None):
            client = TestClient(_app_for_role("team_member"))
            res = client.get("/api/v1/attendance/my-working-overrides")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json(), [])


if __name__ == "__main__":
    unittest.main()
