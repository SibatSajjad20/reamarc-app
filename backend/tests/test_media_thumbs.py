"""Grid previews: small, cached, and never leaked across companies or to people without access."""
from __future__ import annotations

import os
import shutil
import sys
import unittest
from io import BytesIO

os.environ.setdefault("SECRET_KEY", "test-secret-key-media-thumbs-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx
from PIL import Image

from app.config import settings
from app.core.security import claims_with_session, create_access_token
from app.database import connect_to_mongo
from app.main import app, UPLOAD_DIR

TEST_DB = "reamarc_test_media_thumbs"
A, B = "company_test_a", "company_test_b"
ITEM = "cc_thumb_item_1"
KEY = f"content_calendar/{ITEM}/asset1.png"


def _png_6mb() -> bytes:
    im = Image.frombytes("RGB", (1450, 1450), os.urandom(1450 * 1450 * 3))
    buf = BytesIO()
    im.save(buf, "PNG", compress_level=1)
    return buf.getvalue()


class TestMediaThumbs(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
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
        for cid in (A, B):
            c = {"id": cid, "name": cid, "status": "active", "token_version": 0}
            self.companies[cid] = c
            await self.db.companies.insert_one(dict(c))
        self.users = {}
        for uid, cid, role in (("adm_a", A, "admin"), ("client_a", A, "client"), ("adm_b", B, "admin")):
            u = {"id": uid, "email": f"{uid}@example.test", "full_name": uid, "role": role, "is_active": True,
                 "company_id": cid, "session_epoch": 0, "primary_department": "Operations", "departments": ["Operations"],
                 "refresh_jtis": [f"web-{uid}"], "refresh_retired": []}
            m = {"id": f"m_{uid}", "user_id": uid, "company_id": cid, "status": "active", "role": role,
                 "primary_department": "Operations", "departments": ["Operations"], "token_version": 0}
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            self.users[uid] = (u, m)
        self.png = _png_6mb()
        self.dir = os.path.join(UPLOAD_DIR, "content_calendar", ITEM)
        os.makedirs(self.dir, exist_ok=True)
        with open(os.path.join(self.dir, "asset1.png"), "wb") as f:
            f.write(self.png)
        await self.db.content_calendar_items.insert_one({
            "id": ITEM, "serial": "CC-T1", "company_id": A, "stage": "Content", "title": "t",
            "share_token": "tok-valid-123", "client_review_link_expires_at": None,
            "attachments": [{"id": "asset1", "kind": "image", "url": f"/uploads/{KEY}",
                             "thumbnail_url": f"/uploads/{KEY}", "filename": "asset1.png"}],
        })
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        shutil.rmtree(self.dir, ignore_errors=True)
        from app.database import db_instance
        await db_instance.client.drop_database(TEST_DB)

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

    async def test_thumb_is_small_cached_and_revalidates(self):
        self.assertGreater(len(self.png), 6_000_000)
        r = await self._get(f"/api/v1/thumbs/{KEY}?w=400", "adm_a")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.headers["content-type"], "image/webp")
        self.assertLessEqual(len(r.content), 100_000)
        self.assertIn("immutable", r.headers["cache-control"])
        self.assertIn("max-age=2592000", r.headers["cache-control"])
        etag = r.headers["etag"]
        r2 = await self._get(f"/api/v1/thumbs/{KEY}?w=400", "adm_a", **{"If-None-Match": etag})
        self.assertEqual(r2.status_code, 304)
        self.assertEqual(r2.content, b"")
        self.assertEqual(await self.db.media_thumbs.count_documents({"company_id": A}), 1)
        small = await self._get(f"/api/v1/thumbs/{KEY}?w=200", "adm_a")
        self.assertLess(len(small.content), len(r.content))

    async def test_thumb_blocks_other_company_no_access_and_logged_out(self):
        await self._get(f"/api/v1/thumbs/{KEY}?w=400", "adm_a")  # warm the cache first
        self.assertIn((await self._get(f"/api/v1/thumbs/{KEY}?w=400", "adm_b")).status_code, (403, 404))
        self.assertIn((await self._get(f"/api/v1/thumbs/{KEY}?w=400", "client_a")).status_code, (403, 404))
        self.assertEqual((await self._get(f"/api/v1/thumbs/{KEY}?w=400")).status_code, 401)
        # Original file follows the same rules.
        self.assertIn((await self._get(f"/uploads/{KEY}", "adm_b")).status_code, (403, 404))

    async def test_public_review_thumb_needs_valid_token(self):
        ok = await self._get("/api/v1/content-calendar/public/review/tok-valid-123/assets/asset1?w=400")
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertLessEqual(len(ok.content), 100_000)
        self.assertIn("max-age", ok.headers["cache-control"])  # not overwritten to no-store
        again = await self._get("/api/v1/content-calendar/public/review/tok-valid-123/assets/asset1?w=400",
                                **{"If-None-Match": ok.headers["etag"]})
        self.assertEqual(again.status_code, 304)
        bad = await self._get("/api/v1/content-calendar/public/review/tok-wrong/assets/asset1?w=400")
        self.assertEqual(bad.status_code, 404)

    async def test_route_cache_control_is_kept_by_middleware(self):
        r = await self._get(f"/api/v1/thumbs/{KEY}?w=400", "adm_a")
        self.assertNotIn("no-store", r.headers["cache-control"])
        api = await self._get("/api/v1/auth/me", "adm_a")
        self.assertIn("no-store", api.headers["cache-control"])

    async def test_drive_file_304_without_stream_slot_and_thumb_from_drive_preview(self):
        from unittest import mock
        from app.services import google_drive_service as g
        await self.db.content_calendar_items.insert_one({
            "id": "cc_drive_1", "company_id": A, "stage": "Content", "title": "d",
            "attachments": [{"id": "d1", "kind": "image", "google_drive_file_id": "DRIVEFILE1",
                             "url": "/uploads/gdrive/DRIVEFILE1/photo.jpg"}],
        })
        meta = {"id": "DRIVEFILE1", "name": "photo.jpg", "mimeType": "image/jpeg", "size": "4000000",
                "md5Checksum": "abc123", "thumbnailLink": "https://lh3.example/x=s220"}
        etag = g.drive_etag("DRIVEFILE1", meta)
        preview = BytesIO(); Image.new("RGB", (800, 600), (200, 80, 40)).save(preview, "JPEG")
        sem_before = g._DRIVE_STREAM_SEM._value
        with mock.patch.object(g, "_cached_file_meta", return_value=meta), \
             mock.patch.object(g, "fetch_drive_thumbnail_bytes", mock.AsyncMock(return_value=preview.getvalue())) as fetch, \
             mock.patch.object(g, "download_file_prefix", mock.AsyncMock(side_effect=AssertionError("no full download"))):
            r = await self._get("/api/v1/uploads/gdrive/DRIVEFILE1/photo.jpg", "adm_a", **{"If-None-Match": etag})
            self.assertEqual(r.status_code, 304)
            self.assertEqual(g._DRIVE_STREAM_SEM._value, sem_before)
            t = await self._get("/api/v1/thumbs/gdrive/DRIVEFILE1/photo.jpg?w=400", "adm_a")
            self.assertEqual(t.status_code, 200, t.text)
            fetch.assert_awaited()
            self.assertIn((await self._get("/api/v1/thumbs/gdrive/DRIVEFILE1/photo.jpg?w=400", "adm_b")).status_code, (403, 404))


if __name__ == "__main__":
    unittest.main()
