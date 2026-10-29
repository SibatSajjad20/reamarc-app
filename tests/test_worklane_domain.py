"""Worklane domain: CORS regex, subdomain→company, membership enforcement."""
from __future__ import annotations

import os
import re
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.middleware.cors import CORSMiddleware

# Ensure local throwaway DB before app imports (conftest also enforces this).
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault("MONGODB_DB_NAME", "reamarc_test_db")

from app.core.origins import (
    WORKLANE_ORIGIN_REGEX,
    effective_frontend_url,
    is_worklane_origin,
    parse_company_slug_from_host,
)


@pytest.mark.parametrize(
    "origin,ok",
    [
        ("https://oneworklane.com", True),
        ("https://www.oneworklane.com", True),
        ("https://dataviz.oneworklane.com", True),
        ("https://acme-co.oneworklane.com", True),
        ("https://api.oneworklane.com", True),  # single label — CORS allows; reserved only for company slug
        ("http://oneworklane.com", False),
        ("https://evil-oneworklane.com", False),
        ("https://oneworklane.com.evil.com", False),
        ("https://a.b.oneworklane.com", False),
        ("https://reamarc-app.vercel.app", False),
        ("https://oneworklane.com/", False),
    ],
)
def test_is_worklane_origin(origin, ok):
    assert is_worklane_origin(origin) is ok
    assert bool(re.fullmatch(WORKLANE_ORIGIN_REGEX, origin, flags=re.IGNORECASE)) is ok


@pytest.mark.parametrize(
    "host,slug",
    [
        ("dataviz.oneworklane.com", "dataviz"),
        ("acme-co.oneworklane.com", "acme-co"),
        ("oneworklane.com", None),
        ("www.oneworklane.com", None),
        ("api.oneworklane.com", None),
        ("app.oneworklane.com", None),
        ("evil-oneworklane.com", None),
        ("a.b.oneworklane.com", None),
        ("reamarc-app.vercel.app", None),
        ("DATAVIZ.oneworklane.com", "dataviz"),
        ("dataviz.oneworklane.com:443", "dataviz"),
    ],
)
def test_parse_company_slug_from_host(host, slug):
    assert parse_company_slug_from_host(host) == slug


def test_cors_middleware_allows_worklane_subdomain_rejects_lookalike():
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["https://reamarc-app.vercel.app"],
        allow_origin_regex=WORKLANE_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.get("/ping")
    def ping():
        return {"ok": True}

    client = TestClient(app)

    ok = client.get("/ping", headers={"Origin": "https://dataviz.oneworklane.com"})
    assert ok.status_code == 200
    assert ok.headers.get("access-control-allow-origin") == "https://dataviz.oneworklane.com"
    assert ok.headers.get("access-control-allow-credentials") == "true"

    apex = client.get("/ping", headers={"Origin": "https://oneworklane.com"})
    assert apex.headers.get("access-control-allow-origin") == "https://oneworklane.com"

    legacy = client.get("/ping", headers={"Origin": "https://reamarc-app.vercel.app"})
    assert legacy.headers.get("access-control-allow-origin") == "https://reamarc-app.vercel.app"

    bad = client.get("/ping", headers={"Origin": "https://evil-oneworklane.com"})
    assert "access-control-allow-origin" not in {k.lower(): v for k, v in bad.headers.items()} or \
        bad.headers.get("access-control-allow-origin") != "https://evil-oneworklane.com"
    # Starlette omits the ACAO header when origin is not allowed
    assert bad.headers.get("access-control-allow-origin") in (None, "")


def test_effective_frontend_url_production_fallback():
    settings = MagicMock()
    settings.APP_FRONTEND_URL = "http://localhost:5173"
    settings.APP_BASE_DOMAIN = "oneworklane.com"
    settings.IS_PRODUCTION = True
    assert effective_frontend_url(settings) == "https://oneworklane.com"

    settings.APP_FRONTEND_URL = "https://reamarc-app.vercel.app"
    settings.IS_PRODUCTION = True
    assert effective_frontend_url(settings) == "https://reamarc-app.vercel.app"

    settings.APP_FRONTEND_URL = "https://oneworklane.com"
    assert effective_frontend_url(settings) == "https://oneworklane.com"


