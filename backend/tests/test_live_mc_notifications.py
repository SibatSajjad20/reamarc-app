"""Multi-company notification, scheduler branding, and device isolation."""
from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.core.tenant import tenant_scope
from app.services import crm_scheduler, device_registry, push_service
from app.services.crm_meeting_reminder_scheduler import build_meeting_reminder_10m_html
from app.services.email_service import (
    EmailService,
    _build_reminder_html,
    resolve_sender_identity,
)

DATAVIZ = "comp_dataviz"
REAMARC = "company_reamarc"
LEAKS = ("Reamarc", "faizan@reamarc.com", "Rawalpindi", "+92326")


def _flags(on: bool = True):
    return patch.multiple(settings, MULTI_TENANT_ENABLED=on, MULTI_COMPANY_ENABLED=on, SMTP_FROM_NAME="Reamarc Workspace")


def _assert_clean(test, blob: str):
    text = blob or ""
    for needle in LEAKS:
        test.assertNotIn(needle, text)


class _SettingsColl:
    def __init__(self):
        self.doc = None

    async def update_one(self, filt, update, upsert=False):
        if self.doc is None and upsert:
            seed = dict(update.get("$setOnInsert") or {})
            seed.update(filt)
            self.doc = seed

    async def find_one(self, *args, **kwargs):
        return dict(self.doc) if self.doc else None


class _MemDevices:
    def __init__(self, rows, company_id=None):
        self.rows = rows
        self.company_id = company_id

    def _match(self, query, doc):
        query = dict(query or {})
        if self.company_id and "company_id" not in query:
            if doc.get("company_id") != self.company_id:
                return False
        if "$or" in query:
            rest = {k: v for k, v in query.items() if k != "$or"}
            if rest and not self._match(rest, doc):
                return False
            return any(self._match(part, doc) for part in query["$or"])
        for key, value in query.items():
            if isinstance(value, dict):
                if "$ne" in value and doc.get(key) == value["$ne"]:
                    return False
                if "$in" in value and doc.get(key) not in value["$in"]:
                    return False
            elif doc.get(key) != value:
                return False
        return True

    async def find_one(self, query=None, *args, **kwargs):
        for row in self.rows:
            if self._match(query, row):
                return dict(row)
        return None

    async def update_one(self, query, update, upsert=False):
        for row in self.rows:
            if self._match(query, row):
                row.update((update or {}).get("$set") or {})
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    async def update_many(self, query, update):
        n = 0
        for row in self.rows:
            if self._match(query, row):
                row.update((update or {}).get("$set") or {})
                n += 1
        return SimpleNamespace(modified_count=n)

    async def insert_one(self, doc):
        stored = dict(doc)
        if self.company_id:
            stored.setdefault("company_id", self.company_id)
        self.rows.append(stored)
        return SimpleNamespace(inserted_id=stored.get("id"))

    def find(self, query=None, *args, **kwargs):
        matched = [dict(row) for row in self.rows if self._match(query, row)]

        async def _to_list(_n=500):
            return matched

        return SimpleNamespace(to_list=_to_list)


class _TenantDB:
    def __init__(self, company_id, rows):
        self.company_id = company_id
        self.mobile_devices = _MemDevices(rows, company_id)
        self._rows = rows

    def raw(self):
        return SimpleNamespace(mobile_devices=_MemDevices(self._rows, company_id=None))


