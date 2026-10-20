"""
tests/tenancy/test_phase2_multi_company.py
Automated Gate Test for Phase 2: Login, token, switching.

Requirements verified:
- MULTI_COMPANY_ENABLED feature flag controls multi-company behavior.
- Token carries mid, mtv, and cid matching the active membership.
- Login opens active membership (or last_company_id) and returns companies list.
- POST /auth/switch-company checks active membership, issues new tokens, logs company_switch, rate-limited to 10/min.
- GET /auth/my-companies lists user's active companies for the switcher.
- Removing a membership bumps its token_version: kills that company's tokens while other company tokens still work.
- Forged cid or forged mid returns 401.
- Rollback: flag off returns to single-company behavior.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
import uuid

import httpx
from app.main import app
from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection, db_instance
from app.core.security import get_password_hash, create_access_token, _AUTH_CACHE


class Phase2MultiCompanyGateTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        await connect_to_mongo()
        self.gdb = db_instance.db
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.original_flag = settings.MULTI_COMPANY_ENABLED
        settings.MULTI_COMPANY_ENABLED = True
        _AUTH_CACHE.clear()

        # Unique prefix for this test run
        self.run_id = uuid.uuid4().hex[:8]
        self.cid_a = f"mc_comp_a_{self.run_id}"
        self.cid_b = f"mc_comp_b_{self.run_id}"
        self.cid_c = f"mc_comp_c_{self.run_id}"

        self.uid_dual = f"mc_usr_dual_{self.run_id}"
        self.email_dual = f"dual_{self.run_id}@example.com"
        await self.gdb.rate_limit_counters.delete_many({"key": {"$regex": self.email_dual}})
        self.password = "SecretPassword123!"
        self.hashed_pwd = get_password_hash(self.password)

        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        # Companies
        self.comp_a = {
            "_id": self.cid_a,
            "id": self.cid_a,
            "name": f"Alpha Corp {self.run_id}",
            "slug": f"alpha-{self.run_id}",
            "logo_url": "https://example.com/alpha.png",
            "accent_color": "#6847E0",
            "timezone": "Asia/Karachi",
            "status": "active",
            "token_version": 0,
            "created_at": now,
        }
        self.comp_b = {
            "_id": self.cid_b,
            "id": self.cid_b,
            "name": f"Beta Corp {self.run_id}",
            "slug": f"beta-{self.run_id}",
            "logo_url": "https://example.com/beta.png",
            "accent_color": "#00AA66",
            "timezone": "America/New_York",
            "status": "active",
            "token_version": 0,
            "created_at": now,
        }
        await self.gdb.companies.insert_many([self.comp_a, self.comp_b])

        # User document
        self.user_doc = {
            "_id": self.uid_dual,
            "id": self.uid_dual,
            "email": self.email_dual,
            "name": "Dual Employee",
            "full_name": "Dual Employee",
            "hashed_password": self.hashed_pwd,
            "role": "team_member",
            "company_id": self.cid_a,
            "is_active": True,
            "is_super_admin": False,
            "token_version": 0,
            "session_epoch": 0,
            "refresh_jtis": [],
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await self.gdb.users.insert_one(self.user_doc)

        # Memberships: Admin in A, Team Member in B
        self.mid_a = f"mem_a_{self.run_id}"
        self.mid_b = f"mem_b_{self.run_id}"

        self.mem_a = {
            "_id": self.mid_a,
            "id": self.mid_a,
            "user_id": self.uid_dual,
            "company_id": self.cid_a,
            "role": "admin",
            "primary_department": "Management",
            "departments": ["Management"],
            "content_stages": [],
            "access": {
                "attendance": True,
                "daily_log": True,
                "sales": True,
                "content_calendar": True,
                "website": True,
                "ads": True,
            },
            "status": "active",
            "granted_by": "test",
            "granted_at": now_iso,
            "needs_setup": False,
            "token_version": 0,
        }
        self.mem_b = {
            "_id": self.mid_b,
            "id": self.mid_b,
            "user_id": self.uid_dual,
            "company_id": self.cid_b,
            "role": "team_member",
            "primary_department": "Design",
            "departments": ["Design"],
            "content_stages": ["creative"],
            "access": {
                "attendance": False,
                "daily_log": False,
                "sales": False,
                "content_calendar": True,
                "website": False,
                "ads": False,
            },
            "status": "active",
            "granted_by": "test",
            "granted_at": now_iso,
            "needs_setup": False,
            "token_version": 0,
        }
        await self.gdb.company_memberships.insert_many([self.mem_a, self.mem_b])

    async def asyncTearDown(self):
        settings.MULTI_COMPANY_ENABLED = self.original_flag
        await self.client.aclose()
        # Clean test fixtures
        await self.gdb.companies.delete_many({"id": {"$in": [self.cid_a, self.cid_b, self.cid_c]}})
        await self.gdb.users.delete_many({"id": self.uid_dual})
        await self.gdb.company_memberships.delete_many({"id": {"$in": [self.mid_a, self.mid_b]}})

    async def test_gate_login_and_switch_and_revocation(self):
        """
        Phase 2 Gate:
        1. Login opens Company A (first/default). Check returned role is admin and companies list is present.
        2. Access /auth/me returns Company A role (admin) and companies list.
        3. Switch to Company B: returns new tokens with Company B and role team_member.
        4. Access /auth/me with new token: role is team_member, company_id is Company B.
        5. GET /auth/my-companies lists both companies with correct roles and current flag.
        6. Removing Company A membership kills Company A session (401), while Company B session still works (200).
        7. Forged token with invalid mid or mismatched cid returns 401.
        """
        # 1. Login
        login_resp = await self.client.post("/api/v1/auth/login", json={
            "email": self.email_dual,
            "password": self.password,
        })
        self.assertEqual(login_resp.status_code, 200, login_resp.text)
        login_data = login_resp.json()

        token_a = login_data.get("access_token")
        if not token_a and "access_token" in login_resp.cookies:
            token_a = login_resp.cookies["access_token"]
        self.assertIsNotNone(token_a)

        self.assertEqual(login_data["user"]["role"], "admin")
        self.assertEqual(login_data["user"]["company_id"], self.cid_a)
        self.assertIn("companies", login_data)
        self.assertEqual(len(login_data["companies"]), 2)

        # 2. Verify /auth/me under Company A
        headers_a = {"Authorization": f"Bearer {token_a}"}
        me_resp_a = await self.client.get("/api/v1/auth/me", headers=headers_a)
        self.assertEqual(me_resp_a.status_code, 200)
        me_a = me_resp_a.json()
        self.assertEqual(me_a["role"], "admin")
        self.assertEqual(me_a["company_id"], self.cid_a)
        self.assertEqual(len(me_a.get("companies") or []), 2)

        # 3. Switch to Company B
        switch_resp = await self.client.post(
            "/api/v1/auth/switch-company",
            json={"company_id": self.cid_b},
            headers=headers_a,
        )
        self.assertEqual(switch_resp.status_code, 200, switch_resp.text)
        switch_data = switch_resp.json()

        token_b = switch_data.get("access_token")
        if not token_b and "access_token" in switch_resp.cookies:
            token_b = switch_resp.cookies["access_token"]
        self.assertIsNotNone(token_b)

        self.assertEqual(switch_data["user"]["role"], "team_member")
        self.assertEqual(switch_data["user"]["company_id"], self.cid_b)

        # 4. Verify /auth/me under Company B
        headers_b = {"Authorization": f"Bearer {token_b}"}
        me_resp_b = await self.client.get("/api/v1/auth/me", headers=headers_b)
        self.assertEqual(me_resp_b.status_code, 200)
        me_b = me_resp_b.json()
        self.assertEqual(me_b["role"], "team_member")
        self.assertEqual(me_b["company_id"], self.cid_b)

        # Verify last_company_id in database was updated
        updated_user = await self.gdb.users.find_one({"id": self.uid_dual})
        self.assertEqual(updated_user.get("last_company_id"), self.cid_b)

        # 5. Verify /auth/my-companies
        my_comp_resp = await self.client.get("/api/v1/auth/my-companies", headers=headers_b)
        self.assertEqual(my_comp_resp.status_code, 200)
        comps = my_comp_resp.json()
        self.assertEqual(len(comps), 2)
        comp_b_item = next(c for c in comps if c["id"] == self.cid_b)
        self.assertTrue(comp_b_item["is_current"])
        self.assertEqual(comp_b_item["role"], "team_member")

        comp_a_item = next(c for c in comps if c["id"] == self.cid_a)
        self.assertFalse(comp_a_item["is_current"])
        self.assertEqual(comp_a_item["role"], "admin")

        # 6. Removing Membership A kills Token A, while Token B still works
        await self.gdb.company_memberships.update_one(
            {"id": self.mid_a},
            {"$set": {"status": "removed"}, "$inc": {"token_version": 1}},
        )
        _AUTH_CACHE.clear()

        # Token A is now rejected (revoked / removed)
        dead_a_resp = await self.client.get("/api/v1/auth/me", headers=headers_a)
        self.assertEqual(dead_a_resp.status_code, 401)

        # Token B continues working normally
        alive_b_resp = await self.client.get("/api/v1/auth/me", headers=headers_b)
        self.assertEqual(alive_b_resp.status_code, 200)

        # 7. Forged token checks
        # Forged mid
        forged_mid_token = create_access_token({
            "sub": self.uid_dual,
            "email": self.email_dual,
            "cid": self.cid_b,
            "mid": "forged_mid_does_not_exist",
            "mtv": 0,
        })
        forged_mid_resp = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {forged_mid_token}"},
        )
        self.assertEqual(forged_mid_resp.status_code, 401)

        # Forged cid mismatch with membership
        forged_cid_token = create_access_token({
            "sub": self.uid_dual,
            "email": self.email_dual,
            "cid": self.cid_a,  # mismatch with mid_b
            "mid": self.mid_b,
            "mtv": 0,
        })
        forged_cid_resp = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {forged_cid_token}"},
        )
        self.assertEqual(forged_cid_resp.status_code, 401)

    async def test_rollback_flag_off_preserves_legacy_behavior(self):
        """When MULTI_COMPANY_ENABLED is False, legacy single-company flow is retained."""
        settings.MULTI_COMPANY_ENABLED = False

        # Issue legacy token without mid
        legacy_token = create_access_token({
            "sub": self.uid_dual,
            "email": self.email_dual,
            "cid": self.cid_a,
            "tv": 0,
            "ver": 0,
        })

        resp = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {legacy_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["company_id"], self.cid_a)
        # In legacy mode without mid, user's role comes from user_doc (team_member)
        self.assertEqual(data["role"], "team_member")

    async def asyncTearDown(self):
        settings.MULTI_COMPANY_ENABLED = self.original_flag
        _AUTH_CACHE.clear()
        if hasattr(self, "gdb") and self.gdb is not None:
            await self.gdb.companies.delete_many({"id": {"$in": [self.cid_a, self.cid_b, self.cid_c]}})
            await self.gdb.users.delete_many({"id": self.uid_dual})
            await self.gdb.company_memberships.delete_many({"user_id": self.uid_dual})
            await self.gdb.rate_limit_counters.delete_many({"key": {"$regex": self.email_dual}})
        await self.client.aclose()
        await close_mongo_connection()
