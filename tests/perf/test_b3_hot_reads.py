"""B3: hot read endpoints stay write-free after warmup."""
from __future__ import annotations

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
from tests.perf.conftest import command_counter


class HotReadGatherTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", "perf_r1_b3")
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
        await connect_to_mongo()
        self.db = db_instance.db
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        )
        self.uid = f"perf_b3_{uuid.uuid4().hex[:8]}"
        await self.db.users.insert_one(
            {
                "_id": self.uid,
                "id": self.uid,
                "email": f"{self.uid}@perf.example.com",
                "full_name": "Perf B3",
                "hashed_password": get_password_hash("SecretPassword123!"),
                "role": "admin",
                "is_active": True,
                "token_version": 0,
                "session_epoch": 0,
            }
        )
        _AUTH_CACHE.clear()
        self.headers = {
            "Authorization": f"Bearer {create_access_token({'sub': self.uid, 'role': 'admin'})}",
        }

    async def asyncTearDown(self):
        await self.db.users.delete_many({"id": self.uid})
        await self.client.aclose()

    async def test_inbox_and_today_are_write_free_on_warm_read(self):
        await self.client.get("/api/v1/log-exceptions/inbox", headers=self.headers)
        counter = command_counter()
        counter.reset()
        inbox = await self.client.get("/api/v1/log-exceptions/inbox", headers=self.headers)
        self.assertEqual(inbox.status_code, 200, inbox.text)
        self.assertEqual(counter.writes, 0)
