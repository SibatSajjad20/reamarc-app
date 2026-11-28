"""Regression tests for password reset and Team Directory password updates.

Uses in-memory mongomock (never Atlas / live DB) with mocked email sending.
"""
from __future__ import annotations

from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

import httpx
import mongomock

from app.config import settings
from app.core.security import _AUTH_CACHE, create_access_token, get_password_hash
from app.main import app


class _AsyncCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def sort(self, key_or_list, direction=None):
        if isinstance(key_or_list, list):
            self._cursor = self._cursor.sort(key_or_list)
        elif direction is not None:
            self._cursor = self._cursor.sort(key_or_list, direction)
        else:
            self._cursor = self._cursor.sort(key_or_list)
        return self

    def limit(self, n: int):
        self._cursor = self._cursor.limit(n)
        return self

    async def to_list(self, length: Optional[int] = None) -> List[dict]:
        rows = list(self._cursor)
        if length is not None:
            return rows[: int(length)]
        return rows

    def __aiter__(self):
        rows = list(self._cursor)

        async def _gen():
            for row in rows:
                yield row

        return _gen()


class _AsyncCollection:
    def __init__(self, coll: mongomock.Collection):
        self._coll = coll

    async def find_one(self, filter=None, projection=None, sort=None, **kwargs):
        return self._coll.find_one(filter or {}, projection=projection, sort=sort, **kwargs)

    def find(self, filter=None, projection=None, **kwargs):
        return _AsyncCursor(self._coll.find(filter or {}, projection=projection, **kwargs))

    async def insert_one(self, document):
        return self._coll.insert_one(document)

    async def insert_many(self, documents):
        return self._coll.insert_many(documents)

    async def update_one(self, filter, update, upsert=False, **kwargs):
        return self._coll.update_one(filter, update, upsert=upsert)

    async def update_many(self, filter, update, **kwargs):
        return self._coll.update_many(filter, update)

    async def delete_many(self, filter, **kwargs):
        return self._coll.delete_many(filter)

    async def find_one_and_update(self, filter, update, upsert=False, return_document=False, **kwargs):
        from pymongo import ReturnDocument

        if isinstance(return_document, bool):
            rd = ReturnDocument.AFTER if return_document else ReturnDocument.BEFORE
        else:
            rd = return_document
        return self._coll.find_one_and_update(filter, update, upsert=upsert, return_document=rd)

    async def count_documents(self, filter=None, **kwargs):
        return self._coll.count_documents(filter or {})

    async def distinct(self, key, filter=None, **kwargs):
        return self._coll.distinct(key, filter or {})

    async def create_index(self, *args, **kwargs):
        return None

    def aggregate(self, pipeline, **kwargs):
        rows = list(self._coll.aggregate(pipeline))

        class _AggIter:
            def __aiter__(self):
                async def _gen():
                    for r in rows:
                        yield r

                return _gen()

        return _AggIter()


class _AsyncMongomockDB:
    def __init__(self):
        self._client = mongomock.MongoClient()
        self._db = self._client["reamarc_unit_mock"]

    def __getattr__(self, name: str) -> Any:
        return _AsyncCollection(self._db[name])

    async def command(self, name: str):
        return {"ok": 1}


def _make_token(user: dict, *, company_id: str, membership: Optional[dict] = None) -> str:
    claims = {
        "sub": user["id"],
        "email": user["email"],
        "role": membership["role"] if membership else user["role"],
        "cid": company_id,
        "tv": int(user.get("token_version") or 0),
        "ver": int(user.get("session_epoch") or 0),
        "ctv": 0,
        "is_super_admin": bool(user.get("is_super_admin", False)),
    }
    if membership:
        claims["mid"] = membership["id"]
        claims["mtv"] = int(membership.get("token_version") or 0)
    return create_access_token(claims)


class PasswordFixesTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = _AsyncMongomockDB()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        _AUTH_CACHE.clear()
        if hasattr(app.state, "limiter") and hasattr(app.state.limiter, "reset"):
            app.state.limiter.reset()

        now_iso = datetime.now(timezone.utc).isoformat()
        self.old_pwd = "OldPassword123!"
        self.old_hash = get_password_hash(self.old_pwd)

        await self.db.companies.insert_many([
            {
                "_id": "company_reamarc",
                "id": "company_reamarc",
                "name": "Reamarc",
                "slug": "reamarc",
                "status": "active",
                "token_version": 0,
            },
            {
                "_id": "comp_cafb6651cc55",
                "id": "comp_cafb6651cc55",
                "name": "Second Co",
                "slug": "secondco",
                "status": "active",
                "token_version": 0,
            },
        ])

        # Exact multi-company user shape (Junaid)
        self.junaid = {
            "_id": "usr_7c47b0cc06",
            "id": "usr_7c47b0cc06",
            "email": "junaidjay27@gmail.com",
            "name": "Junaid",
            "full_name": "Junaid",
            "hashed_password": self.old_hash,
            "role": "team_member",
            "company_id": "company_reamarc",
            "department": "Website",
            "departments": ["Website"],
            "primary_department": "Website",
            "is_active": True,
            "is_super_admin": False,
            "token_version": 0,
            "session_epoch": 0,
            "refresh_jtis": ["jti_old_1"],
            "created_at": now_iso,
            "updated_at": "2026-10-29T00:00:00+00:00",
        }
        self.other_user = {
            "_id": "usr_other_user",
            "id": "usr_other_user",
            "email": "other.user@example.com",
            "name": "Other User",
            "full_name": "Other User",
            "hashed_password": self.old_hash,
            "role": "team_member",
            "company_id": "company_reamarc",
            "department": "Sales",
            "departments": ["Sales"],
            "primary_department": "Sales",
            "is_active": True,
            "is_super_admin": False,
            "token_version": 0,
            "session_epoch": 0,
            "refresh_jtis": [],
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        self.owner = {
            "_id": "usr_owner",
            "id": "usr_owner",
            "email": "owner@reamarc.com",
            "name": "Platform Owner",
            "full_name": "Platform Owner",
            "hashed_password": self.old_hash,
            "role": "admin",
            "company_id": "company_reamarc",
            "is_active": True,
            "is_super_admin": True,
            "token_version": 0,
            "session_epoch": 0,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        self.home_admin = {
            "_id": "usr_home_admin",
            "id": "usr_home_admin",
            "email": "admin@reamarc.com",
            "name": "Home Admin",
            "full_name": "Home Admin",
            "hashed_password": self.old_hash,
            "role": "admin",
            "company_id": "company_reamarc",
            "is_active": True,
            "is_super_admin": False,
            "token_version": 0,
            "session_epoch": 0,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        self.single_member = {
            "_id": "usr_single_tm",
            "id": "usr_single_tm",
            "email": "single@reamarc.com",
            "name": "Single Member",
            "full_name": "Single Member",
            "hashed_password": self.old_hash,
            "role": "team_member",
            "company_id": "company_reamarc",
            "department": "Website",
            "departments": ["Website"],
            "primary_department": "Website",
            "is_active": True,
            "is_super_admin": False,
            "token_version": 0,
            "session_epoch": 0,
            "created_at": now_iso,
            "updated_at": now_iso,
        }

        await self.db.users.insert_many([
            self.junaid,
            self.other_user,
            self.owner,
            self.home_admin,
            self.single_member,
        ])

        self.mem_junaid_home = {
            "_id": "mem_junaid_1",
            "id": "mem_junaid_1",
            "user_id": self.junaid["id"],
            "company_id": "company_reamarc",
            "role": "team_member",
            "department": "Website",
            "departments": ["Website"],
            "primary_department": "Website",
            "status": "active",
            "needs_setup": False,
            "token_version": 0,
            "access": {"attendance": True, "daily_log": True},
        }
        self.mem_junaid_second = {
            "_id": "mem_junaid_2",
            "id": "mem_junaid_2",
            "user_id": self.junaid["id"],
            "company_id": "comp_cafb6651cc55",
            "role": "team_lead",
            "department": "Website",
            "departments": ["Website"],
            "primary_department": "Website",
            "status": "active",
            "needs_setup": False,
            "token_version": 0,
            "access": {"attendance": True, "daily_log": True},
        }
        self.mem_owner_home = {
            "_id": "mem_owner_1",
            "id": "mem_owner_1",
            "user_id": self.owner["id"],
            "company_id": "company_reamarc",
            "role": "admin",
            "status": "active",
            "needs_setup": False,
            "token_version": 0,
        }
        self.mem_admin_home = {
            "_id": "mem_admin_1",
            "id": "mem_admin_1",
            "user_id": self.home_admin["id"],
            "company_id": "company_reamarc",
            "role": "admin",
            "status": "active",
            "needs_setup": False,
            "token_version": 0,
        }
        self.mem_other_home = {
            "_id": "mem_other_1",
            "id": "mem_other_1",
            "user_id": self.other_user["id"],
            "company_id": "company_reamarc",
            "role": "team_member",
            "status": "active",
            "needs_setup": False,
            "token_version": 0,
        }
        self.mem_single_home = {
            "_id": "mem_single_1",
            "id": "mem_single_1",
            "user_id": self.single_member["id"],
            "company_id": "company_reamarc",
            "role": "team_member",
            "department": "Website",
            "departments": ["Website"],
            "primary_department": "Website",
            "status": "active",
            "needs_setup": False,
            "token_version": 0,
        }
        await self.db.company_memberships.insert_many([
            self.mem_junaid_home,
            self.mem_junaid_second,
            self.mem_owner_home,
            self.mem_admin_home,
            self.mem_other_home,
            self.mem_single_home,
        ])

    async def asyncTearDown(self):
        _AUTH_CACHE.clear()
        await self.client.aclose()

    def _patch_env(self, *, multi_company: bool = True, multi_tenant: bool = True) -> ExitStack:
        stack = ExitStack()
        stack.enter_context(patch.object(settings, "MULTI_COMPANY_ENABLED", multi_company))
        stack.enter_context(patch.object(settings, "MULTI_TENANT_ENABLED", multi_tenant))
        stack.enter_context(patch("app.core.tenant._get_raw_db", return_value=self.db))
        stack.enter_context(patch("app.core.tenant.get_global_db", return_value=self.db))
        stack.enter_context(patch("app.routers.auth.get_global_db", return_value=self.db))
        stack.enter_context(patch("app.routers.auth.get_database", return_value=self.db))
        stack.enter_context(patch("app.routers.owner.get_global_db", return_value=self.db))
        stack.enter_context(patch("app.core.rate_limit_store.get_global_db", return_value=self.db))
        stack.enter_context(patch("app.services.identity_guard.get_global_db", return_value=self.db))
        stack.enter_context(patch("app.database.get_database", return_value=self.db))
        stack.enter_context(patch("app.routers.admin.get_database", return_value=self.db))
        stack.enter_context(patch("app.routers.admin.purge_pre_joining_attendance", new_callable=AsyncMock))
        return stack

    async def test_reset_password_full_flow_and_security_invariants(self):
        sent_codes = []

        async def _capture_email(*, recipient_email, code, recipient_name, company=None):
            sent_codes.append((recipient_email, code))

        with self._patch_env(), patch(
            "app.routers.auth.EmailService.send_password_reset_code", side_effect=_capture_email
        ):
            # 1. Forgot password dispatches 6-digit OTP
            r_forgot = await self.client.post(
                "/api/v1/auth/forgot-password",
                json={"email": "junaidjay27@gmail.com"},
            )
            self.assertEqual(r_forgot.status_code, 200, r_forgot.text)
            self.assertEqual(len(sent_codes), 1)
            code = sent_codes[0][1]

            # 2. Verify code succeeds
            r_verify = await self.client.post(
                "/api/v1/auth/verify-reset-code",
                json={"email": "junaidjay27@gmail.com", "code": code},
            )
            self.assertEqual(r_verify.status_code, 200, r_verify.text)
            self.assertTrue(r_verify.json().get("valid"))

            # 3. Code for user A cannot reset user B
            r_cross = await self.client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": "other.user@example.com",
                    "code": code,
                    "new_password": "CrossUserPass123!",
                },
            )
            self.assertEqual(r_cross.status_code, 400, r_cross.text)

            # 4. Wrong code increments attempts and rejects
            wrong_code = "000000" if code != "000000" else "999999"
            r_wrong = await self.client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": "junaidjay27@gmail.com",
                    "code": wrong_code,
                    "new_password": "NewPassword123!",
                },
            )
            self.assertEqual(r_wrong.status_code, 400, r_wrong.text)
            self.assertIn("attempt", r_wrong.json()["detail"].lower())

            # 5. Valid reset succeeds, writes global user, bumps epoch/tv, clears refresh_jtis
            new_pwd = "NewResetPassword123!"
            r_reset = await self.client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": "junaidjay27@gmail.com",
                    "code": code,
                    "new_password": new_pwd,
                },
            )
            self.assertEqual(r_reset.status_code, 200, r_reset.text)

            fresh = await self.db.users.find_one({"id": self.junaid["id"]})
            self.assertEqual(fresh["refresh_jtis"], [])
            self.assertEqual(fresh["session_epoch"], 1)
            self.assertEqual(fresh["token_version"], 1)

            # 6. Login with new password succeeds; old password fails
            r_login_new = await self.client.post(
                "/api/v1/auth/login",
                json={"email": "junaidjay27@gmail.com", "password": new_pwd},
            )
            self.assertEqual(r_login_new.status_code, 200, r_login_new.text)

            r_login_old = await self.client.post(
                "/api/v1/auth/login",
                json={"email": "junaidjay27@gmail.com", "password": self.old_pwd},
            )
            self.assertEqual(r_login_old.status_code, 401, r_login_old.text)

            # 7. Reused code is rejected
            r_reuse = await self.client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": "junaidjay27@gmail.com",
                    "code": code,
                    "new_password": "AnotherPassword123!",
                },
            )
            self.assertEqual(r_reuse.status_code, 400, r_reuse.text)

            # 8. Expired code is rejected
            expired_code = "654321"
            await self.db.password_resets.insert_one({
                "id": "rst_expired",
                "email": "junaidjay27@gmail.com",
                "code_hash": get_password_hash(expired_code),
                "created_at": datetime.now(timezone.utc) - timedelta(minutes=20),
                "expires_at": datetime.now(timezone.utc) - timedelta(minutes=10),
                "attempts": 0,
                "used": False,
            })
            r_expired = await self.client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": "junaidjay27@gmail.com",
                    "code": expired_code,
                    "new_password": "ExpiredPassword123!",
                },
            )
            self.assertEqual(r_expired.status_code, 400, r_expired.text)
            self.assertIn("expired", r_expired.json()["detail"].lower())

    async def test_reset_password_lockout_after_five_wrong_attempts(self):
        sent_codes = []

        async def _capture_email(*, recipient_email, code, recipient_name, company=None):
            sent_codes.append((recipient_email, code))

        with self._patch_env(), patch(
            "app.routers.auth.EmailService.send_password_reset_code", side_effect=_capture_email
        ):
            await self.client.post(
                "/api/v1/auth/forgot-password",
                json={"email": "other.user@example.com"},
            )
            other_code = sent_codes[0][1]
            bad_code = "111111" if other_code != "111111" else "222222"
            for _ in range(5):
                r_bad = await self.client.post(
                    "/api/v1/auth/reset-password",
                    json={
                        "email": "other.user@example.com",
                        "code": bad_code,
                        "new_password": "LockedOutPassword123!",
                    },
                )
                self.assertEqual(r_bad.status_code, 400, r_bad.text)
            r_locked = await self.client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": "other.user@example.com",
                    "code": other_code,
                    "new_password": "LockedOutPassword123!",
                },
            )
            self.assertEqual(r_locked.status_code, 400, r_locked.text)
            self.assertIn("locked", r_locked.json()["detail"].lower())

    async def test_owner_team_directory_patch_updates_multicompany_password(self):
        with self._patch_env(multi_company=True, multi_tenant=True):
            owner_token = _make_token(
                self.owner, company_id="company_reamarc", membership=self.mem_owner_home
            )
            new_pwd = "OwnerChangedJunaid123!"
            resp = await self.client.patch(
                f"/api/v1/admin/members/{self.junaid['id']}",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={"password": new_pwd},
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            body = resp.json()
            self.assertTrue(body.get("password_updated"), body)

            # Junaid can log in with the new password
            login_resp = await self.client.post(
                "/api/v1/auth/login",
                json={"email": "junaidjay27@gmail.com", "password": new_pwd},
            )
            self.assertEqual(login_resp.status_code, 200, login_resp.text)

    async def test_non_owner_admin_patch_password_on_multicompany_rejected_never_200(self):
        with self._patch_env(multi_company=True, multi_tenant=True):
            admin_token = _make_token(
                self.home_admin, company_id="company_reamarc", membership=self.mem_admin_home
            )
            resp = await self.client.patch(
                f"/api/v1/admin/members/{self.junaid['id']}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"password": "NonOwnerAttempt123!"},
            )
            self.assertEqual(resp.status_code, 403, resp.text)
            self.assertIn("home company", resp.json().get("detail", "").lower())

            # Whitespace-only password is also rejected explicitly (never silent 200)
            owner_token = _make_token(
                self.owner, company_id="company_reamarc", membership=self.mem_owner_home
            )
            blank_resp = await self.client.patch(
                f"/api/v1/admin/members/{self.junaid['id']}",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={"password": "   "},
            )
            self.assertEqual(blank_resp.status_code, 400, blank_resp.text)

            # Password remained unchanged
            fresh = await self.db.users.find_one({"id": self.junaid["id"]})
            self.assertEqual(fresh["hashed_password"], self.old_hash)

    async def test_single_company_update_member_and_companies_starting_password(self):
        # 1. Single-company mode password change via Team Directory PATCH
        with self._patch_env(multi_company=False, multi_tenant=False):
            admin_token = _make_token(self.home_admin, company_id="company_reamarc")
            new_single_pwd = "SingleCoPass123!"
            resp = await self.client.patch(
                f"/api/v1/admin/members/{self.single_member['id']}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"password": new_single_pwd},
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            self.assertTrue(resp.json().get("password_updated"), resp.json())

            login_resp = await self.client.post(
                "/api/v1/auth/login",
                json={"email": "single@reamarc.com", "password": new_single_pwd},
            )
            self.assertEqual(login_resp.status_code, 200, login_resp.text)

        # 2. Companies "Set first-time password" endpoint still works
        with self._patch_env(multi_company=True, multi_tenant=True):
            owner_token = _make_token(
                self.owner, company_id="company_reamarc", membership=self.mem_owner_home
            )
            starting_pwd = "StartingPass999!"
            sp_resp = await self.client.post(
                f"/api/v1/owner/members/{self.junaid['id']}/starting-password",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={"starting_password": starting_pwd},
            )
            self.assertEqual(sp_resp.status_code, 200, sp_resp.text)
            self.assertTrue(sp_resp.json().get("ok"))

            login_resp = await self.client.post(
                "/api/v1/auth/login",
                json={"email": "junaidjay27@gmail.com", "password": starting_pwd},
            )
            self.assertEqual(login_resp.status_code, 200, login_resp.text)
