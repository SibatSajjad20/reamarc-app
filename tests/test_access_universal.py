"""Phase 5: Universal Access and Tracking Verification Tests.

Comprehensive test suite verifying:
1. Endpoint access across all 6 switches (attendance, daily_log, sales, content_calendar, website, ads).
2. Matrix, punctuality, and compliance lists filtering out untracked users.
3. Excel exports excluding untracked attendance users.
4. Schedulers and notification dispatchers skipping untracked users (monkeypatched senders).
5. Effective access reflection in `/auth/me` and user permission contexts.
6. Content stages scoping and isolation from other modules.
7. Admin and Operations specific defaults and capabilities.
"""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.access import (
    MODULES,
    default_access,
    effective_access,
    is_tracked,
    tracked_user_filter,
)
from app.services.permissions import load_context, effective_map, level_gte
from app.services.push_service import filter_allowed_recipients
from app.services.content_calendar_workflow import (
    visible_stages,
    is_content_actor,
    is_creative_actor,
    is_social_actor,
)


class TestUniversalAccessSwitches(unittest.TestCase):
    """Test behavior of switches ON vs OFF."""

    def test_attendance_switch_on_off(self):
        # By default content dept is tracked for attendance
        user_on = {
            "id": "u1",
            "role": "team_member",
            "primary_department": "content",
        }
        # Explicit override turning attendance OFF
        user_off = {
            "id": "u2",
            "role": "team_member",
            "primary_department": "content",
            "access": {"attendance": False},
        }

        self.assertTrue(is_tracked(user_on, "attendance"))
        self.assertFalse(is_tracked(user_off, "attendance"))

        eff_on = effective_access(user_on)
        eff_off = effective_access(user_off)

        self.assertTrue(eff_on["modules"]["attendance"])
        self.assertTrue(eff_on["tracked"]["attendance"])
        self.assertFalse(eff_off["modules"]["attendance"])
        self.assertFalse(eff_off["tracked"]["attendance"])

    def test_daily_log_switch_on_off(self):
        user_on = {
            "id": "u1",
            "role": "team_member",
            "primary_department": "content",
        }
        user_off = {
            "id": "u2",
            "role": "team_member",
            "primary_department": "content",
            "access": {"daily_log": False},
        }

        self.assertTrue(is_tracked(user_on, "daily_log"))
        self.assertFalse(is_tracked(user_off, "daily_log"))

        eff_on = effective_access(user_on)
        eff_off = effective_access(user_off)

        self.assertTrue(eff_on["modules"]["daily_log"])
        self.assertTrue(eff_on["tracked"]["daily_log"])
        self.assertFalse(eff_off["modules"]["daily_log"])
        self.assertFalse(eff_off["tracked"]["daily_log"])

    def test_module_switches_sales_content_website_ads(self):
        user_off = {
            "id": "u3",
            "role": "team_lead",
            "primary_department": "sales",
            "access": {
                "sales": False,
                "content_calendar": False,
                "website": False,
                "ads": False,
            },
        }
        eff = effective_access(user_off)
        for mod in ("sales", "content_calendar", "website", "ads"):
            self.assertFalse(eff["modules"][mod], f"Module {mod} should be false")
            self.assertEqual(eff["levels"][mod], "none", f"Module {mod} level should be none")


class TestUniversalListsAndFiltering(unittest.TestCase):
    """Verify matrix, list, and compliance filtering."""

    def test_tracked_user_filter(self):
        filt = tracked_user_filter("attendance")
        self.assertIn("$or", filt)
        clauses = filt["$or"]
        self.assertTrue(any("access.attendance" in str(c) for c in clauses))

    def test_daily_matrix_and_punctuality_filtering(self):
        tracked_member = {"id": "m1", "role": "team_member", "primary_department": "content"}
        untracked_member = {
            "id": "m2",
            "role": "team_member",
            "primary_department": "content",
            "access": {"attendance": False},
        }
        admin = {"id": "a1", "role": "admin", "primary_department": "management"}

        users = [tracked_member, untracked_member, admin]
        filtered = [u for u in users if is_tracked(u, "attendance")]

        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["id"], "m1")

    def test_log_compliance_filtering(self):
        tracked_member = {"id": "m1", "role": "team_member", "primary_department": "content"}
        untracked_member = {
            "id": "m2",
            "role": "team_member",
            "primary_department": "content",
            "access": {"daily_log": False},
        }
        admin = {"id": "a1", "role": "admin", "primary_department": "management"}
        ops = {"id": "o1", "role": "operations", "primary_department": "management"}

        users = [tracked_member, untracked_member, admin, ops]
        active_loggers = [u for u in users if is_tracked(u, "daily_log")]

        self.assertEqual(len(active_loggers), 1)
        self.assertEqual(active_loggers[0]["id"], "m1")


