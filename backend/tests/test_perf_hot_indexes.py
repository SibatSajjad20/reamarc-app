"""Ensure hot-path company_id compounds are registered at startup."""
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret-key-perf-hot-indexes-0123456789")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


class TestPerfHotIndexes(unittest.IsolatedAsyncioTestCase):
    async def test_hot_path_company_indexes_created(self):
        from app import database as database_mod

        created = []

        class Coll:
            def __init__(self, name):
                self.name = name

            async def create_index(self, keys, **opts):
                created.append((self.name, keys, opts.get("name")))
                return opts.get("name") or "idx"

        class FakeDB:
            def __getattr__(self, name):
                return Coll(name)

        fake = MagicMock()
        fake.db = FakeDB()
        with patch.object(database_mod, "db_instance", fake):
            with patch.object(database_mod, "ensure_all_company_unique_indexes", AsyncMock()):
                await database_mod._create_indexes_background()

        names = {n for (_c, _k, n) in created if n}
        for required in (
            "idx_company_att_user_date",
            "idx_company_dailylog_user_date",
            "idx_company_dailylog_date",
            "idx_company_dailylog_scores_user_date",
            "idx_company_calendar_company_date",
            "idx_company_content_stage",
            "idx_company_att_date_status",
            "idx_company_leave_status_created",
            "idx_company_punch_status_created",
            "idx_company_webtask_assignee_status_due",
            "idx_company_webproject_stage_status",
        ):
            self.assertIn(required, names, f"missing index {required}")


if __name__ == "__main__":
    unittest.main()
