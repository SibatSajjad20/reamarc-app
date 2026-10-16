"""
Unit tests for Permissions Service & Resolver.
Verifies the single resolver (permissions.py) rules:
- Role defaults (SYSTEM_ROLE_DEFAULTS)
- Department grants (_department_default_level), primary department only
- Secondary department restrictions (Rule 8)
- Parametrized table (role x primary department x secondary departments x module -> level)
- Override grant and revoke
"""
import unittest

from app.services.permissions import (
    PermCtx,
    SYSTEM_ROLE_DEFAULTS,
    effective_map,
    load_ctx,
    resolve,
    departments_with,
)


class PermissionsResolverTests(unittest.TestCase):
    def test_admin_has_max_power_everywhere(self):
        """Rule 1: Admin views and manages everything."""
        user = {
            "id": "admin-1",
            "role": "admin",
            "department": "Executive",
            "primary_department": "Executive",
            "departments": ["Executive"],
        }
        ctx = load_ctx(user)
        for mod, max_lvl in [
            ("daily_log", "all"),
            ("attendance", "all"),
            ("exceptions", "all"),
            ("content_calendar", "manage"),
            ("website", "manage"),
            ("sales", "all"),
            ("active_clients", "manage"),
            ("ads", "manage"),
        ]:
            self.assertEqual(resolve(ctx, mod), max_lvl, f"Admin must have {max_lvl} for {mod}")

    def test_client_has_no_internal_access(self):
        """Clients get 'none' for all internal modules."""
        user = {
            "id": "client-1",
            "role": "client",
            "department": "",
            "primary_department": "",
            "departments": [],
        }
        ctx = load_ctx(user)
        for mod in ["daily_log", "attendance", "exceptions", "content_calendar", "website", "sales", "ads", "active_clients"]:
            self.assertEqual(resolve(ctx, mod), "none", f"Client must have 'none' for {mod}")

    def test_hr_role_defaults(self):
        """Rule 2: HR has attendance, daily log, exceptions, but no sales, website, content_calendar, ads."""
        user = {
            "id": "hr-1",
            "role": "hr",
            "department": "Human Resources",
            "primary_department": "Human Resources",
            "departments": ["Human Resources"],
        }
        ctx = load_ctx(user)
        self.assertEqual(resolve(ctx, "daily_log"), "all")
        self.assertEqual(resolve(ctx, "attendance"), "all")
        self.assertEqual(resolve(ctx, "exceptions"), "all")
        self.assertEqual(resolve(ctx, "active_clients"), "view")
        self.assertEqual(resolve(ctx, "content_calendar"), "none")
        self.assertEqual(resolve(ctx, "website"), "none")
        self.assertEqual(resolve(ctx, "sales"), "none")
        self.assertEqual(resolve(ctx, "ads"), "none")

    def test_login_user_payload_includes_operations_modules(self):
        from app.routers.auth import _build_user_response

        payload = _build_user_response(
            {
                "id": "ops-login",
                "email": "ops@example.com",
                "full_name": "Ops",
                "role": "operations",
                "department": "All",
                "departments": ["All"],
            }
        )
        summary = payload["permissions"]["summary"]
        self.assertEqual(summary["sales"], "view")
        self.assertEqual(summary["content_calendar"], "view")
        self.assertEqual(summary["website"], "view")
        self.assertEqual(summary["active_clients"], "manage")
        self.assertEqual(summary["exceptions"], "all")
        self.assertTrue(payload["permissions"]["view_only"])

    def test_operations_role_defaults(self):
        """Operations can view work modules and manage active clients; daily_log is off by default."""
        user = {
            "id": "ops-1",
            "role": "operations",
            "department": "Operations",
            "primary_department": "Operations",
            "departments": ["Operations"],
        }
        ctx = load_ctx(user)
        self.assertEqual(resolve(ctx, "daily_log"), "none")
        self.assertEqual(resolve(ctx, "attendance"), "all")
        self.assertEqual(resolve(ctx, "exceptions"), "all")
        self.assertEqual(resolve(ctx, "active_clients"), "manage")
        self.assertEqual(resolve(ctx, "content_calendar"), "view")
        self.assertEqual(resolve(ctx, "website"), "view")
        self.assertEqual(resolve(ctx, "sales"), "view")
        self.assertEqual(resolve(ctx, "ads"), "view")
        self.assertEqual(resolve(ctx, "content_calendar", "Website"), "view")

    def test_parametrized_primary_department_grants(self):
        """
        Parametrized matrix testing primary department grants for leads and members.
        Format: (role, primary_dept, module, expected_level)
        """
        cases = [
            # Content / Creative / Social Media -> content_calendar
            ("team_lead", "content", "content_calendar", "manage"),
            ("team_member", "content", "content_calendar", "own_stages"),
            ("team_lead", "creative", "content_calendar", "manage"),
            ("team_member", "creative", "content_calendar", "own_stages"),
            ("team_lead", "social media", "content_calendar", "manage"),
            ("team_member", "social media", "content_calendar", "own_stages"),
            # Content lead/member gets none for website, sales, ads
            ("team_lead", "content", "website", "none"),
            ("team_member", "content", "website", "none"),
            ("team_lead", "content", "sales", "none"),
            ("team_member", "content", "sales", "none"),
            ("team_lead", "content", "ads", "none"),
            ("team_member", "content", "ads", "none"),

            # Website -> website (lead: manage, member: assigned)
            ("team_lead", "website", "website", "manage"),
            ("team_member", "website", "website", "assigned"),
            ("team_lead", "web development", "website", "manage"),
            ("team_member", "software development", "website", "assigned"),
            # Website gets none for content, sales, ads
            ("team_lead", "website", "content_calendar", "none"),
            ("team_member", "website", "content_calendar", "none"),
            ("team_lead", "website", "sales", "none"),
            ("team_member", "website", "ads", "none"),

            # Sales -> sales (lead: all, member: own)
            ("team_lead", "sales", "sales", "all"),
            ("team_member", "sales", "sales", "own"),
            # Sales gets none for content, website, ads
            ("team_lead", "sales", "content_calendar", "none"),
            ("team_member", "sales", "website", "none"),
            ("team_lead", "sales", "ads", "none"),

            # SEO & Performance Marketing -> ads (lead: manage, member: view)
            ("team_lead", "seo", "ads", "manage"),
            ("team_member", "seo", "ads", "view"),
            ("team_lead", "performance marketing", "ads", "manage"),
            ("team_member", "performance marketing", "ads", "view"),
            # SEO and Perf get none for content, website, sales
            ("team_lead", "seo", "content_calendar", "none"),
            ("team_member", "seo", "content_calendar", "none"),
            ("team_lead", "performance marketing", "content_calendar", "none"),
            ("team_member", "performance marketing", "content_calendar", "none"),
            ("team_lead", "seo", "website", "none"),
            ("team_member", "performance marketing", "sales", "none"),
        ]

        for role, primary_dept, module, expected_level in cases:
            with self.subTest(role=role, primary_dept=primary_dept, module=module):
                user = {
                    "id": f"u-{role}-{primary_dept}",
                    "role": role,
                    "department": primary_dept,
                    "primary_department": primary_dept,
                    "departments": [primary_dept],
                }
                ctx = load_ctx(user)
                lvl = resolve(ctx, module)
                self.assertEqual(
                    lvl,
                    expected_level,
                    f"{role} in {primary_dept} expected {expected_level} on {module}, got {lvl}",
                )

    def test_secondary_departments_restrictions(self):
        """
        Rule 8: Secondary departments grant ONLY content_calendar stages.
        A secondary sales, website, SEO or performance marketing department
        does NOT unlock that module, daily log, or team hours.
        """
        # Case A: Content lead with secondary Creative & Social Media
        # Content lead gets 'manage' on primary and extra content-calendar departments.
        user_a = {
            "id": "u-lead-content-multi",
            "role": "team_lead",
            "department": "Content, Creative, Social Media",
            "primary_department": "Content",
            "departments": ["Content", "Creative", "Social Media"],
        }
        ctx_a = load_ctx(user_a)
        # Primary department gives manage on content_calendar
        self.assertEqual(resolve(ctx_a, "content_calendar", "Content"), "manage")
        # Secondary departments contribute own_stages for stages
        self.assertEqual(resolve(ctx_a, "content_calendar", "Creative"), "manage")
        self.assertEqual(resolve(ctx_a, "content_calendar", "Social Media"), "manage")
        # Secondary does NOT give daily_log or exceptions for creative
        self.assertEqual(resolve(ctx_a, "daily_log", "Creative"), "none")
        self.assertEqual(resolve(ctx_a, "exceptions", "Creative"), "none")

        # Case B: Content member with secondary Sales
        # CRM / sales must be 403 / none!
        user_b = {
            "id": "u-mem-content-sales",
            "role": "team_member",
            "department": "Content, Sales",
            "primary_department": "Content",
            "departments": ["Content", "Sales"],
        }
        ctx_b = load_ctx(user_b)
        self.assertEqual(resolve(ctx_b, "sales", "Content"), "none")
        self.assertEqual(resolve(ctx_b, "sales", "Sales"), "none")
        self.assertEqual(resolve(ctx_b, "sales"), "none")
        # Effective map summary for sales must be 'none'
        eff_b = effective_map(ctx_b)
        self.assertEqual(eff_b["summary"]["sales"], "none")

        # Case C: Content lead with secondary Website
        # Website must be none!
        user_c = {
            "id": "u-lead-content-web",
            "role": "team_lead",
            "department": "Content, Website",
            "primary_department": "Content",
            "departments": ["Content", "Website"],
        }
        ctx_c = load_ctx(user_c)
        self.assertEqual(resolve(ctx_c, "website", "Content"), "none")
        self.assertEqual(resolve(ctx_c, "website", "Website"), "none")
        self.assertEqual(resolve(ctx_c, "website"), "none")
        eff_c = effective_map(ctx_c)
        self.assertEqual(eff_c["summary"]["website"], "none")

        # Case D: Website member with secondary Performance Marketing
        # Ads must be none!
        user_d = {
            "id": "u-mem-web-perf",
            "role": "team_member",
            "department": "Website, Performance Marketing",
            "primary_department": "Website",
            "departments": ["Website", "Performance Marketing"],
        }
        ctx_d = load_ctx(user_d)
        self.assertEqual(resolve(ctx_d, "ads", "Website"), "none")
        self.assertEqual(resolve(ctx_d, "ads", "Performance Marketing"), "none")
        self.assertEqual(resolve(ctx_d, "ads"), "none")
        eff_d = effective_map(ctx_d)
        self.assertEqual(eff_d["summary"]["ads"], "none")

    def test_override_grant_and_revoke(self):
        """Stored overrides and edited role defaults do not change access."""
        user = {
            "id": "u-mem-1",
            "role": "team_member",
            "department": "Content",
            "primary_department": "Content",
            "departments": ["Content"],
            "overrides": [{
                "department": "Content",
                "module": "website",
                "level": "manage",
            }],
        }
        ctx_base = load_ctx(user)
        self.assertEqual(resolve(ctx_base, "website"), "none")

        override_doc = {
            "user_id": "u-mem-1",
            "department": "Content",
            "module": "website",
            "level": "manage",
        }
        fresh = {k: v for k, v in user.items() if k != "_perm_ctx"}
        ctx_granted = load_ctx(fresh, overrides=[override_doc], role_defaults={
            "team_member": {"website": "manage"},
        })
        self.assertEqual(resolve(ctx_granted, "website"), "none")

    def test_sales_department_gets_active_clients(self):
        lead = load_ctx({
            "id": "sl",
            "role": "team_lead",
            "primary_department": "Sales",
            "departments": ["Sales"],
        })
        member = load_ctx({
            "id": "sm",
            "role": "team_member",
            "primary_department": "Sales",
            "departments": ["Sales"],
        })
        content = load_ctx({
            "id": "cm",
            "role": "team_member",
            "primary_department": "Content",
            "departments": ["Content"],
        })
        hr = load_ctx({
            "id": "hr-ac",
            "role": "hr",
            "primary_department": "Human Resources",
            "departments": ["Human Resources"],
        })
        ops_sales_off = load_ctx({
            "id": "ops-nosales",
            "role": "operations",
            "access": {"sales": False},
        })
        client = load_ctx({
            "id": "client-ac",
            "role": "client",
        })
        self.assertEqual(resolve(lead, "active_clients"), "view")
        self.assertEqual(resolve(member, "active_clients"), "view")
        self.assertEqual(resolve(content, "active_clients"), "view")
        self.assertEqual(resolve(hr, "active_clients"), "view")
        self.assertEqual(resolve(ops_sales_off, "active_clients"), "manage")
        self.assertEqual(resolve(client, "active_clients"), "none")

    def test_content_lead_extra_departments_add_calendar_stages_only(self):
        user = {
            "id": "u-lead-cc",
            "role": "team_lead",
            "primary_department": "Content",
            "departments": ["Content", "Creative", "Social media"],
        }
        ctx = load_ctx(user)
        self.assertEqual(resolve(ctx, "content_calendar", "Content"), "manage")
        self.assertEqual(resolve(ctx, "content_calendar", "Creative"), "manage")
        self.assertEqual(resolve(ctx, "content_calendar", "Social media"), "manage")
        self.assertEqual(resolve(ctx, "website", "Creative"), "none")
        self.assertEqual(resolve(ctx, "sales"), "none")
        self.assertEqual(resolve(ctx, "daily_log", "Creative"), "none")

    def test_operations_alias_role_is_company_wide_view(self):
        from app.services.permissions_migration import operations_canonical_role

        self.assertEqual(
            operations_canonical_role({"role": "operations_lead"}),
            "operations",
        )
        self.assertIsNone(operations_canonical_role({"role": "operations"}))
        ctx = load_ctx({"id": "ops-alias", "role": "operations", "department": "Sales"})
        self.assertEqual(resolve(ctx, "website"), "view")
        self.assertTrue(effective_map(ctx)["view_only"])
        self.assertTrue(effective_map(ctx)["company_wide"])

    def test_operations_writes_blocked_except_won_deal(self):
        from app.services.permissions import operations_mutation_blocked

        self.assertFalse(operations_mutation_blocked("GET", "/api/v1/crm/leads", "operations"))
        self.assertTrue(operations_mutation_blocked("POST", "/api/v1/crm/leads", "operations"))
        self.assertTrue(operations_mutation_blocked("POST", "/api/v1/content-calendar", "operations"))
        self.assertTrue(operations_mutation_blocked("PATCH", "/api/v1/website-projects/p1", "operations"))
        self.assertTrue(operations_mutation_blocked("POST", "/api/v1/marketing/campaigns", "operations"))
        self.assertTrue(operations_mutation_blocked("POST", "/api/v1/daily-log/entries", "operations"))
        self.assertFalse(
            operations_mutation_blocked(
                "POST", "/api/v1/crm/approvals/won-deals/deal-1/approve", "operations"
            )
        )
        self.assertFalse(
            operations_mutation_blocked(
                "POST", "/api/v1/leaves/requests/abc/status", "operations"
            )
        )
        self.assertFalse(
            operations_mutation_blocked(
                "POST", "/api/v1/workspaces", "operations"
            )
        )
        self.assertFalse(
            operations_mutation_blocked(
                "PATCH", "/api/v1/workspaces/ws-1", "operations"
            )
        )
        self.assertFalse(
            operations_mutation_blocked(
                "POST", "/api/v1/admin/workspaces", "operations"
            )
        )
        self.assertFalse(
            operations_mutation_blocked(
                "POST", "/api/v1/crm/leads/lead-1/register-client", "operations"
            )
        )
        self.assertFalse(
            operations_mutation_blocked(
                "POST", "/api/v1/crm/leads/lead-1/convert-to-workspace", "operations"
            )
        )
        self.assertFalse(
            operations_mutation_blocked(
                "POST", "/api/v1/daily-log/upload", "operations"
            )
        )
        self.assertFalse(
            operations_mutation_blocked(
                "POST", "/api/v1/daily-log/upload?store_as=/uploads/deliverables/sample.pdf", "operations"
            )
        )
        self.assertFalse(
            operations_mutation_blocked(
                "POST", "/api/v1/workspaces/upload-proposal", "operations"
            )
        )
        self.assertFalse(operations_mutation_blocked("POST", "/api/v1/crm/leads", "admin"))


if __name__ == "__main__":
    unittest.main()
