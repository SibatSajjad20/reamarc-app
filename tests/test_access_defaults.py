"""Unit tests for Access defaults, effective_access, tracking, and migration (Phase 1)."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock

from app.services.access import (
    MODULES,
    default_access,
    effective_access,
    is_tracked,
    tracked_user_filter,
)
from app.services.access_migration import MIGRATION_ID, run_access_settings_migration


class AccessDefaultsTests(unittest.TestCase):
    def test_admin_defaults(self):
        admin = {"id": "a1", "role": "admin"}
        eff = effective_access(admin)
        self.assertFalse(eff["modules"]["attendance"])
        self.assertFalse(eff["modules"]["daily_log"])
        self.assertTrue(eff["modules"]["sales"])
        self.assertTrue(eff["modules"]["content_calendar"])
        self.assertTrue(eff["modules"]["website"])
        self.assertTrue(eff["modules"]["ads"])

        # Admin is not tracked
        self.assertFalse(eff["tracked"]["attendance"])
        self.assertFalse(eff["tracked"]["daily_log"])
        self.assertFalse(is_tracked(admin, "attendance"))
        self.assertFalse(is_tracked(admin, "daily_log"))

        # Admin levels are all/manage
        self.assertEqual(eff["levels"]["attendance"], "all")
        self.assertEqual(eff["levels"]["daily_log"], "all")
        self.assertEqual(eff["levels"]["sales"], "all")
        self.assertEqual(eff["levels"]["content_calendar"], "manage")
        self.assertEqual(eff["levels"]["website"], "manage")
        self.assertEqual(eff["levels"]["ads"], "manage")

        # Capabilities
        self.assertTrue(eff["capabilities"]["approve_won_deal"])
        self.assertTrue(eff["capabilities"]["approve_requests"])

    def test_operations_defaults(self):
        ops = {"id": "ops1", "role": "operations"}
        eff = effective_access(ops)
        self.assertTrue(eff["modules"]["attendance"])
        self.assertFalse(eff["modules"]["daily_log"])
        self.assertTrue(eff["modules"]["sales"])
        self.assertTrue(eff["modules"]["content_calendar"])
        self.assertTrue(eff["modules"]["website"])
        self.assertTrue(eff["modules"]["ads"])

        # Operations is tracked for attendance only
        self.assertTrue(eff["tracked"]["attendance"])
        self.assertFalse(eff["tracked"]["daily_log"])
        self.assertTrue(is_tracked(ops, "attendance"))
        self.assertFalse(is_tracked(ops, "daily_log"))

        # Operations levels: view for work modules
        self.assertEqual(eff["levels"]["sales"], "view")
        self.assertEqual(eff["levels"]["content_calendar"], "view")
        self.assertEqual(eff["levels"]["website"], "view")
        self.assertEqual(eff["levels"]["ads"], "view")
        self.assertEqual(eff["levels"]["attendance"], "all")
        self.assertEqual(eff["levels"]["daily_log"], "none")

        # Capabilities
        self.assertTrue(eff["capabilities"]["approve_won_deal"])
        self.assertTrue(eff["capabilities"]["approve_requests"])

    def test_hr_defaults(self):
        hr = {"id": "hr1", "role": "hr"}
        eff = effective_access(hr)
        self.assertTrue(eff["modules"]["attendance"])
        self.assertTrue(eff["modules"]["daily_log"])
        self.assertFalse(eff["modules"]["sales"])
        self.assertFalse(eff["modules"]["content_calendar"])
        self.assertFalse(eff["modules"]["website"])
        self.assertFalse(eff["modules"]["ads"])

        self.assertTrue(eff["tracked"]["attendance"])
        self.assertTrue(eff["tracked"]["daily_log"])
        self.assertEqual(eff["levels"]["attendance"], "all")
        self.assertEqual(eff["levels"]["daily_log"], "all")
        self.assertEqual(eff["levels"]["sales"], "none")

        self.assertFalse(eff["capabilities"]["approve_won_deal"])
        self.assertTrue(eff["capabilities"]["approve_requests"])

    def test_sales_lead_and_member_defaults(self):
        lead = {"id": "sl", "role": "team_lead", "primary_department": "Sales"}
        member = {"id": "sm", "role": "team_member", "primary_department": "Sales"}

        eff_lead = effective_access(lead)
        eff_member = effective_access(member)

        # Sales lead & member are not tracked for attendance or daily log
        self.assertFalse(eff_lead["tracked"]["attendance"])
        self.assertFalse(eff_lead["tracked"]["daily_log"])
        self.assertFalse(eff_member["tracked"]["attendance"])
        self.assertFalse(eff_member["tracked"]["daily_log"])

        # Sales switch ON, others OFF
        self.assertTrue(eff_lead["modules"]["sales"])
        self.assertFalse(eff_lead["modules"]["attendance"])
        self.assertFalse(eff_lead["modules"]["content_calendar"])

        # Levels
        self.assertEqual(eff_lead["levels"]["sales"], "all")
        self.assertEqual(eff_member["levels"]["sales"], "own")

    def test_content_lead_and_member_defaults(self):
        lead = {"id": "cl", "role": "team_lead", "primary_department": "Content"}
        member = {"id": "cm", "role": "team_member", "primary_department": "Content"}

        eff_lead = effective_access(lead)
        eff_member = effective_access(member)

        self.assertTrue(eff_lead["tracked"]["attendance"])
        self.assertTrue(eff_lead["tracked"]["daily_log"])
        self.assertTrue(eff_lead["modules"]["content_calendar"])
        self.assertFalse(eff_lead["modules"]["sales"])

        self.assertEqual(eff_lead["levels"]["content_calendar"], "manage")
        self.assertEqual(eff_member["levels"]["content_calendar"], "own_stages")
        self.assertEqual(eff_lead["content_stages"], ["content"])

    def test_website_lead_and_member_defaults(self):
        lead = {"id": "wl", "role": "team_lead", "primary_department": "Website"}
        member = {"id": "wm", "role": "team_member", "primary_department": "Website"}

        eff_lead = effective_access(lead)
        eff_member = effective_access(member)

        self.assertTrue(eff_lead["modules"]["website"])
        self.assertFalse(eff_lead["modules"]["sales"])
        self.assertEqual(eff_lead["levels"]["website"], "manage")
        self.assertEqual(eff_member["levels"]["website"], "assigned")

    def test_ads_lead_and_member_defaults(self):
        lead = {"id": "al", "role": "team_lead", "primary_department": "Performance Marketing"}
        member = {"id": "am", "role": "team_member", "primary_department": "SEO"}

        eff_lead = effective_access(lead)
        eff_member = effective_access(member)

        self.assertTrue(eff_lead["modules"]["ads"])
        self.assertFalse(eff_lead["modules"]["website"])
        self.assertEqual(eff_lead["levels"]["ads"], "manage")
        self.assertEqual(eff_member["levels"]["ads"], "view")

    def test_client_defaults(self):
        client = {"id": "c1", "role": "client"}
        eff = effective_access(client)
        for m in MODULES:
            self.assertFalse(eff["modules"][m])
            self.assertEqual(eff["levels"][m], "none")
        self.assertFalse(eff["tracked"]["attendance"])
        self.assertFalse(eff["tracked"]["daily_log"])
        self.assertFalse(eff["capabilities"]["approve_won_deal"])
        self.assertFalse(eff["capabilities"]["approve_requests"])

    def test_override_precedence(self):
        # 1. Sales member granted attendance tracking
        sales_member = {
            "id": "sm1",
            "role": "team_member",
            "primary_department": "Sales",
            "access": {"attendance": True},
        }
        eff = effective_access(sales_member)
        self.assertTrue(eff["modules"]["attendance"])
        self.assertTrue(eff["tracked"]["attendance"])
        self.assertEqual(eff["levels"]["attendance"], "own")

        # 2. Content member sales module turned on -> level is 'own'
        content_member = {
            "id": "cm1",
            "role": "team_member",
            "primary_department": "Content",
            "access": {"sales": True},
        }
        eff_cm = effective_access(content_member)
        self.assertTrue(eff_cm["modules"]["sales"])
        self.assertEqual(eff_cm["levels"]["sales"], "own")

        # 3. Content lead sales module turned on -> level is 'all' (leads manage)
        content_lead = {
            "id": "cl1",
            "role": "team_lead",
            "primary_department": "Content",
            "access": {"sales": True},
        }
        eff_cl = effective_access(content_lead)
        self.assertTrue(eff_cl["modules"]["sales"])
        self.assertEqual(eff_cl["levels"]["sales"], "all")

        # 4. Content member attendance turned off
        content_member_off = {
            "id": "cm2",
            "role": "team_member",
            "primary_department": "Content",
            "access": {"attendance": False},
        }
        eff_off = effective_access(content_member_off)
        self.assertFalse(eff_off["modules"]["attendance"])
        self.assertFalse(eff_off["tracked"]["attendance"])
        self.assertEqual(eff_off["levels"]["attendance"], "none")

        # 5. Admin and client are read-only (overrides ignored)
        admin = {"id": "adm", "role": "admin", "access": {"attendance": True}}
        eff_adm = effective_access(admin)
        self.assertFalse(eff_adm["modules"]["attendance"])
        self.assertFalse(eff_adm["tracked"]["attendance"])

    def test_content_stages_inclusion(self):
        user = {
            "id": "u-stages",
            "role": "team_member",
            "primary_department": "Content",
            "content_stages": ["creative", "social_media", "invalid_stage", "content"],
        }
        eff = effective_access(user)
        # Primary stage 'content' + valid extra stages without duplicate
        self.assertEqual(eff["content_stages"], ["content", "creative", "social_media"])

        # When content_calendar module is off, content_stages is empty
        user_off = {
            "id": "u-stages-off",
            "role": "team_member",
            "primary_department": "Content",
            "access": {"content_calendar": False},
            "content_stages": ["creative"],
        }
        eff_off = effective_access(user_off)
        self.assertEqual(eff_off["content_stages"], [])

    def test_tracked_user_filter_structure(self):
        f_att = tracked_user_filter("attendance")
        self.assertIn("is_active", f_att)
        self.assertIn("role", f_att)
        self.assertIn("$or", f_att)

        f_dl = tracked_user_filter("daily_log")
        self.assertIn("is_active", f_dl)
        self.assertIn("role", f_dl)


class MockAsyncCursor:
    def __init__(self, docs):
        self.docs = list(docs)
        self.idx = 0

    def __aiter__(self):
        self.idx = 0
        return self

    async def __anext__(self):
        if self.idx < len(self.docs):
            doc = self.docs[self.idx]
            self.idx += 1
            return doc
        raise StopAsyncIteration


class AccessMigrationTests(unittest.IsolatedAsyncioTestCase):
    def _create_mock_db(self, initial_users, existing_marker=None):
        db = MagicMock()
        db.migrations.find_one = AsyncMock(return_value=existing_marker)
        db.migrations.update_one = AsyncMock()
        db.permission_audit.insert_one = AsyncMock()
        db.user_permission_overrides.count_documents = AsyncMock(return_value=3)

        user_docs = [dict(u) for u in initial_users]
        db.users.find = MagicMock(return_value=MockAsyncCursor(user_docs))
        db.users.update_one = AsyncMock()
        return db

    async def test_migration_dry_run(self):
        users = [
            {
                "_id": "1",
                "role": "team_member",
                "primary_department": "Content",
                "departments": ["Content", "Creative"],
            },
            {
                "_id": "2",
                "role": "operations_lead",
                "department": "Operations",
            },
            {
                "_id": "3",
                "role": "client",
            },
        ]
        db = self._create_mock_db(users, existing_marker=None)
        res = await run_access_settings_migration(db, dry_run=True)

        self.assertEqual(res["status"], "DRY_RUN")
        self.assertEqual(res["users_processed"], 2)  # Client skipped
        self.assertEqual(res["roles_normalized"], 1)  # operations_lead
        self.assertEqual(res["stages_carried"], 1)   # Creative
        self.assertEqual(res["overrides_ignored"], 3)

        # In dry-run, no database writes occurred
        db.users.update_one.assert_not_called()
        db.migrations.update_one.assert_not_called()
        db.permission_audit.insert_one.assert_not_called()

    async def test_migration_apply_and_idempotency(self):
        users = [
            {
                "_id": "1",
                "role": "team_member",
                "primary_department": "Content",
                "departments": ["Content", "Creative"],
            },
            {
                "_id": "2",
                "role": "operations_lead",
                "department": "Operations",
            },
        ]
        db = self._create_mock_db(users, existing_marker=None)
        res = await run_access_settings_migration(db, dry_run=False)

        self.assertEqual(res["status"], "APPLIED")
        self.assertEqual(res["users_processed"], 2)
        self.assertEqual(res["roles_normalized"], 1)
        self.assertEqual(res["stages_carried"], 1)

        # Database writes occurred
        self.assertEqual(db.users.update_one.call_count, 2)
        db.permission_audit.insert_one.assert_called_once()
        db.migrations.update_one.assert_called_once()

        # Idempotency check: rerun with marker already present
        marker_doc = {"id": MIGRATION_ID, "applied_at": "2026-10-15T00:00:00Z", "users_processed": 2}
        db2 = self._create_mock_db(users, existing_marker=marker_doc)
        res2 = await run_access_settings_migration(db2, dry_run=False)
        self.assertEqual(res2["status"], "ALREADY_APPLIED")
        db2.users.update_one.assert_not_called()


if __name__ == "__main__":
    unittest.main()
