"""Client portal: client users get video stills for their own workspace only; public-link decisions land in the right tab.

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

TEST_DB = "reamarc_test_client_portal_parity"
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


class TestClientPortalParity(unittest.IsolatedAsyncioTestCase):
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
        for uid, cid, role, ws, name in (
            ("client_sp", A, "client", ["ws_sp"], "SP Builders"),
            ("client_other", A, "client", ["ws_zem"], "Zem Bulider"),
            ("client_b", B, "client", ["ws_sp"], "SP Builders"),
        ):
            u = {"id": uid, "email": f"{uid}@example.test", "full_name": name, "role": role, "is_active": True,
                 "company_id": cid, "session_epoch": 0, "workspace_ids": ws, "primary_department": None, "departments": [],
                 "refresh_jtis": [f"web-{uid}"], "refresh_retired": []}
            m = {"id": f"m_{uid}", "user_id": uid, "company_id": cid, "status": "active", "role": role,
                 "workspace_ids": ws, "token_version": 0}
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            self.users[uid] = (u, m)
        await self.db.content_calendar_items.insert_one({
            "id": "cc_csb5", "serial": "CSB-005", "company_id": A, "workspace_id": "ws_sp", "client_name": "SP Builders",
            "stage": "Creative Client Review", "approval_status": "Creative Client Review", "title": "Reel", "content_concept": "Reel", "created_at": "2026-10-20T00:00:00Z",
            "share_token": "tok-csb5-portal-123",
            "attachments": [{"id": "ast_dv1", "kind": "video", "content_type": "video/mp4", "filename": "Reel.mp4",
                             "google_drive_file_id": "DRIVEVIDSP", "url": "/uploads/gdrive/DRIVEVIDSP/Reel.mp4", "uploaded_at": "2026-10-20T00:00:00Z",
                             "thumbnail_url": None}],
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
        base = {"sub": uid, "email": u["email"], "name": u["full_name"], "role": m["role"], "cid": u["company_id"],
                "workspace_ids": u["workspace_ids"], "mid": m["id"], "mtv": 0}
        c = claims_with_session(u, base, company_doc=self.companies[u["company_id"]], membership_doc=m)
        return {"Authorization": f"Bearer {create_access_token(dict(c, sid=f'web-{uid}'))}", "X-Requested-With": "XMLHttpRequest"}

    async def _get(self, path, uid=None):
        self.client.cookies.clear()
        return await self.client.get(path, headers=self._auth(uid) if uid else {})

    async def test_client_gets_video_still_for_own_workspace_only(self):
        from app.services import google_drive_service as g
        with mock.patch.object(g, "fetch_drive_thumbnail_bytes", mock.AsyncMock(return_value=_jpeg())), \
             mock.patch.object(g, "download_file_prefix", mock.AsyncMock(side_effect=AssertionError("no video download"))):
            ok = await self._get("/api/v1/thumbs/gdrive/DRIVEVIDSP/Reel.mp4?w=800", "client_sp")
            self.assertEqual(ok.status_code, 200, ok.text)
            self.assertEqual(ok.headers["content-type"], "image/webp")
            self.assertIn((await self._get("/api/v1/thumbs/gdrive/DRIVEVIDSP/Reel.mp4?w=800", "client_other")).status_code, (403, 404))
            self.assertIn((await self._get("/api/v1/thumbs/gdrive/DRIVEVIDSP/Reel.mp4?w=800", "client_b")).status_code, (403, 404))

    async def test_public_link_revision_moves_item_out_of_pending_for_portal(self):
        with mock.patch("app.services.content_calendar_service.notify_content_calendar_event", mock.AsyncMock()):
            r = await self.client.post("/api/v1/content-calendar/public/review/tok-csb5-portal-123/action",
                                       json={"action": "request_revision", "reviewer_name": "Client", "note": "image 1 and 2 approved, fix 3"})
        self.assertEqual(r.status_code, 200, r.text)
        lst = await self._get("/api/v1/content-calendar?limit=50", "client_sp")
        self.assertEqual(lst.status_code, 200, lst.text)
        row = next(i for i in lst.json()["items"] if i["serial"] == "CSB-005")
        self.assertEqual(row["stage"], "Creative Revision")
        self.assertEqual(row["approval_status"], "Changes Requested")
        self.assertIn("fix 3", row["revision_note"])
        # A second decision from the old link is refused (link closed once changes are requested).
        again = await self.client.post("/api/v1/content-calendar/public/review/tok-csb5-portal-123/action",
                                       json={"action": "approve", "reviewer_name": "Client"})
        self.assertEqual(again.status_code, 410)


if __name__ == "__main__":
    unittest.main()
