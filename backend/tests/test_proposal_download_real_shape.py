"""download-proposal matches real production workspace/GridFS shape.

Uses a local throwaway Mongo DB only. Never targets reamarc_db.
"""
from __future__ import annotations

import os
import sys
import unittest

os.environ["MONGODB_DB_NAME"] = os.getenv(
    "TEST_MONGODB_DB_NAME", "reamarc_pdlrs_test_db"
)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings

settings.MONGODB_DB_NAME = os.getenv(
    "TEST_MONGODB_DB_NAME", "reamarc_pdlrs_test_db"
)
assert "test" in settings.MONGODB_DB_NAME.lower(), "FATAL: Not using a test database"
assert settings.MONGODB_DB_NAME != "reamarc_db", "FATAL: Attempted to run on production database"

import httpx

from app.core.security import create_access_token
from app.core.uploads import normalize_upload_key, save_upload_bytes
from app.database import close_mongo_connection, connect_to_mongo, get_database
from app.main import app

PREFIX = "pdlrs"
WS_ACTIVE = f"{PREFIX}-ws-active"
WS_INACTIVE = f"{PREFIX}-ws-inactive"
ACTIVE_URL = "/uploads/abc123/abc123.pdf"
INACTIVE_URL = "/uploads/inactive1/inactive1.pdf"
PDF_BYTES = b"%PDF-1.4 test proposal real shape\n"
USER_IDS = [
    f"{PREFIX}-member-c1",
    f"{PREFIX}-member-other",
    f"{PREFIX}-member-missing",
    f"{PREFIX}-admin",
]


def _token(user: dict) -> str:
    return create_access_token({"sub": user["id"], "email": user["email"]})


class TestProposalDownloadRealShape(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = os.getenv(
            "TEST_MONGODB_DB_NAME", "reamarc_pdlrs_test_db"
        )
        assert "test" in settings.MONGODB_DB_NAME.lower()
        assert settings.MONGODB_DB_NAME != "reamarc_db"
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
        await self.db.workspaces.delete_many({"id": {"$in": [WS_ACTIVE, WS_INACTIVE]}})

        await save_upload_bytes(
            self.db,
            relative_key=ACTIVE_URL,
            content=PDF_BYTES,
            original_name="abc123.pdf",
            content_type="application/pdf",
            extra_metadata={"workspace_id": WS_ACTIVE},
        )
        await save_upload_bytes(
            self.db,
            relative_key=INACTIVE_URL,
            content=PDF_BYTES,
            original_name="inactive1.pdf",
            content_type="application/pdf",
            extra_metadata={"workspace_id": WS_INACTIVE},
        )

        self.member_c1 = {
            "id": f"{PREFIX}-member-c1",
            "email": "pdlrs-member-c1@example.test",
            "full_name": "Member C1",
            "role": "team_member",
            "is_active": True,
            "company_id": "c1",
            "workspace_ids": ["other-ws"],
        }
        self.member_other = {
            "id": f"{PREFIX}-member-other",
            "email": "pdlrs-member-other@example.test",
            "full_name": "Member Other",
            "role": "team_member",
            "is_active": True,
            "company_id": "other",
            "workspace_ids": [],
        }
        self.member_missing = {
            "id": f"{PREFIX}-member-missing",
            "email": "pdlrs-member-missing@example.test",
            "full_name": "Member Missing Company",
            "role": "team_member",
            "is_active": True,
            "workspace_ids": [],
        }
        self.admin = {
            "id": f"{PREFIX}-admin",
            "email": "pdlrs-admin@example.test",
            "full_name": "Admin",
            "role": "admin",
            "is_active": True,
            "workspace_ids": [],
        }
        await self.db.users.insert_many(
            [self.member_c1, self.member_other, self.member_missing, self.admin]
        )

        active_ws = {
            "id": WS_ACTIVE,
            "name": "Active Client",
            "status": "active",
            "company_id": "c1",
            "proposal_url": ACTIVE_URL,
            "proposal_name": "abc123.pdf",
        }
        self.assertNotIn("is_active", active_ws)
        await self.db.workspaces.insert_many(
            [
                active_ws,
                {
                    "id": WS_INACTIVE,
                    "name": "Inactive Client",
                    "status": "inactive",
                    "company_id": "c1",
                    "proposal_url": INACTIVE_URL,
                    "proposal_name": "inactive1.pdf",
                },
            ]
        )

    async def asyncTearDown(self):
        if getattr(self, "db", None) is not None:
            await self.db.users.delete_many({"id": {"$in": USER_IDS}})
            await self.db.workspaces.delete_many({"id": {"$in": [WS_ACTIVE, WS_INACTIVE]}})
        if getattr(self, "client", None) is not None:
            await self.client.aclose()
        await close_mongo_connection()

    def _auth(self, user: dict) -> dict:
        return {"Authorization": f"Bearer {_token(user)}"}

    async def _download(self, user: dict, file_path: str):
        return await self.client.get(
            "/api/v1/workspaces/download-proposal",
            params={"file_path": file_path},
            headers=self._auth(user),
        )

    def _assert_pdf(self, res):
        self.assertEqual(res.status_code, 200, res.text)
        content_type = (res.headers.get("content-type") or "").lower()
        self.assertTrue(content_type.startswith("application/pdf"), content_type)
        self.assertTrue(res.content.startswith(b"%PDF"), res.content[:40])

    async def test_unassigned_member_company_shapes_download_active_pdf(self):
        key = normalize_upload_key(ACTIVE_URL)
        for user in (self.member_c1, self.member_other, self.member_missing):
            for file_path in (ACTIVE_URL, key):
                res = await self._download(user, file_path)
                self._assert_pdf(res)

    async def test_inactive_workspace_forbidden_for_member(self):
        res = await self._download(self.member_c1, INACTIVE_URL)
        self.assertEqual(res.status_code, 403, res.text)

    async def test_admin_downloads_active_pdf(self):
        res = await self._download(self.admin, ACTIVE_URL)
        self._assert_pdf(res)