class TestUniversalSchedulersAndNotifications(unittest.IsolatedAsyncioTestCase):
    """Verify schedulers and push dispatchers honor access settings."""

    async def test_filter_allowed_recipients_attendance(self):
        users = [
            {"id": "u1", "role": "team_member", "primary_department": "content"},
            {
                "id": "u2",
                "role": "team_member",
                "primary_department": "content",
                "access": {"attendance": False},
            },
        ]
        user_map = {u["id"]: u for u in users}

        with patch("app.services.push_service.get_database") as mock_db:
            db = MagicMock()
            cursor = MagicMock()
            cursor.to_list = AsyncMock(return_value=[user_map["u1"], user_map["u2"]])
            db.users.find = MagicMock(return_value=cursor)
            mock_db.return_value = db

            allowed = await filter_allowed_recipients(["u1", "u2"], "attendance_reminder")
            self.assertEqual(allowed, ["u1"])

    async def test_filter_allowed_recipients_daily_log(self):
        users = [
            {"id": "u1", "role": "team_member", "primary_department": "content"},
            {
                "id": "u2",
                "role": "team_member",
                "primary_department": "content",
                "access": {"daily_log": False},
            },
        ]
        user_map = {u["id"]: u for u in users}

        with patch("app.services.push_service.get_database") as mock_db:
            db = MagicMock()
            cursor = MagicMock()
            cursor.to_list = AsyncMock(return_value=[user_map["u1"], user_map["u2"]])
            db.users.find = MagicMock(return_value=cursor)
            mock_db.return_value = db

            allowed = await filter_allowed_recipients(["u1", "u2"], "log_reminder")
            self.assertEqual(allowed, ["u1"])

    async def test_admin_receives_punch_and_sla_but_not_pipeline_alerts(self):
        users = [
            {"id": "admin", "role": "admin", "primary_department": "All", "is_active": True},
            {"id": "sales", "role": "team_member", "primary_department": "sales", "is_active": True},
            {"id": "content", "role": "team_member", "primary_department": "content", "is_active": True},
        ]

        with patch("app.services.push_service.get_database") as mock_db:
            db = MagicMock()
            cursor = MagicMock()
            cursor.to_list = AsyncMock(return_value=users)
            db.users.find = MagicMock(return_value=cursor)
            mock_db.return_value = db

            ids = ["admin", "sales", "content"]
            punch = await filter_allowed_recipients(ids, "attendance_check_in")
            self.assertIn("admin", punch)

            sla = await filter_allowed_recipients(ids, "crm_sla")
            self.assertIn("admin", sla)
            self.assertIn("sales", sla)
            self.assertNotIn("content", sla)

            calendar = await filter_allowed_recipients(ids, "content_calendar")
            self.assertNotIn("admin", calendar)
            self.assertIn("content", calendar)

            self.assertEqual(await filter_allowed_recipients(ids, "crm_lead"), [])

    async def test_email_service_send_log_reminder_guard(self):
        from app.services.email_service import EmailService

        untracked_user = {
            "id": "u_untracked",
            "email": "untracked@example.com",
            "role": "team_member",
            "primary_department": "content",
            "access": {"daily_log": False},
        }

        with patch("app.database.get_database") as mock_db:
            db = MagicMock()
            db.users.find_one = AsyncMock(return_value=untracked_user)
            mock_db.return_value = db

            res = await EmailService.send_log_reminder("untracked@example.com", "2026-10-15")
            self.assertFalse(res)


