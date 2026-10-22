"""Per-company unique indexes and fixed-id singletons."""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest.mock import patch

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.core.index_migration import ensure_company_unique_index
from app.core.tenant import TenantDB, company_singleton_id, tenant_scope
from app.services import attendance_service, content_calendar_service, crm_leads, crm_templates
from app.services import crm_deals, crm_scheduler, google_drive_service as gdrive
from app.services import log_reminder_scheduler as reminders

REAMARC = "company_reamarc"
DATAVIZ = "comp_dataviz"
DB_NAME = "reamarc_mc_index_test"


def _flags(on: bool):
    return patch.multiple(settings, MULTI_TENANT_ENABLED=on, MULTI_COMPANY_ENABLED=on)


class _FakeColl:
    def __init__(self, indexes=None, fail_create=False):
        self.name = "fake"
        self.indexes = dict(indexes or {"idx_old": {"key": [("id", 1)], "unique": True}})
        self.dropped = []
        self.created = []
        self.deleted = False
        self.fail_create = fail_create

    async def index_information(self):
        return dict(self.indexes)

    async def create_index(self, keys, **opts):
        if self.fail_create:
            raise DuplicateKeyError("dup")
        name = opts.get("name") or "new"
        self.created.append((keys, opts))
        self.indexes[name] = {"key": list(keys), "unique": opts.get("unique", False)}
        return name

    async def drop_index(self, name):
        self.dropped.append(name)
        self.indexes.pop(name, None)

    async def delete_many(self, *args, **kwargs):
        self.deleted = True

    async def delete_one(self, *args, **kwargs):
        self.deleted = True


class TestIndexHelper(unittest.IsolatedAsyncioTestCase):
    async def test_idempotent_and_drops_old_only_if_present(self):
        coll = _FakeColl()
        ok = await ensure_company_unique_index(
            coll, ["idx_old"], [[("id", 1)]], [("company_id", 1), ("id", 1)], "uniq_new"
        )
        self.assertTrue(ok)
        self.assertEqual(coll.dropped, ["idx_old"])
        self.assertFalse(coll.deleted)
        n_created = len(coll.created)
        ok2 = await ensure_company_unique_index(
            coll, ["idx_old"], [[("id", 1)]], [("company_id", 1), ("id", 1)], "uniq_new"
        )
        self.assertTrue(ok2)
        self.assertEqual(len(coll.created), n_created)
        self.assertNotIn("_id_", coll.dropped)

    async def test_leaves_old_if_new_build_fails(self):
        coll = _FakeColl(fail_create=True)
        ok = await ensure_company_unique_index(
            coll, ["idx_old"], [[("id", 1)]], [("company_id", 1), ("id", 1)], "uniq_new"
        )
        self.assertFalse(ok)
        self.assertEqual(coll.dropped, [])
        self.assertIn("idx_old", coll.indexes)
        self.assertFalse(coll.deleted)


class TestCompanySingletonId(unittest.TestCase):
    def test_flags_off_and_reamarc_keep_base(self):
        with _flags(False):
            self.assertEqual(company_singleton_id("root"), "root")
            with tenant_scope(DATAVIZ):
                self.assertEqual(company_singleton_id("root"), "root")
        with _flags(True), tenant_scope(REAMARC):
            self.assertEqual(company_singleton_id("serial_APX"), "serial_APX")
            self.assertEqual(company_singleton_id("field_constants"), "field_constants")
        with _flags(True), tenant_scope(DATAVIZ):
            self.assertEqual(company_singleton_id("root"), f"root:{DATAVIZ}")
            self.assertEqual(company_singleton_id("serial_APX"), f"serial_APX:{DATAVIZ}")
        with _flags(True):
            self.assertEqual(company_singleton_id("root"), "root")


