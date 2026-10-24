"""Inline review streams send a private weak ETag. Outbound file IO is mocked."""
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-review-asset-cache")

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


class PublicReviewAssetCacheTests(unittest.TestCase):
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
        for started in patchers:
            started.start()
        client = TestClient(app)
        self.addCleanup(client.close)
        self.addCleanup(lambda: [started.stop() for started in reversed(patchers)])
        self.addCleanup(app.dependency_overrides.clear)
        return client

    def _doc(self, token="tok-cache", stage="Creative Client Review", approval="Pending", url=None, asset_id="att-1"):
        item_id = f"item-{token}"
        return {
            "id": item_id,
            "serial": "APX-CACHE",
            "share_token": token,
            "stage": stage,
            "approval_status": approval,
            "client_name": "Apex",
            "updated_at": "2026-10-21T00:00:00Z",
            "attachments": [
                {
                    "id": asset_id,
                    "kind": "image",
                    "filename": "slide.png",
                    "content_type": "image/png",
                    "size_bytes": 128,
                    "uploaded_at": "2026-10-21T00:00:00Z",
                    "google_drive_file_id": "drive-file-1",
                    "url": url or f"/uploads/content_calendar/{item_id}/slide.png",
                }
            ],
        }

    def _asset_url(self, token="tok-cache", asset_id="att-1"):
        return f"/api/v1/content-calendar/public/review/{token}/assets/{asset_id}"

    def test_inline_etag_and_conditional_304_require_a_valid_token(self):
        token = "tok-cache"
        client = self._client_for(self._doc(token))
        opener = AsyncMock(return_value=Response(content=b"png-bytes", media_type="image/png"))
        with patch("app.core.uploads.open_upload_response", new=opener):
            first = client.get(self._asset_url(token))
            self.assertEqual(first.status_code, 200, first.text)
            etag = first.headers.get("etag")
            self.assertTrue(etag and etag.startswith('W/"'), etag)
            self.assertNotIn("public", first.headers.get("cache-control", ""))
            self.assertEqual(first.headers.get("cache-control"), "private, max-age=3600")
            self.assertEqual(first.content, b"png-bytes")
            self.assertEqual(opener.await_count, 1)

            cached = client.get(self._asset_url(token), headers={"If-None-Match": etag})
            self.assertEqual(cached.status_code, 304, cached.text)
            self.assertEqual(cached.headers.get("etag"), etag)
            self.assertEqual(cached.headers.get("cache-control"), "private, max-age=3600")
            self.assertEqual(opener.await_count, 1)

            starred = client.get(self._asset_url(token), headers={"If-None-Match": "*"})
            self.assertEqual(starred.status_code, 304, starred.text)
            self.assertEqual(opener.await_count, 1)

            mismatched = client.get(self._asset_url(token), headers={"If-None-Match": 'W/"nope"'})
            self.assertEqual(mismatched.status_code, 200, mismatched.text)
            self.assertEqual(opener.await_count, 2)

            missing = client.get(
                self._asset_url("not-a-real-token"),
                headers={"If-None-Match": "*"},
            )
            self.assertEqual(missing.status_code, 404, missing.text)
            self.assertEqual(opener.await_count, 2)

    def test_forbidden_and_expired_tokens_do_not_304(self):
        forbidden = self._client_for(
            self._doc(token="tok-forbid", url="/uploads/other-bucket/slide.png")
        )
        opener = AsyncMock(return_value=Response(content=b"png-bytes", media_type="image/png"))
        with patch("app.core.uploads.open_upload_response", new=opener):
            denied = forbidden.get(self._asset_url("tok-forbid"), headers={"If-None-Match": "*"})
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(opener.await_count, 0)

        expired = self._client_for(
            self._doc(token="tok-expired", stage="Rejected", approval="Rejected")
        )
        with patch("app.core.uploads.open_upload_response", new=opener):
            gone = expired.get(self._asset_url("tok-expired"), headers={"If-None-Match": "*"})
        self.assertEqual(gone.status_code, 410, gone.text)
        self.assertNotEqual(gone.status_code, 304)
        self.assertEqual(opener.await_count, 0)

    def test_download_response_stays_no_store(self):
        token = "tok-dl"
        client = self._client_for(self._doc(token))
        opener = AsyncMock(return_value=Response(content=b"png-bytes", media_type="image/png"))
        with patch("app.core.uploads.open_upload_response", new=opener):
            res = client.get(
                self._asset_url(token),
                params={"download": 1},
                headers={"If-None-Match": "*"},
            )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.headers.get("cache-control"), "private, no-store")
        self.assertNotIn("public", res.headers.get("cache-control", ""))
        self.assertIsNone(res.headers.get("etag"))
        self.assertEqual(res.content, b"png-bytes")
        self.assertEqual(opener.await_count, 1)


if __name__ == "__main__":
    unittest.main()
