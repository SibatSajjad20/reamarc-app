"""
tests/tenancy/test_route_matrix.py
Phase 4 Gate & Phase 9 Tests 1-4:
Route matrix isolation, client payload company_id stripping, public route scoping,
and Meta webhook isolation against reamarc_test_db.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import hashlib
import hmac
import json
import unittest
import httpx

from app.main import app
from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection, db_instance
from app.core.security import create_access_token, _AUTH_CACHE
from tests.tenancy.seed import seed_tenancy_async, clean_tenancy_async


class TestRouteMatrix(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        await connect_to_mongo()
        self.db = db_instance.db
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

        self.orig_flag = getattr(settings, "MULTI_TENANT_ENABLED", False)
        settings.MULTI_TENANT_ENABLED = True
        _AUTH_CACHE.clear()

        # Clean and re-seed fresh test data
        await clean_tenancy_async(self.db)
        await seed_tenancy_async(self.db)

        # Tokens for Company A
        self.token_a_admin = create_access_token({
            "sub": "tnt_user_a_admin",
            "cid": "tnt_comp_a",
            "role": "admin",
            "tv": 0,
            "ctv": 0,
        })
        self.token_a_member = create_access_token({
            "sub": "tnt_user_a_team_member",
            "cid": "tnt_comp_a",
            "role": "team_member",
            "tv": 0,
            "ctv": 0,
        })
        self.token_a_ops = create_access_token({
            "sub": "tnt_user_a_operations",
            "cid": "tnt_comp_a",
            "role": "operations",
            "tv": 0,
            "ctv": 0,
        })

        # Tokens for Company B
        self.token_b_admin = create_access_token({
            "sub": "tnt_user_b_admin",
            "cid": "tnt_comp_b",
            "role": "admin",
            "tv": 0,
            "ctv": 0,
        })

    async def asyncTearDown(self):
        await clean_tenancy_async(self.db)
        await self.client.aclose()
        settings.MULTI_TENANT_ENABLED = self.orig_flag
        _AUTH_CACHE.clear()
        await close_mongo_connection()

    def _headers(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    async def test_01_cross_tenant_get_by_id_returns_404_never_403(self):
        """Cross-tenant by-id lookups must fail closed with 404 (never 200 or 403)."""
        endpoints = [
            (f"{settings.API_V1_STR}/crm/leads/tnt_lead_b", f"{settings.API_V1_STR}/crm/leads/tnt_lead_a"),
            (f"{settings.API_V1_STR}/shifts/tnt_shift_b", f"{settings.API_V1_STR}/shifts/tnt_shift_a"),
            (f"{settings.API_V1_STR}/website-projects/tnt_web_b", f"{settings.API_V1_STR}/website-projects/tnt_web_a"),
            (f"{settings.API_V1_STR}/content-calendar/tnt_content_b", f"{settings.API_V1_STR}/content-calendar/tnt_content_a"),
        ]

        # 1. Company A Admin querying Company B resources
        for b_url, a_url in endpoints:
            if "_b" in b_url:
                resp_b = await self.client.get(b_url, headers=self._headers(self.token_a_admin))
                self.assertEqual(
                    resp_b.status_code, 404,
                    f"Cross-tenant access to {b_url} by Company A admin must return 404, got {resp_b.status_code}: {resp_b.text}"
                )

                # Same query by Company B admin must succeed (200)
                resp_b_legit = await self.client.get(b_url, headers=self._headers(self.token_b_admin))
                self.assertEqual(
                    resp_b_legit.status_code, 200,
                    f"Legitimate access to {b_url} by Company B admin must return 200, got {resp_b_legit.status_code}: {resp_b_legit.text}"
                )

                # Legitimate query by Company A admin on Company A resource must succeed (200)
                resp_a_legit = await self.client.get(a_url, headers=self._headers(self.token_a_admin))
                self.assertEqual(
                    resp_a_legit.status_code, 200,
                    f"Legitimate access to {a_url} by Company A admin must return 200, got {resp_a_legit.status_code}: {resp_a_legit.text}"
                )

    async def test_02_cross_tenant_writes_return_404_and_b_docs_unchanged(self):
        """Cross-tenant mutations must return 404 and leave Company B documents untouched."""
        # 1. Pre-fetch snapshot of B documents
        lead_b_before = await self.db.crm_leads.find_one({"id": "tnt_lead_b"})
        ws_b_before = await self.db.workspaces.find_one({"id": "tnt_ws_b"})
        self.assertIsNotNone(lead_b_before)
        self.assertIsNotNone(ws_b_before)

        # 2. Company A attempts to PATCH Company B's lead
        patch_resp = await self.client.patch(
            f"{settings.API_V1_STR}/crm/leads/tnt_lead_b",
            json={"name": "Attacked Lead"},
            headers=self._headers(self.token_a_admin),
        )
        self.assertEqual(patch_resp.status_code, 404, f"PATCH B lead returned {patch_resp.status_code}")

        # 3. Company A attempts to PATCH Company B's workspace
        patch_ws_resp = await self.client.patch(
            f"{settings.API_V1_STR}/workspaces/tnt_ws_b",
            json={"name": "Attacked Workspace"},
            headers=self._headers(self.token_a_admin),
        )
        self.assertEqual(patch_ws_resp.status_code, 404, f"PATCH B workspace returned {patch_ws_resp.status_code}")

        # 4. Company A attempts to DELETE Company B's lead
        del_lead_resp = await self.client.delete(
            f"{settings.API_V1_STR}/crm/leads/tnt_lead_b",
            headers=self._headers(self.token_a_admin),
        )
        self.assertEqual(del_lead_resp.status_code, 404, f"DELETE B lead returned {del_lead_resp.status_code}")

        # 4. Verify Company B documents are completely unchanged in DB
        lead_b_after = await self.db.crm_leads.find_one({"id": "tnt_lead_b"})
        ws_b_after = await self.db.workspaces.find_one({"id": "tnt_ws_b"})
        self.assertEqual(lead_b_before["name"], lead_b_after["name"])
        self.assertEqual(ws_b_before["name"], ws_b_after["name"])

    async def test_03_list_endpoints_never_leak_tenant_b_data(self):
        """List endpoints called by Company A user must contain zero data belonging to Company B."""
        list_endpoints = [
            f"{settings.API_V1_STR}/workspaces",
            f"{settings.API_V1_STR}/crm/leads",
            f"{settings.API_V1_STR}/shifts",
            f"{settings.API_V1_STR}/website-projects",
            f"{settings.API_V1_STR}/content-calendar",
            f"{settings.API_V1_STR}/company-calendar",
        ]

        for url in list_endpoints:
            resp = await self.client.get(url, headers=self._headers(self.token_a_admin))
            self.assertEqual(resp.status_code, 200, f"List endpoint {url} failed: {resp.text}")
            body_text = resp.text
            # Assert no B identifiers appear in the response payload
            self.assertNotIn("tnt_comp_b", body_text, f"{url} leaked company_id tnt_comp_b")
            self.assertNotIn("Sample Co", body_text, f"{url} leaked company B name 'Sample Co'")
            self.assertNotIn("tnt_ws_b", body_text, f"{url} leaked B workspace")
            self.assertNotIn("tnt_lead_b", body_text, f"{url} leaked B lead")
            self.assertNotIn("TNT_SECRET_B", body_text, f"{url} leaked B secret")

    async def test_04_client_cannot_inject_company_id(self):
        """Incoming payload company_id is stripped and overwritten with the authenticated user's company_id."""
        # Company A admin tries to inject company_id: tnt_comp_b into a new workspace
        payload = {
            "name": "Spoofed Company Workspace",
            "company_id": "tnt_comp_b", # Injected client claim
        }
        resp = await self.client.post(f"{settings.API_V1_STR}/workspaces", json=payload, headers=self._headers(self.token_a_admin))
        self.assertIn(resp.status_code, (200, 201), f"Creating workspace failed: {resp.text}")
        created_ws = resp.json()
        ws_id = created_ws.get("id")

        # Verify in DB: the document must have company_id == tnt_comp_a, NOT tnt_comp_b
        db_doc = await self.db.workspaces.find_one({"id": ws_id})
        self.assertIsNotNone(db_doc)
        self.assertEqual(db_doc.get("company_id"), "tnt_comp_a", "company_id was not stripped/enforced to company A!")

        # Company B cannot mutate or see this newly created workspace
        resp_b_patch = await self.client.patch(
            f"{settings.API_V1_STR}/workspaces/{ws_id}",
            json={"name": "Attacked Workspace"},
            headers=self._headers(self.token_b_admin),
        )
        self.assertEqual(resp_b_patch.status_code, 404, "Company B was able to patch Company A's new workspace!")

        resp_b_list = await self.client.get(f"{settings.API_V1_STR}/workspaces", headers=self._headers(self.token_b_admin))
        self.assertEqual(resp_b_list.status_code, 200)
        self.assertNotIn(ws_id, resp_b_list.text, "Company B workspace list leaked Company A's workspace!")

    async def test_05_public_routes_isolation(self):
        """Public routes resolve company from token/slug and operate strictly inside that tenant."""
        # 1. Lead Ingest Webhook: POST /crm/ingest/{token}
        # Ingest for Company A
        resp_ingest_a = await self.client.post(
            "/crm/ingest/tnt_ingest_tok_a",
            json={"name": "Public Lead A", "email": "pub_a@example.com"},
        )
        self.assertEqual(resp_ingest_a.status_code, 200, f"Ingest A failed: {resp_ingest_a.text}")

        # Ingest for Company B
        resp_ingest_b = await self.client.post(
            "/crm/ingest/tnt_ingest_tok_b",
            json={"name": "Public Lead B", "email": "pub_b@example.com"},
        )
        self.assertEqual(resp_ingest_b.status_code, 200, f"Ingest B failed: {resp_ingest_b.text}")

        # Ingest with invalid token -> 404
        resp_invalid = await self.client.post(
            "/crm/ingest/invalid_token_xyz",
            json={"name": "Bad Lead"},
        )
        self.assertEqual(resp_invalid.status_code, 404)

        # Verify DB records
        lead_a = await self.db.crm_leads.find_one({"email": "pub_a@example.com"})
        lead_b = await self.db.crm_leads.find_one({"email": "pub_b@example.com"})
        self.assertIsNotNone(lead_a)
        self.assertIsNotNone(lead_b)
        self.assertEqual(lead_a.get("company_id"), "tnt_comp_a")
        self.assertEqual(lead_b.get("company_id"), "tnt_comp_b")

        # 2. Public Scheduler Config: GET /crm/public/scheduler/config?slug=...
        resp_sched_a = await self.client.get("/crm/public/scheduler/config?slug=booking-a")
        self.assertEqual(resp_sched_a.status_code, 200)

        resp_sched_b = await self.client.get("/crm/public/scheduler/config?slug=booking-b")
        self.assertEqual(resp_sched_b.status_code, 200)

        resp_sched_bad = await self.client.get("/crm/public/scheduler/config?slug=unknown-slug")
        self.assertEqual(resp_sched_bad.status_code, 404)

        # 3. Client Review Link: GET /api/v1/content-calendar/public/review/{token}
        resp_rev_a = await self.client.get(f"{settings.API_V1_STR}/content-calendar/public/review/tnt_rev_token_a")
        self.assertEqual(resp_rev_a.status_code, 200)
        self.assertIn("Client A", resp_rev_a.text)
        self.assertNotIn("Client B", resp_rev_a.text)

        resp_rev_bad = await self.client.get(f"{settings.API_V1_STR}/content-calendar/public/review/invalid_token")
        self.assertEqual(resp_rev_bad.status_code, 404)

    async def test_06_meta_webhook_isolation(self):
        """Meta webhook verifies page ID, drops unknown pages, and routes lead to the proper company."""
        # 1. Payload targeting Company B's Meta Page (meta_page_b)
        meta_payload_b = {
            "object": "page",
            "entry": [
                {
                    "id": "meta_page_b",
                    "time": 1700000000,
                    "changes": [
                        {
                            "field": "leadgen",
                            "value": {
                                "leadgen_id": "meta_lead_999",
                                "page_id": "meta_page_b",
                                "form_id": "form_b_1",
                                "created_time": 1700000000,
                            },
                        }
                    ],
                }
            ],
        }

        app_secret = getattr(settings, "CRM_META_APP_SECRET", "")
        headers = {}
        payload_bytes = json.dumps(meta_payload_b).encode("utf-8")
        if app_secret:
            sig = hmac.new(app_secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
            headers["X-Hub-Signature-256"] = f"sha256={sig}"

        resp_meta = await self.client.post("/crm/meta/webhook", content=payload_bytes, headers=headers)
        self.assertEqual(resp_meta.status_code, 200)

        # 2. Payload with unknown page id -> dropped and logged in security_events
        meta_payload_unknown = {
            "object": "page",
            "entry": [{"id": "meta_unknown_page_999", "changes": [{"field": "leadgen", "value": {}}]}],
        }
        unknown_bytes = json.dumps(meta_payload_unknown).encode("utf-8")
        if app_secret:
            sig = hmac.new(app_secret.encode("utf-8"), unknown_bytes, hashlib.sha256).hexdigest()
            headers["X-Hub-Signature-256"] = f"sha256={sig}"

        resp_unknown = await self.client.post("/crm/meta/webhook", content=unknown_bytes, headers=headers)
        self.assertEqual(resp_unknown.status_code, 200)

        # Check security_events collection for recorded drop
        sec_evt = await self.db.security_events.find_one({"event_type": "unknown_webhook_page"})
        self.assertIsNotNone(sec_evt, "Unknown webhook page was not logged to security_events!")
        self.assertEqual(sec_evt.get("page_id"), "meta_unknown_page_999")

        # 3. Bad signature -> 401
        if app_secret:
            resp_bad_sig = await self.client.post(
                "/crm/meta/webhook",
                content=payload_bytes,
                headers={"X-Hub-Signature-256": "sha256=invalidsignaturehere1234567890"},
            )
            self.assertEqual(resp_bad_sig.status_code, 401)

    async def test_07_runtime_guard_clean_execution(self):
        """Confirm that legitimate tenant operations execute without triggering runtime guard blocks."""
        # Ensure zero runtime guard failure events exist in security_events
        guard_blocks = await self.db.security_events.count_documents({"event_type": "runtime_guard_block"})
        self.assertEqual(guard_blocks, 0, "Runtime guard blocked legitimate query during test suite execution!")
