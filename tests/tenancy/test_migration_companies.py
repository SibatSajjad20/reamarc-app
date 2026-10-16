"""
tests/tenancy/test_migration_companies.py
Tests for Phase 2: Additive backfill migration (scripts/migrate_companies.py)
Automated Phase 2 Gate:
1. Dry-run changes nothing.
2. Kill mid-run then resume -> resumes from checkpoint and completes cleanly.
3. Apply -> verify green: invariant checksums match, 0 documents missing company_id.
4. Idempotency: apply again -> 0 updates.
5. Rollback-plan prints restore command.
"""

from __future__ import annotations

import io
import unittest
from unittest.mock import patch
import pymongo

from scripts.migrate_companies import (
    REAMARC_COMPANY_ID,
    run_dry_run,
    apply_migration,
    verify_migration,
    print_rollback_plan,
)
from scripts.snapshot_counts import take_snapshot, compare_snapshots


class TestMigrationCompanies(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.uri = "mongodb://localhost:27017"
        cls.db_name = "reamarc_migration_gate_test"
        cls.client = pymongo.MongoClient(cls.uri)
        cls.db = cls.client[cls.db_name]

    @classmethod
    def tearDownClass(cls):
        cls.client.drop_database(cls.db_name)
        cls.client.close()

    def setUp(self):
        # Reset test DB
        self.client.drop_database(self.db_name)
        # Seed test documents in several tenant collections without company_id
        for i in range(1, 15):
            self.db.users.insert_one({"id": f"seed_user_{i}", "email": f"u{i}@test.com", "name": f"User {i}"})
            self.db.crm_leads.insert_one({"id": f"seed_lead_{i}", "title": f"Lead {i}", "stage": "new"})
            self.db.attendance_records.insert_one({"id": f"seed_att_{i}", "user_id": f"seed_user_{i}", "date": "2026-10-15"})
            self.db.workspaces.insert_one({"id": f"seed_ws_{i}", "name": f"Workspace {i}"})

        # Seed global singleton
        self.db.daily_log_columns.insert_one({"id": "cols_1", "workspace_id": "seed_ws_1", "columns": ["task", "hours"]})

    def test_dry_run_changes_nothing(self):
        """Dry-run must not write company_id or modify any collection."""
        before_snap = take_snapshot(self.uri, self.db_name)
        run_dry_run(self.db)
        after_snap = take_snapshot(self.uri, self.db_name)

        match, diffs = compare_snapshots(before_snap, after_snap)
        self.assertTrue(match, f"Dry-run caused mutations: {diffs}")

        # Check company_id still missing
        missing_users = self.db.users.count_documents({"company_id": {"$exists": False}})
        self.assertEqual(missing_users, 14)

    def test_kill_mid_run_and_resume_and_idempotency(self):
        """Simulate kill mid-run, resume, verify green, and assert second apply does 0 updates."""
        pre_snap = take_snapshot(self.uri, self.db_name)

        # 1. Kill mid-run (simulate crash after attendance_records)
        with self.assertRaises(RuntimeError):
            apply_migration(self.db, batch_size=5, force_fail_after_collection="attendance_records")

        # Verify progress was recorded
        checkpoint = self.db.migrations.find_one({"id": "companies_backfill"})
        self.assertIsNotNone(checkpoint)
        self.assertTrue(checkpoint["collections"].get("attendance_records", {}).get("completed", False))

        # 2. Resume migration
        res = apply_migration(self.db, batch_size=5)
        self.assertEqual(res["status"], "completed")

        # 3. Verify green: zero docs missing company_id, invariant checksums match
        verify_migration(self.uri, self.db_name, pre_snap)

        # Confirm Reamarc company created
        reamarc = self.db.companies.find_one({"slug": "reamarc"})
        self.assertIsNotNone(reamarc)
        self.assertEqual(reamarc["id"], REAMARC_COMPANY_ID)

        # Confirm singleton received company_id
        cols = self.db.daily_log_columns.find_one({"id": "cols_1"})
        self.assertEqual(cols.get("company_id"), REAMARC_COMPANY_ID)

        # Confirm token_version seeded on users
        u1 = self.db.users.find_one({"id": "seed_user_1"})
        self.assertEqual(u1.get("token_version"), 0)
        self.assertEqual(u1.get("company_id"), REAMARC_COMPANY_ID)

        # 4. Idempotency: re-applying updates 0 docs
        second_run = apply_migration(self.db, batch_size=5)
        self.assertEqual(second_run["total_updated"], 0)

    def test_rollback_plan_prints(self):
        """Verify rollback plan executes cleanly without error."""
        buf = io.StringIO()
        with patch("sys.stdout", buf):
            print_rollback_plan("test-archive.gz")
        output = buf.getvalue()
        self.assertIn("ROLLBACK PLAN", output)
        self.assertIn("MULTI_TENANT_ENABLED=false", output)
        self.assertIn("mongorestore", output)
