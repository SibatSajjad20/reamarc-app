"""Directory edit guards: who may change email/role/password on a member row.

In-memory fake Mongo only. Outbound network is blocked.
"""
from __future__ import annotations

import os
import sys
from contextlib import ExitStack
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings  # noqa: E402
from app.models.user import UserRole  # noqa: E402
from app.routers import admin as admin_router  # noqa: E402
from app.schemas.user import MemberUpdate  # noqa: E402
from app.services.identity_guard import (  # noqa: E402
    ADMIN_PEER_MSG,
    HR_ROLE_MSG,
    LAST_ADMIN_MSG,
    OWN_ROLE_MSG,
    SUPER_ADMIN_MSG,
    assert_can_edit_member,
)


class FakeCursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length=None):
        return [dict(r) for r in self._rows]


def _matches(doc, query):
    if not query:
        return True
    if "$or" in query:
        if not any(_matches(doc, clause) for clause in query["$or"]):
            return False
        rest = {k: v for k, v in query.items() if k != "$or"}
        return _matches(doc, rest)
    for key, expected in query.items():
        actual = doc.get(key)
        if key in ("id", "_id") and actual is None:
            actual = doc.get("id") or doc.get("_id")
        if isinstance(expected, dict):
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$nin" in expected and actual in expected["$nin"]:
                return False
            continue
        if actual != expected:
            return False
    return True


class FakeCollection:
    def __init__(self, rows=None):
        self.rows = [dict(r) for r in (rows or [])]

    def _find(self, query):
        return [r for r in self.rows if _matches(r, query or {})]

    async def find_one(self, query=None):
        found = self._find(query or {})
        return dict(found[0]) if found else None

    def find(self, query=None, *args, **kwargs):
        return FakeCursor(self._find(query or {}))

    async def insert_one(self, doc):
        self.rows.append(dict(doc))
        return SimpleNamespace(inserted_id=doc.get("id") or doc.get("_id"))

    async def count_documents(self, query=None):
        return len(self._find(query or {}))

    async def distinct(self, field, query=None):
        return list({r.get(field) for r in self._find(query or {}) if r.get(field) is not None})

    async def update_one(self, query, update, **kwargs):
        found = self._find(query)
        if not found:
            if kwargs.get("upsert"):
                doc = dict(query)
                self._apply(doc, update)
                self.rows.append(doc)
                return SimpleNamespace(modified_count=1)
            return SimpleNamespace(modified_count=0)
        self._apply(found[0], update)
        return SimpleNamespace(modified_count=1)

    async def find_one_and_update(self, query, update, return_document=True, **kwargs):
        found = self._find(query)
        if not found:
            return None
        self._apply(found[0], update)
        return dict(found[0])

    async def delete_one(self, query=None):
        found = self._find(query or {})
        if not found:
            return SimpleNamespace(deleted_count=0)
        self.rows.remove(found[0])
        return SimpleNamespace(deleted_count=1)

    def _apply(self, doc, update):
        if "$set" in update:
            doc.update(update["$set"])
        if "$inc" in update:
            for k, v in update["$inc"].items():
                doc[k] = int(doc.get(k) or 0) + v


class FakeDB:
    def __init__(self):
        self.users = FakeCollection()
        self.company_memberships = FakeCollection()
        self.workspaces = FakeCollection()


CO_A = "comp_a"
CO_B = "comp_b"


def _user(uid, role, *, email=None, company_id=CO_A, super_admin=False, name=None):
    return {
        "id": uid,
        "_id": uid,
        "email": email or f"{uid}@test.local",
        "full_name": name or uid,
        "name": name or uid,
        "role": role,
        "company_id": company_id,
        "is_super_admin": super_admin,
        "is_active": True,
        "hashed_password": "hash",
        "phone": "03001234567",
    }


def _mem(uid, company_id, role, status="active"):
    mid = f"mem_{uid}_{company_id}"
    return {
        "id": mid,
        "_id": mid,
        "user_id": uid,
        "company_id": company_id,
        "role": role,
        "status": status,
        "department": "Website",
        "departments": ["Website"],
        "primary_department": "Website",
    }


def _actor(uid, role, *, super_admin=False, company_id=CO_A):
    return {
        "id": uid,
        "role": role,
        "company_id": company_id,
        "is_super_admin": super_admin,
        "email": f"{uid}@test.local",
    }


