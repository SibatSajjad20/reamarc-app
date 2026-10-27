"""Finance security fixes: file access, export injection, audit, bank defaults,
public links, amount caps and regex escaping.

Runs against a throwaway local MongoDB (mongodb://localhost:27017, db reamarc_test_finsec).
"""
from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.environ.get("FINSEC_BACKEND") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import httpx
import openpyxl
from fastapi import Depends, FastAPI
from motor.motor_asyncio import AsyncIOMotorClient

from app.core import uploads as up
from app.core.security import get_current_user
from app.core.tenant import TenantContext, set_tenant_context
from app.database import db_instance
from app.routers import finance as fr
from app.services.finance_pdf import generate_invoice_pdf
from app.services.finance_settings import ensure_finance_indexes

DB = "reamarc_test_finsec"
A, B = "company_sec_a", "company_sec_b"


def U(role, cid, uid):
    return {"id": uid, "role": role, "company_id": cid, "is_active": True, "full_name": uid, "email": f"{uid}@x.io"}


def INV(name="Client"):
    return {
        "client_name": name, "issue_date": "2026-10-24", "due_date": "2026-11-08", "currency": "PKR",
        "line_items": [{"description": "Work", "quantity": 1, "rate": 100000}],
    }


BANKS = [{"bank_id": "meezan", "bank_name": "Meezan Bank", "account_title": "Co",
          "account_number": "1234567890", "iban": "PK00TEST1234567890", "swift_code": ""}]


