"""Company isolation for Meta leads, Drive ingest, attendance defaults, and email branding."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.core.integrations import is_reamarc_company
from app.core.limiter import limiter
from app.core.tenant import tenant_scope
from app.constants.office_location import OFFICE_LATITUDE, OFFICE_LONGITUDE, get_built_in_office_ips
from app.services import crm_meta_accounts, google_drive_service as gdrive
from app.services.attendance_security import collect_whitelist_entries
from app.services.email_service import (
    _build_password_reset_html,
    _build_reminder_html,
    resolve_sender_identity,
    sanitize_from_name,
    EmailService,
)
from app.schemas.attendance import SecuritySettingsSchema

ENV_PAGE = "env_page_1"
ENV_TOKEN = "env-token-secret-value"
ENV_SECRET = "env-app-secret"
DATAVIZ = "comp_dataviz"
REAMARC = "company_reamarc"


class _Cursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *args, **kwargs):
        return self

    def __aiter__(self):
        async def _gen():
            for row in self._rows:
                yield dict(row)
        return _gen()


def _flags(on: bool):
    return patch.multiple(
        settings,
        MULTI_TENANT_ENABLED=on,
        MULTI_COMPANY_ENABLED=on,
        CRM_META_PAGE_ID=ENV_PAGE,
        CRM_META_PAGE_ACCESS_TOKEN=ENV_TOKEN,
        CRM_META_APP_SECRET=ENV_SECRET,
        SMTP_FROM_NAME="Reamarc Workspace",
        SMTP_FROM_EMAIL="noreply@reamarc.test",
        SMTP_USER="noreply@reamarc.test",
        BREVO_API_KEY="brevo-test-key",
        RESEND_API_KEY="",
        SENDGRID_API_KEY="",
    )


class TestIsReamarcCompany(unittest.TestCase):
    def test_ids_and_flags(self):
        with patch.object(settings, "MULTI_TENANT_ENABLED", False):
            self.assertTrue(is_reamarc_company(None))
            self.assertTrue(is_reamarc_company(REAMARC))
        with patch.object(settings, "MULTI_TENANT_ENABLED", True):
            self.assertFalse(is_reamarc_company(None))
            self.assertFalse(is_reamarc_company(DATAVIZ))
            self.assertTrue(is_reamarc_company(REAMARC))
            self.assertTrue(is_reamarc_company("tnt_comp_a"))


class TestMetaIsolation(unittest.IsolatedAsyncioTestCase):
    async def test_active_pages_dataviz_excludes_env(self):
        pages_coll = MagicMock()
        pages_coll.find.return_value = _Cursor([])
        db = SimpleNamespace(crm_meta_pages=pages_coll)
        with _flags(True), patch("app.services.crm_meta_accounts._db", return_value=db), tenant_scope(DATAVIZ):
            pages = await crm_meta_accounts.active_page_credentials()
        self.assertFalse(any(p.get("page_id") == ENV_PAGE for p in pages))

    async def test_active_pages_reamarc_and_flags_off_include_env(self):
        pages_coll = MagicMock()
        pages_coll.find.return_value = _Cursor([])
        db = SimpleNamespace(crm_meta_pages=pages_coll)
        with _flags(True), patch("app.services.crm_meta_accounts._db", return_value=db), tenant_scope(REAMARC):
            pages_on = await crm_meta_accounts.active_page_credentials()
        with _flags(False), patch("app.services.crm_meta_accounts._db", return_value=db):
            pages_off = await crm_meta_accounts.active_page_credentials()
        self.assertTrue(any(p.get("page_id") == ENV_PAGE and p.get("company_id") == REAMARC for p in pages_on))
        self.assertTrue(any(p.get("page_id") == ENV_PAGE for p in pages_off))

    async def test_list_connected_pages_dataviz_no_env_preview(self):
        pages_coll = MagicMock()
        pages_coll.find.return_value = _Cursor([])
        db = SimpleNamespace(crm_meta_pages=pages_coll)
        with _flags(True), patch("app.services.crm_meta_accounts._db", return_value=db), tenant_scope(DATAVIZ):
            listed = await crm_meta_accounts.list_connected_pages()
        self.assertFalse(any(p.get("is_env") for p in listed))
        self.assertFalse(any(ENV_TOKEN[:8] in str(p.get("token_preview") or "") for p in listed))

    async def test_get_page_credentials_env_gated(self):
        gdb = MagicMock()
        gdb.crm_meta_pages.find_one = AsyncMock(return_value=None)
        with _flags(True), patch("app.core.tenant.get_global_db", return_value=gdb), tenant_scope(DATAVIZ):
            none = await crm_meta_accounts.get_page_credentials(ENV_PAGE)
        with _flags(True), patch("app.core.tenant.get_global_db", return_value=gdb), tenant_scope(REAMARC):
            reamarc = await crm_meta_accounts.get_page_credentials(ENV_PAGE)
        self.assertIsNone(none)
        self.assertEqual(reamarc["company_id"], REAMARC)

    async def test_poll_only_creates_reamarc_leads(self):
        from app.services import crm_ingest

        created = []

        async def fake_poll(*args, **kwargs):
            from app.core.tenant import get_tenant_context
            ctx = get_tenant_context()
            created.append(ctx.company_id if ctx else None)
            return {"form_id": "form_1", "created": 1, "duplicates": 0, "skipped": 0}

        dv_pages = MagicMock()
        dv_pages.find.return_value = _Cursor([])
        re_pages = MagicMock()
        re_pages.find.return_value = _Cursor([])
        env_page = {
            "page_id": ENV_PAGE,
            "access_token": ENV_TOKEN,
            "company_id": REAMARC,
            "default_campaign": None,
        }

        async def fake_graph(*args, **kwargs):
            return {"data": [{"id": "form_1", "name": "Lead", "status": "ACTIVE"}]}

        with _flags(True), patch.object(crm_ingest, "_graph_get", side_effect=fake_graph), patch.object(
            crm_ingest, "poll_meta_form_leads", side_effect=fake_poll
        ):
            with patch("app.services.crm_meta_accounts._db", return_value=SimpleNamespace(crm_meta_pages=dv_pages)), tenant_scope(DATAVIZ):
                dv = await crm_ingest.poll_connected_meta_pages()
            with patch(
                "app.services.crm_meta_accounts.active_page_credentials",
                new=AsyncMock(return_value=[env_page]),
            ), tenant_scope(REAMARC):
                rm = await crm_ingest.poll_connected_meta_pages()
        self.assertEqual(dv.get("forms"), [])
        self.assertEqual(created, [REAMARC])
        self.assertTrue(sum(int(r.get("created") or 0) for r in rm.get("forms") or []) >= 1)

    async def test_poll_skips_foreign_page_company_id(self):
        from app.services import crm_ingest

        foreign = {
            "page_id": "foreign_page",
            "access_token": "tok",
            "company_id": DATAVIZ,
            "default_campaign": None,
        }
        with _flags(True), patch(
            "app.services.crm_meta_accounts.active_page_credentials",
            new=AsyncMock(return_value=[foreign]),
        ), patch.object(crm_ingest, "poll_meta_form_leads", new=AsyncMock()) as poll_leads, tenant_scope(REAMARC):
            out = await crm_ingest.poll_connected_meta_pages()
        poll_leads.assert_not_called()
        self.assertEqual(out["forms"], [])


class TestMetaWebhook(unittest.TestCase):
    def _app(self):
        from app.routers import crm_public
        app = FastAPI()
        app.state.limiter = limiter
        app.include_router(crm_public.router, prefix="/api/v1")
        return app

    def _sign(self, raw: bytes, secret: str) -> str:
        return "sha256=" + hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()

    def test_env_page_queued_under_reamarc_flags_on_and_off(self):
        payload = {"entry": [{"id": ENV_PAGE, "changes": [{"value": {"page_id": ENV_PAGE, "leadgen_id": "1"}}]}]}
        raw = json.dumps(payload).encode()
        gdb = MagicMock()
        gdb.company_integrations.find_one = AsyncMock(return_value=None)
        gdb.crm_meta_pages.find_one = AsyncMock(return_value=None)
        gdb.security_events.insert_one = AsyncMock()
        queued = []

        async def fake_queue(platform, body):
            from app.core.tenant import get_tenant_context
            ctx = get_tenant_context()
            queued.append(ctx.company_id if ctx else None)
            return "evt_1"

        for on in (True, False):
            queued.clear()
            with _flags(on), patch("app.core.tenant.get_global_db", return_value=gdb), patch(
                "app.services.crm_lead_processor.queue_webhook_event", side_effect=fake_queue
            ):
                client = TestClient(self._app())
                res = client.post(
                    "/api/v1/crm/meta/webhook",
                    content=raw,
                    headers={"x-hub-signature-256": self._sign(raw, ENV_SECRET), "content-type": "application/json"},
                )
            self.assertEqual(res.status_code, 200, res.text)
            self.assertTrue(res.json().get("queued"))
            self.assertEqual(queued, [REAMARC])

    def test_dataviz_page_queued_unknown_dropped_without_payload(self):
        dv_page = "dv_page_9"
        payload = {"entry": [{"id": dv_page, "changes": [{"value": {"page_id": dv_page}}]}]}
        raw = json.dumps(payload).encode()
        gdb = MagicMock()
        gdb.company_integrations.find_one = AsyncMock(return_value=None)
        gdb.crm_meta_pages.find_one = AsyncMock(return_value={"page_id": dv_page, "company_id": DATAVIZ})
        gdb.security_events.insert_one = AsyncMock()
        queued = []

        async def fake_queue(platform, body):
            from app.core.tenant import get_tenant_context
            ctx = get_tenant_context()
            queued.append(ctx.company_id if ctx else None)
            return "evt_2"

        creds = {"app_secret": "dv-secret", "company_id": DATAVIZ, "page_id": dv_page}
        with _flags(True), patch("app.core.tenant.get_global_db", return_value=gdb), patch(
            "app.services.crm_meta_accounts.get_page_credentials", new=AsyncMock(return_value=creds)
        ), patch("app.services.crm_lead_processor.queue_webhook_event", side_effect=fake_queue):
            client = TestClient(self._app())
            res = client.post(
                "/api/v1/crm/meta/webhook",
                content=raw,
                headers={"x-hub-signature-256": self._sign(raw, "dv-secret"), "content-type": "application/json"},
            )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(queued, [DATAVIZ])

        unknown = json.dumps({"entry": [{"id": "unknown_page"}]}).encode()
        events = []

        async def capture(doc):
            events.append(doc)

        gdb.company_integrations.find_one = AsyncMock(return_value=None)
        gdb.crm_meta_pages.find_one = AsyncMock(return_value=None)
        gdb.security_events.insert_one = AsyncMock(side_effect=capture)
        with _flags(True), patch("app.core.tenant.get_global_db", return_value=gdb), patch(
            "app.services.crm_meta_accounts.get_page_credentials", new=AsyncMock(return_value=None)
        ), patch("app.services.crm_ingest.verify_meta_signature", return_value=True):
            client = TestClient(self._app())
            res = client.post(
                "/api/v1/crm/meta/webhook",
                content=unknown,
                headers={"x-hub-signature-256": self._sign(unknown, ENV_SECRET), "content-type": "application/json"},
            )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertTrue(res.json().get("dropped"))
        self.assertTrue(events)
        self.assertNotIn("payload", events[0])
        dumped = json.dumps(events[0], default=str)
        self.assertNotIn("leadgen", dumped.lower())


class TestDriveIsolation(unittest.IsolatedAsyncioTestCase):
    async def test_dataviz_file_in_reamarc_root_is_403(self):
        gdrive._parent_cache.clear()
        copy = MagicMock()
        with _flags(True), tenant_scope(DATAVIZ), patch.object(
            gdrive, "_walks_to_company_folder", return_value=False
        ), patch.object(gdrive, "_has_valid_picker_grant", new=AsyncMock(return_value=False)), patch(
            "app.core.tenant.log_security_event", new=AsyncMock()
        ), patch.object(gdrive, "_ingest_picked_file_sync") as ingest_sync:
            with self.assertRaises(HTTPException) as ctx:
                await gdrive.ingest_picked_file("file-reamarc", "dv-folder", actor={"id": "u1"}, company_root_folder_id="dv-root")
            self.assertEqual(ctx.exception.status_code, 403)
            ingest_sync.assert_not_called()

    async def test_file_in_dataviz_folder_accepted(self):
        with _flags(True), tenant_scope(DATAVIZ), patch.object(
            gdrive, "_walks_to_company_folder", return_value=True
        ), patch.object(gdrive, "_ingest_picked_file_sync", return_value={"id": "ok"}):
            out = await gdrive.ingest_picked_file("file-dv", "dv-folder", actor={"id": "u1"}, company_root_folder_id="dv-root")
        self.assertEqual(out["id"], "ok")

    async def test_picker_grant_valid_and_expired(self):
        db = MagicMock()
        db.drive_picker_grants.find_one = AsyncMock(return_value={"file_id": "granted"})
        with _flags(True), tenant_scope(DATAVIZ), patch("app.database.get_database", return_value=db), patch.object(
            gdrive, "_walks_to_company_folder", return_value=False
        ), patch.object(gdrive, "_ingest_picked_file_sync", return_value={"id": "granted"}):
            out = await gdrive.ingest_picked_file("granted", "dv-folder", actor={"id": "u1"}, company_root_folder_id="dv-root")
        self.assertEqual(out["id"], "granted")

        db.drive_picker_grants.find_one = AsyncMock(return_value=None)
        with _flags(True), tenant_scope(DATAVIZ), patch("app.database.get_database", return_value=db), patch.object(
            gdrive, "_walks_to_company_folder", return_value=False
        ), patch("app.core.tenant.log_security_event", new=AsyncMock()), patch.object(
            gdrive, "_ingest_picked_file_sync"
        ) as ingest_sync:
            with self.assertRaises(HTTPException) as ctx:
                await gdrive.ingest_picked_file("expired", "dv-folder", actor={"id": "u1"}, company_root_folder_id="dv-root")
            self.assertEqual(ctx.exception.status_code, 403)
            ingest_sync.assert_not_called()

    async def test_reamarc_skips_extra_checks(self):
        with _flags(True), tenant_scope(REAMARC), patch.object(
            gdrive, "_ingest_picked_file_sync", return_value={"id": "reamarc-file"}
        ) as ingest_sync:
            out = await gdrive.ingest_picked_file("any", "dest", actor={"id": "u1"}, company_root_folder_id="shared-root")
        self.assertEqual(out["id"], "reamarc-file")
        ingest_sync.assert_called_once()


class TestAttendanceIsolation(unittest.IsolatedAsyncioTestCase):
    async def test_collect_and_get_settings(self):
        from app.services import attendance_service

        schema = SecuritySettingsSchema(office_public_ips=[], office_ip_whitelist=[])
        with _flags(True), tenant_scope(DATAVIZ):
            entries = collect_whitelist_entries(schema)
            self.assertFalse(set(get_built_in_office_ips()) & set(entries))
        with _flags(True), tenant_scope(REAMARC):
            entries_r = collect_whitelist_entries(schema)
            for ip in get_built_in_office_ips():
                self.assertIn(ip, entries_r)

        db = MagicMock()
        db.system_config.find_one = AsyncMock(return_value=None)
        db.system_config.update_one = AsyncMock()
        with _flags(True), tenant_scope(DATAVIZ), patch("app.services.attendance_service.get_database", return_value=db):
            dv = await attendance_service.get_security_settings()
        self.assertIsNone(dv.office_latitude)
        self.assertIsNone(dv.office_longitude)
        self.assertFalse(set(get_built_in_office_ips()) & set(dv.office_public_ips or []))
        with _flags(True), tenant_scope(REAMARC), patch("app.services.attendance_service.get_database", return_value=db):
            rm = await attendance_service.get_security_settings()
        self.assertEqual(rm.office_latitude, OFFICE_LATITUDE)
        self.assertEqual(rm.office_longitude, OFFICE_LONGITUDE)

    async def test_locked_office_ips_dataviz(self):
        from app.routers import attendance as attendance_router
        from app.services import attendance_service

        full = SecuritySettingsSchema(office_latitude=None, office_longitude=None, office_public_ips=[])
        user = {"id": "hr1", "role": "admin"}
        with _flags(True), tenant_scope(DATAVIZ), patch.object(
            attendance_service, "get_security_settings", new=AsyncMock(return_value=full)
        ), patch("app.routers.attendance._user_is_management", return_value=True):
            res = await attendance_router.get_security_settings(current_user=user)
        self.assertEqual(res.locked_office_ips, [])


class TestEmailIsolation(unittest.IsolatedAsyncioTestCase):
    async def test_dataviz_brevo_identity(self):
        company = {
            "id": DATAVIZ,
            "name": "DataViz",
            "contact_email": "ops@dataviz.test",
            "logo_url": "https://cdn.example/dataviz.png",
            "accent_color": "#00AA66",
        }
        captured = {}

        async def fake_brevo(*args, **kwargs):
            captured["args"] = args
            captured["kwargs"] = kwargs
            return True

        gdb = MagicMock()
        gdb.company_memberships.find_one = AsyncMock(return_value=None)
        gdb.users.find_one = AsyncMock(return_value=None)
        gdb.companies.find_one = AsyncMock(return_value=company)
        with _flags(True), tenant_scope(DATAVIZ), patch.object(settings, "BREVO_API_KEY", "brevo-test-key"), patch(
            "app.services.email_service._company_custom_smtp", new=AsyncMock(return_value=None)
        ), patch("app.services.email_service._send_brevo_http", side_effect=fake_brevo), patch(
            "app.core.tenant.get_global_db", return_value=gdb
        ):
            ok = await EmailService.send_html_email(
                "user@dataviz.test", "Hello", "<p>Hi</p>", recipient_name="A", company=company
            )
        self.assertTrue(ok)
        self.assertEqual(captured["kwargs"].get("from_name"), "DataViz")
        self.assertEqual(captured["kwargs"].get("reply_to"), "ops@dataviz.test")

    async def test_smtp_from_and_reply_to(self):
        company = {"id": DATAVIZ, "name": "DataViz", "contact_email": "ops@dataviz.test"}
        captured = {}

        def fake_smtp(recipient_email, subject, html_content, from_name=None, reply_to=None):
            captured["from_name"] = from_name
            captured["reply_to"] = reply_to
            captured["from_header"] = f"{from_name} <{settings.SMTP_FROM_EMAIL}>"
            return True

        gdb = MagicMock()
        gdb.company_memberships.find_one = AsyncMock(return_value=None)
        gdb.users.find_one = AsyncMock(return_value=None)
        with _flags(True), tenant_scope(DATAVIZ), patch.object(settings, "BREVO_API_KEY", ""), patch.object(
            settings, "RESEND_API_KEY", ""
        ), patch.object(settings, "SENDGRID_API_KEY", ""), patch(
            "app.services.email_service._company_custom_smtp", new=AsyncMock(return_value=None)
        ), patch("app.services.email_service._send_smtp_sync", side_effect=fake_smtp), patch(
            "app.core.tenant.get_global_db", return_value=gdb
        ):
            await EmailService.send_html_email("user@dataviz.test", "Hello", "<p>Hi</p>", company=company)
        self.assertEqual(captured["from_name"], "DataViz")
        self.assertEqual(captured["reply_to"], "ops@dataviz.test")
        self.assertEqual(captured["from_header"], "DataViz <noreply@reamarc.test>")

    def test_from_name_sanitised(self):
        dirty = "DataViz\r\nBcc: evil@x.com <script>"
        clean = sanitize_from_name(dirty)
        self.assertNotIn("\r", clean)
        self.assertNotIn("\n", clean)
        self.assertNotIn("<", clean)
        self.assertNotIn(">", clean)

    async def test_custom_smtp_skips_brevo(self):
        company = {"id": DATAVIZ, "name": "DataViz"}
        integ = {"connected": True, "host": "smtp.dv", "user": "u", "password": "p", "from_email": "a@dv.test"}
        brevo = AsyncMock(return_value=True)
        with _flags(True), tenant_scope(DATAVIZ), patch(
            "app.services.email_service._company_custom_smtp", new=AsyncMock(return_value=integ)
        ), patch("app.services.email_service._send_custom_smtp_sync", return_value=True) as custom, patch(
            "app.services.email_service._send_brevo_http", side_effect=brevo
        ):
            await EmailService.send_html_email("user@dataviz.test", "Hello", "<p>Hi</p>", company=company)
        custom.assert_called()
        brevo.assert_not_called()

    async def test_reamarc_snapshot_and_from_name(self):
        html = _build_password_reset_html("User", "123456")
        snapshot = _build_password_reset_html("User", "123456", identity={"_reamarc": True, "from_name": settings.SMTP_FROM_NAME})
        self.assertEqual(html, snapshot)
        self.assertIn(settings.SMTP_FROM_NAME, html)
        company = {"id": REAMARC, "name": "Reamarc"}
        captured = {}

        async def fake_brevo(*args, **kwargs):
            captured["kwargs"] = kwargs
            return True

        with _flags(True), tenant_scope(REAMARC), patch(
            "app.services.email_service._company_custom_smtp", new=AsyncMock(return_value=None)
        ), patch("app.services.email_service._send_brevo_http", side_effect=fake_brevo):
            await EmailService.send_password_reset_code("a@reamarc.test", "123456", "User", company=company)
        self.assertEqual(captured["kwargs"].get("from_name"), settings.SMTP_FROM_NAME)
        self.assertIsNone(captured["kwargs"].get("reply_to"))

    async def test_password_reset_dataviz_no_reamarc(self):
        company = {"id": DATAVIZ, "name": "DataViz", "logo_url": "https://cdn.example/dv.png", "accent_color": "#00AA66"}
        with _flags(True), tenant_scope(DATAVIZ):
            identity = await resolve_sender_identity(company)
        html = _build_password_reset_html("User", "999111", identity=identity)
        self.assertIn("DataViz", html)
        self.assertNotIn("Reamarc", html)
        subject_bit = f"999111 is your {identity['company_name']} password reset code"
        self.assertIn("DataViz", subject_bit)

    def test_reminder_html_dataviz_branding(self):
        html = _build_reminder_html(
            "Pat",
            ["2026-10-21"],
            company_name="DataViz",
            accent_color="#00AA66",
            logo_url="https://cdn.example/dv.png",
        )
        self.assertIn("DataViz", html)
        self.assertIn("#00AA66", html)
        self.assertIn("https://cdn.example/dv.png", html)
        self.assertNotIn("Reamarc Workspace", html)


class TestAuditScript(unittest.IsolatedAsyncioTestCase):
    async def test_dry_run_reports_copied_lead_no_writes(self):
        from motor.motor_asyncio import AsyncIOMotorClient
        from app.database import db_instance

        if not (os.environ.get("MONGODB_DB_NAME") or "reamarc_test_db").endswith("_test_db"):
            self.skipTest("unsafe db")
        client = AsyncIOMotorClient("mongodb://localhost:27017")
        db = client["reamarc_test_db"]
        db_instance.client = client
        db_instance.db = db
        object.__setattr__(settings, "MONGODB_DB_NAME", "reamarc_test_db")
        object.__setattr__(settings, "CRM_META_PAGE_ID", ENV_PAGE)
        await db.crm_leads.delete_many({"id": {"$in": ["ld_copy_1"]}})
        await db.crm_leads.insert_one({
            "id": "ld_copy_1",
            "company_id": DATAVIZ,
            "attribution": {"page_id": ENV_PAGE},
        })
        before = await db.crm_leads.count_documents({})
        sec_before = await db.security_events.count_documents({})
        from scripts.audit_cross_company_meta_leads import _run

        args = SimpleNamespace(i_know_this_is_live_readonly=False, json_path=None)
        with patch.object(settings, "MONGODB_DB_NAME", "reamarc_test_db"), patch(
            "app.database.connect_to_mongo", new=AsyncMock()
        ), patch("app.database.close_mongo_connection", new=AsyncMock()):
            report = await _run(args)
        after = await db.crm_leads.count_documents({})
        sec_after = await db.security_events.count_documents({})
        self.assertEqual(before, after)
        self.assertEqual(sec_before, sec_after)
        cids = [c["company_id"] for c in report.get("companies") or []]
        self.assertIn(DATAVIZ, cids)
        await db.crm_leads.delete_many({"id": "ld_copy_1"})
        client.close()
        db_instance.client = None
        db_instance.db = None


if __name__ == "__main__":
    unittest.main()