@pytest.mark.asyncio
async def test_resolve_company_from_host_uses_slug_and_ignores_lookalikes():
    from app.core import tenant as tenant_mod

    gdb = MagicMock()
    gdb.companies.find_one = AsyncMock(side_effect=[
        None,  # custom_domain miss
        {"id": "co_dataviz"},  # slug hit
    ])

    req = MagicMock()
    req.headers = {"host": "dataviz.oneworklane.com"}

    with patch.object(tenant_mod, "get_global_db", return_value=gdb):
        with patch.object(tenant_mod.settings, "APP_BASE_DOMAIN", "oneworklane.com"):
            cid = await tenant_mod.resolve_company_from_host(req)
    assert cid == "co_dataviz"
    # second call was slug query
    assert gdb.companies.find_one.await_args_list[1].args[0]["slug"] == "dataviz"


@pytest.mark.asyncio
async def test_resolve_company_from_host_rejects_lookalike_and_www():
    from app.core import tenant as tenant_mod

    gdb = MagicMock()
    gdb.companies.find_one = AsyncMock(return_value=None)

    # Platform apex/www/api: no tenant lookup at all (custom_domain ignored).
    for host in ("www.oneworklane.com", "api.oneworklane.com", "oneworklane.com"):
        gdb.companies.find_one.reset_mock()
        req = MagicMock()
        req.headers = {"host": host}
        with patch.object(tenant_mod, "get_global_db", return_value=gdb):
            with patch.object(tenant_mod.settings, "APP_BASE_DOMAIN", "oneworklane.com"):
                cid = await tenant_mod.resolve_company_from_host(req)
        assert cid is None
        assert gdb.companies.find_one.await_count == 0

    # Lookalike: custom_domain miss only, no slug query
    gdb.companies.find_one.reset_mock()
    req = MagicMock()
    req.headers = {"host": "evil-oneworklane.com"}
    with patch.object(tenant_mod, "get_global_db", return_value=gdb):
        with patch.object(tenant_mod.settings, "APP_BASE_DOMAIN", "oneworklane.com"):
            cid = await tenant_mod.resolve_company_from_host(req)
    assert cid is None
    assert gdb.companies.find_one.await_count == 1


@pytest.mark.asyncio
async def test_resolve_ignores_custom_domain_equal_to_platform_apex():
    """Misconfigured custom_domain=oneworklane.com must not steal apex."""
    from app.core import tenant as tenant_mod

    gdb = MagicMock()
    gdb.companies.find_one = AsyncMock(return_value={"id": "co_dataviz"})
    req = MagicMock()
    req.headers = {"host": "oneworklane.com"}
    with patch.object(tenant_mod, "get_global_db", return_value=gdb):
        with patch.object(tenant_mod.settings, "APP_BASE_DOMAIN", "oneworklane.com"):
            cid = await tenant_mod.resolve_company_from_host(req)
    assert cid is None
    assert gdb.companies.find_one.await_count == 0


@pytest.mark.asyncio
async def test_login_prefers_host_company_only_when_member():
    """Subdomain company is selected only if the user has an active membership."""
    from app.core.tenant import resolve_company_from_host

    # Unit-level: membership filter logic mirror used in auth.login
    active_memberships = [
        {"company_id": "co_a", "id": "m_a"},
        {"company_id": "co_b", "id": "m_b"},
    ]
    host_cid = "co_b"
    target = None
    if host_cid:
        for m in active_memberships:
            if m.get("company_id") == host_cid:
                target = m
                break
    assert target and target["company_id"] == "co_b"

    # Non-member host company must NOT be selected
    host_cid = "co_other"
    target = None
    if host_cid:
        for m in active_memberships:
            if m.get("company_id") == host_cid:
                target = m
                break
    assert target is None


def test_public_invoice_url_uses_api_host():
    from app.core.origins import effective_api_url, public_invoice_url
    settings = MagicMock()
    settings.APP_API_URL = "https://api.oneworklane.com"
    settings.APP_BASE_DOMAIN = "oneworklane.com"
    assert effective_api_url(settings) == "https://api.oneworklane.com"
    assert public_invoice_url(settings, "inv_tok_abc") == (
        "https://api.oneworklane.com/api/v1/finance/public/invoice/inv_tok_abc"
    )
    settings.APP_API_URL = ""
    assert effective_api_url(settings) == "https://api.oneworklane.com"


