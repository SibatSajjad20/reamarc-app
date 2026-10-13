"""Idempotent operations exceptions default migration (access_ops_exceptions_v1)."""
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.permissions import migrate_ops_exceptions_access, OPS_EXCEPTIONS_MIGRATION_ID


class TestOpsExceptionsMigration(unittest.IsolatedAsyncioTestCase):
    async def test_dry_run_plans_one_change_when_none(self):
        db = MagicMock()
        db.migrations.find_one = AsyncMock(return_value=None)
        db.role_permissions.find_one = AsyncMock(
            return_value={"role": "operations", "module": "exceptions", "level": "none"}
        )
        result = await migrate_ops_exceptions_access(db, apply=False)
        self.assertEqual(result["status"], "DRY_RUN_COMPLETE")
        self.assertEqual(result["planned"], 1)
        db.role_permissions.update_one.assert_not_called()

    async def test_apply_then_second_run_is_noop(self):
        db = MagicMock()
        db.migrations.find_one = AsyncMock(side_effect=[None, {"id": OPS_EXCEPTIONS_MIGRATION_ID}])
        db.role_permissions.find_one = AsyncMock(
            return_value={"role": "operations", "module": "exceptions", "level": "none"}
        )
        db.role_permissions.update_one = AsyncMock()
        db.permission_audit.insert_one = AsyncMock()
        db.migrations.update_one = AsyncMock()

        first = await migrate_ops_exceptions_access(db, apply=True)
        self.assertEqual(first["status"], "APPLIED")
        self.assertEqual(first["applied"], 1)
        db.role_permissions.update_one.assert_awaited()
        db.permission_audit.insert_one.assert_awaited()

        second = await migrate_ops_exceptions_access(db, apply=True)
        self.assertEqual(second["status"], "ALREADY_APPLIED")
        self.assertEqual(second["planned"], 0)

    async def test_does_not_touch_custom_department_level(self):
        db = MagicMock()
        db.migrations.find_one = AsyncMock(return_value=None)
        db.role_permissions.find_one = AsyncMock(
            return_value={"role": "operations", "module": "exceptions", "level": "department"}
        )
        db.migrations.update_one = AsyncMock()
        result = await migrate_ops_exceptions_access(db, apply=True)
        self.assertEqual(result["planned"], 0)
        db.role_permissions.update_one.assert_not_called()
        db.permission_audit.insert_one.assert_not_called()


if __name__ == "__main__":
    unittest.main()
