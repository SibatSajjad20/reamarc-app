"""Video review links expose a token-scoped JPEG still for WhatsApp previews. Drive is mocked; no network, no real DB."""
from __future__ import annotations

import io
import os
import socket
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-review-video-og")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.core.limiter import limiter
from app.database import get_database
from app.routers.content_calendar import router as calendar_router
from app.services.content_calendar_service import COLLECTION_NAME

TOKEN = "tok_video_og_company_a"
OTHER_TOKEN = "tok_video_og_company_b"
BASE = "/api/v1/content-calendar/public/review"


def _png(w=1920, h=1080):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 40, 90)).save(buf, "PNG")
    return buf.getvalue()


def _doc(token, item_id, company, drive_id, asset_id="ast_vid"):
    return {
        "id": item_id, "serial": item_id.upper(), "share_token": token, "company_id": company,
        "stage": "Creative Client Review", "approval_status": "Pending",
        "client_name": "Apex", "content_concept": "Reel", "updated_at": "2026-10-23T00:00:00Z",
        "attachments": [{
            "id": asset_id, "kind": "video", "content_type": "video/mp4", "filename": "reel.mp4",
            "url": f"gdrive/{drive_id}/reel.mp4", "google_drive_file_id": drive_id, "thumbnail_url": None,
        }],
    }


class Coll:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        tok = (query or {}).get("share_token")
        for d in self.docs:
            if tok and d.get("share_token") == tok:
                return dict(d)
        return None

    async def update_one(self, *a, **k):
        return MagicMock()


class DB:
    def __init__(self, docs):
        self.c = Coll(docs)

    def __getitem__(self, name):
        if name == COLLECTION_NAME:
            return self.c
        return Coll([])

    def __getattr__(self, name):
        if name == "workspaces":
            return Coll([])
        raise AttributeError(name)


_real_connect = socket.socket.connect


def _connect_loopback_only(self, addr, *args, **kwargs):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *args, **kwargs)
    raise OSError("outbound blocked in tests")


class VideoOgTests(unittest.TestCase):
    def setUp(self):
        self._sock = patch.object(socket.socket, "connect", new=_connect_loopback_only)
        self._sock.start()
        self.addCleanup(self._sock.stop)
        db = DB([_doc(TOKEN, "item-a", "company_a", "DRIVE_A"), _doc(OTHER_TOKEN, "item-b", "company_b", "DRIVE_B")])
        app = FastAPI()
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        app.include_router(calendar_router, prefix=settings.API_V1_STR)
        app.dependency_overrides[get_database] = lambda: db
        ps = [patch("app.database.get_database", lambda: db),
              patch("app.routers.content_calendar.get_database", lambda: db),
              patch("app.core.tenant.get_global_db", lambda: None)]
        for p in ps:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in reversed(ps)])
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_payload_fills_video_thumbnail(self):
        r = self.client.get(f"{BASE}/{TOKEN}")
        self.assertEqual(r.status_code, 200, r.text)
        att = r.json()["attachments"][0]
        want = f"{BASE}/{TOKEN}/assets/ast_vid?og=1"
        self.assertEqual(att.get("thumbnail_url"), want)
        self.assertEqual(att.get("og_image_url"), want)

    def test_serves_small_jpeg_from_own_drive_file(self):
        fetch = AsyncMock(return_value=_png())
        with patch("app.services.google_drive_service.fetch_drive_thumbnail_bytes", fetch):
            r = self.client.get(f"{BASE}/{TOKEN}/assets/ast_vid?og=1", follow_redirects=False)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.headers["content-type"], "image/jpeg")
        self.assertIn("max-age", r.headers.get("cache-control", ""))
        self.assertLess(len(r.content), 300 * 1024)
        img = Image.open(io.BytesIO(r.content))
        self.assertEqual(img.format, "JPEG")
        self.assertLessEqual(img.width, 1200)
        self.assertEqual(fetch.await_args.args[0], "DRIVE_A")

    def test_invalid_token_rejected(self):
        fetch = AsyncMock(return_value=_png())
        with patch("app.services.google_drive_service.fetch_drive_thumbnail_bytes", fetch):
            r = self.client.get(f"{BASE}/not_a_real_token_123/assets/ast_vid?og=1", follow_redirects=False)
        self.assertEqual(r.status_code, 404)
        fetch.assert_not_awaited()

    def test_other_company_token_only_reaches_its_own_file(self):
        fetch = AsyncMock(return_value=_png())
        with patch("app.services.google_drive_service.fetch_drive_thumbnail_bytes", fetch):
            r = self.client.get(f"{BASE}/{OTHER_TOKEN}/assets/ast_vid?og=1", follow_redirects=False)
            self.assertEqual(r.status_code, 200)
            self.assertEqual(fetch.await_args.args[0], "DRIVE_B")
            r2 = self.client.get(f"{BASE}/{OTHER_TOKEN}/assets/ast_other_company?og=1", follow_redirects=False)
        self.assertEqual(r2.status_code, 404)

    def test_drive_failure_falls_back_to_default_card(self):
        for side in (RuntimeError("drive down"), None, b"not-an-image"):
            kw = {"side_effect": side} if isinstance(side, Exception) else {"return_value": side}
            with patch("app.services.google_drive_service.fetch_drive_thumbnail_bytes", AsyncMock(**kw)):
                r = self.client.get(f"{BASE}/{TOKEN}/assets/ast_vid?og=1", follow_redirects=False)
            self.assertEqual(r.status_code, 302, side)
            self.assertEqual(r.headers["location"], "/og-review.png")


if __name__ == "__main__":
    unittest.main()
