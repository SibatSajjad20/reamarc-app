"""Staff can see/download proposals on active clients; clients only their own.

Uses a local throwaway Mongo DB only. Never targets reamarc_db.
"""
import os
import sys
import unittest
from pathlib import Path

os.environ["MONGODB_DB_NAME"] = os.getenv("TEST_MONGODB_DB_NAME", "reamarc_proposal_visibility_test_db")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings

settings.MONGODB_DB_NAME = os.getenv("TEST_MONGODB_DB_NAME", "reamarc_proposal_visibility_test_db")
assert "test" in settings.MONGODB_DB_NAME.lower(), "FATAL: Not using a test database"
assert settings.MONGODB_DB_NAME != "reamarc_db", "FATAL: Attempted to run on production database"

import httpx

from app.core.security import create_access_token
from app.core.uploads import uploads_root
from app.database import close_mongo_connection, connect_to_mongo, get_database
from app.main import app

PREFIX = "spropvis"
WS_A = f"{PREFIX}-ws-a"
WS_B = f"{PREFIX}-ws-b"
WS_C = f"{PREFIX}-ws-c"
USER_IDS = [
    f"{PREFIX}-member",
    f"{PREFIX}-lead",
    f"{PREFIX}-admin",
    f"{PREFIX}-client",
]


def _token(user: dict) -> str:
    return create_access_token({"sub": user["id"], "email": user["email"]})


