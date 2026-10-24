"""Review link at every stage, direct-from-Drive downloads, and custom video thumbnails.

Throwaway Mongo only (name contains 'test'); Google Drive is mocked; outbound network blocked.
"""
from __future__ import annotations

import io
import os
import socket
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test-secret-key-review-thumbs-0123456789ab")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx

from app.config import settings
from app.core.security import claims_with_session, create_access_token
from app.database import connect_to_mongo
from app.main import app

TEST_DB = "reamarc_test_review_thumbs"
CID = "company_test_rt"
OTHER_CID = "company_test_other"
DRIVE_ID = "DRIVEFILE123"

_real_connect = socket.socket.connect


def _loopback_only(self, addr, *a, **k):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *a, **k)
    raise OSError("outbound blocked in tests")


def _png() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (64, 36), (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


class TestReviewThumbs(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.grant = mock.Mock(return_value=("perm-1", False))
        self.remove = mock.Mock(return_value=None)
        for p in (
            mock.patch.object(socket.socket, "connect", new=_loopback_only),
            mock.patch.object(settings, "MULTI_COMPANY_ENABLED", True),
            mock.patch.object(settings, "DRIVE_DIRECT_DOWNLOADS", True),
            mock.patch("app.services.google_drive_service.configured", return_value=True),
            mock.patch("app.services.drive_direct._grant_anyone_reader", new=self.grant),
            mock.patch("app.services.drive_direct._remove_permission", new=self.remove),
            mock.patch("app.services.content_calendar_service.notify_content_calendar_event", new=mock.AsyncMock()),
        ):
            p.start()
            self.addCleanup(p.stop)
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in TEST_DB
        await connect_to_mongo()
        from app.database import db_instance

        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        from app.core.limiter import limiter

        limiter.enabled = False
        from app.core import uploads

        uploads._GDRIVE_AUTH_CACHE.clear()
        self.companies = {}
        self.users = {}
        for cid in (CID, OTHER_CID):
            c = {"id": cid, "name": cid, "slug": cid, "status": "active", "token_version": 0}
            self.companies[cid] = c
            await self.db.companies.insert_one(dict(c))
        for uid, cid in (("admin_a", CID), ("admin_b", OTHER_CID)):
            u = {"id": uid, "email": f"{uid}@reamarc-test.com", "full_name": uid, "name": uid, "role": "admin",
                 "is_active": True, "company_id": cid, "session_epoch": 0, "workspace_ids": [], "departments": [],
                 "primary_department": None, "refresh_jtis": [f"web-{uid}"], "refresh_retired": []}
            m = {"id": f"m_{uid}", "user_id": uid, "company_id": cid, "status": "active", "role": "admin",
                 "workspace_ids": [], "token_version": 0}
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            self.users[uid] = (u, m, cid)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        from app.database import db_instance

        await db_instance.client.drop_database(TEST_DB)
        db_instance.client = None
        db_instance.db = None

    def _auth(self, uid):
        u, m, cid = self.users[uid]
        base = {"sub": uid, "email": u["email"], "name": u["full_name"], "role": "admin", "cid": cid,
                "workspace_ids": [], "mid": m["id"], "mtv": 0}
        c = claims_with_session(u, base, company_doc=self.companies[cid], membership_doc=m)
        return {"Authorization": f"Bearer {create_access_token(dict(c, sid=f'web-{uid}'))}",
                "X-Requested-With": "XMLHttpRequest"}

    async def _item(self, stage, token="tok-rt", approval="Pending", kind="image"):
        doc = {
            "id": f"item-{token}", "serial": "RT-1", "company_id": CID, "stage": stage, "approval_status": approval,
            "share_token": token, "client_name": "Apex", "content_concept": "Test",
            "created_at": "2026-10-20T00:00:00+00:00", "updated_at": "2026-10-20T00:00:00+00:00", "assignee_id": "someone", "assignee_name": "Someone",
            "attachments": [{
                "id": "att-1", "kind": kind, "filename": "reel.mp4" if kind == "video" else "slide.png",
                "content_type": "video/mp4" if kind == "video" else "image/png", "size_bytes": 10, "uploaded_at": "2026-10-20T00:00:00+00:00",
                "url": f"/uploads/gdrive/{DRIVE_ID}/slide.png", "google_drive_file_id": DRIVE_ID, "order": 0,
            }],
        }
        await self.db.content_calendar_items.insert_one(dict(doc))
        return doc

    # ---- B: review link at every stage -----------------------------------------------------------

    async def _request_changes(self, token):
        return await self.client.post(f"/api/v1/content-calendar/public/review/{token}/action",
                                      json={"action": "request_revision", "reviewer_name": "Client", "note": "fix the logo"})

    async def test_request_changes_from_posted_goes_to_creative_revision(self):
        await self._item("Posted", approval="Approved")
        page = await self.client.get("/api/v1/content-calendar/public/review/tok-rt")
        self.assertEqual(page.status_code, 200, page.text)
        self.assertFalse(page.json()["can_approve"])
        self.assertTrue(page.json()["can_request_changes"])
        r = await self._request_changes("tok-rt")
        self.assertEqual(r.status_code, 200, r.text)
        doc = await self.db.content_calendar_items.find_one({"id": "item-tok-rt"})
        self.assertEqual(doc["stage"], "Creative Revision")
        self.assertEqual(doc["approval_status"], "Changes Requested")
        self.assertIn("fix the logo", doc["revision_note"])
        self.assertIsNone(doc.get("assignee_id"))

    async def test_request_changes_from_ready_to_post(self):
        await self._item("Ready to Post", approval="Approved")
        self.assertEqual((await self._request_changes("tok-rt")).status_code, 200)
        doc = await self.db.content_calendar_items.find_one({"id": "item-tok-rt"})
        self.assertEqual(doc["stage"], "Creative Revision")

    async def test_request_changes_from_content_internal_review_goes_to_content_revision(self):
        await self._item("Content Internal Review")
        self.assertEqual((await self._request_changes("tok-rt")).status_code, 200)
        doc = await self.db.content_calendar_items.find_one({"id": "item-tok-rt"})
        self.assertEqual(doc["stage"], "Content Revision")

    async def test_second_request_while_in_revision_adds_notes(self):
        await self._item("Posted", approval="Approved")
        await self._request_changes("tok-rt")
        r = await self.client.post("/api/v1/content-calendar/public/review/tok-rt/action",
                                   json={"action": "request_revision", "reviewer_name": "Client", "note": "and the colour"})
        self.assertEqual(r.status_code, 200, r.text)
        doc = await self.db.content_calendar_items.find_one({"id": "item-tok-rt"})
        self.assertIn("fix the logo", doc["revision_note"])
        self.assertIn("and the colour", doc["revision_note"])

    async def test_approve_outside_review_is_refused(self):
        await self._item("Creative Production")
        r = await self.client.post("/api/v1/content-calendar/public/review/tok-rt/action",
                                   json={"action": "approve", "reviewer_name": "Client"})
        self.assertEqual(r.status_code, 409, r.text)
        doc = await self.db.content_calendar_items.find_one({"id": "item-tok-rt"})
        self.assertEqual(doc["stage"], "Creative Production")

    async def test_rejected_link_is_closed(self):
        await self._item("Rejected", approval="Rejected")
        page = await self.client.get("/api/v1/content-calendar/public/review/tok-rt")
        self.assertEqual(page.status_code, 410)

    # ---- Downloads straight from Drive ---------------------------------------------------------

    async def test_public_download_redirects_to_drive(self):
        await self._item("Creative Client Review")
        opener = mock.AsyncMock(side_effect=AssertionError("must not stream through the server"))
        with mock.patch("app.core.uploads.open_upload_response", new=opener):
            r = await self.client.get("/api/v1/content-calendar/public/review/tok-rt/assets/att-1?download=1")
        self.assertEqual(r.status_code, 302, r.text)
        self.assertIn("drive.usercontent.google.com/download?id=DRIVEFILE123", r.headers["location"])
        self.assertEqual(self.grant.call_count, 1)
        share = await self.db.drive_link_shares.find_one({"file_id": DRIVE_ID})
        self.assertFalse(share["preexisting"])
        # Second download reuses the grant.
        with mock.patch("app.core.uploads.open_upload_response", new=opener):
            await self.client.get("/api/v1/content-calendar/public/review/tok-rt/assets/att-1?download=1")
        self.assertEqual(self.grant.call_count, 1)

    async def test_public_download_falls_back_when_sharing_blocked(self):
        await self._item("Creative Client Review")
        self.grant.side_effect = RuntimeError("403 sharing blocked by admin policy")
        from fastapi.responses import Response

        opener = mock.AsyncMock(return_value=Response(content=b"bytes", media_type="image/png"))
        with mock.patch("app.core.uploads.open_upload_response", new=opener):
            r = await self.client.get("/api/v1/content-calendar/public/review/tok-rt/assets/att-1?download=1")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.content, b"bytes")

    async def test_direct_link_endpoint_and_cross_company(self):
        await self._item("Creative Production")
        path = f"/uploads/gdrive/{DRIVE_ID}/slide.png"
        ok = await self.client.get("/api/v1/drive/direct-link", params={"path": path}, headers=self._auth("admin_a"))
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertIn(DRIVE_ID, ok.json()["url"])
        other = await self.client.get("/api/v1/drive/direct-link", params={"path": path}, headers=self._auth("admin_b"))
        self.assertIn(other.status_code, (403, 404), other.text)
        anon = await self.client.get("/api/v1/drive/direct-link", params={"path": path})
        self.assertEqual(anon.status_code, 401)
        local = await self.client.get("/api/v1/drive/direct-link", params={"path": "/uploads/content_calendar/item-tok-rt/x.png"},
                                      headers=self._auth("admin_a"))
        self.assertIn(local.status_code, (403, 404, 409))

    async def test_sweeper_revokes_only_our_expired_grants(self):
        from app.services.drive_direct import revoke_expired_shares

        past = datetime.now(timezone.utc) - timedelta(hours=1)
        await self.db.drive_link_shares.insert_many([
            {"file_id": "ours", "permission_id": "p1", "preexisting": False, "expires_at": past},
            {"file_id": "theirs", "permission_id": "p2", "preexisting": True, "expires_at": past},
            {"file_id": "fresh", "permission_id": "p3", "preexisting": False,
             "expires_at": datetime.now(timezone.utc) + timedelta(hours=3)},
        ])
        await revoke_expired_shares()
        self.remove.assert_called_once_with("ours", "p1")
        left = sorted(d["file_id"] for d in await self.db.drive_link_shares.find({}).to_list(10))
        self.assertEqual(left, ["fresh", "theirs"])

    # ---- C: optional custom video thumbnail ---------------------------------------------------

    async def test_set_video_poster_bumps_version_and_public_urls(self):
        await self._item("Creative Client Review", kind="video")
        uploaded = mock.AsyncMock(side_effect=[{"id": "POSTER1"}, {"id": "POSTER2"}])
        with mock.patch("app.services.google_drive_service.ensure_item_folder", new=mock.AsyncMock(return_value="FOLDER")), \
             mock.patch("app.services.google_drive_service.upload_bytes", new=uploaded):
            r1 = await self.client.post("/api/v1/content-calendar/item-tok-rt/assets/att-1/poster",
                                        files={"file": ("p.png", _png(), "image/png")}, headers=self._auth("admin_a"))
            self.assertEqual(r1.status_code, 200, r1.text)
            r2 = await self.client.post("/api/v1/content-calendar/item-tok-rt/assets/att-1/poster",
                                        files={"file": ("p.png", _png(), "image/png")}, headers=self._auth("admin_a"))
        att = r2.json()["attachments"][0]
        self.assertEqual(att["poster_version"], 2)
        self.assertEqual(att["google_drive_thumb_file_id"], "POSTER2")
        self.assertIn("att-1_poster_v2.jpg", att["thumbnail_url"])
        self.assertEqual(uploaded.await_args.args[3], "image/jpeg")
        page = (await self.client.get("/api/v1/content-calendar/public/review/tok-rt")).json()
        pa = page["attachments"][0]
        self.assertTrue(pa["thumbnail_url"].endswith("&v=2"))
        self.assertTrue(pa["og_image_url"].endswith("&v=2"))

    async def test_poster_rejects_non_images_and_other_companies(self):
        await self._item("Creative Client Review", kind="video")
        bad = await self.client.post("/api/v1/content-calendar/item-tok-rt/assets/att-1/poster",
                                     files={"file": ("p.png", b"not an image", "image/png")}, headers=self._auth("admin_a"))
        self.assertEqual(bad.status_code, 400, bad.text)
        other = await self.client.post("/api/v1/content-calendar/item-tok-rt/assets/att-1/poster",
                                       files={"file": ("p.png", _png(), "image/png")}, headers=self._auth("admin_b"))
        self.assertIn(other.status_code, (403, 404), other.text)


if __name__ == "__main__":
    unittest.main()