def _seed():
    db = FakeDB()
    db.users.rows = [
        _user("owner1", "admin", super_admin=True, email="owner@test.local"),
        _user("admin1", "admin", email="admin1@test.local"),
        _user("admin2", "admin", email="admin2@test.local"),
        _user("hr1", "hr", email="hr1@test.local"),
        _user("ops1", "operations", email="ops1@test.local"),
        _user("tm1", "team_member", email="tm1@test.local"),
        _user("dual1", "team_member", email="dual@test.local"),
    ]
    db.company_memberships.rows = [
        _mem("owner1", CO_A, "admin"),
        _mem("admin1", CO_A, "admin"),
        _mem("admin2", CO_A, "admin"),
        _mem("hr1", CO_A, "hr"),
        _mem("ops1", CO_A, "operations"),
        _mem("tm1", CO_A, "team_member"),
        _mem("dual1", CO_A, "team_member"),
        _mem("dual1", CO_B, "team_lead"),
    ]
    return db


class TestMemberEditGuards(IsolatedAsyncioTestCase):
    def _stack(self, gdb, multi_on: bool) -> ExitStack:
        stack = ExitStack()
        stack.enter_context(patch.object(settings, "MULTI_COMPANY_ENABLED", multi_on))
        stack.enter_context(patch.object(settings, "MULTI_TENANT_ENABLED", multi_on))
        stack.enter_context(patch("app.core.tenant.get_global_db", return_value=gdb))
        stack.enter_context(patch("app.services.identity_guard.get_global_db", return_value=gdb))
        stack.enter_context(patch("app.database.get_database", return_value=gdb))
        stack.enter_context(patch("app.routers.admin.get_database", return_value=gdb))
        stack.enter_context(patch("app.core.security.invalidate_auth_cache"))
        stack.enter_context(patch("app.services.identity_guard.invalidate_auth_cache"))
        stack.enter_context(patch("app.routers.admin.purge_pre_joining_attendance", new_callable=AsyncMock))
        return stack

    async def test_guards_both_flag_states(self):
        orig_multi = getattr(settings, "MULTI_COMPANY_ENABLED", False)
        orig_tenant = getattr(settings, "MULTI_TENANT_ENABLED", False)
        try:
            for multi_on in (False, True):
                with self.subTest(multi=multi_on):
                    await self._run_guard_matrix(multi_on)
        finally:
            object.__setattr__(settings, "MULTI_COMPANY_ENABLED", orig_multi)
            object.__setattr__(settings, "MULTI_TENANT_ENABLED", orig_tenant)

    async def _run_guard_matrix(self, multi_on: bool):
        gdb = _seed()
        with self._stack(gdb, multi_on):
            with self.assertRaises(HTTPException) as hr_admin:
                await assert_can_edit_member(
                    _actor("hr1", "hr"),
                    next(u for u in gdb.users.rows if u["id"] == "admin1"),
                    "admin",
                    {"email": "new@test.local"},
                )
            self.assertEqual(hr_admin.exception.status_code, 403)

            tm = next(u for u in gdb.users.rows if u["id"] == "tm1")
            with self.assertRaises(HTTPException) as hr_role:
                await assert_can_edit_member(_actor("hr1", "hr"), tm, "team_member", {"role": "admin"})
            self.assertEqual(hr_role.exception.status_code, 403)
            self.assertIn(HR_ROLE_MSG.split()[0], str(hr_role.exception.detail))

            admin = next(u for u in gdb.users.rows if u["id"] == "admin1")
            with self.assertRaises(HTTPException) as own_role:
                await assert_can_edit_member(_actor("admin1", "admin"), admin, "admin", {"role": "hr"})
            self.assertEqual(own_role.exception.status_code, 403)
            self.assertEqual(own_role.exception.detail, OWN_ROLE_MSG)

            other = next(u for u in gdb.users.rows if u["id"] == "admin2")
            with self.assertRaises(HTTPException) as peer:
                await assert_can_edit_member(
                    _actor("admin1", "admin"),
                    other,
                    "admin",
                    {"email": "taken@test.local"},
                )
            self.assertEqual(peer.exception.status_code, 403)
            self.assertEqual(peer.exception.detail, ADMIN_PEER_MSG)

            owner = next(u for u in gdb.users.rows if u["id"] == "owner1")
            with self.assertRaises(HTTPException) as owner_edit:
                await assert_can_edit_member(
                    _actor("admin1", "admin"),
                    owner,
                    "admin",
                    {"full_name": "Nope"},
                )
            self.assertEqual(owner_edit.exception.status_code, 403)
            self.assertEqual(owner_edit.exception.detail, SUPER_ADMIN_MSG)

            flags = await assert_can_edit_member(
                _actor("admin1", "admin"),
                tm,
                "team_member",
                {"email": "tm1-new@test.local"},
            )
            self.assertTrue(flags.can_edit)
            self.assertTrue(flags.can_edit_identity)

            dual = next(u for u in gdb.users.rows if u["id"] == "dual1")
            if multi_on:
                with self.assertRaises(HTTPException) as dual_email:
                    await assert_can_edit_member(
                        _actor("admin1", "admin"),
                        dual,
                        "team_member",
                        {"email": "dual-new@test.local"},
                    )
                self.assertEqual(dual_email.exception.status_code, 403)
            else:
                dual_flags = await assert_can_edit_member(
                    _actor("admin1", "admin"),
                    dual,
                    "team_member",
                    {"email": "dual-new@test.local"},
                )
                self.assertTrue(dual_flags.can_edit_identity)

            owner_flags = await assert_can_edit_member(
                _actor("owner1", "admin", super_admin=True),
                admin,
                "admin",
                {"email": "admin1-new@test.local"},
            )
            self.assertTrue(owner_flags.can_edit_identity)

            rows = await admin_router.list_members(
                department=None,
                role=None,
                search=None,
                is_active=None,
                current_user=_actor("admin1", "admin"),
            )
            by_id = {r["id"]: r for r in rows}
            self.assertTrue(by_id["tm1"]["can_edit"])
            self.assertTrue(by_id["tm1"]["can_edit_identity"])
            self.assertTrue(by_id["tm1"]["can_edit_role"])
            self.assertFalse(by_id["admin2"]["can_edit"])
            self.assertFalse(by_id["owner1"]["can_edit"])
            self.assertTrue(by_id["admin1"]["can_edit"])
            self.assertFalse(by_id["admin1"]["can_edit_role"])
            if multi_on:
                self.assertTrue(by_id["dual1"]["can_edit"])
                self.assertFalse(by_id["dual1"]["can_edit_identity"])
                self.assertTrue(by_id["dual1"]["can_edit_role"])

            hr_rows = await admin_router.list_members(
                department=None,
                role=None,
                search=None,
                is_active=None,
                current_user=_actor("hr1", "hr"),
            )
            hr_by = {r["id"]: r for r in hr_rows}
            self.assertFalse(hr_by["admin1"]["can_edit"])
            self.assertFalse(hr_by["ops1"]["can_edit"])
            self.assertTrue(hr_by["tm1"]["can_edit"])

            patched = await admin_router.update_member(
                "tm1",
                MemberUpdate(email="tm1-ok@example.com"),
                current_user=_actor("admin1", "admin"),
            )
            self.assertEqual(str(patched["email"]), "tm1-ok@example.com")

        last_db = _seed()
        last_db.company_memberships.rows = [
            m
            for m in last_db.company_memberships.rows
            if m["user_id"] == "admin1" and m["role"] == "admin"
        ]
        last_db.users.rows = [u for u in last_db.users.rows if u["id"] == "admin1"]
        last = last_db.users.rows[0]
        with self._stack(last_db, multi_on):
            with self.assertRaises(HTTPException) as last_admin:
                await assert_can_edit_member(
                    _actor("owner1", "admin", super_admin=True),
                    last,
                    "admin",
                    {"role": "hr"},
                )
            self.assertEqual(last_admin.exception.status_code, 400)
            self.assertEqual(last_admin.exception.detail, LAST_ADMIN_MSG)

        if multi_on:
            gdb = _seed()
            dual = next(u for u in gdb.users.rows if u["id"] == "dual1")
            original_email = dual["email"]
            original_user_role = dual["role"]
            b_role = next(
                m["role"]
                for m in gdb.company_memberships.rows
                if m["user_id"] == "dual1" and m["company_id"] == CO_B
            )
            with self._stack(gdb, True):
                updated = await admin_router.update_member(
                    "dual1",
                    MemberUpdate(role=UserRole.HR),
                    current_user=_actor("admin1", "admin"),
                )
                self.assertEqual(updated["role"], UserRole.HR)
                user_doc = await gdb.users.find_one({"id": "dual1"})
                self.assertEqual(user_doc["role"], original_user_role)
                self.assertEqual(user_doc["email"], original_email)
                still_b = await gdb.company_memberships.find_one(
                    {"user_id": "dual1", "company_id": CO_B}
                )
                self.assertEqual(still_b["role"], b_role)
                a_mem = await gdb.company_memberships.find_one(
                    {"user_id": "dual1", "company_id": CO_A}
                )
                self.assertEqual(a_mem["role"], "hr")

    async def test_owner_demotes_admin_when_another_admin_exists(self):
        gdb = _seed()
        gdb.company_memberships.rows.append(_mem("admin1", CO_B, "team_lead"))
        original_user_role = next(u["role"] for u in gdb.users.rows if u["id"] == "admin1")
        with self._stack(gdb, True):
            updated = await admin_router.update_member(
                "admin1",
                MemberUpdate(role=UserRole.TEAM_LEAD),
                current_user=_actor("owner1", "admin", super_admin=True),
            )
            self.assertEqual(updated["role"], UserRole.TEAM_LEAD)
            user_doc = await gdb.users.find_one({"id": "admin1"})
            self.assertEqual(user_doc["role"], original_user_role)
            still_b = await gdb.company_memberships.find_one(
                {"user_id": "admin1", "company_id": CO_B}
            )
            self.assertEqual(still_b["role"], "team_lead")
            a_mem = await gdb.company_memberships.find_one(
                {"user_id": "admin1", "company_id": CO_A}
            )
            self.assertEqual(a_mem["role"], "team_lead")

    async def test_owner_demote_last_admin_is_400(self):
        last_db = _seed()
        last_db.company_memberships.rows = [
            m
            for m in last_db.company_memberships.rows
            if m["user_id"] == "admin1" and m["role"] == "admin"
        ]
        last_db.users.rows = [u for u in last_db.users.rows if u["id"] in ("admin1", "owner1")]
        role_before = next(
            m["role"]
            for m in last_db.company_memberships.rows
            if m["user_id"] == "admin1"
        )
        with self._stack(last_db, True):
            with self.assertRaises(HTTPException) as ctx:
                await admin_router.update_member(
                    "admin1",
                    MemberUpdate(role=UserRole.TEAM_LEAD),
                    current_user=_actor("owner1", "admin", super_admin=True),
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertEqual(ctx.exception.detail, LAST_ADMIN_MSG)
            still = await last_db.company_memberships.find_one({"user_id": "admin1"})
            self.assertEqual(still["role"], role_before)

    async def test_owner_deactivate_last_admin_is_400(self):
        last_db = _seed()
        last_db.company_memberships.rows = [
            m
            for m in last_db.company_memberships.rows
            if m["user_id"] == "admin1" and m["role"] == "admin"
        ]
        last_db.users.rows = [u for u in last_db.users.rows if u["id"] in ("admin1", "owner1")]
        status_before = next(
            m["status"]
            for m in last_db.company_memberships.rows
            if m["user_id"] == "admin1"
        )
        with self._stack(last_db, True):
            with self.assertRaises(HTTPException) as ctx:
                await admin_router.update_member(
                    "admin1",
                    MemberUpdate(is_active=False),
                    current_user=_actor("owner1", "admin", super_admin=True),
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertEqual(ctx.exception.detail, LAST_ADMIN_MSG)
            still = await last_db.company_memberships.find_one({"user_id": "admin1"})
            self.assertEqual(still["status"], status_before)

    async def test_owner_delete_admin_keeps_user_and_does_not_purge(self):
        gdb = FakeDB()
        gdb.users.rows = [
            _user("owner1", "admin", super_admin=True, email="owner@test.local"),
            _user("admin1", "admin", email="admin1@test.local"),
            _user("admin2", "admin", email="admin2@test.local"),
        ]
        gdb.company_memberships.rows = [
            _mem("admin1", CO_A, "admin"),
            _mem("admin2", CO_A, "admin"),
        ]
        purge = AsyncMock()
        orphan_purge = AsyncMock()
        with self._stack(gdb, True), patch(
            "app.services.member_cleanup.purge_user_related_records", new=purge
        ), patch(
            "app.services.member_cleanup.purge_orphaned_member_records", new=orphan_purge
        ):
            result = await admin_router.delete_member(
                "admin1",
                current_user=_actor("owner1", "admin", super_admin=True),
            )
            self.assertEqual(result["message"], "Removed from this company.")
            user_doc = await gdb.users.find_one({"id": "admin1"})
            self.assertIsNotNone(user_doc)
            self.assertIs(user_doc.get("is_active"), False)
            mem = await gdb.company_memberships.find_one(
                {"user_id": "admin1", "company_id": CO_A}
            )
            self.assertIsNotNone(mem)
            self.assertNotEqual(mem.get("status"), "active")
            purge.assert_not_called()
            orphan_purge.assert_not_called()

            with self.assertRaises(HTTPException) as ctx:
                await admin_router.update_member(
                    "admin2",
                    MemberUpdate(role=UserRole.TEAM_LEAD),
                    current_user=_actor("owner1", "admin", super_admin=True),
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertEqual(ctx.exception.detail, LAST_ADMIN_MSG)

    async def test_orphan_admin_membership_does_not_count(self):
        last_db = _seed()
        last_db.company_memberships.rows = [
            m
            for m in last_db.company_memberships.rows
            if m["user_id"] == "admin1" and m["role"] == "admin"
        ]
        last_db.company_memberships.rows.append(_mem("ghost_admin", CO_A, "admin"))
        last_db.users.rows = [u for u in last_db.users.rows if u["id"] in ("admin1", "owner1")]
        with self._stack(last_db, True):
            with self.assertRaises(HTTPException) as ctx:
                await admin_router.update_member(
                    "admin1",
                    MemberUpdate(role=UserRole.TEAM_LEAD),
                    current_user=_actor("owner1", "admin", super_admin=True),
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertEqual(ctx.exception.detail, LAST_ADMIN_MSG)
