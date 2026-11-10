"""F/G notification titles, recipients, data, and push payload."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from mongomock_motor import AsyncMongoMockClient

from app.database import db_instance
from app.services import task_notifications as tn
from app.services.web_push_service import notification_path
from tests.task_manager.conftest import (
    ADMIN,
    HR,
    LEAD_CONTENT,
    LEAD_WEB,
    MEMBER_C1,
    MEMBER_WEB,
    OPS,
    task_doc,
)


class NotificationEventTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        for u in (ADMIN, LEAD_CONTENT, LEAD_WEB, MEMBER_C1, MEMBER_WEB, HR, OPS):
            await self.raw.users.insert_one(dict(u))
        self.task = task_doc(
            id="tsk_n",
            serial="T-0013",
            title="Landing page",
            creator_id=LEAD_WEB["id"],
            assigner_id=LEAD_CONTENT["id"],
            assignee_id=MEMBER_C1["id"],
            assignee_name="Member Content 1",
            department="Content",
            company_id="company_reamarc",
            assignment_chain=[
                {"from_id": LEAD_WEB["id"], "to_id": LEAD_CONTENT["id"]},
                {"from_id": LEAD_CONTENT["id"], "to_id": MEMBER_C1["id"]},
            ],
            involved_ids=[LEAD_WEB["id"], LEAD_CONTENT["id"], MEMBER_C1["id"]],
        )

    async def asyncTearDown(self):
        db_instance.db = self._prev

    async def _capture(self, coro):
        with patch("app.services.push_service.dispatch_to_users", new_callable=AsyncMock) as mocked:
            await coro
            return mocked

    async def test_assigned(self):
        mocked = await self._capture(tn.notify_assigned(self.task, LEAD_WEB))
        kwargs = mocked.await_args.kwargs
        self.assertEqual(kwargs["kind"], "task_assigned")
        self.assertEqual(kwargs["user_ids"], [MEMBER_C1["id"]])
        self.assertEqual(kwargs["title"], "Lead Web assigned you T-0013")
        self.assertEqual(kwargs["body"], "Landing page")
        self.assertEqual(kwargs["data"]["type"], "task")
        self.assertEqual(kwargs["data"]["event"], "task_assigned")
        self.assertEqual(kwargs["data"]["task_id"], "tsk_n")

    async def test_delegated_reassigned_review_completed_sent_back(self):
        mocked = await self._capture(tn.notify_delegated(self.task, LEAD_CONTENT))
        self.assertIn(LEAD_WEB["id"], mocked.await_args.kwargs["user_ids"])
        self.assertIn("delegated T-0013 to Member Content 1", mocked.await_args.kwargs["title"])

        mocked = await self._capture(tn.notify_reassigned(self.task, LEAD_WEB, old_assignee_id=LEAD_CONTENT["id"]))
        ids = set(mocked.await_args.kwargs["user_ids"])
        self.assertIn(LEAD_CONTENT["id"], ids)
        self.assertIn(MEMBER_C1["id"], ids)
        self.assertIn("reassigned T-0013", mocked.await_args.kwargs["title"])

        extra = [LEAD_CONTENT["id"], LEAD_WEB["id"]]
        mocked = await self._capture(tn.notify_review_requested(self.task, MEMBER_C1, extra=extra))
        self.assertEqual(set(mocked.await_args.kwargs["user_ids"]), {LEAD_CONTENT["id"], LEAD_WEB["id"]})
        self.assertIn("submitted T-0013 for review", mocked.await_args.kwargs["title"])

        mocked = await self._capture(tn.notify_completed(self.task, LEAD_WEB))
        ids = set(mocked.await_args.kwargs["user_ids"])
        self.assertIn(MEMBER_C1["id"], ids)
        self.assertIn(LEAD_CONTENT["id"], ids)
        self.assertNotIn(LEAD_WEB["id"], ids)
        self.assertEqual(mocked.await_args.kwargs["title"], "Lead Web approved T-0013")

        mocked = await self._capture(tn.notify_sent_back(self.task, "Fix tone", LEAD_CONTENT, extra=[LEAD_WEB["id"]]))
        ids = set(mocked.await_args.kwargs["user_ids"])
        self.assertIn(MEMBER_C1["id"], ids)
        self.assertIn(LEAD_WEB["id"], ids)
        self.assertEqual(mocked.await_args.kwargs["body"], "Fix tone")

    async def test_cancelled_comment_mention_truncation(self):
        self.task["cancel_reason"] = "Duplicate"
        mocked = await self._capture(tn.notify_cancelled(self.task, LEAD_WEB))
        self.assertEqual(mocked.await_args.kwargs["body"], "Duplicate")
        preview = "x" * 200
        mocked = await self._capture(tn.notify_comment(self.task, LEAD_WEB, mentioned_ids=[MEMBER_C1["id"]], preview=tn.comment_preview("@[Member Content 1](member.content1) " + preview)))
        self.assertNotIn(MEMBER_C1["id"], mocked.await_args.kwargs["user_ids"])
        self.assertTrue(mocked.await_args.kwargs["body"].endswith("…"))
        self.assertLessEqual(len(mocked.await_args.kwargs["body"]), 141)
        mocked = await self._capture(tn.notify_mention(self.task, [MEMBER_C1["id"]], LEAD_WEB, question=True, preview="q"))
        self.assertIn("asked you a question", mocked.await_args.kwargs["title"])
        self.assertEqual(mocked.await_args.kwargs["user_ids"], [MEMBER_C1["id"]])

    async def test_web_push_path(self):
        self.assertEqual(notification_path("task_assigned", {"task_id": "tsk_n"}), "/tasks?task=tsk_n")
        self.assertEqual(notification_path("task_comment", {}), "/tasks")

    async def test_push_payload_and_hr_exclusion(self):
        from app.services.push_service import dispatch_to_users, filter_allowed_recipients

        with patch(
            "app.services.push_service.company_member_users",
            new_callable=AsyncMock,
            return_value=[dict(HR), dict(ADMIN), dict(MEMBER_C1)],
        ):
            allowed = await filter_allowed_recipients([HR["id"], ADMIN["id"], MEMBER_C1["id"]], "task_assigned", item=self.task)
        self.assertNotIn(HR["id"], allowed)
        self.assertIn(ADMIN["id"], allowed)

        with patch("app.services.push_service.active_devices", new_callable=AsyncMock) as devices, patch(
            "app.services.push_service.send_expo_push", new_callable=AsyncMock, return_value=1
        ) as expo, patch(
            "app.services.web_push_service.send_web_push", new_callable=AsyncMock, return_value=1
        ) as web, patch(
            "app.services.push_service.store_notification", new_callable=AsyncMock
        ), patch(
            "app.services.push_service.filter_allowed_recipients", new_callable=AsyncMock, return_value=[MEMBER_C1["id"]]
        ):
            devices.return_value = [{"user_id": MEMBER_C1["id"], "push_token": "ExponentPushToken[abc]"}]
            data = {"type": "task", "event": "task_assigned", "task_id": "tsk_n", "serial": "T-0013", "company_id": "company_reamarc"}
            await dispatch_to_users(
                user_ids=[MEMBER_C1["id"]],
                title="Lead Web assigned you T-0013",
                body="Landing page",
                kind="task_assigned",
                data=data,
                item=self.task,
            )
            expo.assert_awaited()
            self.assertIn("ExponentPushToken[abc]", expo.await_args.args[0])
            self.assertEqual(expo.await_args.args[1], "Lead Web assigned you T-0013")
            self.assertEqual(expo.await_args.kwargs.get("data") or expo.await_args.args[3], data)
            web.assert_awaited()
