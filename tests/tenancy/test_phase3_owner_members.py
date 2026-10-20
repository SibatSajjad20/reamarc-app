"""
tests/tenancy/test_phase3_owner_members.py
Automated Gate Test for Phase 3: Owner grants access; company admin sets it up.

Requirements verified:
- MULTI_COMPANY_ENABLED feature flag controls multi-company behavior.
- Only the owner can grant/remove company access (non-owners get 404).
- Owner lists members across companies with search filter.
- Owner grants access to user in target company:
  - Creates membership with role=team_member, needs_setup=True, all access switches False, no departments.
  - Audit log entry recorded in owner_audit.
  - Target company admin sees user with needs_setup=True.
- Target company admin saves role/department:
  - Membership is updated, needs_setup is cleared (False).
- Target company admin configures access switches:
  - Membership access permissions update correctly.
- Owner removes access:
  - Soft remove: status='removed', bumps token_version.
  - Revokes tokens for that company only; user data is preserved; other company tokens still valid.
- Rollback: flag off returns 404 on owner members endpoints.
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


class Phase3OwnerMembersGateTest(unittest.IsolatedAsyncioTestCase):
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
        self.cid_a = f"mc_p3_comp_a_{self.run_id}"
        self.cid_b = f"mc_p3_comp_b_{self.run_id}"

        self.uid_owner = f"mc_p3_owner_{self.run_id}"
        self.uid_admin_a = f"mc_p3_admin_a_{self.run_id}"
        self.uid_admin_b = f"mc_p3_admin_b_{self.run_id}"
        self.uid_user_c = f"mc_p3_cand_c_{self.run_id}"

        self.pwd = "Phase3SecretPwd!"
        hashed_pwd = get_password_hash(self.pwd)
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        # Companies
        self.comp_a = {
            "_id": self.cid_a,
            "id": self.cid_a,
            "name": f"Company A {self.run_id}",
            "slug": f"comp-a-{self.run_id}",
            "status": "active",
            "token_version": 0,
            "created_at": now,
        }
        self.comp_b = {
            "_id": self.cid_b,
            "id": self.cid_b,
            "name": f"Company B {self.run_id}",
            "slug": f"comp-b-{self.run_id}",
            "status": "active",
            "token_version": 0,
            "created_at": now,
        }
        await self.gdb.companies.insert_many([self.comp_a, self.comp_b])

        # Users
        self.users = [
            {
                "_id": self.uid_owner,
                "id": self.uid_owner,
                "email": f"owner_{self.run_id}@example.com",
                "name": "Owner Faizan",
                "full_name": "Owner Faizan",
                "hashed_password": hashed_pwd,
                "role": "owner",
                "company_id": self.cid_a,
                "is_active": True,
                "is_super_admin": True,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.uid_admin_a,
                "id": self.uid_admin_a,
                "email": f"admin_a_{self.run_id}@example.com",
                "name": "Admin Company A",
                "full_name": "Admin Company A",
                "hashed_password": hashed_pwd,
                "role": "admin",
                "company_id": self.cid_a,
                "is_active": True,
                "is_super_admin": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.uid_admin_b,
                "id": self.uid_admin_b,
                "email": f"admin_b_{self.run_id}@example.com",
                "name": "Admin Company B",
                "full_name": "Admin Company B",
                "hashed_password": hashed_pwd,
                "role": "admin",
                "company_id": self.cid_b,
                "is_active": True,
                "is_super_admin": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.uid_user_c,
                "id": self.uid_user_c,
                "email": f"cand_c_{self.run_id}@example.com",
                "name": "Candidate User C",
                "full_name": "Candidate User C",
                "hashed_password": hashed_pwd,
                "role": "team_member",
                "company_id": self.cid_a,
                "is_active": True,
                "is_super_admin": False,
                "token_version": 0,
                "created_at": now_iso,
            },
        ]
        await self.gdb.users.insert_many(self.users)

        # Initial Memberships
        self.mid_owner = f"mem_owner_{self.run_id}"
        self.mid_admin_a = f"mem_admin_a_{self.run_id}"
        self.mid_admin_b = f"mem_admin_b_{self.run_id}"
        self.mid_user_c_a = f"mem_user_c_a_{self.run_id}"

        self.memberships = [
            {
                "_id": self.mid_owner,
                "id": self.mid_owner,
                "user_id": self.uid_owner,
                "company_id": self.cid_a,
                "role": "owner",
                "status": "active",
                "needs_setup": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.mid_admin_a,
                "id": self.mid_admin_a,
                "user_id": self.uid_admin_a,
                "company_id": self.cid_a,
                "role": "admin",
                "status": "active",
                "needs_setup": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.mid_admin_b,
                "id": self.mid_admin_b,
                "user_id": self.uid_admin_b,
                "company_id": self.cid_b,
                "role": "admin",
                "status": "active",
                "needs_setup": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.mid_user_c_a,
                "id": self.mid_user_c_a,
                "user_id": self.uid_user_c,
                "company_id": self.cid_a,
                "role": "team_member",
                "status": "active",
                "needs_setup": False,
                "token_version": 0,
                "created_at": now_iso,
            },
        ]
        await self.gdb.company_memberships.insert_many(self.memberships)

        # Create auth headers
        self.owner_token = create_access_token({
            "sub": self.uid_owner,
            "cid": self.cid_a,
            "mid": self.mid_owner,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.admin_a_token = create_access_token({
            "sub": self.uid_admin_a,
            "cid": self.cid_a,
            "mid": self.mid_admin_a,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.admin_b_token = create_access_token({
            "sub": self.uid_admin_b,
            "cid": self.cid_b,
            "mid": self.mid_admin_b,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.user_c_a_token = create_access_token({
            "sub": self.uid_user_c,
            "cid": self.cid_a,
            "mid": self.mid_user_c_a,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })

    async def asyncTearDown(self):
        settings.MULTI_COMPANY_ENABLED = self.original_flag
        settings.MULTI_TENANT_ENABLED = self.original_mt
        await self.client.aclose()
        # Clean fixtures
        await self.gdb.companies.delete_many({"id": {"$in": [self.cid_a, self.cid_b]}})
        await self.gdb.users.delete_many({"id": {"$in": [self.uid_owner, self.uid_admin_a, self.uid_admin_b, self.uid_user_c]}})
        await self.gdb.company_memberships.delete_many({"user_id": {"$in": [self.uid_owner, self.uid_admin_a, self.uid_admin_b, self.uid_user_c]}})
        await self.gdb.owner_audit.delete_many({"action": {"$in": ["grant_company_access", "remove_company_access"]}})

    async def test_gate_phase3_full_lifecycle(self):
        """
        Phase 3 Gate Full Lifecycle Test:
        1. Non-owners get 404 on owner endpoints.
        2. Owner lists members and searches.
        3. Owner grants access to Candidate C in Company B -> starts with needs_setup=True, minimal access.
        4. Company B admin lists members -> sees Candidate C with needs_setup=True.
        5. Company B admin updates role -> clears needs_setup.
        6. Company B admin updates access switches.
        7. Candidate C can access Company B.
        8. Owner removes Candidate C from Company B -> soft remove, bumps token_version, revokes Company B token, preserves Company A token and data.
        9. Rollback flag off returns 404.
        """
        # 1. Non-owners get 404 on /owner/members endpoints
        resp = await self.client.get(
            "/api/v1/owner/members",
            headers={"Authorization": f"Bearer {self.admin_a_token}"},
        )
        self.assertEqual(resp.status_code, 404, f"Non-owner should get 404, got {resp.status_code}")

        resp = await self.client.post(
            f"/api/v1/owner/members/{self.uid_user_c}/companies",
            json={"company_id": self.cid_b},
            headers={"Authorization": f"Bearer {self.admin_a_token}"},
        )
        self.assertEqual(resp.status_code, 404)

        resp = await self.client.post(
            f"/api/v1/owner/members/{self.uid_user_c}/companies/{self.cid_b}/remove",
            headers={"Authorization": f"Bearer {self.admin_b_token}"},
        )
        self.assertEqual(resp.status_code, 404)

        # 2. Owner lists members
        resp = await self.client.get(
            "/api/v1/owner/members",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        members_data = resp.json()
        self.assertIsInstance(members_data, list)
        uids = [m["id"] for m in members_data]
        self.assertIn(self.uid_user_c, uids)
        self.assertIn(self.uid_admin_b, uids)

        # Search filter
        search_email = f"cand_c_{self.run_id}"
        resp_search = await self.client.get(
            f"/api/v1/owner/members?search={search_email}",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(resp_search.status_code, 200)
        searched = resp_search.json()
        self.assertEqual(len(searched), 1)
        self.assertEqual(searched[0]["id"], self.uid_user_c)

        # 3. Owner grants Candidate C access to Company B
        grant_resp = await self.client.post(
            f"/api/v1/owner/members/{self.uid_user_c}/companies",
            json={"company_id": self.cid_b},
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(grant_resp.status_code, 200, f"Grant failed: {grant_resp.text}")
        grant_result = grant_resp.json()
        self.assertTrue(grant_result.get("ok"))

        # Verify DB membership document
        mem_b = await self.gdb.company_memberships.find_one({
            "user_id": self.uid_user_c,
            "company_id": self.cid_b,
        })
        self.assertIsNotNone(mem_b)
        self.assertEqual(mem_b.get("role"), "team_member")
        self.assertEqual(mem_b.get("status"), "active")
        self.assertTrue(mem_b.get("needs_setup"))
        self.assertEqual(mem_b.get("departments"), [])
        # All access switches false
        access_switches = mem_b.get("access", {})
        self.assertFalse(access_switches.get("attendance"))
        self.assertFalse(access_switches.get("daily_log"))
        self.assertFalse(access_switches.get("sales"))

        # Check owner audit entry
        audit_entry = await self.gdb.owner_audit.find_one({
            "action": "grant_company_access",
            "details.target_user_id": self.uid_user_c,
            "target_company_id": self.cid_b,
        })
        self.assertIsNotNone(audit_entry)

        # 4. Company B admin lists members -> sees Candidate C with needs_setup=True
        admin_b_list = await self.client.get(
            "/api/v1/admin/members",
            headers={"Authorization": f"Bearer {self.admin_b_token}"},
        )
        self.assertEqual(admin_b_list.status_code, 200)
        b_members = admin_b_list.json()
        user_c_in_b = next((m for m in b_members if m["id"] == self.uid_user_c), None)
        self.assertIsNotNone(user_c_in_b, "Candidate C must appear in Company B's member list")
        self.assertTrue(user_c_in_b.get("needs_setup"), "needs_setup should be True")
        self.assertEqual(user_c_in_b.get("role"), "team_member")

        # 5. Company B admin saves role & department -> clears needs_setup
        patch_resp = await self.client.patch(
            f"/api/v1/admin/members/{self.uid_user_c}",
            json={"role": "team_lead", "department": "Marketing"},
            headers={"Authorization": f"Bearer {self.admin_b_token}"},
        )
        self.assertEqual(patch_resp.status_code, 200, f"Patch role failed: {patch_resp.text}")

        # Verify DB membership after patch
        mem_b_updated = await self.gdb.company_memberships.find_one({
            "user_id": self.uid_user_c,
            "company_id": self.cid_b,
        })
        self.assertEqual(mem_b_updated.get("role"), "team_lead")
        self.assertEqual(mem_b_updated.get("primary_department"), "Marketing")
        self.assertFalse(mem_b_updated.get("needs_setup"), "needs_setup must be cleared to False")

        # Verify Company B admin list now shows needs_setup=False
        admin_b_list_after = await self.client.get(
            "/api/v1/admin/members",
            headers={"Authorization": f"Bearer {self.admin_b_token}"},
        )
        b_members_after = admin_b_list_after.json()
        user_c_after = next((m for m in b_members_after if m["id"] == self.uid_user_c), None)
        self.assertFalse(user_c_after.get("needs_setup"))
        self.assertEqual(user_c_after.get("role"), "team_lead")

        # 6. Company B admin updates access switches
        access_patch = await self.client.patch(
            f"/api/v1/access/users/{self.uid_user_c}",
            json={"module": "sales", "value": True},
            headers={"Authorization": f"Bearer {self.admin_b_token}"},
        )
        self.assertEqual(access_patch.status_code, 200, f"Access patch failed: {access_patch.text}")

        mem_b_access = await self.gdb.company_memberships.find_one({
            "user_id": self.uid_user_c,
            "company_id": self.cid_b,
        })
        self.assertTrue(mem_b_access.get("access", {}).get("sales"))

        # 7. Candidate C switches to or accesses Company B
        user_c_b_token = create_access_token({
            "sub": self.uid_user_c,
            "cid": self.cid_b,
            "mid": mem_b_access["id"],
            "mtv": mem_b_access.get("token_version", 0),
            "tv": 0,
            "ctv": 0,
        })
        me_resp_b = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {user_c_b_token}"},
        )
        self.assertEqual(me_resp_b.status_code, 200)
        self.assertEqual(me_resp_b.json().get("role"), "team_lead")
        self.assertEqual(me_resp_b.json().get("company_id"), self.cid_b)

        # 8. Owner soft removes Candidate C from Company B
        remove_resp = await self.client.post(
            f"/api/v1/owner/members/{self.uid_user_c}/companies/{self.cid_b}/remove",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(remove_resp.status_code, 200)
        remove_result = remove_resp.json()
        self.assertTrue(remove_result.get("ok"))

        # Check DB: Membership is status=removed, token_version bumped, user doc kept
        mem_b_removed = await self.gdb.company_memberships.find_one({
            "user_id": self.uid_user_c,
            "company_id": self.cid_b,
        })
        self.assertEqual(mem_b_removed.get("status"), "removed")
        self.assertGreater(mem_b_removed.get("token_version", 0), mem_b_access.get("token_version", 0))

        # Check user doc still exists
        user_doc_kept = await self.gdb.users.find_one({"id": self.uid_user_c})
        self.assertIsNotNone(user_doc_kept)

        # Candidate C's old Company B token is revoked (401)
        me_revoked = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {user_c_b_token}"},
        )
        self.assertEqual(me_revoked.status_code, 401, f"Company B token should be revoked, got {me_revoked.status_code}")

        # Candidate C's Company A token is STILL valid (independent sessions)
        me_comp_a = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {self.user_c_a_token}"},
        )
        self.assertEqual(me_comp_a.status_code, 200, f"Company A token should still work, got {me_comp_a.status_code}")
        self.assertEqual(me_comp_a.json().get("company_id"), self.cid_a)

        # 9. Rollback flag off: Owner members endpoints return 404
        settings.MULTI_COMPANY_ENABLED = False
        rollback_resp = await self.client.get(
            "/api/v1/owner/members",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(rollback_resp.status_code, 404, "When flag is off, /owner/members must return 404")
