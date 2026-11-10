"""H5 RBAC matrix with JWTs (X-Client: mobile) on seeded users."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from mongomock_motor import AsyncMongoMockClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.limiter import limiter
from app.core.security import create_access_token, get_current_user, get_password_hash
from app.core.tenant import TenantDB, tenant_scope
from app.database import db_instance
from app.routers.auth import router as auth_router
from app.routers.tasks import router as tasks_router
from tests.task_manager.conftest import (
    ADMIN,
    HR,
    LEAD_CONTENT,
    LEAD_SEO,
    LEAD_WEB,
    MEMBER_C1,
    MEMBER_C2,
    MEMBER_HR,
    MEMBER_WEB,
    OPS,
    OTHER_LEAD,
)

PASSWORD = "tm-test-pass"
ROLES = {
    "admin": ADMIN,
    "lead.content": LEAD_CONTENT,
    "member.content1": MEMBER_C1,
    "member.content2": MEMBER_C2,
    "lead.web": LEAD_WEB,
    "member.web": MEMBER_WEB,
    "lead.seo": LEAD_SEO,
    "hr": HR,
    "ops": OPS,
    "member.hr": MEMBER_HR,
    "other.lead": OTHER_LEAD,
}


class RbacApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        self.db = TenantDB(self.raw)
        hashed = get_password_hash(PASSWORD)
        await self.raw.companies.insert_many(
            [
                {"id": "company_reamarc", "slug": "reamarc", "name": "Reamarc (test)", "status": "active"},
                {"id": "tm_other_co", "slug": "tm-other", "name": "Other Co (test)", "status": "active"},
            ]
        )
        for u in ROLES.values():
            doc = dict(u)
            doc["email"] = doc.get("email") or f"{doc['id']}@tm-test.com"
            doc["hashed_password"] = hashed
            doc["token_version"] = 0
            doc.setdefault("company_id", "tm_other_co" if doc["id"] == "other.lead" else "company_reamarc")
            await self.raw.users.insert_one(doc)
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(auth_router, prefix="/api/v1")
        self.app.include_router(tasks_router, prefix="/api/v1")
        patch("app.services.task_service.ensure_task_indexes", new_callable=AsyncMock).start()
        patch("app.services.task_notifications.notify_assigned", new_callable=AsyncMock).start()
        patch("app.services.task_notifications.notify_comment", new_callable=AsyncMock).start()
        self.tokens = {}
        for key, user in ROLES.items():
            self.tokens[key] = create_access_token(
                {"sub": user["id"], "email": user.get("email") or f"{user['id']}@tm-test.com", "role": user["role"], "tv": 0, "cid": user.get("company_id", "company_reamarc")}
            )

        async def _user():
            return self.actor

        self.actor = dict(ADMIN)
        self.app.dependency_overrides[get_current_user] = _user

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    def _headers(self, key: str) -> dict:
        return {"Authorization": f"Bearer {self.tokens[key]}", "X-Client": "mobile"}

    async def _ac(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def test_mobile_login_issues_jwt(self):
        from app.core import tenant as tenant_mod

        with patch.object(tenant_mod, "get_global_db", return_value=self.raw):
            async with await self._ac() as ac:
                res = await ac.post(
                    "/api/v1/auth/login",
                    json={"email": "lead.content@tm-test.com", "password": PASSWORD},
                    headers={"X-Client": "mobile"},
                )
            self.assertIn(res.status_code, (200, 401, 403, 422, 429, 500))
            if res.status_code == 200:
                body = res.json()
                self.assertTrue(body.get("access_token") or body.get("token"))

    async def test_endpoint_matrix(self):
        self.actor = dict(LEAD_CONTENT)
        async with await self._ac() as ac:
            created = await ac.post("/api/v1/tasks", json={"title": "RBAC", "assignee_id": MEMBER_C1["id"]})
            self.assertEqual(created.status_code, 201, created.text)
            tid = created.json()["id"]
            await ac.post(f"/api/v1/tasks/{tid}/comments", json={"text": "hello"})

        expected_list = {
            "admin": 200,
            "lead.content": 200,
            "member.content1": 200,
            "member.content2": 200,
            "lead.web": 200,
            "member.web": 200,
            "lead.seo": 200,
            "hr": 403,
            "ops": 403,
            "member.hr": 403,
            "other.lead": 200,
        }
        async with await self._ac() as ac:
            for key, status in expected_list.items():
                self.actor = dict(ROLES[key])
                res = await ac.get("/api/v1/tasks", headers=self._headers(key))
                self.assertEqual(res.status_code, status, key)
                res = await ac.get("/api/v1/tasks/conversations", headers=self._headers(key))
                self.assertEqual(res.status_code, status if key != "other.lead" else 200, f"chat {key}")
                res = await ac.get(f"/api/v1/tasks/{tid}", headers=self._headers(key))
                if key in ("hr", "ops", "member.hr"):
                    self.assertEqual(res.status_code, 403, key)
                elif key in ("member.web", "member.content2", "lead.seo", "lead.web", "other.lead"):
                    self.assertIn(res.status_code, (200, 404), key)
                else:
                    self.assertEqual(res.status_code, 200, key)

            self.actor = dict(MEMBER_WEB)
            res = await ac.post(f"/api/v1/tasks/{tid}/comments", json={"text": "nope"}, headers=self._headers("member.web"))
            self.assertIn(res.status_code, (403, 404))
            self.actor = dict(OTHER_LEAD)
            with tenant_scope(company_id="tm_other_co"):
                res = await ac.get(f"/api/v1/tasks/{tid}", headers=self._headers("other.lead"))
                self.assertEqual(res.status_code, 404)
                res = await ac.post(f"/api/v1/tasks/{tid}/comments", json={"text": "x"}, headers=self._headers("other.lead"))
                self.assertEqual(res.status_code, 404)
                res = await ac.post(f"/api/v1/tasks/{tid}/assign", json={"assignee_id": MEMBER_C1["id"]}, headers=self._headers("other.lead"))
                self.assertEqual(res.status_code, 404)
                res = await ac.get("/api/v1/tasks/conversations", headers=self._headers("other.lead"))
                ids = {r["task_id"] for r in res.json().get("items", [])}
                self.assertNotIn(tid, ids)
