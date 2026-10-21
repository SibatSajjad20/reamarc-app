"""
tests/tenancy/test_mobile_tenancy.py
Phase 8 Gate Tests: Mobile App Compatibility & Company Suspension Screen
Verifies:
1. Mobile device registration scopes device record to caller's company_id.
2. Cross-tenant device list isolation: Admin A only sees Company A devices; Admin B only sees Company B devices.
3. Push notification dispatch isolation: Tenant A broadcast only dispatches to Tenant A users; Tenant B users receive 0 notifications.
4. Notifications feed isolation: Tenant B user cannot read Tenant A notifications.
5. Company suspension enforcement on mobile/API: Company C (suspended) users receive 403 'This company\'s access is paused.' on login and authenticated requests.
6. Frontend suspension gate audit: CompanySuspensionGate component exists, displays company name, and blocks navigation.
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
CID_C = "tnt_comp_c"  # Suspended company in seed


class TestMobileTenancy(unittest.IsolatedAsyncioTestCase):
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
        self.tok_a_member = create_access_token(
            {"sub": "tnt_user_a_team_member", "email": "member@a.test", "cid": CID_A, "tv": 0, "ctv": 0, "role": "team_member"}
        )
        self.tok_b_admin = create_access_token(
            {"sub": "tnt_user_b_admin", "email": "admin@b.test", "cid": CID_B, "tv": 0, "ctv": 0, "role": "admin"}
        )
        self.tok_b_member = create_access_token(
            {"sub": "tnt_user_b_team_member", "email": "member@b.test", "cid": CID_B, "tv": 0, "ctv": 0, "role": "team_member"}
        )
        self.tok_c_member = create_access_token(
            {"sub": "tnt_user_c_team_member", "email": "member@c.test", "cid": CID_C, "tv": 0, "ctv": 0, "role": "team_member"}
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        await clean_tenancy_async(self.db)
        self.client_mongo.close()

    async def test_mobile_device_registration_scoping(self):
        """Verify device registration stamps caller's company_id and scopes to tenant."""
        # 1. Register device for Member A
        reg_a = await self.client.post(
            "/api/v1/mobile/register-device",
            headers={"Authorization": f"Bearer {self.tok_a_member}"},
            json={
                "device_uuid": "uuid-phone-a-1",
                "device_name": "Pixel 7 Pro",
                "platform": "android",
                "push_token": "ExponentPushToken[token-phone-a-1]",
            },
        )
        self.assertEqual(reg_a.status_code, 200)

        # 2. Register device for Member B
        reg_b = await self.client.post(
            "/api/v1/mobile/register-device",
            headers={"Authorization": f"Bearer {self.tok_b_member}"},
            json={
                "device_uuid": "uuid-phone-b-1",
                "device_name": "Galaxy S23",
                "platform": "android",
                "push_token": "ExponentPushToken[token-phone-b-1]",
            },
        )
        self.assertEqual(reg_b.status_code, 200)

        # 3. Verify in raw MongoDB that each device is stamped with correct company_id
        dev_a = await self.db.mobile_devices.find_one({"device_uuid": "uuid-phone-a-1"})
        self.assertIsNotNone(dev_a)
        self.assertEqual(dev_a.get("company_id"), CID_A)

        dev_b = await self.db.mobile_devices.find_one({"device_uuid": "uuid-phone-b-1"})
        self.assertIsNotNone(dev_b)
        self.assertEqual(dev_b.get("company_id"), CID_B)

        # 4. GET /api/v1/mobile/devices by Admin A should ONLY return Member A's device
        list_a = await self.client.get(
            "/api/v1/mobile/devices",
            headers={"Authorization": f"Bearer {self.tok_a_admin}"},
        )
        self.assertEqual(list_a.status_code, 200)
        devices_a = list_a.json()
        self.assertTrue(any(d["device_uuid"] == "uuid-phone-a-1" for d in devices_a))
        self.assertFalse(any(d["device_uuid"] == "uuid-phone-b-1" for d in devices_a))

        # 5. GET /api/v1/mobile/devices by Admin B should ONLY return Member B's device
        list_b = await self.client.get(
            "/api/v1/mobile/devices",
            headers={"Authorization": f"Bearer {self.tok_b_admin}"},
        )
        self.assertEqual(list_b.status_code, 200)
        devices_b = list_b.json()
        self.assertTrue(any(d["device_uuid"] == "uuid-phone-b-1" for d in devices_b))
        self.assertFalse(any(d["device_uuid"] == "uuid-phone-a-1" for d in devices_b))

    async def test_push_broadcast_and_notification_isolation(self):
        """Verify notification broadcast by Tenant A dispatches only to Tenant A users."""
        # 1. Admin A broadcasts a message
        broadcast_resp = await self.client.post(
            "/api/v1/mobile/broadcast",
            headers={"Authorization": f"Bearer {self.tok_a_admin}"},
            json={
                "title": "All Hands Meeting",
                "body": "Company A all hands in 10 minutes",
                "user_ids": ["tnt_user_a_team_member"],
            },
        )
        self.assertEqual(broadcast_resp.status_code, 200)

        # 2. Member A checks notifications
        notifs_a = await self.client.get(
            "/api/v1/mobile/notifications",
            headers={"Authorization": f"Bearer {self.tok_a_member}"},
        )
        self.assertEqual(notifs_a.status_code, 200)
        items_a = notifs_a.json()
        self.assertTrue(any("Company A all hands" in n.get("body", "") for n in items_a))

        # 3. Member B checks notifications — MUST be empty (0 cross-tenant bleed)
        notifs_b = await self.client.get(
            "/api/v1/mobile/notifications",
            headers={"Authorization": f"Bearer {self.tok_b_member}"},
        )
        self.assertEqual(notifs_b.status_code, 200)
        items_b = notifs_b.json()
        self.assertFalse(any("Company A all hands" in n.get("body", "") for n in items_b))

    async def test_suspended_company_access_gate(self):
        """Verify suspended company C users are blocked with 403 'This company\'s access is paused.'"""
        # 1. Attempt login with Company C user credentials
        login_resp = await self.client.post(
            "/api/v1/auth/login",
            json={"email": "team_member_c@tnt-example.com", "password": "Secret123!"},
        )
        self.assertEqual(login_resp.status_code, 403)
        self.assertIn("This company's access is paused.", login_resp.json().get("detail", ""))

        # 2. Attempt authenticated request with preexisting token for Company C
        me_resp = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {self.tok_c_member}"},
        )
        self.assertEqual(me_resp.status_code, 403)
        self.assertIn("This company's access is paused.", me_resp.json().get("detail", ""))

        # 3. Attempt mobile endpoint with Company C token
        mob_resp = await self.client.get(
            "/api/v1/mobile/notifications",
            headers={"Authorization": f"Bearer {self.tok_c_member}"},
        )
        self.assertEqual(mob_resp.status_code, 403)
        self.assertIn("This company's access is paused.", mob_resp.json().get("detail", ""))

    def test_frontend_suspension_gate_audit(self):
        """Verify frontend CompanySuspensionGate is mounted and rendered."""
        base_path = Path(__file__).resolve().parent.parent.parent
        gate_path = base_path / "src" / "components" / "ui" / "CompanySuspensionGate.tsx"
        self.assertTrue(gate_path.exists())
        content = gate_path.read_text(encoding="utf-8")
        self.assertIn("Access Paused", content)
        self.assertIn("useBranding", content)
        self.assertIn("logout", content)

        # Verify App.tsx mounts CompanySuspensionGate
        app_path = base_path / "src" / "App.tsx"
        app_content = app_path.read_text(encoding="utf-8")
        self.assertIn("CompanySuspensionGate", app_content)
        self.assertIn("user?.company?.status === 'suspended'", app_content)


if __name__ == "__main__":
    unittest.main()
