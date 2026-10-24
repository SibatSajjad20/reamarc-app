"""UX batch: reminder no longer 500s, compliance has no fake 100%, deactivated members drop out,
new companies get no placeholder workspace, and the cleanup script only touches an empty one.

Throwaway Mongo only (name contains 'test'); email and push are mocked; outbound network blocked.
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import unittest
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test-secret-key-ux-batch-0123456789abcdef")
os.environ["RUN_SCHEDULERS"] = "0"
BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BACKEND)

import httpx

from app.config import settings
from app.core.security import claims_with_session, create_access_token
from app.database import connect_to_mongo
from app.main import app

TEST_DB = "reamarc_test_ux_batch"
CID = "company_test_ux"
DAYS = ["2026-10-19", "2026-10-20", "2026-10-21"]

_real_connect = socket.socket.connect


def _loopback_only(self, addr, *a, **k):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *a, **k)
    raise OSError("outbound blocked in tests")


async def _fixed_workdays(*a, **k):
    return list(DAYS)


async def _no_targets(*a, **k):
    return {}


async def _open_window(**k):
    return {"is_expired": False}


class TestUxBatch(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        for p in (mock.patch.object(socket.socket, "connect", new=_loopback_only),
                  mock.patch("app.services.workdays.recent_company_workdays", new=_fixed_workdays),
                  mock.patch("app.routers.admin.batch_expected_targets", new=_no_targets),
                  mock.patch("app.services.log_compliance.compute_log_submission_window", new=_open_window),
                  mock.patch.object(settings, "MULTI_COMPANY_ENABLED", True)):
            p.start(); self.addCleanup(p.stop)
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in TEST_DB
        await connect_to_mongo()
        from app.database import db_instance
        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        from app.core.limiter import limiter
        limiter.enabled = False
        self.company = {"id": CID, "name": "Test Co", "slug": "testco", "status": "active", "token_version": 0}
        await self.db.companies.insert_one(dict(self.company))
        self.users = {}
        for uid, role, status in (("hr_admin", "admin", "active"), ("worker", "employee", "active"),
                                  ("idle", "employee", "active"), ("leaver", "employee", "inactive")):
            u = {"id": uid, "email": f"{uid}@example.test", "full_name": uid.title(), "name": uid.title(), "role": role,
                 "is_active": True, "company_id": CID, "session_epoch": 0, "workspace_ids": [], "departments": [],
                 "primary_department": None, "refresh_jtis": [f"web-{uid}"], "refresh_retired": []}
            m = {"id": f"m_{uid}", "user_id": uid, "company_id": CID, "status": status, "role": role,
                 "workspace_ids": [], "token_version": 0}
            if status == "inactive":
                m.update(deactivated_at="2026-10-22T00:00:00Z", deactivation_date="2026-10-22")
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            self.users[uid] = (u, m)
        # 'worker' punched in on all three days but logged nothing; 'idle' never punched in.
        for d in DAYS:
            await self.db.attendance_records.insert_one({"company_id": CID, "user_id": "worker", "date": d, "check_in": f"{d}T09:00:00+05:00",
                                                         "check_out": f"{d}T18:00:00+05:00", "status": "present"})
        # 'leaver' has history that must survive deactivation.
        await self.db.daily_log_entries.insert_one({"company_id": CID, "user_id": "leaver", "date": DAYS[0], "resource_name": "Leaver"})
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        from app.database import db_instance
        await db_instance.client.drop_database(TEST_DB)
        db_instance.client = None
        db_instance.db = None

    def _auth(self, uid="hr_admin"):
        u, m = self.users[uid]
        base = {"sub": uid, "email": u["email"], "name": u["full_name"], "role": m["role"], "cid": CID,
                "workspace_ids": [], "mid": m["id"], "mtv": 0}
        c = claims_with_session(u, base, company_doc=self.company, membership_doc=m)
        return {"Authorization": f"Bearer {create_access_token(dict(c, sid=f'web-{uid}'))}", "X-Requested-With": "XMLHttpRequest"}

    async def test_reminder_succeeds_and_reports_channels(self):
        """On main this returned 500 after the email had already gone out (current_user was never injected)."""
        sent = mock.AsyncMock(return_value=True)
        push = mock.AsyncMock(return_value=None)
        with mock.patch("app.routers.admin.EmailService.send_log_reminder", new=sent), \
             mock.patch("app.services.push_service.dispatch_to_users", new=push):
            r = await self.client.post("/api/v1/admin/members/worker/remind", json={}, headers=self._auth())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(sent.await_count, 1)
        body = r.json()
        self.assertTrue(body.get("email_sent"))
        self.assertTrue(body.get("in_app_sent"))

    async def test_reminder_survives_push_failure(self):
        sent = mock.AsyncMock(return_value=True)
        with mock.patch("app.routers.admin.EmailService.send_log_reminder", new=sent), \
             mock.patch("app.services.push_service.dispatch_to_users", new=mock.AsyncMock(side_effect=RuntimeError("push down"))):
            r = await self.client.post("/api/v1/admin/members/worker/remind", json={}, headers=self._auth())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["email_sent"])
        self.assertFalse(r.json()["in_app_sent"])

    async def test_activity_has_no_fake_100_and_hides_deactivated(self):
        r = await self.client.get("/api/v1/admin/members/activity", headers=self._auth())
        self.assertEqual(r.status_code, 200, r.text)
        rows = {row["user_id"]: row for row in r.json()}
        self.assertNotIn("leaver", rows, "deactivated membership must drop out of compliance")
        self.assertEqual(rows["idle"]["days_due"], 0)       # nothing due -> UI shows "No shifts", not 100%
        self.assertEqual(rows["worker"]["days_due"], 3)
        # deactivation keeps history
        self.assertEqual(await self.db.daily_log_entries.count_documents({"user_id": "leaver"}), 1)
        self.assertEqual(await self.db.users.count_documents({"id": "leaver"}), 1)

    async def test_create_company_adds_no_placeholder_workspace(self):
        from app.routers.owner import CompanyCreateRequest, create_company
        body = CompanyCreateRequest(name="Fresh Co", slug="fresh-co", admin_name="Fresh Admin",
                                    admin_email="fresh@reamarc-test.com", admin_password="longpassword1")
        out = await create_company(body, current_user={"id": "owner_1", "is_super_admin": True})
        self.assertEqual(await self.db.workspaces.count_documents({"company_id": out["id"]}), 0)
        self.assertEqual(await self.db.company_memberships.count_documents({"company_id": out["id"]}), 1)

    async def test_cleanup_script_dry_run_then_apply(self):
        await self.db.companies.insert_one({"id": "comp_dv", "name": "DataViz", "slug": "dataviz-test"})
        await self.db.workspaces.insert_many([
            {"id": "ws_empty", "company_id": "comp_dv", "name": "DataViz Workspace", "is_default": True},
            {"id": "ws_used", "company_id": "comp_dv", "name": "Used default", "is_default": True},
            {"id": "ws_real", "company_id": "comp_dv", "name": "Real client"},
        ])
        await self.db.content_calendar_items.insert_one({"id": "cc1", "workspace_id": "ws_used"})
        env = dict(os.environ, MONGODB_URL="mongodb://127.0.0.1:27017", MONGODB_DB_NAME=TEST_DB, PYTHONPATH=BACKEND)
        script = os.path.join(BACKEND, "scripts", "remove_empty_default_workspace.py")
        run = lambda *a: subprocess.run([sys.executable, script, "--company-slug", "dataviz-test", *a],
                                        cwd=BACKEND, env=env, capture_output=True, text=True, timeout=60)
        dry = run()
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertIn("would delete 1 workspace(s): ['ws_empty']", dry.stdout)
        self.assertNotIn("mongodb://", dry.stdout)
        self.assertEqual(await self.db.workspaces.count_documents({"company_id": "comp_dv"}), 3)
        refused = run("--apply", "--id", "ws_used")
        self.assertEqual(refused.returncode, 2)
        ok = run("--apply", "--id", "ws_empty")
        self.assertEqual(ok.returncode, 0, ok.stderr)
        left = sorted([d["id"] async for d in self.db.workspaces.find({"company_id": "comp_dv"})])
        self.assertEqual(left, ["ws_real", "ws_used"])


if __name__ == "__main__":
    unittest.main()
