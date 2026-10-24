"""Notification panel visibility for admin / HR / operations in multi-company mode.

Throwaway Mongo only (name contains 'test'); outbound network blocked.
"""
from __future__ import annotations

import os
import socket
import sys
import unittest
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test-secret-key-notifications-0123456789ab")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx

from app.config import settings
from app.core.security import claims_with_session, create_access_token
from app.database import connect_to_mongo
from app.main import app

TEST_DB = "reamarc_test_notifications_fix"
CID = "company_test_nf"
OTHER_CID = "company_test_nf_other"

_real_connect = socket.socket.connect


def _loopback_only(self, addr, *a, **k):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *a, **k)
    raise OSError("outbound blocked in tests")


# Founder first: on main only the FIRST membership in a company could see notifications.
ROLES = {"nf_founder": "team_member", "nf_emp1": "team_member", "nf_adm": "admin", "nf_hr1": "hr", "nf_ops1": "operations"}


class TestNotificationsPanel(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        for p in (
            mock.patch.object(socket.socket, "connect", new=_loopback_only),
            mock.patch.object(settings, "MULTI_COMPANY_ENABLED", True),
            mock.patch("app.services.push_service.send_expo_push", new=mock.AsyncMock(return_value=0)),
            mock.patch("app.services.web_push_service.send_web_push", new=mock.AsyncMock(return_value=0)),
        ):
            p.start()
            self.addCleanup(p.stop)
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in TEST_DB
        await connect_to_mongo()
        from app.database import db_instance

        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        from app.core.limiter import limiter

        limiter.enabled = False
        self.companies = {}
        self.users = {}
        for cid in (CID, OTHER_CID):
            c = {"id": cid, "name": cid, "slug": cid, "status": "active", "token_version": 0}
            self.companies[cid] = c
            await self.db.companies.insert_one(dict(c))
        for uid, role in ROLES.items():
            u = {"id": uid, "email": f"{uid}@reamarc-test.com", "full_name": uid, "name": uid, "role": role,
                 "is_active": True, "company_id": CID, "session_epoch": 0, "workspace_ids": [], "departments": ["ops"],
                 "primary_department": "ops", "refresh_jtis": [f"web-{uid}"], "refresh_retired": []}
            m = {"id": f"m_{uid}", "user_id": uid, "company_id": CID, "status": "active", "role": role,
                 "workspace_ids": [], "token_version": 0, "primary_department": "ops", "departments": ["ops"]}
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            self.users[uid] = (u, m, CID)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        from app.database import db_instance

        await db_instance.client.drop_database(TEST_DB)
        db_instance.client = None
        db_instance.db = None

    def _auth(self, uid):
        u, m, cid = self.users[uid]
        base = {"sub": uid, "email": u["email"], "name": u["full_name"], "role": u["role"], "cid": cid,
                "workspace_ids": [], "mid": m["id"], "mtv": 0}
        c = claims_with_session(u, base, company_doc=self.companies[cid], membership_doc=m)
        return {"Authorization": f"Bearer {create_access_token(dict(c, sid=f'web-{uid}'))}",
                "X-Requested-With": "XMLHttpRequest"}

    async def _panel(self, uid):
        r = await self.client.get("/api/v1/mobile/notifications?limit=30", headers=self._auth(uid))
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    async def _in_company(self, coro_fn):
        from app.core.tenant import TenantContext, set_tenant_context, reset_tenant_context
        tok = set_tenant_context(TenantContext(company_id=CID))
        try:
            return await coro_fn()
        finally:
            reset_tenant_context(tok)

    async def test_check_in_alert_reaches_admin_hr_ops(self):
        from app.services import push_service

        async def go():
            ids = await push_service.resolve_attendance_alert_recipients("nf_emp1", "team_member")
            await push_service.dispatch_to_users(ids, "emp1 checked in", "on time", kind="attendance_check_in",
                                                 sender_id="nf_emp1", sender_role="team_member")
            return ids
        ids = await self._in_company(go)
        self.assertEqual(sorted(ids), ["nf_adm", "nf_hr1", "nf_ops1"])
        for uid in ("nf_adm", "nf_hr1", "nf_ops1"):
            kinds = [r.get("kind") for r in await self._panel(uid)]
            self.assertEqual(kinds, ["attendance_check_in"], uid)

    async def test_general_alerts_stored_for_hr_ops_admin_keeps_its_limit(self):
        from app.services import push_service

        async def go():
            for uid in ("nf_adm", "nf_hr1", "nf_ops1"):
                for k in ("leave_request", "custom", "attendance_check_out"):
                    await push_service.store_notification(uid, f"t {k}", "b", k)
        await self._in_company(go)
        for uid in ("nf_hr1", "nf_ops1"):
            kinds = sorted(r.get("kind") for r in await self._panel(uid))
            self.assertEqual(kinds, ["attendance_check_out", "custom", "leave_request"], uid)
        # Admin panel is intentionally limited to punches + CRM SLA (74e03d1).
        self.assertEqual([r.get("kind") for r in await self._panel("nf_adm")], ["attendance_check_out"])

    async def test_existing_notifications_reappear(self):
        for uid in ("nf_adm", "nf_hr1", "nf_ops1"):
            await self.db.mobile_notifications.insert_one({
                "id": f"old_{uid}", "user_id": uid, "title": "old", "body": "b", "kind": "attendance_check_in",
                "data": {"company_id": CID}, "company_id": CID, "read": False,
                "created_at": "2026-10-21T10:00:00+00:00"})
        for uid in ("nf_adm", "nf_hr1", "nf_ops1"):
            self.assertEqual([r["id"] for r in await self._panel(uid)], [f"old_{uid}"], uid)

    async def test_other_company_notifications_stay_hidden(self):
        await self.db.mobile_notifications.insert_one({
            "id": "foreign", "user_id": "nf_hr1", "title": "x", "body": "b", "kind": "custom",
            "data": {"company_id": OTHER_CID}, "company_id": OTHER_CID, "read": False,
            "created_at": "2026-10-23T10:00:00+00:00"})
        self.assertEqual(await self._panel("nf_hr1"), [])

    async def test_member_lookup_limit_caps_results_not_scan(self):
        from app.services.company_members import company_member_users

        async def go():
            one = await company_member_users({"id": {"$in": ["nf_ops1"]}}, include_needs_setup=True, limit=1)
            by_role = await company_member_users({"role": "hr"}, limit=1)
            return one, by_role
        one, by_role = await self._in_company(go)
        self.assertEqual([u["id"] for u in one], ["nf_ops1"])
        self.assertEqual([u["id"] for u in by_role], ["nf_hr1"])


if __name__ == "__main__":
    unittest.main()
