"""Content calendar monthly report: aggregation numbers and client-safe output.

Throwaway Mongo only (reamarc_test_* database); no outbound network.
"""
from __future__ import annotations

import os
import socket
import sys
import unittest
from datetime import date, datetime, timezone
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test-secret-key-cc-report-0123456789abcdef")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx

from app.config import settings
from app.core.security import claims_with_session, create_access_token
from app.database import connect_to_mongo
from app.main import app
from app.services import content_calendar_report as rep

TEST_DB = "reamarc_test_cc_report"
A, B = "company_test_a", "company_test_b"
_real_connect = socket.socket.connect


def _loopback_only(self, addr, *a, **k):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *a, **k)
    raise OSError("outbound blocked in tests")


def _item(i, stage, ctype, pub, **extra):
    doc = {
        "id": i, "serial": i.upper(), "company_id": A, "workspace_id": "ws_sp", "client_name": "SP Builders",
        "stage": stage, "creative_type": ctype, "publish_date": pub, "content_concept": f"Concept {i}",
        "channels": ["Instagram"], "content_pillar": "Product", "creative_category": "Organic Creative",
        "content_type": "Scheduled", "created_at": "2026-10-01T00:00:00Z", "updated_at": "2026-11-16T00:00:00Z",
        "share_token": f"tok-secret-{i}", "notes": "internal note only", "assignee_name": "Ali Internal",
        "assignee_id": "u_ali", "design_owner": "Creative", "revision_note": "secret revision words",
        "attachments": [],
    }
    doc.update(extra)
    return doc


ITEMS = [
    _item("p1", "Posted", "Video", "2026-11-03", attachments=[
        {"id": "a1", "kind": "image", "role": "primary", "order": 0, "url": "/uploads/content_calendar/p1/a.jpg",
         "thumbnail_url": None, "filename": "a.jpg", "google_drive_file_id": "SECRETDRIVE"}]),
    _item("p2", "Posted", "static post", "2026-11-05", channels=["Facebook", "Instagram"]),
    _item("p3", "Ready to Post", "Video", "2026-11-25"),
    _item("r1", "Content Client Review", "Static", "2026-11-22"),
    _item("r2", "Creative Revision", "Reels", "2026-11-21"),
    _item("i1", "Content Internal Review", "Carousel", "2026-11-28"),
    _item("x1", "Rejected", "Static", "2026-11-10"),
    _item("n1", "Content", "Video", "2026-12-05"),
    _item("n2", "Creative Production", "Carousel", "2026-12-09"),
    # Legacy row: no workspace_id, same client name -> belongs.
    _item("lg", "Posted", "Static", "2026-11-07", workspace_id=None, client_name="sp  builders"),
    # Linked to another workspace with the same name -> never counted.
    _item("ow", "Posted", "Static", "2026-11-08", workspace_id="ws_other"),
    # No publish date: month comes from design_due.
    _item("dd", "Content", "Static", None, design_due="2026-11-12"),
    # Other company, same workspace id.
    _item("cb", "Posted", "Video", "2026-11-04", company_id=B),
    # Different month.
    _item("old", "Posted", "Video", "2026-10-30"),
]

WS = {
    "id": "ws_sp", "name": "SP Builders", "initials": "SP", "status": "active",
    "content_expectations": {"period": "month", "lines": [
        {"creative_type": "Video", "expected": 2},
        {"creative_type": "Static", "expected": 3, "expected_max": 4},
        {"creative_type": "Story", "expected": 5},
        {"creative_type": "Reel", "expected": 1, "skip_months": ["2026-11"]},
    ]},
}


