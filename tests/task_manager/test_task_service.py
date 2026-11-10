"""Serial, department capture, delegation chain, transitions, logging."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from mongomock_motor import AsyncMongoMockClient

from app.core.tenant import TenantDB
from app.database import db_instance
from app.services import task_service
from tests.task_manager.conftest import (
    ADMIN,
    LEAD_CONTENT,
    LEAD_WEB,
    MEMBER_C1,
    MEMBER_C2,
    MEMBER_WEB,
)


class TaskServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        self.db = TenantDB(self.raw)
        for u in (ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_C2, LEAD_WEB, MEMBER_WEB):
            await self.raw.users.insert_one(dict(u))
        self._notify = patch("app.services.task_notifications.notify_assigned", new_callable=AsyncMock)
        self._notify.start()
        self._notify2 = patch("app.services.task_notifications.notify_delegated", new_callable=AsyncMock)
        self._notify2.start()
        self._notify3 = patch("app.services.task_notifications.notify_review_requested", new_callable=AsyncMock)
        self._notify3.start()
        self._notify4 = patch("app.services.task_notifications.notify_completed", new_callable=AsyncMock)
        self._notify4.start()
        self._notify5 = patch("app.services.task_notifications.notify_sent_back", new_callable=AsyncMock)
        self._notify5.start()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    async def test_serial_sequential_and_isolated(self):
        a = await task_service.create_task(self.db, {"title": "One", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        b = await task_service.create_task(self.db, {"title": "Two", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        self.assertEqual(a["serial"], "T-0001")
        self.assertEqual(b["serial"], "T-0002")
        self.assertNotEqual(a["id"], b["id"])

    async def test_department_auto_capture(self):
        t = await task_service.create_task(self.db, {"title": "Copy", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        self.assertEqual(t["department"], "Content")

    async def test_delegation_chain(self):
        t = await task_service.create_task(self.db, {"title": "Landing", "assignee_id": LEAD_WEB["id"]}, LEAD_CONTENT)
        t = await task_service.assign_task(self.db, t["id"], MEMBER_WEB["id"], LEAD_WEB)
        self.assertEqual(len(t["assignment_chain"]), 2)
        self.assertIn(LEAD_CONTENT["id"], t["involved_ids"])
        self.assertIn(LEAD_WEB["id"], t["involved_ids"])
        self.assertIn(MEMBER_WEB["id"], t["involved_ids"])
        self.assertEqual(t["assigner_id"], LEAD_WEB["id"])
        from app.services.task_access import can_edit, can_view

        self.assertTrue(can_view(LEAD_CONTENT, t))
        self.assertFalse(can_edit(LEAD_CONTENT, t))

    async def test_submit_approve_and_send_back(self):
        t = await task_service.create_task(self.db, {"title": "Work", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        t = await task_service.change_stage(self.db, t["id"], "in_progress", MEMBER_C1)
        t = await task_service.change_stage(self.db, t["id"], "in_review", MEMBER_C1)
        self.assertEqual(t["status"], "in_review")
        with self.assertRaises(Exception):
            await task_service.change_stage(self.db, t["id"], "in_progress", LEAD_CONTENT)
        t = await task_service.change_stage(self.db, t["id"], "in_progress", LEAD_CONTENT, reason="fix tone")
        self.assertEqual(t["status"], "in_progress")
        t = await task_service.change_stage(self.db, t["id"], "in_review", MEMBER_C1)
        t = await task_service.change_stage(self.db, t["id"], "completed", LEAD_CONTENT)
        self.assertEqual(t["status"], "completed")

    async def test_self_assigned_skips_review(self):
        t = await task_service.create_task(self.db, {"title": "Self", "assignee_id": MEMBER_C1["id"]}, MEMBER_C1)
        t = await task_service.change_stage(self.db, t["id"], "in_progress", MEMBER_C1)
        t = await task_service.change_stage(self.db, t["id"], "completed", MEMBER_C1)
        self.assertEqual(t["status"], "completed")

    async def test_logging_created_assigned(self):
        t = await task_service.create_task(self.db, {"title": "Log me", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        acts = await self.raw.task_activities.find({"task_id": t["id"]}).to_list(20)
        types = {a["type"] for a in acts}
        self.assertIn("created", types)
        self.assertIn("assigned", types)

    async def test_member_cannot_assign_other_dept(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            await task_service.create_task(self.db, {"title": "Nope", "assignee_id": MEMBER_WEB["id"]}, MEMBER_C1)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_checklist_progress(self):
        t = await task_service.create_task(self.db, {"title": "Check", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        t = await task_service.add_checklist_item(self.db, t["id"], "A", MEMBER_C1)
        t = await task_service.add_checklist_item(self.db, t["id"], "B", MEMBER_C1)
        item_id = t["checklist"][0]["id"]
        t = await task_service.patch_checklist_item(self.db, t["id"], item_id, {"done": True}, MEMBER_C1)
        self.assertEqual(t["progress"], 50)

    async def test_stage_counts_ignore_stage_filter(self):
        await task_service.create_task(self.db, {"title": "A", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        t = await task_service.create_task(self.db, {"title": "B", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        await task_service.change_stage(self.db, t["id"], "in_progress", MEMBER_C1)
        listed = await task_service.list_tasks(self.db, LEAD_CONTENT, stage="todo", limit=500)
        self.assertGreaterEqual(listed["stage_counts"]["todo"], 1)
        self.assertGreaterEqual(listed["stage_counts"]["in_progress"], 1)

    async def test_get_task_hides_unviewable_subtasks(self):
        parent = await task_service.create_task(self.db, {"title": "Parent", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        await task_service.create_task(
            self.db,
            {"title": "Visible sub", "assignee_id": MEMBER_C1["id"], "parent_id": parent["id"]},
            LEAD_CONTENT,
        )
        hidden = await task_service.create_task(
            self.db, {"title": "Hidden sub", "assignee_id": MEMBER_WEB["id"]}, LEAD_WEB
        )
        await self.raw.tasks.update_one({"id": hidden["id"]}, {"$set": {"parent_id": parent["id"]}})
        got = await task_service.get_task(self.db, parent["id"], MEMBER_C1)
        titles = {s["title"] for s in got.get("subtasks") or []}
        self.assertIn("Visible sub", titles)
        self.assertNotIn("Hidden sub", titles)
        self.assertEqual(got["subtasks_count"], len(got["subtasks"]))

    async def test_reassign_completed_requires_reopen(self):
        from fastapi import HTTPException

        t = await task_service.create_task(self.db, {"title": "Done", "assignee_id": MEMBER_C1["id"]}, MEMBER_C1)
        t = await task_service.change_stage(self.db, t["id"], "in_progress", MEMBER_C1)
        t = await task_service.change_stage(self.db, t["id"], "completed", MEMBER_C1)
        with self.assertRaises(HTTPException) as ctx:
            await task_service.assign_task(self.db, t["id"], MEMBER_C2["id"], MEMBER_C1)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Reopen", str(ctx.exception.detail))