def test_csrf_allows_worklane_origin_in_production():
    """Live bug: switch-company from oneworklane.com got CSRF Origin not authorized."""
    from app.core.origins import is_worklane_origin

    # Mirror production csrf_protection_middleware origin gate
    allowed = {"https://reamarc-app.vercel.app", "https://reamarc.io"}
    for origin, expect_ok in [
        ("https://oneworklane.com", True),
        ("https://www.oneworklane.com", True),
        ("https://dataviz.oneworklane.com", True),
        ("https://reamarc-app.vercel.app", True),
        ("https://evil-oneworklane.com", False),
        ("https://attacker.com", False),
    ]:
        is_valid = origin in allowed or is_worklane_origin(origin)
        assert is_valid is expect_ok, origin


def test_live_head_naive_slug_bug_on_apex():
    """Document HEAD bug: host.split('.')[0] on oneworklane.com → 'oneworklane'."""
    host = "oneworklane.com"
    naive = host.split(".")[0].strip()
    assert naive == "oneworklane"
    # Fixed helper must return None for apex
    assert parse_company_slug_from_host(host) is None


def test_login_selection_order_host_then_last_then_primary():
    """Apex (no host company): last_company_id wins; else is_primary; else first."""
    active = [
        {"company_id": "co_dataviz", "id": "m_dv", "is_primary": False},
        {"company_id": "co_reamarc", "id": "m_rm", "is_primary": True},
    ]

    def pick(host_cid, last_cid):
        target = None
        if host_cid:
            for m in active:
                if m.get("company_id") == host_cid:
                    target = m
                    break
        if not target and last_cid:
            for m in active:
                if m.get("company_id") == last_cid:
                    target = m
                    break
        if not target:
            for m in active:
                if m.get("is_primary"):
                    target = m
                    break
        if not target:
            target = active[0]
        return target["company_id"]

    # Apex + last_company_id=Reamarc → Reamarc (same as vercel fresh login)
    assert pick(None, "co_reamarc") == "co_reamarc"
    # Apex + last=DataViz → DataViz (explains live land-on-DataViz if last_company_id was DataViz)
    assert pick(None, "co_dataviz") == "co_dataviz"
    # Apex + no last → primary Reamarc
    assert pick(None, None) == "co_reamarc"
    # Subdomain dataviz + member → DataViz even if last is Reamarc
    assert pick("co_dataviz", "co_reamarc") == "co_dataviz"
    # Subdomain for non-member → fall through to last
    assert pick("co_other", "co_reamarc") == "co_reamarc"


def test_production_csrf_middleware_accepts_worklane_via_app():
    """Exercise the real csrf_protection_middleware with Worklane Origin + auth cookie."""
    import asyncio
    from starlette.requests import Request
    from starlette.responses import PlainTextResponse

    os.environ.setdefault("SECRET_KEY", "test-only-local-secret-key-32chars!!")
    from app.config import settings
    from app.main import csrf_protection_middleware

    object.__setattr__(settings, "IS_PRODUCTION", True)
    # Ensure vercel is in allowlist; Worklane comes via is_worklane_origin
    if "https://reamarc-app.vercel.app" not in settings.CORS_ORIGINS:
        object.__setattr__(
            settings,
            "CORS_ORIGINS",
            list(settings.CORS_ORIGINS) + ["https://reamarc-app.vercel.app"],
        )

    async def ok_call(_request):
        return PlainTextResponse("ok")

    def run(origin: str):
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "https",
            "path": "/api/v1/auth/switch-company",
            "raw_path": b"/api/v1/auth/switch-company",
            "query_string": b"",
            "headers": [
                (b"origin", origin.encode()),
                (b"cookie", b"access_token=fake"),
                (b"x-requested-with", b"XMLHttpRequest"),
            ],
            "client": ("127.0.0.1", 123),
            "server": ("test", 443),
        }
        req = Request(scope)
        return asyncio.run(csrf_protection_middleware(req, ok_call))

    try:
        r_ok = run("https://oneworklane.com")
        assert r_ok.status_code == 200, getattr(r_ok, "body", r_ok)

        r_legacy = run("https://reamarc-app.vercel.app")
        assert r_legacy.status_code == 200

        r_bad = run("https://evil-oneworklane.com")
        assert r_bad.status_code == 403
        body = r_bad.body.decode() if hasattr(r_bad, "body") else ""
        assert "Origin not authorized" in body or "CSRF" in body
    finally:
        object.__setattr__(settings, "IS_PRODUCTION", False)


