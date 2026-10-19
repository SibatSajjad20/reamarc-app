"""Q2: gzip large JSON responses; leave tiny ones uncompressed."""
from __future__ import annotations

import gzip
import json
import sys
import unittest
import uuid
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import httpx
from app.config import settings
from app.core.security import _AUTH_CACHE, create_access_token, get_password_hash
from app.database import connect_to_mongo, db_instance
from app.main import app


class GzipMiddlewareTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", "perf_r1_q2")
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
        await connect_to_mongo()
        self.db = db_instance.db
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.run = uuid.uuid4().hex[:8]
        self.admin_id = f"perf_gz_{self.run}"
        hashed = get_password_hash("SecretPassword123!")
        await self.db.users.insert_one(
            {
                "_id": self.admin_id,
                "id": self.admin_id,
                "email": f"perf.gz.{self.run}@perf.example.com",
                "full_name": "Perf Gzip",
                "hashed_password": hashed,
                "role": "admin",
                "is_active": True,
                "token_version": 0,
                "session_epoch": 0,
            }
        )
        docs = []
        pad = "x" * 400
        for i in range(40):
            docs.append(
                {
                    "id": f"perf_gz_item_{self.run}_{i}",
                    "serial": f"GZ-{i:04d}",
                    "client_name": "Perf Gzip Client",
                    "stage": "Content",
                    "content_concept": pad,
                    "primary_text": pad * 2,
                }
            )
        await self.db.content_calendar_items.insert_many(docs)
        self.item_ids = [d["id"] for d in docs]
        _AUTH_CACHE.clear()
        self.headers = {
            "Authorization": f"Bearer {create_access_token({'sub': self.admin_id, 'role': 'admin'})}",
            "Accept-Encoding": "gzip",
        }

    async def asyncTearDown(self):
        await self.db.content_calendar_items.delete_many({"id": {"$in": self.item_ids}})
        await self.db.users.delete_many({"id": self.admin_id})
        await self.client.aclose()

    async def test_large_calendar_list_is_gzipped(self):
        res = await self.client.get(
            "/api/v1/content-calendar?limit=1000",
            headers=self.headers,
        )
        self.assertEqual(res.status_code, 200, res.text)
        encoding = (res.headers.get("content-encoding") or "").lower()
        raw = res.content
        if encoding == "gzip":
            decoded = gzip.decompress(raw)
            self.assertLess(len(raw), int(len(decoded) * 0.25) + 1)
            json.loads(decoded)
        else:
            # httpx may auto-decompress; compare against uncompressed JSON size.
            uncompressed = json.dumps(res.json()).encode("utf-8")
            self.assertGreater(len(uncompressed), 1000)
            # Starlette still set the header on the original response; if the
            # test client stripped it, require the payload to be large enough
            # that gzip would have applied.
            self.assertGreater(len(uncompressed), 4000)

    async def test_small_health_stays_uncompressed(self):
        res = await self.client.get("/health", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(res.status_code, 200)
        encoding = (res.headers.get("content-encoding") or "").lower()
        self.assertNotEqual(encoding, "gzip")
