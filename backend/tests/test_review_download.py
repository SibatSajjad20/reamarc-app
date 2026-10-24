"""Public review-link download gate: client review vs revision / production."""
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-review-download")

from fastapi import FastAPI, Response
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.core.limiter import limiter
from app.database import get_database
from app.routers.content_calendar import router as calendar_router
from app.services.content_calendar_service import COLLECTION_NAME


class CalendarCollection:
    def __init__(self, doc):
        self.doc = dict(doc)

    async def find_one(self, query, projection=None):
        token = (query or {}).get("share_token")
        if token and token == self.doc.get("share_token"):
            return dict(self.doc)
        return None

    async def update_one(self, query, update):
        return MagicMock()


class FakeDB:
    def __init__(self, doc):
        self._coll = CalendarCollection(doc)

    def __getitem__(self, name):
        if name == COLLECTION_NAME:
            return self._coll
        raise KeyError(name)


class ReviewDownloadTests(unittest.TestCase):
    def _client_for(self, doc):
        db = FakeDB(doc)
        app = FastAPI()
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        app.include_router(calendar_router, prefix=settings.API_V1_STR)
        app.dependency_overrides[get_database] = lambda: db
        patchers = [
            patch("app.database.get_database", lambda: db),
            patch("app.routers.content_calendar.get_database", lambda: db),
            patch("app.core.tenant.get_global_db", lambda: None),
        ]
        for p in patchers:
            p.start()
        client = TestClient(app)
        self.addCleanup(client.close)
        self.addCleanup(lambda: [p.stop() for p in reversed(patchers)])
        self.addCleanup(app.dependency_overrides.clear)
        return client

    def _doc(self, token, stage, approval_status, asset_id="att-1"):
        return {
            "id": f"item-{token}",
            "serial": "APX-001",
            "share_token": token,
            "stage": stage,
            "approval_status": approval_status,
            "client_name": "Apex",
            "attachments": [
                {
                    "id": asset_id,
                    "kind": "image",
                    "filename": "slide.png",
                    "url": f"/uploads/content_calendar/item-{token}/slide.png",
                }
            ],
        }

    def test_approved_moved_to_creative_revision_page_200_download_410(self):
        token = "tok-rev"
        doc = self._doc(token, "Creative Revision", "Approved")
        client = self._client_for(doc)
        page = client.get(f"/api/v1/content-calendar/public/review/{token}")
        # Review link stays open at every stage (Oct 2026): page loads, changes can be requested, no approve.
        self.assertEqual(page.status_code, 200, page.text)
        self.assertFalse(page.json().get("can_approve"))
        self.assertTrue(page.json().get("can_request_changes"))
        self.assertFalse(page.json().get("download_allowed"))
        dl = client.get(f"/api/v1/content-calendar/public/review/{token}/assets/att-1?download=1")
        self.assertEqual(dl.status_code, 410, dl.text)

    def test_creative_production_page_200_download_410(self):
        token = "tok-prod"
        doc = self._doc(token, "Creative Production", "Content Approved")
        client = self._client_for(doc)
        page = client.get(f"/api/v1/content-calendar/public/review/{token}")
        # Review link stays open at every stage (Oct 2026): page loads, changes can be requested, no approve.
        self.assertEqual(page.status_code, 200, page.text)
        self.assertFalse(page.json().get("can_approve"))
        self.assertTrue(page.json().get("can_request_changes"))
        self.assertFalse(page.json().get("download_allowed"))
        dl = client.get(f"/api/v1/content-calendar/public/review/{token}/assets/att-1?download=1")
        self.assertEqual(dl.status_code, 410, dl.text)

    def test_rejected_is_410(self):
        token = "tok-rej"
        client = self._client_for(self._doc(token, "Rejected", "Rejected"))
        self.assertEqual(client.get(f"/api/v1/content-calendar/public/review/{token}").status_code, 410)

    def test_creative_review_stage_is_200_download_allowed(self):
        token = "tok-crev"
        doc = self._doc(token, "Creative Client Review", "Creative Client Review")
        client = self._client_for(doc)
        page = client.get(f"/api/v1/content-calendar/public/review/{token}")
        self.assertEqual(page.status_code, 200, page.text)
        body = page.json()
        self.assertFalse(body.get("download_only"))
        self.assertTrue(body.get("download_allowed"))
        fake_file = Response(content=b"png", media_type="image/png")
        with patch(
            "app.core.uploads.open_upload_response",
            new=AsyncMock(return_value=fake_file),
        ):
            dl = client.get(f"/api/v1/content-calendar/public/review/{token}/assets/att-1?download=1")
        self.assertEqual(dl.status_code, 200, dl.text)

    def _assert_internal_stage_blocks_download(self, stage, token):
        doc = self._doc(token, stage, "Pending")
        client = self._client_for(doc)
        page = client.get(f"/api/v1/content-calendar/public/review/{token}")
        self.assertEqual(page.status_code, 200, page.text)
        body = page.json()
        self.assertFalse(body.get("download_allowed"))
        dl = client.get(f"/api/v1/content-calendar/public/review/{token}/assets/att-1?download=1")
        self.assertEqual(dl.status_code, 410, dl.text)

    def test_content_stage_download_is_410_page_stays_200(self):
        self._assert_internal_stage_blocks_download("Content", "tok-content")

    def test_content_internal_review_download_is_410_page_stays_200(self):
        self._assert_internal_stage_blocks_download("Content Internal Review", "tok-cir")

    def test_creative_internal_review_download_is_410_page_stays_200(self):
        self._assert_internal_stage_blocks_download("Creative Internal Review", "tok-crir")

    def test_creative_client_review_changes_requested_download_is_200(self):
        token = "tok-crev-changes"
        doc = self._doc(token, "Creative Client Review", "Changes Requested")
        client = self._client_for(doc)
        page = client.get(f"/api/v1/content-calendar/public/review/{token}")
        self.assertEqual(page.status_code, 200, page.text)
        self.assertTrue(page.json().get("download_allowed"))
        fake_file = Response(content=b"png", media_type="image/png")
        with patch(
            "app.core.uploads.open_upload_response",
            new=AsyncMock(return_value=fake_file),
        ):
            dl = client.get(f"/api/v1/content-calendar/public/review/{token}/assets/att-1?download=1")
        self.assertEqual(dl.status_code, 200, dl.text)

    def test_approved_not_in_revision_is_200_download_only(self):
        token = "tok-ok"
        doc = self._doc(token, "Ready to Post", "Approved for Campaign")
        client = self._client_for(doc)
        page = client.get(f"/api/v1/content-calendar/public/review/{token}")
        self.assertEqual(page.status_code, 200, page.text)
        body = page.json()
        self.assertTrue(body.get("download_only") or body.get("read_only"))
        self.assertTrue(body.get("download_allowed"))
        fake_file = Response(content=b"png", media_type="image/png")
        with patch(
            "app.core.uploads.open_upload_response",
            new=AsyncMock(return_value=fake_file),
        ):
            dl = client.get(f"/api/v1/content-calendar/public/review/{token}/assets/att-1?download=1")
        self.assertEqual(dl.status_code, 200, dl.text)


if __name__ == "__main__":
    unittest.main()