@pytest.mark.asyncio
async def test_apex_login_and_switch_with_worklane_origin_cookies():
    """
    Local throwaway-Mongo simulation of the live bug:
    - Login from Host/Origin https://oneworklane.com lands on last_company_id (Reamarc)
      same as a vercel.app fresh login would.
    - switch-company to DataViz and back to Reamarc succeeds with Worklane Origin
      (live main returns CSRF 403).
    - Auth cookies are set and persist on subsequent /me.
    """
    import uuid
    from datetime import datetime, timezone

    import httpx

    from app.main import app
    from app.config import settings
    from app.database import connect_to_mongo, close_mongo_connection, db_instance
    from app.core.security import get_password_hash, _AUTH_CACHE

    run_id = uuid.uuid4().hex[:8]
    cid_reamarc = f"wl_reamarc_{run_id}"
    cid_dataviz = f"wl_dataviz_{run_id}"
    uid = f"wl_admin_{run_id}"
    email = f"admin_{run_id}@example.com"
    password = "SecretPassword123!"

    original = {
        "MULTI_COMPANY_ENABLED": settings.MULTI_COMPANY_ENABLED,
        "IS_PRODUCTION": settings.IS_PRODUCTION,
        "CORS_ORIGINS": list(settings.CORS_ORIGINS),
        "APP_BASE_DOMAIN": getattr(settings, "APP_BASE_DOMAIN", "oneworklane.com"),
    }

    await connect_to_mongo()
    gdb = db_instance.db
    _AUTH_CACHE.clear()
    object.__setattr__(settings, "MULTI_COMPANY_ENABLED", True)
    object.__setattr__(settings, "IS_PRODUCTION", True)
    # Production allowlist WITHOUT oneworklane.com — Worklane must pass via regex/helper
    object.__setattr__(
        settings,
        "CORS_ORIGINS",
        ["https://reamarc-app.vercel.app", "https://reamarc.io"],
    )
    object.__setattr__(settings, "APP_BASE_DOMAIN", "oneworklane.com")

    now = datetime.now(timezone.utc)
    try:
        await gdb.companies.insert_many([
            {
                "id": cid_reamarc,
                "name": "Reamarc",
                "slug": "reamarc",
                "status": "active",
                "accent_color": "#6847E0",
                "timezone": "Asia/Karachi",
                "token_version": 0,
                "created_at": now,
            },
            {
                "id": cid_dataviz,
                "name": "DataViz",
                "slug": "dataviz",
                # Misconfigured platform custom_domain must NOT steal apex
                "custom_domain": "oneworklane.com",
                "status": "active",
                "accent_color": "#00AA66",
                "timezone": "Asia/Karachi",
                "token_version": 0,
                "created_at": now,
            },
        ])
        await gdb.users.insert_one({
            "id": uid,
            "email": email,
            "full_name": "Admin User",
            "hashed_password": get_password_hash(password),
            "role": "admin",
            "company_id": cid_reamarc,
            "last_company_id": cid_reamarc,
            "is_active": True,
            "token_version": 0,
            "session_epoch": 0,
            "refresh_jtis": [],
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        })
        await gdb.company_memberships.insert_many([
            {
                "id": f"mem_r_{run_id}",
                "user_id": uid,
                "company_id": cid_reamarc,
                "role": "admin",
                "status": "active",
                "is_primary": True,
                "token_version": 0,
                "access": {},
            },
            {
                "id": f"mem_d_{run_id}",
                "user_id": uid,
                "company_id": cid_dataviz,
                "role": "admin",
                "status": "active",
                "is_primary": False,
                "token_version": 0,
                "access": {},
            },
        ])
        await gdb.rate_limit_counters.delete_many({"key": {"$regex": email}})

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="https://oneworklane.com") as client:
            worklane_headers = {
                "Origin": "https://oneworklane.com",
                "Host": "oneworklane.com",
                "X-Requested-With": "XMLHttpRequest",
            }

            # 1) Apex login → Reamarc (last_company_id), NOT DataViz despite custom_domain
            login = await client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": password},
                headers=worklane_headers,
            )
            assert login.status_code == 200, login.text
            body = login.json()
            assert body["user"]["company_id"] == cid_reamarc, body["user"]
            assert "access_token" in login.cookies or body.get("access_token")
            # Cookie set for session persistence
            assert login.cookies.get("access_token") or body.get("access_token")

            token = body.get("access_token") or login.cookies.get("access_token")
            auth_h = {
                **worklane_headers,
                "Authorization": f"Bearer {token}",
            }
            # Prefer cookie session for CSRF path (cookie + Origin)
            client.cookies.set("access_token", token)

            me = await client.get("/api/v1/auth/me", headers=worklane_headers)
            assert me.status_code == 200, me.text
            assert me.json()["company_id"] == cid_reamarc

            # 2) Switch to DataViz — live main CSRF-fails here
            sw = await client.post(
                "/api/v1/auth/switch-company",
                json={"company_id": cid_dataviz},
                headers={**worklane_headers, "Authorization": f"Bearer {token}"},
            )
            assert sw.status_code == 200, sw.text
            assert sw.json()["user"]["company_id"] == cid_dataviz
            token2 = sw.json().get("access_token") or sw.cookies.get("access_token") or token
            client.cookies.set("access_token", token2)

            # 3) Switch back to Reamarc
            sw2 = await client.post(
                "/api/v1/auth/switch-company",
                json={"company_id": cid_reamarc},
                headers={**worklane_headers, "Authorization": f"Bearer {token2}"},
            )
            assert sw2.status_code == 200, sw2.text
            assert sw2.json()["user"]["company_id"] == cid_reamarc

            # 4) Same user on vercel.app Origin also works (regression)
            login_v = await client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": password},
                headers={
                    "Origin": "https://reamarc-app.vercel.app",
                    "Host": "reamarc-app.vercel.app",
                    "X-Requested-With": "XMLHttpRequest",
                },
            )
            assert login_v.status_code == 200, login_v.text
            assert login_v.json()["user"]["company_id"] == cid_reamarc

            # 5) Subdomain Host dataviz.oneworklane.com → lands on DataViz when member
            login_dv = await client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": password},
                headers={
                    "Origin": "https://dataviz.oneworklane.com",
                    "Host": "dataviz.oneworklane.com",
                    "X-Requested-With": "XMLHttpRequest",
                },
            )
            assert login_dv.status_code == 200, login_dv.text
            assert login_dv.json()["user"]["company_id"] == cid_dataviz
    finally:
        await gdb.companies.delete_many({"id": {"$in": [cid_reamarc, cid_dataviz]}})
        await gdb.users.delete_many({"id": uid})
        await gdb.company_memberships.delete_many({"user_id": uid})
        for k, v in original.items():
            object.__setattr__(settings, k, v)
        _AUTH_CACHE.clear()


