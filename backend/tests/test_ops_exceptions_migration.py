"""Operations exceptions DB migration is retired; access is fixed in code."""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.permissions import SYSTEM_ROLE_DEFAULTS, load_ctx, resolve
from app.services.permissions_migration import operations_canonical_role


class TestOpsExceptionsFixedRules(unittest.TestCase):
    def test_operations_exceptions_all_even_if_user_has_override_docs(self):
        user = {
            "id": "ops-1",
            "role": "operations",
            "overrides": [{"department": "Operations", "module": "exceptions", "level": "none"}],
        }
        ctx = load_ctx(user, overrides=user["overrides"])
        self.assertEqual(resolve(ctx, "exceptions"), "all")
        self.assertEqual(SYSTEM_ROLE_DEFAULTS["operations"]["exceptions"], "all")

    def test_operations_role_aliases_normalize(self):
        self.assertEqual(operations_canonical_role({"role": "Operations Lead"}), "operations")
        self.assertEqual(operations_canonical_role({"role": "ops"}), "operations")
        self.assertIsNone(operations_canonical_role({"role": "operations"}))
        self.assertIsNone(operations_canonical_role({"role": "team_lead"}))
