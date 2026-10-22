"""Membership migration keeps null access overrides and unset content_stages."""
from __future__ import annotations

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.access import MODULES, effective_access
from scripts.migrate_memberships import MODULE_KEYS, build_membership_doc


def _null_access() -> dict:
    return {m: None for m in MODULE_KEYS}


class TestMigrateMembershipsNullAccess(unittest.TestCase):
    def test_all_null_access_and_unset_stages_stay_null(self):
        user = {
            "id": "usr_null",
            "company_id": "comp_a",
            "role": "team_member",
            "primary_department": "Website",
            "access": _null_access(),
        }
        self.assertNotIn("content_stages", user)
        mem = build_membership_doc(user)
        self.assertEqual(mem["access"], _null_access())
        self.assertIsNone(mem["content_stages"])
        for mod in MODULE_KEYS:
            self.assertIsNone(mem["access"][mod])

    def test_existing_content_stages_list_is_kept(self):
        user = {
            "id": "usr_stages",
            "company_id": "comp_a",
            "role": "team_member",
            "access": _null_access(),
            "content_stages": ["creative"],
        }
        mem = build_membership_doc(user)
        self.assertEqual(mem["content_stages"], ["creative"])

    def test_effective_access_modules_match_before_and_after(self):
        users = [
            {
                "id": "usr_admin",
                "company_id": "comp_a",
                "role": "admin",
                "access": _null_access(),
            },
            {
                "id": "usr_hr",
                "company_id": "comp_a",
                "role": "hr",
                "access": _null_access(),
            },
            {
                "id": "usr_content_lead",
                "company_id": "comp_a",
                "role": "team_lead",
                "primary_department": "Content",
                "departments": ["Content", "Creative"],
                "access": _null_access(),
            },
            {
                "id": "usr_sales_member",
                "company_id": "comp_a",
                "role": "team_member",
                "primary_department": "Sales",
                "departments": ["Sales"],
                "access": _null_access(),
            },
        ]
        for user in users:
            before = effective_access(user)["modules"]
            mem = build_membership_doc(user)
            after_user = dict(user)
            after_user["access"] = mem["access"]
            after_user["content_stages"] = mem["content_stages"]
            after = effective_access(after_user)["modules"]
            self.assertEqual(before, after, msg=f"modules drifted for {user['id']}")
            self.assertEqual(set(before), set(MODULES))


if __name__ == "__main__":
    unittest.main()
