"""Approval rule C: chain + dept lead, not assignee."""
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
from tests.task_manager.conftest import (
    ADMIN,
    LEAD_CONTENT,
    LEAD_SEO,
    LEAD_WEB,
    MEMBER_C1,
    MEMBER_C2,
)

USERS = [ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_C2, LEAD_WEB, LEAD_SEO]


class ApprovalTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
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
        self.notify_assigned = patch("app.services.task_notifications.notify_assigned", new_callable=AsyncMock).start()
        self.notify_delegated = patch("app.services.task_notifications.notify_delegated", new_callable=AsyncMock).start()
        self.notify_review = patch("app.services.task_notifications.notify_review_requested", new_callable=AsyncMock).start()
        self.notify_completed = patch("app.services.task_notifications.notify_completed", new_callable=AsyncMock).start()
        self.notify_sent = patch("app.services.task_notifications.notify_sent_back", new_callable=AsyncMock).start()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    async def _ac(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def _scenario(self):
        self.actor = dict(LEAD_WEB)
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks", json={"title": "T-chain", "assignee_id": LEAD_CONTENT["id"]})
            self.assertEqual(res.status_code, 201, res.text)
            tid = res.json()["id"]
            self.actor = dict(LEAD_CONTENT)
            res = await ac.post(f"/api/v1/tasks/{tid}/assign", json={"assignee_id": MEMBER_C1["id"]})
            self.assertEqual(res.status_code, 200, res.text)
            self.actor = dict(MEMBER_C1)
            await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_progress"})
            res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_review"})
            self.assertEqual(res.status_code, 200, res.text)
            return tid

    async def test_lead_content_and_lead_web_and_admin_can_approve(self):
        for approver in (LEAD_CONTENT, LEAD_WEB, ADMIN):
            await self.raw.tasks.delete_many({})
            tid = await self._scenario()
            self.actor = dict(approver)
            async with await self._ac() as ac:
                res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "completed"})
            self.assertEqual(res.status_code, 200, f"{approver['id']} {res.text}")

    async def test_assignee_and_peer_and_seo_cannot_approve(self):
        tid = await self._scenario()
        for actor in (MEMBER_C1, MEMBER_C2, LEAD_SEO):
            self.actor = dict(actor)
            async with await self._ac() as ac:
                res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "completed"})
            self.assertIn(res.status_code, (403, 404, 422), actor["id"])

    async def test_review_requested_goes_to_chain(self):
        self.notify_review.reset_mock()
        await self._scenario()
        self.assertTrue(self.notify_review.await_count)
        kwargs = self.notify_review.await_args.kwargs
        extra = set(kwargs.get("extra") or [])
        self.assertIn(LEAD_CONTENT["id"], extra)
        self.assertIn(LEAD_WEB["id"], extra)

    async def test_completed_notifies_assignee(self):
        tid = await self._scenario()
        self.notify_completed.reset_mock()
        self.actor = dict(LEAD_CONTENT)
        async with await self._ac() as ac:
            await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "completed"})
        self.assertTrue(self.notify_completed.await_count)

    async def test_send_back_notifies_assignee_with_reason(self):
        tid = await self._scenario()
        self.notify_sent.reset_mock()
        self.actor = dict(LEAD_CONTENT)
        async with await self._ac() as ac:
            res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_progress", "reason": "Fix tone"})
        self.assertEqual(res.status_code, 200, res.text)
        args, kwargs = self.notify_sent.await_args
        self.assertEqual(args[1] if len(args) > 1 else kwargs.get("reason"), "Fix tone")

    async def test_self_assigned_completes_without_review(self):
        self.actor = dict(MEMBER_C1)
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks", json={"title": "Self", "assignee_id": MEMBER_C1["id"]})
            tid = res.json()["id"]
            await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "in_progress"})
            res = await ac.patch(f"/api/v1/tasks/{tid}/stage", json={"to": "completed"})
        self.assertEqual(res.status_code, 200, res.text)
