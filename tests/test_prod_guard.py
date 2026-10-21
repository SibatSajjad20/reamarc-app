"""
tests/test_prod_guard.py
Unit tests for migration script prod guards and idempotency:
1. is_prod unit tests for all conditions without connecting to any DB.
2. Apply on reamarc_db without backup exits 1 before MongoClient is constructed.
3. Running migrate_memberships apply twice on local test db inserts 0 the second time.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

import pymongo

root_dir = str(Path(__file__).resolve().parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from scripts._prod_guard import is_prod
import scripts.migrate_companies as migrate_companies
import scripts.migrate_memberships as migrate_memberships
from tests.tenancy.seed import clean_tenancy_sync, seed_tenancy_sync


class TestProdGuard(unittest.TestCase):
    def test_is_prod_cases_without_connection(self):
        """Unit tests is_prod for each condition using fake URIs only."""
        # 1. DB in {"reamarc", "reamarc_db"} -> always True
        self.assertTrue(is_prod("mongodb://localhost:27017", "reamarc"))
        self.assertTrue(is_prod("mongodb://127.0.0.1:27017", "reamarc_db"))
        self.assertTrue(is_prod("mongodb://fake-host:27017", "reamarc"))

        # 2. Remote host and not reamarc_test_db -> True
        self.assertTrue(is_prod("mongodb://prod-cluster.mongodb.net:27017", "some_custom_db"))
        self.assertTrue(is_prod("mongodb+srv://user:pass@cluster0.abcde.mongodb.net", "staging_db"))

        # 3. Remote host with reamarc_test_db -> False
        self.assertFalse(is_prod("mongodb://prod-cluster.mongodb.net:27017", "reamarc_test_db"))

        # 4. Localhost with non-prod db -> False
        self.assertFalse(is_prod("mongodb://localhost:27017", "reamarc_test_db"))
        self.assertFalse(is_prod("mongodb://127.0.0.1:27017", "local_dev_db"))
        self.assertFalse(is_prod("mongodb://localhost:27017", "dev_db"))

        # 5. ENVIRONMENT=production -> True
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
            self.assertTrue(is_prod("mongodb://localhost:27017", "local_dev_db"))

    def test_apply_on_reamarc_db_without_backup_exits_before_mongo_client(self):
        """Apply on reamarc_db without backup exits 1 before MongoClient is constructed."""
        mock_mongo_client = MagicMock()

        test_args = [
            "migrate_companies.py",
            "--uri", "mongodb://localhost:27017",
            "--db", "reamarc_db",
            "--apply",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("pymongo.MongoClient", mock_mongo_client):
                with self.assertRaises(SystemExit) as cm:
                    migrate_companies.main()
                self.assertEqual(cm.exception.code, 1)

        # Confirm MongoClient was NEVER instantiated
        mock_mongo_client.assert_not_called()

        test_args_mem = [
            "migrate_memberships.py",
            "--uri", "mongodb://localhost:27017",
            "--db", "reamarc_db",
            "--apply",
        ]

        with patch.object(sys, "argv", test_args_mem):
            with patch("pymongo.MongoClient", mock_mongo_client):
                with self.assertRaises(SystemExit) as cm:
                    migrate_memberships.main()
                self.assertEqual(cm.exception.code, 1)

        mock_mongo_client.assert_not_called()

    def test_migrate_memberships_apply_twice_inserts_zero_second_time(self):
        """Running memberships apply twice on local test db inserts 0 the second time."""
        test_uri = "mongodb://localhost:27017"
        test_db = "reamarc_test_db"

        clean_tenancy_sync(test_uri, test_db)
        seed_tenancy_sync(test_uri, test_db)

        client = pymongo.MongoClient(test_uri)
        db = client[test_db]

        try:
            # First run: inserts memberships for seeded users
            res1 = migrate_memberships.apply_migration(db)
            self.assertGreater(res1["inserted"], 0)

            # Second run: idempotent, inserts exactly 0
            res2 = migrate_memberships.apply_migration(db)
            self.assertEqual(res2["inserted"], 0)
        finally:
            clean_tenancy_sync(test_uri, test_db)
            client.close()


if __name__ == "__main__":
    unittest.main()
