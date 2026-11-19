"""HR role limits and client account creation in Team directory.

- HR can only create/assign Team Member, Team Lead, and Client (never HR, Operations, Admin).
- Admin keeps HR/Operations, still can't create Admin from Team directory.
- A client login linked to a workspace that already has a client login is created
  (several client logins per client workspace are allowed) and never returns a fake success.
- Client logins don't require a phone; staff still do.
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

TEST_DB = "reamarc_test_hr_roles_client"
CID = "company_test_reused"
CID_OTHER = "company_test_other"

_real_connect = socket.socket.connect


def _loopback_only(self, addr, *a, **k):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *a, **k)
    raise OSError("outbound blocked in tests")


class TestHrRolesAndClientCreate(unittest.IsolatedAsyncioTestCase):
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

        for ws_id, name in (("ws_acme", "Acme Foods"), ("ws_beta", "Beta Labs")):
            await self.db.workspaces.insert_one({
                "id": ws_id,
                "name": name,
                "status": "active",
                "company_id": CID,
            })

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


    def _member(self, email, role="team_member", **extra):
        payload = {
            "full_name": extra.pop("full_name", "Test Person"),
            "email": email,
            "role": role,
            "joining_date": "2026-01-01",
        }
        if role != "client":
            payload.update({"phone": "03001234567", "department": "Website", "departments": ["Website"], "primary_department": "Website"})
        payload.update(extra)
        return payload

    async def _post(self, payload, caller="hr_user"):
        return await self.client.post("/api/v1/admin/members", json=payload, headers=self._auth(caller))

    # ---- Bug 2: HR role limits -------------------------------------------------

    async def test_hr_cannot_create_hr_operations_or_admin(self):
        for role in ("hr", "operations", "admin"):
            email = f"new_{role}@reamarc-test.com"
            r = await self._post(self._member(email, role=role))
            self.assertEqual(r.status_code, 403, f"{role}: {r.text}")
            self.assertIn("HR can only create", r.text)
            self.assertIsNone(await self.db.users.find_one({"email": email}))

    async def test_hr_can_create_team_member_team_lead_and_client(self):
        for role in ("team_member", "team_lead"):
            r = await self._post(self._member(f"ok_{role}@reamarc-test.com", role=role))
            self.assertEqual(r.status_code, 201, r.text)
            self.assertTrue(r.json().get("id"))
            self.assertEqual(r.json().get("role"), role)
        r = await self._post(self._member("ok_client@acme.com", role="client", workspace_ids=["ws_acme"]))
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json().get("role"), "client")
        self.assertEqual(r.json().get("workspace_ids"), ["ws_acme"])

    async def test_admin_can_create_hr_and_operations_but_not_admin(self):
        r = await self._post(self._member("admin_made_hr@reamarc-test.com", role="hr"), caller="adm_user")
        self.assertEqual(r.status_code, 201, r.text)
        r = await self._post(self._member("admin_made_ops@reamarc-test.com", role="operations"), caller="adm_user")
        self.assertEqual(r.status_code, 201, r.text)
        r = await self._post(self._member("admin_made_admin@reamarc-test.com", role="admin"), caller="adm_user")
        self.assertEqual(r.status_code, 400, r.text)

    async def test_hr_cannot_promote_to_hr_operations_or_admin(self):
        r = await self._post(self._member("promote_me@reamarc-test.com"))
        self.assertEqual(r.status_code, 201, r.text)
        uid = r.json()["id"]
        for role in ("hr", "operations", "admin"):
            r = await self.client.patch(
                f"/api/v1/admin/members/{uid}", json={"role": role}, headers=self._auth("hr_user")
            )
            self.assertEqual(r.status_code, 403, f"{role}: {r.text}")
        mem = await self.db.company_memberships.find_one({"user_id": uid, "company_id": CID})
        user = await self.db.users.find_one({"id": uid})
        self.assertEqual(mem["role"], "team_member")
        self.assertEqual(user["role"], "team_member")

        # Team lead is still allowed.
        r = await self.client.patch(
            f"/api/v1/admin/members/{uid}", json={"role": "team_lead"}, headers=self._auth("hr_user")
        )
        self.assertEqual(r.status_code, 200, r.text)

    async def test_admin_can_still_promote_to_hr(self):
        r = await self._post(self._member("admin_promotes@reamarc-test.com"))
        uid = r.json()["id"]
        r = await self.client.patch(
            f"/api/v1/admin/members/{uid}", json={"role": "hr"}, headers=self._auth("adm_user")
        )
        self.assertEqual(r.status_code, 200, r.text)

    async def test_hr_cannot_reuse_or_reactivate_a_deactivated_hr_account(self):
        await self.db.users.insert_one({
            "id": "usr_old_hr", "email": "hr@corp-test.com", "full_name": "Old HR",
            "role": "hr", "is_active": False, "company_id": CID,
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_old_hr", "user_id": "usr_old_hr", "company_id": CID, "status": "inactive", "role": "hr",
        })
        for action in ("reactivate", "archive_and_create"):
            r = await self._post(self._member("hr@corp-test.com", reused_email_action=action))
            self.assertEqual(r.status_code, 403, f"{action}: {r.text}")
        old = await self.db.users.find_one({"id": "usr_old_hr"})
        self.assertEqual(old["email"], "hr@corp-test.com")
        self.assertFalse(old["is_active"])

    # ---- Bug 1: client creation ------------------------------------------------

    async def test_second_client_login_on_same_workspace_is_created(self):
        r1 = await self._post(self._member("first@acme.com", role="client", full_name="First Client", workspace_ids=["ws_acme"]))
        self.assertEqual(r1.status_code, 201, r1.text)
        r2 = await self._post(self._member("second@acme.com", role="client", full_name="Second Client", workspace_ids=["ws_acme"]))
        self.assertEqual(r2.status_code, 201, r2.text)
        body = r2.json()
        self.assertTrue(body.get("id"))
        self.assertNotEqual(body["id"], r1.json()["id"])
        self.assertEqual(body["workspace_ids"], ["ws_acme"])

        clients = await self.db.users.find({"role": "client", "workspace_ids": "ws_acme"}).to_list(10)
        self.assertEqual({c["email"] for c in clients}, {"first@acme.com", "second@acme.com"})

        r_list = await self.client.get("/api/v1/admin/members", headers=self._auth("hr_user"))
        listed = {m["email"] for m in r_list.json()}
        self.assertIn("first@acme.com", listed)
        self.assertIn("second@acme.com", listed)

    async def test_client_with_existing_client_email_is_a_clear_conflict_not_fake_success(self):
        r1 = await self._post(self._member("shared@acme.com", role="client", workspace_ids=["ws_acme"]))
        self.assertEqual(r1.status_code, 201, r1.text)
        r2 = await self._post(self._member("shared@acme.com", role="client", full_name="Someone Else", workspace_ids=["ws_acme"]))
        self.assertEqual(r2.status_code, 409, r2.text)
        self.assertIn("already", r2.text.lower())
        self.assertEqual(await self.db.users.count_documents({"email": "shared@acme.com"}), 1)

    async def test_client_on_unknown_or_inactive_workspace_is_rejected(self):
        await self.db.workspaces.insert_one({"id": "ws_old", "name": "Old", "status": "inactive", "company_id": CID})
        for ws in (["ws_missing"], ["ws_old"], []):
            r = await self._post(self._member(f"bad_ws_{len(ws)}_{ws[0] if ws else 'none'}@acme.com", role="client", workspace_ids=ws))
            self.assertEqual(r.status_code, 400, r.text)
            self.assertNotIn('"id"', r.text)

    async def test_bad_workspace_does_not_archive_previous_account(self):
        await self.db.users.insert_one({
            "id": "usr_old_client", "email": "contact@acme.com", "full_name": "Old Contact",
            "role": "client", "is_active": False, "company_id": CID, "workspace_ids": ["ws_acme"],
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_old_client", "user_id": "usr_old_client", "company_id": CID, "status": "inactive", "role": "client",
        })
        r = await self._post(self._member(
            "contact@acme.com", role="client", workspace_ids=["ws_missing"], reused_email_action="archive_and_create",
        ))
        self.assertEqual(r.status_code, 400, r.text)
        old = await self.db.users.find_one({"id": "usr_old_client"})
        self.assertEqual(old["email"], "contact@acme.com")
        self.assertFalse(old.get("archived", False))

    async def test_other_company_email_for_client_is_neutral_and_not_created(self):
        await self.db.users.insert_one({
            "id": "usr_b_client", "email": "b@other.com", "full_name": "B Person",
            "role": "client", "is_active": True, "company_id": CID_OTHER,
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_b_client", "user_id": "usr_b_client", "company_id": CID_OTHER, "status": "active", "role": "client",
        })
        r = await self._post(self._member("b@other.com", role="client", workspace_ids=["ws_acme"]))
        self.assertNotEqual(r.status_code, 201, r.text)
        body = r.json()
        self.assertIs(body.get("created"), False)
        self.assertNotIn("id", body)
        self.assertNotIn(CID_OTHER, r.text)
        self.assertIsNone(await self.db.company_memberships.find_one({"user_id": "usr_b_client", "company_id": CID}))

    # ---- Client phone ----------------------------------------------------------

    async def test_client_needs_no_phone_but_staff_still_do(self):
        r = await self._post(self._member("nophone@acme.com", role="client", workspace_ids=["ws_acme"]))
        self.assertEqual(r.status_code, 201, r.text)
        self.assertIsNone(r.json().get("phone"))
        staff = self._member("staff_nophone@reamarc-test.com")
        staff.pop("phone")
        r = await self._post(staff)
        self.assertEqual(r.status_code, 422, r.text)

    async def test_client_edit_keeps_stored_phone_and_updates_workspace(self):
        await self.db.users.insert_one({
            "id": "usr_legacy_client", "email": "legacy@acme.com", "full_name": "Legacy Client",
            "role": "client", "is_active": True, "company_id": CID, "workspace_ids": ["ws_acme"],
            "phone": "+92 300 1112233", "phone_number": "+92 300 1112233",
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_legacy_client", "user_id": "usr_legacy_client", "company_id": CID, "status": "active", "role": "client",
        })
        r = await self.client.patch(
            "/api/v1/admin/members/usr_legacy_client",
            json={"full_name": "Legacy Client Renamed", "workspace_ids": ["ws_beta"]},
            headers=self._auth("hr_user"),
        )
        self.assertEqual(r.status_code, 200, r.text)
        doc = await self.db.users.find_one({"id": "usr_legacy_client"})
        self.assertEqual(doc["phone"], "+92 300 1112233")
        self.assertEqual(doc["workspace_ids"], ["ws_beta"])
        self.assertEqual(doc["full_name"], "Legacy Client Renamed")

        r = await self.client.patch(
            "/api/v1/admin/members/usr_legacy_client",
            json={"workspace_ids": ["ws_missing"]},
            headers=self._auth("hr_user"),
        )
        self.assertEqual(r.status_code, 400, r.text)