class TestPerCompanySingletons(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncIOMotorClient("mongodb://localhost:27017")
        self.raw = self.client[DB_NAME]
        self.db = TenantDB(self.raw)
        await self.raw.drop_collection("crm_pipeline")
        await self.raw.drop_collection("shifts")
        await self.raw.drop_collection("crm_templates")
        await self.raw.drop_collection("crm_scheduler_settings")
        await self.raw.drop_collection("content_calendar_counters")
        await self.raw.drop_collection("content_calendar_items")
        await self.raw.drop_collection("content_calendar_settings")
        await self.raw.drop_collection("google_drive_folders")
        await self.raw.drop_collection("system_config")
        await ensure_company_unique_index(
            self.raw.crm_pipeline,
            ["idx_crm_pipeline_id"],
            [[("id", 1)]],
            [("company_id", 1), ("id", 1)],
            "uniq_company_crm_pipeline_id",
        )
        await ensure_company_unique_index(
            self.raw.shifts,
            ["idx_shift_id"],
            [[("id", 1)]],
            [("company_id", 1), ("id", 1)],
            "uniq_company_shift_id",
        )
        await ensure_company_unique_index(
            self.raw.crm_templates,
            ["idx_crm_tpl_id"],
            [[("id", 1)]],
            [("company_id", 1), ("id", 1)],
            "uniq_company_crm_tpl_id",
        )
        attendance_service._default_shifts_ensured.clear()
        attendance_service._cached_active_shifts.clear()
        attendance_service._cached_shifts_time.clear()
        self._db_patches = [
            patch(target, return_value=self.db)
            for target in (
                "app.services.crm_leads.get_database",
                "app.services.crm_templates.get_database",
                "app.services.attendance_service.get_database",
                "app.services.crm_scheduler.get_database",
                "app.services.log_reminder_scheduler.get_database",
            )
        ]
        for p in self._db_patches:
            p.start()

    async def asyncTearDown(self):
        for p in self._db_patches:
            p.stop()
        await self.client.drop_database(DB_NAME)
        self.client.close()
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
        object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)

    async def test_default_pipeline_per_company_and_concurrent(self):
        with _flags(True):
            async def run(cid):
                with tenant_scope(cid):
                    return await crm_leads.ensure_default_pipeline()

            first_a, first_b = await asyncio.gather(run(REAMARC), run(DATAVIZ))
            self.assertEqual(first_a["id"], "default")
            self.assertEqual(first_b["id"], "default")
            second_a = await run(REAMARC)
            self.assertEqual(second_a["id"], "default")
            await asyncio.gather(run(REAMARC), run(DATAVIZ), run(REAMARC), run(DATAVIZ))
            docs = await self.raw.crm_pipeline.find({"id": "default"}).to_list(10)
            cids = sorted(d.get("company_id") for d in docs)
            self.assertEqual(cids, [DATAVIZ, REAMARC])
            self.assertEqual(len(docs), 2)

    async def test_default_shifts_and_templates_per_company(self):
        with _flags(True):
            with tenant_scope(REAMARC):
                s1 = await attendance_service.ensure_default_shifts()
                await crm_templates.ensure_default_templates()
            with tenant_scope(DATAVIZ):
                s2 = await attendance_service.ensure_default_shifts()
                await crm_templates.ensure_default_templates()
            self.assertTrue(any(x.get("id") == "shift_standard" for x in s1))
            self.assertTrue(any(x.get("id") == "shift_standard" for x in s2))
            std = await self.raw.shifts.find({"id": "shift_standard"}).to_list(10)
            self.assertEqual(sorted(d.get("company_id") for d in std), [DATAVIZ, REAMARC])
            tpls = await self.raw.crm_templates.find({"id": "tpl_intro"}).to_list(10)
            self.assertEqual(sorted(d.get("company_id") for d in tpls), [DATAVIZ, REAMARC])

    async def test_scheduler_settings_and_deal_stages(self):
        with _flags(True):
            stages_a = crm_deals.deal_pipeline_stages()
            with tenant_scope(REAMARC):
                a = await crm_scheduler.get_scheduler_settings()
            with tenant_scope(DATAVIZ):
                b = await crm_scheduler.get_scheduler_settings()
                stages_b = crm_deals.deal_pipeline_stages()
            self.assertEqual(a.get("key"), "crm_scheduler_settings")
            self.assertEqual(b.get("key"), "crm_scheduler_settings")
            self.assertEqual(stages_a, stages_b)
            docs = await self.raw.crm_scheduler_settings.find({"key": "crm_scheduler_settings"}).to_list(10)
            self.assertEqual(sorted(d.get("company_id") for d in docs), [DATAVIZ, REAMARC])

    async def test_serial_counter_and_field_constants(self):
        with _flags(True):
            with tenant_scope(REAMARC):
                s1 = await content_calendar_service.get_next_serial(self.db, "Apex")
                c1 = await content_calendar_service.get_constants_from_db(self.db)
                await content_calendar_service.update_constants(self.db, {"offers": ["Reamarc Offer"]})
            with tenant_scope(DATAVIZ):
                s2 = await content_calendar_service.get_next_serial(self.db, "Apex")
                c2 = await content_calendar_service.get_constants_from_db(self.db)
            self.assertTrue(s1.endswith("-001"))
            self.assertTrue(s2.endswith("-001"))
            reamarc_counter = await self.raw.content_calendar_counters.find_one({"_id": "serial_APX"})
            dv_counter = await self.raw.content_calendar_counters.find_one({"_id": f"serial_APX:{DATAVIZ}"})
            self.assertIsNotNone(reamarc_counter)
            self.assertIsNotNone(dv_counter)
            self.assertNotEqual(c2.get("offers"), ["Reamarc Offer"])
            fc = await self.raw.content_calendar_settings.find_one({"_id": "field_constants"})
            self.assertEqual(fc.get("offers"), ["Reamarc Offer"])
            self.assertIsNone(await self.raw.content_calendar_settings.find_one({"_id": f"field_constants:{REAMARC}"}))

    async def test_drive_root_and_system_config_keys(self):
        with _flags(True), patch.object(gdrive, "_folder_alive", return_value=True), patch.object(
            gdrive, "_find_folder_by_name", return_value="folder_dv"
        ), patch.object(gdrive, "_create_folder", return_value="folder_new"):
            orig_folder = getattr(settings, "GOOGLE_DRIVE_FOLDER_ID", "")
            object.__setattr__(settings, "GOOGLE_DRIVE_FOLDER_ID", "env_root")
            try:
                with tenant_scope(REAMARC):
                    root_r = await gdrive._ensure_root(self.db)
                with tenant_scope(DATAVIZ):
                    root_d = await gdrive._ensure_root(self.db)
            finally:
                object.__setattr__(settings, "GOOGLE_DRIVE_FOLDER_ID", orig_folder)
            self.assertEqual(root_r, "env_root")
            self.assertEqual(root_d, "folder_dv")
            self.assertIsNotNone(await self.raw.google_drive_folders.find_one({"_id": f"root:{DATAVIZ}"}))
            self.assertIsNone(await self.raw.google_drive_folders.find_one({"_id": "root"}))

        with _flags(True):
            with tenant_scope(REAMARC):
                await reminders._mark_run_today("morning", "2026-10-22")
            with tenant_scope(DATAVIZ):
                await reminders._mark_run_today("morning", "2026-10-22")
            keys = await self.raw.system_config.find({"key": "scheduler_last_morning"}).to_list(10)
            self.assertEqual(sorted(d.get("company_id") for d in keys), [DATAVIZ, REAMARC])

    async def test_flags_off_ids_unchanged(self):
        with _flags(False):
            pipe = await crm_leads.ensure_default_pipeline()
            serial = await content_calendar_service.get_next_serial(self.db, "Apex")
            await content_calendar_service.update_constants(self.db, {"ctas": ["Buy"]})
        self.assertEqual(pipe["id"], "default")
        self.assertTrue(serial.endswith("-001"))
        self.assertIsNotNone(await self.raw.content_calendar_counters.find_one({"_id": "serial_APX"}))
        self.assertIsNotNone(await self.raw.content_calendar_settings.find_one({"_id": "field_constants"}))
        docs = await self.raw.crm_pipeline.find({"id": "default"}).to_list(5)
        self.assertEqual(len(docs), 1)


if __name__ == "__main__":
    unittest.main()
