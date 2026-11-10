"""Import serial assignment: Excel serials are ignored; system serials stay unique.

Uses mongomock only (reamarc_test_db). Never a real database.
"""
from __future__ import annotations

import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "test-secret-key-import-serials-012345")
os.environ["RUN_SCHEDULERS"] = "0"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from mongomock_motor import AsyncMongoMockClient

from app.schemas.content_calendar import ContentCalendarItemCreate
from app.core.tenant import company_singleton_id
from app.services.content_calendar_service import (
    COLLECTION_NAME,
    bulk_import_items,
    format_client_serial,
    reserve_next_serial,
)


CLIENT = "ZEM Builders"
TEST_DB = "reamarc_test_db"


def _item(n: int) -> ContentCalendarItemCreate:
    return ContentCalendarItemCreate(
        serial=f"ZEM-NOV26-{n:02d}",
        client_name=CLIENT,
        content_concept=f"Concept {n}",
    )


class TestContentCalendarImportSerials(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client[TEST_DB]

    async def asyncTearDown(self):
        self.client.close()

    async def test_format_client_serial_uses_last_digit_group(self):
        self.assertEqual(format_client_serial("ZEM-NOV26-01", CLIENT), "CZB-001")
        self.assertNotEqual(format_client_serial("ZEM-NOV26-01", CLIENT), "CZB-026")

    async def test_import_24_rows_assigns_unique_system_serials(self):
        items = [_item(n) for n in range(1, 25)]
        result = await bulk_import_items(
            self.db,
            items,
            upsert_by_serial=True,
            default_client_name=CLIENT,
        )
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["inserted_count"], 24)
        self.assertEqual(result["updated_count"], 0)
        self.assertEqual(result["total_processed"], 24)

        docs = await self.db[COLLECTION_NAME].find({}).to_list(100)
        self.assertEqual(len(docs), 24)
        serials = sorted(d["serial"] for d in docs)
        self.assertEqual(serials, [f"CZB-{n:03d}" for n in range(1, 25)])
        self.assertEqual(len(set(serials)), 24)

    async def test_import_continues_after_existing_serial(self):
        await self.db[COLLECTION_NAME].insert_one(
            {
                "id": "cc_existing",
                "serial": "CZB-005",
                "client_name": CLIENT,
                "content_concept": "Existing",
            }
        )
        items = [_item(n) for n in range(1, 25)]
        result = await bulk_import_items(
            self.db,
            items,
            upsert_by_serial=True,
            default_client_name=CLIENT,
        )
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["inserted_count"], 24)

        docs = await self.db[COLLECTION_NAME].find({}).to_list(100)
        serials = sorted(d["serial"] for d in docs if d["serial"] != "CZB-005")
        self.assertEqual(serials, [f"CZB-{n:03d}" for n in range(6, 30)])
        self.assertEqual(len({d["serial"] for d in docs}), 25)

    async def test_import_advances_counter_so_next_serial_is_025(self):
        items = [_item(n) for n in range(1, 25)]
        result = await bulk_import_items(
            self.db,
            items,
            upsert_by_serial=True,
            default_client_name=CLIENT,
        )
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["inserted_count"], 24)
        nxt = await reserve_next_serial(self.db, CLIENT)
        self.assertEqual(nxt, "CZB-025")

    async def test_import_raises_stale_counter_so_next_serial_is_still_025(self):
        counter_id = company_singleton_id("serial_ZB")
        await self.db["content_calendar_counters"].insert_one({"_id": counter_id, "seq": 3})
        items = [_item(n) for n in range(1, 25)]
        result = await bulk_import_items(
            self.db,
            items,
            upsert_by_serial=True,
            default_client_name=CLIENT,
        )
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["inserted_count"], 24)
        nxt = await reserve_next_serial(self.db, CLIENT)
        self.assertEqual(nxt, "CZB-025")


if __name__ == "__main__":
    unittest.main()
