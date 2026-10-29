#!/usr/bin/env python3
"""
One-off: set (or inspect) a company's subdomain slug for Worklane host matching.

Host matching uses company.slug ONLY (exact lowercase). Display names like
"DataViz Technologies" are never used for *.oneworklane.com routing.

Default is dry-run (no writes). Pass --apply to update MongoDB.

Examples (run on your laptop against the live DB — never from CI without approval):

  # Inspect + dry-run set to dataviz
  python scripts/set_company_slug.py --name "DataViz" --slug dataviz
  python scripts/set_company_slug.py --company-id <uuid> --slug dataviz

  # Apply after reviewing dry-run output
  python scripts/set_company_slug.py --name "DataViz" --slug dataviz --apply

  # Overwrite an existing different slug
  python scripts/set_company_slug.py --name "DataViz" --slug dataviz --apply --force

Requires MONGO_URL (and optional DB_NAME) in the environment or backend/.env —
same as the API. Does not print connection strings or secrets.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Allow `python scripts/set_company_slug.py` from repo root
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# Load .env without printing values
try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from app.core.company_slug import (  # noqa: E402
    RESERVED_HOST_SLUGS,
    is_reserved_slug,
    is_valid_slug_format,
    normalize_slug,
    validate_slug_or_raise,
)


def _db_name() -> str:
    return os.environ.get("DB_NAME") or os.environ.get("MONGO_DB") or "reamarc"


async def _run(args: argparse.Namespace) -> int:
    mongo_url = os.environ.get("MONGO_URL") or os.environ.get("MONGODB_URI")
    if not mongo_url:
        print("ERROR: MONGO_URL (or MONGODB_URI) is not set.", file=sys.stderr)
        return 2

    desired = None
    if args.slug is not None:
        try:
            desired = validate_slug_or_raise(args.slug)
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 2

    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=8000)
    gdb = client[_db_name()]

    try:
        await client.admin.command("ping")
    except Exception as exc:
        print(f"ERROR: cannot reach MongoDB ({type(exc).__name__}).", file=sys.stderr)
        return 2

    query: dict = {}
    if args.company_id:
        query["id"] = args.company_id.strip()
    elif args.name:
        # Case-insensitive exact name OR display_name match for lookup only
        name = args.name.strip()
        query = {
            "$or": [
                {"name": {"$regex": f"^{_re_escape(name)}$", "$options": "i"}},
                {"display_name": {"$regex": f"^{_re_escape(name)}$", "$options": "i"}},
                {"name": {"$regex": _re_escape(name), "$options": "i"}},
            ]
        }
    elif args.list_missing:
        query = {
            "$or": [
                {"slug": {"$exists": False}},
                {"slug": None},
                {"slug": ""},
            ]
        }
    else:
        print("ERROR: pass --company-id, --name, or --list-missing", file=sys.stderr)
        return 2

    projection = {
        "id": 1, "name": 1, "display_name": 1, "slug": 1, "status": 1, "_id": 0,
    }

    if args.list_missing:
        docs = await gdb.companies.find(query, projection).to_list(200)
        print(f"Companies with missing/empty slug ({len(docs)}):")
        for d in docs:
            print(
                f"  id={d.get('id')}  name={d.get('name')!r}  "
                f"display_name={d.get('display_name')!r}  slug={d.get('slug')!r}"
            )
        client.close()
        return 0

    docs = await gdb.companies.find(query, projection).to_list(20)
    if not docs:
        print("ERROR: no company matched.", file=sys.stderr)
        client.close()
        return 1
    if len(docs) > 1 and not args.company_id:
        print("ERROR: multiple companies matched; use --company-id:", file=sys.stderr)
        for d in docs:
            print(
                f"  id={d.get('id')}  name={d.get('name')!r}  "
                f"display_name={d.get('display_name')!r}  slug={d.get('slug')!r}",
                file=sys.stderr,
            )
        client.close()
        return 1

    company = docs[0]
    cid = company.get("id")
    current = normalize_slug(company.get("slug"))
    print("Matched company:")
    print(f"  id:           {cid}")
    print(f"  name:         {company.get('name')!r}")
    print(f"  display_name: {company.get('display_name')!r}")
    print(f"  status:       {company.get('status')!r}")
    print(f"  current slug: {current!r}")

    if desired is None:
        print("No --slug given; inspect-only (no change planned).")
        client.close()
        return 0

    print(f"  desired slug: {desired!r}")

    if current == desired:
        print("Already set to desired slug; nothing to do.")
        client.close()
        return 0

    if current and current != desired and not args.force:
        print(
            f"ERROR: company already has slug {current!r}. "
            "Pass --force to overwrite, or choose a different --slug.",
            file=sys.stderr,
        )
        client.close()
        return 1

    taken = await gdb.companies.find_one(
        {"slug": desired, "id": {"$ne": cid}}, {"id": 1, "name": 1, "_id": 0}
    )
    if taken:
        print(
            f"ERROR: slug {desired!r} already used by id={taken.get('id')} "
            f"name={taken.get('name')!r}.",
            file=sys.stderr,
        )
        client.close()
        return 1

    if not args.apply:
        print("DRY-RUN: would set slug "
              f"{current!r} → {desired!r}. Re-run with --apply to write.")
        client.close()
        return 0

    result = await gdb.companies.update_one(
        {"id": cid},
        {"$set": {"slug": desired}},
    )
    if result.matched_count != 1:
        print("ERROR: update matched 0 documents.", file=sys.stderr)
        client.close()
        return 1
    print(f"APPLIED: slug set to {desired!r} (modified={result.modified_count}).")
    client.close()
    return 0


def _re_escape(s: str) -> str:
    import re
    return re.escape(s)


def main() -> None:
    p = argparse.ArgumentParser(
        description="Inspect or set company.slug for Worklane subdomain matching."
    )
    p.add_argument("--company-id", help="Exact company id (uuid)")
    p.add_argument("--name", help="Match company name / display_name (lookup only)")
    p.add_argument("--slug", help="Desired slug (lowercase a-z0-9-)")
    p.add_argument(
        "--list-missing",
        action="store_true",
        help="List companies with empty/missing slug (read-only)",
    )
    p.add_argument(
        "--apply",
        action="store_true",
        help="Write to MongoDB (default is dry-run)",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Allow overwriting an existing different slug",
    )
    args = p.parse_args()
    # Quiet note on reserved set for operators
    if args.slug and is_reserved_slug(args.slug):
        print(
            f"ERROR: slug is reserved. Reserved: "
            f"{', '.join(sorted(RESERVED_HOST_SLUGS))}",
            file=sys.stderr,
        )
        sys.exit(2)
    if args.slug and not is_valid_slug_format(args.slug):
        try:
            validate_slug_or_raise(args.slug)
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            sys.exit(2)
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()
