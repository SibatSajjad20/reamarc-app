"""B1: content calendar list stays lean, windowed, and write-free."""
from __future__ import annotations

import json
import statistics
import sys
import time
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import httpx
from app.config import settings
from app.core.security import _AUTH_CACHE, create_access_token, get_password_hash
from app.database import connect_to_mongo, db_instance
from app.main import app
from tests.perf.conftest import command_counter


class ContentCalendarListPerfTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", "perf_r1_b1")
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
        await connect_to_mongo()
        self.db = db_instance.db
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        )
        self.run = uuid.uuid4().hex[:8]
        self.admin_id = f"perf_cc_admin_{self.run}"
        hashed = get_password_hash("SecretPassword123!")
        now = datetime.now(timezone.utc)
        await self.db.users.insert_one(
            {
                "_id": self.admin_id,
                "id": self.admin_id,
                "email": f"perf.cc.{self.run}@perf.example.com",
                "full_name": "Perf CC Admin",
                "hashed_password": hashed,
                "role": "admin",
                "is_active": True,
                "token_version": 0,
                "session_epoch": 0,
            }
        )
        pad = "n" * 4000
        docs = []
        today = now.date()
        for i in range(80):
            pub = (today - timedelta(days=i % 40)).isoformat()
            docs.append(
                {
                    "id": f"perf_cc_list_{self.run}_{i}",
                    "serial": f"B1-{i:04d}",
                    "client_name": "Perf CC Client",
                    "stage": "Content" if i % 2 == 0 else "Posted",
                    "content_concept": f"Lean concept {i}",
                    "primary_text": pad,
                    "notes": pad,
                    "headlines_hooks": pad,
                    "publish_date": pub,
                    "design_due": pub,
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                    "created_by": self.admin_id,
                    "created_by_name": "Perf CC Admin",
                    "attachments": [],
                }
            )
        await self.db.content_calendar_items.insert_many(docs)
        self.item_ids = [d["id"] for d in docs]
        _AUTH_CACHE.clear()
        self.headers = {
            "Authorization": f"Bearer {create_access_token({'sub': self.admin_id, 'role': 'admin'})}",
        }
        self.start = (today - timedelta(days=60)).isoformat()

    async def asyncTearDown(self):
        await self.db.content_calendar_items.delete_many({"id": {"$in": self.item_ids}})
        await self.db.users.delete_many({"id": self.admin_id})
        await self.client.aclose()

    async def test_default_window_is_lean_and_write_free(self):
        url = f"/api/v1/content-calendar?limit=1000&fields=list&start_date={self.start}"
        await self.client.get(url, headers=self.headers)
        counter = command_counter()
        samples = []
        for _ in range(5):
            counter.reset()
            t0 = time.perf_counter()
            res = await self.client.get(url, headers=self.headers)
            samples.append(time.perf_counter() - t0)
            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertGreater(len(body["items"]), 0)
            self.assertEqual(counter.writes, 0)
            self.assertLessEqual(len(counter.commands), 5)
            for item in body["items"]:
                self.assertNotIn("primary_text", item)
                self.assertNotIn("notes", item)
            raw = json.dumps(body).encode("utf-8")
            self.assertLess(len(raw), 400 * 1024)
        p95 = statistics.quantiles(samples, n=20)[-1] if len(samples) >= 2 else samples[0]
        self.assertLess(p95, 0.3, f"p95={p95:.3f}s samples={samples}")

    async def test_skip_zero_returns_counts(self):
        res = await self.client.get(
            f"/api/v1/content-calendar?limit=10&skip=0&fields=list&start_date={self.start}",
            headers=self.headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertGreater(body["total"], 0)
        self.assertTrue(body["stages_count"])

    async def test_later_pages_skip_recount(self):
        res = await self.client.get(
            f"/api/v1/content-calendar?limit=10&skip=10&fields=list&start_date={self.start}",
            headers=self.headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["total"], 0)
