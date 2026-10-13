"""Won-deal approvals router is outside require_crm_user and field-limited."""
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.routers.crm_approvals import require_approve_won_deal, router as approvals_router
from app.services.crm_deals import serialize_won_approval, WON_APPROVAL_FIELDS
from app.services.permissions import has_capability


def _app(user: dict) -> FastAPI:
    app = FastAPI()
    app.include_router(approvals_router, prefix="/api/v1")

    async def _cap_user():
        return user

    app.dependency_overrides[require_approve_won_deal] = _cap_user
    return app


class TestWonDealApprovals(unittest.IsolatedAsyncioTestCase):
    def test_serialize_only_decision_fields(self):
        row = serialize_won_approval(
            {
                "id": "deal-1",
                "title": "Acme retainer",
                "value": 120000,
                "currency": "PKR",
                "updated_at": "2026-10-01T00:00:00Z",
                "notes": "Kickoff next week",
                "email": "should-not-leak@example.com",
            },
            {"name": "Jane", "company": "Acme", "email": "hidden@example.com", "phone_e164": "+1"},
            "Sales Owner",
        )
        self.assertEqual(set(row.keys()), set(WON_APPROVAL_FIELDS))
        self.assertNotIn("email", row)
        self.assertNotIn("phone_e164", row)
        self.assertEqual(row["lead_or_company_name"], "Acme")
        self.assertEqual(row["sales_owner_name"], "Sales Owner")

    def test_capability_defaults(self):
        self.assertTrue(has_capability({"role": "admin", "is_active": True}, "approve_won_deal"))
        self.assertTrue(has_capability({"role": "operations", "is_active": True}, "approve_won_deal"))
        self.assertFalse(has_capability({"role": "team_member", "is_active": True}, "approve_won_deal"))
        self.assertTrue(
            has_capability(
                {
                    "role": "team_member",
                    "is_active": True,
                    "capability_overrides": {"approve_won_deal": True},
                },
                "approve_won_deal",
            )
        )

    async def test_list_returns_200_for_operations(self):
        user = {"id": "ops1", "role": "operations", "is_active": True}
        rows = [
            {
                "id": "deal-1",
                "title": "Acme",
                "value": 10,
                "currency": "PKR",
                "won_date": "2026-10-01",
                "sales_owner_name": "Sam",
                "lead_or_company_name": "Acme Co",
                "won_note": "ok",
            }
        ]
        with patch("app.services.crm_deals.list_pending_won_approvals", new=AsyncMock(return_value=rows)):
            client = TestClient(_app(user))
            res = client.get("/api/v1/crm/approvals/won-deals")
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(set(body[0].keys()), set(WON_APPROVAL_FIELDS))


if __name__ == "__main__":
    unittest.main()
