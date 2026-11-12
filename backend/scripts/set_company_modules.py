"""One-time allow-list for company modules. Dry-run by default; writes only with --apply.

Reads MONGODB_URL / MONGODB_DB_NAME from the environment and never prints them.
Writes only the company_modules collection. Does not load .env.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

DB_NAME = "reamarc_test_db"
LIVE_DB_NAME = "reamarc_db"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
ALLOWED_WRITE_COLLECTIONS = frozenset({"company_modules"})
CACHE_HINT = "The running backend picks this up within ~90 s."


def _hosts(uri: str) -> list[str]:
    import pymongo.uri_parser

    try:
        parsed = pymongo.uri_parser.parse_uri(uri)
        return [h[0].lower() for h in parsed.get("nodelist", [])]
    except Exception:
        try:
            p = urlparse(uri)
            return [p.hostname.lower()] if p.hostname else []
        except Exception:
            return []


def mask_mongo_host(uri: str) -> str:
    """Return ***.<last two labels> with no scheme, user, password, query, or path."""
    hosts = _hosts(uri or "")
    if not hosts:
        return "***"
    labels = (hosts[0] or "").split(".")
    if len(labels) >= 2:
        return "***." + ".".join(labels[-2:])
    return "***." + labels[0]


def live_db_name_ok(db_name: str | None) -> bool:
    return db_name == LIVE_DB_NAME


def _refuse() -> tuple[str, str]:
    uri = os.environ.get("MONGODB_URL") or "mongodb://localhost:27017"
    db_name = os.environ.get("MONGODB_DB_NAME") or DB_NAME
    env = str(os.environ.get("ENVIRONMENT") or "").strip().lower()
    hosts = _hosts(uri)
    if env == "production" or db_name != DB_NAME or not hosts or any(h not in LOCAL_HOSTS for h in hosts):
        print("[ERROR] Refusing to run. Only localhost + reamarc_test_db is allowed.", file=sys.stderr)
        sys.exit(1)
    return uri, db_name


class WriteGuard:
    def __init__(self, db):
        self.db = db
        self.written: set[str] = set()

    def __getattr__(self, name: str):
        coll = getattr(self.db, name)

        class _Proxy:
            def __init__(self, inner, parent, coll_name):
                self.inner = inner
                self.parent = parent
                self.coll_name = coll_name

            def __getattr__(self, op):
                fn = getattr(self.inner, op)
                write_ops = {
                    "insert_one", "insert_many", "update_one", "update_many",
                    "replace_one", "delete_one", "delete_many", "bulk_write",
                    "find_one_and_update", "find_one_and_replace", "find_one_and_delete",
                }
                if op in write_ops:
                    def wrapped(*args, **kwargs):
                        self.parent.written.add(self.coll_name)
                        assert self.coll_name in ALLOWED_WRITE_COLLECTIONS, (
                            f"Refusing write to {self.coll_name}; only company_modules is allowed"
                        )
                        return fn(*args, **kwargs)
                    return wrapped
                return fn

        return _Proxy(coll, self, name)


def _lookup_company(raw_db, company_id: str, by_id: bool):
    if by_id:
        return raw_db.companies.find_one({"_id": company_id})
    return raw_db.companies.find_one({"id": company_id})


def run(db, args, confirm=input, out=print, err=None, stdin_interactive=None) -> int:
    """Apply or dry-run a company_modules change. `db` must be a WriteGuard."""
    def _err(msg: str) -> None:
        if err is None:
            print(msg, file=sys.stderr)
        else:
            err(msg)

    if stdin_interactive is None:
        stdin_interactive = bool(getattr(sys.stdin, "isatty", lambda: False)())

    from app.services.company_modules import COMPANY_MODULE_KEYS, COMPANY_MODULE_KEY_SET

    raw_db = db.db
    live = bool(getattr(args, "live", False))
    company = _lookup_company(raw_db, args.company_id, by_id=live)
    if not company:
        _err(f"[ERROR] Company not found: {args.company_id}")
        return 1

    slug = company.get("slug")
    out(f"Company: {company.get('name')}  slug={slug}  id={args.company_id}")
    before = raw_db.company_modules.find_one({"$or": [{"_id": args.company_id}, {"company_id": args.company_id}]})
    out(f"Before: {before}")

    if args.reset:
        after_doc = None
        op = "delete"
    else:
        keys = [k.strip() for k in (args.enable or "").split(",") if k.strip()]
        if not keys:
            _err("[ERROR] Provide --enable key,key or --reset")
            return 1
        unknown = [k for k in keys if k not in COMPANY_MODULE_KEY_SET]
        if unknown:
            _err(f"[ERROR] Unknown keys {unknown}. Valid: {list(COMPANY_MODULE_KEYS)}")
            return 1
        enabled = sorted(set(keys))
        if set(enabled) == set(COMPANY_MODULE_KEYS):
            after_doc = None
            op = "delete"
        else:
            after_doc = {
                "_id": args.company_id,
                "company_id": args.company_id,
                "enabled_modules": enabled,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": "script:set_company_modules",
            }
            op = "upsert"

    out(f"After: {after_doc}")
    out(f"Mode: {'APPLY' if args.apply else 'DRY-RUN'} op={op}")

    if not args.apply:
        assert not db.written
        return 0

    if live:
        if not stdin_interactive:
            _err("[ERROR] --live --apply requires an interactive terminal")
            return 1
        typed = confirm("Type the company slug to confirm: ")
        if typed != slug:
            _err("[ERROR] Slug mismatch; write aborted")
            return 1

    if op == "delete":
        db.company_modules.delete_one({"_id": args.company_id})
        db.company_modules.delete_one({"company_id": args.company_id})
    else:
        db.company_modules.replace_one({"_id": args.company_id}, after_doc, upsert=True)

    extra = db.written - ALLOWED_WRITE_COLLECTIONS
    assert not extra, f"Unexpected writes: {extra}"
    out(f"Wrote collections: {sorted(db.written)}")
    out(CACHE_HINT)
    return 0


def _connect_and_run(uri: str, db_name: str, args) -> int:
    from pymongo import MongoClient

    client = MongoClient(uri)
    raw_db = client[db_name]
    db = WriteGuard(raw_db)
    return run(db, args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Set company_modules allow-list (dry-run default).")
    parser.add_argument("--company-id", required=True)
    parser.add_argument("--enable", default="", help="Comma-separated module keys")
    parser.add_argument("--reset", action="store_true", help="Delete the company_modules row")
    parser.add_argument("--apply", action="store_true", help="Persist changes (otherwise dry-run)")
    parser.add_argument("--live", action="store_true", help="Guarded live mode (reamarc_db only)")
    args = parser.parse_args()

    try:
        if args.live:
            db_name = os.environ.get("MONGODB_DB_NAME")
            if not live_db_name_ok(db_name):
                print("[ERROR] --live requires MONGODB_DB_NAME=reamarc_db", file=sys.stderr)
                sys.exit(1)
            uri = os.environ.get("MONGODB_URL") or ""
            print(f"Host: {mask_mongo_host(uri)}  db={db_name}")
            code = _connect_and_run(uri, db_name, args)
        else:
            uri, db_name = _refuse()
            code = _connect_and_run(uri, db_name, args)
    except SystemExit:
        raise
    except Exception as exc:
        print(type(exc).__name__, file=sys.stderr)
        sys.exit(1)
    if code:
        sys.exit(code)


if __name__ == "__main__":
    main()
