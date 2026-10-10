"""
Unit and integration tests for Round 3 Agent B B0 backend fixes:
1. Submit-for-review truth-value testing on Database objects (item 19)
2. Background CRM notification dispatch (item 5)
3. Full year holidays when month omitted (item 30b)
4. Phone in UserResponse (E3)
5. Website project create permissions (E6)
6. WebsiteFileCreate validation (item 20)
7. Drive picker security (403/404, Cache-Control: no-store) and website from-drive endpoint
"""
import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "venv", "Lib", "site-packages")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.config import settings
from app.core.security import get_current_user
from app.services.content_calendar_access import require_content_calendar_user
from app.schemas.auth import UserResponse
from app.schemas.website_project import (
    WebsiteFileCreate,
    WebsiteDriveAttachRequest,
    WebsiteDriveFileItem,
)
from app.services import (
    website_project_service,
    content_calendar_service,
    crm_leads,
    attendance_service,
)
from app.services.website_project_workflow import can_create_project


class MockMotorDatabase:
    """Mock database simulating Motor / PyMongo collection truth value restrictions."""
    def __init__(self):
        self._collections = {}
        self.users = MagicMock()
        self.website_project_tasks = MagicMock()
        self.company_calendar = MagicMock()

    def __bool__(self):
        raise NotImplementedError("Database objects do not implement truth value testing")

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = MagicMock()
        return self._collections[name]


