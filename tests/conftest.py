"""Keep tests on local mongod. Never use prod reamarc_db."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest

_BACKEND = str(Path(__file__).resolve().parent.parent / "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

_LOCAL_URL = "mongodb://localhost:27017"
_SAFE_DB = "reamarc_test_db"
_PROD_DBS = {"reamarc", "reamarc_db"}

if os.environ.get("ALLOW_REMOTE_TEST_DB") != "1":
    os.environ["MONGODB_URL"] = _LOCAL_URL
    current_db = (os.environ.get("MONGODB_DB_NAME") or "").strip()
    if not current_db or current_db in _PROD_DBS:
        os.environ["MONGODB_DB_NAME"] = _SAFE_DB


def _host_is_local(host: str) -> bool:
    h = (host or "").strip().lower()
    return h in ("localhost", "127.0.0.1", "::1", "0.0.0.0")


def pytest_configure(config) -> None:
    from app.config import settings

    allow_remote = os.environ.get("ALLOW_REMOTE_TEST_DB") == "1"
    url = getattr(settings, "MONGODB_URL", "") or ""
    host = urlparse(url).hostname or ""
    db_name = getattr(settings, "MONGODB_DB_NAME", "") or ""

    if allow_remote:
        if not _host_is_local(host) and db_name != _SAFE_DB:
            pytest.exit(
                "Tests refused: remote MongoDB is only allowed with database reamarc_test_db "
                "and ALLOW_REMOTE_TEST_DB=1."
            )
        return

    object.__setattr__(settings, "MONGODB_URL", _LOCAL_URL)
    if db_name in _PROD_DBS or not db_name:
        object.__setattr__(settings, "MONGODB_DB_NAME", _SAFE_DB)
    object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)
    object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)


@pytest.fixture(autouse=True)
def _reset_feature_flags():
    from app.config import settings

    yield
    object.__setattr__(settings, "MULTI_COMPANY_ENABLED", False)
    object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
