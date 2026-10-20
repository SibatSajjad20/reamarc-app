"""Client workspace logo upload, validation, audit, and list payload tests."""
from __future__ import annotations

import io
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI, HTTPException, status
from fastapi.testclient import TestClient
from PIL import Image
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.core.limiter import limiter
from app.core.security import get_current_user
from app.routers import workspaces as workspaces_router
from app.services.content_calendar_service import COLLECTION_NAME, get_items
from app.services.client_logo import default_workspace_initials


CLOUD = "demo"
SAFE_URL = f"https://res.cloudinary.com/{CLOUD}/image/upload/v1/reamarc/clients/ws-1/logo/logo-abc.png"


def _png_bytes(w: int, h: int, color=(255, 0, 0, 255)) -> bytes:
    img = Image.new("RGBA", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_exif_bytes() -> bytes:
    img = Image.new("RGB", (200, 128), (0, 128, 255))
    exif = img.getexif()
    exif[274] = 6
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


class FakeCursor:
    def __init__(self, items):
        self.items = items

    def sort(self, *args, **kwargs):
        return self

    def skip(self, n):
        return self

    def limit(self, n):
        return self

    async def to_list(self, length=None):
        return [dict(x) for x in self.items]


class FakeAggregate:
    def __init__(self, rows):
        self.rows = list(rows)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self.rows:
            raise StopAsyncIteration
        return self.rows.pop(0)


class FakeWorkspaces:
    def __init__(self, docs):
        self.docs = {d["id"]: dict(d) for d in docs}
        self.find_count = 0
        self.raise_on_update = False

    async def find_one(self, query, projection=None):
        return dict(self.docs[query["id"]]) if query.get("id") in self.docs else None

    def find(self, query=None, projection=None):
        self.find_count += 1
        items = list(self.docs.values())
        if query and query.get("status") == {"$ne": "inactive"}:
            items = [d for d in items if d.get("status") != "inactive"]
        return FakeCursor(items)

    async def find_one_and_update(self, query, update, return_document=True):
        if self.raise_on_update:
            raise RuntimeError("db write failed")
        doc = self.docs.get(query.get("id"))
        if not doc:
            return None
        if "$set" in update:
            doc.update(update["$set"])
        if "$unset" in update:
            for key in update["$unset"]:
                doc.pop(key, None)
        self.docs[query["id"]] = doc
        return dict(doc)


class FakeAudit:
    def __init__(self):
        self.rows = []

    async def insert_one(self, doc):
        self.rows.append(doc)


class FakeCalendar:
    def __init__(self, items):
        self.items = items

    def find(self, query=None, projection=None):
        return FakeCursor(self.items)

    def aggregate(self, pipeline):
        return FakeAggregate([])

    async def count_documents(self, query):
        return len(self.items)


class FakeDB:
    def __init__(self, workspaces, calendar_items=None):
        self.workspaces = workspaces
        self.workspace_audit = FakeAudit()
        self.calendar = FakeCalendar(calendar_items or [])
        self.users = FakeWorkspaces([])

    def __getitem__(self, name):
        if name == "workspaces":
            return self.workspaces
        if name == COLLECTION_NAME:
            return self.calendar
        if name == "users":
            return self.users
        raise KeyError(name)


def _user(role: str, uid: str = "u1") -> dict:
    return {"id": uid, "role": role, "full_name": role.title(), "is_active": True, "email": f"{role}@ex.com"}


def _app(user):
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(workspaces_router.router, prefix="/api/v1")

    async def _current():
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated. Access token missing.")
        return user

    app.dependency_overrides[get_current_user] = _current
    return app


class TestClientLogos(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.ws = {
            "id": "ws-1",
            "name": "Sample Client A",
            "status": "active",
            "logo_url": SAFE_URL,
            "logo_public_id": "reamarc/clients/ws-1/logo/logo-old",
        }
        self.store = FakeWorkspaces([self.ws])
        self.db = FakeDB(self.store)
        self.cloud_patch = patch.object(settings, "CLOUDINARY_CLOUD_NAME", CLOUD)
        self.cloud_patch.start()
        limiter.enabled = False
        self.db_patch = patch("app.routers.workspaces.get_database", return_value=self.db)
        self.db_patch.start()
        self.uploaded = []
        self.destroyed = []

        async def fake_upload(data, **kwargs):
            self.uploaded.append({"data": data, **kwargs})
            pid = f"{kwargs['folder']}/{kwargs['public_id']}"
            url = f"https://res.cloudinary.com/{CLOUD}/image/upload/{pid}.png"
            return url, pid

        async def fake_destroy(pid):
            self.destroyed.append(pid)

        self.upload_patch = patch("app.services.cloudinary_service.upload_image", side_effect=fake_upload)
        self.destroy_patch = patch("app.services.cloudinary_service.destroy", side_effect=fake_destroy)
        self.upload_patch.start()
        self.destroy_patch.start()

    def tearDown(self):
        limiter.enabled = True
        self.cloud_patch.stop()
        self.db_patch.stop()
        self.upload_patch.stop()
        self.destroy_patch.stop()

    def _client(self, role="admin"):
        return TestClient(_app(_user(role) if role else None))

    def test_default_initials(self):
        self.assertEqual(default_workspace_initials("Sample Client A"), "SA")
        self.assertEqual(default_workspace_initials("Apex Transfers LLC"), "AT")
        self.assertEqual(default_workspace_initials("E2E Client"), "EC")
        self.assertEqual(default_workspace_initials("nova"), "NO")

    def test_upload_permissions(self):
        png = _png_bytes(200, 200)
        for role, code in (
            ("admin", 200),
            ("operations", 200),
            ("team_member", 403),
            ("team_lead", 403),
            ("hr", 403),
        ):
            self.store.docs["ws-1"] = dict(self.ws)
            res = self._client(role).post(
                "/api/v1/workspaces/ws-1/logo",
                files={"file": ("logo.png", io.BytesIO(png), "image/png")},
            )
            self.assertEqual(res.status_code, code, f"{role}: {res.text}")

        res = TestClient(_app(None)).post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.png", io.BytesIO(png), "image/png")},
        )
        self.assertEqual(res.status_code, 401)

    def test_delete_permissions(self):
        for role, code in (
            ("admin", 200),
            ("operations", 200),
            ("team_member", 403),
            ("team_lead", 403),
            ("hr", 403),
        ):
            self.store.docs["ws-1"] = dict(self.ws)
            res = self._client(role).delete("/api/v1/workspaces/ws-1/logo")
            self.assertEqual(res.status_code, code, f"{role}: {res.text}")
        res = TestClient(_app(None)).delete("/api/v1/workspaces/ws-1/logo")
        self.assertEqual(res.status_code, 401)

    def test_svg_rejected(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"></svg>'
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.png", io.BytesIO(svg), "image/png")},
        )
        self.assertEqual(res.status_code, 415)

    def test_gif_rejected(self):
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.gif", io.BytesIO(b"GIF89a" + b"\x00" * 20), "image/gif")},
        )
        self.assertEqual(res.status_code, 415)

    def test_oversize_rejected(self):
        blob = b"x" * (2 * 1024 * 1024 + 1)
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.png", io.BytesIO(blob), "image/png")},
        )
        self.assertEqual(res.status_code, 413)

    def test_tiny_image_rejected(self):
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.png", io.BytesIO(_png_bytes(100, 100)), "image/png")},
        )
        self.assertEqual(res.status_code, 422)

    def test_non_image_rejected(self):
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.png", io.BytesIO(b"not-an-image"), "image/png")},
        )
        self.assertIn(res.status_code, (415, 422))

    def test_wide_png_padded_square(self):
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("wide.png", io.BytesIO(_png_bytes(1000, 200)), "image/png")},
        )
        self.assertEqual(res.status_code, 200, res.text)
        out = Image.open(io.BytesIO(self.uploaded[-1]["data"]))
        self.assertEqual(out.size, (512, 512))
        self.assertEqual(out.mode, "RGBA")
        corner = out.getpixel((0, 0))
        self.assertEqual(corner[3], 0)

    def test_jpeg_exif_stripped(self):
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("rot.jpg", io.BytesIO(_jpeg_exif_bytes()), "image/jpeg")},
        )
        self.assertEqual(res.status_code, 200, res.text)
        out = Image.open(io.BytesIO(self.uploaded[-1]["data"]))
        self.assertEqual(out.format, "PNG")
        self.assertFalse(out.getexif() or out.info.get("exif"))

    def test_replace_destroys_old_in_folder_only(self):
        png = _png_bytes(200, 200)
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.png", io.BytesIO(png), "image/png")},
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertIn("reamarc/clients/ws-1/logo/logo-old", self.destroyed)
        self.assertNotIn("logo_public_id", res.json())

        self.destroyed.clear()
        self.store.docs["ws-1"]["logo_public_id"] = "avatars/someone"
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.png", io.BytesIO(png), "image/png")},
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(self.destroyed, [])

    def test_failed_db_write_destroys_new(self):
        self.store.raise_on_update = True
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.png", io.BytesIO(_png_bytes(200, 200)), "image/png")},
        )
        self.assertEqual(res.status_code, 500)
        self.assertTrue(self.destroyed)
        self.assertTrue(self.destroyed[0].startswith("reamarc/clients/ws-1/logo/"))

    def test_delete_idempotent_and_audit(self):
        res = self._client().delete("/api/v1/workspaces/ws-1/logo")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(any(r["action"] == "client_logo.removed" for r in self.db.workspace_audit.rows))
        self.store.docs["ws-1"].pop("logo_url", None)
        self.store.docs["ws-1"].pop("logo_public_id", None)
        res = self._client().delete("/api/v1/workspaces/ws-1/logo")
        self.assertEqual(res.status_code, 200)

    def test_patch_cannot_set_logo_url(self):
        before = self.store.docs["ws-1"]["logo_url"]
        res = self._client().patch(
            "/api/v1/workspaces/ws-1",
            json={"name": "Sample Client A", "logo_url": "https://evil.example/x.png"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(self.store.docs["ws-1"]["logo_url"], before)

    def test_list_includes_logo_for_team_member_and_sanitises(self):
        self.store.docs["ws-1"]["logo_url"] = "https://evil.example/x.png"
        res = self._client("team_member").get("/api/v1/workspaces")
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(len(body), 1)
        self.assertIsNone(body[0]["logo_url"])
        self.assertNotIn("logo_public_id", body[0])

        self.store.docs["ws-1"]["logo_url"] = SAFE_URL
        res = self._client("team_member").get("/api/v1/workspaces")
        self.assertEqual(res.json()[0]["logo_url"], SAFE_URL)

    def test_upload_writes_audit(self):
        res = self._client().post(
            "/api/v1/workspaces/ws-1/logo",
            files={"file": ("logo.png", io.BytesIO(_png_bytes(200, 200)), "image/png")},
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertTrue(any(r["action"] == "client_logo.updated" for r in self.db.workspace_audit.rows))

    def test_list_query_count_independent_of_workspace_count(self):
        self.store.docs = {
            f"ws-{i}": {"id": f"ws-{i}", "name": f"Client {i}", "status": "active"}
            for i in range(3)
        }
        self.store.find_count = 0
        self._client("team_member").get("/api/v1/workspaces")
        count_3 = self.store.find_count
        self.store.docs = {
            f"ws-{i}": {"id": f"ws-{i}", "name": f"Client {i}", "status": "active"}
            for i in range(30)
        }
        self.store.find_count = 0
        self._client("team_member").get("/api/v1/workspaces")
        self.assertEqual(count_3, self.store.find_count)

    async def test_content_calendar_workspace_query_count_stable(self):
        def items(n):
            return [
                {
                    "id": f"cc-{i}",
                    "serial": f"C{i:03d}",
                    "client_name": f"Client {i % 5}",
                    "workspace_id": f"ws-{i % 5}",
                    "stage": "Content",
                }
                for i in range(n)
            ]

        with patch("app.services.content_calendar_service.ensure_indexes", new=AsyncMock()):
            small = FakeDB(
                FakeWorkspaces([{"id": f"ws-{i}", "name": f"Client {i}", "status": "active"} for i in range(5)]),
                items(10),
            )
            large = FakeDB(
                FakeWorkspaces([{"id": f"ws-{i}", "name": f"Client {i}", "status": "active"} for i in range(5)]),
                items(100),
            )
            await get_items(small, viewer=_user("admin"), limit=500)
            await get_items(large, viewer=_user("admin"), limit=500)
            self.assertEqual(small.workspaces.find_count, large.workspaces.find_count)


if __name__ == "__main__":
    unittest.main()