def test_company_slug_helpers_reserved_and_format():
    from app.core.company_slug import (
        is_reserved_slug,
        is_valid_slug_format,
        normalize_slug,
        slugify_from_name,
        validate_slug_or_raise,
    )

    assert is_valid_slug_format("dataviz")
    assert is_valid_slug_format("acme-co")
    # normalize_slug lowercases before format check
    assert is_valid_slug_format("DataViz")
    assert normalize_slug("DataViz") == "dataviz"
    assert not is_valid_slug_format("a")
    assert is_reserved_slug("www")
    assert is_reserved_slug("api")
    assert is_reserved_slug("admin")
    assert is_reserved_slug("mail")
    assert not is_reserved_slug("dataviz")
    assert not is_reserved_slug("reamarc")  # home tenant may own this
    assert slugify_from_name("DataViz Technologies") == "dataviz-technologies"
    try:
        validate_slug_or_raise("www")
        assert False, "expected reserved"
    except ValueError:
        pass


@pytest.mark.asyncio
async def test_resolve_uses_x_forwarded_host_when_host_is_api():
    """Vercel rewrite sets Host=api.oneworklane.com; company is in X-Forwarded-Host."""
    from app.core import tenant as tenant_mod

    gdb = MagicMock()

    async def find_one(query, *args, **kwargs):
        # slug query for dataviz
        if query.get("slug") == "dataviz":
            return {"id": "co_dataviz"}
        return None

    gdb.companies.find_one = AsyncMock(side_effect=find_one)

    req = MagicMock()
    req.headers = {
        "host": "api.oneworklane.com",
        "x-forwarded-host": "dataviz.oneworklane.com",
    }
    with patch.object(tenant_mod, "get_global_db", return_value=gdb):
        with patch.object(tenant_mod.settings, "APP_BASE_DOMAIN", "oneworklane.com"):
            cid = await tenant_mod.resolve_company_from_host(req)
    assert cid == "co_dataviz"


