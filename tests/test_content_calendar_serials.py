"""
Unit and integration tests for content calendar serials:
1. Calling GET /next-serial N times does not change the counter; then creating an item yields 001.
2. Two creates give 001, 002; a create that fails validation does not consume a number.
3. Insert failure after reservation retries and never reuses a number.
4. Per-company: DataViz and Reamarc DW/AT counters are independent (serial_X for Reamarc, serial_X:<company_id> for others).
5. Client change on update reserves exactly one number.
"""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.core.index_migration import ensure_company_unique_index
from app.core.tenant import TenantDB, tenant_scope
from app.database import db_instance
from app.routers.content_calendar import require_content_calendar_user, router as cc_router
from app.schemas.content_calendar import ContentCalendarItemCreate, ContentCalendarItemUpdate
from app.services import content_calendar_service

REAMARC = "company_reamarc"
DATAVIZ = "comp_dataviz"
DB_NAME = "reamarc_serial_test"


def _flags(on: bool):
    return patch.multiple(settings, MULTI_TENANT_ENABLED=on, MULTI_COMPANY_ENABLED=on)


class TestContentCalendarSerials(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncIOMotorClient("mongodb://localhost:27017")
        self.raw = self.client[DB_NAME]
        self.db = TenantDB(self.raw)

        # Hook into global db_instance so routers use this test DB
        self._prev_db = db_instance.db
        db_instance.db = self.raw

        # Clear collections
        await self.raw.drop_collection("content_calendar_counters")
        await self.raw.drop_collection("content_calendar_items")

        # Setup company unique indexes
        await ensure_company_unique_index(
            self.raw.content_calendar_items,
            ["idx_cc_id"],
            [[("id", 1)]],
            [("company_id", 1), ("id", 1)],
            "uniq_company_cc_id",
        )
        await ensure_company_unique_index(
            self.raw.content_calendar_items,
            ["idx_cc_serial"],
            [[("serial", 1)]],
            [("company_id", 1), ("serial", 1)],
            "uniq_company_cc_serial",
        )

        # Build test FastAPI app: cc_router has prefix="/content-calendar"
        self.app = FastAPI()
        self.app.include_router(cc_router, prefix="/api/v1")

        async def _override_user():
            return {
                "id": "u_test_editor",
                "full_name": "Test Editor",
                "role": "admin",
                "is_active": True,
            }

        self.app.dependency_overrides[require_content_calendar_user] = _override_user

    async def asyncTearDown(self):
        db_instance.db = self._prev_db
        await self.raw.drop_collection("content_calendar_counters")
        await self.raw.drop_collection("content_calendar_items")
        self.client.close()

    async def test_get_next_serial_n_times_does_not_consume_and_create_yields_001(self):
        """Calling GET /next-serial N times does not change the counter; then creating an item yields 001."""
        with _flags(False):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as test_client:
                # Call GET /next-serial 5 times for "Data Works" (DW)
                for _ in range(5):
                    resp = await test_client.get("/api/v1/content-calendar/next-serial?client_name=Data+Works")
                    self.assertEqual(resp.status_code, 200)
                    self.assertEqual(resp.json()["serial"], "CDW-001")

                # Verify no counter doc was created in DB during previews
                counter_doc = await self.raw.content_calendar_counters.find_one({"_id": "serial_DW"})
                self.assertIsNone(counter_doc)

                # Create first item
                payload = ContentCalendarItemCreate(
                    client_name="Data Works",
                    creative_type="Video",
                    content_type="Scheduled",
                    creative_category="Organic Creative",
                    content_concept="First Concept",
                    primary_text="Primary Text A",
                )
                created = await content_calendar_service.create_item(
                    self.raw, payload, user_id="u_test_editor", user_name="Test Editor"
                )
                self.assertEqual(created["serial"], "CDW-001")

                # Verify counter doc is now exactly seq=1
                counter_doc = await self.raw.content_calendar_counters.find_one({"_id": "serial_DW"})
                self.assertIsNotNone(counter_doc)
                self.assertEqual(counter_doc["seq"], 1)

                # Next peek returns 002
                resp = await test_client.get("/api/v1/content-calendar/next-serial?client_name=Data+Works")
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.json()["serial"], "CDW-002")

                # Counter is still 1 after peek
                counter_doc_after = await self.raw.content_calendar_counters.find_one({"_id": "serial_DW"})
                self.assertEqual(counter_doc_after["seq"], 1)

    async def test_two_creates_give_001_002_and_failed_validation_does_not_consume(self):
        """Two creates give 001, 002; a create that fails validation does not consume a number."""
        with _flags(False):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as test_client:
                # Create first item via API -> 001
                resp1 = await test_client.post(
                    "/api/v1/content-calendar",
                    json={
                        "client_name": "Apex Transfers LLC",
                        "creative_type": "Static",
                        "content_type": "Scheduled",
                        "creative_category": "Organic Creative",
                        "content_concept": "Apex Post 1",
                        "primary_text": "Primary Text 1",
                    },
                )
                self.assertEqual(resp1.status_code, 201)
                self.assertEqual(resp1.json()["serial"], "CAT-001")

                # Verify counter seq is 1
                counter1 = await self.raw.content_calendar_counters.find_one({"_id": "serial_AT"})
                self.assertEqual(counter1["seq"], 1)

                # Attempt invalid create (missing required content_concept)
                fail_resp = await test_client.post(
                    "/api/v1/content-calendar",
                    json={
                        "client_name": "Apex Transfers LLC",
                        "creative_type": "Static",
                        "content_type": "Scheduled",
                        # Missing content_concept
                    },
                )
                self.assertEqual(fail_resp.status_code, 422)

                # Verify counter was NOT consumed by failed create attempt
                counter_after_fail = await self.raw.content_calendar_counters.find_one({"_id": "serial_AT"})
                self.assertEqual(counter_after_fail["seq"], 1)

                # Create second valid item -> 002
                resp2 = await test_client.post(
                    "/api/v1/content-calendar",
                    json={
                        "client_name": "Apex Transfers LLC",
                        "creative_type": "Static",
                        "content_type": "Scheduled",
                        "creative_category": "Organic Creative",
                        "content_concept": "Apex Post 2",
                        "primary_text": "Primary Text 2",
                    },
                )
                self.assertEqual(resp2.status_code, 201)
                self.assertEqual(resp2.json()["serial"], "CAT-002")

                # Counter seq is now exactly 2
                counter2 = await self.raw.content_calendar_counters.find_one({"_id": "serial_AT"})
                self.assertEqual(counter2["seq"], 2)

    async def test_insert_failure_after_reservation_retries_and_never_reuses_number(self):
        """Insert failure after reservation retries and never reuses a number."""
        with _flags(False):
            # Pre-insert a dummy document directly with serial CAT-001 into collection
            await self.raw.content_calendar_items.insert_one({
                "id": "cc_preexisting",
                "serial": "CAT-001",
                "client_name": "Apex Transfers LLC",
            })

            # Seed counter at seq=0 so first reservation attempt allocates CAT-001
            await self.raw.content_calendar_counters.update_one(
                {"_id": "serial_AT"},
                {"$set": {"seq": 0}},
                upsert=True,
            )

            payload = ContentCalendarItemCreate(
                client_name="Apex Transfers LLC",
                creative_type="Video",
                content_type="Scheduled",
                creative_category="Organic Creative",
                content_concept="Colliding Item",
                primary_text="Primary Text",
            )

            # create_item collides on CAT-001 (DuplicateKeyError), retries, reserves CAT-002, and succeeds
            created = await content_calendar_service.create_item(
                self.raw, payload, user_id="u1", user_name="User 1"
            )
            self.assertEqual(created["serial"], "CAT-002")

            # Verify that seq is at 2 (001 was consumed and never reused or decremented)
            counter = await self.raw.content_calendar_counters.find_one({"_id": "serial_AT"})
            self.assertEqual(counter["seq"], 2)

            # Subsequent create gets CAT-003
            payload3 = ContentCalendarItemCreate(
                client_name="Apex Transfers LLC",
                creative_type="Video",
                content_type="Scheduled",
                creative_category="Organic Creative",
                content_concept="Third Item",
                primary_text="Primary Text 3",
            )
            created3 = await content_calendar_service.create_item(
                self.raw, payload3, user_id="u1", user_name="User 1"
            )
            self.assertEqual(created3["serial"], "CAT-003")
            counter3 = await self.raw.content_calendar_counters.find_one({"_id": "serial_AT"})
            self.assertEqual(counter3["seq"], 3)

    async def test_per_company_counters_are_independent(self):
        """Per-company: DataViz and Reamarc DW/AT counters are independent (serial_X for Reamarc, serial_X:<company_id> for others)."""
        with _flags(True):
            # Tenant Reamarc
            with tenant_scope(REAMARC):
                peek_r1 = await content_calendar_service.peek_next_serial(self.db, "Data Works")
                self.assertEqual(peek_r1, "CDW-001")

                res_r1 = await content_calendar_service.reserve_next_serial(self.db, "Data Works")
                self.assertEqual(res_r1, "CDW-001")

                res_r2 = await content_calendar_service.reserve_next_serial(self.db, "Data Works")
                self.assertEqual(res_r2, "CDW-002")

            # Tenant DataViz
            with tenant_scope(DATAVIZ):
                peek_d1 = await content_calendar_service.peek_next_serial(self.db, "Data Works")
                self.assertEqual(peek_d1, "CDW-001")

                res_d1 = await content_calendar_service.reserve_next_serial(self.db, "Data Works")
                self.assertEqual(res_d1, "CDW-001")

                res_d2 = await content_calendar_service.reserve_next_serial(self.db, "Data Works")
                self.assertEqual(res_d2, "CDW-002")

            # Reamarc counter is serial_DW
            reamarc_counter = await self.raw.content_calendar_counters.find_one({"_id": "serial_DW"})
            self.assertIsNotNone(reamarc_counter)
            self.assertEqual(reamarc_counter["seq"], 2)

            # DataViz counter is serial_DW:comp_dataviz
            dataviz_counter = await self.raw.content_calendar_counters.find_one({"_id": f"serial_DW:{DATAVIZ}"})
            self.assertIsNotNone(dataviz_counter)
            self.assertEqual(dataviz_counter["seq"], 2)

            # Independent increment in Reamarc
            with tenant_scope(REAMARC):
                res_r3 = await content_calendar_service.reserve_next_serial(self.db, "Data Works")
                self.assertEqual(res_r3, "CDW-003")

            # DataViz tenant remains at 2 (peek returns CDW-003)
            with tenant_scope(DATAVIZ):
                peek_d3 = await content_calendar_service.peek_next_serial(self.db, "Data Works")
                self.assertEqual(peek_d3, "CDW-003")
                dv_c = await self.raw.content_calendar_counters.find_one({"_id": f"serial_DW:{DATAVIZ}"})
                self.assertEqual(dv_c["seq"], 2)

    async def test_client_change_on_update_reserves_exactly_one_number(self):
        """Client change on update reserves exactly one number."""
        with _flags(False):
            # Create an item with client Apex
            payload = ContentCalendarItemCreate(
                client_name="Apex Transfers LLC",
                creative_type="Video",
                content_type="Scheduled",
                creative_category="Organic Creative",
                content_concept="Initial Apex Post",
                primary_text="Primary Text",
            )
            item = await content_calendar_service.create_item(
                self.raw, payload, user_id="u1", user_name="User 1"
            )
            self.assertEqual(item["serial"], "CAT-001")

            # Beta Client counter does not exist yet
            counter_before = await self.raw.content_calendar_counters.find_one({"_id": "serial_BC"})
            self.assertIsNone(counter_before)

            # Update item's client to "Beta Client"
            update_payload = ContentCalendarItemUpdate(
                client_name="Beta Client",
            )
            updated = await content_calendar_service.update_item(
                self.raw, item["id"], update_payload, viewer={"id": "u1", "role": "admin"}
            )
            self.assertIsNotNone(updated)
            self.assertEqual(updated["client_name"], "Beta Client")
            self.assertEqual(updated["serial"], "CBC-001")

            # Verify Beta Client counter is exactly seq=1 (exactly one number reserved)
            counter_after = await self.raw.content_calendar_counters.find_one({"_id": "serial_BC"})
            self.assertIsNotNone(counter_after)
            self.assertEqual(counter_after["seq"], 1)

            # Peek for Beta Client now returns CBC-002 without incrementing
            peek_next = await content_calendar_service.peek_next_serial(self.raw, "Beta Client")
            self.assertEqual(peek_next, "CBC-002")
            counter_final = await self.raw.content_calendar_counters.find_one({"_id": "serial_BC"})
            self.assertEqual(counter_final["seq"], 1)
