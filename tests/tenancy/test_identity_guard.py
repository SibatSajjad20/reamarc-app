"""Gate 1: identity takeover, GridFS company scope, flags-off owner/login safety."""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
import uuid
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import httpx
from app.main import app
from app.config import settings
from app.database import connect_to_mongo, db_instance
from app.core.security import get_password_hash, create_access_token, _AUTH_CACHE
from app.core.tenant import tenant_scope
from app.core.uploads import save_upload_bytes


class IdentityGuardTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        await connect_to_mongo()
        self.gdb = db_instance.db
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.orig_mc = settings.MULTI_COMPANY_ENABLED
        self.orig_mt = settings.MULTI_TENANT_ENABLED
        settings.MULTI_COMPANY_ENABLED = True
        settings.MULTI_TENANT_ENABLED = True
        _AUTH_CACHE.clear()

        self.run_id = uuid.uuid4().hex[:8]
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        self.pwd = "SecretPassword123!"
        hashed = get_password_hash(self.pwd)

        self.cid_a = f"ig_comp_a_{self.run_id}"
        self.cid_b = f"ig_comp_b_{self.run_id}"
        await self.gdb.companies.insert_many([
            {"_id": self.cid_a, "id": self.cid_a, "name": "Alpha", "slug": f"ig-a-{self.run_id}", "status": "active", "token_version": 0},
            {"_id": self.cid_b, "id": self.cid_b, "name": "Beta", "slug": f"ig-b-{self.run_id}", "status": "active", "token_version": 0},
        ])

        def user(uid, email, name, cid, *, super_admin=False, role="team_member"):
            return {
                "_id": uid, "id": uid, "email": email, "name": name, "full_name": name,
                "hashed_password": hashed, "role": role, "company_id": cid,
                "is_active": True, "is_super_admin": super_admin, "token_version": 0,
                "session_epoch": 0, "refresh_jtis": [], "created_at": now_iso, "updated_at": now_iso,
            }

        def mem(mid, uid, cid, role):
            return {
                "_id": mid, "id": mid, "user_id": uid, "company_id": cid, "role": role,
                "status": "active", "needs_setup": False, "token_version": 0,
                "access": {}, "departments": [], "granted_at": now_iso,
            }

        self.uid_dual = f"ig_dual_{self.run_id}"
        self.uid_admin_a = f"ig_aa_{self.run_id}"
        self.uid_admin_b = f"ig_ab_{self.run_id}"
        self.uid_hr_b = f"ig_hrb_{self.run_id}"
        self.uid_only_a = f"ig_oa_{self.run_id}"
        self.uid_owner = f"ig_own_{self.run_id}"
        self.uid_reamarc_admin = f"ig_ra_{self.run_id}"

        await self.gdb.users.insert_many([
            user(self.uid_dual, f"dual_{self.run_id}@ex.com", "Dual User", self.cid_a),
            user(self.uid_admin_a, f"aa_{self.run_id}@ex.com", "Admin A", self.cid_a, role="admin"),
            user(self.uid_admin_b, f"ab_{self.run_id}@ex.com", "Admin B", self.cid_b, role="admin"),
            user(self.uid_hr_b, f"hrb_{self.run_id}@ex.com", "HR B", self.cid_b, role="hr"),
            user(self.uid_only_a, f"oa_{self.run_id}@ex.com", "Only A", self.cid_a),
            user(self.uid_owner, f"own_{self.run_id}@ex.com", "Owner", "company_reamarc", super_admin=True, role="admin"),
            user(self.uid_reamarc_admin, f"ra_{self.run_id}@ex.com", "Reamarc Admin", "company_reamarc", role="admin"),
        ])

        self.mid_dual_a = f"ig_mdual_a_{self.run_id}"
        self.mid_dual_b = f"ig_mdual_b_{self.run_id}"
        self.mid_aa = f"ig_maa_{self.run_id}"
        self.mid_ab = f"ig_mab_{self.run_id}"
        self.mid_hrb = f"ig_mhrb_{self.run_id}"
        self.mid_oa = f"ig_moa_{self.run_id}"
        self.mid_own_b = f"ig_mownb_{self.run_id}"
        await self.gdb.company_memberships.insert_many([
            mem(self.mid_dual_a, self.uid_dual, self.cid_a, "team_member"),
            mem(self.mid_dual_b, self.uid_dual, self.cid_b, "team_member"),
            mem(self.mid_aa, self.uid_admin_a, self.cid_a, "admin"),
            mem(self.mid_ab, self.uid_admin_b, self.cid_b, "admin"),
            mem(self.mid_hrb, self.uid_hr_b, self.cid_b, "hr"),
            mem(self.mid_oa, self.uid_only_a, self.cid_a, "team_member"),
            mem(self.mid_own_b, self.uid_owner, self.cid_b, "team_member"),
        ])

        self.orig_email = f"dual_{self.run_id}@ex.com"
        self.orig_hash = hashed

    def _headers(self, uid, email, cid, mid, role="admin"):
        token = create_access_token({
            "sub": uid, "email": email, "role": role, "cid": cid,
            "mid": mid, "mtv": 0, "tv": 0, "ctv": 0,
        })
        return {"Authorization": f"Bearer {token}"}

    async def asyncTearDown(self):
        settings.MULTI_COMPANY_ENABLED = self.orig_mc
        settings.MULTI_TENANT_ENABLED = self.orig_mt
        await self.client.aclose()
        prefix = {"$regex": f"_{self.run_id}$"}
        await self.gdb.companies.delete_many({"id": prefix})
        await self.gdb.users.delete_many({"id": prefix})
        await self.gdb.company_memberships.delete_many({"id": prefix})
        await self.gdb.password_resets.delete_many({"email": {"$regex": self.run_id}})

    async def test_admin_b_cannot_change_dual_identity(self):
        headers = self._headers(self.uid_admin_b, f"ab_{self.run_id}@ex.com", self.cid_b, self.mid_ab)
        resp = await self.client.patch(
            f"/api/v1/admin/users/{self.uid_dual}",
            headers=headers,
            json={"email": "hacked@ex.com", "password": "NewPass123!", "is_active": False},
        )
        self.assertEqual(resp.status_code, 403, resp.text)
        self.assertIn("home company", resp.json().get("detail", "").lower())
        fresh = await self.gdb.users.find_one({"id": self.uid_dual})
        self.assertEqual(fresh["email"], self.orig_email)
        self.assertEqual(fresh["hashed_password"], self.orig_hash)
        self.assertTrue(fresh.get("is_active", True))

    async def test_admin_b_cannot_change_owner_after_grant(self):
        headers = self._headers(self.uid_admin_b, f"ab_{self.run_id}@ex.com", self.cid_b, self.mid_ab)
        resp = await self.client.patch(
            f"/api/v1/admin/users/{self.uid_owner}",
            headers=headers,
            json={"password": "Takeover123!"},
        )
        self.assertEqual(resp.status_code, 403, resp.text)

    async def test_admin_a_can_edit_home_only_user(self):
        headers = self._headers(self.uid_admin_a, f"aa_{self.run_id}@ex.com", self.cid_a, self.mid_aa)
        resp = await self.client.patch(
            f"/api/v1/admin/users/{self.uid_only_a}",
            headers=headers,
            json={"full_name": "Only A Updated"},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["full_name"], "Only A Updated")

    async def test_hr_follows_same_identity_rules(self):
        headers = self._headers(self.uid_hr_b, f"hrb_{self.run_id}@ex.com", self.cid_b, self.mid_hrb, role="hr")
        resp = await self.client.patch(
            f"/api/v1/admin/users/{self.uid_dual}",
            headers=headers,
            json={"email": "hr-hack@ex.com"},
        )
        self.assertEqual(resp.status_code, 403, resp.text)

    async def test_flags_off_reamarc_admin_cannot_edit_super_admin_password(self):
        settings.MULTI_COMPANY_ENABLED = False
        settings.MULTI_TENANT_ENABLED = False
        token = create_access_token({
            "sub": self.uid_reamarc_admin,
            "email": f"ra_{self.run_id}@ex.com",
            "role": "admin",
            "cid": "company_reamarc",
            "tv": 0,
        })
        resp = await self.client.patch(
            f"/api/v1/admin/users/{self.uid_owner}",
            headers={"Authorization": f"Bearer {token}"},
            json={"password": "NoYouDont1!"},
        )
        self.assertEqual(resp.status_code, 403, resp.text)

    async def test_gridfs_deliverable_roundtrip_and_isolation(self):
        payload = b"deliverable-bytes-aaa"
        key = f"deliverables/ig_{self.run_id}.txt"
        with tenant_scope(self.cid_a):
            from app.database import get_database
            db = get_database()
            await save_upload_bytes(db, relative_key=key, content=payload, original_name="a.txt", content_type="text/plain")

        ha = self._headers(self.uid_admin_a, f"aa_{self.run_id}@ex.com", self.cid_a, self.mid_aa)
        got = await self.client.get(f"/uploads/{key}", headers=ha)
        self.assertEqual(got.status_code, 200, got.text)
        self.assertEqual(got.content, payload)

        hb = self._headers(self.uid_admin_b, f"ab_{self.run_id}@ex.com", self.cid_b, self.mid_ab)
        other = await self.client.get(f"/uploads/{key}", headers=hb)
        self.assertEqual(other.status_code, 404, other.text)

        missing = await self.client.get(f"/uploads/deliverables/missing_{self.run_id}.bin", headers=ha)
        self.assertEqual(missing.status_code, 404, missing.text)
        self.assertNotEqual(missing.status_code, 500)

    async def test_flags_off_owner_create_company_404(self):
        settings.MULTI_TENANT_ENABLED = False
        settings.MULTI_COMPANY_ENABLED = False
        token = create_access_token({
            "sub": self.uid_owner,
            "email": f"own_{self.run_id}@ex.com",
            "role": "admin",
            "cid": "company_reamarc",
            "tv": 0,
            "is_super_admin": True,
        })
        resp = await self.client.post(
            "/api/v1/owner/companies",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Should Fail",
                "slug": f"fail-{self.run_id}",
                "admin_name": "X",
                "admin_email": f"x_{self.run_id}@ex.com",
            },
        )
        self.assertEqual(resp.status_code, 404, resp.text)

    async def test_flags_off_non_reamarc_login_403(self):
        settings.MULTI_TENANT_ENABLED = False
        settings.MULTI_COMPANY_ENABLED = False
        resp = await self.client.post("/api/v1/auth/login", json={
            "email": f"aa_{self.run_id}@ex.com",
            "password": self.pwd,
        })
        self.assertEqual(resp.status_code, 403, resp.text)
        self.assertIn("isn't available yet", resp.json().get("detail", ""))


class ReamarcAggregateLegacyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        await connect_to_mongo()
        self.gdb = db_instance.db
        self.orig_mt = settings.MULTI_TENANT_ENABLED
        settings.MULTI_TENANT_ENABLED = True
        self.run_id = uuid.uuid4().hex[:8]
        await self.gdb.notifications.insert_one({
            "_id": f"ig_leg_{self.run_id}",
            "id": f"ig_leg_{self.run_id}",
            "title": "legacy",
        })

    async def asyncTearDown(self):
        settings.MULTI_TENANT_ENABLED = self.orig_mt
        await self.gdb.notifications.delete_many({"id": f"ig_leg_{self.run_id}"})

    async def test_reamarc_aggregate_counts_legacy_null_company(self):
        from app.database import get_database
        with tenant_scope("company_reamarc"):
            db = get_database()
            rows = [doc async for doc in db.notifications.aggregate([
                {"$match": {"id": f"ig_leg_{self.run_id}"}},
                {"$count": "n"},
            ])]
        self.assertTrue(rows)
        self.assertGreaterEqual(rows[0].get("n", 0), 1)
