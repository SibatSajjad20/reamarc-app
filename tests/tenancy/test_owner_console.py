"""
tests/tenancy/test_owner_console.py
Phase 6 Gate Tests: Owner Super-Admin Console (/owner)
Verifies:
1. Anti-enumeration: Non-owners get 404 on all /api/v1/owner/* routes.
2. Impersonation lock: Active impersonators cannot execute owner actions (403).
3. Fleet management: Owner can list all companies across the fleet.
4. Tenant provisioning: Company, admin user, workspace, and audit trail created.
5. Status update & suspension: Suspension bumps token_version and locks tenant users.
6. Owner enter & impersonation: Issues read-only session token with tenant scope.
7. Cryptographic audit chain: Every owner action creates an immutable, hashed audit record.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import unittest
import sys
from pathlib import Path
import httpx

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
root_dir = str(Path(__file__).resolve().parent.parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app.config import settings
from app.database import db_instance
from app.main import app
from app.core.security import (
    create_access_token,
    create_impersonation_token,
    get_password_hash,
    _AUTH_CACHE,
)
from app.core.owner_audit import verify_owner_audit_chain
from tests.tenancy.seed import (
    seed_tenancy_async,
    clean_tenancy_async,
)

CID_A = "tnt_comp_a"
CID_B = "tnt_comp_b"


class TestOwnerConsole(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        settings.MULTI_TENANT_ENABLED = True
        _AUTH_CACHE.clear()

        from motor.motor_asyncio import AsyncIOMotorClient
        self.client_mongo = AsyncIOMotorClient("mongodb://localhost:27017")
        self.db = self.client_mongo["reamarc_test_db"]
        db_instance.client = self.client_mongo
        db_instance.db = self.db

        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

        await clean_tenancy_async(self.db)
        await seed_tenancy_async(self.db)

        # Seed Owner Super-Admin User (Faizan) and company_reamarc
        self.owner_id = "usr_owner_faizan"
        self.owner_email = "faizan@reamarc.com"

        await self.db.companies.replace_one(
            {"id": "company_reamarc"},
            {
                "_id": "company_reamarc",
                "id": "company_reamarc",
                "name": "Reamarc",
                "slug": "reamarc",
                "status": "active",
                "token_version": 0,
            },
            upsert=True,
        )

        await self.db.users.replace_one(
            {"id": self.owner_id},
            {
                "_id": self.owner_id,
                "id": self.owner_id,
                "email": self.owner_email,
                "name": "Faizan Owner",
                "full_name": "Faizan Owner",
                "role": "admin",
                "is_super_admin": True,
                "company_id": "company_reamarc",
                "is_active": True,
                "token_version": 0,
                "hashed_password": get_password_hash("SuperSecretOwnerPass1!"),
            },
            upsert=True,
        )

        await self.db.company_memberships.replace_one(
            {"id": "mem_owner_faizan"},
            {
                "_id": "mem_owner_faizan",
                "id": "mem_owner_faizan",
                "user_id": self.owner_id,
                "company_id": "company_reamarc",
                "role": "admin",
                "status": "active",
                "is_active": True,
                "token_version": 0,
            },
            upsert=True,
        )

        self.owner_token = create_access_token({
            "sub": self.owner_id,
            "email": self.owner_email,
            "cid": "company_reamarc",
            "tv": 0,
            "ctv": 0,
            "is_super_admin": True,
        })
        self.owner_headers = {"Authorization": f"Bearer {self.owner_token}"}

        # Regular tenant admin header (User A Admin)
        self.tenant_admin_token = create_access_token({
            "sub": "tnt_user_a_admin",
            "email": "admin@reamarc.test",
            "cid": CID_A,
            "tv": 0,
            "ctv": 0,
        })
        self.tenant_admin_headers = {"Authorization": f"Bearer {self.tenant_admin_token}"}

    async def asyncTearDown(self):
        _AUTH_CACHE.clear()
        await self.client.aclose()
        if hasattr(self, "db") and self.db is not None:
            await self.db.users.delete_one({"id": self.owner_id})
            await self.db.companies.delete_many({"slug": "test-new-client"})
            await self.db.users.delete_many({"email": "clientadmin@newtest.com"})
            await self.db.owner_audit.delete_many({})
            await clean_tenancy_async(self.db)
        if hasattr(self, "client_mongo") and self.client_mongo is not None:
            self.client_mongo.close()
        db_instance.client = None
        db_instance.db = None

    async def test_01_non_owner_anti_enumeration(self):
        """Unauthenticated gets 401; Authenticated non-owner gets 404 (anti-enumeration)."""
        # 1. Unauthenticated -> 401
        res = await self.client.get("/api/v1/owner/companies")
        self.assertEqual(res.status_code, 401)

        # 2. Regular tenant admin -> 404 Not Found (NEVER 403)
        res_admin = await self.client.get("/api/v1/owner/companies", headers=self.tenant_admin_headers)
        self.assertEqual(res_admin.status_code, 404)

        res_session = await self.client.get("/api/v1/owner/session", headers=self.tenant_admin_headers)
        self.assertEqual(res_session.status_code, 404)

    async def test_02_impersonator_blocked_from_owner_console(self):
        """Active impersonation session cannot execute owner console actions (403)."""
        enter_res = await self.client.post(
            f"/api/v1/owner/companies/{CID_B}/enter",
            json={"reason": "Investigating ticket", "read_only": True},
            headers=self.owner_headers,
        )
        self.assertEqual(enter_res.status_code, 200)
        imp_token = enter_res.json()["impersonation_token"]
        headers = {"Authorization": f"Bearer {imp_token}"}

        res = await self.client.get("/api/v1/owner/companies", headers=headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Owner actions blocked during impersonation", res.json()["detail"])

    async def test_03_owner_session_and_list_companies(self):
        """Owner can verify session and list all companies with live metrics."""
        # 1. Session check
        res_sess = await self.client.get("/api/v1/owner/session", headers=self.owner_headers)
        self.assertEqual(res_sess.status_code, 200)
        body_sess = res_sess.json()
        self.assertTrue(body_sess["is_owner"])
        self.assertEqual(body_sess["user"]["id"], self.owner_id)

        # 2. List companies
        res_comp = await self.client.get("/api/v1/owner/companies", headers=self.owner_headers)
        self.assertEqual(res_comp.status_code, 200)
        companies = res_comp.json()
        self.assertGreaterEqual(len(companies), 2)

        company_ids = [c["id"] for c in companies]
        self.assertIn(CID_A, company_ids)
        self.assertIn(CID_B, company_ids)

        # Each company contains user_count and plan
        for c in companies:
            self.assertIn("user_count", c)
            self.assertIn("plan", c)

    async def test_04_create_company_provisions_tenant_and_audit(self):
        """Owner can create a new tenant company with admin user, workspace, and audit."""
        payload = {
            "name": "New Test Client",
            "slug": "test-new-client",
            "plan": "pro",
            "timezone": "Europe/London",
            "accent_color": "#FF5500",
            "admin_name": "New Admin",
            "admin_email": "clientadmin@newtest.com",
            "admin_password": "NewSecurePassword123!",
            "max_users": 25,
        }

        # 1. Create company
        res = await self.client.post("/api/v1/owner/companies", json=payload, headers=self.owner_headers)
        self.assertEqual(res.status_code, 201)
        created = res.json()
        cid = created["id"]
        self.assertEqual(created["name"], "New Test Client")
        self.assertEqual(created["slug"], "test-new-client")
        self.assertEqual(created["status"], "active")

        # 2. Verify admin user was created in DB
        admin_doc = await self.db.users.find_one({"email": "clientadmin@newtest.com"})
        self.assertIsNotNone(admin_doc)
        self.assertEqual(admin_doc["company_id"], cid)
        self.assertEqual(admin_doc["role"], "admin")

        # 3. Verify workspace was created in DB
        ws_doc = await self.db.workspaces.find_one({"company_id": cid})
        self.assertIsNotNone(ws_doc)

        # 4. Duplicate slug rejected
        res_dup = await self.client.post("/api/v1/owner/companies", json=payload, headers=self.owner_headers)
        self.assertEqual(res_dup.status_code, 400)
        self.assertIn("already in use", res_dup.json()["detail"])

        # 5. Check owner audit log entry
        audit_entry = await self.db.owner_audit.find_one({"action": "create_company", "target_company_id": cid})
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry["actor_user_id"], self.owner_id)

    async def test_05_update_company_and_suspension(self):
        """Owner can update company metadata and suspend company (invalidating sessions)."""
        # 1. Update company plan & timezone
        update_res = await self.client.patch(
            f"/api/v1/owner/companies/{CID_B}",
            json={"plan": "enterprise", "timezone": "Europe/Berlin"},
            headers=self.owner_headers,
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["plan"], "enterprise")
        self.assertEqual(update_res.json()["timezone"], "Europe/Berlin")

        # 2. Suspend company
        suspend_res = await self.client.patch(
            f"/api/v1/owner/companies/{CID_B}",
            json={"status": "suspended"},
            headers=self.owner_headers,
        )
        self.assertEqual(suspend_res.status_code, 200)
        self.assertEqual(suspend_res.json()["status"], "suspended")

        # Verify token_version incremented
        comp_b = await self.db.companies.find_one({"id": CID_B})
        self.assertGreater(comp_b.get("token_version", 0), 0)

        # Now any user of suspended company is rejected with 403 (access paused)
        old_user_token = create_access_token({
            "sub": "tnt_user_b_admin",
            "email": "admin@sample.test",
            "cid": CID_B,
            "tv": 0,
            "ctv": 0,
        })
        b_res = await self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_user_token}"})
        self.assertEqual(b_res.status_code, 403)

        # 3. Test active company token version reset (session revocation -> 401)
        old_user_a_token = create_access_token({
            "sub": "tnt_user_a_admin",
            "email": "admin@reamarc.test",
            "cid": CID_A,
            "tv": 0,
            "ctv": 0,
        })
        reset_res = await self.client.post(
            f"/api/v1/owner/companies/{CID_A}/reset-token-version",
            headers=self.owner_headers,
        )
        self.assertEqual(reset_res.status_code, 200)
        a_res = await self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_user_a_token}"})
        self.assertEqual(a_res.status_code, 401)

    async def test_06_owner_enter_console_and_read_only_enforcement(self):
        """Owner can enter company with impersonation token; read-only writes fail with 403."""
        enter_res = await self.client.post(
            f"/api/v1/owner/companies/{CID_A}/enter",
            json={"reason": "Audit review", "read_only": True},
            headers=self.owner_headers,
        )
        self.assertEqual(enter_res.status_code, 200)
        enter_data = enter_res.json()
        imp_token = enter_data["impersonation_token"]
        self.assertTrue(enter_data["read_only"])

        imp_headers = {"Authorization": f"Bearer {imp_token}"}

        # 1. Can read tenant data
        me_res = await self.client.get("/api/v1/auth/me", headers=imp_headers)
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["company_id"], CID_A)

        ws_res = await self.client.get("/api/v1/workspaces", headers=imp_headers)
        self.assertEqual(ws_res.status_code, 200)

        # 2. Write operations are strictly blocked by read-only guard (403)
        post_res = await self.client.post(
            "/api/v1/workspaces",
            json={"name": "Attacker Workspace", "brandColor": "#000"},
            headers=imp_headers,
        )
        self.assertEqual(post_res.status_code, 403)
        self.assertIn("Writes are disabled during read-only owner session", post_res.json()["detail"])

    async def test_07_owner_audit_chain_integrity(self):
        """Audit chain passes cryptographic hash verification after owner actions."""
        # Execute several actions
        await self.client.patch(
            f"/api/v1/owner/companies/{CID_A}",
            json={"plan": "pro"},
            headers=self.owner_headers,
        )
        await self.client.post(
            f"/api/v1/owner/companies/{CID_A}/enter",
            json={"reason": "Chain test", "read_only": True},
            headers=self.owner_headers,
        )
        await self.client.post(
            f"/api/v1/owner/companies/{CID_A}/reset-token-version",
            headers=self.owner_headers,
        )

        # Retrieve audit log via endpoint
        audit_res = await self.client.get("/api/v1/owner/audit?limit=20", headers=self.owner_headers)
        self.assertEqual(audit_res.status_code, 200)
        logs = audit_res.json()
        self.assertGreaterEqual(len(logs), 3)

        # Verify cryptographic hash chain using Phase 1 verifier
        chain_valid = await verify_owner_audit_chain(self.db)
        self.assertTrue(chain_valid)



    async def test_08_company_detail_and_user_count_metrics(self):
        """Owner list user_count counts active memberships and detail returns minimal user fields."""
        # 1. Company list user_count
        res_list = await self.client.get("/api/v1/owner/companies", headers=self.owner_headers)
        self.assertEqual(res_list.status_code, 200)
        comps = {c["id"]: c for c in res_list.json()}

        # Count active memberships in DB directly
        count_a = await self.db.company_memberships.count_documents({"company_id": CID_A, "status": "active"})
        self.assertEqual(comps[CID_A]["user_count"], count_a)

        # 2. Company detail endpoint
        res_detail = await self.client.get(f"/api/v1/owner/companies/{CID_A}", headers=self.owner_headers)
        self.assertEqual(res_detail.status_code, 200)
        detail = res_detail.json()

        self.assertEqual(detail["id"], CID_A)
        self.assertEqual(detail["user_count"], count_a)
        self.assertIn("users", detail)

        # Each user object has only: id, name, email, role, is_active
        allowed_keys = {"id", "name", "email", "role", "is_active"}
        for u in detail["users"]:
            self.assertEqual(set(u.keys()), allowed_keys)
            self.assertNotIn("hashed_password", u)
            self.assertNotIn("password", u)
            self.assertNotIn("access", u)


if __name__ == "__main__":
    unittest.main()
