"""Task chat conversations, unread, and tenancy."""
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
from app.core.tenant import TenantDB, tenant_scope
from app.database import db_instance
from app.routers.tasks import router as tasks_router
from tests.task_manager.conftest import ADMIN, HR, LEAD_CONTENT, MEMBER_C1, MEMBER_C2, MEMBER_WEB, OPS, LEAD_WEB


class ChatTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        self.db = TenantDB(self.raw)
        for u in (ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_C2, HR, OPS, LEAD_WEB, MEMBER_WEB):
            await self.raw.users.insert_one(dict(u))
        self.actor = dict(LEAD_CONTENT)
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(tasks_router, prefix="/api/v1")

        async def _user():
            return self.actor

        self.app.dependency_overrides[get_current_user] = _user
        self._idx_patch = patch("app.services.task_service.ensure_task_indexes", new_callable=AsyncMock)
        self._idx_patch.start()
        patch("app.services.task_notifications.notify_assigned", new_callable=AsyncMock).start()
        patch("app.services.task_notifications.notify_comment", new_callable=AsyncMock).start()
        patch("app.services.task_notifications.notify_mention", new_callable=AsyncMock).start()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    async def _ac(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def test_conversations_membership_unread_and_hr(self):
        async with await self._ac() as ac:
            created = await ac.post("/api/v1/tasks", json={"title": "Chat me", "assignee_id": MEMBER_C1["id"]})
            tid = created.json()["id"]
            res = await ac.post(f"/api/v1/tasks/{tid}/comments", json={"text": "@[Member C1](member.content1) hello there"})
            self.assertEqual(res.status_code, 200, res.text)
            res = await ac.get("/api/v1/tasks/conversations")
            self.assertEqual(res.status_code, 200)
            ids = {r["task_id"] for r in res.json()["items"]}
            self.assertIn(tid, ids)
            self.actor = dict(MEMBER_C2)
            res = await ac.get("/api/v1/tasks/conversations")
            ids = {r["task_id"] for r in res.json()["items"]}
            self.assertNotIn(tid, ids)
            self.actor = dict(MEMBER_C1)
            res = await ac.get("/api/v1/tasks/chat/unread")
            self.assertGreaterEqual(res.json()["total"], 1)
            res = await ac.post(f"/api/v1/tasks/{tid}/read")
            self.assertEqual(res.status_code, 200)
            res = await ac.get("/api/v1/tasks/chat/unread")
            self.assertEqual(res.json()["by_task"].get(tid, 0), 0)
            self.actor = dict(HR)
            res = await ac.get("/api/v1/tasks/conversations")
            self.assertEqual(res.status_code, 403)
            self.actor = dict(OPS)
            res = await ac.get("/api/v1/tasks/chat/unread")
            self.assertEqual(res.status_code, 403)

    async def test_other_company_hidden(self):
        from app.config import settings

        async with await self._ac() as ac:
            created = await ac.post("/api/v1/tasks", json={"title": "A", "assignee_id": MEMBER_C1["id"]})
            self.assertEqual(created.status_code, 201, created.text)
            tid = created.json()["id"]
            await ac.post(f"/api/v1/tasks/{tid}/comments", json={"text": "hi"})
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", True)
        try:
            with tenant_scope(company_id="tm_other_co"):
                self.actor = dict(LEAD_CONTENT)
                async with await self._ac() as ac:
                    res = await ac.get("/api/v1/tasks/conversations")
                    ids = {r["task_id"] for r in res.json().get("items", [])}
                    self.assertNotIn(tid, ids)
        finally:
            object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)

    def _instrument_db(self):
        calls: list[str] = []

        def wrap(coll, label: str):
            for method in ("find", "find_one", "count_documents", "aggregate", "distinct"):
                orig = getattr(coll, method)

                def wrapped(*args, _orig=orig, _method=method, _label=label, **kwargs):
                    calls.append(f"{_label}.{_method}")
                    return _orig(*args, **kwargs)

                setattr(coll, method, wrapped)

        wrap(self.raw.task_comments, "task_comments")
        wrap(self.raw.tasks, "tasks")
        wrap(self.raw.task_reads, "task_reads")
        wrap(self.raw.task_settings, "task_settings")
        return calls

    async def _seed_conversations(self, n: int):
        from app.services import task_service

        ids = []
        for i in range(n):
            t = await task_service.create_task(
                self.raw, {"title": f"Conv {i}", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT
            )
            tid = t["id"]
            ids.append(tid)
            for j in range(3):
                await self.raw.task_comments.insert_one(
                    {
                        "id": f"c_{i}_{j}",
                        "task_id": tid,
                        "user_id": MEMBER_C1["id"] if j else LEAD_CONTENT["id"],
                        "user_name": "Member C1" if j else "Lead Content",
                        "text": f"msg {i}-{j}",
                        "created_at": f"2026-01-01T00:{i:02d}:{j:02d}Z",
                        "deleted": False,
                    }
                )
            await self.raw.tasks.update_one({"id": tid}, {"$set": {"comments_count": 3}})
        return ids

    async def test_conversations_and_unread_use_fixed_db_calls(self):
        from app.services import task_chat

        for n in (5, 25):
            await self.raw.tasks.delete_many({})
            await self.raw.task_comments.delete_many({})
            await self.raw.task_reads.delete_many({})
            await self._seed_conversations(n)
            calls = self._instrument_db()
            conv = await task_chat.list_conversations(self.raw, LEAD_CONTENT, page=1, limit=30)
            list_count = len(calls)
            self.assertLessEqual(list_count, 6, calls)
            self.assertNotIn("task_comments.find_one", calls)
            self.assertNotIn("task_comments.count_documents", calls)
            self.assertEqual(conv["total"], n)
            self.assertEqual(len(conv["items"]), min(n, 30))
            last = conv["items"][0]["last_comment"]
            self.assertEqual(last["text_preview"], f"msg {n - 1}-2")
            self.assertEqual(last["created_at"], f"2026-01-01T00:{n - 1:02d}:02Z")
            self.assertGreaterEqual(conv["items"][0]["unread_count"], 2)

            calls.clear()
            unread = await task_chat.unread_counts(self.raw, LEAD_CONTENT)
            unread_count = len(calls)
            self.assertLessEqual(unread_count, 6, calls)
            self.assertEqual(unread_count, list_count)
            self.assertEqual(unread["total"], sum(r["unread_count"] for r in conv["items"]))
            self.assertGreaterEqual(unread["by_task"][conv["items"][0]["task_id"]], 2)

    async def test_conversations_total_after_visibility_filter(self):
        from app.services import task_chat, task_service

        visible_ids = []
        for i in range(3):
            t = await task_service.create_task(
                self.raw, {"title": f"Web conv {i}", "assignee_id": MEMBER_WEB["id"]}, LEAD_WEB
            )
            visible_ids.append(t["id"])
            await self.raw.task_comments.insert_one(
                {
                    "id": f"c_web_{i}",
                    "task_id": t["id"],
                    "user_id": LEAD_WEB["id"],
                    "user_name": "Lead Web",
                    "text": f"web {i}",
                    "created_at": f"2026-02-01T00:00:{i:02d}Z",
                    "deleted": False,
                }
            )
            await self.raw.tasks.update_one({"id": t["id"]}, {"$set": {"comments_count": 1}})

        hidden = await task_service.create_task(
            self.raw, {"title": "Content mentioned", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT
        )
        await self.raw.tasks.update_one(
            {"id": hidden["id"]},
            {
                "$set": {
                    "department": "Content",
                    "involved_ids": [LEAD_CONTENT["id"], MEMBER_C1["id"]],
                    "comments_count": 1,
                    "watcher_ids": [],
                }
            },
        )
        await self.raw.task_comments.insert_one(
            {
                "id": "c_hidden",
                "task_id": hidden["id"],
                "user_id": MEMBER_C1["id"],
                "user_name": "Member C1",
                "text": "@[Member Web](member.web) hi",
                "mentions": [MEMBER_WEB["id"]],
                "created_at": "2026-01-02T00:00:00Z",
                "deleted": False,
            }
        )
        conv = await task_chat.list_conversations(self.raw, MEMBER_WEB, page=1, limit=2)
        ids = {r["task_id"] for r in conv["items"]}
        self.assertNotIn(hidden["id"], ids)
        full = await task_chat.list_conversations(self.raw, MEMBER_WEB, page=1, limit=100)
        self.assertEqual(full["total"], len(visible_ids))
        self.assertEqual(full["total"], len(full["items"]))
        self.assertEqual(conv["total"], full["total"])
        self.assertEqual(len(conv["items"]), 2)
        self.assertNotIn(hidden["id"], {r["task_id"] for r in full["items"]})
        self.assertEqual({r["task_id"] for r in full["items"]}, set(visible_ids))

    async def test_mentions_index_exists_after_ensure_task_indexes(self):
        import app.services.task_service as ts

        self._idx_patch.stop()
        ts._indexes_ready = False
        await ts.ensure_task_indexes(self.raw)
        info = await self.raw.task_comments.index_information()
        self.assertIn("idx_task_comments_mentions", info)
