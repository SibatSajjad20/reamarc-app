"""
tests/tenancy/test_auth_tenancy.py
Tests for Phase 3: Auth, sessions and the company in every request.
Automated Phase 3 Gate:
1. Forged cid -> 401.
2. Password change bumps token_version and kills old tokens -> 401.
3. Token from company A used after A is suspended -> 403/401 within 30 s.
4. Suspended company login attempt -> 403 "This company's access is paused".
5. Replayed invite -> 410.
6. Expired invite -> 410.
7. Login rate limit trips -> 429.
8. Read-only impersonation token blocks non-GET -> 403.
9. Flag off: legacy token shape accepted.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import unittest
import httpx
from motor.motor_asyncio import AsyncIOMotorClient

from app.main import app
from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection, db_instance
from app.core.security import (
    create_access_token,
    create_impersonation_token,
    get_password_hash,
    _AUTH_CACHE,
)


class TestAuthTenancy(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        await connect_to_mongo()
        self.db = db_instance.db
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

        self.orig_flag = getattr(settings, "MULTI_TENANT_ENABLED", False)
        settings.MULTI_TENANT_ENABLED = True
        _AUTH_CACHE.clear()

        # Clean prior test fixtures
        await self.db.companies.delete_many({"id": {"$in": ["comp_a", "comp_s"]}})
        await self.db.users.delete_many({"id": {"$in": ["user_alpha_1", "user_susp_1", "invited_admin_1", "expired_admin_1"]}})
        await self.db.users.delete_many({"email": {"$in": ["alpha1@company-a.com", "user1@suspended-co.com", "invited_admin@test.com", "expired_admin@test.com"]}})
        await self.db.rate_limit_counters.delete_many({})

        # Seed Company A (Active)
        await self.db.companies.replace_one(
            {"id": "comp_a"},
            {
                "id": "comp_a",
                "name": "Company Alpha",
                "slug": "alpha",
                "status": "active",
                "token_version": 1,
                "accent_color": "#112233",
                "timezone": "Asia/Karachi",
            },
            upsert=True,
        )

        # Seed Company S (Suspended)
        await self.db.companies.replace_one(
            {"id": "comp_s"},
            {
                "id": "comp_s",
                "name": "Company Suspended",
                "slug": "suspended-co",
                "status": "suspended",
                "token_version": 1,
                "accent_color": "#445566",
                "timezone": "UTC",
            },
            upsert=True,
        )

        # Seed User A in Company A
        self.user_a_id = "user_alpha_1"
        self.user_a_email = "alpha1@company-a.com"
        await self.db.users.replace_one(
            {"id": self.user_a_id},
            {
                "_id": self.user_a_id,
                "id": self.user_a_id,
                "email": self.user_a_email,
                "name": "Alpha Admin",
                "full_name": "Alpha Admin",
                "role": "admin",
                "is_super_admin": True,
                "company_id": "comp_a",
                "token_version": 1,
                "is_active": True,
                "hashed_password": get_password_hash("Password123!"),
            },
            upsert=True,
        )

        # Seed User S in Suspended Company S
        self.user_s_id = "user_susp_1"
        self.user_s_email = "user1@suspended-co.com"
        await self.db.users.replace_one(
            {"id": self.user_s_id},
            {
                "_id": self.user_s_id,
                "id": self.user_s_id,
                "email": self.user_s_email,
                "name": "Suspended User",
                "full_name": "Suspended User",
                "role": "member",
                "company_id": "comp_s",
                "token_version": 1,
                "is_active": True,
                "hashed_password": get_password_hash("Password123!"),
            },
            upsert=True,
        )

    async def asyncTearDown(self):
        settings.MULTI_TENANT_ENABLED = self.orig_flag
        _AUTH_CACHE.clear()
        await self.client.aclose()
        if hasattr(self, "db") and self.db is not None:
            await self.db.companies.delete_many({"id": {"$in": ["comp_a", "comp_s"]}})
            await self.db.users.delete_many({"id": {"$in": ["user_alpha_1", "user_susp_1", "invited_admin_1", "expired_admin_1"]}})
            await self.db.users.delete_many({"email": {"$in": ["alpha1@company-a.com", "user1@suspended-co.com", "invited_admin@test.com", "expired_admin@test.com"]}})
            await self.db.rate_limit_counters.delete_many({})
        await close_mongo_connection()

    async def test_01_forged_cid_rejected(self):
        """Token presenting cid != user.company_id is rejected with 401."""
        forged_token = create_access_token({
            "sub": self.user_a_id,
            "email": self.user_a_email,
            "cid": "comp_other_attacker",
            "tv": 1,
            "ctv": 1,
        })
        res = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {forged_token}"}
        )
        self.assertEqual(res.status_code, 401)
        self.assertTrue(any(w in res.json().get("detail", "").lower() for w in ["mismatch", "not linked"]))

    async def test_02_password_change_kills_old_tokens(self):
        """Bumping token_version immediately invalidates older tokens with 401."""
        valid_token = create_access_token({
            "sub": self.user_a_id,
            "email": self.user_a_email,
            "cid": "comp_a",
            "tv": 1,
            "ctv": 1,
        })
        # Initially valid
        res1 = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {valid_token}"}
        )
        self.assertEqual(res1.status_code, 200)

        # Password change bumps token_version to 2 and clears cache
        await self.db.users.update_one(
            {"id": self.user_a_id},
            {"$inc": {"token_version": 1}}
        )
        _AUTH_CACHE.clear()

        # Token with tv=1 is now rejected with 401
        res2 = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {valid_token}"}
        )
        self.assertEqual(res2.status_code, 401)
        self.assertIn("revoked", res2.json().get("detail", "").lower())

    async def test_03_suspended_company_token_blocked(self):
        """Token from company A used after company is suspended returns 403."""
        token = create_access_token({
            "sub": self.user_s_id,
            "email": self.user_s_email,
            "cid": "comp_s",
            "tv": 1,
            "ctv": 1,
        })
        res = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("paused", res.json().get("detail", "").lower())

    async def test_04_suspended_company_login_blocked(self):
        """Login attempt for user of a suspended company returns 403 'This company's access is paused'."""
        res = await self.client.post(
            "/api/v1/auth/login",
            json={"email": self.user_s_email, "password": "Password123!"}
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("paused", res.json().get("detail", "").lower())

    async def test_05_replayed_and_expired_invite_flow(self):
        """Invites are single-use, 72h expiry; replay -> 410, expired -> 410."""
        raw_token = "invite-token-secret-xyz-1234567890"
        tok_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

        # Seed invited admin user
        await self.db.users.replace_one(
            {"id": "invited_admin_1"},
            {
                "_id": "invited_admin_1",
                "id": "invited_admin_1",
                "email": "invited_admin@test.com",
                "name": "Invited Admin",
                "role": "admin",
                "company_id": "comp_a",
                "invite_token_hash": tok_hash,
                "invite_expires_at": datetime.now(timezone.utc) + timedelta(hours=72),
                "invite_used_at": None,
                "is_active": False,
            },
            upsert=True,
        )

        # 1. First accept succeeds
        res1 = await self.client.post(
            "/api/v1/auth/invite/accept",
            json={"token": raw_token, "password": "NewSecurePassword123!"}
        )
        self.assertEqual(res1.status_code, 200)

        # 2. Replayed accept returns 410 Gone
        res2 = await self.client.post(
            "/api/v1/auth/invite/accept",
            json={"token": raw_token, "password": "NewSecurePassword123!"}
        )
        self.assertEqual(res2.status_code, 410)

        # 3. Expired invite returns 410 Gone
        expired_raw = "expired-token-secret-999"
        exp_hash = hashlib.sha256(expired_raw.encode("utf-8")).hexdigest()
        await self.db.users.replace_one(
            {"id": "expired_admin_1"},
            {
                "_id": "expired_admin_1",
                "id": "expired_admin_1",
                "email": "expired_admin@test.com",
                "name": "Expired Admin",
                "role": "admin",
                "company_id": "comp_a",
                "invite_token_hash": exp_hash,
                "invite_expires_at": datetime.now(timezone.utc) - timedelta(hours=1),
                "invite_used_at": None,
                "is_active": False,
            },
            upsert=True,
        )
        res3 = await self.client.post(
            "/api/v1/auth/invite/accept",
            json={"token": expired_raw, "password": "AnotherPassword123!"}
        )
        self.assertEqual(res3.status_code, 410)

    async def test_06_login_rate_limit(self):
        """Per-email brute-force guard (10/hour) trips 429; per-IP office rush is higher."""
        ip_headers = {"X-Forwarded-For": "198.51.100.42"}
        codes = []
        for _ in range(12):
            res = await self.client.post(
                "/api/v1/auth/login",
                json={"email": "nonexistent@test.com", "password": "wrong"},
                headers=ip_headers,
            )
            codes.append(res.status_code)
        self.assertEqual(codes[:10], [401] * 10)
        self.assertEqual(codes[10:], [429, 429])

    async def test_07_read_only_impersonation_blocks_non_get(self):
        """Impersonation token with ro=True allows GET but blocks POST/PUT/DELETE with 403."""
        await self.db.users.update_one({"id": self.user_a_id}, {"$set": {"is_super_admin": True}})
        import uuid
        from datetime import timedelta
        sess_jti = f"jti_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        await self.db.owner_sessions.insert_one({
            "_id": sess_jti,
            "jti": sess_jti,
            "user_id": self.user_a_id,
            "company_id": "comp_a",
            "read_only": True,
            "revoked": False,
            "exp": now + timedelta(hours=1),
            "created_at": now,
        })
        imp_token = create_impersonation_token(
            user_id=self.user_a_id,
            company_id="comp_a",
            read_only=True,
            reason="Investigation ticket #1234",
            jti=sess_jti,
            tv=1,
        )
        _AUTH_CACHE.clear()
        # GET is permitted
        res_get = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {imp_token}"}
        )
        self.assertEqual(res_get.status_code, 200)

        # PUT is blocked with 403
        res_put = await self.client.put(
            "/api/v1/auth/me/profile",
            json={"full_name": "Tampered Name"},
            headers={"Authorization": f"Bearer {imp_token}"}
        )
        self.assertEqual(res_put.status_code, 403)

    async def test_08_active_company_login_and_refresh(self):
        """Active company user can successfully log in and refresh token with company_doc claims."""
        res_login = await self.client.post(
            "/api/v1/auth/login",
            json={"email": self.user_a_email, "password": "Password123!"},
        )
        self.assertEqual(res_login.status_code, 200)
        self.assertIn("access_token", res_login.cookies)
        self.assertIn("refresh_token", res_login.cookies)

        # Me endpoint with the access cookie
        res_me = await self.client.get(
            "/api/v1/auth/me",
            cookies={"access_token": res_login.cookies["access_token"]}
        )
        self.assertEqual(res_me.status_code, 200)
        me_data = res_me.json()
        self.assertEqual(me_data["email"], self.user_a_email)
        self.assertEqual(me_data["company_id"], "comp_a")

        # Refresh token endpoint using the refresh cookie
        res_refresh = await self.client.post(
            "/api/v1/auth/refresh",
            cookies={"refresh_token": res_login.cookies["refresh_token"]}
        )
        self.assertEqual(res_refresh.status_code, 200)
        self.assertIn("access_token", res_refresh.cookies)