class TestSchedulerBrandIsolation(unittest.IsolatedAsyncioTestCase):
    async def test_non_reamarc_defaults_have_no_reamarc_copy(self):
        settings_coll = _SettingsColl()
        db = SimpleNamespace(crm_scheduler_settings=settings_coll)
        company = {"id": DATAVIZ, "name": "DataViz", "contact_email": "ops@dataviz.test"}
        gdb = MagicMock()
        gdb.companies.find_one = AsyncMock(return_value=company)
        with _flags(True), tenant_scope(DATAVIZ), patch("app.services.crm_scheduler._db", return_value=db), patch(
            "app.core.tenant.get_global_db", return_value=gdb
        ), patch(
            "app.services.company_branding.get_company_doc", new=AsyncMock(return_value=company)
        ), patch(
            "app.services.company_branding.company_admin_reply_email", new=AsyncMock(return_value="ops@dataviz.test")
        ):
            sched = await crm_scheduler.get_scheduler_settings()
            html = crm_scheduler.build_booking_confirmation_html(
                "Alex",
                {
                    "event_name": sched["title"],
                    "host_name": sched["host_name"],
                    "host_email": sched["host_email"],
                    "office_address": sched["office_address"],
                    "office_map_url": sched["office_map_url"],
                    "date": "2026-10-23",
                    "slot_time": "11:00",
                    "meeting_mode": "google_meet",
                    "location_label": "Google Meet",
                    "timezone": "Asia/Karachi",
                },
                "https://calendar.google.com/example",
                brand_name="DataViz",
                reamarc=False,
            )
            ics = crm_scheduler.generate_ics_calendar(
                lead_id="ld_test1",
                title=sched["title"],
                description="Session",
                location="",
                start_dt=datetime(2026, 10, 23, 6, 0, tzinfo=timezone.utc),
                end_dt=datetime(2026, 10, 23, 6, 30, tzinfo=timezone.utc),
                host_name=sched["host_name"],
                host_email=sched["host_email"],
                attendee_name="Alex",
                attendee_email="alex@client.test",
                brand_name="DataViz",
                reamarc=False,
            )
            public_blob = " ".join(
                [
                    str(sched.get("host_name")),
                    str(sched.get("host_email")),
                    str(sched.get("office_address")),
                    str(sched.get("hr_whatsapp")),
                    " ".join(sched.get("services") or []),
                    " ".join(sched.get("careers_roles") or []),
                ]
            )
        self.assertEqual(sched["host_name"], "DataViz")
        self.assertEqual(sched["host_email"], "ops@dataviz.test")
        self.assertEqual(sched["office_address"], "")
        self.assertEqual(sched["services"], [])
        _assert_clean(self, html)
        _assert_clean(self, ics)
        _assert_clean(self, public_blob)
        self.assertIn("DataViz", ics)
        self.assertNotIn("PRODID:-//Reamarc AI//", ics)


