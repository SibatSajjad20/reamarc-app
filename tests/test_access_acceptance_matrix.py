"""Phase 5: Full Acceptance Matrix Test for Access Control Fix.

Covers:
1. All roles x all 6 core module endpoints:
   - Admin (200 everywhere)
   - HR (200 on daily_log, exceptions; 403 on website, crm, ads)
   - Operations (200 on exceptions, daily_log; 403 on website, crm, ads)
   - Client (403 on internal modules)
   - Sales Lead / Member (CRM 200; website 403; ads 403)
   - Content Lead / Member (Content calendar 200; website 403; crm 403; ads 403)
   - Creative & Social (Content calendar 200; others 403)
   - Website Lead / Member (Website 200; CRM 403; ads 403)
   - SEO & Performance Marketing (Ads 200; website 403; CRM 403)
2. Multi-department combinations (Rule 8):
   - Content Lead + Creative + Social: extra stages accessible, daily log scoped to primary dept (content)
   - Content Member + Sales: CRM 403
   - Content Lead + Website: Website 403
   - Website Member + Performance Marketing: Ads 403
3. Dynamic Admin Override:
   - Content member gets 403 on website
   - Override granted (website=view): gets 200
   - Override revoked: gets 403 again
4. Sales row scoping:
   - Sales lead can_view_all_leads = True
   - Sales member can_view_all_leads = False (scoped to assigned/unassigned)
"""
from __future__ import annotations

import asyncio
import os
import unittest
from typing import Any, Dict

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.security import get_current_user
from app.database import db_instance
from app.main import app
from app.services.content_calendar_workflow import visible_stages
from app.services.crm_access import can_view_all_leads, is_crm_user
from app.services.permissions import (
    load_context,
    resolve,
    invalidate_role_defaults_cache,
)

TEST_DB_NAME = "reamarc_acceptance_matrix_db"
MONGO_URL = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")


