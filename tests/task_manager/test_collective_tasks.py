"""Collective tasks: main task owned by a lead + sub-tasks, progress, hours roll-up, daily-log rules.

Local mongomock only. Groq is never called (voice tests use a fake key and patched HTTP).
"""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI, HTTPException
from mongomock_motor import AsyncMongoMockClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.core.tenant import TenantDB, tenant_scope
from app.database import db_instance
from app.routers.tasks import router as tasks_router
from app.schemas.daily_log import DailyLogEntryCreate, DailyLogEntryUpdate
from app.services import task_service
from app.services.task_access import can_view, is_approver
from tests.task_manager.conftest import (
    ADMIN,
    HR,
    LEAD_CONTENT,
    LEAD_WEB,
    MEMBER_C1,
    MEMBER_C2,
    MEMBER_WEB,
    OPS,
    user,
)

def _today() -> str:
    from datetime import datetime
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo("Asia/Karachi")).strftime("%Y-%m-%d")


MEMBER_WEB2 = user("member.web2", "team_member", "Website")
EVERYONE = (ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_C2, LEAD_WEB, MEMBER_WEB, MEMBER_WEB2, HR, OPS)


def _patch_notifications():
    names = [
        "dispatch_task_event",
        "notify_assigned",
        "notify_delegated",
        "notify_reassigned",
        "notify_review_requested",
        "notify_completed",
        "notify_sent_back",
        "notify_reopened",
        "notify_cancelled",
        "notify_updated",
    ]
    for n in names:
        patch(f"app.services.task_notifications.{n}", new_callable=AsyncMock).start()
    patch("app.services.task_service.ensure_task_indexes", new_callable=AsyncMock).start()