class TestDevicePushIsolation(unittest.IsolatedAsyncioTestCase):
    async def test_other_user_on_same_phone_is_blocked_or_token_cleared(self):
        rows = []
        phone = "device-uuid-phone-1"
        token_x = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
        token_y = "ExponentPushToken[yyyyyyyyyyyyyyyyyyyyyy]"
        db_a = _TenantDB("comp_a", rows)
        db_b = _TenantDB("comp_b", rows)
        x = {"id": "user_x", "full_name": "X", "email": "x@a.test"}
        y = {"id": "user_y", "full_name": "Y", "email": "y@b.test"}

        with patch("app.services.device_registry.get_database", return_value=db_a), tenant_scope("comp_a"):
            await device_registry.register_device(x, phone, push_token=token_x)
        self.assertEqual(rows[0]["push_token"], token_x)

        with patch("app.services.device_registry.get_database", return_value=db_b), tenant_scope("comp_b"):
            with self.assertRaises(HTTPException) as raised:
                await device_registry.register_device(y, phone, push_token=token_y)
        self.assertEqual(raised.exception.status_code, 403)

        with patch.object(device_registry, "ENFORCE_ONE_DEVICE_ONE_ACCOUNT", False), patch(
            "app.services.device_registry.get_database", return_value=db_b
        ), tenant_scope("comp_b"):
            await device_registry.register_device(y, phone, push_token=token_y)

        x_row = next(r for r in rows if r["user_id"] == "user_x")
        y_row = next(r for r in rows if r["user_id"] == "user_y")
        self.assertIsNone(x_row.get("push_token"))
        self.assertEqual(y_row.get("push_token"), token_y)

        captured = []

        async def fake_expo(tokens, title, body, data=None):
            captured.extend(list(tokens))
            return len(list(tokens))

        gdb = MagicMock()
        gdb.companies.find_one = AsyncMock(return_value={"id": "comp_a", "name": "Alpha"})
        gdb.company_memberships.find.return_value = SimpleNamespace(
            to_list=AsyncMock(return_value=[{"user_id": "user_x"}])
        )
        with _flags(True), tenant_scope("comp_a"), patch(
            "app.services.device_registry.get_database", return_value=db_a
        ), patch("app.services.push_service.filter_allowed_recipients", new=AsyncMock(side_effect=lambda ids, *a, **k: ids)), patch(
            "app.services.push_service.store_notification", new=AsyncMock()
        ), patch(
            "app.services.push_service.send_expo_push", side_effect=fake_expo
        ), patch(
            "app.services.web_push_service.send_web_push", new=AsyncMock(return_value=0)
        ), patch(
            "app.core.tenant.get_global_db", return_value=gdb
        ):
            await push_service.dispatch_to_users(["user_x"], "Hello", "Body")
        self.assertNotIn(token_y, captured)
        self.assertNotIn(token_x, captured)

    async def test_logout_clears_token_across_companies(self):
        rows = [
            {
                "id": "dev_1",
                "user_id": "user_x",
                "device_uuid": "device-uuid-phone-1",
                "push_token": "ExponentPushToken[aa]",
                "company_id": "comp_a",
                "is_active": True,
            },
            {
                "id": "dev_2",
                "user_id": "user_x",
                "device_uuid": "device-uuid-phone-1",
                "push_token": "ExponentPushToken[aa]",
                "company_id": "comp_b",
                "is_active": True,
            },
        ]
        db = _TenantDB("comp_a", rows)
        with patch("app.services.device_registry.get_database", return_value=db):
            await device_registry.clear_push_token_on_logout("user_x", "device-uuid-phone-1")
        self.assertTrue(all(r.get("push_token") is None for r in rows))


class TestPushCompanyPrefix(unittest.IsolatedAsyncioTestCase):
    def test_prefix_only_for_multi_membership(self):
        self.assertEqual(
            push_service.company_prefixed_title("Late", "DataViz", multi_company=True),
            "[DataViz] Late",
        )
        self.assertEqual(
            push_service.company_prefixed_title("Late", "DataViz", multi_company=False),
            "Late",
        )


class TestWebPushIndexSpec(unittest.TestCase):
    def test_compound_endpoint_company_index_is_registered(self):
        from app.core.index_migration import COMPANY_UNIQUE_INDEXES

        spec = next(s for s in COMPANY_UNIQUE_INDEXES if s["collection"] == "web_push_subscriptions")
        self.assertEqual(spec["new_keys"], [("endpoint", 1), ("company_id", 1)])
        self.assertIn("idx_web_push_endpoint", spec["old_names"])


PUSH_ENDPOINT = "https://fcm.googleapis.com/fcm/send/shared-browser-endpoint"
PUSH_P256DH = "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
PUSH_AUTH = "AAAAAAAAAAAAAAAAAAAAAA"


class _MemPush:
    def __init__(self, rows, company_id=None):
        self.rows = rows
        self.company_id = company_id

    def _match(self, query, doc):
        query = dict(query or {})
        if self.company_id and "company_id" not in query:
            if doc.get("company_id") != self.company_id:
                return False
        for key, value in query.items():
            if isinstance(value, dict):
                if "$ne" in value and doc.get(key) == value["$ne"]:
                    return False
                if "$in" in value and doc.get(key) not in value["$in"]:
                    return False
            elif doc.get(key) != value:
                return False
        return True

    async def update_one(self, query, update, upsert=False):
        from pymongo.errors import DuplicateKeyError

        for row in self.rows:
            if self._match(query, row):
                row.update((update or {}).get("$set") or {})
                return SimpleNamespace(modified_count=1, upserted_id=None)
        if not upsert:
            return SimpleNamespace(modified_count=0, upserted_id=None)
        stored = dict((update or {}).get("$setOnInsert") or {})
        stored.update((update or {}).get("$set") or {})
        stored.update(dict(query or {}))
        if self.company_id:
            stored.setdefault("company_id", self.company_id)
        for row in self.rows:
            if row.get("endpoint") == stored.get("endpoint") and row.get("company_id") == stored.get("company_id"):
                raise DuplicateKeyError("uniq_web_push_endpoint_company")
        self.rows.append(stored)
        return SimpleNamespace(modified_count=0, upserted_id=stored.get("id"))

    async def delete_many(self, query):
        kept = [row for row in self.rows if not self._match(query, row)]
        n = len(self.rows) - len(kept)
        self.rows[:] = kept
        return SimpleNamespace(deleted_count=n)

    def find(self, query=None, *args, **kwargs):
        matched = [dict(row) for row in self.rows if self._match(query, row)]

        class _Cursor:
            def sort(self, *a, **k):
                return self

            async def to_list(self, _n=500):
                return matched

        return _Cursor()