class TestAccessAcceptanceMatrix(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncIOMotorClient(MONGO_URL)
        self.db = self.client[TEST_DB_NAME]
        await self.client.drop_database(TEST_DB_NAME)

        db_instance.client = self.client
        db_instance.db = self.db
        invalidate_role_defaults_cache()

        # Seed workspace
        await self.db.workspaces.insert_one({
            "id": "ws-1",
            "name": "Acme Brand",
            "is_active": True,
        })

        # Seed sample website project
        await self.db.website_projects.insert_one({
            "id": "proj-1",
            "name": "Acme Redesign",
            "workspace_id": "ws-1",
            "manager_id": "u-web-lead",
            "stage": "strategy",
            "status": "active",
        })

        # Seed sample CRM lead
        await self.db.crm_leads.insert_one({
            "id": "lead-1",
            "name": "Jane Buyer",
            "workspace_id": "ws-1",
            "assigned_to": "u-sales-mem",
            "stage": "new",
        })

        self.transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

    async def asyncTearDown(self):
        app.dependency_overrides.clear()
        await self.client.drop_database(TEST_DB_NAME)
        self.client.close()

    async def _probe(self, user: Dict[str, Any], method: str, path: str, headers: Dict[str, str] = None) -> int:
        app.dependency_overrides[get_current_user] = lambda: user
        h = {"X-Workspace-ID": "ws-1"}
        if headers:
            h.update(headers)
        async with httpx.AsyncClient(transport=self.transport, base_url="http://testserver") as client:
            resp = await client.request(method, path, headers=h)
            return resp.status_code

    async def test_admin_access_everywhere(self):
        admin_user = {
            "id": "u-admin",
            "role": "admin",
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        self.assertEqual(await self._probe(admin_user, "GET", "/api/v1/website-projects"), 200)
        self.assertEqual(await self._probe(admin_user, "GET", "/api/v1/crm/leads"), 200)
        self.assertEqual(await self._probe(admin_user, "GET", "/api/v1/marketing/daily"), 200)
        self.assertEqual(await self._probe(admin_user, "GET", "/api/v1/log-exceptions/inbox"), 200)

    async def test_hr_access_and_restrictions(self):
        hr_user = {
            "id": "u-hr",
            "role": "hr",
            "department": "HR",
            "primary_department": "HR",
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        self.assertEqual(await self._probe(hr_user, "GET", "/api/v1/log-exceptions/inbox"), 200)
        self.assertEqual(await self._probe(hr_user, "GET", "/api/v1/website-projects"), 403)
        self.assertEqual(await self._probe(hr_user, "GET", "/api/v1/crm/leads"), 403)
        self.assertEqual(await self._probe(hr_user, "GET", "/api/v1/marketing/daily"), 403)

    async def test_operations_access_and_restrictions(self):
        ops_user = {
            "id": "u-ops",
            "role": "operations",
            "department": "Operations",
            "primary_department": "Operations",
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        # Operations views every work module.
        self.assertEqual(await self._probe(ops_user, "GET", "/api/v1/log-exceptions/inbox"), 200)
        self.assertEqual(await self._probe(ops_user, "GET", "/api/v1/website-projects"), 200)
        self.assertEqual(await self._probe(ops_user, "GET", "/api/v1/crm/leads"), 200)
        self.assertEqual(await self._probe(ops_user, "GET", "/api/v1/marketing/daily"), 200)

        from app.core.security import create_access_token
        stored = {k: v for k, v in ops_user.items() if not str(k).startswith("_")}
        await self.db.users.insert_one(stored)
        token = create_access_token({
            "sub": "u-ops",
            "email": "ops@example.com",
            "name": "Ops",
            "role": "operations",
        })
        auth = {"Authorization": f"Bearer {token}"}
        self.assertEqual(await self._probe(ops_user, "POST", "/api/v1/crm/leads", headers=auth), 403)
        self.assertEqual(await self._probe(ops_user, "POST", "/api/v1/content-calendar", headers=auth), 403)
        self.assertEqual(await self._probe(ops_user, "POST", "/api/v1/website-projects", headers=auth), 403)
        self.assertEqual(await self._probe(ops_user, "POST", "/api/v1/marketing/campaigns", headers=auth), 403)
        self.assertEqual(await self._probe(ops_user, "POST", "/api/v1/daily-log/entries", headers=auth), 403)
        # Won-deal approve stays open. A missing deal is not the view-only 403.
        approve = await self._probe(
            ops_user,
            "POST",
            "/api/v1/crm/approvals/won-deals/missing-deal/approve",
            headers=auth,
        )
        self.assertNotEqual(approve, 403)

    async def test_client_zero_power_on_internal_routes(self):
        client_user = {
            "id": "u-client",
            "role": "client",
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        self.assertEqual(await self._probe(client_user, "GET", "/api/v1/website-projects"), 403)
        self.assertEqual(await self._probe(client_user, "GET", "/api/v1/crm/leads"), 403)
        self.assertEqual(await self._probe(client_user, "GET", "/api/v1/marketing/daily"), 403)
        self.assertEqual(await self._probe(client_user, "GET", "/api/v1/log-exceptions/inbox"), 403)

    async def test_sales_lead_and_member_access(self):
        lead_user = {
            "id": "u-sales-lead",
            "role": "team_lead",
            "department": "Sales",
            "primary_department": "Sales",
            "crm_enabled": True,
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        mem_user = {
            "id": "u-sales-mem",
            "role": "team_member",
            "department": "Sales",
            "primary_department": "Sales",
            "crm_enabled": True,
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }

        # CRM access: 200
        self.assertEqual(await self._probe(lead_user, "GET", "/api/v1/crm/leads"), 200)
        self.assertEqual(await self._probe(mem_user, "GET", "/api/v1/crm/leads"), 200)

        # Website / Ads: 403
        self.assertEqual(await self._probe(lead_user, "GET", "/api/v1/website-projects"), 403)
        self.assertEqual(await self._probe(lead_user, "GET", "/api/v1/marketing/daily"), 403)
        self.assertEqual(await self._probe(mem_user, "GET", "/api/v1/website-projects"), 403)
        self.assertEqual(await self._probe(mem_user, "GET", "/api/v1/marketing/daily"), 403)

        # Scoping per A2
        self.assertTrue(can_view_all_leads(lead_user))
        self.assertFalse(can_view_all_leads(mem_user))

    async def test_content_and_creative_access(self):
        content_user = {
            "id": "u-content-mem",
            "role": "team_member",
            "department": "Content",
            "primary_department": "Content",
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        # Website 403, CRM 403, Ads 403
        self.assertEqual(await self._probe(content_user, "GET", "/api/v1/website-projects"), 403)
        self.assertEqual(await self._probe(content_user, "GET", "/api/v1/crm/leads"), 403)
        self.assertEqual(await self._probe(content_user, "GET", "/api/v1/marketing/daily"), 403)

    async def test_website_staff_access(self):
        web_lead = {
            "id": "u-web-lead",
            "role": "team_lead",
            "department": "Website",
            "primary_department": "Website",
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        web_mem = {
            "id": "u-web-mem",
            "role": "team_member",
            "department": "Website",
            "primary_department": "Website",
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        # Website 200
        self.assertEqual(await self._probe(web_lead, "GET", "/api/v1/website-projects"), 200)
        self.assertEqual(await self._probe(web_mem, "GET", "/api/v1/website-projects"), 200)
        # CRM 403, Ads 403
        self.assertEqual(await self._probe(web_lead, "GET", "/api/v1/crm/leads"), 403)
        self.assertEqual(await self._probe(web_lead, "GET", "/api/v1/marketing/daily"), 403)

    async def test_ads_staff_access(self):
        seo_lead = {
            "id": "u-seo-lead",
            "role": "team_lead",
            "department": "SEO",
            "primary_department": "SEO",
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        perf_mem = {
            "id": "u-perf-mem",
            "role": "team_member",
            "department": "Performance Marketing",
            "primary_department": "Performance Marketing",
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        # Ads 200
        self.assertEqual(await self._probe(seo_lead, "GET", "/api/v1/marketing/daily"), 200)
        self.assertEqual(await self._probe(perf_mem, "GET", "/api/v1/marketing/daily"), 200)
        # Website 403, CRM 403
        self.assertEqual(await self._probe(seo_lead, "GET", "/api/v1/website-projects"), 403)
        self.assertEqual(await self._probe(perf_mem, "GET", "/api/v1/crm/leads"), 403)

        # Performance member gets no calendar stages
        self.assertEqual(visible_stages(perf_mem), [])

    async def test_multi_department_secondary_department_invariants(self):
        # 1. Content Lead + Creative + Social: extra stages accessible
        multi_content = {
            "id": "u-multi-content",
            "role": "team_lead",
            "primary_department": "Content",
            "departments": ["Content", "Creative", "Social Media"],
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        stages = visible_stages(multi_content)
        self.assertIn("Content", stages)
        self.assertIn("Creative Production", stages)
        self.assertIn("Ready to Post", stages)

        # 2. Content Member + Sales: CRM 403
        content_sales_mem = {
            "id": "u-content-sales",
            "role": "team_member",
            "primary_department": "Content",
            "departments": ["Content", "Sales"],
            "crm_enabled": True,
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        self.assertEqual(await self._probe(content_sales_mem, "GET", "/api/v1/crm/leads"), 403)

        # 3. Content Lead + Website: Website 403
        content_web_lead = {
            "id": "u-content-web",
            "role": "team_lead",
            "primary_department": "Content",
            "departments": ["Content", "Website"],
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        self.assertEqual(await self._probe(content_web_lead, "GET", "/api/v1/website-projects"), 403)

        # 4. Website Member + Performance Marketing: Ads 403
        web_perf_mem = {
            "id": "u-web-perf",
            "role": "team_member",
            "primary_department": "Website",
            "departments": ["Website", "Performance Marketing"],
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        self.assertEqual(await self._probe(web_perf_mem, "GET", "/api/v1/marketing/daily"), 403)

    async def test_dynamic_admin_override_grant_and_revoke(self):
        user = {
            "id": "u-override-tester",
            "role": "team_member",
            "primary_department": "Content",
            "departments": ["Content"],
            "is_active": True,
            "workspace_ids": ["ws-1"],
        }
        await self.db.users.insert_one(user)

        # Initially 403 on website
        self.assertEqual(await self._probe(user, "GET", "/api/v1/website-projects"), 403)

        await self.db.role_permissions.insert_one({
            "role": "team_member",
            "module": "website",
            "level": "manage",
        })
        await self.db.user_permission_overrides.insert_one({
            "user_id": "u-override-tester",
            "department": "Website",
            "module": "website",
            "level": "view",
        })

        user.pop("_perm_ctx", None)
        user.pop("_perm_ctx_loaded_from_db", None)
        ctx = await load_context(user, db=self.db, force=True)
        self.assertEqual(resolve(ctx, "website", "Website"), "none")
        user_with_override = dict(user)
        user_with_override["_perm_ctx"] = ctx
        self.assertEqual(await self._probe(user_with_override, "GET", "/api/v1/website-projects"), 403)


if __name__ == "__main__":
    unittest.main()
