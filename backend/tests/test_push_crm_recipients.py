"""CRM push recipients: sales alerts reach non-admin sales users, stay blocked for admin/owner.

Pure mocks: no Mongo, no Expo, outbound network blocked.
"""
from __future__ import annotations

import os
import socket
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test-secret-key-push-crm-0123456789abcdef")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services import push_service  # noqa: E402

CID = "company_reamarc"
OTHER = "company_other"


def _no_net(self, *a, **k):
    raise OSError("outbound blocked in tests")


def _user(uid, role, cid=CID, sales=True, attendance=False):
    return {"id": uid, "role": role, "company_id": cid, "is_active": True,
            "_sales": sales, "_attendance": attendance}


def _fake_access(u):
    return {"modules": {"sales": bool(u.get("_sales")), "attendance": bool(u.get("_attendance")),
                        "content_calendar": False, "website": False, "ads": False},
            "tracked": {"attendance": bool(u.get("_attendance")), "daily_log": False}}


class TestPushCrmRecipients(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.users = {}
        self.ctx_cid = CID

        async def members(query, **kw):
            ids = query["id"]["$in"]
            return [dict(self.users[i]) for i in ids if i in self.users]

        patches = [
            mock.patch.object(socket.socket, "connect", new=_no_net),
            mock.patch.object(push_service, "get_database", return_value=object()),
            mock.patch.object(push_service, "company_member_users", new=members),
            mock.patch("app.services.access.effective_access", new=_fake_access),
            mock.patch("app.services.access.is_tracked",
                       new=lambda u, m: bool(_fake_access(u)["tracked"].get(m))),
            mock.patch("app.core.tenant.get_tenant_context",
                       new=lambda: SimpleNamespace(company_id=self.ctx_cid) if self.ctx_cid else None),
            mock.patch.object(push_service, "send_expo_push", new=mock.AsyncMock(return_value=0)),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    async def allowed(self, ids, kind, item=None):
        return await push_service.filter_allowed_recipients(ids, kind, item=item)

    async def test_crm_kinds_reach_sales_member(self):
        self.users["ahsan"] = _user("ahsan", "team_member")
        for kind in ("crm_lead", "crm_followup", "crm_deal", "crm_meeting", "CRM_Lead "):
            self.assertEqual(await self.allowed(["ahsan"], kind), ["ahsan"], kind)

    async def test_crm_lead_default_kind_via_notify_users(self):
        from app.services import crm_assignment
        self.users["ahsan"] = _user("ahsan", "team_member")
        with mock.patch.object(push_service, "dispatch_to_users", new=mock.AsyncMock()) as d:
            await crm_assignment.notify_users(["ahsan"], "New CRM lead", "x")
        self.assertEqual(d.call_args.kwargs.get("kind"), "crm_lead")
        self.assertEqual(await self.allowed(["ahsan"], "crm_lead"), ["ahsan"])

    async def test_team_lead_with_sales_gets_crm(self):
        self.users["tl"] = _user("tl", "team_lead")
        self.assertEqual(await self.allowed(["tl"], "crm_followup"), ["tl"])

    async def test_sales_module_off_still_excluded(self):
        self.users["nosales"] = _user("nosales", "team_member", sales=False)
        self.assertEqual(await self.allowed(["nosales"], "crm_lead"), [])

    async def test_admin_owner_blocked_for_crm(self):
        for r in ("admin", "super_admin", "owner"):
            self.users[r] = _user(r, r)
        for kind in ("crm_lead", "crm_followup", "crm_deal", "crm_meeting"):
            self.assertEqual(await self.allowed(["admin", "super_admin", "owner"], kind), [], kind)

    async def test_crm_sla_unchanged(self):
        self.users["adm"] = _user("adm", "admin")
        self.users["ahsan"] = _user("ahsan", "team_member")
        self.users["nosales"] = _user("nosales", "team_member", sales=False)
        self.assertEqual(sorted(await self.allowed(["adm", "ahsan", "nosales"], "crm_sla")), ["adm", "ahsan"])

    async def test_role_judged_in_notification_company(self):
        # Membership overlay: team_lead at home, team_member in reamarc -> judged as reamarc member.
        self.users["multi"] = _user("multi", "team_member", cid=CID)
        self.assertEqual(await self.allowed(["multi"], "crm_lead"), ["multi"])
        # Admin in reamarc (overlay) is blocked even if they are team_member elsewhere.
        self.users["multi_adm"] = _user("multi_adm", "admin", cid=CID)
        self.assertEqual(await self.allowed(["multi_adm"], "crm_lead"), [])

    async def test_other_company_user_dropped_for_crm(self):
        self.users["foreign"] = _user("foreign", "team_member", cid=OTHER)
        self.assertEqual(await self.allowed(["foreign"], "crm_lead"), [])
        self.assertEqual(await self.allowed(["foreign"], "crm_lead", item={"company_id": OTHER}), ["foreign"])

    async def test_no_tenant_context_does_not_drop(self):
        self.ctx_cid = None
        self.users["ahsan"] = _user("ahsan", "team_member")
        self.assertEqual(await self.allowed(["ahsan"], "crm_lead"), ["ahsan"])

    async def test_non_crm_kinds_unchanged(self):
        self.users["adm"] = _user("adm", "admin")
        self.users["emp"] = _user("emp", "team_member", cid=OTHER, attendance=True)
        self.users["emp2"] = _user("emp2", "team_member", attendance=False)
        self.assertEqual(await self.allowed(["adm"], "attendance_check_in"), ["adm"])
        self.assertEqual(await self.allowed(["adm"], "custom"), [])
        # Company check is CRM-only: non-CRM kinds keep previous behaviour.
        self.assertEqual(await self.allowed(["emp", "emp2"], "late_checkin"), ["emp"])
        self.assertEqual(sorted(await self.allowed(["emp", "emp2"], "custom")), ["emp", "emp2"])


if __name__ == "__main__":
    unittest.main()
