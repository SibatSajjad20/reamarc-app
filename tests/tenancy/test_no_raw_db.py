"""
tests/tenancy/test_no_raw_db.py
CI Lint Test:
Ensures raw MongoDB access (db_instance.db, AsyncIOMotorClient, get_global_db, _raw_db)
does not show up outside the allow-listed files, and verifies that all collection names
referenced in backend application code belong to TENANT_COLLECTIONS U GLOBAL_COLLECTIONS.
"""

from __future__ import annotations

import ast
import os
import re
import unittest
from pathlib import Path

from app.core.tenant import GLOBAL_COLLECTIONS, TENANT_COLLECTIONS

ALLOWED_COLLECTIONS = set(GLOBAL_COLLECTIONS) | set(TENANT_COLLECTIONS) | {
    "system", "job_locks"  # internal lock collection
}

ALLOW_LIST_DB_INSTANCE_DB = {
    "database.py",
    "tenant.py",
}

ALLOW_LIST_ASYNCIO_MOTOR_CLIENT = {
    "database.py",
}

ALLOW_LIST_GET_GLOBAL_DB = {
    "tenant.py",
    "owner.py",
    "security.py",
    "rate_limit_store.py",
    "auth.py",
    "admin.py",  # membership directory + identity lookup
    "identity_guard.py",  # global login identity
    "access.py",  # per-company membership access rows
    "content_calendar.py",
    "crm_ingest.py",
    "crm_meta_accounts.py",
    "crm_public.py",
    "job_locks.py",
    "users.py",  # R6 global avatar upload/delete
    "integrations.py",
    "access_migration.py",
    "push_service.py",
    "company_branding.py",
}

ALLOW_LIST_RAW_DB = {
    "tenant.py",
}


class TestNoRawDbLint(unittest.TestCase):
    def setUp(self):
        self.repo_root = Path(__file__).resolve().parent.parent.parent
        self.backend_app = self.repo_root / "backend" / "app"

    def test_no_forbidden_patterns_outside_allowlist(self):
        """Scans backend/app code for forbidden raw DB access patterns."""
        violations = []

        for py_file in self.backend_app.rglob("*.py"):
            fname = py_file.name
            rel_path = py_file.relative_to(self.repo_root).as_posix()

            with open(py_file, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            # 1. Check db_instance.db
            if "db_instance.db" in content:
                if fname not in ALLOW_LIST_DB_INSTANCE_DB:
                    violations.append(f"{rel_path}: 'db_instance.db' accessed outside allow-list")

            # 2. Check AsyncIOMotorClient
            if "AsyncIOMotorClient" in content and "from motor.motor_asyncio import AsyncIOMotorClient" in content:
                if fname not in ALLOW_LIST_ASYNCIO_MOTOR_CLIENT:
                    violations.append(f"{rel_path}: 'AsyncIOMotorClient' instantiated outside allow-list")

            # 3. Check get_global_db
            if "get_global_db" in content:
                if fname not in ALLOW_LIST_GET_GLOBAL_DB:
                    violations.append(f"{rel_path}: 'get_global_db' called outside allow-list")

            # 4. Check _raw_db
            if "_raw_db" in content:
                if fname not in ALLOW_LIST_RAW_DB:
                    violations.append(f"{rel_path}: '_raw_db' referenced outside allow-list")

        self.assertEqual(
            len(violations), 0,
            f"Found {len(violations)} raw database access lint violations:\n" + "\n".join(violations)
        )

    def test_all_referenced_collections_are_registered(self):
        """Verifies that all db.<collection> references in routers/services are registered collections."""
        coll_pattern = re.compile(r"\bdb(?:_instance\.db)?\.([a-zA-Z_][a-zA-Z0-9_]*)\.(find|insert|update|delete|count|aggregate|distinct|replace)")
        unregistered = set()

        for py_file in self.backend_app.rglob("*.py"):
            with open(py_file, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            for match in coll_pattern.finditer(content):
                coll_name = match.group(1)
                if coll_name not in ALLOWED_COLLECTIONS:
                    unregistered.add((py_file.name, coll_name))

        self.assertEqual(
            len(unregistered), 0,
            f"Unregistered MongoDB collections detected in backend:\n" +
            "\n".join(f"  {f}: {c}" for f, c in unregistered)
        )