class TestBuildReport(unittest.TestCase):
    def _items(self):
        import copy
        return [copy.deepcopy(i) for i in ITEMS if i["company_id"] == A and i["id"] not in ("ow",)]

    def test_numbers(self):
        r = rep.build_report(self._items(), WS, "2026-11", audience="internal", today=date(2026, 11, 20),
                             generated_at=datetime(2026, 11, 20, 10, tzinfo=timezone.utc))
        s = r["summary"]
        self.assertEqual((s["planned"], s["delivered"], s["left"], s["posted"]), (5, 3, 2, 3))
        self.assertEqual((s["approved_scheduled"], s["awaiting_review"], s["in_revision"], s["in_production"], s["rejected"]),
                         (1, 1, 1, 2, 1))
        self.assertEqual(s["total"], 9)
        self.assertEqual(s["percent"], 60)
        rows = {row["creative_type"]: row for row in r["by_type"]}
        self.assertNotIn("Story", rows)
        self.assertEqual((rows["Video"]["expected"], rows["Video"]["posted"], rows["Video"]["in_progress"], rows["Video"]["gap"]), (2, 1, 1, 1))
        self.assertEqual(rows["Video"]["status"], "on_track")
        self.assertEqual((rows["Static"]["posted"], rows["Static"]["in_progress"], rows["Static"]["status"]), (2, 2, "on_track"))
        self.assertEqual(rows["Reel"]["status"], "paused")
        self.assertEqual(rows["Carousel"]["status"], "no_plan")
        self.assertEqual(r["next_month"]["total"], 2)
        chans = {c["label"]: c["count"] for c in r["breakdown"]["channels"]}
        self.assertEqual(chans["Instagram"], 8)
        self.assertEqual(chans["Facebook"], 1)
        self.assertEqual(r["breakdown"]["total"], 8)
        self.assertEqual([c["date"] for c in r["calendar"]], ["2026-11-03", "2026-11-05", "2026-11-07", "2026-11-25"])
        self.assertEqual(len(r["posted_items"]), 3)
        self.assertEqual(r["posted_items"][0]["thumb"]["url"], "/uploads/content_calendar/p1/a.jpg")
        aw = r["action_needed"]["awaiting_review"]
        self.assertEqual([a["id"] for a in aw], ["r1"])
        self.assertEqual(aw[0]["days_waiting"], 4)
        self.assertEqual(aw[0]["review_kind"], "Content review")
        risk = [a["id"] for a in r["action_needed"]["at_risk"]]
        self.assertEqual(risk, ["r2", "r1"])  # approved p3 (25th) is scheduled, not at risk
        self.assertIn("internal", r)

    def test_at_risk_window(self):
        r = rep.build_report(self._items(), WS, "2026-11", audience="client", today=date(2026, 11, 26))
        risk = r["action_needed"]["at_risk"]
        # Past publish dates not posted are at risk, including approved items that missed their date.
        self.assertEqual([a["id"] for a in risk], ["r2", "r1", "p3", "i1"])
        self.assertEqual(risk[0]["days_until"], -5)
        self.assertEqual(risk[0]["status_label"], "In revision")
        self.assertNotIn("stage", risk[0])

    def test_bad_month(self):
        for bad in ("2026-13", "2026-1", "26-11", "2026-11-01", "abcd-ef", "1999-01"):
            with self.assertRaises(rep.ReportError):
                rep.parse_month(bad)


FORBIDDEN = [
    "share_token", "tok-secret", "Content Client Review", "Creative Client Review", "Internal Review",
    "Creative Revision", "Content Revision", "Creative Production", "Ready to Post", "Ali Internal", "u_ali",
    "assignee", "design_owner", "secret revision", "internal note", "revision_note", "notes", "SECRETDRIVE",
    "\"stage\"", "stage_counts", "workload",
]