class _PushTenantDB:
    def __init__(self, company_id, rows):
        self.company_id = company_id
        self._rows = rows
        self.web_push_subscriptions = _MemPush(rows, company_id)

    def raw(self):
        return SimpleNamespace(web_push_subscriptions=_MemPush(self._rows, company_id=None))


class TestWebPushEndpointHandoff(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from app.services import web_push_service

        self._web = web_push_service
        self._ensure = patch.object(web_push_service, "_ensure_indexes", new=AsyncMock())
        self._ensure.start()
        self.addCleanup(self._ensure.stop)

    async def _subscribe(self, db, company_id, user_id):
        with patch("app.services.web_push_service.get_database", return_value=db), tenant_scope(company_id):
            return await self._web.upsert_subscription(user_id, PUSH_ENDPOINT, PUSH_P256DH, PUSH_AUTH)

    async def test_other_user_other_company_drops_endpoint_for_x(self):
        rows = []
        db_a = _PushTenantDB("comp_a", rows)
        db_b = _PushTenantDB("comp_b", rows)
        await self._subscribe(db_a, "comp_a", "user_x")
        await self._subscribe(db_b, "comp_b", "user_y")
        self.assertFalse(any(r.get("user_id") == "user_x" and r.get("endpoint") == PUSH_ENDPOINT for r in rows))
        self.assertEqual(rows[0]["user_id"], "user_y")
        self.assertEqual(rows[0]["company_id"], "comp_b")

        delivered = []

        def fake_deliver(sub, payload):
            delivered.append(sub.get("endpoint"))
            return "ok"

        with _flags(True), tenant_scope("comp_a"), patch(
            "app.services.web_push_service.get_database", return_value=db_a
        ), patch("app.services.push_service.filter_allowed_recipients", new=AsyncMock(side_effect=lambda ids, *a, **k: ids)), patch.object(
            self._web, "web_push_configured", return_value=True
        ), patch.object(
            self._web, "public_application_server_key", return_value="pk"
        ), patch.object(
            self._web, "_deliver_one", side_effect=fake_deliver
        ):
            sent = await self._web.send_web_push(["user_x"], "Hello", "Body")
        self.assertEqual(sent, 0)
        self.assertNotIn(PUSH_ENDPOINT, delivered)

    async def test_other_user_same_company_reassigns_row(self):
        rows = []
        db_a = _PushTenantDB("comp_a", rows)
        await self._subscribe(db_a, "comp_a", "user_x")
        await self._subscribe(db_a, "comp_a", "user_y")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["user_id"], "user_y")
        self.assertEqual(rows[0]["company_id"], "comp_a")

    async def test_same_user_two_companies_keeps_both_rows(self):
        rows = []
        db_a = _PushTenantDB("comp_a", rows)
        db_b = _PushTenantDB("comp_b", rows)
        await self._subscribe(db_a, "comp_a", "user_x")
        await self._subscribe(db_b, "comp_b", "user_x")
        self.assertEqual(len(rows), 2)
        self.assertEqual({r["company_id"] for r in rows}, {"comp_a", "comp_b"})
        self.assertTrue(all(r["user_id"] == "user_x" and r["endpoint"] == PUSH_ENDPOINT for r in rows))


