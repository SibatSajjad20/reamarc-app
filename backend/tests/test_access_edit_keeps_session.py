"""Real admin flow: an admin changes a team lead's access while the lead is working.

The lead must stay signed in (web and phone), see the new rights, and see the same
content stages whether permissions come from the membership or the user record."""
from __future__ import annotations

import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "test-secret-key-access-edit-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx

from app.config import settings
from app.core.security import claims_with_session, create_access_token, create_refresh_token
from app.database import connect_to_mongo
from app.main import app
from app.services.access import effective_access

TEST_DB = "reamarc_test_access_edit"
CID = "company_test_access"


def _docs(uid, role, dept, depts, stages="__missing__"):
    u = {"id": uid, "email": f"{uid}@example.test", "full_name": uid, "role": role, "is_active": True,
         "company_id": CID, "session_epoch": 0, "primary_department": dept, "department": dept,
         "departments": depts, "refresh_jtis": [f"web-{uid}", f"phone-{uid}"], "refresh_retired": []}
    m = {"id": f"m_{uid}", "user_id": uid, "company_id": CID, "status": "active", "role": role,
         "primary_department": dept, "departments": depts, "token_version": 0}
    if stages != "__missing__":
        u["content_stages"] = stages
        m["content_stages"] = stages
    return u, m


class TestAccessEditKeepsSession(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in TEST_DB
        await connect_to_mongo()
        from app.database import db_instance
        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        from app.core.limiter import limiter
        limiter.enabled = False
        self.company = {"id": CID, "name": "Access Co", "status": "active", "token_version": 0}
        await self.db.companies.insert_one(dict(self.company))
        self.admin, self.admin_m = _docs("adm", "admin", "Operations", ["Operations"])
        self.lead, self.lead_m = _docs("lead", "team_lead", "Creative", ["Creative", "Content"])
        for d, c in ((self.admin, "users"), (self.lead, "users"), (self.admin_m, "company_memberships"), (self.lead_m, "company_memberships")):
            await self.db[c].insert_one(dict(d))
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        from app.database import db_instance
        await db_instance.client.drop_database(TEST_DB)
        db_instance.client.close()
        db_instance.client = None
        db_instance.db = None  # don't leak a client bound to this test's closed loop

    def _tokens(self, u, m, device):
        base = {"sub": u["id"], "email": u["email"], "name": u["id"], "role": m["role"], "cid": CID,
                "workspace_ids": [], "mid": m["id"], "mtv": m["token_version"]}
        c = claims_with_session(u, base, company_doc=self.company, membership_doc=m)
        sid = f"{device}-{u['id']}"
        return create_access_token(dict(c, sid=sid)), create_refresh_token(dict(c, jti=sid))

    async def _get(self, path, access):
        self.client.cookies.clear()
        return await self.client.get(f"/api/v1{path}", headers={"Authorization": f"Bearer {access}", "X-Requested-With": "XMLHttpRequest"})

    async def test_admin_edits_access_lead_stays_signed_in_on_web_and_phone(self):
        web_a, web_r = self._tokens(self.lead, self.lead_m, "web")
        phone_a, phone_r = self._tokens(self.lead, self.lead_m, "phone")
        adm_a, _ = self._tokens(self.admin, self.admin_m, "web")
        self.assertEqual((await self._get("/auth/me", web_a)).status_code, 200)

        self.client.cookies.clear()
        r = await self.client.patch(f"/api/v1/access/users/{self.lead['id']}", json={"content_stages": ["creative", "content", "social_media"]},
                                    headers={"Authorization": f"Bearer {adm_a}", "X-Requested-With": "XMLHttpRequest"})
        self.assertEqual(r.status_code, 200, r.text)
        self.client.cookies.clear()
        r = await self.client.patch(f"/api/v1/access/users/{self.lead['id']}", json={"module": "sales", "value": True},
                                    headers={"Authorization": f"Bearer {adm_a}", "X-Requested-With": "XMLHttpRequest"})
        self.assertEqual(r.status_code, 200, r.text)

        for name, access in (("web", web_a), ("phone", phone_a)):
            me = await self._get("/auth/me", access)
            self.assertEqual(me.status_code, 200, f"{name} signed out after access edit: {me.text}")
            self.assertIn("social_media", me.json().get("content_stages") or [], me.json())
        for refresh in (web_r, phone_r):
            self.client.cookies.clear()
            rr = await self.client.post("/api/v1/auth/refresh", json={"refresh_token": refresh}, headers={"X-Requested-With": "XMLHttpRequest"})
            self.assertEqual(rr.status_code, 200, rr.text)

    async def test_reset_access_keeps_session(self):
        web_a, _ = self._tokens(self.lead, self.lead_m, "web")
        adm_a, _ = self._tokens(self.admin, self.admin_m, "web")
        self.client.cookies.clear()
        r = await self.client.post(f"/api/v1/access/users/{self.lead['id']}/reset", json={},
                                   headers={"Authorization": f"Bearer {adm_a}", "X-Requested-With": "XMLHttpRequest"})
        self.assertIn(r.status_code, (200, 204), r.text)
        self.assertEqual((await self._get("/auth/me", web_a)).status_code, 200)

    async def test_removed_member_is_still_signed_out(self):
        web_a, web_r = self._tokens(self.lead, self.lead_m, "web")
        await self.db.company_memberships.update_one({"id": self.lead_m["id"]}, {"$set": {"status": "removed"}})
        from app.core.security import invalidate_auth_cache
        invalidate_auth_cache(user_id=self.lead["id"], membership_id=self.lead_m["id"])
        self.assertEqual((await self._get("/auth/me", web_a)).status_code, 401)

    async def test_stages_same_from_membership_and_user_record(self):
        web_a, _ = self._tokens(self.lead, self.lead_m, "web")
        me = (await self._get("/auth/me", web_a)).json()
        user_doc = await self.db.users.find_one({"id": self.lead["id"]})
        self.assertEqual(sorted(me.get("content_stages") or []), sorted(effective_access(user_doc)["content_stages"]))


if __name__ == "__main__":
    unittest.main()
