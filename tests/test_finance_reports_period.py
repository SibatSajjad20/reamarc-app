"""Accounts > Reports: period aggregation (monthly / quarterly / semi-annual / yearly),
run-rate percentage, company scoping and finance access.

Pure-function tests plus API tests against a throwaway local MongoDB
(mongodb://localhost:27017, db reamarc_test_finreports).
"""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import httpx
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.security import get_current_user
from app.core.tenant import TenantContext, set_tenant_context
from app.database import db_instance
from app.routers import finance as fr
from app.services import finance_reports as rep

DB = "reamarc_test_finreports"
A, B = "company_rep_a", "company_rep_b"
TODAY = "2026-10-27"


def R(date, pkr, client="Acme", cid=A, status="posted"):
    return {"id": f"r-{cid}-{date}-{client}", "company_id": cid, "date": date, "status": status,
            "pkr_amount": pkr, "currency": "PKR", "client_name": client, "method": "bank_transfer"}


def monthly_receipts():
    # 2025: 50k/month; 2026 Jan..Oct: 100k/month (minor units: x100)
    out = [R(f"2025-{m:02d}-05", 5_000_000) for m in range(1, 13)]
    out += [R(f"2026-{m:02d}-05", 10_000_000) for m in range(1, 11)]
    return out


def build(period, date_from="2024-01-01", receipts=None):
    return rep.build_monthly_collections_analysis(
        date_from=date_from, date_to=TODAY, today=TODAY,
        receipts=receipts if receipts is not None else monthly_receipts(), invoices=[], period=period,
    )


class PeriodHelpers(unittest.TestCase):
    def test_keys_labels_and_prev(self):
        self.assertEqual(rep._period_of("2026-10-27", "quarterly"), "2026-Q4")
        self.assertEqual(rep._period_of("2026-06-30", "semiannual"), "2026-H1")
        self.assertEqual(rep._period_of("2026-07-01", "semiannual"), "2026-H2")
        self.assertEqual(rep._period_of("2026-10-27", "yearly"), "2026")
        self.assertEqual(rep._prev_period("2026-Q1"), "2025-Q4")
        self.assertEqual(rep._prev_period("2026-H1"), "2025-H2")
        self.assertEqual(rep._prev_period("2026"), "2025")
        self.assertEqual(rep._prev_period("2026-01"), "2025-12")
        self.assertEqual(rep._period_key_label("2026-Q4"), "Q4 2026")
        self.assertEqual(rep._days_in_period("2024-H1"), 182)
        self.assertEqual(rep.period_start("2025-02-10", "quarterly"), "2025-01-01")

    def test_normalize_and_validate(self):
        self.assertEqual(rep.normalize_period(None), "monthly")
        self.assertEqual(rep.normalize_period("Semi-Annual"), "semiannual")
        with self.assertRaises(ValueError):
            rep.normalize_period("weekly")
        for ok in ("2026-10", "2026-Q4", "2026-H2", "2026"):
            self.assertTrue(rep.is_period_key(ok))
        for bad in ("2026-13", "2026-Q5", "x", "2026-H3", "{'$gt':1}"):
            self.assertFalse(rep.is_period_key(bad))

    def test_run_rate_pct_divide_by_zero_safe(self):
        self.assertIsNone(rep.run_rate_pct(500, None))
        self.assertIsNone(rep.run_rate_pct(500, 0))
        self.assertIsNone(rep.run_rate_pct(500, -10))
        self.assertEqual(rep.run_rate_pct(150, 100), 50.0)
        self.assertEqual(rep.run_rate_pct(80, 100), -20.0)


