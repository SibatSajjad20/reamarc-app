"""Parallel refreshes from tabs of one browser must never sign out other devices.

Runs against a throwaway Mongo (MONGODB_DB_NAME must contain 'test')."""
from __future__ import annotations

import asyncio
import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "test-secret-key-refresh-race-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx

from app.config import settings
from app.core.security import claims_with_session, create_refresh_token
from app.database import connect_to_mongo
from app.main import app

TEST_DB = os.environ.get("REFRESH_RACE_TEST_DB", "reamarc_test_refresh_race")
CID = "company_test_race"
DEVICES = ["phone", "laptop", "office", "tablet"]


def make_user(i: int) -> tuple[dict, dict]:
    uid = f"race_u{i}"
    user = {
        "id": uid, "email": f"{uid}@example.test", "full_name": uid, "role": "employee",
        "is_active": True, "company_id": CID, "session_epoch": 0,
        "refresh_jtis": [f"{d}-{uid}" for d in DEVICES], "refresh_retired": [],
    }
    mem = {"id": f"m_{uid}", "user_id": uid, "company_id": CID, "status": "active", "role": "employee",
           "primary_department": "Creative", "departments": ["Creative"], "token_version": 0}
    return user, mem


def refresh_for(user: dict, mem: dict, company: dict, jti: str) -> str:
    base = {"sub": user["id"], "email": user["email"], "name": user["id"], "role": "employee",
            "cid": CID, "workspace_ids": [], "mid": mem["id"], "mtv": 0}
    claims = claims_with_session(user, base, company_doc=company, membership_doc=mem)
    claims["jti"] = jti
    return create_refresh_token(claims)


class RaceBase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in settings.MONGODB_DB_NAME.lower() and settings.MONGODB_DB_NAME != "reamarc_db"
        await connect_to_mongo()
        from app.database import db_instance
        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        from app.core.limiter import limiter
        limiter.enabled = False
        self.company = {"id": CID, "name": "Race Co", "status": "active"}
        await self.db.companies.insert_one(dict(self.company))
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        from app.database import db_instance
        await db_instance.client.drop_database(TEST_DB)
        db_instance.client.close()
        db_instance.client = None
        db_instance.db = None  # don't leak a client bound to this test's closed loop

    async def seed(self, n: int):
        users = []
        for i in range(n):
            u, m = make_user(i)
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            users.append((u, m))
        return users

    async def post_refresh(self, token: str) -> httpx.Response:
        self.client.cookies.clear()
        return await self.client.post("/api/v1/auth/refresh", json={"refresh_token": token},
                                      headers={"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"})


class TestRefreshRace(RaceBase):
    async def test_two_tabs_racing_never_sign_out_other_devices(self):
        (u, m), = await self.seed(1)
        laptop = refresh_for(u, m, self.company, f"laptop-{u['id']}")
        for _ in range(12):  # twelve hourly races
            r1, r2 = await asyncio.gather(self.post_refresh(laptop), self.post_refresh(laptop))
            self.assertEqual((r1.status_code, r2.status_code), (200, 200), (r1.text, r2.text))
            laptop = r2.cookies.get("refresh_token") or r2.json().get("refresh_token")
            self.assertTrue(laptop)
        doc = await self.db.users.find_one({"id": u["id"]})
        self.assertLessEqual(len(doc["refresh_jtis"]), 4, doc["refresh_jtis"])
        for d in ("phone", "office", "tablet"):
            r = await self.post_refresh(refresh_for(u, m, self.company, f"{d}-{u['id']}"))
            self.assertEqual(r.status_code, 200, f"{d} was signed out: {r.text}")

    async def test_three_tabs_racing_all_succeed(self):
        (u, m), = await self.seed(1)
        tok = refresh_for(u, m, self.company, f"laptop-{u['id']}")
        rs = await asyncio.gather(*[self.post_refresh(tok) for _ in range(3)])
        self.assertEqual([r.status_code for r in rs], [200, 200, 200], [r.text for r in rs])

    async def test_stale_token_still_rejected(self):
        (u, m), = await self.seed(1)
        r = await self.post_refresh(refresh_for(u, m, self.company, "never-issued"))
        self.assertEqual(r.status_code, 401)


if __name__ == "__main__":
    unittest.main()
