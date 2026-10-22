"""
tests/tenancy/test_branding_tenancy.py
Phase 7 Gate Tests: Dynamic CSS Branding, White-Labeling, and Zero Reamarc Leakage
Verifies:
1. /api/v1/auth/me returns company-scoped branding (name, accent_color, logo_url, timezone) without cross-tenant bleed.
2. /crm/public/scheduler/config returns tenant-scoped company name and accent color based on booking slug.
3. /api/v1/content-calendar/public/review/{token} returns tenant-scoped company branding.
4. Tenant B public responses have zero reference to 'Reamarc'.
5. Static code audit asserts public client views use dynamic branding variables.
"""

from __future__ import annotations

import asyncio
import os
import unittest
import sys
from pathlib import Path
import httpx

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
root_dir = str(Path(__file__).resolve().parent.parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app.config import settings
from app.database import db_instance
from app.main import app
from app.core.security import create_access_token, _AUTH_CACHE
from tests.tenancy.seed import (
    seed_tenancy_async,
    clean_tenancy_async,
)

CID_A = "tnt_comp_a"
CID_B = "tnt_comp_b"


class TestBrandingTenancy(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        settings.MULTI_TENANT_ENABLED = True
        _AUTH_CACHE.clear()

        from motor.motor_asyncio import AsyncIOMotorClient
        self.client_mongo = AsyncIOMotorClient("mongodb://localhost:27017")
        self.db = self.client_mongo["reamarc_test_db"]
        db_instance.client = self.client_mongo
        db_instance.db = self.db

        await clean_tenancy_async(self.db)
        await seed_tenancy_async(self.db)

        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(
            transport=self.transport,
            base_url="http://testserver",
            headers={"host": "testserver"},
        )

        # Build tokens
        self.tok_a_admin = create_access_token(
            {"sub": "tnt_user_a_admin", "email": "admin@a.test", "cid": CID_A, "tv": 0, "ctv": 0, "role": "admin"}
        )
        self.tok_b_admin = create_access_token(
            {"sub": "tnt_user_b_admin", "email": "admin@b.test", "cid": CID_B, "tv": 0, "ctv": 0, "role": "admin"}
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        await clean_tenancy_async(self.db)
        self.client_mongo.close()

    async def test_auth_me_branding_isolation(self):
        """Verify /auth/me returns company-specific branding for each tenant."""
        # Tenant A
        resp_a = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {self.tok_a_admin}"},
        )
        self.assertEqual(resp_a.status_code, 200)
        data_a = resp_a.json()
        self.assertIn("company", data_a)
        comp_a = data_a["company"]
        self.assertEqual(comp_a["id"], CID_A)
        self.assertEqual(comp_a["name"], "Reamarc")
        self.assertEqual(comp_a["accent_color"], "#6847E0")

        # Tenant B
        resp_b = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {self.tok_b_admin}"},
        )
        self.assertEqual(resp_b.status_code, 200)
        data_b = resp_b.json()
        self.assertIn("company", data_b)
        comp_b = data_b["company"]
        self.assertEqual(comp_b["id"], CID_B)
        self.assertEqual(comp_b["name"], "Sample Co")
        self.assertEqual(comp_b["accent_color"], "#00AA66")
        self.assertNotIn("Reamarc", str(comp_b))

    async def test_public_scheduler_branding_isolation(self):
        """Verify public meeting scheduler config dynamically presents tenant branding."""
        # Company A scheduler
        resp_a = await self.client.get("/crm/public/scheduler/config?slug=booking-a")
        self.assertEqual(resp_a.status_code, 200)
        data_a = resp_a.json()
        self.assertEqual(data_a.get("company_name"), "Reamarc")
        self.assertEqual(data_a.get("accent_color"), "#6847E0")

        # Company B scheduler
        resp_b = await self.client.get("/crm/public/scheduler/config?slug=booking-b")
        self.assertEqual(resp_b.status_code, 200)
        data_b = resp_b.json()
        self.assertEqual(data_b.get("company_name"), "Sample Co")
        self.assertEqual(data_b.get("accent_color"), "#00AA66")
        # Assert ZERO leakage of "Reamarc" in Company B's public configuration
        raw_b_str = resp_b.text
        self.assertNotIn("Reamarc", raw_b_str, "Company B scheduler leaked Reamarc branding")

    async def test_public_campaign_review_branding_isolation(self):
        """Verify public campaign review dynamically presents tenant branding."""
        # Review item A
        resp_a = await self.client.get("/api/v1/content-calendar/public/review/tnt_rev_token_a")
        self.assertEqual(resp_a.status_code, 200)
        data_a = resp_a.json()
        self.assertEqual(data_a.get("company_name"), "Reamarc")
        self.assertEqual(data_a.get("company", {}).get("accent_color"), "#6847E0")

        # Review item B
        resp_b = await self.client.get("/api/v1/content-calendar/public/review/tnt_rev_token_b")
        self.assertEqual(resp_b.status_code, 200)
        data_b = resp_b.json()
        self.assertEqual(data_b.get("company_name"), "Sample Co")
        self.assertEqual(data_b.get("company", {}).get("accent_color"), "#00AA66")
        # Assert ZERO leakage of "Reamarc" in Company B's review payload
        raw_b_str = resp_b.text
        self.assertNotIn("Reamarc", raw_b_str, "Company B campaign review leaked Reamarc branding")

    def test_frontend_branding_components_audit(self):
        """Audit frontend components to ensure no hardcoded 'Reamarc' in public views."""
        base_path = Path(__file__).resolve().parent.parent.parent
        
        # 1. BrandingProvider must export useBranding and inject CSS variables
        branding_provider_path = base_path / "src" / "context" / "BrandingProvider.tsx"
        self.assertTrue(branding_provider_path.exists())
        bp_content = branding_provider_path.read_text(encoding="utf-8")
        self.assertIn("useBranding", bp_content)
        self.assertIn("--accent", bp_content)
        self.assertIn("--accent-hover", bp_content)

        # 2. BrandMark must accept initial / logo_url
        brand_mark_path = base_path / "src" / "components" / "ui" / "BrandMark.tsx"
        bm_content = brand_mark_path.read_text(encoding="utf-8")
        self.assertIn("initial", bm_content)
        self.assertIn("logoUrl", bm_content)

        # 3. PublicClientReviewView must use dynamic agencyName
        review_view_path = base_path / "src" / "components" / "views" / "PublicClientReviewView.tsx"
        cr_content = review_view_path.read_text(encoding="utf-8")
        self.assertNotIn("· Reamarc", cr_content)
        self.assertIn("agencyName", cr_content)

        # 4. PublicSchedulerView must use dynamic config.company_name
        scheduler_view_path = base_path / "src" / "components" / "views" / "PublicSchedulerView.tsx"
        ps_content = scheduler_view_path.read_text(encoding="utf-8")
        self.assertNotIn("Reamarc Team", ps_content)
        self.assertNotIn("Join Reamarc", ps_content)
        self.assertIn("config.company_name", ps_content)


if __name__ == "__main__":
    unittest.main()
