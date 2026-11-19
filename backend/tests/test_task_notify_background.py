"""Task comments/actions must not wait for push fan-out.

Adding a comment used to await Expo + sequential web push (up to 10s per
subscription), so users waited 8-10s. Notifications now run in the background
and web push delivers to subscriptions concurrently.
"""
from __future__ import annotations

import asyncio
import os
import sys
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret-key-task-notify-bg-0123456789")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.tenant import get_tenant_context, tenant_scope
from app.services import task_comments, task_notifications as tn
from app.services import web_push_service

TASK = {
    "id": "tsk_1",
    "serial": "T-1",
    "title": "Logo",
    "company_id": "company_bg",
    "creator_id": "u_creator",
    "assigner_id": "u_creator",
    "assignee_id": "u_assignee",
    "watcher_ids": ["u_watch"],
    "involved_ids": [],
    "assignment_chain": [],
}
ACTOR = {"id": "u_actor", "full_name": "Actor", "role": "team_lead"}


def _db():
    return SimpleNamespace(
        task_comments=SimpleNamespace(insert_one=AsyncMock()),
        tasks=SimpleNamespace(update_one=AsyncMock(), find_one=AsyncMock(return_value=None)),
    )


class _CommentPatches:
    def __init__(self, dispatch):
        self.dispatch = dispatch
        self._ps = [
            patch.object(task_comments, "get_task_settings", new=AsyncMock(return_value={})),
            patch.object(task_comments, "get_visible_or_404", new=AsyncMock(side_effect=lambda *a, **k: dict(TASK))),
            patch.object(task_comments, "can_comment", return_value=True),
            patch.object(task_comments, "_load_users", new=AsyncMock(return_value={})),
            patch.object(task_comments, "validate_mentions", side_effect=lambda body, *a, **k: task_comments.mention_ids(body)),
            patch.object(task_comments, "log_task_activity", new=AsyncMock()),
            patch("app.services.task_chat.mark_read", new=AsyncMock()),
            patch("app.services.push_service.dispatch_to_users", new=dispatch),
        ]

    def __enter__(self):
        for p in self._ps:
            p.start()
        return self

    def __exit__(self, *exc):
        for p in reversed(self._ps):
            p.stop()


