"""Multi-company membership lookups and Team directory setup completion."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def run(coro):
    return asyncio.run(coro)


class FakeCursor:
    def __init__(self, docs: List[dict]):
        self._docs = docs

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length=None):
        if length is None:
            return list(self._docs)
        return list(self._docs)[: int(length)]

    def __aiter__(self):
        async def _gen():
            for d in self._docs:
                yield d
        return _gen()


class FakeCollection:
    def __init__(self, docs: Optional[List[dict]] = None):
        self.docs: List[dict] = list(docs or [])
        self.last_find: Optional[dict] = None

    def _matches(self, doc: dict, filt: Optional[dict]) -> bool:
        from app.services.company_members import matches_filter
        return matches_filter(doc, filt or {})

    def find(self, filt=None, projection=None):
        self.last_find = filt or {}
        out = []
        for d in self.docs:
            if self._matches(d, filt):
                item = dict(d)
                if projection:
                    include = {k for k, v in projection.items() if v}
                    if include:
                        item = {k: item[k] for k in include if k in item}
                        if projection.get("_id") == 0:
                            item.pop("_id", None)
                    else:
                        for k, v in projection.items():
                            if not v:
                                item.pop(k, None)
                item.pop("hashed_password", None)
                out.append(item)
        return FakeCursor(out)

    async def find_one(self, filt=None, projection=None):
        docs = await self.find(filt, projection).to_list(1)
        return docs[0] if docs else None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return MagicMock(inserted_id=doc.get("_id") or doc.get("id"))

    async def update_one(self, filt, update):
        for stored in self.docs:
            if not self._matches(stored, filt):
                continue
            if "$set" in update:
                stored.update(update["$set"])
            if "$inc" in update:
                for k, v in update["$inc"].items():
                    stored[k] = int(stored.get(k) or 0) + int(v)
            return MagicMock(modified_count=1)
        return MagicMock(modified_count=0)

    async def find_one_and_update(self, filt, update, return_document=True):
        await self.update_one(filt, update)
        return await self.find_one(filt)

    async def distinct(self, field, filt=None):
        vals = []
        for d in self.docs:
            if self._matches(d, filt) and d.get(field) is not None:
                vals.append(d[field])
        return vals


class FakeDB:
    def __init__(self):
        self.users = FakeCollection()
        self.company_memberships = FakeCollection()
        self.companies = FakeCollection()
        self.permission_audit = FakeCollection()
        self.crm_leads = FakeCollection()
        self.crm_activities = FakeCollection()
        self.crm_deals = FakeCollection()

    def __getattr__(self, name):
        coll = FakeCollection()
        setattr(self, name, coll)
        return coll


@pytest.fixture
def gdb():
    return FakeDB()


def _enable_multi(monkeypatch, gdb: FakeDB, company_id: str = "company_b"):
    from app.config import settings
    from app.core import tenant as tenant_mod
    from app.core.tenant import tenant_scope
    from app import database as database_mod
    import app.services.company_members as cm

    monkeypatch.setattr(settings, "MULTI_COMPANY_ENABLED", True)
    monkeypatch.setattr(tenant_mod, "get_global_db", lambda: gdb)
    monkeypatch.setattr(database_mod, "get_database", lambda: gdb)
    monkeypatch.setattr(cm, "get_database", lambda: gdb)
    import app.services.crm_leads as crm_leads_mod
    monkeypatch.setattr(crm_leads_mod, "get_database", lambda: gdb)
    return tenant_scope(company_id=company_id)


def _disable_multi(monkeypatch, db: FakeDB):
    from app.config import settings
    from app import database as database_mod
    import app.services.company_members as cm

    monkeypatch.setattr(settings, "MULTI_COMPANY_ENABLED", False)
    monkeypatch.setattr(database_mod, "get_database", lambda: db)
    monkeypatch.setattr(cm, "get_database", lambda: db)


def _user(uid, company_id, **extra):
    doc = {
        "id": uid,
        "_id": uid,
        "email": f"{uid}@ex.com",
        "full_name": uid,
        "name": uid,
        "company_id": company_id,
        "role": "team_member",
        "department": "Website",
        "departments": ["Website"],
        "primary_department": "Website",
        "is_active": True,
        "hashed_password": "secret",
    }
    doc.update(extra)
    return doc


def _mem(mid, uid, cid, **extra):
    doc = {
        "id": mid,
        "_id": mid,
        "user_id": uid,
        "company_id": cid,
        "status": "active",
        "role": "team_member",
        "department": "Sales",
        "departments": ["Sales"],
        "primary_department": "Sales",
        "access": {"attendance": False, "daily_log": False, "sales": False, "content_calendar": False, "website": False, "ads": False},
        "needs_setup": False,
        "token_version": 0,
    }
    doc.update(extra)
    return doc


def test_flags_off_passthrough_same_query(monkeypatch, gdb):
    from app.services.company_members import company_member_users

    _disable_multi(monkeypatch, gdb)
    gdb.users.docs = [_user("usr_a", "company_reamarc", role="admin")]
    filt = {"is_active": True, "role": {"$nin": ["client"]}}
    rows = run(company_member_users(filt, projection={"_id": 0, "hashed_password": 0}))
    assert gdb.users.last_find == filt
    assert rows[0]["id"] == "usr_a"
    assert "hashed_password" not in rows[0]


def test_cross_company_isolation_and_setup(monkeypatch, gdb):
    from app.services.company_members import company_member_users, company_member_user
    from app.services.crm_leads import list_assignees

    ahsan = _user(
        "usr_d931a95d47",
        "company_reamarc",
        email="ahsan@gmail.com",
        department="Sales",
        departments=["Sales"],
        primary_department="Sales",
    )
    local_b = _user("usr_local_b", "company_b", department="Sales", departments=["Sales"], primary_department="Sales")
    gdb.users.docs = [ahsan, local_b]
    gdb.company_memberships.docs = [
        _mem("mem_a_home", "usr_d931a95d47", "company_reamarc", department="Sales", needs_setup=False,
             access={"sales": True, "attendance": False, "daily_log": False, "content_calendar": False, "website": False, "ads": False}),
        _mem("mem_a_b", "usr_d931a95d47", "company_b", needs_setup=True,
             department="Sales", departments=["Sales"], primary_department="Sales"),
        _mem("mem_b", "usr_local_b", "company_b", needs_setup=False,
             access={"sales": True, "attendance": False, "daily_log": False, "content_calendar": False, "website": False, "ads": False}),
    ]

    with _enable_multi(monkeypatch, gdb, "company_b"):
        listed = run(company_member_users({"role": "team_member"}))
        ids = {u["id"] for u in listed}
        assert ids == {"usr_local_b"}  # needs_setup excluded
        setup_user = run(company_member_user("usr_d931a95d47"))
        assert setup_user is not None
        assert setup_user["needs_setup"] is True
        assert setup_user["department"] == "Sales"
        assignees = run(list_assignees())
        assert {a["id"] for a in assignees} == {"usr_local_b"}

        # finish setup
        for m in gdb.company_memberships.docs:
            if m["id"] == "mem_a_b":
                m["needs_setup"] = False
                m["access"] = {"sales": True, "attendance": False, "daily_log": False, "content_calendar": False, "website": False, "ads": False}
        assignees = run(list_assignees())
        assert {a["id"] for a in assignees} == {"usr_d931a95d47", "usr_local_b"}

        # membership department Website while user doc says Sales
        for m in gdb.company_memberships.docs:
            if m["id"] == "mem_a_b":
                m["department"] = "Website"
                m["departments"] = ["Website"]
                m["primary_department"] = "Website"
                m["access"] = {"sales": False, "attendance": True, "daily_log": True, "content_calendar": False, "website": True, "ads": False}
        assignees = run(list_assignees())
        assert "usr_d931a95d47" not in {a["id"] for a in assignees}

        # inactive membership
        for m in gdb.company_memberships.docs:
            if m["id"] == "mem_a_b":
                m["status"] = "inactive"
                m["department"] = "Sales"
                m["needs_setup"] = False
                m["access"] = {"sales": True}
        listed = run(company_member_users({}))
        assert "usr_d931a95d47" not in {u["id"] for u in listed}

    with _enable_multi(monkeypatch, gdb, "company_reamarc"):
        listed = run(company_member_users({}))
        assert {u["id"] for u in listed} == {"usr_d931a95d47"}
        assert "usr_local_b" not in {u["id"] for u in listed}


def test_assign_lead_non_member_400(monkeypatch, gdb):
    from fastapi import HTTPException
    from app.services.crm_leads import assign_lead

    gdb.users.docs = [_user("usr_home", "company_reamarc"), _user("usr_admin", "company_b", role="admin")]
    gdb.company_memberships.docs = [
        _mem("mem_admin", "usr_admin", "company_b", role="admin", needs_setup=False,
             access={"sales": True, "attendance": False, "daily_log": False, "content_calendar": True, "website": True, "ads": True}),
    ]
    gdb.crm_leads.docs = [{
        "id": "ld_1",
        "name": "Lead",
        "assigned_to": None,
        "outcome": None,
        "stage": "new",
    }]

    actor = {"id": "usr_admin", "role": "admin", "full_name": "Admin", "is_active": True,
             "access": {"sales": True, "content_calendar": True, "website": True, "ads": True}}
    with _enable_multi(monkeypatch, gdb, "company_b"):
        with pytest.raises(HTTPException) as ei:
            run(assign_lead("ld_1", "usr_home", actor))
        assert ei.value.status_code == 400


def test_content_assignees_use_membership_department(monkeypatch, gdb):
    from app.services.content_calendar_service import list_content_assignees

    gdb.users.docs = [_user("usr_x", "company_reamarc", department="Sales", primary_department="Sales", departments=["Sales"])]
    gdb.company_memberships.docs = [
        _mem(
            "mem_x",
            "usr_x",
            "company_b",
            department="Content",
            departments=["Content"],
            primary_department="Content",
            needs_setup=False,
            access={"content_calendar": True, "attendance": True, "daily_log": True, "sales": False, "website": False, "ads": False},
            role="team_member",
        )
    ]
    with _enable_multi(monkeypatch, gdb, "company_b"):
        people = run(list_content_assignees(gdb))
        assert any(p["id"] == "usr_x" for p in people)


def test_patch_clears_needs_setup_and_seeds_access(monkeypatch, gdb):
    from app.routers import admin as admin_mod
    from app.schemas.user import MemberUpdate
    from app.models.user import UserRole

    ahsan = _user(
        "usr_d931a95d47",
        "company_reamarc",
        email="ahsan@gmail.com",
        role="team_member",
        department="Website",
        departments=["Website"],
        primary_department="Website",
    )
    gdb.users.docs = [ahsan]
    gdb.company_memberships.docs = [
        _mem(
            "mem_b",
            "usr_d931a95d47",
            "company_b",
            role="team_member",
            department="Sales",
            departments=["Sales"],
            primary_department="Sales",
            needs_setup=True,
            access={"attendance": False, "daily_log": False, "sales": False, "content_calendar": False, "website": False, "ads": False},
        )
    ]

    monkeypatch.setattr(admin_mod, "get_database", lambda: gdb)
    from app.core import tenant as tenant_mod
    monkeypatch.setattr(tenant_mod, "get_global_db", lambda: gdb)
    from app.config import settings
    monkeypatch.setattr(settings, "MULTI_COMPANY_ENABLED", True)

    import app.services.identity_guard as ig
    monkeypatch.setattr(ig, "assert_can_edit_member", AsyncMock())
    monkeypatch.setattr(ig, "assert_super_admin_protected", lambda *a, **k: None)
    monkeypatch.setattr(ig, "can_edit_global_identity", AsyncMock(return_value=False))
    monkeypatch.setattr(ig, "identity_keys_in_update", lambda fields: set())
    monkeypatch.setattr(ig, "invalidate_global_login", AsyncMock())
    monkeypatch.setattr(ig, "is_owner_actor", lambda u: False)
    monkeypatch.setattr(admin_mod, "invalidate_auth_cache", lambda **k: None)
    monkeypatch.setattr(admin_mod, "purge_pre_joining_attendance", AsyncMock())
    monkeypatch.setattr(admin_mod, "_attach_member_edit_flags", AsyncMock(side_effect=lambda resp, *a, **k: resp))

    caller = {"id": "usr_admin", "role": "admin", "company_id": "company_b", "full_name": "Admin"}
    body = MemberUpdate(department="Sales", departments=["Sales"], primary_department="Sales")
    result = run(admin_mod.update_member("usr_d931a95d47", body, caller))
    mem = next(m for m in gdb.company_memberships.docs if m["id"] == "mem_b")
    assert mem["needs_setup"] is False
    assert mem["access"]["sales"] is True
    assert mem.get("token_version", 0) >= 1
    assert result["needs_setup"] is False
    assert ahsan["department"] == "Website"
    assert ahsan["role"] == "team_member"
    assert gdb.permission_audit.docs
    assert gdb.permission_audit.docs[0]["reason"] == "setup completed"

    # no department for a needs-department role keeps setup true
    gdb.company_memberships.docs[0]["needs_setup"] = True
    gdb.company_memberships.docs[0]["department"] = None
    gdb.company_memberships.docs[0]["departments"] = []
    gdb.company_memberships.docs[0]["primary_department"] = None
    gdb.company_memberships.docs[0]["access"] = {k: False for k in mem["access"]}
    empty = MemberUpdate()
    # empty update returns early without changing
    run(admin_mod.update_member("usr_d931a95d47", empty, caller))
    # explicit empty departments
    body2 = MemberUpdate(departments=[], department="", primary_department="")
    # canonicalize may treat empty as no depts
    gdb.company_memberships.docs[0]["needs_setup"] = True
    run(admin_mod.update_member("usr_d931a95d47", MemberUpdate(role=UserRole.TEAM_MEMBER), caller))
    mem2 = next(m for m in gdb.company_memberships.docs if m["id"] == "mem_b")
    assert mem2["needs_setup"] is True
    assert ahsan["role"] == "team_member"
