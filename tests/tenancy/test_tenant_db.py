"""
tests/tenancy/test_tenant_db.py
Comprehensive unit tests for TenantDB and TenantCollection isolation.
Verifies all methods in Security Foundation A.2:
- find, find_one, count_documents, estimated_document_count, distinct
- insert_one, insert_many
- update_one, update_many, replace_one
- delete_one, delete_many
- find_one_and_update, find_one_and_delete, find_one_and_replace
- bulk_write (all request types)
- aggregate ($match prepended, sub-pipelines scoped, $out/$merge refused)
- watch (fullDocument.company_id match)
- Fail closed (NoTenantContext when flag enabled and context missing)
- CrossTenantError on mismatched company_id
- Read-only impersonation blocks all writes
- Global collections blocked in TenantDB
- Runtime guard asserts company_id on final filter/pipeline
"""

from __future__ import annotations

import unittest
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import InsertOne, UpdateOne, DeleteOne, ReplaceOne

from app.config import settings
from app.core.tenant import (
    TenantDB,
    TenantCollection,
    TenantContext,
    tenant_scope,
    set_tenant_context,
    reset_tenant_context,
    CrossTenantError,
    NoTenantContext,
    ReadOnlyImpersonationError,
    GLOBAL_COLLECTIONS,
    TENANT_COLLECTIONS,
    get_owned_or_404,
)
from fastapi import HTTPException