class TestRound3B0Fixes(unittest.TestCase):
    def tearDown(self):
        app.dependency_overrides.clear()

    # -------------------------------------------------------------
    # 1. Truth value testing fixes on Database objects
    # -------------------------------------------------------------
    def test_database_truth_value_safe(self):
        db = MockMotorDatabase()
        db.users.find.return_value.to_list = AsyncMock(return_value=[{"id": "c1"}])
        db.website_project_tasks.find.return_value.to_list = AsyncMock(return_value=[{"assignee_id": "u1"}])
        db["workspaces"].find.return_value.to_list = AsyncMock(return_value=[{"id": "ws1", "name": "Client A"}])

        # None checks must return empty/None without raising
        self.assertEqual(asyncio.run(website_project_service._find_client_users_for_workspace(None, "ws1")), [])
        self.assertEqual(asyncio.run(website_project_service._find_project_team_members(None, "p1")), [])
        self.assertEqual(asyncio.run(website_project_service._find_admin_users(None)), [])
        self.assertIsNone(asyncio.run(content_calendar_service._resolve_workspace_id_for_client(None, "Client A")))

        # Motor DB object (which raises on bool(db)) must not raise NotImplementedError
        clients = asyncio.run(website_project_service._find_client_users_for_workspace(db, "ws1"))
        self.assertEqual(clients, ["c1"])

        team = asyncio.run(website_project_service._find_project_team_members(db, "p1"))
        self.assertEqual(team, ["u1"])

        ws_id = asyncio.run(content_calendar_service._resolve_workspace_id_for_client(db, "Client A"))
        self.assertEqual(ws_id, "ws1")

    # -------------------------------------------------------------
    # 2. Assign notifications in background
    # -------------------------------------------------------------
    def test_crm_background_notification_dispatch(self):
        ran = False

        async def dummy_coro():
            nonlocal ran
            ran = True

        async def run_test():
            crm_leads._dispatch_background_notification(dummy_coro())
            await asyncio.sleep(0.05)

        asyncio.run(run_test())
        self.assertTrue(ran)

    # -------------------------------------------------------------
    # 3. Holidays full year when month is omitted
    # -------------------------------------------------------------
    def test_get_calendar_events_full_year(self):
        mock_db = MagicMock()
        mock_db.company_calendar.find.return_value.sort.return_value.to_list = AsyncMock(return_value=[
            {"id": "cal_1", "title": "New Year", "date": "2026-01-01", "event_type": "holiday", "is_off_day": True, "is_workday_override": False},
            {"id": "cal_2", "title": "Independence Day", "date": "2026-08-14", "event_type": "holiday", "is_off_day": True, "is_workday_override": False},
        ])

        with patch("app.services.attendance_service.get_database", return_value=mock_db):
            # When month is None, queries full year and returns month=None
            res = asyncio.run(attendance_service.get_calendar_events(year=2026, month=None))
            self.assertEqual(res.year, 2026)
            self.assertIsNone(res.month)
            self.assertEqual(len(res.events), 2)
            # Verify query filter spanned Jan 1 to Dec 31
            call_query = mock_db.company_calendar.find.call_args[0][0]
            self.assertEqual(call_query, {"date": {"$gte": "2026-01-01", "$lte": "2026-12-31"}})

            # When month is provided, filters for that specific month
            res_month = asyncio.run(attendance_service.get_calendar_events(year=2026, month=8))
            self.assertEqual(res_month.year, 2026)
            self.assertEqual(res_month.month, 8)
            month_query = mock_db.company_calendar.find.call_args[0][0]
            self.assertEqual(month_query, {"date": {"$gte": "2026-08-01", "$lte": "2026-08-31"}})

    # -------------------------------------------------------------
    # 4. Phone in /auth/me (UserResponse)
    # -------------------------------------------------------------
    def test_user_response_phone_field(self):
        user = UserResponse(
            id="u_123",
            email="dev@reamarc.com",
            name="Developer",
            phone="+923001234567",
        )
        self.assertEqual(user.phone, "+923001234567")
        self.assertIn("phone", user.model_dump())

    # -------------------------------------------------------------
    # 5. Website project create permission (E6)
    # -------------------------------------------------------------
    def test_website_project_create_permission(self):
        # Admin / Ops allowed
        self.assertTrue(can_create_project({"id": "1", "role": "admin", "is_active": True}))
        self.assertTrue(can_create_project({"id": "2", "role": "operations", "is_active": True}))

        # PM / Lead allowed
        self.assertTrue(can_create_project({"id": "3", "role": "team_lead", "department": "General", "is_active": True}))
        self.assertTrue(can_create_project({"id": "4", "role": "pm", "is_active": True}))

        # Website department member allowed
        self.assertTrue(can_create_project({"id": "5", "role": "member", "department": "Website", "is_active": True}))
        self.assertTrue(can_create_project({"id": "6", "role": "member", "department": "software development", "is_active": True}))

        # Non-website staff denied
        self.assertFalse(can_create_project({"id": "7", "role": "member", "department": "Sales", "is_active": True}))
        self.assertFalse(can_create_project({"id": "8", "role": "member", "department": "HR", "is_active": True}))
        self.assertFalse(can_create_project({"id": "9", "role": "member", "department": "SEO", "is_active": True}))

        # Clients denied
        self.assertFalse(can_create_project({"id": "10", "role": "client", "department": "Website", "is_active": True}))

        # Inactive user denied
        self.assertFalse(can_create_project({"id": "11", "role": "admin", "is_active": False}))

        # HTTP Route check
        client = TestClient(app)
        # Denied client gets 403
        app.dependency_overrides[get_current_user] = lambda: {"id": "10", "role": "client", "is_active": True}
        res = client.post(f"{settings.API_V1_STR}/website-projects", json={"name": "New Project", "workspace_id": "ws_1", "manager_id": "u_pm"})
        self.assertEqual(res.status_code, 403)

        # Denied non-website member gets 403
        app.dependency_overrides[get_current_user] = lambda: {"id": "7", "role": "member", "department": "Sales", "is_active": True}
        res = client.post(f"{settings.API_V1_STR}/website-projects", json={"name": "New Project", "workspace_id": "ws_1", "manager_id": "u_pm"})
        self.assertEqual(res.status_code, 403)

    # -------------------------------------------------------------
    # 6. WebsiteFileCreate validation (item 20)
    # -------------------------------------------------------------
    def test_website_file_create_validation(self):
        # Valid: storage_key provided
        f1 = WebsiteFileCreate(folder="assets", name="Logo", storage_key="drive:12345")
        self.assertEqual(f1.storage_key, "drive:12345")

        # Valid: external_url provided
        f2 = WebsiteFileCreate(folder="assets", name="Brief", external_url="https://docs.google.com/document/d/xyz")
        self.assertEqual(f2.external_url, "https://docs.google.com/document/d/xyz")

        # Valid: both provided
        f3 = WebsiteFileCreate(folder="assets", name="Brief", storage_key="drive:xyz", external_url="https://drive.google.com/file/d/xyz")
        self.assertEqual(f3.storage_key, "drive:xyz")

        # Invalid: neither provided
        with self.assertRaises(ValidationError):
            WebsiteFileCreate(folder="assets", name="Empty")

        # Invalid: external_url not http/https
        with self.assertRaises(ValidationError):
            WebsiteFileCreate(folder="assets", name="Bad URL", external_url="javascript:alert(1)")

        # Invalid: external_url exceeds 2048 chars
        with self.assertRaises(ValidationError):
            WebsiteFileCreate(folder="assets", name="Too Long", external_url="https://example.com/" + "a" * 2050)

    # -------------------------------------------------------------
    # 7. Drive picker security (403, 404, Cache-Control: no-store) & from-drive endpoint
    # -------------------------------------------------------------
    def test_content_calendar_picker_config_security(self):
        client = TestClient(app)

        # 404 for missing item
        app.dependency_overrides[require_content_calendar_user] = lambda: {
            "id": "u_admin", "role": "admin", "department": "Creative", "is_active": True
        }
        with patch("app.routers.content_calendar.get_database") as mock_db:
            mock_db.return_value.__getitem__.return_value.find_one = AsyncMock(return_value=None)
            with patch("app.services.content_calendar_service.get_item_by_id", new=AsyncMock(return_value=None)):
                res = client.get(f"{settings.API_V1_STR}/content-calendar/non_existent_item/picker-config")
                self.assertEqual(res.status_code, 404)

        # 403 when user cannot manage assets
        app.dependency_overrides[require_content_calendar_user] = lambda: {
            "id": "u_member", "role": "team_member", "department": "Creative", "is_active": True
        }
        with patch("app.routers.content_calendar.get_database") as mock_db:
            item_doc = {"id": "cal_123", "serial": "CAL-123", "stage": "Content"}
            mock_db.return_value.__getitem__.return_value.find_one = AsyncMock(return_value=item_doc)
            with patch("app.services.content_calendar_service.get_item_by_id", new=AsyncMock(return_value=item_doc)):
                with patch("app.services.content_calendar_service.can_manage_assets", return_value=False):
                    res = client.get(f"{settings.API_V1_STR}/content-calendar/cal_123/picker-config")
                    self.assertEqual(res.status_code, 403)

        # 200 and Cache-Control: no-store when permitted
        app.dependency_overrides[require_content_calendar_user] = lambda: {
            "id": "u_lead", "role": "team_lead", "department": "Creative", "is_active": True
        }
        with patch("app.routers.content_calendar.get_database") as mock_db:
            item_doc = {"id": "cal_123", "serial": "CAL-123", "stage": "Content"}
            mock_db.return_value.__getitem__.return_value.find_one = AsyncMock(return_value=item_doc)
            with patch("app.services.content_calendar_service.get_item_by_id", new=AsyncMock(return_value=item_doc)):
                with patch("app.services.content_calendar_service.can_manage_assets", return_value=True):
                    with patch("app.services.google_drive_service.configured", return_value=True):
                        with patch("app.services.google_drive_service.get_picker_config", new=AsyncMock(return_value={
                            "developer_key": "dev_k",
                            "client_id": "c_id",
                            "app_id": "a_id",
                            "access_token": "tok_123",
                        })):
                            res = client.get(f"{settings.API_V1_STR}/content-calendar/cal_123/picker-config")
                            self.assertEqual(res.status_code, 200)
                            self.assertIn("no-store", res.headers.get("cache-control", ""))

    def test_website_project_picker_config_and_from_drive(self):
        client = TestClient(app)

        # Picker-config 404 for missing project
        app.dependency_overrides[get_current_user] = lambda: {"id": "u_admin", "role": "admin", "is_active": True}
        with patch("app.routers.website_projects.get_database") as mock_db:
            mock_db.return_value.website_projects.find_one = AsyncMock(return_value=None)
            res = client.get(f"{settings.API_V1_STR}/website-projects/p_missing/picker-config")
            self.assertEqual(res.status_code, 404)

        # Picker-config 403 for client / unauthorized viewer
        app.dependency_overrides[get_current_user] = lambda: {"id": "u_client", "role": "client", "is_active": True}
        with patch("app.routers.website_projects.get_database") as mock_db:
            proj_doc = {"id": "p_1", "name": "Web", "manager_id": "u_pm"}
            mock_db.return_value.website_projects.find_one = AsyncMock(return_value=proj_doc)
            mock_db.return_value.website_project_tasks.find_one = AsyncMock(return_value=None)
            with patch("app.routers.website_projects.can_manage_project", return_value=False):
                res = client.get(f"{settings.API_V1_STR}/website-projects/p_1/picker-config")
                self.assertEqual(res.status_code, 403)

        # Picker-config 200 with Cache-Control: no-store for PM
        app.dependency_overrides[get_current_user] = lambda: {"id": "u_pm", "role": "team_lead", "department": "website", "is_active": True}
        with patch("app.routers.website_projects.get_database") as mock_db:
            proj_doc = {"id": "p_1", "name": "Web", "manager_id": "u_pm"}
            mock_db.return_value.website_projects.find_one = AsyncMock(return_value=proj_doc)
            with patch("app.routers.website_projects.can_manage_project", return_value=True):
                with patch("app.services.google_drive_service.configured", return_value=True):
                    with patch("app.services.google_drive_service.ensure_website_folder", new=AsyncMock(return_value="fld_123")):
                        with patch("app.services.google_drive_service.get_access_token", return_value="tok_web"):
                            with patch("app.services.google_drive_service._ensure_root", new=AsyncMock(return_value="root_123")):
                                res = client.get(f"{settings.API_V1_STR}/website-projects/p_1/picker-config")
                                self.assertEqual(res.status_code, 200)
                                self.assertIn("no-store", res.headers.get("cache-control", ""))

        # Picker-config 200 for task assignee with task_id parameter
        app.dependency_overrides[get_current_user] = lambda: {"id": "u_assignee", "role": "member", "is_active": True}
        with patch("app.routers.website_projects.get_database") as mock_db:
            proj_doc = {"id": "p_1", "name": "Web", "manager_id": "u_pm"}
            task_doc = {"id": "t_1", "project_id": "p_1", "assignee_id": "u_assignee"}
            mock_db.return_value.website_projects.find_one = AsyncMock(return_value=proj_doc)
            mock_db.return_value.website_project_tasks.find_one = AsyncMock(return_value=task_doc)
            with patch("app.routers.website_projects.can_manage_project", return_value=False):
                with patch("app.services.google_drive_service.configured", return_value=True):
                    with patch("app.services.google_drive_service.ensure_website_folder", new=AsyncMock(return_value="fld_123")):
                        with patch("app.services.google_drive_service.get_access_token", return_value="tok_web"):
                            with patch("app.services.google_drive_service._ensure_root", new=AsyncMock(return_value="root_123")):
                                res = client.get(f"{settings.API_V1_STR}/website-projects/p_1/picker-config?task_id=t_1")
                                self.assertEqual(res.status_code, 200)
                                self.assertIn("no-store", res.headers.get("cache-control", ""))

        # From-drive 404 for missing project
        app.dependency_overrides[get_current_user] = lambda: {"id": "u_admin", "role": "admin", "is_active": True}
        with patch("app.routers.website_projects.get_database") as mock_db:
            mock_db.return_value.website_projects.find_one = AsyncMock(return_value=None)
            payload = {
                "folder": "assets",
                "files": [{"id": "d1", "name": "Doc.pdf", "url": "https://drive.google.com/file/d/d1"}],
            }
            res = client.post(f"{settings.API_V1_STR}/website-projects/p_missing/files/from-drive", json=payload)
            self.assertEqual(res.status_code, 404)

        # From-drive 403 for client
        app.dependency_overrides[get_current_user] = lambda: {"id": "u_client", "role": "client", "is_active": True}
        with patch("app.routers.website_projects.get_database") as mock_db:
            mock_db.return_value.website_projects.find_one = AsyncMock(return_value={"id": "p_1"})
            with patch("app.routers.website_projects.can_manage_project", return_value=False):
                payload = {
                    "folder": "assets",
                    "files": [{"id": "d1", "name": "Doc.pdf", "url": "https://drive.google.com/file/d/d1"}],
                }
                res = client.post(f"{settings.API_V1_STR}/website-projects/p_1/files/from-drive", json=payload)
                self.assertEqual(res.status_code, 403)

        # From-drive 422 for non-drive URL
        app.dependency_overrides[get_current_user] = lambda: {"id": "u_admin", "role": "admin", "is_active": True}
        payload = {
            "folder": "assets",
            "files": [{"id": "d1", "name": "Doc.pdf", "url": "https://malicious.com/file"}],
        }
        res = client.post(f"{settings.API_V1_STR}/website-projects/p_1/files/from-drive", json=payload)
        self.assertEqual(res.status_code, 422)

        # From-drive 201 when authorized
        app.dependency_overrides[get_current_user] = lambda: {"id": "u_pm", "role": "admin", "is_active": True}
        with patch("app.routers.website_projects.get_database") as mock_db:
            mock_db.return_value.website_projects.find_one = AsyncMock(return_value={"id": "p_1"})
            with patch("app.routers.website_projects.can_manage_project", return_value=True):
                with patch("app.services.website_project_service.create_file_record", new=AsyncMock(return_value={
                    "id": "wf_1",
                    "project_id": "p_1",
                    "folder": "assets",
                    "name": "Doc.pdf",
                    "storage_key": "drive:d1",
                    "external_url": "https://drive.google.com/file/d/d1",
                    "created_at": "2026-10-10T12:00:00Z",
                })):
                    payload = {
                        "folder": "assets",
                        "files": [{"id": "d1", "name": "Doc.pdf", "url": "https://drive.google.com/file/d/d1"}],
                    }
                    res = client.post(f"{settings.API_V1_STR}/website-projects/p_1/files/from-drive", json=payload)
                    self.assertEqual(res.status_code, 201)
                    data = res.json()
                    self.assertEqual(len(data), 1)
                    self.assertEqual(data[0]["storage_key"], "drive:d1")


if __name__ == "__main__":
    unittest.main()