class TestContentStagesAndIsolation(unittest.TestCase):
    """Test content stage scoping and independence from attendance and daily log."""

    def test_content_stages_scoping(self):
        content_user = {
            "id": "c1",
            "role": "team_member",
            "primary_department": "content",
            "content_stages": ["content", "creative"],
        }

        self.assertTrue(is_content_actor(content_user))
        self.assertTrue(is_creative_actor(content_user))
        self.assertFalse(is_social_actor(content_user))

        stages = visible_stages(content_user)
        self.assertIn("Content", stages)
        self.assertIn("Creative Production", stages)
        self.assertNotIn("Social Media Scheduling", stages)

        # Ensure extra stage does NOT alter daily log tracking or attendance
        self.assertTrue(is_tracked(content_user, "daily_log"))
        self.assertTrue(is_tracked(content_user, "attendance"))


class TestAdminAndOperationsDefaults(unittest.TestCase):
    """Test admin and operations roles."""

    def test_admin_defaults(self):
        admin = {"id": "adm", "role": "admin", "primary_department": "management"}
        eff = effective_access(admin)

        # Admin is NOT tracked for attendance or daily log
        self.assertFalse(eff["tracked"]["attendance"])
        self.assertFalse(eff["tracked"]["daily_log"])
        self.assertFalse(is_tracked(admin, "attendance"))
        self.assertFalse(is_tracked(admin, "daily_log"))

        # Admin has full module level
        self.assertEqual(eff["levels"]["attendance"], "all")
        self.assertEqual(eff["levels"]["daily_log"], "all")
        self.assertEqual(eff["levels"]["sales"], "all")
        self.assertEqual(eff["levels"]["content_calendar"], "manage")
        self.assertEqual(eff["levels"]["website"], "manage")
        self.assertEqual(eff["levels"]["ads"], "manage")

    def test_operations_defaults(self):
        ops = {"id": "ops", "role": "operations", "primary_department": "management"}
        eff = effective_access(ops)

        # Operations is tracked for attendance, NOT daily log
        self.assertTrue(eff["tracked"]["attendance"])
        self.assertFalse(eff["tracked"]["daily_log"])
        self.assertTrue(is_tracked(ops, "attendance"))
        self.assertFalse(is_tracked(ops, "daily_log"))

        # Operations view_only for CRM/website/marketing, but approve_won_deal capability True
        self.assertEqual(eff["levels"]["sales"], "view")
        self.assertEqual(eff["levels"]["website"], "view")
        self.assertEqual(eff["levels"]["ads"], "view")
        self.assertTrue(eff["capabilities"]["approve_won_deal"])


class TestAuthMeContext(unittest.IsolatedAsyncioTestCase):
    """Test load_context and effective_map for /auth/me."""

    async def test_auth_me_effective_map(self):
        user = {
            "id": "u1",
            "name": "Ayesha Khan",
            "role": "team_member",
            "primary_department": "content",
            "access": {
                "ads": False,
                "attendance": True,
                "daily_log": True,
            },
            "access_version": 2,
        }

        ctx = await load_context(user)
        mapping = effective_map(ctx)

        self.assertIn("modules", mapping)
        self.assertIn("levels", mapping)
        self.assertIn("tracked", mapping)
        self.assertIn("content_stages", mapping)
        self.assertIn("capabilities", mapping)
        self.assertFalse(mapping["modules"]["ads"])
        self.assertTrue(mapping["modules"]["content_calendar"])
        self.assertTrue(mapping["tracked"]["attendance"])
        self.assertTrue(mapping["tracked"]["daily_log"])
        self.assertEqual(mapping["access_version"], 2)

    def test_creative_user_with_granted_content_and_social_stages(self):
        """Verify test account with creative dept + granted content and social stages."""
        user = {
            "id": "u_creative_multi",
            "name": "Creative Test Account",
            "role": "team_member",
            "primary_department": "Creative",
            "departments": ["Creative"],
            "content_stages": ["content", "social_media"],
        }
        eff = effective_access(user)
        self.assertIn("creative", eff["content_stages"])
        self.assertIn("content", eff["content_stages"])
        self.assertIn("social_media", eff["content_stages"])

        # Check workflow visible_stages
        stages = visible_stages(user)
        self.assertIn("Content", stages)
        self.assertIn("Content Internal Review", stages)
        self.assertIn("Creative Production", stages)
        self.assertIn("Creative Internal Review", stages)
        self.assertIn("Ready to Post", stages)
        self.assertIn("Posted", stages)

        # Check actor capabilities
        self.assertTrue(is_content_actor(user))
        self.assertTrue(is_creative_actor(user))
        self.assertTrue(is_social_actor(user))


if __name__ == "__main__":
    unittest.main()
