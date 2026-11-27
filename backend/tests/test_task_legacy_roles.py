"""Tasks created before assigner_role/assignee_role were stored (Nov 10-13) must still follow
the approval rules: an admin-assigned team lead may approve their own task, members may not,
and a lead assigned by another lead still needs that lead. Roles come from the person's current
role in the same company and are never written back.

In-memory mongomock only: no network, no real database.
"""
from __future__ import annotations

import os
import unittest
from unittest import mock

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("SECRET_KEY", "test-task-legacy-roles-secret-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"

from app.config import settings

CID = "company_legacy_roles"
OTHER = "company_other_legacy"


def _user(uid: str, role: str, dept: str = "Creative") -> dict:
    return {
        "id": uid,
        "email": f"{uid}@legacy-roles.test",
        "full_name": uid,
        "name": uid,
        "role": role,
        "is_active": True,
        "company_id": CID,
        "department": dept,
        "departments": [dept],
        "primary_department": dept,
        "access": {"tasks": True},
    }


ADMIN = _user("lr_admin", "admin")
LEAD = _user("lr_lead", "team_lead")
LEAD2 = _user("lr_lead2", "team_lead", "Content")
MEMBER = _user("lr_member", "team_member")


def _legacy_task(tid: str, assignee: dict, assigner: dict, status: str = "in_review") -> dict:
    """Shape of a task saved before the role snapshot fields existed."""
    return {
        "id": tid,
        "serial": tid.upper(),
        "title": tid,
        "status": status,
        "priority": "medium",
        "company_id": CID,
        "creator_id": assigner["id"],
        "assignee_id": assignee["id"],
        "assignee_name": assignee["id"],
        "assigner_id": assigner["id"],
        "assigner_name": assigner["id"],
        "department": assignee["department"],
        "assignment_chain": [{"from_id": assigner["id"], "to_id": assignee["id"]}],
        "involved_ids": [assigner["id"], assignee["id"]],
        "watcher_ids": [],
        "parent_id": None,
        "created_at": "2026-11-11T10:00:00+00:00",
        "due_date": "2026-11-30",
    }


class _Base(unittest.IsolatedAsyncioTestCase):
    multi = False

    async def asyncSetUp(self):
        from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
        from app.database import db_instance
        from app.services import task_service as svc

        self.raw = AsyncMongoMockClient()[f"reamarc_test_legacy_roles_{id(self)}"]
        patches = [
            mock.patch.object(settings, "MULTI_COMPANY_ENABLED", self.multi),
            mock.patch.object(db_instance, "client", None),
            mock.patch.object(db_instance, "db", self.raw),
            mock.patch("app.core.tenant.get_global_db", return_value=self.raw),
        ]
        for name in ("notify_completed", "notify_review_requested", "notify_sent_back", "notify_reopened"):
            patches.append(mock.patch.object(svc.task_notify, name, mock.AsyncMock()))
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        tok = set_tenant_context(TenantContext(company_id=CID))
        self.addCleanup(reset_tenant_context, tok)
        await self.raw.users.insert_many([dict(u) for u in (ADMIN, LEAD, LEAD2, MEMBER)])
        self.svc = svc

    async def _seed(self, *tasks):
        await self.raw.tasks.insert_many([dict(t) for t in tasks])

    async def _stored(self, tid):
        return await self.raw.tasks.find_one({"id": tid}, {"_id": 0})


class TestLegacyRolesSingleCompany(_Base):
    async def test_admin_assigned_lead_can_approve_own_legacy_task(self):
        await self._seed(_legacy_task("t_lead", LEAD, ADMIN))
        out = await self.svc.change_stage(self.raw, "t_lead", "completed", LEAD)
        self.assertEqual(out["status"], "completed")
        stored = await self._stored("t_lead")
        self.assertEqual(stored["status"], "completed")
        # Fallback is in memory only: the role fields are not persisted.
        self.assertNotIn("assigner_role", stored)
        self.assertNotIn("assignee_role", stored)

    async def test_member_still_cannot_approve_own_legacy_task(self):
        await self._seed(_legacy_task("t_mem", MEMBER, ADMIN))
        with self.assertRaises(HTTPException) as ctx:
            await self.svc.change_stage(self.raw, "t_mem", "completed", MEMBER)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, "You cannot approve your own task")
        self.assertEqual((await self._stored("t_mem"))["status"], "in_review")

    async def test_lead_assigned_by_another_lead_still_needs_that_lead(self):
        await self._seed(_legacy_task("t_l2l", LEAD, LEAD2))
        with self.assertRaises(HTTPException) as ctx:
            await self.svc.change_stage(self.raw, "t_l2l", "completed", LEAD)
        self.assertEqual(ctx.exception.detail, "You cannot approve your own task")
        out = await self.svc.change_stage(self.raw, "t_l2l", "completed", LEAD2)
        self.assertEqual(out["status"], "completed")

    async def test_list_and_detail_expose_roles_with_one_user_lookup(self):
        tasks = [_legacy_task(f"t_list{i}", LEAD, ADMIN) for i in range(5)]
        tasks.append(_legacy_task("t_list_mem", MEMBER, ADMIN))
        stamped = _legacy_task("t_stamped", LEAD, ADMIN)
        stamped.update(assigner_role="team_lead", assignee_role="team_member")
        tasks.append(stamped)
        await self._seed(*tasks)
        real = self.svc.company_member_users
        calls = []

        async def counting(*args, **kwargs):
            calls.append((args, kwargs))
            return await real(*args, **kwargs)

        with mock.patch.object(self.svc, "company_member_users", counting):
            listing = await self.svc.list_tasks(self.raw, LEAD, limit=50)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1].get("projection"), {"_id": 0, "id": 1, "role": 1})
        by_id = {t["id"]: t for t in listing["items"]}
        self.assertEqual(by_id["t_list0"]["assigner_role"], "admin")
        self.assertEqual(by_id["t_list0"]["assignee_role"], "team_lead")
        self.assertEqual(by_id["t_list_mem"]["assignee_role"], "team_member")
        # Stored snapshots win over the current role.
        self.assertEqual(by_id["t_stamped"]["assigner_role"], "team_lead")
        self.assertEqual(by_id["t_stamped"]["assignee_role"], "team_member")

        detail = await self.svc.get_task(self.raw, "t_list1", LEAD)
        self.assertEqual(detail["assigner_role"], "admin")
        self.assertEqual(detail["assignee_role"], "team_lead")
        self.assertNotIn("assigner_role", await self._stored("t_list1"))

    async def test_daily_log_complete_on_legacy_lead_task_in_review_finishes(self):
        await self._seed(_legacy_task("t_log", LEAD, ADMIN))
        out = await self.svc.sync_stage_from_log(self.raw, "t_log", "completed", LEAD)
        self.assertEqual(out["status"], "completed")


