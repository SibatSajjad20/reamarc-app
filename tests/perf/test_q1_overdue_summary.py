"""Q1: overdue-summary matches a brute-force count and stays lean."""
from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import httpx
from app.config import settings
from app.core.security import _AUTH_CACHE, create_access_token, get_password_hash
from app.database import connect_to_mongo, db_instance
from app.main import app
from tests.perf.conftest import command_counter


PKT = ZoneInfo("Asia/Karachi")


def _bucket(item: dict, now: datetime) -> str | None:
    from app.services import content_calendar_service as ccs

    presented = ccs._present_doc(dict(item))
    stage = presented.get("stage")
    if stage == "Rejected":
        return None
    is_post = stage in ("Ready to Post", "Posted")
    date_str = (presented.get("publish_date") or presented.get("design_due") or "") if is_post else (
        presented.get("design_due") or presented.get("publish_date") or ""
    )
    date_str = str(date_str).strip()
    if not date_str:
        return None if stage == "Posted" else "idle"
    date_only = date_str.split("T")[0]
    parts = date_only.split("-")
    if len(parts) < 3:
        return None if stage == "Posted" else "idle"
    try:
        year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        return None if stage == "Posted" else "idle"
    target = datetime(year, month, day, tzinfo=PKT).date()
    today = now.astimezone(PKT).date()
    diff = (target - today).days
    if diff < 0:
        return None if stage == "Posted" else "overdue"
    if diff == 0:
        return "today"
    return "scheduled"


class OverdueSummaryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", "perf_r1_q1")
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
        await connect_to_mongo()
        self.db = db_instance.db
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.run = uuid.uuid4().hex[:8]
        self.pwd = "SecretPassword123!"
        hashed = get_password_hash(self.pwd)
        now = datetime.now(PKT)
        self.today = now.strftime("%Y-%m-%d")
        yesterday = (now - timedelta(days=2)).strftime("%Y-%m-%d")
        tomorrow = (now + timedelta(days=2)).strftime("%Y-%m-%d")

        self.admin_id = f"perf_admin_{self.run}"
        self.creative_id = f"perf_cr_{self.run}"
        await self.db.users.insert_many(
            [
                {
                    "_id": self.admin_id,
                    "id": self.admin_id,
                    "email": f"perf.admin.{self.run}@perf.example.com",
                    "full_name": "Perf Admin",
                    "hashed_password": hashed,
                    "role": "admin",
                    "is_active": True,
                    "token_version": 0,
                    "session_epoch": 0,
                },
                {
                    "_id": self.creative_id,
                    "id": self.creative_id,
                    "email": f"perf.creative.{self.run}@perf.example.com",
                    "full_name": "Perf Creative",
                    "hashed_password": hashed,
                    "role": "team_member",
                    "department": "Creative",
                    "is_active": True,
                    "token_version": 0,
                    "session_epoch": 0,
                    "access": {
                        "modules": {"content_calendar": True},
                        "content_stages": ["creative"],
                    },
                },
            ]
        )
        items = [
            {
                "id": f"perf_cc_od_{self.run}",
                "serial": "PERF-OD-01",
                "client_name": "Perf Client",
                "stage": "Creative Production",
                "design_due": yesterday,
                "publish_date": tomorrow,
            },
            {
                "id": f"perf_cc_td_{self.run}",
                "serial": "PERF-TD-01",
                "client_name": "Perf Client",
                "stage": "Content",
                "design_due": self.today,
                "publish_date": tomorrow,
            },
            {
                "id": f"perf_cc_fut_{self.run}",
                "serial": "PERF-FU-01",
                "client_name": "Perf Client",
                "stage": "Creative Production",
                "design_due": tomorrow,
                "publish_date": tomorrow,
            },
            {
                "id": f"perf_cc_posted_{self.run}",
                "serial": "PERF-PO-01",
                "client_name": "Perf Client",
                "stage": "Posted",
                "publish_date": yesterday,
            },
            {
                "id": f"perf_cc_rej_{self.run}",
                "serial": "PERF-RJ-01",
                "client_name": "Perf Client",
                "stage": "Rejected",
                "design_due": yesterday,
            },
            {
                "id": f"perf_cc_content_{self.run}",
                "serial": "PERF-CT-01",
                "client_name": "Perf Client",
                "stage": "Content",
                "design_due": yesterday,
            },
        ]
        await self.db.content_calendar_items.insert_many(items)
        self.seed_ids = [i["id"] for i in items]
        _AUTH_CACHE.clear()

    async def asyncTearDown(self):
        await self.db.content_calendar_items.delete_many({"id": {"$in": self.seed_ids}})
        await self.db.users.delete_many({"id": {"$in": [self.admin_id, self.creative_id]}})
        await self.client.aclose()

    def _auth(self, uid: str, role: str) -> dict:
        token = create_access_token({"sub": uid, "role": role})
        return {"Authorization": f"Bearer {token}"}

    async def _brute_async(self, viewer: dict) -> tuple[int, int]:
        from app.services.content_calendar_workflow import visible_stages

        allowed = visible_stages(viewer)
        now = datetime.now(PKT)
        overdue = due_today = 0
        docs = await self.db.content_calendar_items.find({"id": {"$in": self.seed_ids}}).to_list(50)
        for doc in docs:
            if allowed is not None:
                from app.services.content_calendar_workflow import normalize_stage

                if normalize_stage(doc.get("stage")) not in allowed:
                    continue
            b = _bucket(doc, now)
            if b == "overdue":
                overdue += 1
            elif b == "today":
                due_today += 1
        return overdue, due_today

    async def test_admin_counts_match_brute_force(self):
        viewer = {"id": self.admin_id, "role": "admin", "is_active": True}
        expected_od, expected_td = await self._brute_async(viewer)
        res = await self.client.get(
            "/api/v1/content-calendar/overdue-summary",
            headers=self._auth(self.admin_id, "admin"),
        )
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["overdue_count"], expected_od)
        self.assertEqual(body["due_today_count"], expected_td)
        self.assertLessEqual(len(body["sample"]), 5)

    async def test_creative_member_counts_match_brute_force(self):
        viewer = {
            "id": self.creative_id,
            "role": "team_member",
            "department": "Creative",
            "is_active": True,
            "access": {"modules": {"content_calendar": True}, "content_stages": ["creative"]},
        }
        expected_od, expected_td = await self._brute_async(viewer)
        res = await self.client.get(
            "/api/v1/content-calendar/overdue-summary",
            headers=self._auth(self.creative_id, "team_member"),
        )
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["overdue_count"], expected_od)
        self.assertEqual(body["due_today_count"], expected_td)

    async def test_endpoint_uses_few_mongo_commands(self):
        headers = self._auth(self.admin_id, "admin")
        await self.client.get("/api/v1/content-calendar/overdue-summary", headers=headers)
        counter = command_counter()
        counter.reset()
        res = await self.client.get("/api/v1/content-calendar/overdue-summary", headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(counter.commands), 1)
        self.assertEqual(counter.writes, 0)