class TestReportApi(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        guard = mock.patch.object(socket.socket, "connect", new=_loopback_only)
        guard.start()
        self.addCleanup(guard.stop)
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        assert "test" in TEST_DB and TEST_DB != "reamarc_db"
        await connect_to_mongo()
        from app.database import db_instance
        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        from app.core.limiter import limiter
        limiter.enabled = False
        self.companies = {}
        for cid in (A, B):
            c = {"id": cid, "name": cid, "status": "active", "token_version": 0}
            self.companies[cid] = c
            await self.db.companies.insert_one(dict(c))
        self.users = {}
        for uid, cid, role, ws, name in (
            ("client_sp", A, "client", ["ws_sp"], "SP Builders"),
            ("client_other", A, "client", ["ws_other"], "Other Co"),
            ("client_b", B, "client", ["ws_sp"], "SP Builders"),
            ("admin_a", A, "admin", [], "Admin A"),
        ):
            u = {"id": uid, "email": f"{uid}@example.test", "full_name": name, "role": role, "is_active": True,
                 "company_id": cid, "session_epoch": 0, "workspace_ids": ws, "primary_department": None, "departments": [],
                 "refresh_jtis": [f"web-{uid}"], "refresh_retired": []}
            m = {"id": f"m_{uid}", "user_id": uid, "company_id": cid, "status": "active", "role": role,
                 "workspace_ids": ws, "token_version": 0}
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            self.users[uid] = (u, m)
        await self.db.workspaces.insert_one(dict(WS, company_id=A))
        await self.db.workspaces.insert_one({"id": "ws_other", "name": "SP Builders", "status": "active", "company_id": A})
        await self.db.workspaces.insert_one({"id": "ws_sp", "name": "SP Builders", "status": "active", "company_id": B})
        await self.db.content_calendar_items.insert_many([dict(i) for i in ITEMS])
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        from app.database import db_instance
        await db_instance.client.drop_database(TEST_DB)
        db_instance.client.close()
        db_instance.client = None
        db_instance.db = None

    def _auth(self, uid):
        u, m = self.users[uid]
        base = {"sub": uid, "email": u["email"], "name": u["full_name"], "role": m["role"], "cid": u["company_id"],
                "workspace_ids": u["workspace_ids"], "mid": m["id"], "mtv": 0}
        c = claims_with_session(u, base, company_doc=self.companies[u["company_id"]], membership_doc=m)
        return {"Authorization": f"Bearer {create_access_token(dict(c, sid=f'web-{uid}'))}", "X-Requested-With": "XMLHttpRequest"}

    async def _get(self, qs, uid):
        self.client.cookies.clear()
        return await self.client.get(f"/api/v1/content-calendar/report?{qs}", headers=self._auth(uid))

    async def test_client_gets_own_report_without_internal_fields(self):
        r = await self._get("workspace_id=ws_sp&month=2026-11&audience=internal", "client_sp")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["audience"], "client")
        self.assertNotIn("internal", body)
        self.assertEqual(body["summary"]["posted"], 3)  # p1, p2, legacy; not ws_other, not company B
        self.assertEqual(body["summary"]["planned"], 5)
        text = r.text
        for word in FORBIDDEN:
            self.assertNotIn(word, text, word)
        self.assertIn("no-store", r.headers.get("cache-control", ""))

    async def test_client_cannot_read_other_workspace(self):
        r = await self._get("workspace_id=ws_sp&month=2026-11", "client_other")
        self.assertEqual(r.status_code, 404, r.text)
        r = await self._get("workspace_id=ws_nope&month=2026-11", "client_sp")
        self.assertEqual(r.status_code, 404, r.text)

    async def test_other_company_is_isolated(self):
        r = await self._get("workspace_id=ws_sp&month=2026-11", "client_b")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["summary"]["posted"], 1)  # only company B's own row
        self.assertEqual(r.json()["summary"]["planned"], 0)

    async def test_bad_params_422(self):
        for qs in ("workspace_id=ws_sp&month=2026-13", "workspace_id=ws_sp&month=2026-1", "workspace_id=ws_sp&month=x",
                   "workspace_id=ws_sp", "workspace_id=ws%24sp&month=2026-11", "workspace_id=ws_sp&month=2026-11&audience=all",
                   "workspace_id=ws_sp&month=1999-01"):
            r = await self._get(qs, "admin_a")
            self.assertEqual(r.status_code, 422, f"{qs}: {r.text}")

    async def test_staff_internal_and_client_versions(self):
        r = await self._get("workspace_id=ws_sp&month=2026-11&audience=internal", "admin_a")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["audience"], "internal")
        stages = {s["stage"]: s["count"] for s in body["internal"]["stage_counts"]}
        self.assertEqual(stages["Content Internal Review"], 1)
        self.assertEqual(body["internal"]["internal_review"], 1)
        self.assertIn("Ali Internal", [w["label"] for w in body["internal"]["workload_by_assignee"]])
        self.assertNotIn("share_token", r.text)
        r = await self._get("workspace_id=ws_sp&month=2026-11&audience=client", "admin_a")
        self.assertEqual(r.status_code, 200, r.text)
        for word in FORBIDDEN:
            self.assertNotIn(word, r.text, word)

    async def test_unauthenticated(self):
        self.client.cookies.clear()
        r = await self.client.get("/api/v1/content-calendar/report?workspace_id=ws_sp&month=2026-11")
        self.assertIn(r.status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()
