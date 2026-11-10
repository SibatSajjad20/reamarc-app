"""Notification recipient sets and mention parsing."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.services.task_comments import mention_ids, parse_mentions, validate_mentions
from app.services.task_notifications import recipients_for
from tests.task_manager.conftest import LEAD_CONTENT, LEAD_WEB, MEMBER_C1, MEMBER_WEB, task_doc


class RecipientsTests(unittest.TestCase):
    def test_assigned_excludes_actor(self):
        t = task_doc(assignee_id=MEMBER_C1["id"], assigner_id=LEAD_CONTENT["id"])
        self.assertEqual(recipients_for("task_assigned", t, actor_id=LEAD_CONTENT["id"]), [MEMBER_C1["id"]])
        self.assertEqual(recipients_for("task_assigned", t, actor_id=MEMBER_C1["id"]), [])

    def test_overdue_assignee_assigner_creator(self):
        t = task_doc(
            creator_id=LEAD_CONTENT["id"],
            assigner_id=LEAD_WEB["id"],
            assignee_id=MEMBER_WEB["id"],
        )
        got = set(recipients_for("task_overdue", t))
        self.assertEqual(got, {LEAD_CONTENT["id"], LEAD_WEB["id"], MEMBER_WEB["id"]})

    def test_completed_includes_chain(self):
        t = task_doc(
            creator_id=LEAD_CONTENT["id"],
            assigner_id=LEAD_WEB["id"],
            assignee_id=MEMBER_WEB["id"],
            assignment_chain=[
                {"from_id": LEAD_CONTENT["id"], "to_id": LEAD_WEB["id"]},
                {"from_id": LEAD_WEB["id"], "to_id": MEMBER_WEB["id"]},
            ],
            involved_ids=[LEAD_CONTENT["id"], LEAD_WEB["id"], MEMBER_WEB["id"]],
        )
        got = set(recipients_for("task_completed", t, actor_id=LEAD_WEB["id"]))
        self.assertIn(LEAD_CONTENT["id"], got)
        self.assertIn(MEMBER_WEB["id"], got)
        self.assertNotIn(LEAD_WEB["id"], got)

    def test_comment_skips_mentions(self):
        t = task_doc(involved_ids=[LEAD_CONTENT["id"], MEMBER_C1["id"], MEMBER_WEB["id"]])
        got = recipients_for("task_comment", t, actor_id=MEMBER_C1["id"], extra=[LEAD_CONTENT["id"]])
        self.assertNotIn(LEAD_CONTENT["id"], got)
        self.assertNotIn(MEMBER_C1["id"], got)


class MentionTests(unittest.TestCase):
    def test_parse_and_drop_unknown(self):
        text = "@[Lead Content](lead.content) hello @[Ghost](nope)"
        self.assertEqual(parse_mentions(text)[0], ("Lead Content", "lead.content"))
        t = task_doc()
        users = {LEAD_CONTENT["id"]: LEAD_CONTENT}
        kept = validate_mentions(text, MEMBER_C1, t, users, None)
        self.assertEqual(kept, [LEAD_CONTENT["id"]])
        self.assertEqual(mention_ids(text), ["lead.content", "nope"])

    def test_mentions_never_fail_comment(self):
        from app.services.task_comments import validate_mentions
        from tests.task_manager.conftest import MEMBER_WEB

        t = task_doc()
        text = "@[Ghost](nope) @[Web](member.web)"
        kept = validate_mentions(text, MEMBER_C1, t, {MEMBER_WEB["id"]: MEMBER_WEB}, None, add_watchers=None)
        self.assertEqual(kept, [])


class DispatchTests(unittest.IsolatedAsyncioTestCase):
    async def test_dispatch_calls_push(self):
        t = task_doc(assignee_id=MEMBER_C1["id"])
        with patch("app.services.push_service.dispatch_to_users", new_callable=AsyncMock) as mocked:
            from app.services.task_notifications import notify_assigned

            await notify_assigned(t, LEAD_CONTENT)
            mocked.assert_awaited()
            kwargs = mocked.await_args.kwargs
            self.assertEqual(kwargs["kind"], "task_assigned")
            self.assertEqual(kwargs["user_ids"], [MEMBER_C1["id"]])