class TestLegacyRolesMultiCompany(_Base):
    multi = True

    async def asyncSetUp(self):
        await super().asyncSetUp()
        # LEAD and MEMBER belong to this company; the assigner "x_admin" is admin only elsewhere.
        await self.raw.users.insert_one(dict(_user("x_admin", "admin"), company_id=OTHER))
        await self.raw.company_memberships.insert_many([
            {"company_id": CID, "user_id": LEAD["id"], "role": "team_lead", "status": "active",
             "department": "Creative", "primary_department": "Creative", "departments": ["Creative"]},
            {"company_id": CID, "user_id": ADMIN["id"], "role": "admin", "status": "active"},
            {"company_id": OTHER, "user_id": "x_admin", "role": "admin", "status": "active"},
        ])

    async def test_assigner_from_other_company_is_not_used(self):
        await self._seed(_legacy_task("t_x", LEAD, _user("x_admin", "admin")))
        with self.assertRaises(HTTPException) as ctx:
            await self.svc.change_stage(self.raw, "t_x", "completed", LEAD)
        self.assertEqual(ctx.exception.detail, "You cannot approve your own task")
        detail = await self.svc.get_task(self.raw, "t_x", LEAD)
        self.assertNotIn("assigner_role", detail)
        self.assertEqual(detail["assignee_role"], "team_lead")

    async def test_same_company_admin_membership_allows_lead(self):
        await self._seed(_legacy_task("t_in", LEAD, ADMIN))
        out = await self.svc.change_stage(self.raw, "t_in", "completed", LEAD)
        self.assertEqual(out["status"], "completed")


if __name__ == "__main__":
    unittest.main()