class TestStaffProposalVisibility(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = os.getenv("TEST_MONGODB_DB_NAME", "reamarc_proposal_visibility_test_db")
        assert "test" in settings.MONGODB_DB_NAME.lower()
        await connect_to_mongo()
        self.db = get_database()
        self.assertIsNotNone(self.db)

        from app.core.limiter import limiter

        limiter.enabled = False
        if hasattr(app.state, "limiter"):
            app.state.limiter.enabled = False

        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

        await self.db.users.delete_many({"id": {"$in": USER_IDS}})
        await self.db.workspaces.delete_many({"id": {"$in": [WS_A, WS_B, WS_C]}})

        self.upload_dir = uploads_root() / "proposals"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.files = {}
        for key, name in (("a", "spropvis_a.pdf"), ("b", "spropvis_b.pdf"), ("c", "spropvis_c.pdf")):
            path = self.upload_dir / name
            path.write_bytes(b"%PDF-1.4 test proposal " + key.encode())
            self.files[key] = path
            self.files[f"{key}_url"] = f"/uploads/proposals/{name}"

        self.company_id = "company_reamarc"
        self.member = {
            "id": f"{PREFIX}-member",
            "email": "spropvis-member@example.test",
            "full_name": "Staff Member",
            "role": "team_member",
            "is_active": True,
            "workspace_ids": [],
            "company_id": self.company_id,
        }
        self.lead = {
            "id": f"{PREFIX}-lead",
            "email": "spropvis-lead@example.test",
            "full_name": "Team Lead",
            "role": "team_lead",
            "is_active": True,
            "workspace_ids": [],
            "company_id": self.company_id,
        }
        self.admin = {
            "id": f"{PREFIX}-admin",
            "email": "spropvis-admin@example.test",
            "full_name": "Admin",
            "role": "admin",
            "is_active": True,
            "workspace_ids": [],
            "company_id": self.company_id,
        }
        self.client_user = {
            "id": f"{PREFIX}-client",
            "email": "spropvis-client@example.test",
            "full_name": "Assigned Client",
            "role": "client",
            "is_active": True,
            "workspace_ids": [WS_A],
            "company_id": self.company_id,
        }
        await self.db.users.insert_many([self.member, self.lead, self.admin, self.client_user])

        await self.db.workspaces.insert_many(
            [
                {
                    "id": WS_A,
                    "name": "Workspace A Active",
                    "company_id": self.company_id,
                    "status": "active",
                    "proposal_url": self.files["a_url"],
                    "proposal_name": "Proposal A.pdf",
                    "proposal_size": 12,
                    "poc_name": "Ava POC",
                    "poc_email": "ava@example.test",
                    "poc_phone": "111",
                    "billing_name": "Ava Billing",
                    "billing_email": "billing-a@example.test",
                    "billing_phone": "222",
                    "brandGuidelines": "secret A",
                },
                {
                    "id": WS_B,
                    "name": "Workspace B Inactive",
                    "company_id": self.company_id,
                    "status": "inactive",
                    "proposal_url": self.files["b_url"],
                    "proposal_name": "Proposal B.pdf",
                    "proposal_size": 13,
                    "poc_name": "Bea POC",
                    "billing_name": "Bea Billing",
                    "brandGuidelines": "secret B",
                },
                {
                    "id": WS_C,
                    "name": "Workspace C Other",
                    "company_id": self.company_id,
                    "status": "active",
                    "proposal_url": self.files["c_url"],
                    "proposal_name": "Proposal C.pdf",
                    "proposal_size": 14,
                    "poc_name": "Cara POC",
                    "billing_name": "Cara Billing",
                    "brandGuidelines": "secret C",
                },
            ]
        )

    async def asyncTearDown(self):
        if getattr(self, "db", None) is not None:
            await self.db.users.delete_many({"id": {"$in": USER_IDS}})
            await self.db.workspaces.delete_many({"id": {"$in": [WS_A, WS_B, WS_C]}})
        for key in ("a", "b", "c"):
            path = self.files.get(key)
            if path and Path(path).exists():
                Path(path).unlink()
        if getattr(self, "client", None) is not None:
            await self.client.aclose()
        await close_mongo_connection()

    def _auth(self, user: dict) -> dict:
        return {"Authorization": f"Bearer {_token(user)}"}

    async def _list(self, user: dict):
        res = await self.client.get("/api/v1/workspaces", headers=self._auth(user))
        return res

    async def _download(self, user: dict, url: str):
        return await self.client.get(
            "/api/v1/workspaces/download-proposal",
            params={"file_path": url},
            headers=self._auth(user),
        )

    def _by_id(self, rows, ws_id):
        return next((r for r in rows if r.get("id") == ws_id), None)

    async def test_member_sees_active_proposal_but_not_pii_and_cannot_download_inactive(self):
        res = await self._list(self.member)
        self.assertEqual(res.status_code, 200, res.text)
        rows = res.json()
        a = self._by_id(rows, WS_A)
        self.assertIsNotNone(a)
        self.assertEqual(a["proposal_url"], self.files["a_url"])
        self.assertEqual(a["proposal_name"], "Proposal A.pdf")
        self.assertEqual(a["proposal_size"], 12)
        self.assertIsNone(a.get("poc_name"))
        self.assertIsNone(a.get("poc_email"))
        self.assertIsNone(a.get("billing_name"))
        self.assertIsNone(a.get("billing_email"))
        self.assertEqual(a.get("brandGuidelines") or "", "")
        self.assertIsNone(self._by_id(rows, WS_B))

        ok = await self._download(self.member, self.files["a_url"])
        self.assertEqual(ok.status_code, 200, ok.text)
        denied = await self._download(self.member, self.files["b_url"])
        self.assertEqual(denied.status_code, 403, denied.text)

    async def test_team_lead_same_as_member(self):
        res = await self._list(self.lead)
        self.assertEqual(res.status_code, 200, res.text)
        a = self._by_id(res.json(), WS_A)
        self.assertEqual(a["proposal_url"], self.files["a_url"])
        self.assertIsNone(a.get("poc_name"))
        self.assertIsNone(a.get("billing_name"))
        self.assertEqual(a.get("brandGuidelines") or "", "")

        self.assertEqual((await self._download(self.lead, self.files["a_url"])).status_code, 200)
        self.assertEqual((await self._download(self.lead, self.files["b_url"])).status_code, 403)

    async def test_admin_sees_pii_and_downloads_active_and_inactive(self):
        res = await self._list(self.admin)
        self.assertEqual(res.status_code, 200, res.text)
        rows = res.json()
        a = self._by_id(rows, WS_A)
        b = self._by_id(rows, WS_B)
        self.assertEqual(a["poc_name"], "Ava POC")
        self.assertEqual(a["billing_name"], "Ava Billing")
        self.assertEqual(a["proposal_url"], self.files["a_url"])
        self.assertIsNotNone(b)
        self.assertEqual(b["proposal_url"], self.files["b_url"])

        self.assertEqual((await self._download(self.admin, self.files["a_url"])).status_code, 200)
        self.assertEqual((await self._download(self.admin, self.files["b_url"])).status_code, 200)

    async def test_client_assigned_to_a_not_c(self):
        res = await self._list(self.client_user)
        self.assertEqual(res.status_code, 200, res.text)
        rows = res.json()
        a = self._by_id(rows, WS_A)
        c = self._by_id(rows, WS_C)
        self.assertEqual(a["proposal_url"], self.files["a_url"])
        self.assertIsNone(a.get("poc_name"))
        self.assertIsNone(a.get("billing_name"))
        self.assertEqual(a.get("brandGuidelines") or "", "")
        self.assertIsNone(c)  # clients never see other clients' workspaces

        self.assertEqual((await self._download(self.client_user, self.files["a_url"])).status_code, 200)
        self.assertEqual((await self._download(self.client_user, self.files["c_url"])).status_code, 403)

    async def test_unauthenticated_download_is_401(self):
        res = await self.client.get(
            "/api/v1/workspaces/download-proposal",
            params={"file_path": self.files["a_url"]},
        )
        self.assertEqual(res.status_code, 401, res.text)


if __name__ == "__main__":
    unittest.main()
