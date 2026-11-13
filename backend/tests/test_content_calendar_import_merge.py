"""Mapped import: update by serial/id, preview, restore. mongomock / reamarc_test_db only."""
from __future__ import annotations

import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "test-secret-key-import-merge-012345")
os.environ["RUN_SCHEDULERS"] = "0"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from mongomock_motor import AsyncMongoMockClient

from app.schemas.content_calendar import ContentCalendarItemCreate
from app.services.content_calendar_service import COLLECTION_NAME, bulk_import_items
from app.services.content_calendar_import import apply_import, preview_import, restore_import

CLIENT = "ZEM Builders"
TEST_DB = "reamarc_test_db"
ADMIN = {"id": "admin", "role": "admin", "is_active": True}


class TestContentCalendarImportMerge(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client[TEST_DB]

    async def asyncTearDown(self):
        self.client.close()

    async def _seed(self):
        await self.db[COLLECTION_NAME].insert_one(
            {
                "id": "cc_keep",
                "serial": "CZB-018",
                "client_name": CLIENT,
                "content_concept": "Keep me",
                "stage": "Creative Client Review",
                "approval_status": "Review Creative Draft",
                "publish_date": "2026-11-12",
                "design_due": "Wk 2",
                "share_token": "tok_keep",
            }
        )

    async def test_update_by_serial_changes_dates_not_stage(self):
        await self._seed()
        preview = await preview_import(
            self.db,
            payload={
                "mode": "update",
                "filename": "plan.xlsx",
                "selected_fields": ["publish_date", "design_due"],
                "rows": [
                    {
                        "row": 1,
                        "values": {
                            "serial": "CZB-018",
                            "publish_date": "2026-11-20",
                            "design_due": "2026-11-18",
                            "stage": "Posted",
                        },
                    }
                ],
            },
            user_id="admin",
            user_name="Admin",
            viewer=ADMIN,
        )
        self.assertEqual(preview["summary"]["update"], 1)
        self.assertEqual(preview["preview_rows"][0]["fate"], "update")
        fields = {c["field"] for c in preview["preview_rows"][0]["changes"]}
        self.assertEqual(fields, {"publish_date", "design_due"})

        applied = await apply_import(
            self.db,
            job_id=preview["id"],
            user_id="admin",
            user_name="Admin",
            viewer=ADMIN,
        )
        self.assertEqual(applied["counts"]["updated"], 1)
        doc = await self.db[COLLECTION_NAME].find_one({"id": "cc_keep"})
        self.assertEqual(doc["publish_date"], "2026-11-20")
        self.assertEqual(doc["design_due"], "2026-11-18")
        self.assertEqual(doc["stage"], "Creative Client Review")
        self.assertEqual(doc["share_token"], "tok_keep")

    async def test_update_by_record_id(self):
        await self._seed()
        preview = await preview_import(
            self.db,
            payload={
                "mode": "update",
                "selected_fields": ["publish_date"],
                "rows": [{"row": 1, "values": {"id": "cc_keep", "publish_date": "2026-12-01"}}],
            },
            user_id="admin",
            user_name="Admin",
            viewer=ADMIN,
        )
        self.assertEqual(preview["summary"]["update"], 1)
        await apply_import(self.db, job_id=preview["id"], user_id="admin", user_name="Admin", viewer=ADMIN)
        doc = await self.db[COLLECTION_NAME].find_one({"id": "cc_keep"})
        self.assertEqual(doc["publish_date"], "2026-12-01")

    async def test_junk_excel_serial_does_not_match(self):
        await self._seed()
        preview = await preview_import(
            self.db,
            payload={
                "mode": "update",
                "selected_fields": ["publish_date"],
                "rows": [{"row": 1, "values": {"serial": "ZEM-NOV26-01", "publish_date": "2026-12-01"}}],
            },
            user_id="admin",
            user_name="Admin",
            viewer=ADMIN,
        )
        self.assertEqual(preview["preview_rows"][0]["fate"], "error")
        doc = await self.db[COLLECTION_NAME].find_one({"id": "cc_keep"})
        self.assertEqual(doc["publish_date"], "2026-11-12")

    async def test_create_still_ignores_excel_serials(self):
        result = await bulk_import_items(
            self.db,
            [ContentCalendarItemCreate(serial="ZEM-NOV26-01", client_name=CLIENT, content_concept="One")],
            upsert_by_serial=True,
            default_client_name=CLIENT,
        )
        self.assertEqual(result["inserted_count"], 1)
        doc = await self.db[COLLECTION_NAME].find_one({})
        self.assertTrue(str(doc["serial"]).startswith("CZB-"))
        self.assertNotEqual(doc["serial"], "ZEM-NOV26-01")

    async def test_restore_reverts_dates(self):
        await self._seed()
        preview = await preview_import(
            self.db,
            payload={
                "mode": "update",
                "selected_fields": ["publish_date"],
                "rows": [{"row": 1, "values": {"serial": "CZB-018", "publish_date": "2026-11-20"}}],
            },
            user_id="admin",
            user_name="Admin",
            viewer=ADMIN,
        )
        await apply_import(self.db, job_id=preview["id"], user_id="admin", user_name="Admin", viewer=ADMIN)
        restored = await restore_import(self.db, job_id=preview["id"], viewer=ADMIN)
        self.assertEqual(restored["status"], "restored")
        doc = await self.db[COLLECTION_NAME].find_one({"id": "cc_keep"})
        self.assertEqual(doc["publish_date"], "2026-11-12")

    async def test_restore_deletes_created_rows(self):
        preview = await preview_import(
            self.db,
            payload={
                "mode": "create",
                "default_client_name": CLIENT,
                "selected_fields": ["content_concept", "publish_date"],
                "rows": [{"row": 1, "values": {"content_concept": "Brand new", "publish_date": "2026-11-20"}}],
            },
            user_id="admin",
            user_name="Admin",
            viewer=ADMIN,
        )
        self.assertEqual(preview["summary"]["create"], 1)
        applied = await apply_import(self.db, job_id=preview["id"], user_id="admin", user_name="Admin", viewer=ADMIN)
        self.assertEqual(applied["counts"]["inserted"], 1)
        self.assertEqual(await self.db[COLLECTION_NAME].count_documents({}), 1)
        await restore_import(self.db, job_id=preview["id"], viewer=ADMIN)
        self.assertEqual(await self.db[COLLECTION_NAME].count_documents({}), 0)

    async def test_mixed_unmatched_skip(self):
        await self._seed()
        preview = await preview_import(
            self.db,
            payload={
                "mode": "mixed",
                "unmatched": "skip",
                "selected_fields": ["publish_date"],
                "rows": [
                    {"row": 1, "values": {"serial": "CZB-018", "publish_date": "2026-11-20"}},
                    {"row": 2, "values": {"serial": "NOPE-001", "publish_date": "2026-11-21", "content_concept": "Ghost"}},
                ],
            },
            user_id="admin",
            user_name="Admin",
            viewer=ADMIN,
        )
        fates = [r["fate"] for r in preview["preview_rows"]]
        self.assertEqual(fates, ["update", "skip"])

    async def test_create_mode_does_not_rewrite_existing_campaign(self):
        await self._seed()
        preview = await preview_import(
            self.db,
            payload={
                "mode": "create",
                "default_client_name": CLIENT,
                "selected_fields": ["content_concept", "publish_date", "serial"],
                "rows": [
                    {
                        "row": 1,
                        "values": {
                            "serial": "CZB-018",
                            "content_concept": "Should not overwrite",
                            "publish_date": "2026-12-01",
                            "stage": "Posted",
                        },
                    }
                ],
            },
            user_id="admin",
            user_name="Admin",
            viewer=ADMIN,
        )
        self.assertEqual(preview["summary"]["create"], 1)
        await apply_import(self.db, job_id=preview["id"], user_id="admin", user_name="Admin", viewer=ADMIN)
        original = await self.db[COLLECTION_NAME].find_one({"id": "cc_keep"})
        self.assertEqual(original["content_concept"], "Keep me")
        self.assertEqual(original["publish_date"], "2026-11-12")
        self.assertEqual(original["stage"], "Creative Client Review")
        self.assertEqual(original["share_token"], "tok_keep")
        self.assertEqual(await self.db[COLLECTION_NAME].count_documents({}), 2)

    async def test_fill_blanks_leaves_populated_fields(self):
        await self._seed()
        preview = await preview_import(
            self.db,
            payload={
                "mode": "update",
                "merge_policy": "fill_blanks",
                "selected_fields": ["publish_date", "notes"],
                "rows": [
                    {
                        "row": 1,
                        "values": {
                            "serial": "CZB-018",
                            "publish_date": "2026-12-01",
                            "notes": "only fill empty",
                        },
                    }
                ],
            },
            user_id="admin",
            user_name="Admin",
            viewer=ADMIN,
        )
        fields = {c["field"] for c in preview["preview_rows"][0]["changes"]}
        self.assertEqual(fields, {"notes"})
        await apply_import(self.db, job_id=preview["id"], user_id="admin", user_name="Admin", viewer=ADMIN)
        doc = await self.db[COLLECTION_NAME].find_one({"id": "cc_keep"})
        self.assertEqual(doc["publish_date"], "2026-11-12")
        self.assertEqual(doc["notes"], "only fill empty")
        self.assertEqual(doc["stage"], "Creative Client Review")


if __name__ == "__main__":
    unittest.main()