@pytest.mark.asyncio
async def test_resolve_returns_none_when_slug_missing_no_name_fallback():
    """Long display names must NOT map host dataviz → company without slug=dataviz."""
    from app.core import tenant as tenant_mod

    gdb = MagicMock()
    gdb.companies.find_one = AsyncMock(return_value=None)  # exact slug miss

    req = MagicMock()
    req.headers = {"host": "dataviz.oneworklane.com"}
    with patch.object(tenant_mod, "get_global_db", return_value=gdb):
        with patch.object(tenant_mod.settings, "APP_BASE_DOMAIN", "oneworklane.com"):
            cid = await tenant_mod.resolve_company_from_host(req)
    assert cid is None
    # Only find_one (custom_domain + slug) — never scan all companies by name
    assert gdb.companies.find_one.await_count >= 1


@pytest.mark.asyncio
async def test_login_on_dataviz_via_forwarded_host_selects_dataviz_not_reamarc():
    """End-to-end: Host=api + X-Forwarded-Host=dataviz + slug=dataviz → DataViz."""
    import uuid
    from datetime import datetime, timezone
    import httpx
    from app.main import app
    from app.config import settings
    from app.database import connect_to_mongo, db_instance
    from app.core.security import get_password_hash, _AUTH_CACHE

    run_id = uuid.uuid4().hex[:8]
    cid_r = f"ow_r_{run_id}"
    cid_d = f"ow_d_{run_id}"
    uid = f"ow_u_{run_id}"
    email = f"ow_{run_id}@example.com"
    password = "SecretPassword123!"
    original = {
        "MULTI_COMPANY_ENABLED": settings.MULTI_COMPANY_ENABLED,
        "IS_PRODUCTION": settings.IS_PRODUCTION,
        "CORS_ORIGINS": list(settings.CORS_ORIGINS),
        "COOKIE_DOMAIN": getattr(settings, "COOKIE_DOMAIN", ""),
        "APP_BASE_DOMAIN": getattr(settings, "APP_BASE_DOMAIN", "oneworklane.com"),
    }
    await connect_to_mongo()
    gdb = db_instance.db
    _AUTH_CACHE.clear()
    object.__setattr__(settings, "MULTI_COMPANY_ENABLED", True)
    object.__setattr__(settings, "IS_PRODUCTION", True)
    object.__setattr__(settings, "CORS_ORIGINS", ["https://reamarc-app.vercel.app"])
    object.__setattr__(settings, "COOKIE_DOMAIN", "")  # auto Domain=.oneworklane.com
    object.__setattr__(settings, "APP_BASE_DOMAIN", "oneworklane.com")
    now = datetime.now(timezone.utc)
    try:
        await gdb.companies.insert_many([
            {"id": cid_r, "name": "Reamarc", "slug": "reamarc", "status": "active", "token_version": 0, "created_at": now},
            # Exact slug required (display name alone never matches host)
            {"id": cid_d, "name": "DataViz Technologies", "display_name": "DataViz Technologies",
             "slug": "dataviz", "status": "active", "token_version": 0, "created_at": now},
        ])
        await gdb.users.insert_one({
            "id": uid, "email": email, "full_name": "Admin",
            "hashed_password": get_password_hash(password),
            "role": "admin", "company_id": cid_r, "last_company_id": cid_r,
            "is_active": True, "token_version": 0, "session_epoch": 0, "refresh_jtis": [],
            "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
        await gdb.company_memberships.insert_many([
            {"id": f"m_r_{run_id}", "user_id": uid, "company_id": cid_r, "role": "admin", "status": "active", "is_primary": True, "token_version": 0, "access": {}},
            {"id": f"m_d_{run_id}", "user_id": uid, "company_id": cid_d, "role": "admin", "status": "active", "is_primary": False, "token_version": 0, "access": {}},
        ])
        await gdb.rate_limit_counters.delete_many({"key": {"$regex": email}})

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="https://api.oneworklane.com") as client:
            # Simulate Vercel rewrite from dataviz.oneworklane.com
            headers = {
                "Origin": "https://dataviz.oneworklane.com",
                "Host": "api.oneworklane.com",
                "X-Forwarded-Host": "dataviz.oneworklane.com",
                "X-Requested-With": "XMLHttpRequest",
            }
            login = await client.post("/api/v1/auth/login", json={"email": email, "password": password}, headers=headers)
            assert login.status_code == 200, login.text
            assert login.json()["user"]["company_id"] == cid_d, login.json()["user"]
            # Cookie Domain=.oneworklane.com for cross-subdomain first-party session
            set_cookie = ",".join(login.headers.get_list("set-cookie"))
            assert "Domain=.oneworklane.com" in set_cookie or "domain=.oneworklane.com" in set_cookie.lower(), set_cookie

            # reamarc subdomain still selects Reamarc
            headers_r = {
                "Origin": "https://reamarc.oneworklane.com",
                "Host": "api.oneworklane.com",
                "X-Forwarded-Host": "reamarc.oneworklane.com",
                "X-Requested-With": "XMLHttpRequest",
            }
            login_r = await client.post("/api/v1/auth/login", json={"email": email, "password": password}, headers=headers_r)
            assert login_r.status_code == 200, login_r.text
            assert login_r.json()["user"]["company_id"] == cid_r

            # vercel.app host-only cookie (no .oneworklane.com Domain)
            headers_v = {
                "Origin": "https://reamarc-app.vercel.app",
                "Host": "reamarc-app.vercel.app",
                "X-Requested-With": "XMLHttpRequest",
            }
            login_v = await client.post("/api/v1/auth/login", json={"email": email, "password": password}, headers=headers_v)
            assert login_v.status_code == 200, login_v.text
            sc_v = ",".join(login_v.headers.get_list("set-cookie"))
            assert "oneworklane.com" not in sc_v.lower(), sc_v
    finally:
        await gdb.companies.delete_many({"id": {"$in": [cid_r, cid_d]}})
        await gdb.users.delete_many({"id": uid})
        await gdb.company_memberships.delete_many({"user_id": uid})
        for k, v in original.items():
            object.__setattr__(settings, k, v)
        _AUTH_CACHE.clear()


@pytest.mark.asyncio
async def test_public_company_slug_exists_boolean_only():
    """Unknown subdomain probe: boolean only — reserved/invalid → false."""
    from app.core.company_slug import slug_exists

    gdb = MagicMock()
    gdb.companies.find_one = AsyncMock(return_value={"_id": "x"})
    assert await slug_exists(gdb, "dataviz") is True
    # Projection must never need name fields for the check
    assert gdb.companies.find_one.await_args.args[1] == {"_id": 1}

    gdb.companies.find_one = AsyncMock(return_value=None)
    assert await slug_exists(gdb, "hello") is False
    assert await slug_exists(gdb, "www") is False
    assert await slug_exists(gdb, "api") is False
    assert await slug_exists(gdb, "ADMIN") is False
    assert await slug_exists(gdb, "mail") is False
    assert await slug_exists(gdb, "Bad Slug") is False
    assert await slug_exists(None, "dataviz") is False


def test_worklane_host_redirect_matrix_documented():
    """Document apex→subdomain / switch / no-slug / vercel no-op (mirrors FE helpers)."""
    # Pure Python mirror of worklaneCompanyHostRedirectUrl rules
    base = "oneworklane.com"
    reserved = {"www", "api", "app", "admin", "mail"}

    def company_slug_from_host(host: str):
        h = host.split(":")[0].lower().rstrip(".")
        if h == base or not h.endswith(f".{base}"):
            return None
        rest = h[: -(len(base) + 1)]
        if not rest or "." in rest or rest in reserved:
            return None
        return rest

    def redirect(host: str, slug: str | None, path="/dashboard"):
        if host != base and not host.endswith(f".{base}"):
            return None  # vercel.app
        if host.endswith(".vercel.app"):
            return None
        s = (slug or "").strip().lower()
        if not s or s in reserved:
            return None
        cur = company_slug_from_host(host)
        if cur == s:
            return None
        path_part = path if path and path != "/" else ""
        return f"https://{s}.{base}{path_part}"

    assert redirect("oneworklane.com", "dataviz") == "https://dataviz.oneworklane.com/dashboard"
    assert redirect("dataviz.oneworklane.com", "dataviz") is None
    assert redirect("reamarc.oneworklane.com", "dataviz") == "https://dataviz.oneworklane.com/dashboard"
    assert redirect("oneworklane.com", "") is None
    assert redirect("oneworklane.com", None) is None
    assert redirect("reamarc-app.vercel.app", "dataviz") is None
