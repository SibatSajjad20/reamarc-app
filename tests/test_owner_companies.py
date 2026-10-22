"""Owner/companies create, timezone, confirm_password, and no seat limits."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def run(coro):
    return asyncio.run(coro)


class FakeCursor:
    def __init__(self, docs: List[dict]):
        self._docs = docs

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

    def _matches(self, doc: dict, filt: Optional[dict]) -> bool:
        if not filt:
            return True
        for k, v in filt.items():
            if k == "$or":
                if not any(self._matches(doc, part) for part in v):
                    return False
                continue
            if isinstance(v, dict) and "$ne" in v:
                if doc.get(k) == v["$ne"]:
                    return False
                continue
            if doc.get(k) != v:
                return False
        return True

    def find(self, filt=None, projection=None):
        out = [dict(d) for d in self.docs if self._matches(d, filt)]
        if projection and projection.get("_id") == 0:
            for item in out:
                item.pop("_id", None)
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
            return MagicMock(modified_count=1)
        return MagicMock(modified_count=0)

    async def delete_many(self, filt):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not self._matches(d, filt)]
        return MagicMock(deleted_count=before - len(self.docs))


class FakeDB:
    def __init__(self):
        self.users = FakeCollection()
        self.company_memberships = FakeCollection()
        self.companies = FakeCollection()
        self.workspaces = FakeCollection()
        self.owner_audit = FakeCollection()

    def __getattr__(self, name):
        coll = FakeCollection()
        setattr(self, name, coll)
        return coll


@pytest.fixture
def gdb():
    return FakeDB()


def _patch_owner(monkeypatch, gdb: FakeDB):
    from app.config import settings
    import app.routers.owner as owner_mod

    monkeypatch.setattr(settings, "MULTI_TENANT_ENABLED", True)
    monkeypatch.setattr(settings, "MULTI_COMPANY_ENABLED", True)
    monkeypatch.setattr(owner_mod, "get_global_db", lambda: gdb)
    monkeypatch.setattr(owner_mod, "record_owner_audit_event", AsyncMock())
    monkeypatch.setattr(owner_mod, "get_password_hash", lambda p: "hashed")
    monkeypatch.setattr(owner_mod, "invalidate_auth_cache", lambda **kwargs: None)


def test_create_company_without_plan_or_max_users(monkeypatch, gdb):
    from app.routers.owner import CompanyCreateRequest, create_company

    _patch_owner(monkeypatch, gdb)
    body = CompanyCreateRequest(
        name="Acme Corp",
        slug="acme-corp",
        timezone="Asia/Karachi",
        admin_name="Jane Doe",
        admin_email="jane@example.com",
        admin_password="password12",
    )
    result = run(create_company(body, current_user={"id": "usr_owner"}))
    assert result["name"] == "Acme Corp"
    stored = gdb.companies.docs[0]
    assert stored["plan"] == "starter"
    assert stored["limits"]["max_users"] == 50
    assert stored["timezone"] == "Asia/Karachi"


def test_invalid_timezone_is_422():
    from app.routers.owner import CompanyCreateRequest, CompanyUpdateRequest

    with pytest.raises(ValidationError) as exc:
        CompanyCreateRequest(
            name="Acme Corp",
            slug="acme-corp",
            timezone="Not/ARealZone",
            admin_name="Jane Doe",
            admin_email="jane@example.com",
            admin_password="password12",
        )
    assert "timezone" in str(exc.value).lower() or "unknown timezone" in str(exc.value).lower()

    with pytest.raises(ValidationError):
        CompanyUpdateRequest(timezone="Nope/Nope")


def test_valid_iana_timezone_accepted():
    from app.routers.owner import CompanyCreateRequest, CompanyUpdateRequest

    body = CompanyCreateRequest(
        name="Acme Corp",
        slug="acme-corp",
        timezone="Europe/London",
        admin_name="Jane Doe",
        admin_email="jane@example.com",
        admin_password="password12",
    )
    assert body.timezone == "Europe/London"
    upd = CompanyUpdateRequest(timezone="America/New_York")
    assert upd.timezone == "America/New_York"


def test_confirm_password_mismatch_is_422():
    from app.routers.owner import CompanyCreateRequest

    with pytest.raises(ValidationError) as exc:
        CompanyCreateRequest(
            name="Acme Corp",
            slug="acme-corp",
            timezone="Asia/Karachi",
            admin_name="Jane Doe",
            admin_email="jane@example.com",
            admin_password="password12",
            confirm_password="other-password",
        )
    assert "don't match" in str(exc.value).lower() or "match" in str(exc.value).lower()


def test_plan_and_max_users_are_optional_and_ignored(monkeypatch, gdb):
    from app.routers.owner import CompanyCreateRequest, create_company, update_company, CompanyUpdateRequest

    _patch_owner(monkeypatch, gdb)
    body = CompanyCreateRequest(
        name="Acme Corp",
        slug="acme-corp",
        timezone="UTC",
        admin_name="Jane Doe",
        admin_email="jane@example.com",
        admin_password="password12",
        plan="enterprise",
        max_users=2,
    )
    created = run(create_company(body, current_user={"id": "usr_owner"}))
    stored = next(c for c in gdb.companies.docs if c["id"] == created["id"])
    assert stored["plan"] == "starter"
    assert stored["limits"]["max_users"] == 50

    gdb.companies.docs[0]["id"] = created["id"]
    run(
        update_company(
            created["id"],
            CompanyUpdateRequest(plan="enterprise", max_users=3, timezone="UTC"),
            current_user={"id": "usr_owner"},
        )
    )
    after = next(c for c in gdb.companies.docs if c.get("id") == created["id"])
    assert after.get("plan") == "starter"
    assert after.get("limits", {}).get("max_users") == 50


def test_provision_and_grant_not_blocked_by_seat_limit(monkeypatch, gdb):
    from app.routers.owner import (
        ProvisionMemberRequest,
        GrantCompanyAccessRequest,
        provision_member,
        grant_company_access,
    )

    _patch_owner(monkeypatch, gdb)
    gdb.companies.docs.append({
        "id": "comp_full",
        "name": "Full Co",
        "status": "active",
        "limits": {"max_users": 1},
    })
    gdb.users.docs.append({
        "id": "usr_existing",
        "email": "old@full.test",
        "full_name": "Old User",
        "name": "Old User",
        "role": "team_member",
        "is_active": True,
        "company_id": "comp_home",
    })
    gdb.users.docs.append({
        "id": "usr_grant",
        "email": "grant@full.test",
        "full_name": "Grant User",
        "name": "Grant User",
        "role": "team_member",
        "is_active": True,
        "company_id": "comp_home",
    })
    gdb.company_memberships.docs.append({
        "id": "mem_1",
        "user_id": "usr_existing",
        "company_id": "comp_full",
        "status": "active",
        "role": "admin",
    })

    provisioned = run(
        provision_member(
            ProvisionMemberRequest(
                full_name="New Person",
                email="new@example.com",
                company_id="comp_full",
                role="team_member",
                temporary_password="password12",
            ),
            current_user={"id": "usr_owner"},
        )
    )
    assert provisioned["ok"] is True

    granted = run(
        grant_company_access(
            "usr_grant",
            GrantCompanyAccessRequest(company_id="comp_full", role="team_member"),
            current_user={"id": "usr_owner"},
        )
    )
    assert granted["ok"] is True


def test_enter_and_exit_endpoints_removed():
    from app.routers.owner import router

    paths = [getattr(r, "path", "") for r in router.routes]
    assert not any(p.rstrip("/").endswith("/enter") or p.rstrip("/").endswith("/owner/exit") for p in paths)
    src = Path(BACKEND / "app" / "routers" / "owner.py").read_text(encoding="utf-8")
    assert "async def enter_company_console" not in src
    assert "async def exit_owner_session" not in src