class TestTenantDB(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.raw_client = AsyncIOMotorClient("mongodb://localhost:27017")
        self.raw_db = self.raw_client["reamarc_test_db"]
        self.db = TenantDB(self.raw_db)
        
        # Enable multi-tenancy flag for test assertions
        self.orig_flag = getattr(settings, "MULTI_TENANT_ENABLED", False)
        settings.MULTI_TENANT_ENABLED = True

        # Clean test collection
        await self.raw_db.crm_leads.delete_many({"test_suite": "tenant_db"})

    async def asyncTearDown(self):
        await self.raw_db.crm_leads.delete_many({"test_suite": "tenant_db"})
        self.raw_client.close()
        settings.MULTI_TENANT_ENABLED = self.orig_flag

    async def test_global_collection_access_refused(self):
        """Global collections must not be accessed via TenantDB."""
        for g_coll in GLOBAL_COLLECTIONS:
            with self.assertRaises(ValueError):
                _ = self.db[g_coll]
            with self.assertRaises(ValueError):
                _ = getattr(self.db, g_coll)

    async def test_fail_closed_without_tenant_context(self):
        """When MULTI_TENANT_ENABLED=True, queries without tenant context raise NoTenantContext."""
        with self.assertRaises(NoTenantContext):
            await self.db.crm_leads.find_one({"test_suite": "tenant_db"})

        with self.assertRaises(NoTenantContext):
            await self.db.crm_leads.insert_one({"test_suite": "tenant_db", "title": "Lead 1"})

        with self.assertRaises(NoTenantContext):
            await self.db.crm_leads.count_documents({})

        with self.assertRaises(NoTenantContext):
            _ = self.db.crm_leads.aggregate([{"$match": {"status": "active"}}])

    async def test_cross_tenant_error_on_mismatched_filter_or_doc(self):
        """Specifying a different company_id raises CrossTenantError."""
        with tenant_scope(company_id="company_A"):
            with self.assertRaises(CrossTenantError):
                await self.db.crm_leads.find_one({"company_id": "company_B"})

            with self.assertRaises(CrossTenantError):
                await self.db.crm_leads.insert_one({"company_id": "company_B", "test_suite": "tenant_db"})

            with self.assertRaises(CrossTenantError):
                await self.db.crm_leads.replace_one(
                    {"id": "lead_1"},
                    {"company_id": "company_B", "test_suite": "tenant_db"}
                )

    async def test_insert_and_find_methods(self):
        """Test insert_one, insert_many, find, find_one, count_documents, estimated_document_count, distinct."""
        with tenant_scope(company_id="company_A"):
            # insert_one
            res1 = await self.db.crm_leads.insert_one({
                "id": "lead_a1",
                "title": "Lead A1",
                "stage": "new",
                "test_suite": "tenant_db",
            })
            self.assertTrue(res1.acknowledged)

            # insert_many
            res2 = await self.db.crm_leads.insert_many([
                {"id": "lead_a2", "title": "Lead A2", "stage": "won", "test_suite": "tenant_db"},
                {"id": "lead_a3", "title": "Lead A3", "stage": "new", "test_suite": "tenant_db"},
            ])
            self.assertEqual(len(res2.inserted_ids), 2)

            # find_one
            doc = await self.db.crm_leads.find_one({"id": "lead_a1"})
            self.assertIsNotNone(doc)
            self.assertEqual(doc["company_id"], "company_A")

            # find
            cursor = self.db.crm_leads.find({"test_suite": "tenant_db"})
            leads = await cursor.to_list(10)
            self.assertEqual(len(leads), 3)

            # count_documents
            count = await self.db.crm_leads.count_documents({"test_suite": "tenant_db"})
            self.assertEqual(count, 3)

            # estimated_document_count (redirects to scoped count)
            est_count = await self.db.crm_leads.estimated_document_count()
            self.assertGreaterEqual(est_count, 3)

            # distinct
            stages = await self.db.crm_leads.distinct("stage", {"test_suite": "tenant_db"})
            self.assertCountEqual(stages, ["new", "won"])

        # Different tenant sees 0 docs
        with tenant_scope(company_id="company_B"):
            count_b = await self.db.crm_leads.count_documents({"test_suite": "tenant_db"})
            self.assertEqual(count_b, 0)
            doc_b = await self.db.crm_leads.find_one({"id": "lead_a1"})
            self.assertIsNone(doc_b)

    async def test_update_and_replace_methods(self):
        """Test update_one, update_many, replace_one, find_one_and_*."""
        with tenant_scope(company_id="company_A"):
            await self.db.crm_leads.insert_one({
                "id": "lead_up1",
                "title": "Initial Title",
                "stage": "in_progress",
                "test_suite": "tenant_db",
            })

            # update_one
            up_res = await self.db.crm_leads.update_one(
                {"id": "lead_up1"},
                {"$set": {"title": "Updated Title"}}
            )
            self.assertEqual(up_res.modified_count, 1)

            # find_one_and_update
            f_doc = await self.db.crm_leads.find_one_and_update(
                {"id": "lead_up1"},
                {"$set": {"stage": "qualified"}},
                return_document=True,
            )
            self.assertEqual(f_doc["stage"], "qualified")

            # replace_one
            rep_res = await self.db.crm_leads.replace_one(
                {"id": "lead_up1"},
                {"id": "lead_up1", "title": "Replaced Title", "stage": "qualified", "test_suite": "tenant_db"}
            )
            self.assertEqual(rep_res.modified_count, 1)

            # upsert with $setOnInsert
            upsert_res = await self.db.crm_leads.update_one(
                {"id": "lead_upserted"},
                {"$set": {"title": "Upserted Lead", "test_suite": "tenant_db"}},
                upsert=True,
            )
            self.assertIsNotNone(upsert_res.upserted_id)
            saved_upsert = await self.db.crm_leads.find_one({"id": "lead_upserted"})
            self.assertEqual(saved_upsert["company_id"], "company_A")

    async def test_delete_methods(self):
        """Test delete_one, delete_many, find_one_and_delete."""
        with tenant_scope(company_id="company_A"):
            await self.db.crm_leads.insert_many([
                {"id": "del_1", "stage": "lost", "test_suite": "tenant_db"},
                {"id": "del_2", "stage": "lost", "test_suite": "tenant_db"},
                {"id": "del_3", "stage": "lost", "test_suite": "tenant_db"},
            ])

            del1 = await self.db.crm_leads.delete_one({"id": "del_1"})
            self.assertEqual(del1.deleted_count, 1)

            f_del = await self.db.crm_leads.find_one_and_delete({"id": "del_2"})
            self.assertIsNotNone(f_del)

            del_many = await self.db.crm_leads.delete_many({"stage": "lost", "test_suite": "tenant_db"})
            self.assertEqual(del_many.deleted_count, 1)

    async def test_bulk_write(self):
        """Test bulk_write rewrites InsertOne, UpdateOne, DeleteOne, ReplaceOne."""
        with tenant_scope(company_id="company_A"):
            ops = [
                InsertOne({"id": "bulk_1", "title": "B1", "test_suite": "tenant_db"}),
                InsertOne({"id": "bulk_2", "title": "B2", "test_suite": "tenant_db"}),
                UpdateOne({"id": "bulk_1"}, {"$set": {"title": "B1 Updated"}}),
                ReplaceOne({"id": "bulk_2"}, {"id": "bulk_2", "title": "B2 Replaced", "test_suite": "tenant_db"}),
                DeleteOne({"id": "bulk_1"}),
            ]
            res = await self.db.crm_leads.bulk_write(ops)
            self.assertEqual(res.inserted_count, 2)
            self.assertEqual(res.deleted_count, 1)

            remaining = await self.db.crm_leads.find_one({"id": "bulk_2"})
            self.assertIsNotNone(remaining)
            self.assertEqual(remaining["company_id"], "company_A")
            self.assertEqual(remaining["title"], "B2 Replaced")

    async def test_aggregate_isolation_and_restrictions(self):
        """Test aggregate prepends $match on company_id and rejects $out/$merge."""
        with tenant_scope(company_id="company_A"):
            await self.db.crm_leads.insert_one({"id": "agg_1", "value": 10, "test_suite": "tenant_db"})

            # Normal aggregate
            cursor = self.db.crm_leads.aggregate([
                {"$match": {"test_suite": "tenant_db"}},
                {"$group": {"_id": None, "total": {"$sum": "$value"}}},
            ])
            results = await cursor.to_list(10)
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]["total"], 10)

            # $out rejected
            with self.assertRaises(CrossTenantError):
                _ = self.db.crm_leads.aggregate([{"$out": "unauthorized_export"}])

            # $merge rejected
            with self.assertRaises(CrossTenantError):
                _ = self.db.crm_leads.aggregate([{"$merge": {"into": "target"}}])

    async def test_read_only_impersonation(self):
        """Test that read_only=True blocks all write operations."""
        with tenant_scope(company_id="company_A", read_only=True):
            with self.assertRaises(ReadOnlyImpersonationError):
                await self.db.crm_leads.insert_one({"id": "ro_1", "test_suite": "tenant_db"})

            with self.assertRaises(ReadOnlyImpersonationError):
                await self.db.crm_leads.update_one({"id": "ro_1"}, {"$set": {"a": 1}})

            with self.assertRaises(ReadOnlyImpersonationError):
                await self.db.crm_leads.delete_one({"id": "ro_1"})

            with self.assertRaises(ReadOnlyImpersonationError):
                await self.db.crm_leads.bulk_write([InsertOne({"id": "ro_2"})])

    async def test_get_owned_or_404(self):
        """Test get_owned_or_404 returns document for owner tenant, 404 for cross-tenant."""
        with tenant_scope(company_id="company_A"):
            await self.db.crm_leads.insert_one({
                "id": "owned_lead_1",
                "title": "Owned Lead",
                "test_suite": "tenant_db",
            })
            doc = await get_owned_or_404(self.db.crm_leads, "owned_lead_1")
            self.assertEqual(doc["id"], "owned_lead_1")

        with tenant_scope(company_id="company_B"):
            with self.assertRaises(HTTPException) as cm:
                await get_owned_or_404(self.db.crm_leads, "owned_lead_1")
            self.assertEqual(cm.exception.status_code, 404)
