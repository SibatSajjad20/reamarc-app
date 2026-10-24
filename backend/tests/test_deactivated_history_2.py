"""Deactivated members, part 2: backdating, timesheet Inactive days, log compliance.

Throwaway Mongo only (name contains 'test'); outbound network blocked.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from test_deactivated_history import TestDeactivatedHistory as _Base, DEACT, CID  # noqa: E402


class TestDeactivatedHistory2(_Base):
    async def _mem(self):
        return await self.db.company_memberships.find_one({"user_id": "dh_hikmat", "company_id": CID})

    async def _user(self):
        return await self.db.users.find_one({"id": "dh_hikmat"})

    async def test_backdate_already_deactivated(self):
        r = await self.client.patch("/api/v1/admin/members/dh_hikmat",
                                    json={"is_active": False, "deactivation_date": "2026-10-13"},
                                    headers=self._auth("dh_adm"))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((await self._mem())["deactivation_date"], "2026-10-13")
        self.assertEqual((await self._user())["deactivation_date"], "2026-10-13")
        r = await self.client.get("/api/v1/admin/members?is_active=false", headers=self._auth("dh_adm"))
        self.assertEqual(r.json()[0].get("deactivation_date"), "2026-10-13")

    async def test_date_only_edit_without_is_active(self):
        r = await self.client.patch("/api/v1/admin/members/dh_hikmat", json={"deactivation_date": "2026-10-12"},
                                    headers=self._auth("dh_adm"))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((await self._mem())["deactivation_date"], "2026-10-12")

    async def test_saving_other_details_keeps_the_date(self):
        r = await self.client.patch("/api/v1/admin/members/dh_hikmat",
                                    json={"is_active": False, "full_name": "Hikmat Ullah"},
                                    headers=self._auth("dh_adm"))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((await self._mem())["deactivation_date"], DEACT)
        self.assertEqual((await self._user())["deactivation_date"], DEACT)

    async def test_bad_date_rejected(self):
        r = await self.client.patch("/api/v1/admin/members/dh_hikmat", json={"deactivation_date": "13/10/2026"},
                                    headers=self._auth("dh_adm"))
        self.assertEqual(r.status_code, 400, r.text)

    async def test_timesheet_reports_inactive_from(self):
        from app.services import attendance_service as svc
        ts = await self._in_company(lambda: svc.get_timesheet_for_user_id("dh_hikmat", 2026, 10))
        self.assertEqual(ts.deactivation_date, DEACT)
        # Oct 1-14 only: 11 working days (first Saturday off), nothing after the date counts.
        self.assertEqual(ts.summary.total_working_days, 11)

    async def test_log_compliance_lists_him_without_owing_days_after_date(self):
        from app.services.attendance_golive import pkt_today_str
        today = pkt_today_str()
        await self.db.company_memberships.update_one({"user_id": "dh_hikmat"}, {"$set": {"deactivation_date": today}})
        await self.db.users.update_one({"id": "dh_hikmat"}, {"$set": {"deactivation_date": today}})
        r = await self.client.get("/api/v1/admin/members/activity", headers=self._auth("dh_adm"))
        self.assertEqual(r.status_code, 200, r.text)
        rows = {a["user_id"]: a for a in r.json()}
        self.assertIn("dh_hikmat", rows)
        self.assertIs(rows["dh_hikmat"]["is_active"], False)
        self.assertEqual(rows["dh_hikmat"]["deactivation_date"], today)
        self.assertNotIn(today, rows["dh_hikmat"]["missing_dates"])
        self.assertIs(rows["dh_emp"]["is_active"], True)

    async def test_log_compliance_drops_him_once_window_is_past_date(self):
        r = await self.client.get("/api/v1/admin/members/activity", headers=self._auth("dh_adm"))
        self.assertEqual(r.status_code, 200, r.text)
        # Deactivated on Oct 15; the last 7 workdays are all after that.
        self.assertNotIn("dh_hikmat", {a["user_id"] for a in r.json()})

    async def test_reminder_refused_for_inactive(self):
        r = await self.client.post("/api/v1/admin/members/dh_hikmat/remind", json={"channel": "email"},
                                   headers=self._auth("dh_adm"))
        self.assertGreaterEqual(r.status_code, 400, r.text)


# Don't re-run the part-1 tests from this module.
for _n in [n for n in vars(_Base) if n.startswith("test_")]:
    setattr(TestDeactivatedHistory2, _n, None)
del _Base
