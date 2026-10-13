"""Drive picker-config must not return org tokens; item access stays gated."""
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.routers.content_calendar import router as content_calendar_router
from app.routers.website_projects import router as website_projects_router
from app.services.content_calendar_access import require_content_calendar_user
from app.services import google_drive_service as gdrive


def _limited_app() -> FastAPI:
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(content_calendar_router, prefix="/api/v1")
    app.include_router(website_projects_router, prefix="/api/v1")
    return app


class TestPickerPublicPayload(unittest.TestCase):
    def test_payload_has_no_access_token(self):
        fake_settings = MagicMock()
        fake_settings.GOOGLE_DRIVE_API_KEY = "dev-key"
        fake_settings.GOOGLE_DRIVE_WEB_CLIENT_ID = "123456-abc.apps.googleusercontent.com"
        fake_settings.GOOGLE_DRIVE_CLIENT_ID = "other"
        with patch("app.config.settings", fake_settings):
            payload = gdrive.picker_public_payload(
                "folder-1",
                "root-1",
                actor={"id": "user-1"},
                item_id="item-1",
                workspace_id="ws-1",
                context="content_calendar",
            )
        self.assertNotIn("access_token", payload)
        self.assertEqual(payload["developer_key"], "dev-key")
        self.assertEqual(payload["client_id"], "123456-abc.apps.googleusercontent.com")
        self.assertEqual(payload["app_id"], "123456")
        self.assertEqual(payload["folder_id"], "folder-1")
        self.assertEqual(payload["root_folder_id"], "root-1")

    def test_ingest_inaccessible_file_is_400(self):
        from googleapiclient.errors import HttpError

        resp = MagicMock()
        resp.status = 403
        resp.reason = "Forbidden"
        with patch.object(gdrive, "_file_meta", side_effect=HttpError(resp, b"denied")):
            with self.assertRaises(HTTPException) as ctx:
                gdrive._ingest_picked_file_sync("picked-file", "dest-folder")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_ingest_copies_when_not_already_in_dest(self):
        meta = {"id": "picked-file", "name": "brief.pdf", "parents": ["other"]}
        copied = {"id": "copied-file", "name": "brief.pdf"}
        files_api = MagicMock()
        files_api.copy.return_value.execute.return_value = copied
        service = MagicMock()
        service.files.return_value = files_api
        with patch.object(gdrive, "_file_meta", return_value=meta), patch.object(
            gdrive, "_service", return_value=service
        ):
            out = gdrive._ingest_picked_file_sync("picked-file", "dest-folder")
        self.assertEqual(out["id"], "copied-file")
        files_api.copy.assert_called_once()

    def test_ingest_skips_copy_when_already_in_folder(self):
        meta = {"id": "picked-file", "name": "brief.pdf", "parents": ["dest-folder"]}
        with patch.object(gdrive, "_file_meta", return_value=meta), patch.object(
            gdrive, "_service"
        ) as svc:
            out = gdrive._ingest_picked_file_sync("picked-file", "dest-folder")
        self.assertEqual(out["id"], "picked-file")
        svc.assert_not_called()


class TestPickerConfigHttp(unittest.TestCase):
    def test_content_calendar_403_without_asset_access(self):
        app = _limited_app()
        user = {
            "id": "u-viewer",
            "email": "viewer@reamarc.test",
            "role": "team_member",
            "is_active": True,
        }
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[require_content_calendar_user] = lambda: user
        item = {"id": "item-1", "serial": "CC-1"}
        db = MagicMock()
        db.__getitem__ = MagicMock(return_value=MagicMock(find_one=AsyncMock(return_value=item)))

        with patch("app.routers.content_calendar.get_database", return_value=db), patch(
            "app.services.content_calendar_service.get_item_by_id",
            new_callable=AsyncMock,
            return_value=item,
        ), patch(
            "app.services.content_calendar_service.can_manage_assets",
            return_value=False,
        ):
            client = TestClient(app)
            res = client.get("/api/v1/content-calendar/item-1/picker-config")
        self.assertEqual(res.status_code, 403, res.text)

    def test_content_calendar_picker_config_omits_token(self):
        app = _limited_app()
        user = {
            "id": "u-editor",
            "email": "editor@reamarc.test",
            "role": "admin",
            "is_active": True,
        }
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[require_content_calendar_user] = lambda: user
        item = {"id": "item-1", "serial": "CC-1"}
        db = MagicMock()

        with patch("app.routers.content_calendar.get_database", return_value=db), patch(
            "app.services.content_calendar_service.get_item_by_id",
            new_callable=AsyncMock,
            return_value=item,
        ), patch(
            "app.services.content_calendar_service.can_manage_assets",
            return_value=True,
        ), patch(
            "app.services.google_drive_service.configured",
            return_value=True,
        ), patch(
            "app.services.google_drive_service.get_picker_config",
            new_callable=AsyncMock,
            return_value={
                "developer_key": "k",
                "client_id": "cid",
                "app_id": "app",
                "folder_id": "f",
                "root_folder_id": "r",
            },
        ):
            client = TestClient(app)
            res = client.get("/api/v1/content-calendar/item-1/picker-config")
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertNotIn("access_token", body)
        self.assertEqual(body["developer_key"], "k")

    def test_website_403_without_manage_or_assignee(self):
        app = _limited_app()
        user = {
            "id": "u-other",
            "email": "other@reamarc.test",
            "role": "team_member",
            "is_active": True,
        }
        app.dependency_overrides[get_current_user] = lambda: user
        db = MagicMock()
        db.website_projects.find_one = AsyncMock(return_value={"id": "proj-1", "manager_id": "someone-else"})
        db.website_project_tasks.find_one = AsyncMock(return_value=None)

        with patch("app.routers.website_projects.get_database", return_value=db), patch(
            "app.routers.website_projects.can_manage_project",
            return_value=False,
        ):
            client = TestClient(app)
            res = client.get("/api/v1/website-projects/proj-1/picker-config")
        self.assertEqual(res.status_code, 403, res.text)

    def test_website_picker_config_omits_token_for_manager(self):
        app = _limited_app()
        user = {
            "id": "u-mgr",
            "email": "mgr@reamarc.test",
            "role": "admin",
            "is_active": True,
        }
        app.dependency_overrides[get_current_user] = lambda: user
        db = MagicMock()
        db.website_projects.find_one = AsyncMock(
            return_value={"id": "proj-1", "manager_id": "u-mgr", "workspace_id": "ws"}
        )

        with patch("app.routers.website_projects.get_database", return_value=db), patch(
            "app.routers.website_projects.can_manage_project",
            return_value=True,
        ), patch(
            "app.services.google_drive_service.configured",
            return_value=True,
        ), patch(
            "app.services.google_drive_service.ensure_website_folder",
            new_callable=AsyncMock,
            return_value="site-folder",
        ), patch(
            "app.services.google_drive_service._ensure_root",
            new_callable=AsyncMock,
            return_value="root",
        ), patch(
            "app.services.google_drive_service.picker_public_payload",
            return_value={
                "developer_key": "k",
                "client_id": "cid",
                "app_id": "app",
                "folder_id": "site-folder",
                "root_folder_id": "root",
            },
        ):
            client = TestClient(app)
            res = client.get("/api/v1/website-projects/proj-1/picker-config")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertNotIn("access_token", res.json())


if __name__ == "__main__":
    unittest.main()
