"""Q5: range day-targets match per-day calls and stay lean."""
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


class DayTargetsRangeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", "perf_r1_q5")
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
        await connect_to_mongo()
        self.db = db_instance.db
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.run = uuid.uuid4().hex[:8]
        self.uid = f"perf_dt_{self.run}"
        hashed = get_password_hash("SecretPassword123!")
        await self.db.users.insert_one(
            {
                "_id": self.uid,
                "id": self.uid,
                "email": f"perf.dt.{self.run}@perf.example.com",
                "full_name": "Perf DayTarget",
                "hashed_password": hashed,
                "role": "team_member",
                "department": "Content",
                "is_active": True,
                "token_version": 0,
                "session_epoch": 0,
            }
        )
        today = datetime.now(PKT).date()
        self.dates = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
        _AUTH_CACHE.clear()
        self.headers = {"Authorization": f"Bearer {create_access_token({'sub': self.uid, 'role': 'team_member'})}"}

    async def asyncTearDown(self):
        await self.db.users.delete_many({"id": self.uid})
        await self.client.aclose()

    async def test_range_matches_seven_single_calls(self):
        singles = {}
        for d in self.dates:
            res = await self.client.get(f"/api/v1/daily-log/day-target?date={d}", headers=self.headers)
            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            body.pop("follow_ups", None)
            singles[d] = body
        ranged = await self.client.get(
            f"/api/v1/daily-log/day-targets?from={self.dates[0]}&to={self.dates[-1]}",
            headers=self.headers,
        )
        self.assertEqual(ranged.status_code, 200, ranged.text)
        payload = ranged.json()
        for d in self.dates:
            day = dict(payload[d])
            day.pop("follow_ups", None)
            self.assertEqual(day["date"], singles[d]["date"])
            self.assertEqual(day["expected_hours"], singles[d]["expected_hours"])

    async def test_range_uses_few_commands(self):
        url = f"/api/v1/daily-log/day-targets?from={self.dates[0]}&to={self.dates[-1]}"
        await self.client.get(url, headers=self.headers)
        counter = command_counter()
        counter.reset()
        res = await self.client.get(url, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertLessEqual(len(counter.commands), 12)