class TestCommentDoesNotWaitForPush(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await tn.drain_background_notifications(timeout=5)

    async def test_add_comment_returns_before_slow_dispatch(self):
        seen = []

        async def slow_dispatch(**kwargs):
            await asyncio.sleep(1.0)
            ctx = get_tenant_context()
            seen.append((kwargs["kind"], sorted(kwargs["user_ids"]), ctx.company_id if ctx else None))
            return {}

        with _CommentPatches(AsyncMock(side_effect=slow_dispatch)):
            with tenant_scope("company_bg", user_id="u_actor"):
                t0 = time.perf_counter()
                out = await task_comments.add_comment(_db(), "tsk_1", "hi @[Lead](u_lead)", ACTOR)
                elapsed = time.perf_counter() - t0
            self.assertLess(elapsed, 0.5, f"add_comment waited for push ({elapsed:.2f}s)")
            self.assertEqual(out["text"], "hi @[Lead](u_lead)")
            self.assertEqual(seen, [])  # still in flight
            # Request scope is gone; background sends keep the tenant they started with.
            await tn.drain_background_notifications(timeout=5)

        kinds = {k: (ids, cid) for k, ids, cid in seen}
        self.assertEqual(set(kinds), {"task_mention", "task_comment"})
        self.assertEqual(kinds["task_mention"], (["u_lead"], "company_bg"))
        self.assertEqual(kinds["task_comment"], (["u_assignee", "u_creator", "u_watch"], "company_bg"))

    async def test_dispatch_error_is_swallowed(self):
        with _CommentPatches(AsyncMock(side_effect=RuntimeError("expo down"))):
            with tenant_scope("company_bg"):
                await task_comments.add_comment(_db(), "tsk_1", "hello", ACTOR)
            await tn.drain_background_notifications(timeout=5)
        self.assertEqual(len(tn._BACKGROUND_SENDS), 0)

    async def test_task_snapshot_taken_before_scheduling(self):
        got = []

        async def capture(**kwargs):
            got.append(kwargs["item"]["title"])
            return {}

        task = dict(TASK)
        with patch("app.services.push_service.dispatch_to_users", new=AsyncMock(side_effect=capture)):
            with tenant_scope("company_bg"):
                await tn.notify_assigned(task, ACTOR)
            task["title"] = "mutated after response"
            await tn.drain_background_notifications(timeout=5)
        self.assertEqual(got, ["Logo"])

    async def test_all_task_action_notifiers_are_backgrounded(self):
        gate = asyncio.Event()
        calls = []

        async def blocked(**kwargs):
            calls.append(kwargs["kind"])
            await gate.wait()
            return {}

        task = {**TASK, "blocked": True, "assignment_chain": [{"from_id": "u_creator", "to_id": "u_assignee"}]}
        with patch("app.services.push_service.dispatch_to_users", new=AsyncMock(side_effect=blocked)):
            with tenant_scope("company_bg"):
                await asyncio.wait_for(
                    asyncio.gather(
                        tn.notify_assigned(task, ACTOR),
                        tn.notify_delegated(task, ACTOR),
                        tn.notify_reassigned(task, ACTOR, old_assignee_id="u_old"),
                        tn.notify_review_requested(task, ACTOR),
                        tn.notify_completed(task, ACTOR),
                        tn.notify_sent_back(task, "fix it", ACTOR),
                        tn.notify_blocked(task, ACTOR),
                        tn.notify_updated(task, ["due_date"], ACTOR),
                        tn.notify_cancelled(task, ACTOR),
                        tn.notify_reopened(task, ACTOR),
                        tn.notify_mention(task, ["u_lead"], ACTOR),
                        tn.notify_comment(task, ACTOR),
                    ),
                    timeout=1,
                )
            gate.set()
            await tn.drain_background_notifications(timeout=5)
        self.assertEqual(len(calls), 12)

    async def test_due_scheduler_path_still_awaits(self):
        done = []

        async def slowish(**kwargs):
            await asyncio.sleep(0.05)
            done.append(kwargs["kind"])
            return {}

        with patch("app.services.push_service.dispatch_to_users", new=AsyncMock(side_effect=slowish)):
            with tenant_scope("company_bg"):
                await tn.dispatch_task_event(TASK, "task_overdue", "t", "b", extra=["u_assignee"])
        self.assertEqual(done, ["task_overdue"])


class _Subs:
    def __init__(self, rows):
        self.rows = rows
        self.deleted = []

    def find(self, *_a, **_k):
        rows = self.rows
        return SimpleNamespace(to_list=AsyncMock(return_value=list(rows)))

    async def delete_many(self, q):
        self.deleted.append(q)

    async def delete_one(self, q):
        self.deleted.append(q)


class TestWebPushConcurrent(unittest.IsolatedAsyncioTestCase):
    async def test_subscriptions_delivered_concurrently_with_gone_cleanup(self):
        rows = [
            {"user_id": f"u{i}", "endpoint": f"https://fcm.googleapis.com/fcm/send/e{i}", "p256dh": "x", "auth": "y"}
            for i in range(6)
        ]
        subs = _Subs(rows)
        db = SimpleNamespace(web_push_subscriptions=subs)
        lock = threading.Lock()
        live = {"now": 0, "max": 0}

        def deliver(sub, payload):
            with lock:
                live["now"] += 1
                live["max"] = max(live["max"], live["now"])
            time.sleep(0.4)
            with lock:
                live["now"] -= 1
            return "gone" if sub["endpoint"].endswith("e5") else ("fail" if sub["endpoint"].endswith("e4") else "ok")

        with patch.object(web_push_service, "get_database", return_value=db), \
             patch.object(web_push_service, "web_push_configured", return_value=True), \
             patch.object(web_push_service, "public_application_server_key", return_value="k"), \
             patch.object(web_push_service, "_deliver_one", side_effect=deliver), \
             patch("app.services.push_service.filter_allowed_recipients", new=AsyncMock(side_effect=lambda ids, *a, **k: ids)), \
             patch("app.services.push_service._multi_company_user_ids", new=AsyncMock(return_value=set())):
            t0 = time.perf_counter()
            sent = await web_push_service.send_web_push([r["user_id"] for r in rows], "Hi", "Body", kind="task_comment")
            elapsed = time.perf_counter() - t0

        self.assertEqual(sent, 4)
        self.assertEqual(subs.deleted, [{"user_id": "u5", "endpoint": rows[5]["endpoint"]}])
        self.assertGreater(live["max"], 1)
        self.assertLessEqual(live["max"], web_push_service.WEB_PUSH_CONCURRENCY)
        self.assertLess(elapsed, 1.5, f"web push still sequential ({elapsed:.2f}s)")


if __name__ == "__main__":
    unittest.main()
