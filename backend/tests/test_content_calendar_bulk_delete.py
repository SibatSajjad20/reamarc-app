"""Bulk delete: allowed rows go, forbidden rows stay. mongomock only."""
from __future__ import annotations

import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "test-secret-key-cc-bulk-delete-012345")
os.environ["RUN_SCHEDULERS"] = "0"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from mongomock_motor import AsyncMongoMockClient

from app.services.content_calendar_service import COLLECTION_NAME, bulk_delete_items

TEST_DB = "reamarc_test_db"
ADMIN = {"id": "admin", "role": "admin", "is_active": True}
MEMBER = {
    "id": "usr_member",
    "role": "team_member",
    "primary_department": "Content",
    "is_active": True,
}


def _item(n: int, **extra):
    doc = {
        "id": f"cc_del_{n}",
        "serial": f"CTST-{n:03d}",
        "client_name": "test",
        "content_concept": f"Concept {n}",
        "stage": "Content",
        "created_by": "admin",
    }
    doc.update(extra)
    return doc


class TestContentCalendarBulkDelete(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client[TEST_DB]

    async def asyncTearDown(self):
        self.client.close()

    async def test_admin_deletes_selected_rows(self):
        await self.db[COLLECTION_NAME].insert_many([_item(1), _item(2), _item(3)])
        result = await bulk_delete_items(self.db, ["cc_del_1", "cc_del_3"], viewer=ADMIN)
        self.assertEqual(result["deleted_count"], 2)
        self.assertEqual(result["skipped"], [])
        remaining = await self.db[COLLECTION_NAME].find({}).to_list(10)
        self.assertEqual([d["id"] for d in remaining], ["cc_del_2"])

    async def test_member_cannot_delete_someone_elses_row(self):
        await self.db[COLLECTION_NAME].insert_one(_item(1, created_by="admin"))
        result = await bulk_delete_items(self.db, ["cc_del_1"], viewer=MEMBER)
        self.assertEqual(result["deleted_count"], 0)
        self.assertEqual(len(result["skipped"]), 1)
        self.assertTrue(await self.db[COLLECTION_NAME].find_one({"id": "cc_del_1"}))

    async def test_member_can_delete_own_content_stage_row(self):
        await self.db[COLLECTION_NAME].insert_one(_item(4, created_by="usr_member", stage="Content"))
        result = await bulk_delete_items(self.db, ["cc_del_4"], viewer=MEMBER)
        self.assertEqual(result["deleted_count"], 1)
        self.assertIsNone(await self.db[COLLECTION_NAME].find_one({"id": "cc_del_4"}))

    async def test_missing_id_is_skipped_not_fatal(self):
        result = await bulk_delete_items(self.db, ["cc_missing"], viewer=ADMIN)
        self.assertEqual(result["deleted_count"], 0)
        self.assertEqual(result["skipped"][0]["id"], "cc_missing")

    async def test_delete_does_not_renumber_remaining_serials(self):
        await self.db[COLLECTION_NAME].insert_many([_item(1), _item(2), _item(3)])
        result = await bulk_delete_items(self.db, ["cc_del_2"], viewer=ADMIN)
        self.assertEqual(result["deleted_count"], 1)
        remaining = await self.db[COLLECTION_NAME].find({}).sort("serial", 1).to_list(10)
        self.assertEqual([d["serial"] for d in remaining], ["CTST-001", "CTST-003"])


if __name__ == "__main__":
    unittest.main()
