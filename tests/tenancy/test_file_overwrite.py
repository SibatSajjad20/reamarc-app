"""
tests/tenancy/test_file_overwrite.py
Tests for R1: Cross-company file overwrite protection.
"""
from __future__ import annotations

import io
import unittest
import httpx

from app.main import app
from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection, db_instance
from app.core.security import create_access_token, _AUTH_CACHE
from app.core.uploads import _gridfs_bucket


class TestFileOverwrite(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        settings.MONGODB_DB_NAME = "reamarc_test_db"
        await connect_to_mongo()
        self.db = db_instance.db
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

        self.orig_mt = getattr(settings, "MULTI_TENANT_ENABLED", False)
        self.orig_mc = getattr(settings, "MULTI_COMPANY_ENABLED", False)
        settings.MULTI_TENANT_ENABLED = True
        settings.MULTI_COMPANY_ENABLED = True
        _AUTH_CACHE.clear()

        # Clean fixtures
        test_cids = ["comp_over_a", "comp_over_b", "company_reamarc"]
        test_uids = ["usr_over_a", "usr_over_b", "usr_over_rm"]
        await self.db.companies.delete_many({"id": {"$in": test_cids}})
        await self.db.users.delete_many({"id": {"$in": test_uids}})
        await self.db.company_memberships.delete_many({"user_id": {"$in": test_uids}})

        # Company A
        await self.db.companies.insert_one({
            "id": "comp_over_a", "name": "Company Over A", "slug": "comp-over-a",
            "status": "active", "token_version": 0,
        })
        # Company B
        await self.db.companies.insert_one({
            "id": "comp_over_b", "name": "Company Over B", "slug": "comp-over-b",
            "status": "active", "token_version": 0,
        })
        # Reamarc
        await self.db.companies.insert_one({
            "id": "company_reamarc", "name": "Reamarc", "slug": "reamarc",
            "status": "active", "token_version": 0,
        })

        # Admin A
        await self.db.users.insert_one({
            "id": "usr_over_a", "email": "admin_a@over.test", "full_name": "Admin A",
            "role": "admin", "company_id": "comp_over_a", "is_active": True, "token_version": 0,
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_over_a", "user_id": "usr_over_a", "company_id": "comp_over_a",
            "role": "admin", "status": "active", "token_version": 0, "needs_setup": False,
        })

        # Admin B
        await self.db.users.insert_one({
            "id": "usr_over_b", "email": "admin_b@over.test", "full_name": "Admin B",
            "role": "admin", "company_id": "comp_over_b", "is_active": True, "token_version": 0,
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_over_b", "user_id": "usr_over_b", "company_id": "comp_over_b",
            "role": "admin", "status": "active", "token_version": 0, "needs_setup": False,
        })

        # Reamarc Admin
        await self.db.users.insert_one({
            "id": "usr_over_rm", "email": "admin_rm@over.test", "full_name": "Admin Reamarc",
            "role": "admin", "company_id": "company_reamarc", "is_active": True, "token_version": 0,
        })
        await self.db.company_memberships.insert_one({
            "id": "mem_over_rm", "user_id": "usr_over_rm", "company_id": "company_reamarc",
            "role": "admin", "status": "active", "token_version": 0, "needs_setup": False,
        })

        self.token_a = create_access_token({
            "sub": "usr_over_a", "email": "admin_a@over.test", "cid": "comp_over_a",
            "mid": "mem_over_a", "tv": 0, "ver": 0,
        })
        self.token_b = create_access_token({
            "sub": "usr_over_b", "email": "admin_b@over.test", "cid": "comp_over_b",
            "mid": "mem_over_b", "tv": 0, "ver": 0,
        })
        self.token_rm = create_access_token({
            "sub": "usr_over_rm", "email": "admin_rm@over.test", "cid": "company_reamarc",
            "mid": "mem_over_rm", "tv": 0, "ver": 0,
        })

    async def asyncTearDown(self):
        settings.MULTI_TENANT_ENABLED = self.orig_mt
        settings.MULTI_COMPANY_ENABLED = self.orig_mc
        await self.client.aclose()
        test_cids = ["comp_over_a", "comp_over_b", "company_reamarc"]
        test_uids = ["usr_over_a", "usr_over_b", "usr_over_rm"]
        await self.db.companies.delete_many({"id": {"$in": test_cids}})
        await self.db.users.delete_many({"id": {"$in": test_uids}})
        await self.db.company_memberships.delete_many({"user_id": {"$in": test_uids}})
        _AUTH_CACHE.clear()

    async def test_r1_file_overwrite_protection(self):
        # 1. Company A uploads a file
        pdf_bytes_a = b"%PDF-1.4 file A original content"
        up_resp = await self.client.post(
            "/api/v1/daily-log/upload",
            headers={"Authorization": f"Bearer {self.token_a}"},
            files={"file": ("doc_a.pdf", pdf_bytes_a, "application/pdf")},
        )
        self.assertEqual(up_resp.status_code, 200, up_resp.text)
        file_url = up_resp.json()["file_url"]

        # 2. Company B admin uses store_as on A's deliverable -> 404
        pdf_bytes_b = b"%PDF-1.4 file B malicious overwrite content"
        b_resp = await self.client.post(
            f"/api/v1/daily-log/upload?store_as={file_url}",
            headers={"Authorization": f"Bearer {self.token_b}"},
            files={"file": ("doc_b.pdf", pdf_bytes_b, "application/pdf")},
        )
        self.assertEqual(b_resp.status_code, 404)

        # Confirm A's bytes are unchanged and A's download is 200
        down_a = await self.client.get(
            f"/api/v1/workspaces/download-proposal?file_path={file_url}",
            headers={"Authorization": f"Bearer {self.token_a}"},
        )
        self.assertEqual(down_a.status_code, 200)
        self.assertEqual(down_a.content, pdf_bytes_a)

        # 3. Company A admin uses store_as on their own file -> 200, new bytes served
        pdf_bytes_a_new = b"%PDF-1.4 file A updated content"
        a_update = await self.client.post(
            f"/api/v1/daily-log/upload?store_as={file_url}",
            headers={"Authorization": f"Bearer {self.token_a}"},
            files={"file": ("doc_a_updated.pdf", pdf_bytes_a_new, "application/pdf")},
        )
        self.assertEqual(a_update.status_code, 200)

        down_a_new = await self.client.get(
            f"/api/v1/workspaces/download-proposal?file_path={file_url}",
            headers={"Authorization": f"Bearer {self.token_a}"},
        )
        self.assertEqual(down_a_new.status_code, 200)
        self.assertEqual(down_a_new.content, pdf_bytes_a_new)

    async def test_r1_legacy_reamarc_overwrite_flags_off(self):
        # Insert a legacy file with no company_id directly into GridFS
        legacy_key = "deliverables/legacy_test_doc.pdf"
        legacy_bytes = b"%PDF-1.4 legacy doc"
        bucket = _gridfs_bucket(self.db)
        # remove if exists
        async for doc in bucket.find({"filename": legacy_key}):
            await bucket.delete(doc._id)
        await bucket.upload_from_stream(
            legacy_key,
            io.BytesIO(legacy_bytes),
            metadata={
                "original_name": "legacy_test_doc.pdf",
                "content_type": "application/pdf",
                "stored_path": f"/uploads/{legacy_key}",
                # no company_id!
            },
        )

        # Turn flags off
        settings.MULTI_TENANT_ENABLED = False
        settings.MULTI_COMPANY_ENABLED = False

        # Legacy Reamarc admin can overwrite the legacy file
        new_legacy_bytes = b"%PDF-1.4 legacy doc updated"
        rm_resp = await self.client.post(
            f"/api/v1/daily-log/upload?store_as=/uploads/{legacy_key}",
            headers={"Authorization": f"Bearer {self.token_rm}"},
            files={"file": ("legacy_updated.pdf", new_legacy_bytes, "application/pdf")},
        )
        self.assertEqual(rm_resp.status_code, 200, rm_resp.text)
