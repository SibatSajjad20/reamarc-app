"""
tests/tenancy/test_owner_grants.py
Unit tests verifying Round 2 requirement R8 (Owner grants M4):
- Re-granting an active membership is a no-op: 200 with {"note": "already has access"}. Role, access and needs_setup are unchanged.
- Grants (and provision) into a company with status == "suspended" return 400 "This company is paused."
- Grants to role == "client" users return 400 unless the body has allow_client: true.
"""

from __future__ import annotations

import unittest
import sys
from datetime import datetime, timezone
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
from app.core.security import create_access_token, get_password_hash, _AUTH_CACHE
from motor.motor_asyncio import AsyncIOMotorClient


class TestOwnerGrants(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        settings.MULTI_TENANT_ENABLED = True
        settings.MULTI_COMPANY_ENABLED = True
        _AUTH_CACHE.clear()

        self.client_mongo = AsyncIOMotorClient("mongodb://localhost:27017")
        self.db = self.client_mongo["reamarc_test_db"]
        db_instance.client = self.client_mongo
        db_instance.db = self.db

        await self._clean_data()

        # Seed Owner Super Admin with home membership
        self.owner_id = "r8_owner"
        self.owner_email = "r8_owner@test.com"
        self.owner_mem_id = "r8_owner_mem"

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

        await self.db.users.insert_one({
            "id": self.owner_id,
            "email": self.owner_email,
            "name": "R8 Owner",
            "role": "admin",
            "is_super_admin": True,
            "company_id": "company_reamarc",
            "is_active": True,
            "token_version": 1,
            "session_epoch": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        await self.db.company_memberships.insert_one({
            "id": self.owner_mem_id,
            "user_id": self.owner_id,
            "company_id": "company_reamarc",
            "role": "admin",
            "status": "active",
            "token_version": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        self.owner_token = create_access_token({
            "sub": self.owner_id,
            "email": self.owner_email,
            "role": "admin",
            "cid": "company_reamarc",
            "mid": self.owner_mem_id,
            "mtv": 0,
            "is_super_admin": True,
            "tv": 1,
            "ver": 0,
        })
        self.owner_headers = {"Authorization": f"Bearer {self.owner_token}"}

    async def asyncTearDown(self):
        await self._clean_data()
        self.client_mongo.close()

    async def _clean_data(self):
        for pattern in ["^r8_"]:
            query = {"$regex": pattern}
            await self.db.companies.delete_many({"id": query})
            await self.db.company_memberships.delete_many({"$or": [{"id": query}, {"user_id": query}, {"company_id": query}]})
            await self.db.users.delete_many({"$or": [{"id": query}, {"email": query}]})

    async def test_01_regranting_active_membership_is_noop_200(self):
        """Re-granting an active membership is a no-op: 200 with {'note': 'already has access'}."""
        now = datetime.now(timezone.utc).isoformat()
        comp_id = "r8_comp_active"
        await self.db.companies.insert_one({
            "id": comp_id,
            "name": "R8 Active Corp",
            "slug": "r8-active",
            "status": "active",
            "created_at": now,
        })

        user_id = "r8_user_member"
        await self.db.users.insert_one({
            "id": user_id,
            "email": "r8_member@test.com",
            "name": "R8 Member",
            "role": "team_member",
            "is_active": True,
            "created_at": now,
        })

        initial_access = {"attendance": True, "daily_log": True, "sales": False}
        mem_id = "r8_mem_existing"
        await self.db.company_memberships.insert_one({
            "id": mem_id,
            "user_id": user_id,
            "company_id": comp_id,
            "role": "admin",
            "status": "active",
            "needs_setup": False,
            "access": initial_access,
            "token_version": 2,
            "created_at": now,
        })

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/owner/members/{user_id}/companies",
                json={"company_id": comp_id},
                headers=self.owner_headers,
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            data = resp.json()
            self.assertEqual(data.get("note"), "already has access")
            self.assertEqual(data.get("membership_id"), mem_id)

            # Verify doc was not mutated
            mem_doc = await self.db.company_memberships.find_one({"id": mem_id})
            self.assertEqual(mem_doc.get("role"), "admin")
            self.assertEqual(mem_doc.get("needs_setup"), False)
            self.assertEqual(mem_doc.get("access"), initial_access)
            self.assertEqual(mem_doc.get("token_version"), 2)

    async def test_02_grants_and_provision_into_suspended_company_return_400(self):
        """Grants and provisions into a suspended company return 400 'This company is paused.'"""
        now = datetime.now(timezone.utc).isoformat()
        comp_id = "r8_comp_paused"
        await self.db.companies.insert_one({
            "id": comp_id,
            "name": "R8 Paused Corp",
            "slug": "r8-paused",
            "status": "suspended",
            "created_at": now,
        })

        user_id = "r8_user_target"
        await self.db.users.insert_one({
            "id": user_id,
            "email": "r8_target@test.com",
            "name": "R8 Target",
            "role": "team_member",
            "is_active": True,
            "created_at": now,
        })

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Grant access into suspended company
            res_grant = await client.post(
                f"/api/v1/owner/members/{user_id}/companies",
                json={"company_id": comp_id},
                headers=self.owner_headers,
            )
            self.assertEqual(res_grant.status_code, 400, res_grant.text)
            self.assertIn("This company is paused.", res_grant.text)

            # Provision new member into suspended company
            res_prov = await client.post(
                "/api/v1/owner/members",
                json={
                    "full_name": "R8 New Provisioned",
                    "email": "r8_new_prov@test.com",
                    "company_id": comp_id,
                    "role": "team_member",
                    "temporary_password": "ValidPassword123!",
                },
                headers=self.owner_headers,
            )
            self.assertEqual(res_prov.status_code, 400, res_prov.text)
            self.assertIn("This company is paused.", res_prov.text)

    async def test_03_grants_to_client_users_require_allow_client(self):
        """Grants to role == 'client' users return 400 unless allow_client: true."""
        now = datetime.now(timezone.utc).isoformat()
        comp_id = "r8_comp_client_test"
        await self.db.companies.insert_one({
            "id": comp_id,
            "name": "R8 Client Test Corp",
            "slug": "r8-client-test",
            "status": "active",
            "created_at": now,
        })

        client_user_id = "r8_user_client"
        await self.db.users.insert_one({
            "id": client_user_id,
            "email": "r8_client@test.com",
            "name": "R8 Client User",
            "role": "client",
            "is_active": True,
            "created_at": now,
        })

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Grant without allow_client -> 400
            res_no_allow = await client.post(
                f"/api/v1/owner/members/{client_user_id}/companies",
                json={"company_id": comp_id},
                headers=self.owner_headers,
            )
            self.assertEqual(res_no_allow.status_code, 400, res_no_allow.text)

            # 2. Grant with allow_client: false -> 400
            res_allow_false = await client.post(
                f"/api/v1/owner/members/{client_user_id}/companies",
                json={"company_id": comp_id, "allow_client": False},
                headers=self.owner_headers,
            )
            self.assertEqual(res_allow_false.status_code, 400, res_allow_false.text)

            # 3. Grant with allow_client: true -> 200
            res_allow_true = await client.post(
                f"/api/v1/owner/members/{client_user_id}/companies",
                json={"company_id": comp_id, "allow_client": True},
                headers=self.owner_headers,
            )
            self.assertEqual(res_allow_true.status_code, 200, res_allow_true.text)
            self.assertTrue(res_allow_true.json().get("ok"))
