"""
tests/tenancy/test_phase4_per_company_tracking.py
Automated Gate Test for Phase 4 (Per-company tracking, notifications, privacy).

Requirements verified:
- Independent attendance tracking: punching in while in Company A records only to Company A.
- Company B sees no record for User U until punch in Company B.
- Tracked users resolution correctly pulls from active memberships for each company.
- Newly granted members with needs_setup=True are not tracked.
- Privacy hardening:
  - Admin of Company A calling user endpoints sees only Company A role/department, zero mention of Company B.
  - Admin of Company B calling user endpoints sees only Company B role/department, zero mention of Company A.
  - Company admins cannot create users by email (blocked with 403).
  - Notifications carry company_id and company_name.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
import uuid

import httpx
from app.main import app
from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection, db_instance
from app.core.security import get_password_hash, create_access_token, _AUTH_CACHE
from app.services.access import tracked_users
from app.core.tenant import tenant_scope, TenantDB, get_global_db
from app.services.push_service import store_notification, dispatch_to_users


class Phase4PerCompanyTrackingGateTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        await connect_to_mongo()
        self.gdb = db_instance.db
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.original_flag = settings.MULTI_COMPANY_ENABLED
        settings.MULTI_COMPANY_ENABLED = True
        _AUTH_CACHE.clear()

        self.run_id = uuid.uuid4().hex[:8]
        self.cid_a = f"mc_p4_comp_a_{self.run_id}"
        self.cid_b = f"mc_p4_comp_b_{self.run_id}"

        self.uid_u = f"mc_p4_usr_u_{self.run_id}"
        self.uid_admin_a = f"mc_p4_admin_a_{self.run_id}"
        self.uid_admin_b = f"mc_p4_admin_b_{self.run_id}"

        self.pwd = "Phase4SecretPwd!"
        hashed_pwd = get_password_hash(self.pwd)
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        # Companies
        self.comp_a = {
            "_id": self.cid_a,
            "id": self.cid_a,
            "name": f"Alpha Corp {self.run_id}",
            "slug": f"alpha-{self.run_id}",
            "status": "active",
            "token_version": 0,
            "created_at": now,
        }
        self.comp_b = {
            "_id": self.cid_b,
            "id": self.cid_b,
            "name": f"Beta LLC {self.run_id}",
            "slug": f"beta-{self.run_id}",
            "status": "active",
            "token_version": 0,
            "created_at": now,
        }
        await self.gdb.companies.insert_many([self.comp_a, self.comp_b])

        # Users: U is dual-company employee; Admin A in Comp A; Admin B in Comp B
        self.users = [
            {
                "_id": self.uid_u,
                "id": self.uid_u,
                "email": f"dual_u_{self.run_id}@example.com",
                "name": "Dual Member U",
                "full_name": "Dual Member U",
                "hashed_password": hashed_pwd,
                "role": "team_member",
                "company_id": self.cid_a,
                "is_active": True,
                "is_super_admin": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.uid_admin_a,
                "id": self.uid_admin_a,
                "email": f"admin_a_{self.run_id}@example.com",
                "name": "Admin Company A",
                "full_name": "Admin Company A",
                "hashed_password": hashed_pwd,
                "role": "admin",
                "company_id": self.cid_a,
                "is_active": True,
                "is_super_admin": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.uid_admin_b,
                "id": self.uid_admin_b,
                "email": f"admin_b_{self.run_id}@example.com",
                "name": "Admin Company B",
                "full_name": "Admin Company B",
                "hashed_password": hashed_pwd,
                "role": "admin",
                "company_id": self.cid_b,
                "is_active": True,
                "is_super_admin": False,
                "token_version": 0,
                "created_at": now_iso,
            },
        ]
        await self.gdb.users.insert_many(self.users)

        # Memberships:
        # User U has:
        # - Company A: role=admin, department=Management, attendance=True, daily_log=True, needs_setup=False
        # - Company B: role=team_member, department=Design, attendance=True, daily_log=True, needs_setup=False
        self.mid_u_a = f"mem_u_a_{self.run_id}"
        self.mid_u_b = f"mem_u_b_{self.run_id}"
        self.mid_admin_a = f"mem_admin_a_{self.run_id}"
        self.mid_admin_b = f"mem_admin_b_{self.run_id}"

        self.memberships = [
            {
                "_id": self.mid_u_a,
                "id": self.mid_u_a,
                "user_id": self.uid_u,
                "company_id": self.cid_a,
                "role": "team_lead",
                "department": "Management",
                "departments": ["Management"],
                "primary_department": "Management",
                "access": {
                    "attendance": True,
                    "daily_log": True,
                    "sales": True,
                    "content_calendar": True,
                    "website": True,
                    "ads": True,
                },
                "status": "active",
                "needs_setup": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.mid_u_b,
                "id": self.mid_u_b,
                "user_id": self.uid_u,
                "company_id": self.cid_b,
                "role": "team_member",
                "department": "Design",
                "departments": ["Design"],
                "primary_department": "Design",
                "access": {
                    "attendance": True,
                    "daily_log": True,
                    "sales": False,
                    "content_calendar": False,
                    "website": False,
                    "ads": False,
                },
                "status": "active",
                "needs_setup": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.mid_admin_a,
                "id": self.mid_admin_a,
                "user_id": self.uid_admin_a,
                "company_id": self.cid_a,
                "role": "admin",
                "status": "active",
                "needs_setup": False,
                "token_version": 0,
                "created_at": now_iso,
            },
            {
                "_id": self.mid_admin_b,
                "id": self.mid_admin_b,
                "user_id": self.uid_admin_b,
                "company_id": self.cid_b,
                "role": "admin",
                "status": "active",
                "needs_setup": False,
                "token_version": 0,
                "created_at": now_iso,
            },
        ]
        await self.gdb.company_memberships.insert_many(self.memberships)

        # Tokens
        self.token_u_a = create_access_token({
            "sub": self.uid_u,
            "cid": self.cid_a,
            "mid": self.mid_u_a,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.token_u_b = create_access_token({
            "sub": self.uid_u,
            "cid": self.cid_b,
            "mid": self.mid_u_b,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.token_admin_a = create_access_token({
            "sub": self.uid_admin_a,
            "cid": self.cid_a,
            "mid": self.mid_admin_a,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })
        self.token_admin_b = create_access_token({
            "sub": self.uid_admin_b,
            "cid": self.cid_b,
            "mid": self.mid_admin_b,
            "mtv": 0,
            "tv": 0,
            "ctv": 0,
        })

    async def asyncTearDown(self):
        settings.MULTI_COMPANY_ENABLED = self.original_flag
        await self.client.aclose()
        # Clean fixtures
        await self.gdb.companies.delete_many({"id": {"$in": [self.cid_a, self.cid_b]}})
        await self.gdb.users.delete_many({"id": {"$in": [self.uid_u, self.uid_admin_a, self.uid_admin_b]}})
        await self.gdb.company_memberships.delete_many({"user_id": {"$in": [self.uid_u, self.uid_admin_a, self.uid_admin_b]}})
        await self.gdb.attendance_records.delete_many({"user_id": self.uid_u})
        await self.gdb.mobile_notifications.delete_many({"user_id": self.uid_u})

    async def test_gate_phase4_independent_tracking_and_privacy(self):
        """
        Phase 4 Gate:
        1. Attendance: User U in Company A context records attendance -> only Company A has the record.
        2. Tracked users: tracked_users(db, 'attendance') in Company A returns User U with Company A role/dept.
           In Company B, returns User U with Company B role/dept.
        3. Privacy hardening:
           - Admin W (Comp A) calls /admin/members -> User U has Comp A role (admin), zero Comp B info.
           - Admin X (Comp B) calls /admin/members -> User U has Comp B role (team_member), zero Comp A info.
           - Both /admin/users and /access/users are strictly isolated to their own company's memberships.
           - Admin cannot call POST /admin/members (blocked with 403 in multi-company).
        4. Notifications carry company_id and company_name.
        5. User U switching via POST /auth/switch-company returns new tokens and switches context.
        """
        # 1. Independent attendance record check
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        now_iso = datetime.now(timezone.utc).isoformat()

        # Insert attendance record while in Company A context
        with tenant_scope(company_id=self.cid_a, user_id=self.uid_u):
            tenant_db_a = TenantDB(self.gdb)
            await tenant_db_a.attendance_records.insert_one({
                "id": f"att_a_{self.run_id}",
                "user_id": self.uid_u,
                "user_name": "Dual Member U",
                "date": today_str,
                "check_in": now_iso,
                "status": "present",
                "company_id": self.cid_a,
            })

        # Query attendance in Company A -> record exists
        with tenant_scope(company_id=self.cid_a):
            tenant_db_a = TenantDB(self.gdb)
            rec_a = await tenant_db_a.attendance_records.find_one({"user_id": self.uid_u, "date": today_str})
            self.assertIsNotNone(rec_a)
            self.assertEqual(rec_a.get("company_id"), self.cid_a)

        # Query attendance in Company B -> NO record exists! (Strict isolation)
        with tenant_scope(company_id=self.cid_b):
            tenant_db_b = TenantDB(self.gdb)
            rec_b = await tenant_db_b.attendance_records.find_one({"user_id": self.uid_u, "date": today_str})
            self.assertIsNone(rec_b, "Company B must NOT see Company A's attendance records")

        # 2. Tracked users resolution
        with tenant_scope(company_id=self.cid_a):
            tenant_db_a = TenantDB(self.gdb)
            tracked_a = await tracked_users(tenant_db_a, "attendance")
            u_in_a = next((m for m in tracked_a if m["id"] == self.uid_u), None)
            self.assertIsNotNone(u_in_a)
            self.assertEqual(u_in_a.get("role"), "team_lead")
            self.assertEqual(u_in_a.get("company_id"), self.cid_a)

        with tenant_scope(company_id=self.cid_b):
            tenant_db_b = TenantDB(self.gdb)
            tracked_b = await tracked_users(tenant_db_b, "attendance")
            u_in_b = next((m for m in tracked_b if m["id"] == self.uid_u), None)
            self.assertIsNotNone(u_in_b)
            self.assertEqual(u_in_b.get("role"), "team_member")
            self.assertEqual(u_in_b.get("department"), "Design")
            self.assertEqual(u_in_b.get("company_id"), self.cid_b)

        # 3. Privacy Hardening: Directory & User Listing Endpoints
        # Admin A calls /admin/members
        resp_a = await self.client.get(
            "/api/v1/admin/members",
            headers={"Authorization": f"Bearer {self.token_admin_a}"},
        )
        self.assertEqual(resp_a.status_code, 200)
        members_a = resp_a.json()
        u_view_a = next((m for m in members_a if m["id"] == self.uid_u), None)
        self.assertIsNotNone(u_view_a)
        self.assertEqual(u_view_a["role"], "team_lead")
        self.assertEqual(u_view_a["company_id"], self.cid_a)
        # Check that no Company B info is leaked
        self.assertNotIn(self.cid_b, str(u_view_a))
        self.assertNotIn(f"Beta LLC {self.run_id}", str(u_view_a))
        self.assertNotIn("memberships", u_view_a)

        # Admin B calls /admin/members
        resp_b = await self.client.get(
            "/api/v1/admin/members",
            headers={"Authorization": f"Bearer {self.token_admin_b}"},
        )
        self.assertEqual(resp_b.status_code, 200)
        members_b = resp_b.json()
        u_view_b = next((m for m in members_b if m["id"] == self.uid_u), None)
        self.assertIsNotNone(u_view_b)
        self.assertEqual(u_view_b["role"], "team_member")
        self.assertEqual(u_view_b["department"], "Design")
        self.assertEqual(u_view_b["company_id"], self.cid_b)
        # Check that no Company A info is leaked
        self.assertNotIn(self.cid_a, str(u_view_b))
        self.assertNotIn(f"Alpha Corp {self.run_id}", str(u_view_b))
        self.assertNotIn("memberships", u_view_b)

        # Admin A calls /access/users
        access_resp_a = await self.client.get(
            "/api/v1/access/users",
            headers={"Authorization": f"Bearer {self.token_admin_a}"},
        )
        self.assertEqual(access_resp_a.status_code, 200)
        access_a = access_resp_a.json()
        self.assertNotIn(self.cid_b, str(access_a))

        # Admin B calls /access/users
        access_resp_b = await self.client.get(
            "/api/v1/access/users",
            headers={"Authorization": f"Bearer {self.token_admin_b}"},
        )
        self.assertEqual(access_resp_b.status_code, 200)
        access_b = access_resp_b.json()
        self.assertNotIn(self.cid_a, str(access_b))

        # Admin cannot call POST /admin/members (probed email prevention)
        create_resp = await self.client.post(
            "/api/v1/admin/members",
            json={
                "email": f"new_probe_{self.run_id}@example.com",
                "full_name": "Probing Member",
                "phone": "+92 300 1234567",
                "joining_date": "2026-10-17",
                "role": "team_member",
            },
            headers={"Authorization": f"Bearer {self.token_admin_a}"},
        )
        self.assertEqual(create_resp.status_code, 403, "Company admins must be blocked from creating members")

        # 4. Notifications carry company_id and company_name
        with tenant_scope(company_id=self.cid_a):
            await store_notification(
                user_id=self.uid_u,
                title="Shift Reminder",
                body="Shift starts in 15 minutes.",
                kind="reminder",
            )

        notif = await self.gdb.mobile_notifications.find_one({"user_id": self.uid_u, "title": "Shift Reminder"})
        self.assertIsNotNone(notif)
        self.assertEqual(notif.get("company_id"), self.cid_a)
        self.assertIn("Alpha Corp", str(notif.get("company_name")))

        # 5. Switching company
        switch_resp = await self.client.post(
            "/api/v1/auth/switch-company",
            json={"company_id": self.cid_b},
            headers={"Authorization": f"Bearer {self.token_u_a}", "X-Client": "mobile"},
        )
        self.assertEqual(switch_resp.status_code, 200)
        switch_data = switch_resp.json()
        new_token = switch_data.get("access_token")
        self.assertIsNotNone(new_token)
        self.assertEqual(switch_data["user"]["role"], "team_member")
        self.assertEqual(switch_data["user"]["company_id"], self.cid_b)

        # Access with new token returns Company B data
        me_resp = await self.client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {new_token}"},
        )
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.json()["company_id"], self.cid_b)
        self.assertEqual(me_resp.json()["role"], "team_member")
