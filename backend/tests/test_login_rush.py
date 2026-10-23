"""9 AM rush: a whole office behind one IP (office NAT, or every browser behind the
Vercel /api rewrite) must be able to sign in together. Brute force stays bounded per email.

Runs against a throwaway Mongo (MONGODB_DB_NAME must contain 'test')."""
from __future__ import annotations

import asyncio
import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "test-secret-key-login-rush-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx

from app.config import settings
from app.core.security import get_password_hash
from app.database import connect_to_mongo
from app.main import app

TEST_DB = os.environ.get("LOGIN_RUSH_TEST_DB", "reamarc_test_login_rush")
CID = "company_test_rush"
PW = "Passw0rd!x"
HDRS = {"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"}


class TestLoginRush(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._old_db = settings.MONGODB_DB_NAME
        self._old_mc = settings.MULTI_COMPANY_ENABLED
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", True)
        assert "test" in settings.MONGODB_DB_NAME.lower() and settings.MONGODB_DB_NAME != "reamarc_db"
        await connect_to_mongo()
        from app.database import db_instance
        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        from app.core.limiter import limiter
        self._old_limiter = limiter.enabled
        limiter.enabled = True
        limiter.reset()
        h = get_password_hash(PW)
        await self.db.companies.insert_one({"id": CID, "name": "Rush Co", "status": "active", "token_version": 0})
        for i in range(25):
            uid = f"rush{i:02d}"
            await self.db.users.insert_one({"id": uid, "email": f"{uid}@rushco.com", "full_name": uid, "role": "employee",
                                            "is_active": True, "hashed_password": h, "company_id": CID, "session_epoch": 0,
                                            "refresh_jtis": [], "refresh_retired": []})
            await self.db.company_memberships.insert_one({"id": f"m_{uid}", "user_id": uid, "company_id": CID, "status": "active",
                                                          "role": "employee", "primary_department": "Creative",
                                                          "departments": ["Creative"], "token_version": 0})

    async def asyncTearDown(self):
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", self._old_mc)
        object.__setattr__(settings, "MONGODB_DB_NAME", self._old_db)
        from app.core.limiter import limiter
        limiter.reset()
        limiter.enabled = self._old_limiter
        from app.database import db_instance
        await db_instance.client.drop_database(TEST_DB)
        db_instance.client.close()
        db_instance.client = None
        db_instance.db = None

    async def login(self, email: str, pw: str = PW) -> int:
        # One client per user (own cookie jar), all from the same source IP.
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post("/api/v1/auth/login", json={"email": email, "password": pw}, headers=HDRS)
            return r.status_code

    async def test_25_users_one_ip_all_sign_in(self):
        codes = await asyncio.gather(*[self.login(f"rush{i:02d}@rushco.com") for i in range(25)])
        self.assertEqual(codes, [200] * 25)

    async def test_password_guessing_one_account_still_blocked(self):
        codes = [await self.login("rush00@rushco.com", "wrong-password") for _ in range(12)]
        self.assertEqual(codes[:10], [401] * 10)
        self.assertEqual(codes[10:], [429, 429])


if __name__ == "__main__":
    unittest.main()
