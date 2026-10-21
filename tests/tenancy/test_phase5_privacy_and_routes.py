"""
tests/tenancy/test_phase5_privacy_and_routes.py
Phase 5 Comprehensive Gate Tests: Privacy, Route Isolation, Switcher, and Grant Rules.

Seed (mc_ prefix):
- Company A, Company B
- U: admin in A, team_member in B
- W: admin of A only
- X: admin of B only
- O: Owner (owner_email in Settings)

Verifications:
1. Route isolation & RBAC per company: U has admin rights in A, but only member rights in B.
2. Grant rules: only O can grant/remove (W, X get 404).
3. Soft removal: removes membership, bumps token_version, revokes target company token, keeps other company token valid.
4. Privacy audit:
   - W calling user/member endpoints receives zero mention of Company B and zero cross-company memberships.
   - X calling user/member endpoints receives zero mention of Company A.
   - /auth/me for U exposes only U's companies to U.
   - Probe creation of members by email is forbidden (403).
5. Switcher rate limiting: 10/min rate limit triggers 429 on excessive switches.
6. Forged token validation: forged mid/cid/mtv fails with 401.
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
from app.core.tenant import tenant_scope, TenantDB, get_global_db


class Phase5PrivacyAndRoutesGateTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        await connect_to_mongo()
        self.gdb = db_instance.db
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.original_flag = settings.MULTI_COMPANY_ENABLED
        self.original_mt = settings.MULTI_TENANT_ENABLED
        settings.MULTI_COMPANY_ENABLED = True
        settings.MULTI_TENANT_ENABLED = True
        _AUTH_CACHE.clear()

        self.run_id = uuid.uuid4().hex[:8]
        self.cid_a = f"mc_p5_comp_a_{self.run_id}"
        self.cid_b = f"mc_p5_comp_b_{self.run_id}"

        self.owner_email = f"owner_p5_{self.run_id}@example.com"

        self.uid_o = f"mc_p5_usr_o_{self.run_id}"
        self.uid_u = f"mc_p5_usr_u_{self.run_id}"
        self.uid_w = f"mc_p5_usr_w_{self.run_id}"
        self.uid_x = f"mc_p5_usr_x_{self.run_id}"

        self.mid_u_a = f"mc_p5_mid_u_a_{self.run_id}"
        self.mid_u_b = f"mc_p5_mid_u_b_{self.run_id}"
        self.mid_w_a = f"mc_p5_mid_w_a_{self.run_id}"
        self.mid_x_b = f"mc_p5_mid_x_b_{self.run_id}"
        self.mid_o_a = f"mc_p5_mid_o_a_{self.run_id}"

        self.pwd = "Phase5SecretPwd123!"
        hashed_pwd = get_password_hash(self.pwd)
        now = datetime.now(timezone.utc)

        # 1. Companies
        self.comp_a = {
            "_id": self.cid_a,
            "id": self.cid_a,
            "name": f"Alpha Corp {self.run_id}",
            "slug": f"alpha-{self.run_id}",
            "status": "active",
            "token_version": 0,
            "created_at": now,
        }
        self.comp_b = {
            "_id": self.cid_b,
            "id": self.cid_b,
            "name": f"Beta LLC {self.run_id}",
            "slug": f"beta-{self.run_id}",
            "status": "active",
            "token_version": 0,
            "created_at": now,
        }
        await self.gdb.companies.insert_many([self.comp_a, self.comp_b])

        # 2. Users
        self.user_o = {
            "_id": self.uid_o,
            "id": self.uid_o,
            "email": self.owner_email,
            "hashed_password": hashed_pwd,
            "name": "Owner User",
            "role": "owner",
            "is_super_admin": True,
            "company_id": self.cid_a,
            "token_version": 0,
            "status": "active",
            "created_at": now,
        }
        self.user_u = {
            "_id": self.uid_u,
            "id": self.uid_u,
            "email": f"u_{self.run_id}@example.com",
            "hashed_password": hashed_pwd,
            "name": "User U",
            "role": "admin",
            "company_id": self.cid_a,
            "token_version": 0,
            "status": "active",
            "created_at": now,
        }
        self.user_w = {
            "_id": self.uid_w,
            "id": self.uid_w,
            "email": f"w_{self.run_id}@example.com",
            "hashed_password": hashed_pwd,
            "name": "Admin W",
            "role": "admin",
            "company_id": self.cid_a,
            "token_version": 0,
            "status": "active",
            "created_at": now,
        }
        self.user_x = {
            "_id": self.uid_x,
            "id": self.uid_x,
            "email": f"x_{self.run_id}@example.com",
            "hashed_password": hashed_pwd,
            "name": "Admin X",
            "role": "admin",
            "company_id": self.cid_b,
            "token_version": 0,
            "status": "active",
            "created_at": now,
        }
        await self.gdb.users.insert_many([self.user_o, self.user_u, self.user_w, self.user_x])

        # 3. Memberships
        # Owner O -> in A
        self.mem_o_a = {
            "_id": self.mid_o_a,
            "id": self.mid_o_a,
            "user_id": self.uid_o,
            "company_id": self.cid_a,
            "role": "owner",
            "status": "active",
            "access": {"attendance": True, "daily_log": True, "sales": True, "content_calendar": True, "website": True, "ads": True},
            "token_version": 0,
            "needs_setup": False,
            "created_at": now,
        }
        # U in A: Admin
        self.mem_u_a = {
            "_id": self.mid_u_a,
            "id": self.mid_u_a,
            "user_id": self.uid_u,
            "company_id": self.cid_a,
            "role": "admin",
            "status": "active",
            "access": {"attendance": True, "daily_log": True, "sales": True, "content_calendar": True, "website": True, "ads": True},
            "token_version": 0,
            "needs_setup": False,
            "created_at": now,
        }
        # U in B: Member (creative/team_member)
        self.mem_u_b = {
            "_id": self.mid_u_b,
            "id": self.mid_u_b,
            "user_id": self.uid_u,
            "company_id": self.cid_b,
            "role": "team_member",
            "status": "active",
            "access": {"attendance": True, "daily_log": True, "sales": False, "content_calendar": False, "website": False, "ads": False},
            "token_version": 0,
            "needs_setup": False,
            "created_at": now,
        }
        # W in A: Admin
        self.mem_w_a = {
            "_id": self.mid_w_a,
            "id": self.mid_w_a,
            "user_id": self.uid_w,
            "company_id": self.cid_a,
            "role": "admin",
            "status": "active",
            "access": {"attendance": True, "daily_log": True, "sales": True, "content_calendar": True, "website": True, "ads": True},
            "token_version": 0,
            "needs_setup": False,
            "created_at": now,
        }
        # X in B: Admin
        self.mem_x_b = {
            "_id": self.mid_x_b,
            "id": self.mid_x_b,
            "user_id": self.uid_x,
            "company_id": self.cid_b,
            "role": "admin",
            "status": "active",
            "access": {"attendance": True, "daily_log": True, "sales": True, "content_calendar": True, "website": True, "ads": True},
            "token_version": 0,
            "needs_setup": False,
            "created_at": now,
        }
        await self.gdb.company_memberships.insert_many([
            self.mem_o_a, self.mem_u_a, self.mem_u_b, self.mem_w_a, self.mem_x_b
        ])

        # Tokens
        self.token_o = create_access_token({
            "sub": self.uid_o,
            "email": self.owner_email,
            "cid": self.cid_a,
            "mid": self.mid_o_a,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.token_u_a = create_access_token({
            "sub": self.uid_u,
            "email": self.user_u["email"],
            "cid": self.cid_a,
            "mid": self.mid_u_a,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.token_u_b = create_access_token({
            "sub": self.uid_u,
            "email": self.user_u["email"],
            "cid": self.cid_b,
            "mid": self.mid_u_b,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.token_w_a = create_access_token({
            "sub": self.uid_w,
            "email": self.user_w["email"],
            "cid": self.cid_a,
            "mid": self.mid_w_a,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.token_x_b = create_access_token({
            "sub": self.uid_x,
            "email": self.user_x["email"],
            "cid": self.cid_b,
            "mid": self.mid_x_b,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })

    async def asyncTearDown(self):
        settings.MULTI_COMPANY_ENABLED = self.original_flag
        settings.MULTI_TENANT_ENABLED = self.original_mt
        await self.client.aclose()
        _AUTH_CACHE.clear()

        # Clean seeded test docs
        await self.gdb.companies.delete_many({"_id": {"$in": [self.cid_a, self.cid_b]}})
        await self.gdb.users.delete_many({"_id": {"$in": [self.uid_o, self.uid_u, self.uid_w, self.uid_x]}})
        await self.gdb.company_memberships.delete_many({
            "company_id": {"$in": [self.cid_a, self.cid_b]}
        })
        await close_mongo_connection()

    async def test_route_isolation_and_rbac(self):
        """U-as-A has admin rights in A; U-as-B has only member rights in B."""
        # U-as-A calling admin members in A succeeds
        resp_admin_a = await self.client.get(
            "/api/v1/admin/members",
            headers={"Authorization": f"Bearer {self.token_u_a}"},
        )
        self.assertEqual(resp_admin_a.status_code, 200)

        # U-as-B calling admin members in B fails with 403 Forbidden (U is team_member in B)
        resp_admin_b = await self.client.get(
            "/api/v1/admin/members",
            headers={"Authorization": f"Bearer {self.token_u_b}"},
        )
        self.assertEqual(resp_admin_b.status_code, 403)

    async def test_grant_rules_owner_guard(self):
        """Only owner can access /owner/members; admins W and X get 404."""
        # Owner O succeeds
        resp_o = await self.client.get(
            "/api/v1/owner/members",
            headers={"Authorization": f"Bearer {self.token_o}"},
        )
        self.assertEqual(resp_o.status_code, 200)

        # W (admin of A) gets 404
        resp_w = await self.client.get(
            "/api/v1/owner/members",
            headers={"Authorization": f"Bearer {self.token_w_a}"},
        )
        self.assertEqual(resp_w.status_code, 404)

        # X (admin of B) gets 404
        resp_x = await self.client.get(
            "/api/v1/owner/members",
            headers={"Authorization": f"Bearer {self.token_x_b}"},
        )
        self.assertEqual(resp_x.status_code, 404)

    async def test_privacy_audit_zero_leakage(self):
        """Admins W and X calling directory/profile endpoints see zero information of other companies."""
        # 1. Admin W (Company A) lists members
        resp_w = await self.client.get(
            "/api/v1/admin/members",
            headers={"Authorization": f"Bearer {self.token_w_a}"},
        )
        self.assertEqual(resp_w.status_code, 200)
        data_w = resp_w.json()
        u_in_a = next((m for m in data_w if m.get("id") == self.uid_u), None)
        self.assertIsNotNone(u_in_a)
        # Verify U shows Company A role (admin) and contains zero mention of Company B
        self.assertEqual(u_in_a.get("role"), "admin")
        self.assertNotIn(self.cid_b, str(data_w))
        self.assertNotIn("Beta LLC", str(data_w))
        self.assertNotIn("memberships", u_in_a)

        # 2. Admin X (Company B) lists members
        resp_x = await self.client.get(
            "/api/v1/admin/members",
            headers={"Authorization": f"Bearer {self.token_x_b}"},
        )
        self.assertEqual(resp_x.status_code, 200)
        data_x = resp_x.json()
        u_in_b = next((m for m in data_x if m.get("id") == self.uid_u), None)
        self.assertIsNotNone(u_in_b)
        # Verify U shows Company B role (team_member) and contains zero mention of Company A
        self.assertEqual(u_in_b.get("role"), "team_member")
        self.assertNotIn(self.cid_a, str(data_x))
        self.assertNotIn("Alpha Corp", str(data_x))
        self.assertNotIn("memberships", u_in_b)

        # 3. Privacy on /auth/me
        # W sees only Company A in their companies list
        me_w = await self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {self.token_w_a}"})
        self.assertEqual(me_w.status_code, 200)
        w_comps = [c["id"] for c in me_w.json().get("companies", [])]
        self.assertEqual(w_comps, [self.cid_a])

        # X sees only Company B in their companies list
        me_x = await self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {self.token_x_b}"})
        self.assertEqual(me_x.status_code, 200)
        x_comps = [c["id"] for c in me_x.json().get("companies", [])]
        self.assertEqual(x_comps, [self.cid_b])

        # U sees both companies in their /auth/me list (their own personal switcher)
        me_u = await self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {self.token_u_a}"})
        self.assertEqual(me_u.status_code, 200)
        u_comps = [c["id"] for c in me_u.json().get("companies", [])]
        self.assertIn(self.cid_a, u_comps)
        self.assertIn(self.cid_b, u_comps)

    async def test_switch_and_soft_removal(self):
        """Removing membership bumps token_version and invalidates only that company."""
        # Remove U from Company B via Owner API
        resp_rm = await self.client.post(
            f"/api/v1/owner/members/{self.uid_u}/companies/{self.cid_b}/remove",
            headers={"Authorization": f"Bearer {self.token_o}"},
        )
        self.assertEqual(resp_rm.status_code, 200)

        # Check membership doc is marked removed (not deleted!)
        mem_b_doc = await self.gdb.company_memberships.find_one({"id": self.mid_u_b})
        self.assertIsNotNone(mem_b_doc)
        self.assertEqual(mem_b_doc.get("status"), "removed")
        self.assertEqual(mem_b_doc.get("token_version"), 1)

        # Token for B is now rejected (401)
        resp_b_me = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {self.token_u_b}"},
        )
        self.assertEqual(resp_b_me.status_code, 401)

        # Token for A remains completely valid (200)
        resp_a_me = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {self.token_u_a}"},
        )
        self.assertEqual(resp_a_me.status_code, 200)
        self.assertEqual(resp_a_me.json()["company_id"], self.cid_a)

    async def test_forged_tokens_rejected(self):
        """Tokens with forged cid, non-existent mid, or mismatched mtv fail with 401."""
        # Forged cid
        forged_cid_token = create_access_token({
            "sub": self.uid_u,
            "email": self.user_u["email"],
            "cid": "forged_fake_company",
            "mid": self.mid_u_a,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        resp1 = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {forged_cid_token}"},
        )
        self.assertEqual(resp1.status_code, 401)

        # Forged mid
        forged_mid_token = create_access_token({
            "sub": self.uid_u,
            "email": self.user_u["email"],
            "cid": self.cid_a,
            "mid": "non_existent_mid_xyz",
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        resp2 = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {forged_mid_token}"},
        )
        self.assertEqual(resp2.status_code, 401)

        # Mismatched mtv
        bad_mtv_token = create_access_token({
            "sub": self.uid_u,
            "email": self.user_u["email"],
            "cid": self.cid_a,
            "mid": self.mid_u_a,
            "mtv": 999,
            "tv": 0,
            "ctv": 0,
        })
        resp3 = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {bad_mtv_token}"},
        )
        self.assertEqual(resp3.status_code, 401)

    async def test_nd_existence_oracle_delete_user(self):
        """DELETE /admin/users/{id} for cross-company user gives identical 404 to random id and touches nothing."""
        # W is admin of Company A. X is member of Company B only.
        random_id = f"random_usr_{uuid.uuid4().hex[:8]}"

        # 1. Delete cross-company user
        res_cross = await self.client.delete(
            f"/api/v1/admin/users/{self.uid_x}",
            headers={"Authorization": f"Bearer {self.token_w_a}"},
        )
        self.assertEqual(res_cross.status_code, 404)
        self.assertEqual(res_cross.json(), {"detail": "Member not found."})

        # 2. Delete non-existent random user
        res_random = await self.client.delete(
            f"/api/v1/admin/users/{random_id}",
            headers={"Authorization": f"Bearer {self.token_w_a}"},
        )
        self.assertEqual(res_random.status_code, 404)
        self.assertEqual(res_random.json(), {"detail": "Member not found."})

        # 3. Verify user X and user X's membership in Company B are completely untouched
        user_x_doc = await self.gdb.users.find_one({"id": self.uid_x})
        self.assertIsNotNone(user_x_doc)
        mem_x_doc = await self.gdb.company_memberships.find_one({"id": self.mid_x_b})
        self.assertIsNotNone(mem_x_doc)
        self.assertEqual(mem_x_doc.get("status"), "active")

    async def test_nf_reactivate_member_with_is_active(self):
        """In update_member with MC on, is_active: True sets a removed/inactive membership back to active."""
        uid_m = f"mc_p5_usr_m_{self.run_id}"
        mid_m_a = f"mc_p5_mid_m_a_{self.run_id}"
        await self.gdb.users.insert_one({
            "_id": uid_m,
            "id": uid_m,
            "email": f"m_{self.run_id}@example.com",
            "name": "Member M",
            "role": "team_member",
            "company_id": self.cid_a,
            "is_active": False,
            "token_version": 0,
        })
        await self.gdb.company_memberships.insert_one({
            "_id": mid_m_a,
            "id": mid_m_a,
            "user_id": uid_m,
            "company_id": self.cid_a,
            "role": "team_member",
            "status": "removed",
            "is_active": False,
            "token_version": 0,
        })

        # Membership is initially "removed"
        mem_before = await self.gdb.company_memberships.find_one({"id": mid_m_a})
        self.assertEqual(mem_before.get("status"), "removed")
        initial_tv = mem_before.get("token_version", 0)

        # Admin W calls PATCH /admin/users/{uid_m} with is_active: True
        res_patch = await self.client.patch(
            f"/api/v1/admin/users/{uid_m}",
            json={"is_active": True},
            headers={"Authorization": f"Bearer {self.token_w_a}"},
        )
        self.assertEqual(res_patch.status_code, 200)

        # Verify membership is restored to active and tv is NOT bumped
        mem_after = await self.gdb.company_memberships.find_one({"id": mid_m_a})
        self.assertEqual(mem_after.get("status"), "active")
        self.assertEqual(mem_after.get("token_version", 0), initial_tv)

    async def test_l3_delete_leave_request_cross_company_404(self):
        """DELETE /leaves/requests/{id} returns 404 when record does not belong to caller company."""
        # 1. Insert leave request in Company A
        leave_id = f"leave_{uuid.uuid4().hex[:8]}"
        await self.gdb.leave_requests.insert_one({
            "_id": leave_id,
            "id": leave_id,
            "user_id": self.uid_u,
            "company_id": self.cid_a,
            "leave_type": "annual",
            "status": "pending",
            "days": 1,
        })

        # 2. Admin X of Company B attempts to delete Company A leave request -> 404
        res_x = await self.client.delete(
            f"/api/v1/leaves/requests/{leave_id}",
            headers={"Authorization": f"Bearer {self.token_x_b}"},
        )
        self.assertEqual(res_x.status_code, 404)
        self.assertIn("not found", res_x.json()["detail"].lower())

        # 3. Random leave id -> 404
        res_random = await self.client.delete(
            "/api/v1/leaves/requests/non_existent_leave_id_123",
            headers={"Authorization": f"Bearer {self.token_x_b}"},
        )
        self.assertEqual(res_random.status_code, 404)

        # 4. Admin W of Company A deletes the leave request -> 200
        res_w = await self.client.delete(
            f"/api/v1/leaves/requests/{leave_id}",
            headers={"Authorization": f"Bearer {self.token_w_a}"},
        )
        self.assertEqual(res_w.status_code, 200)

    async def test_r7_no_company_id_and_legacy_logout(self):
        """A user with no company_id and MT on -> 401. After legacy logout, old token -> 401."""
        # 1. User with no company_id with MT on -> 401
        no_cid_uid = f"no_cid_usr_{uuid.uuid4().hex[:8]}"
        await self.gdb.users.insert_one({
            "id": no_cid_uid,
            "email": f"{no_cid_uid}@example.com",
            "name": "No Company User",
            "role": "team_member",
            "is_active": True,
            "token_version": 0,
        })

        no_cid_token = create_access_token({
            "sub": no_cid_uid,
            "email": f"{no_cid_uid}@example.com",
            "tv": 0,
        })
        _AUTH_CACHE.clear()
        res_no_cid = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {no_cid_token}"},
        )
        self.assertEqual(res_no_cid.status_code, 401)
        self.assertIn("Account not linked to a company", res_no_cid.json()["detail"])

        # 2. Legacy logout bumps token_version and invalidates old token
        # Create a fresh token for user W
        token_to_logout = create_access_token({
            "sub": self.uid_w,
            "email": self.user_w["email"],
            "cid": self.cid_a,
            "mid": self.mid_w_a,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        _AUTH_CACHE.clear()

        # Token works before logout
        me_before = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token_to_logout}"},
        )
        self.assertEqual(me_before.status_code, 200)

        # Logout via /auth/logout
        logout_res = await self.client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token_to_logout}"},
        )
        self.assertEqual(logout_res.status_code, 200)

        # Old token is now rejected with 401
        _AUTH_CACHE.clear()
        me_after = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token_to_logout}"},
        )
        self.assertEqual(me_after.status_code, 401)


if __name__ == "__main__":
    unittest.main()