class _Base(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        for u in EVERYONE:
            await self.raw.users.insert_one(dict(u))
        _patch_notifications()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    async def _collective(self, actor=ADMIN, lead=LEAD_WEB, subs=None):
        subs = subs or [
            {"title": "Build landing page", "assignee_id": MEMBER_WEB["id"]},
            {"title": "Wire contact form", "assignee_id": MEMBER_WEB2["id"]},
            {"title": "Write page copy", "assignee_id": MEMBER_C1["id"]},
        ]
        return await task_service.create_collective(
            self.raw,
            {"main": {"title": "ZEM launch", "assignee_id": lead["id"], "priority": "high"}, "subtasks": subs},
            actor,
        )

    async def _approve(self, sub, member, approver):
        await task_service.change_stage(self.raw, sub["id"], "in_progress", member)
        await task_service.change_stage(self.raw, sub["id"], "in_review", member)
        return await task_service.change_stage(self.raw, sub["id"], "completed", approver)


class CollectiveCreateTests(_Base):
    async def test_admin_creates_main_and_subtasks(self):
        main = await self._collective()
        self.assertEqual(main["assignee_id"], LEAD_WEB["id"])
        self.assertEqual(main["subtasks_count"], 3)
        self.assertEqual(main["subtask_progress"], 0)
        subs = await self.raw.tasks.find({"parent_id": main["id"]}).to_list(10)
        self.assertEqual(len(subs), 3)
        serials = {s["serial"] for s in subs} | {main["serial"]}
        self.assertEqual(len(serials), 4)
        for s in subs:
            self.assertEqual(s["lead_owner_id"], LEAD_WEB["id"])
            self.assertIn(LEAD_WEB["id"], s["involved_ids"])
        self.assertIsNone((await self.raw.tasks.find_one({"id": main["id"]}))["lead_owner_id"])

    async def test_lead_creates_for_own_department(self):
        main = await self._collective(
            actor=LEAD_WEB,
            subs=[
                {"title": "Page", "assignee_id": MEMBER_WEB["id"]},
                {"title": "Copy", "assignee_id": LEAD_CONTENT["id"]},
            ],
        )
        self.assertEqual(main["subtasks_count"], 2)

    async def test_lead_cannot_assign_other_department_member(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._collective(
                actor=LEAD_WEB,
                subs=[{"title": "Copy", "assignee_id": MEMBER_C1["id"]}],
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(await self.raw.tasks.count_documents({}), 0)

    async def test_hr_and_ops_cannot_be_assignees(self):
        for bad in (HR, OPS):
            with self.assertRaises(HTTPException) as ctx:
                await self._collective(subs=[{"title": "x", "assignee_id": bad["id"]}])
            self.assertIn(ctx.exception.status_code, (403, 422))
        self.assertEqual(await self.raw.tasks.count_documents({}), 0)

    async def test_lead_cannot_make_other_department_admin_the_lead_owner(self):
        # Lead-to-lead across departments only: a lead may not hand the main task to an admin outside their department.
        with self.assertRaises(HTTPException) as ctx:
            await self._collective(
                actor=LEAD_CONTENT,
                lead=ADMIN,
                subs=[{"title": "Copy", "assignee_id": MEMBER_C1["id"]}],
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(await self.raw.tasks.count_documents({}), 0)

    async def test_member_cannot_create_collective(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._collective(actor=MEMBER_WEB)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_main_must_go_to_a_lead(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._collective(lead=MEMBER_WEB)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(await self.raw.tasks.count_documents({}), 0)

    async def test_unknown_assignee_rejected_before_any_write(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._collective(subs=[{"title": "x", "assignee_id": "ghost"}])
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(await self.raw.tasks.count_documents({}), 0)

    async def test_member_cannot_add_subtask_to_others_main(self):
        main = await self._collective()
        with self.assertRaises(HTTPException) as ctx:
            await task_service.create_task(
                self.raw, {"title": "sneak", "assignee_id": MEMBER_WEB["id"], "parent_id": main["id"]}, MEMBER_WEB
            )
        self.assertIn(ctx.exception.status_code, (403, 404))

    async def test_department_lead_who_does_not_own_task_cannot_add_subtask(self):
        # LEAD_WEB can see this Website task (department visibility) but neither owns nor assigned it.
        plain = await task_service.create_task(
            self.raw, {"title": "Plain", "assignee_id": MEMBER_WEB2["id"]}, ADMIN
        )
        self.assertTrue(can_view(LEAD_WEB, await self.raw.tasks.find_one({"id": plain["id"]}), None))
        with self.assertRaises(HTTPException) as ctx:
            await task_service.create_task(
                self.raw, {"title": "sneak", "assignee_id": MEMBER_WEB["id"], "parent_id": plain["id"]}, LEAD_WEB
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_lead_adds_subtask_later_gets_lead_owner(self):
        main = await self._collective()
        sub = await task_service.create_task(
            self.raw, {"title": "Extra", "assignee_id": MEMBER_WEB["id"], "parent_id": main["id"]}, LEAD_WEB
        )
        self.assertEqual(sub["lead_owner_id"], LEAD_WEB["id"])


class VisibilityTests(_Base):
    async def test_member_sees_only_own_subtask(self):
        main = await self._collective()
        listing = await task_service.list_tasks(self.raw, MEMBER_WEB)
        ids = {t["id"] for t in listing["items"]}
        mine = await self.raw.tasks.find_one({"parent_id": main["id"], "assignee_id": MEMBER_WEB["id"]})
        self.assertEqual(ids, {mine["id"]})
        with self.assertRaises(HTTPException) as ctx:
            await task_service.get_task(self.raw, main["id"], MEMBER_WEB)
        self.assertEqual(ctx.exception.status_code, 404)
        other = await self.raw.tasks.find_one({"parent_id": main["id"], "assignee_id": MEMBER_WEB2["id"]})
        with self.assertRaises(HTTPException):
            await task_service.get_task(self.raw, other["id"], MEMBER_WEB)
        detail = await task_service.get_task(self.raw, mine["id"], MEMBER_WEB)
        self.assertEqual(detail["parent"]["serial"], main["serial"])
        self.assertNotIn("subtasks_logged_hours", detail)

    async def test_lead_sees_all_subtasks_including_other_department(self):
        main = await self._collective()
        detail = await task_service.get_task(self.raw, main["id"], LEAD_WEB)
        self.assertEqual(len(detail["subtasks"]), 3)
        content_sub = next(s for s in detail["subtasks"] if s["assignee_id"] == MEMBER_C1["id"])
        self.assertTrue(can_view(LEAD_WEB, content_sub))

    async def test_reassigning_main_moves_lead_owner(self):
        main = await self._collective()
        await task_service.assign_task(self.raw, main["id"], LEAD_CONTENT["id"], ADMIN)
        subs = await self.raw.tasks.find({"parent_id": main["id"]}).to_list(10)
        for s in subs:
            self.assertEqual(s["lead_owner_id"], LEAD_CONTENT["id"])
            self.assertIn(LEAD_CONTENT["id"], s["involved_ids"])
        web_only = next(s for s in subs if s["assignee_id"] == MEMBER_WEB["id"])
        self.assertFalse(can_view(LEAD_WEB, {**web_only, "department": "Other"}))


class ProgressAndGateTests(_Base):
    async def test_progress_counts_completed_over_open(self):
        main = await self._collective()
        subs = await self.raw.tasks.find({"parent_id": main["id"]}).to_list(10)
        web = next(s for s in subs if s["assignee_id"] == MEMBER_WEB["id"])
        await self._approve(web, MEMBER_WEB, LEAD_WEB)
        listing = await task_service.list_tasks(self.raw, LEAD_WEB, parent_id="none")
        row = next(t for t in listing["items"] if t["id"] == main["id"])
        self.assertEqual((row["subtasks_done"], row["subtasks_count"], row["subtask_progress"]), (1, 3, 33))
        content = next(s for s in subs if s["assignee_id"] == MEMBER_C1["id"])
        await task_service.cancel_task(self.raw, content["id"], "not needed", ADMIN)
        detail = await task_service.get_task(self.raw, main["id"], LEAD_WEB)
        self.assertEqual((detail["subtasks_done"], detail["subtasks_count"], detail["subtask_progress"]), (1, 2, 50))
        self.assertEqual(detail["progress"], 0)

    async def test_member_can_move_own_subtask_and_lead_owner_approves(self):
        main = await self._collective()
        sub = await self.raw.tasks.find_one({"parent_id": main["id"], "assignee_id": MEMBER_C1["id"]})
        self.assertTrue(is_approver(LEAD_WEB, sub))
        self.assertFalse(is_approver(MEMBER_C1, sub))
        done = await self._approve(sub, MEMBER_C1, LEAD_WEB)
        self.assertEqual(done["status"], "completed")

    async def test_member_cannot_complete_own_subtask_or_touch_main(self):
        main = await self._collective()
        sub = await self.raw.tasks.find_one({"parent_id": main["id"], "assignee_id": MEMBER_WEB["id"]})
        await task_service.change_stage(self.raw, sub["id"], "in_progress", MEMBER_WEB)
        await task_service.change_stage(self.raw, sub["id"], "in_review", MEMBER_WEB)
        with self.assertRaises(HTTPException):
            await task_service.change_stage(self.raw, sub["id"], "completed", MEMBER_WEB)
        with self.assertRaises(HTTPException) as ctx:
            await task_service.change_stage(self.raw, main["id"], "completed", MEMBER_WEB)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_lead_cannot_close_main_before_all_subtasks_done(self):
        main = await self._collective()
        await task_service.change_stage(self.raw, main["id"], "in_progress", LEAD_WEB)
        for dest, actor in (("in_review", LEAD_WEB), ("in_review", ADMIN), ("completed", ADMIN), ("completed", LEAD_WEB)):
            with self.assertRaises(HTTPException) as ctx:
                await task_service.change_stage(self.raw, main["id"], dest, actor)
            self.assertEqual(ctx.exception.status_code, 422)
            if actor is ADMIN or dest == "in_review":
                self.assertIn("sub-task", ctx.exception.detail)
        res = await task_service.batch_update(self.raw, [{"id": main["id"], "stage": "completed"}], ADMIN)
        self.assertFalse(res[0]["ok"])

    async def test_all_done_main_stays_open_then_lead_closes(self):
        main = await self._collective(
            subs=[
                {"title": "Page", "assignee_id": MEMBER_WEB["id"]},
                {"title": "Copy", "assignee_id": MEMBER_C1["id"]},
            ]
        )
        subs = await self.raw.tasks.find({"parent_id": main["id"]}).to_list(10)
        for s in subs:
            member = MEMBER_WEB if s["assignee_id"] == MEMBER_WEB["id"] else MEMBER_C1
            await self._approve(s, member, LEAD_WEB)
        still = await self.raw.tasks.find_one({"id": main["id"]})
        self.assertEqual(still["status"], "todo")
        await task_service.change_stage(self.raw, main["id"], "in_progress", LEAD_WEB)
        reviewed = await task_service.change_stage(self.raw, main["id"], "in_review", LEAD_WEB)
        self.assertEqual(reviewed["status"], "in_review")
        closed = await task_service.change_stage(self.raw, main["id"], "completed", ADMIN)
        self.assertEqual(closed["status"], "completed")

    async def test_tasks_without_subtasks_unaffected(self):
        t = await task_service.create_task(self.raw, {"title": "Solo", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        await task_service.change_stage(self.raw, t["id"], "in_progress", MEMBER_C1)
        out = await task_service.change_stage(self.raw, t["id"], "in_review", MEMBER_C1)
        self.assertEqual(out["status"], "in_review")
        listing = await task_service.list_tasks(self.raw, LEAD_CONTENT)
        row = next(r for r in listing["items"] if r["id"] == t["id"])
        self.assertIsNone(row["subtask_progress"])
        self.assertNotIn("own_logged_hours", row)


class HoursRollupTests(_Base):
    async def test_main_hours_include_subtasks_in_one_aggregate(self):
        main = await self._collective()
        subs = await self.raw.tasks.find({"parent_id": main["id"]}).to_list(10)
        await self.raw.daily_log_entries.insert_many(
            [
                {"id": "l1", "task_id": main["id"], "user_id": LEAD_WEB["id"], "hours_utilized": 1.0},
                {"id": "l2", "task_id": subs[0]["id"], "user_id": subs[0]["assignee_id"], "hours_utilized": 2.5},
                {"id": "l3", "task_id": subs[1]["id"], "user_id": subs[1]["assignee_id"], "hours_utilized": 0.5},
            ]
        )
        calls = {"n": 0}
        coll_cls = type(self.raw.daily_log_entries)
        real = coll_cls.aggregate

        def counting(this, *a, **k):
            if getattr(this, "name", "") == "daily_log_entries":
                calls["n"] += 1
            return real(this, *a, **k)

        with patch.object(coll_cls, "aggregate", new=counting):
            listing = await task_service.list_tasks(self.raw, LEAD_WEB)
        self.assertEqual(calls["n"], 1)
        rows = {r["id"]: r for r in listing["items"]}
        self.assertEqual(rows[main["id"]]["logged_hours"], 4.0)
        self.assertEqual(rows[main["id"]]["own_logged_hours"], 1.0)
        self.assertEqual(rows[main["id"]]["subtasks_logged_hours"], 3.0)
        self.assertEqual(rows[subs[0]["id"]]["logged_hours"], 2.5)
        detail = await task_service.get_task(self.raw, main["id"], LEAD_WEB)
        self.assertEqual(detail["logged_hours"], 4.0)


class DailyLogSecurityTests(_Base):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        patch("app.routers.daily_log.is_tracked", return_value=True).start()
        patch("app.routers.daily_log._schedule_background_score_recompute").start()
        patch(
            "app.services.log_compliance.compute_log_submission_window",
            new_callable=AsyncMock,
            return_value={"is_valid": True, "is_open": True},
        ).start()
        patch("app.services.log_compliance.load_user_day_entries", new_callable=AsyncMock, return_value=[]).start()
        patch(
            "app.services.workdays.classify_date_for_user",
            new_callable=AsyncMock,
            return_value=type("Day", (), {"is_off": False})(),
        ).start()

    async def _log(self, who, task_id, sync=None):
        from app.routers.daily_log import create_entry

        entry = DailyLogEntryCreate(
            date=_today(),
            client_project="Acme",
            task_description="Worked",
            hours_utilized="1.0",
            task_id=task_id,
            sync_task_status=sync,
        )
        return await create_entry(entry, current_user=dict(who))

    async def test_member_logs_on_own_subtask_and_it_rolls_up(self):
        main = await self._collective()
        sub = await self.raw.tasks.find_one({"parent_id": main["id"], "assignee_id": MEMBER_WEB["id"]})
        entry = await self._log(MEMBER_WEB, sub["id"])
        self.assertEqual(entry["task_serial"], sub["serial"])
        self.assertEqual(entry["user_id"], MEMBER_WEB["id"])
        detail = await task_service.get_task(self.raw, main["id"], LEAD_WEB)
        self.assertEqual(detail["logged_hours"], 1.0)

    async def test_member_cannot_log_on_someone_elses_subtask(self):
        main = await self._collective()
        other = await self.raw.tasks.find_one({"parent_id": main["id"], "assignee_id": MEMBER_WEB2["id"]})
        with self.assertRaises(HTTPException) as ctx:
            await self._log(MEMBER_WEB, other["id"], "completed")
        self.assertIn(ctx.exception.status_code, (403, 404))
        self.assertEqual((await self.raw.tasks.find_one({"id": other["id"]}))["status"], "todo")
        self.assertEqual(await self.raw.daily_log_entries.count_documents({}), 0)

    async def test_member_cannot_complete_main_via_daily_log(self):
        main = await self._collective()
        with self.assertRaises(HTTPException):
            await self._log(MEMBER_WEB, main["id"], "completed")
        self.assertEqual((await self.raw.tasks.find_one({"id": main["id"]}))["status"], "todo")

    async def test_lead_owner_logs_on_main_but_cannot_close_early(self):
        main = await self._collective()
        entry = await self._log(LEAD_WEB, main["id"])
        self.assertEqual(entry["task_id"], main["id"])
        with self.assertRaises(HTTPException) as ctx:
            await self._log(LEAD_WEB, main["id"], "completed")
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual((await self.raw.tasks.find_one({"id": main["id"]}))["status"], "todo")

    async def test_member_completed_log_goes_to_review_not_completed(self):
        t = await task_service.create_task(self.raw, {"title": "Solo", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        await self._log(MEMBER_C1, t["id"], "completed")
        self.assertEqual((await self.raw.tasks.find_one({"id": t["id"]}))["status"], "in_review")
        await self._log(MEMBER_C1, t["id"], "completed")
        self.assertEqual((await self.raw.tasks.find_one({"id": t["id"]}))["status"], "in_review")
        await self._log(MEMBER_C1, t["id"], "in_progress")
        self.assertEqual((await self.raw.tasks.find_one({"id": t["id"]}))["status"], "in_review")

    async def test_self_assigned_lead_completes_in_one_step(self):
        t = await task_service.create_task(self.raw, {"title": "Own", "assignee_id": LEAD_CONTENT["id"]}, LEAD_CONTENT)
        await self._log(LEAD_CONTENT, t["id"], "completed")
        self.assertEqual((await self.raw.tasks.find_one({"id": t["id"]}))["status"], "completed")

    async def test_incomplete_log_starts_todo_task(self):
        t = await task_service.create_task(self.raw, {"title": "Solo", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        await self._log(MEMBER_C1, t["id"], "in_progress")
        self.assertEqual((await self.raw.tasks.find_one({"id": t["id"]}))["status"], "in_progress")

    async def test_spoofed_serial_is_replaced(self):
        t = await task_service.create_task(self.raw, {"title": "Solo", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        from app.routers.daily_log import create_entry

        entry = DailyLogEntryCreate(
            date=_today(), client_project="Acme", task_description="w", hours_utilized="1.0", task_id=t["id"], task_serial="T-9999"
        )
        out = await create_entry(entry, current_user=dict(MEMBER_C1))
        self.assertEqual(out["task_serial"], t["serial"])

    async def test_update_cannot_relink_to_someone_elses_task(self):
        from app.routers.daily_log import update_entry

        mine = await task_service.create_task(self.raw, {"title": "Mine", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        theirs = await task_service.create_task(self.raw, {"title": "Theirs", "assignee_id": MEMBER_C2["id"]}, LEAD_CONTENT)
        entry = await self._log(MEMBER_C1, mine["id"])
        with patch("app.routers.daily_log._can_mutate_daily_log", return_value=True):
            with self.assertRaises(HTTPException) as ctx:
                await update_entry(entry["id"], DailyLogEntryUpdate(task_id=theirs["id"], sync_task_status="completed"), current_user=dict(MEMBER_C1))
        self.assertIn(ctx.exception.status_code, (403, 404))
        self.assertEqual((await self.raw.tasks.find_one({"id": theirs["id"]}))["status"], "todo")

    async def test_update_sync_uses_stage_rules(self):
        from app.routers.daily_log import update_entry

        mine = await task_service.create_task(self.raw, {"title": "Mine", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        entry = await self._log(MEMBER_C1, mine["id"])
        with patch("app.routers.daily_log._can_mutate_daily_log", return_value=True):
            await update_entry(entry["id"], DailyLogEntryUpdate(sync_task_status="completed"), current_user=dict(MEMBER_C1))
        self.assertEqual((await self.raw.tasks.find_one({"id": mine["id"]}))["status"], "in_review")

    async def test_hr_cannot_log_on_tasks(self):
        t = await task_service.create_task(self.raw, {"title": "Solo", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        with self.assertRaises(HTTPException) as ctx:
            await self._log(HR, t["id"])
        self.assertEqual(ctx.exception.status_code, 404)


class CollectiveApiTests(_Base):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.actor = dict(ADMIN)
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(tasks_router, prefix="/api/v1")

        async def _user():
            return self.actor

        self.app.dependency_overrides[get_current_user] = _user

    async def _ac(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def test_post_collective_and_list(self):
        body = {
            "main": {"title": "ZEM launch", "assignee_id": LEAD_WEB["id"]},
            "subtasks": [
                {"title": "Page", "assignee_id": MEMBER_WEB["id"]},
                {"title": "Copy", "assignee_id": MEMBER_C1["id"]},
            ],
        }
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks/collective", json=body)
            self.assertEqual(res.status_code, 201, res.text)
            main_id = res.json()["id"]
            self.actor = dict(LEAD_WEB)
            res = await ac.get("/api/v1/tasks?parent_id=none")
            row = next(r for r in res.json()["items"] if r["id"] == main_id)
            self.assertEqual(row["subtasks_count"], 2)
            self.assertEqual(row["subtask_progress"], 0)

    async def test_validation_limits(self):
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks/collective", json={"main": {"title": "x"}, "subtasks": []})
            self.assertEqual(res.status_code, 422)
            many = [{"title": f"s{i}", "assignee_id": MEMBER_WEB["id"]} for i in range(16)]
            res = await ac.post("/api/v1/tasks/collective", json={"main": {"title": "x"}, "subtasks": many})
            self.assertEqual(res.status_code, 422)

    async def test_member_and_hr_forbidden(self):
        body = {"main": {"title": "x", "assignee_id": LEAD_WEB["id"]}, "subtasks": [{"title": "s", "assignee_id": MEMBER_WEB["id"]}]}
        async with await self._ac() as ac:
            self.actor = dict(MEMBER_WEB)
            res = await ac.post("/api/v1/tasks/collective", json=body)
            self.assertEqual(res.status_code, 403)
            self.actor = dict(HR)
            res = await ac.post("/api/v1/tasks/collective", json=body)
            self.assertEqual(res.status_code, 403)
        self.assertEqual(await self.raw.tasks.count_documents({}), 0)

    async def test_member_voice_parse_forbidden(self):
        self.actor = dict(MEMBER_WEB)
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks/voice-parse", json={"text": "create a collective task for the website"})
            self.assertEqual(res.status_code, 403)


class CollectiveTenancyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        self.db = TenantDB(self.raw)
        _patch_notifications()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    async def test_cross_company_ids_rejected(self):
        from app.config import settings

        object.__setattr__(settings, "MULTI_TENANT_ENABLED", True)
        try:
            with tenant_scope(company_id="company_a"):
                for u in (ADMIN, LEAD_WEB, MEMBER_WEB):
                    await self.db.users.insert_one({**u, "company_id": "company_a"})
                main_a = await task_service.create_collective(
                    self.db,
                    {"main": {"title": "A", "assignee_id": LEAD_WEB["id"]}, "subtasks": [{"title": "s", "assignee_id": MEMBER_WEB["id"]}]},
                    ADMIN,
                )
            admin_b = {**ADMIN, "id": "admin.b", "company_id": "company_b"}
            lead_b = {**LEAD_WEB, "id": "lead.b", "company_id": "company_b"}
            with tenant_scope(company_id="company_b"):
                await self.db.users.insert_one(dict(admin_b))
                await self.db.users.insert_one(dict(lead_b))
                with self.assertRaises(HTTPException) as ctx:
                    await task_service.create_collective(
                        self.db,
                        {"main": {"title": "B", "assignee_id": lead_b["id"]}, "subtasks": [{"title": "s", "assignee_id": MEMBER_WEB["id"]}]},
                        admin_b,
                    )
                self.assertEqual(ctx.exception.status_code, 422)
                with self.assertRaises(HTTPException) as ctx:
                    await task_service.create_collective(
                        self.db,
                        {"main": {"title": "B", "assignee_id": LEAD_WEB["id"]}, "subtasks": [{"title": "s", "assignee_id": lead_b["id"]}]},
                        admin_b,
                    )
                self.assertEqual(ctx.exception.status_code, 422)
                with self.assertRaises(HTTPException) as ctx:
                    await task_service.create_task(
                        self.db, {"title": "sneak", "assignee_id": lead_b["id"], "parent_id": main_a["id"]}, admin_b
                    )
                self.assertEqual(ctx.exception.status_code, 404)
                with self.assertRaises(HTTPException) as ctx:
                    await task_service.assert_can_log_on_task(self.db, main_a["id"], admin_b)
                self.assertEqual(ctx.exception.status_code, 404)
        finally:
            object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)


if __name__ == "__main__":
    unittest.main()