class PeriodAggregation(unittest.TestCase):
    def test_monthly_default_unchanged(self):
        out = rep.build_monthly_collections_analysis(
            date_from="2026-01-01", date_to=TODAY, today=TODAY, receipts=monthly_receipts(), invoices=[])
        self.assertEqual(out["period"], "monthly")
        self.assertEqual([m["month"] for m in out["months"]][:2], ["2026-01", "2026-02"])
        self.assertEqual(out["selected"]["month"], "2026-10")

    def test_quarterly_buckets_sum_months(self):
        out = build("quarterly")
        rows = {m["month"]: m for m in out["months"]}
        self.assertEqual(rows["2025-Q1"]["collected_pkr"], 15_000_000)
        self.assertEqual(rows["2026-Q3"]["collected_pkr"], 30_000_000)
        self.assertEqual(rows["2026-Q4"]["collected_pkr"], 10_000_000)
        self.assertTrue(rows["2026-Q4"]["is_partial"])
        sel = out["selected"]
        self.assertEqual((sel["month"], sel["label"], sel["prior_label"]), ("2026-Q4", "Q4 2026", "Q3 2026"))
        self.assertEqual(sel["days_in_month"], 92)
        self.assertEqual(sel["days_elapsed"], 27)
        # run rate = avg(Q1..Q3 2026)=30M, pro-rated 27/92
        self.assertEqual(sel["run_rate_3m_pkr"], 30_000_000)
        expected = round(30_000_000 * 27 / 92)
        self.assertAlmostEqual(sel["run_rate_compare_pkr"], expected, delta=1)
        self.assertEqual(sel["run_rate_pct"], rep.run_rate_pct(10_000_000, sel["run_rate_compare_pkr"]))

    def test_semiannual_and_yearly(self):
        semi = build("semiannual")
        rows = {m["month"]: m["collected_pkr"] for m in semi["months"]}
        self.assertEqual(rows["2025-H2"], 30_000_000)
        self.assertEqual(rows["2026-H1"], 60_000_000)
        self.assertEqual(semi["selected"]["month"], "2026-H2")
        yearly = build("yearly")
        rows = {m["month"]: m["collected_pkr"] for m in yearly["months"]}
        self.assertEqual(rows, {"2024": 0, "2025": 60_000_000, "2026": 100_000_000})
        self.assertEqual(yearly["selected"]["prior_label"], "2025")

    def test_range_snaps_to_period_start(self):
        out = build("quarterly", date_from="2025-02-17")
        self.assertEqual(out["date_from"], "2025-01-01")
        self.assertEqual(out["months"][0]["month"], "2025-Q1")
        self.assertEqual(out["months"][0]["collected_pkr"], 15_000_000)

    def test_focus_period(self):
        out = rep.build_monthly_collections_analysis(
            date_from="2025-01-01", date_to=TODAY, today=TODAY, receipts=monthly_receipts(),
            invoices=[], period="quarterly", focus_month="2026-Q2")
        sel = out["selected"]
        self.assertEqual(sel["month"], "2026-Q2")
        self.assertFalse(sel["is_partial"])
        # run rate = avg(Q3 2025, Q4 2025, Q1 2026) = (15+15+30)/3 = 20M; Q2=30M -> +50%
        self.assertEqual(sel["run_rate_compare_pkr"], 20_000_000)
        self.assertEqual(sel["run_rate_pct"], 50.0)

    def test_no_run_rate_without_history(self):
        out = build("yearly", date_from="2026-01-01")
        self.assertIsNone(out["selected"]["run_rate_pct"])


class ReportsApi(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncIOMotorClient("mongodb://localhost:27017")
        await self.client.drop_database(DB)
        self.db = self.client[DB]
        self.prev = db_instance.db
        db_instance.db = self.db
        await self.db.receipts.insert_many(
            monthly_receipts() + [R("2026-09-05", 99_000_000, client="Other", cid=B)]
        )
        self.app = FastAPI()
        self.app.include_router(fr.router, prefix="/api/v1")
        self.user = {"id": "uA", "role": "admin", "company_id": A, "is_active": True, "full_name": "uA", "email": "a@x.io"}

        async def _user():
            set_tenant_context(TenantContext(company_id=self.user["company_id"], user_id=self.user["id"]))
            return self.user

        self.app.dependency_overrides[get_current_user] = _user

    async def asyncTearDown(self):
        await self.client.drop_database(DB)
        db_instance.db = self.prev
        self.client.close()

    async def get(self, **params):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://t") as c:
            return await c.get("/api/v1/finance/reports/monthly-analysis",
                               params={"date_from": "2025-01-01", "date_to": TODAY, **params})

    async def test_quarterly_api_company_scoped(self):
        r = await self.get(period="quarterly")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["period"], "quarterly")
        rows = {m["month"]: m["collected_pkr"] for m in body["months"]}
        self.assertEqual(rows["2026-Q3"], 30_000_000)  # company B's 990k is not counted
        self.assertIn("run_rate_pct", body["selected"])

    async def test_default_is_monthly(self):
        r = await self.get()
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["period"], "monthly")
        self.assertEqual(r.json()["selected"]["month"], "2026-10")

    async def test_bad_period_and_focus_rejected(self):
        self.assertEqual((await self.get(period="weekly")).status_code, 400)
        self.assertEqual((await self.get(period="quarterly", focus_month="2026-Q9")).status_code, 400)
        r = await self.get(period="quarterly", focus_month="2026-Q2")
        self.assertEqual(r.json()["selected"]["month"], "2026-Q2")

    async def test_client_filter_is_literal(self):
        r = await self.get(period="yearly", client_name=".*")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(all(m["collected_pkr"] == 0 for m in r.json()["months"]))

    async def test_non_finance_roles_forbidden(self):
        for role in ("employee", "manager", "client"):
            self.user = {**self.user, "role": role}
            r = await self.get(period="quarterly")
            self.assertEqual(r.status_code, 403, f"{role}: {r.status_code}")

    async def test_pdf_export_with_period(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://t") as c:
            r = await c.get("/api/v1/finance/reports/monthly-analysis",
                            params={"date_from": "2025-01-01", "date_to": TODAY, "period": "semiannual", "format": "pdf"})
        self.assertEqual(r.status_code, 200, r.text[:300])
        self.assertTrue(r.content.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
