"""Public review download=1 streams original GridFS bytes. Throwaway Mongo only."""
from __future__ import annotations

import os
import sys
import unittest

TEST_DB = os.getenv("TEST_MONGODB_DB_NAME", "reamarc_public_review_download_test")
assert "test" in TEST_DB.lower(), "FATAL: Not using a test database"
assert TEST_DB != "reamarc_db", "FATAL: Attempted to run on production database"
assert "reamarc_db" not in TEST_DB

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings

import httpx

from app.core.uploads import save_upload_bytes
from app.database import close_mongo_connection, connect_to_mongo, get_database
from app.main import app
from app.services.content_calendar_service import COLLECTION_NAME

ORIG_A = b"PNG-ORIGINAL-A-BYTES"
ORIG_B = b"PNG-ORIGINAL-B-BYTES"
THUMB_A = b"THUMB-NOT-ORIGINAL"
TOKEN = "cc_tok_review_download_test"
OTHER_TOKEN = "cc_tok_other_item"
ITEM_ID = "cc-review-dl-1"
OTHER_ID = "cc-review-dl-other"


class TestPublicReviewDownload(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._prev_db = settings.MONGODB_DB_NAME
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in settings.MONGODB_DB_NAME.lower()
        assert settings.MONGODB_DB_NAME != "reamarc_db"
        await connect_to_mongo()
        self.db = get_database()
        self.assertIsNotNone(self.db)
        self.assertEqual(self.db.name, TEST_DB)

        from app.core.limiter import limiter

        limiter.enabled = False
        if hasattr(app.state, "limiter"):
            app.state.limiter.enabled = False

        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

        await self.db[COLLECTION_NAME].delete_many({"id": {"$in": [ITEM_ID, OTHER_ID]}})
        await save_upload_bytes(
            self.db,
            relative_key=f"content_calendar/{ITEM_ID}/orig-a.png",
            content=ORIG_A,
            original_name="slide-a.png",
            content_type="image/png",
        )
        await save_upload_bytes(
            self.db,
            relative_key=f"content_calendar/{ITEM_ID}/thumb-a.png",
            content=THUMB_A,
            original_name="thumb-a.png",
            content_type="image/png",
        )
        await save_upload_bytes(
            self.db,
            relative_key=f"content_calendar/{ITEM_ID}/orig-b.png",
            content=ORIG_B,
            original_name="slide-b.png",
            content_type="image/png",
        )
        await save_upload_bytes(
            self.db,
            relative_key=f"content_calendar/{OTHER_ID}/other.png",
            content=b"OTHER-ITEM-BYTES",
            original_name="other.png",
            content_type="image/png",
        )

        self.base_item = {
            "id": ITEM_ID,
            "serial": "CAT-DL-1",
            "stage": "Creative Client Review",
            "approval_status": "Pending",
            "share_token": TOKEN,
            "client_name": "Apex",
            "content_concept": "Download test",
            "attachments": [
                {
                    "id": "att-a",
                    "kind": "image",
                    "filename": "slide-a.png",
                    "content_type": "image/png",
                    "size_bytes": len(ORIG_A),
                    "url": f"/uploads/content_calendar/{ITEM_ID}/orig-a.png",
                    "thumbnail_url": f"/uploads/content_calendar/{ITEM_ID}/thumb-a.png",
                },
                {
                    "id": "att-b",
                    "kind": "image",
                    "filename": "slide-b.png",
                    "content_type": "image/png",
                    "size_bytes": len(ORIG_B),
                    "url": f"/uploads/content_calendar/{ITEM_ID}/orig-b.png",
                },
                {
                    "id": "att-link",
                    "kind": "link",
                    "filename": "drive-link",
                    "url": "https://example.com/file",
                },
            ],
        }
        await self.db[COLLECTION_NAME].insert_one(dict(self.base_item))
        await self.db[COLLECTION_NAME].insert_one(
            {
                "id": OTHER_ID,
                "serial": "CAT-DL-2",
                "stage": "Creative Client Review",
                "approval_status": "Pending",
                "share_token": OTHER_TOKEN,
                "attachments": [
                    {
                        "id": "att-other",
                        "kind": "image",
                        "filename": "other.png",
                        "url": f"/uploads/content_calendar/{OTHER_ID}/other.png",
                    }
                ],
            }
        )

    async def asyncTearDown(self):
        if getattr(self, "db", None) is not None:
            await self.db[COLLECTION_NAME].delete_many({"id": {"$in": [ITEM_ID, OTHER_ID]}})
        if getattr(self, "client", None) is not None:
            await self.client.aclose()
        await close_mongo_connection()
        if getattr(self, "_prev_db", None):
            object.__setattr__(settings, "MONGODB_DB_NAME", self._prev_db)

    def _dl(self, token: str, asset_id: str, **kwargs):
        return self.client.get(
            f"/api/v1/content-calendar/public/review/{token}/assets/{asset_id}",
            params={"download": 1, **kwargs.pop("params", {})},
            **kwargs,
        )

    async def test_download_original_bytes_not_thumbnail(self):
        res = await self._dl(TOKEN, "att-a")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertIn("attachment", res.headers.get("content-disposition", "").lower())
        self.assertIn("slide-a.png", res.headers.get("content-disposition", ""))
        self.assertEqual(res.headers.get("cache-control"), "private, no-store")
        self.assertEqual(res.content, ORIG_A)
        self.assertNotEqual(res.content, THUMB_A)

        payload = await self.client.get(f"/api/v1/content-calendar/public/review/{TOKEN}")
        self.assertEqual(payload.status_code, 200, payload.text)
        body = payload.json()
        urls = [att.get("download_url") for att in body.get("attachments") or [] if att.get("kind") != "link"]
        self.assertTrue(all(u and "download=1" in u for u in urls))
        self.assertTrue(body.get("download_allowed"))

    async def test_foreign_asset_id_is_404(self):
        res = await self._dl(TOKEN, "att-other")
        self.assertEqual(res.status_code, 404)

    async def test_bad_token_is_404(self):
        res = await self._dl("not-a-real-token", "att-a")
        self.assertEqual(res.status_code, 404)

    async def test_changes_requested_is_410(self):
        await self.db[COLLECTION_NAME].update_one(
            {"id": ITEM_ID},
            {"$set": {"approval_status": "Changes Requested", "stage": "Creative Revision"}},
        )
        res = await self._dl(TOKEN, "att-a")
        self.assertEqual(res.status_code, 410)

    async def test_approved_download_works_and_approve_is_blocked(self):
        await self.db[COLLECTION_NAME].update_one(
            {"id": ITEM_ID},
            {"$set": {"approval_status": "Approved", "stage": "Ready to Post"}},
        )
        page = await self.client.get(f"/api/v1/content-calendar/public/review/{TOKEN}")
        self.assertEqual(page.status_code, 200, page.text)
        body = page.json()
        self.assertTrue(body.get("read_only"))
        self.assertTrue(body.get("download_only"))

        res = await self._dl(TOKEN, "att-a")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.content, ORIG_A)

        action = await self.client.post(
            f"/api/v1/content-calendar/public/review/{TOKEN}/action",
            json={"action": "approve", "reviewer_name": "Client"},
        )
        self.assertIn(action.status_code, (410, 409))

    async def test_link_attachment_download_is_404(self):
        res = await self._dl(TOKEN, "att-link")
        self.assertEqual(res.status_code, 404)

    async def test_range_download_returns_206(self):
        res = await self._dl(TOKEN, "att-a", headers={"Range": "bytes=0-4"})
        self.assertEqual(res.status_code, 206, res.text)
        self.assertEqual(res.content, ORIG_A[:5])
        self.assertIn("attachment", res.headers.get("content-disposition", "").lower())
