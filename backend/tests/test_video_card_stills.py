"""Video cards and review links get a still frame even when no thumbnail was saved at upload.

Throwaway Mongo only; Drive is mocked; no outbound network.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from io import BytesIO
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test-secret-key-video-stills-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx
from PIL import Image

from app.config import settings
from app.core.security import claims_with_session, create_access_token
from app.database import connect_to_mongo
from app.main import app

TEST_DB = "reamarc_test_video_card_stills"
A, B = "company_test_a", "company_test_b"
ITEM = "cc_vid_item_1"
VKEY = f"content_calendar/{ITEM}/ast_up1_reel.mp4"
TOKEN = "tok-video-direct-123"


def _tiny_mp4() -> bytes:
    from app.services.content_calendar_service import _ffmpeg_bin
    ff = _ffmpeg_bin()
    out = tempfile.mktemp(suffix=".mp4")
    subprocess.run([ff, "-y", "-f", "lavfi", "-i", "color=c=red:s=320x240:d=2", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", out], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(out, "rb") as f:
        data = f.read()
    os.unlink(out)
    return data


def _jpeg() -> bytes:
    b = BytesIO(); Image.new("RGB", (800, 450), (10, 120, 200)).save(b, "JPEG"); return b.getvalue()


import socket

_real_connect = socket.socket.connect


def _loopback_only(self, addr, *a, **k):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *a, **k)
    raise OSError("outbound blocked in tests")


class TestVideoCardStills(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        guard = mock.patch.object(socket.socket, "connect", new=_loopback_only)
        guard.start()
        self.addCleanup(guard.stop)
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in TEST_DB and TEST_DB != "reamarc_db"
        await connect_to_mongo()
        from app.database import db_instance
        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        from app.core.limiter import limiter
        limiter.enabled = False
        from app.core import uploads, thumbs
        uploads._GDRIVE_AUTH_CACHE.clear()
        thumbs._video_misses.clear()
        self.companies = {}
        for cid in (A, B):
            c = {"id": cid, "name": cid, "status": "active", "token_version": 0}
            self.companies[cid] = c
            await self.db.companies.insert_one(dict(c))
        self.users = {}
        for uid, cid, role in (("adm_a", A, "admin"), ("adm_b", B, "admin")):
            u = {"id": uid, "email": f"{uid}@example.test", "full_name": uid, "role": role, "is_active": True,
                 "company_id": cid, "session_epoch": 0, "primary_department": "Operations", "departments": ["Operations"],
                 "refresh_jtis": [f"web-{uid}"], "refresh_retired": []}
            m = {"id": f"m_{uid}", "user_id": uid, "company_id": cid, "status": "active", "role": role,
                 "primary_department": "Operations", "departments": ["Operations"], "token_version": 0}
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            self.users[uid] = (u, m)
        from app.core.uploads import save_upload_bytes
        await save_upload_bytes(self.db, relative_key=VKEY, content=_tiny_mp4(), original_name="reel.mp4",
                                content_type="video/mp4", extra_metadata={"item_id": ITEM})
        # Direct upload, no still saved (ffmpeg failed at upload time in production).
        await self.db.content_calendar_items.insert_one({
            "id": ITEM, "serial": "CADS-T20", "company_id": A, "stage": "Creative Client Review",
            "approval_status": "Pending", "title": "t", "share_token": TOKEN,
            "attachments": [{"id": "ast_up1", "kind": "video", "content_type": "video/mp4", "filename": "reel.mp4",
                             "url": f"/uploads/{VKEY}", "thumbnail_url": None,
                             "thumbnail_failed_at": "2026-10-20T00:00:00Z"}],
        })
        # Picked from Drive before Drive had made its preview.
        await self.db.content_calendar_items.insert_one({
            "id": "cc_vid_drive", "serial": "CSB-T05", "company_id": A, "stage": "Creative Client Review",
            "approval_status": "Pending", "title": "d", "share_token": "tok-video-drive-123",
            "attachments": [{"id": "ast_dv1", "kind": "video", "content_type": "video/mp4", "filename": "Reel.mp4",
                             "google_drive_file_id": "DRIVEVID1", "url": "/uploads/gdrive/DRIVEVID1/Reel.mp4",
                             "thumbnail_url": None, "thumbnail_failed_at": "2026-10-20T00:00:00Z"}],
        })
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        from app.database import db_instance
        await db_instance.client.drop_database(TEST_DB)
        db_instance.client.close()
        db_instance.client = None
        db_instance.db = None

    def _auth(self, uid):
        u, m = self.users[uid]
        base = {"sub": uid, "email": u["email"], "name": uid, "role": m["role"], "cid": u["company_id"],
                "workspace_ids": [], "mid": m["id"], "mtv": 0}
        c = claims_with_session(u, base, company_doc=self.companies[u["company_id"]], membership_doc=m)
        return {"Authorization": f"Bearer {create_access_token(dict(c, sid=f'web-{uid}'))}", "X-Requested-With": "XMLHttpRequest"}

    async def _get(self, path, uid=None, **headers):
        self.client.cookies.clear()
        h = dict(self._auth(uid)) if uid else {}
        h.update(headers)
        return await self.client.get(path, headers=h)

    async def test_direct_upload_video_card_gets_small_cached_still(self):
        r = await self._get(f"/api/v1/thumbs/{VKEY}?w=400", "adm_a")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.headers["content-type"], "image/webp")
        self.assertLess(len(r.content), 100_000)
        self.assertIn("max-age=2592000", r.headers["cache-control"])
        again = await self._get(f"/api/v1/thumbs/{VKEY}?w=400", "adm_a", **{"If-None-Match": r.headers["etag"]})
        self.assertEqual(again.status_code, 304)
        self.assertIn((await self._get(f"/api/v1/thumbs/{VKEY}?w=400", "adm_b")).status_code, (403, 404))
        self.assertEqual((await self._get(f"/api/v1/thumbs/{VKEY}?w=400")).status_code, 401)

    async def test_drive_video_card_uses_drive_preview_and_blocks_other_company(self):
        from app.services import google_drive_service as g
        with mock.patch.object(g, "fetch_drive_thumbnail_bytes", mock.AsyncMock(return_value=_jpeg())) as fetch, \
             mock.patch.object(g, "download_file_prefix", mock.AsyncMock(side_effect=AssertionError("no video download"))):
            r = await self._get("/api/v1/thumbs/gdrive/DRIVEVID1/Reel.mp4?w=400", "adm_a")
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(r.headers["content-type"], "image/webp")
            self.assertEqual(fetch.await_args.args[0], "DRIVEVID1")
            self.assertIn((await self._get("/api/v1/thumbs/gdrive/DRIVEVID1/Reel.mp4?w=400", "adm_b")).status_code, (403, 404))

    async def test_drive_failure_is_404_and_not_retried_every_load(self):
        from app.services import google_drive_service as g
        fetch = mock.AsyncMock(return_value=None)
        prefix = mock.AsyncMock(return_value=b"not-a-video")
        with mock.patch.object(g, "fetch_drive_thumbnail_bytes", fetch), mock.patch.object(g, "download_file_prefix", prefix):
            self.assertEqual((await self._get("/api/v1/thumbs/gdrive/DRIVEVID1/Reel.mp4?w=400", "adm_a")).status_code, 404)
            self.assertEqual((await self._get("/api/v1/thumbs/gdrive/DRIVEVID1/Reel.mp4?w=400", "adm_a")).status_code, 404)
        self.assertEqual(fetch.await_count, 1)
        self.assertEqual(prefix.await_count, 1)

    async def test_whatsapp_preview_for_direct_upload_video(self):
        p = await self._get(f"/api/v1/content-calendar/public/review/{TOKEN}")
        self.assertEqual(p.status_code, 200, p.text)
        att = p.json()["attachments"][0]
        og = f"/api/v1/content-calendar/public/review/{TOKEN}/assets/ast_up1?og=1"
        self.assertEqual(att.get("og_image_url"), og)
        r = await self._get(og)
        self.assertEqual(r.status_code, 200, r.headers.get("location"))
        self.assertEqual(r.headers["content-type"], "image/jpeg")
        self.assertLess(len(r.content), 300 * 1024)
        bad = await self._get("/api/v1/content-calendar/public/review/tok-wrong-xyz/assets/ast_up1?og=1")
        self.assertEqual(bad.status_code, 404)
        cross = await self._get("/api/v1/content-calendar/public/review/tok-video-drive-123/assets/ast_up1?og=1")
        self.assertEqual(cross.status_code, 404)


if __name__ == "__main__":
    unittest.main()