class TestGoLiveJobUnregistered(unittest.TestCase):
    def test_purge_job_not_scheduled(self):
        from app.services import attendance_scheduler

        fake = MagicMock()
        fake.running = False
        with patch.object(attendance_scheduler, "_attendance_scheduler", None), patch(
            "app.services.attendance_scheduler.AsyncIOScheduler", return_value=fake
        ):
            attendance_scheduler.start_attendance_scheduler()
        ids = [kwargs.get("id") for _args, kwargs in fake.add_job.call_args_list]
        self.assertNotIn("attendance_go_live_purge", ids)
        attendance_scheduler._attendance_scheduler = None


class TestEmailBranding(unittest.IsolatedAsyncioTestCase):
    async def test_non_reamarc_mail_types_use_brand(self):
        company = {
            "id": DATAVIZ,
            "name": "DataViz",
            "contact_email": "ops@dataviz.test",
            "accent_color": "#00AA66",
            "logo_url": "https://cdn.example/dv.png",
        }
        captured = []

        async def fake_dispatch(recipient_email, recipient_name, subject, html, **kwargs):
            captured.append(
                {
                    "subject": subject,
                    "html": html,
                    "from_name": kwargs.get("from_name"),
                    "reply_to": kwargs.get("reply_to"),
                }
            )
            return True

        gdb = MagicMock()
        gdb.company_memberships.find.return_value = _Cursor([])
        with _flags(True), tenant_scope(DATAVIZ), patch(
            "app.services.email_service._dispatch_outbound", side_effect=fake_dispatch
        ), patch("app.database.get_database", return_value=None), patch(
            "app.services.company_branding.get_company_doc", new=AsyncMock(return_value=company)
        ), patch(
            "app.core.tenant.get_global_db", return_value=gdb
        ):
            identity = await resolve_sender_identity(company)
            reminder_html = _build_reminder_html("Pat", ["2026-10-21"], company_name=None)
            await EmailService.send_log_reminder(
                recipient_email="pat@dataviz.test",
                recipient_name="Pat",
                missing_dates=["2026-10-21"],
                company=company,
            )
            await EmailService.send_password_reset_code("pat@dataviz.test", "123456", "Pat", company=company)
            booking = crm_scheduler.build_booking_confirmation_html(
                "Alex",
                {"event_name": "Intro", "host_name": "DataViz", "host_email": "ops@dataviz.test"},
                "#",
                brand_name="DataViz",
                reamarc=False,
            )
            await EmailService.send_html_email("alex@client.test", "Confirmed: Intro with DataViz", booking, company=company)
            meeting_html = build_meeting_reminder_10m_html(
                "Alex",
                {"event_name": "Intro", "host_name": "DataViz", "office_address": ""},
                identity=identity,
            )
            await EmailService.send_html_email(
                "alex@client.test",
                "Starting in 10 minutes: Intro with DataViz",
                meeting_html,
                company=company,
            )
            from app.services.crm_assignment import _email_html

            assign_html = await _email_html("A lead was assigned to you.", "https://app.example/crm")
            await EmailService.send_html_email("pat@dataviz.test", "New CRM lead", assign_html, company=company)

        self.assertGreaterEqual(len(captured), 5)
        for item in captured:
            self.assertEqual(item["from_name"], "DataViz")
            self.assertEqual(item["reply_to"], "ops@dataviz.test")
            blob = f"{item['subject']}\n{item['html']}"
            _assert_clean(self, blob)
            self.assertIn("DataViz", item["from_name"])
        _assert_clean(self, reminder_html)
        self.assertIn("DataViz", assign_html)
        self.assertIn("https://cdn.example/dv.png", assign_html)


class _Cursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def __aiter__(self):
        async def _gen():
            for row in self._rows:
                yield dict(row)

        return _gen()


if __name__ == "__main__":
    unittest.main()
