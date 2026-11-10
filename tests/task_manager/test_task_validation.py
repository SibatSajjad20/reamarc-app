"""A1, A5, H4 validation."""
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
from app.database import db_instance
from app.routers.tasks import router as tasks_router
from tests.task_manager.conftest import ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_WEB


class ValidationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        for u in (ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_WEB):
            await self.raw.users.insert_one(dict(u))
        self.actor = dict(LEAD_CONTENT)
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(tasks_router, prefix="/api/v1")

        async def _user():
            return self.actor

        self.app.dependency_overrides[get_current_user] = _user
        patch("app.services.task_service.ensure_task_indexes", new_callable=AsyncMock).start()
        patch("app.services.task_notifications.notify_assigned", new_callable=AsyncMock).start()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    async def _ac(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def test_create_ignores_client_status(self):
        async with await self._ac() as ac:
            res = await ac.post(
                "/api/v1/tasks",
                json={"title": "Skip review", "assignee_id": MEMBER_C1["id"], "status": "completed"},
            )
        self.assertEqual(res.status_code, 201, res.text)
        self.assertEqual(res.json()["status"], "todo")

    async def test_bad_dates_and_order(self):
        async with await self._ac() as ac:
            res = await ac.post(
                "/api/v1/tasks",
                json={"title": "Bad", "assignee_id": MEMBER_C1["id"], "due_date": "not-a-date"},
            )
            self.assertEqual(res.status_code, 422)
            res = await ac.post(
                "/api/v1/tasks",
                json={"title": "Order", "assignee_id": MEMBER_C1["id"], "start_date": "2026-11-12", "due_date": "2026-11-10"},
            )
            self.assertEqual(res.status_code, 422)
            res = await ac.post(
                "/api/v1/tasks",
                json={"title": "Until", "assignee_id": MEMBER_C1["id"], "due_date": "2026-11-12", "recurrence": {"freq": "weekly", "until": "2026-11-01"}},
            )
            self.assertEqual(res.status_code, 422)
            res = await ac.post(
                "/api/v1/tasks",
                json={"title": "Time", "assignee_id": MEMBER_C1["id"], "due_time": "09:00"},
            )
            self.assertEqual(res.status_code, 422)

    async def test_batch_priority_stage_and_cancel_reason(self):
        async with await self._ac() as ac:
            created = await ac.post("/api/v1/tasks", json={"title": "Batch", "assignee_id": MEMBER_C1["id"]})
            tid = created.json()["id"]
            res = await ac.patch("/api/v1/tasks/batch", json={"items": [{"id": tid, "priority": "nope"}]})
            if res.status_code == 200:
                self.assertFalse(res.json()["results"][0]["ok"])
            else:
                self.assertEqual(res.status_code, 422)
            res = await ac.patch("/api/v1/tasks/batch", json={"items": [{"id": tid, "cancel": True}]})
            self.assertEqual(res.status_code, 200)
            self.assertFalse(res.json()["results"][0]["ok"])
            res = await ac.patch("/api/v1/tasks/batch", json={"items": [{"id": tid, "cancel": True, "cancel_reason": "dup"}]})
            self.assertEqual(res.status_code, 200, res.text)
            self.assertTrue(res.json()["results"][0]["ok"], res.text)

    async def test_link_schemes(self):
        async with await self._ac() as ac:
            created = await ac.post("/api/v1/tasks", json={"title": "Links", "assignee_id": MEMBER_C1["id"]})
            tid = created.json()["id"]
            for url in ("javascript:alert(1)", "ftp://files.example.com/a", "https://"):
                res = await ac.post(f"/api/v1/tasks/{tid}/attachments/link", json={"name": "x", "url": url})
                self.assertEqual(res.status_code, 422, url)
            res = await ac.post(f"/api/v1/tasks/{tid}/attachments/link", json={"name": "ok", "url": "https://example.com/a"})
            self.assertEqual(res.status_code, 200, res.text)

    async def test_title_and_estimate_and_unknown_assignee(self):
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks", json={"title": "   ", "assignee_id": MEMBER_C1["id"]})
            self.assertEqual(res.status_code, 422)
            res = await ac.post("/api/v1/tasks", json={"title": "x" * 201, "assignee_id": MEMBER_C1["id"]})
            self.assertEqual(res.status_code, 422)
            res = await ac.post("/api/v1/tasks", json={"title": "Est", "assignee_id": MEMBER_C1["id"], "estimate_hours": 1001})
            self.assertEqual(res.status_code, 422)
            res = await ac.post("/api/v1/tasks", json={"title": "Ghost", "assignee_id": "no-such-user"})
            self.assertIn(res.status_code, (403, 422))
            res = await ac.post("/api/v1/tasks", json={"title": "Other dept", "assignee_id": MEMBER_WEB["id"]})
            self.assertEqual(res.status_code, 403)
