"""Daily Log export scoping: team members only get their own entries (company-tenant DB).

There is no separate /export endpoint — Excel export is client-side over GET /entries.
This locks the role filter helper that backs that list for employees.
"""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.routers.daily_log import build_team_member_own_scope_filter


class TestDailyLogExportScope(unittest.TestCase):
    def test_team_member_filter_requires_own_user_id(self):
        filt = build_team_member_own_scope_filter("user_ada", "Ada Khan")
        self.assertIn("$or", filt)
        clauses = filt["$or"]
        self.assertEqual(clauses[0], {"user_id": "user_ada"})
        # Legacy name-only rows still match the same person, never other user_ids
        self.assertTrue(any(c.get("resource_name") == "Ada Khan" for c in clauses))
        joined = str(clauses)
        self.assertNotIn("user_bob", joined)
        self.assertNotIn("user_other", joined)

    def test_team_member_filter_without_name_is_strict_user_id(self):
        filt = build_team_member_own_scope_filter("user_ada", None)
        self.assertEqual(filt, {"$or": [{"user_id": "user_ada"}]})

    def test_own_scope_never_widens_to_department_or_all(self):
        filt = build_team_member_own_scope_filter("user_ada", "Ada")
        blob = str(filt)
        self.assertNotIn("department", blob)
        self.assertNotIn("$in", blob)


if __name__ == "__main__":
    unittest.main()
