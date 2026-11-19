"""Tests for reused role email handling, account separation, and reactivation.

Ensures:
- Successive different people using the same email (e.g. hr@) get separate accounts.
- Old history stays on the old user_id; the new user starts empty.
- Archived accounts cannot log in and retain original email in history/directory.
- Deactivated email returns clear 409 error offering two choices when no action specified.
- Reactivation restores the same person and keeps their history.
- Same-company active email returns clear 'already a member' error.
- Other-company email creates nothing and leaks nothing (neutral response).
- Brand new email works and shows in directory immediately.
- Role guards (HR cannot create admin/operations, cannot archive/reactivate admin) are enforced.
"""
from __future__ import annotations

import os
import socket
import sys
import unittest
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test-secret-key-reused-email-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"
os.environ["MONGODB_URL"] = "mongodb://127.0.0.1:27017"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx

from app.config import settings
from app.core.security import claims_with_session, create_access_token, get_password_hash
from app.database import connect_to_mongo
from app.main import app

TEST_DB = "reamarc_test_reused_email"
CID = "company_test_reused"
CID_OTHER = "company_test_other"

_real_connect = socket.socket.connect


def _loopback_only(self, addr, *a, **k):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *a, **k)
    raise OSError("outbound blocked in tests")


class TestReusedEmailMembers(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        for p in (
            mock.patch.object(socket.socket, "connect", new=_loopback_only),
            mock.patch.object(settings, "MULTI_COMPANY_ENABLED", True),
            mock.patch("app.services.push_service.send_expo_push", new=mock.AsyncMock(return_value=0)),
            mock.patch("app.services.web_push_service.send_web_push", new=mock.AsyncMock(return_value=0)),
        ):
            p.start()
            self.addCleanup(p.stop)

        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        object.__setattr__(settings, "MONGODB_URL", "mongodb://127.0.0.1:27017")
        await connect_to_mongo()
        from app.database import db_instance

        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)
        from app.core.limiter import limiter

        limiter.enabled = False

        self.company = {"id": CID, "name": CID, "slug": CID, "status": "active", "token_version": 0}
        self.company_other = {"id": CID_OTHER, "name": CID_OTHER, "slug": CID_OTHER, "status": "active", "token_version": 0}
        await self.db.companies.insert_one(dict(self.company))
        await self.db.companies.insert_one(dict(self.company_other))

        # Setup test callers: an admin and an HR user
        self.users = {}
        for uid, role in [("adm_user", "admin"), ("hr_user", "hr")]:
            u = {
                "id": uid,
                "email": f"{uid}@reamarc-test.com",
                "full_name": f"{role.upper()} Caller",
                "name": f"{role.upper()} Caller",
                "role": role,
                "hashed_password": get_password_hash("SecretPassword123!"),
                "is_active": True,
                "company_id": CID,
                "session_epoch": 0,
                "workspace_ids": [],
                "department": "HR" if role == "hr" else "All",
                "departments": ["HR"] if role == "hr" else ["All"],
                "primary_department": "HR" if role == "hr" else "All",
                "joining_date": "2026-01-01",
                "refresh_jtis": [f"web-{uid}"],
                "refresh_retired": [],
            }
            m = {
                "id": f"m_{uid}",
                "user_id": uid,
                "company_id": CID,
                "status": "active",
                "role": role,
                "workspace_ids": [],
                "token_version": 0,
                "department": "HR" if role == "hr" else "All",
                "primary_department": "HR" if role == "hr" else "All",
                "departments": ["HR"] if role == "hr" else ["All"],
            }
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            self.users[uid] = (u, m)

        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        from app.database import db_instance

        await db_instance.client.drop_database(TEST_DB)
        db_instance.client = None
        db_instance.db = None

    def _auth(self, uid):
        u, m = self.users[uid]
        base = {
            "sub": uid,
            "email": u["email"],
            "name": u["full_name"],
            "role": u["role"],
            "cid": CID,
            "workspace_ids": [],
            "mid": m["id"],
            "mtv": 0,
        }
        c = claims_with_session(u, base, company_doc=self.company, membership_doc=m)
        return {
            "Authorization": f"Bearer {create_access_token(dict(c, sid=f'web-{uid}'))}",
            "X-Requested-With": "XMLHttpRequest",
        }

    async def test_brand_new_email_works_and_shows_in_directory(self):
        """Brand-new email returns 201 with MemberResponse and appears in directory."""
        payload = {
            "full_name": "Brand New Person",
            "email": "brandnew@reamarc-test.com",
            "role": "team_member",
            "phone": "03001234567",
            "department": "Website",
            "departments": ["Website"],
            "primary_department": "Website",
            "joining_date": "2026-01-01",
        }
        r = await self.client.post("/api/v1/admin/members", json=payload, headers=self._auth("hr_user"))
        self.assertEqual(r.status_code, 201, r.text)
        created = r.json()
        self.assertIn("id", created)
        self.assertEqual(created["email"], "brandnew@reamarc-test.com")
        self.assertEqual(created["full_name"], "Brand New Person")

        # Verify listed in directory
        r_list = await self.client.get("/api/v1/admin/members", headers=self._auth("hr_user"))
        self.assertEqual(r_list.status_code, 200)
        members = r_list.json()
        found = [m for m in members if m["email"] == "brandnew@reamarc-test.com"]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["id"], created["id"])

    async def test_same_company_active_email_returns_clear_conflict_error(self):
        """Attempting to add an already active same-company email returns 409 Conflict."""
        payload = {
            "full_name": "Duplicate HR",
            "email": "hr_user@reamarc-test.com",
            "role": "team_member",
            "phone": "03001234567",
            "department": "Website",
            "joining_date": "2026-01-01",
        }
        r = await self.client.post("/api/v1/admin/members", json=payload, headers=self._auth("adm_user"))
        self.assertEqual(r.status_code, 409, r.text)
        detail = r.json().get("detail")
        self.assertIn("already", str(detail).lower())

    async def test_other_company_email_creates_nothing_and_leaks_nothing(self):
        """Email belonging to another company returns neutral 201 message and creates nothing."""
        # Insert user in Company B
        other_u = {
            "id": "usr_other_comp",
            "email": "other@othercomp.com",
            "full_name": "Secret Other Member",
            "role": "team_member",
            "is_active": True,
            "company_id": CID_OTHER,
        }
        other_m = {
            "id": "mem_other_comp",
            "user_id": "usr_other_comp",
            "company_id": CID_OTHER,
            "status": "active",
            "role": "team_member",
        }
        await self.db.users.insert_one(other_u)
        await self.db.company_memberships.insert_one(other_m)

        # Company A HR tries to add other@othercomp.com
        payload = {
            "full_name": "Phishing Attempt",
            "email": "other@othercomp.com",
            "role": "team_member",
            "phone": "03001234567",
            "department": "Website",
            "joining_date": "2026-01-01",
        }
        r = await self.client.post("/api/v1/admin/members", json=payload, headers=self._auth("hr_user"))
        self.assertEqual(r.status_code, 201)
        resp_data = r.json()
        self.assertNotIn("id", resp_data)
        self.assertEqual(resp_data.get("message"), "If this person can be added, they'll get an email")

        # Verify nothing created in Company A
        mem_in_a = await self.db.company_memberships.find_one({"company_id": CID, "user_id": "usr_other_comp"})
        self.assertIsNone(mem_in_a)

    async def test_same_company_deactivated_email_without_action_returns_two_choices_error(self):
        """When email belongs to deactivated member and no action is chosen, returns 409 with choices info."""
        # Setup deactivated member
        old_uid = "usr_prev_hr"
        await self.db.users.insert_one({
            "id": old_uid,
            "email": "hr@shared-corp.com",
            "full_name": "Alice Previous HR",
            "role": "hr",
            "is_active": False,
            "deactivated_at": "2026-10-01T00:00:00Z",
            "deactivation_date": "2026-10-01",
            "company_id": CID,
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_prev_hr",
            "user_id": old_uid,
            "company_id": CID,
            "status": "inactive",
            "role": "hr",
        })

        payload = {
            "full_name": "Bob New HR",
            "email": "hr@shared-corp.com",
            "role": "hr",
            "phone": "03007654321",
            "joining_date": "2026-01-01",
        }
        r = await self.client.post("/api/v1/admin/members", json=payload, headers=self._auth("adm_user"))
        self.assertEqual(r.status_code, 409, r.text)
        data = r.json()
        detail = data.get("detail", {})
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail.get("code"), "DEACTIVATED_MEMBER_EMAIL_REUSED")
        self.assertEqual(detail.get("previous_user_id"), old_uid)
        self.assertEqual(detail.get("previous_name"), "Alice Previous HR")
        self.assertEqual(detail.get("email"), "hr@shared-corp.com")

    async def test_new_person_on_reused_email_separates_history_and_archives_old_account(self):
        """Choice A: Add as new person releases email, separates history, and preserves archived account."""
        old_uid = "usr_alice_hr"
        old_email = "hr@corporate.com"
        old_pass = "OldAlicePassword123!"

        await self.db.users.insert_one({
            "id": old_uid,
            "email": old_email,
            "full_name": "Alice Old HR",
            "role": "hr",
            "hashed_password": get_password_hash(old_pass),
            "is_active": False,
            "deactivated_at": "2026-10-01T00:00:00Z",
            "deactivation_date": "2026-10-01",
            "company_id": CID,
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_alice_hr",
            "user_id": old_uid,
            "company_id": CID,
            "status": "inactive",
            "role": "hr",
        })

        # Alice has attendance records and daily log entries
        await self.db.attendance_records.insert_one({
            "id": "att_alice_1",
            "user_id": old_uid,
            "date": "2026-09-15",
            "status": "present",
            "company_id": CID,
        })
        await self.db.daily_log_entries.insert_one({
            "id": "log_alice_1",
            "user_id": old_uid,
            "date": "2026-09-15",
            "resource_name": "Alice Old HR",
            "company_id": CID,
        })

        # HR adds Bob using the SAME email with reused_email_action="archive_and_create"
        new_pass = "BobNewPassword123!"
        payload = {
            "full_name": "Bob New HR",
            "email": old_email,
            "role": "hr",
            "phone": "03009998877",
            "joining_date": "2026-01-01",
            "temporary_password": new_pass,
            "reused_email_action": "archive_and_create",
        }
        r = await self.client.post("/api/v1/admin/members", json=payload, headers=self._auth("hr_user"))
        self.assertEqual(r.status_code, 201, r.text)
        created = r.json()
        new_uid = created["id"]
        self.assertNotEqual(new_uid, old_uid)
        self.assertEqual(created["email"], old_email)
        self.assertEqual(created["full_name"], "Bob New HR")

        # 1. Old account email is released and archived
        old_user_doc = await self.db.users.find_one({"id": old_uid})
        self.assertEqual(old_user_doc["archived_email"], old_email)
        self.assertTrue(old_user_doc["email"].startswith("hr+archived-usr_alice_hr@"))
        self.assertFalse(old_user_doc["is_active"])
        self.assertTrue(old_user_doc.get("archived"))

        # 2. History remains under old_uid; new user starts empty
        alice_att = await self.db.attendance_records.find({"user_id": old_uid}).to_list(10)
        self.assertEqual(len(alice_att), 1)
        bob_att = await self.db.attendance_records.find({"user_id": new_uid}).to_list(10)
        self.assertEqual(len(bob_att), 0)

        alice_logs = await self.db.daily_log_entries.find({"user_id": old_uid}).to_list(10)
        self.assertEqual(len(alice_logs), 1)
        bob_logs = await self.db.daily_log_entries.find({"user_id": new_uid}).to_list(10)
        self.assertEqual(len(bob_logs), 0)

        # 3. Archived account CANNOT log in
        # With original email + old password: fails because hr@ belongs to Bob
        r_login_old = await self.client.post(
            "/api/v1/auth/login",
            json={"email": old_email, "password": old_pass},
        )
        self.assertEqual(r_login_old.status_code, 401)

        # With archived email: blocked because deactivated / archived
        r_login_arch = await self.client.post(
            "/api/v1/auth/login",
            json={"email": old_user_doc["email"], "password": old_pass},
        )
        self.assertEqual(r_login_arch.status_code, 403)

        # 4. New account CAN log in with hr@corporate.com and Bob's password
        r_login_new = await self.client.post(
            "/api/v1/auth/login",
            json={"email": old_email, "password": new_pass},
        )
        self.assertEqual(r_login_new.status_code, 200, r_login_new.text)
        token_data = r_login_new.json()
        self.assertEqual(token_data["user"]["id"], new_uid)
        self.assertEqual(token_data["user"]["name"], "Bob New HR")

        # 5. Password reset operates on the new account
        r_forgot = await self.client.post("/api/v1/auth/forgot-password", json={"email": old_email})
        self.assertEqual(r_forgot.status_code, 200)
        reset_doc = await self.db.password_resets.find_one({"email": old_email})
        self.assertIsNotNone(reset_doc)

        # 6. Team Directory lists both: old one as inactive with original name & email, new one active
        r_dir = await self.client.get("/api/v1/admin/members", headers=self._auth("adm_user"))
        self.assertEqual(r_dir.status_code, 200)
        all_members = r_dir.json()

        alice_in_dir = next((m for m in all_members if m["id"] == old_uid), None)
        self.assertIsNotNone(alice_in_dir)
        self.assertEqual(alice_in_dir["full_name"], "Alice Old HR")
        self.assertEqual(alice_in_dir["email"], old_email)
        self.assertFalse(alice_in_dir["is_active"])

        bob_in_dir = next((m for m in all_members if m["id"] == new_uid), None)
        self.assertIsNotNone(bob_in_dir)
        self.assertEqual(bob_in_dir["full_name"], "Bob New HR")
        self.assertEqual(bob_in_dir["email"], old_email)
        self.assertTrue(bob_in_dir["is_active"])

        # 7. Audit event recorded
        audit_event = await self.db.permission_audit.find_one({
            "action": "reused_email_archived_and_created",
            "target_id": new_uid,
        })
        self.assertIsNotNone(audit_event)
        self.assertEqual(audit_event["details"]["archived_user_id"], old_uid)
        self.assertEqual(audit_event["details"]["reused_email"], old_email)

    async def test_reactivate_previous_person(self):
        """Choice B: Reactivate restores the same person and keeps their history."""
        uid = "usr_returning_member"
        email = "returning@reamarc-test.com"
        await self.db.users.insert_one({
            "id": uid,
            "email": email,
            "full_name": "Carol Returning",
            "role": "team_member",
            "is_active": False,
            "deactivated_at": "2026-10-01T00:00:00Z",
            "deactivation_date": "2026-10-01",
            "company_id": CID,
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_returning",
            "user_id": uid,
            "company_id": CID,
            "status": "inactive",
            "role": "team_member",
        })
        await self.db.attendance_records.insert_one({
            "id": "att_carol",
            "user_id": uid,
            "date": "2026-09-01",
            "status": "present",
            "company_id": CID,
        })

        payload = {
            "full_name": "Carol Returning",
            "email": email,
            "role": "team_member",
            "phone": "03001112233",
            "joining_date": "2026-01-01",
            "reused_email_action": "reactivate",
        }
        r = await self.client.post("/api/v1/admin/members", json=payload, headers=self._auth("hr_user"))
        self.assertEqual(r.status_code, 201, r.text)
        data = r.json()
        self.assertEqual(data["id"], uid)
        self.assertTrue(data["is_active"])

        # DB status active
        user_doc = await self.db.users.find_one({"id": uid})
        self.assertTrue(user_doc["is_active"])
        self.assertIsNone(user_doc["deactivated_at"])

        mem_doc = await self.db.company_memberships.find_one({"id": "mem_returning"})
        self.assertEqual(mem_doc["status"], "active")

        # Attendance stays on same user_id
        att = await self.db.attendance_records.find_one({"id": "att_carol"})
        self.assertEqual(att["user_id"], uid)

    async def test_role_guards_enforced(self):
        """HR cannot create admin/operations or archive/reactivate privileged accounts."""
        # 1. HR cannot create admin
        r_admin = await self.client.post("/api/v1/admin/members", json={
            "full_name": "Admin Test",
            "email": "newadmin@reamarc-test.com",
            "role": "admin",
            "phone": "03001234567",
            "joining_date": "2026-01-01",
        }, headers=self._auth("hr_user"))
        self.assertEqual(r_admin.status_code, 400)

        # 2. HR cannot create operations
        r_ops = await self.client.post("/api/v1/admin/members", json={
            "full_name": "Ops Test",
            "email": "newops@reamarc-test.com",
            "role": "operations",
            "phone": "03001234567",
            "joining_date": "2026-01-01",
        }, headers=self._auth("hr_user"))
        self.assertEqual(r_ops.status_code, 403)

        # 3. HR cannot archive/reactivate a deactivated Admin account
        await self.db.users.insert_one({
            "id": "usr_deact_adm",
            "email": "admin_role@reamarc-test.com",
            "full_name": "Old Admin",
            "role": "admin",
            "is_active": False,
            "company_id": CID,
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_deact_adm",
            "user_id": "usr_deact_adm",
            "company_id": CID,
            "status": "inactive",
            "role": "admin",
        })

        r_reuse_adm = await self.client.post("/api/v1/admin/members", json={
            "full_name": "New Person For Admin Email",
            "email": "admin_role@reamarc-test.com",
            "role": "team_member",
            "phone": "03001234567",
            "joining_date": "2026-01-01",
            "reused_email_action": "archive_and_create",
        }, headers=self._auth("hr_user"))
        self.assertEqual(r_reuse_adm.status_code, 403)