class FinanceSecurityFix(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncIOMotorClient("mongodb://localhost:27017")
        await self.client.drop_database(DB)
        self.db = self.client[DB]
        self.prev = db_instance.db
        db_instance.db = self.db
        await ensure_finance_indexes(self.db)
        await self.db.companies.insert_many([{"id": A, "name": "Alpha Co"}, {"id": B, "name": "Beta Co"}])
        self.app = FastAPI()
        self.app.include_router(fr.router, prefix="/api/v1")
        self.user = U("admin", A, "uA")

        async def _user():
            set_tenant_context(TenantContext(company_id=self.user["company_id"], user_id=self.user["id"]))
            return self.user

        self.app.dependency_overrides[get_current_user] = _user

        @self.app.get("/api/v1/uploads/{p:path}")
        async def _serve(p: str, cu=Depends(get_current_user)):
            await up.authorize_stored_upload(db_instance.db, cu, p)
            return {"ok": True}

    async def asyncTearDown(self):
        await self.client.drop_database(DB)
        db_instance.db = self.prev
        self.client.close()

    def http(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://t")

    async def _set_banks(self, ac):
        r = await ac.put("/api/v1/finance/settings", json={"bank_accounts": BANKS})
        self.assertEqual(r.status_code, 200, r.text)

    async def _issued(self, ac, name="Client"):
        await self._set_banks(ac)
        iid = (await ac.post("/api/v1/finance/invoices", json=INV(name))).json()["id"]
        r = await ac.post(f"/api/v1/finance/invoices/{iid}/issue", json={})
        self.assertEqual(r.status_code, 200, r.text)
        return await self.db.invoices.find_one({"id": iid})

    # 1. finance files ----------------------------------------------------
    async def test_finance_files_need_finance_access_in_same_company(self):
        async with self.http() as ac:
            inv = await self._issued(ac)
            grid = await self.db[f"{up._GRIDFS_BUCKET}.files"].find_one({"metadata.invoice_id": inv["id"]})
            key = grid["filename"] if grid else None
            self.assertTrue(key and key.startswith(f"finance/invoices/{A}/"), key)
            self.assertNotEqual(key, f"finance/invoices/{A}/{inv['number']}.pdf", "PDF name must not be guessable")
            # An old-style (guessable) key saved before the fix keeps working for authorized users only.
            legacy = f"finance/invoices/{A}/INV-2026-0999.pdf"
            await up.save_upload_bytes(self.db, relative_key=legacy, content=b"%PDF-1.4 x", original_name="x.pdf",
                                       content_type="application/pdf", extra_metadata={"company_id": A})
            for path in (key, legacy):
                self.user = U("admin", A, "uA")
                self.assertEqual((await ac.get("/api/v1/uploads/" + path)).status_code, 200, path)
                self.user = U("operations", A, "uOps")
                self.assertEqual((await ac.get("/api/v1/uploads/" + path)).status_code, 200, path)
                for role in ("hr", "team_lead", "team_member", "client"):
                    self.user = U(role, A, "u_" + role)
                    self.assertEqual((await ac.get("/api/v1/uploads/" + path)).status_code, 404, (role, path))
                self.user = U("admin", B, "uB")
                self.assertEqual((await ac.get("/api/v1/uploads/" + path)).status_code, 404, ("cross", path))

    # 2. export injection -------------------------------------------------
    async def test_xlsx_export_has_no_formulas(self):
        async with self.http() as ac:
            await self._issued(ac, '=HYPERLINK("http://evil.example","x")')
            r = await ac.get("/api/v1/finance/reports/ageing-summary?format=xlsx")
            self.assertEqual(r.status_code, 200, r.text)
            wb = openpyxl.load_workbook(io.BytesIO(r.content))
            cells = [c for ws in wb.worksheets for row in ws.iter_rows() for c in row]
            self.assertFalse([c.coordinate for c in cells if c.data_type == "f"], "formula cells in export")
            self.assertTrue(any(isinstance(c.value, str) and c.value.startswith("'=HYPERLINK") for c in cells))

    # 3. audit ------------------------------------------------------------
    async def test_settings_and_invoice_edits_are_audited(self):
        async with self.http() as ac:
            await self._set_banks(ac)
            new_banks = [dict(BANKS[0], iban="PK99EVIL0000000000")]
            await ac.put("/api/v1/finance/settings", json={"bank_accounts": new_banks})
            aud = await self.db.finance_audit.find(
                {"company_id": A, "entity_type": "finance_settings"}).sort("created_at", 1).to_list(10)
            self.assertTrue(aud)
            ch = aud[-1]["details"]["changes"]["bank_accounts"]
            self.assertEqual(ch["old"][0]["iban"], "PK00TEST1234567890")
            self.assertEqual(ch["new"][0]["iban"], "PK99EVIL0000000000")
            self.assertEqual(aud[-1]["user_id"], "uA")

            iid = (await ac.post("/api/v1/finance/invoices", json=INV("Old Name"))).json()["id"]
            r = await ac.put(f"/api/v1/finance/invoices/{iid}", json={"client_name": "New Name"})
            self.assertEqual(r.status_code, 200, r.text)
            a = await self.db.finance_audit.find_one({"entity_id": iid, "action": "invoice_update"})
            self.assertIsNotNone(a)
            self.assertEqual(a["details"]["changes"]["client_name"], {"old": "Old Name", "new": "New Name"})

    # 4. bank defaults ----------------------------------------------------
    async def test_new_company_blank_bank_and_issue_blocked(self):
        async with self.http() as ac:
            s = (await ac.get("/api/v1/finance/settings")).json()
            self.assertEqual(s["company_name"], "Alpha Co")
            for b in s["bank_accounts"]:
                self.assertFalse(b.get("account_number") or b.get("iban"), b)
            text = repr(s)
            for leak in ("0814010", "PK23MEZN", "reamarc", "Reamarc"):
                self.assertNotIn(leak, text)
            accts = await self.db.finance_accounts.find({"company_id": A}).to_list(10)
            self.assertFalse([x for x in accts if x.get("iban") or (x.get("account_number") not in ("", "CASH-MAIN"))])

            iid = (await ac.post("/api/v1/finance/invoices", json=INV())).json()["id"]
            r = await ac.post(f"/api/v1/finance/invoices/{iid}/issue", json={})
            self.assertEqual(r.status_code, 400, r.text)
            self.assertIn("bank", r.json()["detail"].lower())
            await self._set_banks(ac)
            self.assertEqual((await ac.post(f"/api/v1/finance/invoices/{iid}/issue", json={})).status_code, 200)

    async def test_existing_saved_settings_untouched(self):
        saved = {"id": "fset_keep", "company_id": "company_reamarc", "company_name": "Reamarc - Digital Solutions",
                 "bank_accounts": [dict(BANKS[0], iban="PK11KEEP")], "invoice_prefix": "INV-"}
        await self.db.finance_settings.insert_one(dict(saved))
        self.user = U("admin", "company_reamarc", "uR")
        async with self.http() as ac:
            s = (await ac.get("/api/v1/finance/settings")).json()
        self.assertEqual(s["company_name"], "Reamarc - Digital Solutions")
        self.assertEqual(s["bank_accounts"][0]["iban"], "PK11KEEP")

    def test_other_company_pdf_has_no_reamarc_branding(self):
        if not shutil.which("pdftotext"):
            self.skipTest("pdftotext not installed")
        inv = {"id": "i1", "company_id": B, "number": "INV-2026-0001", "client_name": "C", "currency": "PKR",
               "issue_date": "2026-10-24", "due_date": "2026-10-24", "line_items": [
                   {"serial": 1, "description": "W", "quantity": 1, "rate": 100, "amount": 100}],
               "subtotal": 100, "total": 100, "balance_due": 100, "status": "issued"}
        pdf = generate_invoice_pdf(inv, {"company_id": B, "company_name": "Beta Co", "bank_accounts": []})
        with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
            f.write(pdf)
            f.flush()
            text = subprocess.run(["pdftotext", f.name, "-"], capture_output=True, text=True).stdout
        self.assertIn("Beta Co", text)
        for leak in ("reamarc", "Reamarc", "0814010", "PK23MEZN", "MEZNPKKAGRD", "9926976"):
            self.assertNotIn(leak, text)

    # 5. public links -----------------------------------------------------
    async def test_void_blocks_public_link_and_regenerate_rotates(self):
        async with self.http() as ac:
            inv = await self._issued(ac)
            old = inv["share_token"]
            self.assertEqual((await ac.get(f"/api/v1/finance/public/invoice/{old}")).status_code, 200)
            r = await ac.post(f"/api/v1/finance/invoices/{inv['id']}/share-link/regenerate")
            self.assertEqual(r.status_code, 200, r.text)
            new = r.json()["share_token"]
            self.assertNotEqual(new, old)
            self.assertEqual((await ac.get(f"/api/v1/finance/public/invoice/{old}")).status_code, 404)
            self.assertEqual((await ac.get(f"/api/v1/finance/public/invoice/{new}")).status_code, 200)
            self.user = U("admin", B, "uB")
            r = await ac.post(f"/api/v1/finance/invoices/{inv['id']}/share-link/regenerate")
            self.assertEqual(r.status_code, 404, "cross-company regenerate must fail")
            self.user = U("admin", A, "uA")
            r = await ac.post(f"/api/v1/finance/invoices/{inv['id']}/void", json={"reason": "wrong client"})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual((await ac.get(f"/api/v1/finance/public/invoice/{new}")).status_code, 404)
            self.assertEqual((await ac.get(f"/api/v1/finance/public/invoice/{new}/pdf")).status_code, 404)

    # 6. caps -------------------------------------------------------------
    async def test_absurd_amounts_return_422(self):
        async with self.http() as ac:
            for field, value in (("quantity", 1e15), ("rate", 10**19), ("quantity", 999_999)):
                body = INV()
                body["line_items"][0][field] = value
                if value == 999_999:
                    body["line_items"][0]["rate"] = 10**14
                r = await ac.post("/api/v1/finance/invoices", json=body)
                self.assertEqual(r.status_code, 422, (field, value, r.status_code))
            body = INV()
            body["line_items"][0].update({"quantity": 3, "rate": 250000})
            self.assertEqual((await ac.post("/api/v1/finance/invoices", json=body)).status_code, 200)

    # 7. regex ------------------------------------------------------------
    async def test_search_is_literal(self):
        async with self.http() as ac:
            await ac.post("/api/v1/finance/invoices", json=INV("Nova Luxury"))
            await ac.post("/api/v1/finance/invoices", json=INV("Other Client"))
            r = await ac.get("/api/v1/finance/invoices", params={"q": ".*", "search": ".*"})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(r.json()["total"], 0)
            r = await ac.get("/api/v1/finance/invoices", params={"search": "(unclosed"})
            self.assertEqual(r.status_code, 200, r.text)
            r = await ac.get("/api/v1/finance/receipts", params={"search": "(unclosed", "client_name": "[x"})
            self.assertEqual(r.status_code, 200, r.text)
            r = await ac.get("/api/v1/finance/invoices", params={"search": "Nova"})
            self.assertEqual(r.json()["total"], 1)


if __name__ == "__main__":
    unittest.main()
