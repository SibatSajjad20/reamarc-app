"""B4: CRM list supports cursor pages and a lean updated_since poll."""
from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import httpx
from app.config import settings
from app.core.security import _AUTH_CACHE, create_access_token, get_password_hash
from app.database import connect_to_mongo, db_instance
from app.main import app


class CrmCursorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", "perf_r1_b4")
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
        await connect_to_mongo()
        self.db = db_instance.db
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        )
        self.uid = f"perf_b4_{uuid.uuid4().hex[:8]}"
        await self.db.users.insert_one(
            {
                "_id": self.uid,
                "id": self.uid,
                "email": f"{self.uid}@perf.example.com",
                "full_name": "Perf B4",
                "hashed_password": get_password_hash("SecretPassword123!"),
                "role": "admin",
                "is_active": True,
                "token_version": 0,
                "session_epoch": 0,
            }
        )
        now = datetime.now(timezone.utc).isoformat()
        docs = []
        for i in range(5):
            docs.append(
                {
                    "id": f"{self.uid}_lead_{i}",
                    "name": f"Lead {i}",
                    "phone_e164": f"92300000000{i}",
                    "stage": "new",
                    "outcome": None,
                    "created_at": f"2026-10-0{i+1}T10:00:00+00:00",
                    "updated_at": now,
                    "assigned_to": None,
                }
            )
        await self.db.crm_leads.insert_many(docs)
        self.lead_ids = [d["id"] for d in docs]
        _AUTH_CACHE.clear()
        self.headers = {
            "Authorization": f"Bearer {create_access_token({'sub': self.uid, 'role': 'admin'})}",
        }

    async def asyncTearDown(self):
        await self.db.crm_leads.delete_many({"id": {"$in": self.lead_ids}})
        await self.db.users.delete_many({"id": self.uid})
        await self.client.aclose()

    async def test_cursor_and_empty_delta(self):
        first = await self.client.get("/api/v1/crm/leads?limit=2&include_junk=true", headers=self.headers)
        self.assertEqual(first.status_code, 200, first.text)
        body = first.json()
        self.assertEqual(len(body["items"]), 2)
        self.assertTrue(body.get("next_cursor"))
        self.assertTrue(body.get("server_time"))
        nxt = await self.client.get(
            f"/api/v1/crm/leads?limit=2&include_junk=true&after={body['next_cursor']}",
            headers=self.headers,
        )
        self.assertEqual(nxt.status_code, 200)
        ids = {row["id"] for row in body["items"]} | {row["id"] for row in nxt.json()["items"]}
        self.assertGreaterEqual(len(ids), 3)
        delta = await self.client.get(
            f"/api/v1/crm/leads?include_junk=true&updated_since={body['server_time']}",
            headers=self.headers,
        )
        self.assertEqual(delta.status_code, 200)
        self.assertLess(len(delta.content), 2048)
