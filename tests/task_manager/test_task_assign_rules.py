"""Assignment rule matrix (prompt B)."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from mongomock_motor import AsyncMongoMockClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.core.tenant import TenantDB
from app.database import db_instance
from app.routers.tasks import router as tasks_router
from app.services.task_access import can_assign_to
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
)

USERS = [ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_C2, LEAD_WEB, MEMBER_WEB, LEAD_SEO, HR, OPS, MEMBER_HR]


class AssignRuleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        self.db = TenantDB(self.raw)
        for u in USERS:
            await self.raw.users.insert_one(dict(u))
        self.actor = dict(LEAD_WEB)
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(tasks_router, prefix="/api/v1")

        async def _user():
            return self.actor

        self.app.dependency_overrides[get_current_user] = _user
        patch("app.services.task_service.ensure_task_indexes", new_callable=AsyncMock).start()
        patch("app.services.task_notifications.notify_assigned", new_callable=AsyncMock).start()
        patch("app.services.task_notifications.notify_delegated", new_callable=AsyncMock).start()
        patch("app.services.task_notifications.notify_reassigned", new_callable=AsyncMock).start()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    async def _ac(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def _picker_ids(self, actor, task_id=None):
        self.actor = dict(actor)
        q = f"?task_id={task_id}" if task_id else ""
        async with await self._ac() as ac:
            res = await ac.get(f"/api/v1/tasks/assignable-users{q}")
        self.assertEqual(res.status_code, 200, res.text)
        return {u["id"] for u in res.json()["items"]}

    def test_matrix_can_assign_to(self):
        cases = [
            (LEAD_WEB, LEAD_CONTENT, True),
            (LEAD_WEB, MEMBER_C1, False),
            (LEAD_CONTENT, MEMBER_C1, True),
            (MEMBER_C1, LEAD_CONTENT, True),
            (MEMBER_C1, LEAD_WEB, False),
            (ADMIN, MEMBER_C1, True),
            (ADMIN, MEMBER_HR, False),
            (MEMBER_C1, MEMBER_C2, True),
            (LEAD_CONTENT, MEMBER_WEB, False),
        ]
        for actor, target, ok in cases:
            self.assertEqual(can_assign_to(actor, target), ok, msg=f"{actor['id']} -> {target['id']}")

    async def test_picker_matches_can_assign_to(self):
        ids = await self._picker_ids(LEAD_WEB)
        self.assertIn(LEAD_CONTENT["id"], ids)
        self.assertNotIn(MEMBER_C1["id"], ids)
        self.assertTrue(can_assign_to(LEAD_WEB, LEAD_CONTENT))
        self.assertFalse(can_assign_to(LEAD_WEB, MEMBER_C1))

    async def test_web_lead_cannot_create_for_content_member(self):
        self.actor = dict(LEAD_WEB)
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks", json={"title": "Nope", "assignee_id": MEMBER_C1["id"]})
        self.assertEqual(res.status_code, 403)

    async def test_web_lead_assigns_content_lead_who_delegates(self):
        self.actor = dict(LEAD_WEB)
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks", json={"title": "Cross", "assignee_id": LEAD_CONTENT["id"]})
            self.assertEqual(res.status_code, 201, res.text)
            tid = res.json()["id"]
            self.actor = dict(LEAD_CONTENT)
            res = await ac.post(f"/api/v1/tasks/{tid}/assign", json={"assignee_id": MEMBER_C1["id"]})
            self.assertEqual(res.status_code, 200, res.text)
            picker = await self._picker_ids(LEAD_CONTENT, tid)
            self.assertIn(MEMBER_C1["id"], picker)
            self.assertNotIn(MEMBER_WEB["id"], picker)
