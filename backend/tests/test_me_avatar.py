"""GET /auth/me must return avatar_url from the live user document."""
from __future__ import annotations

import io
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-auth-me-avatar")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.core.limiter import limiter
from app.core.security import create_access_token
from app.database import get_database
from app.routers.auth import router as auth_router
from app.routers.users import router as users_router


def _png_bytes() -> bytes:
    img = Image.new("RGB", (8, 8), (20, 40, 80))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class UsersCollection:
    def __init__(self):
        self.docs = {}

    def _match(self, query):
        query = query or {}
        uid = query.get("id")
        if uid:
            return self.docs.get(uid)
        email = query.get("email")
        if email:
            for doc in self.docs.values():
                if doc.get("email") == email:
                    return doc
        return None

    async def find_one(self, query, projection=None):
        doc = self._match(query)
        if not doc:
            return None
        out = dict(doc)
        if projection:
            for key, keep in projection.items():
                if keep == 0:
                    out.pop(key, None)
        return out

    async def update_one(self, query, update):
        doc = self._match(query)
        if not doc:
            return MagicMock(modified_count=0)
        if "$set" in update:
            doc.update(update["$set"])
        return MagicMock(modified_count=1)


class FakeDB:
    def __init__(self):
        self.users = UsersCollection()


class MeAvatarTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(auth_router, prefix=settings.API_V1_STR)
        self.app.include_router(users_router, prefix=settings.API_V1_STR)
        self.app.dependency_overrides[get_database] = lambda: self.db
        self.db_patchers = [
            patch("app.database.get_database", lambda: self.db),
            patch("app.routers.users.get_database", lambda: self.db),
            patch("app.routers.auth.get_database", lambda: self.db),
        ]
        for p in self.db_patchers:
            p.start()
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        for p in reversed(self.db_patchers):
            p.stop()
        self.app.dependency_overrides.clear()

    def _seed_user(self, user_id: str, **extra):
        doc = {
            "id": user_id,
            "email": f"{user_id}@t.test",
            "full_name": "Avatar User",
            "name": "Avatar User",
            "role": "team_member",
            "is_active": True,
            "hashed_password": "should-not-leak",
            "refresh_jtis": ["sid-other"],
        }
        doc.update(extra)
        self.db.users.docs[user_id] = doc
        return doc

    def _auth_headers(self, user_doc: dict) -> dict:
        token = create_access_token(
            {
                "sub": user_doc["id"],
                "email": user_doc["email"],
                "name": user_doc.get("full_name") or user_doc.get("name"),
            }
        )
        return {"Authorization": f"Bearer {token}"}

    def test_me_returns_seeded_avatar_url_without_public_id(self):
        user_id = "u-avatar-seed"
        avatar_url = f"https://res.cloudinary.com/da3i4l1st/image/upload/v1/avatars/{user_id}.webp"
        user = self._seed_user(
            user_id,
            avatar_url=avatar_url,
            avatar_public_id=f"avatars/{user_id}",
        )
        res = self.client.get("/api/v1/auth/me", headers=self._auth_headers(user))
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["avatar_url"], avatar_url)
        self.assertNotIn("avatar_public_id", body)
        self.assertNotIn("hashed_password", body)
        self.assertNotIn("refresh_jtis", body)

    def test_me_returns_null_avatar_when_user_has_none(self):
        user = self._seed_user("u-no-avatar")
        res = self.client.get("/api/v1/auth/me", headers=self._auth_headers(user))
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertIsNone(body.get("avatar_url"))
        self.assertNotIn("avatar_public_id", body)

    def test_me_returns_new_url_after_avatar_upload(self):
        user_id = "u-avatar-upload"
        user = self._seed_user(user_id)
        new_url = f"https://res.cloudinary.com/da3i4l1st/image/upload/v1/avatars/{user_id}.webp"
        new_public_id = f"avatars/{user_id}"
        headers = self._auth_headers(user)
        with patch(
            "app.routers.users.avatar_service.upload_user_avatar",
            new=AsyncMock(return_value=(new_url, new_public_id)),
        ):
            upload = self.client.post(
                "/api/v1/users/me/avatar",
                headers=headers,
                files={"file": ("avatar.png", _png_bytes(), "image/png")},
            )
        self.assertEqual(upload.status_code, 200, upload.text)
        self.assertEqual(upload.json()["avatar_url"], new_url)

        me = self.client.get("/api/v1/auth/me", headers=headers)
        self.assertEqual(me.status_code, 200, me.text)
        body = me.json()
        self.assertEqual(body["avatar_url"], new_url)
        self.assertNotIn("avatar_public_id", body)


if __name__ == "__main__":
    unittest.main()
