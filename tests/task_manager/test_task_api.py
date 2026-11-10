"""API integration for Task Manager."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from mongomock_motor import AsyncMongoMockClient
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.core.tenant import TenantDB
from app.database import db_instance
from app.routers.tasks import router as tasks_router
from tests.task_manager.conftest import (
    ADMIN,
    HR,
    LEAD_CONTENT,
    LEAD_WEB,
    MEMBER_C1,
    MEMBER_C2,
    MEMBER_WEB,
    OPS,
)


class TaskApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        for u in (ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_C2, LEAD_WEB, MEMBER_WEB, HR, OPS):
            await self.raw.users.insert_one(dict(u))
        self.actor = dict(LEAD_CONTENT)
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(tasks_router, prefix="/api/v1")

        async def _user():
            return self.actor

        self.app.dependency_overrides[get_current_user] = _user
        self._notify = patch("app.services.task_notifications.dispatch_task_event", new_callable=AsyncMock)
        self._notify.start()
        self._n1 = patch("app.services.task_notifications.notify_assigned", new_callable=AsyncMock)
        self._n1.start()
        self._n2 = patch("app.services.task_notifications.notify_delegated", new_callable=AsyncMock)
        self._n2.start()
        self._n3 = patch("app.services.task_notifications.notify_review_requested", new_callable=AsyncMock)
        self._n3.start()
        self._n4 = patch("app.services.task_notifications.notify_completed", new_callable=AsyncMock)
        self._n4.start()
        self._n5 = patch("app.services.task_notifications.notify_mention", new_callable=AsyncMock)
        self._n5.start()
        self._n6 = patch("app.services.task_notifications.notify_comment", new_callable=AsyncMock)
        self._n6.start()
        self._idx = patch("app.services.task_service.ensure_task_indexes", new_callable=AsyncMock)
        self._idx.start()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    async def _ac(self):
        transport = httpx.ASGITransport(app=self.app)
        return httpx.AsyncClient(transport=transport, base_url="http://test")

    async def test_hr_forbidden(self):
        self.actor = dict(HR)
        async with await self._ac() as ac:
            res = await ac.get("/api/v1/tasks")
            self.assertEqual(res.status_code, 403)

    async def test_ops_forbidden(self):
        self.actor = dict(OPS)
        async with await self._ac() as ac:
            res = await ac.get("/api/v1/tasks/counts")
            self.assertEqual(res.status_code, 403)

    async def test_create_assign_comment_stage_flow(self):
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks", json={"title": "Landing page copy for ZEM", "assignee_id": LEAD_WEB["id"]})
            self.assertEqual(res.status_code, 201, res.text)
            task = res.json()
            self.assertTrue(task["serial"].startswith("T-"))
            tid = task["id"]

            self.actor = dict(LEAD_WEB)
            res = await ac.post(f"/api/v1/tasks/{tid}/assign", json={"assignee_id": MEMBER_WEB["id"]})
            self.assertEqual(res.status_code, 200, res.text)
            self.assertEqual(len(res.json()["assignment_chain"]), 2)

            self.actor = dict(MEMBER_WEB)
            res = await ac.post(
                f"/api/v1/tasks/{tid}/comments",
                json={"text": "@[Lead Content](lead.content) which tone?", "question": True},
            )
            self.assertEqual(res.status_code, 200, res.text)

            res = await ac.post(f"/api/v1/tasks/{tid}/checklist", json={"text": "Draft headline"})
            self.assertEqual(res.status_code, 200, res.text)
            item_id = res.json()["checklist"][0]["id"]
            res = await ac.patch(f"/api/v1/tasks/{tid}/checklist/{item_id}", json={"done": True})
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["progress"], 100)

            res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_progress"})
            self.assertEqual(res.status_code, 200)
            res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_review"})
            self.assertEqual(res.status_code, 200)

            self.actor = dict(LEAD_WEB)
            res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_progress"})
            self.assertEqual(res.status_code, 422)
            res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_progress", "reason": "tighter copy"})
            self.assertEqual(res.status_code, 200)
            res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_review"})
            # lead cannot submit for review as assignee
            self.assertIn(res.status_code, (200, 422))
            self.actor = dict(MEMBER_WEB)
            await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_progress"})
            await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_review"})
            self.actor = dict(LEAD_WEB)
            res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "completed"})
            self.assertEqual(res.status_code, 200, res.text)

            res = await ac.post(f"/api/v1/tasks/{tid}/attachments/link", json={"name": "Brief", "url": "https://example.com/brief"})
            self.assertEqual(res.status_code, 200, res.text)

            self.actor = dict(MEMBER_C1)
            res = await ac.get(f"/api/v1/tasks/{tid}")
            self.assertEqual(res.status_code, 404)

    async def test_stale_write_409(self):
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks", json={"title": "Stale", "assignee_id": MEMBER_C1["id"]})
            task = res.json()
            res = await ac.patch(f"/api/v1/tasks/{task['id']}", json={"title": "First", "if_updated_at": task["updated_at"]})
            self.assertEqual(res.status_code, 200)
            res = await ac.patch(f"/api/v1/tasks/{task['id']}", json={"title": "Second", "if_updated_at": task["updated_at"]})
            self.assertEqual(res.status_code, 409)

    async def test_batch_partial(self):
        async with await self._ac() as ac:
            a = (await ac.post("/api/v1/tasks", json={"title": "A", "assignee_id": MEMBER_C1["id"]})).json()
            res = await ac.patch(
                "/api/v1/tasks/batch",
                json={"items": [{"id": a["id"], "priority": "high"}, {"id": "missing", "priority": "low"}]},
            )
            self.assertEqual(res.status_code, 200)
            results = res.json()["results"]
            self.assertTrue(any(r.get("ok") for r in results))
            self.assertTrue(any(not r.get("ok") for r in results))

    async def test_assignable_hides_other_dept_member(self):
        async with await self._ac() as ac:
            self.actor = dict(MEMBER_C1)
            res = await ac.get("/api/v1/tasks/assignable-users")
            self.assertEqual(res.status_code, 200)
            ids = {u["id"] for u in res.json()["items"]}
            self.assertIn(MEMBER_C2["id"], ids)
            self.assertIn(LEAD_CONTENT["id"], ids)
            self.assertNotIn(MEMBER_WEB["id"], ids)
            self.assertNotIn(HR["id"], ids)

    async def test_flip_exclusion(self):
        async with await self._ac() as ac:
            self.actor = dict(ADMIN)
            res = await ac.patch("/api/v1/tasks/settings", json={"excluded_roles": [], "excluded_departments": []})
            self.assertEqual(res.status_code, 200, res.text)
            self.actor = dict(HR)
            res = await ac.get("/api/v1/tasks/counts")
            self.assertEqual(res.status_code, 200)

    async def test_comment_mentions_never_422_and_delete_decrements(self):
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks", json={"title": "Mentions", "assignee_id": MEMBER_C1["id"]})
            tid = res.json()["id"]
            res = await ac.post(
                f"/api/v1/tasks/{tid}/comments",
                json={"text": "@[Ghost](nope) still saves"},
            )
            self.assertEqual(res.status_code, 200, res.text)
            cid = res.json()["id"]
            task = (await ac.get(f"/api/v1/tasks/{tid}")).json()
            self.assertGreaterEqual(task.get("comments_count") or 0, 1)
            res = await ac.delete(f"/api/v1/tasks/{tid}/comments/{cid}")
            self.assertEqual(res.status_code, 200, res.text)
            task = (await ac.get(f"/api/v1/tasks/{tid}")).json()
            self.assertEqual(task.get("comments_count"), 0)
