"""Content calendar index setup must run once per process, not on every list request."""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import unittest
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test-secret-key-cc-indexes-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.services import content_calendar_service as ccs

TEST_DB = "reamarc_test_cc_indexes_once"


class TestIndexesOnce(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=3000)
        await self.client.drop_database(TEST_DB)
        self.db = self.client[TEST_DB]
        ccs._indexes_ready = False

    async def asyncTearDown(self):
        await self.client.drop_database(TEST_DB)
        self.client.close()

    async def test_twenty_parallel_board_loads_build_indexes_once(self):
        import app.core.index_migration as im
        real = im.ensure_company_unique_index
        calls = []

        async def counting(*a, **kw):
            calls.append(a[-1])
            return await real(*a, **kw)

        with mock.patch.object(im, "ensure_company_unique_index", counting), \
                self.assertLogs(ccs.logger, level=logging.DEBUG) as logs:
            ccs.logger.debug("start")
            await asyncio.gather(*[ccs.get_items(self.db) for _ in range(20)])
            await asyncio.sleep(0.5)
            await asyncio.gather(*[ccs.get_items(self.db) for _ in range(20)])
            await asyncio.sleep(0.5)
        self.assertEqual(sorted(calls), ["uniq_company_cc_id", "uniq_company_cc_serial"], calls)
        self.assertFalse([l for l in logs.output if "not defined" in l], logs.output)
        self.assertTrue(ccs._indexes_ready)

    async def test_failure_does_not_retry_on_every_request(self):
        import app.core.index_migration as im
        calls = []

        async def boom(*a, **kw):
            calls.append(1)
            raise RuntimeError("DuplicateKey building unique index uniq_company_cc_id")

        with mock.patch.object(im, "ensure_company_unique_index", boom):
            for _ in range(10):
                await ccs.get_items(self.db)
                await asyncio.sleep(0.05)
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
