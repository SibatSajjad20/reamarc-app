"""Read-only check for duplicates on upcoming company-scoped unique indexes.

Dry-run by default: only `index_information` and aggregations. No writes.

  python -m scripts.check_company_unique_indexes --db reamarc_test_db
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

import pymongo
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(env_path)

backend = str(Path(__file__).resolve().parent.parent / "backend")
if backend not in sys.path:
    sys.path.insert(0, backend)

from app.core.index_migration import COMPANY_UNIQUE_INDEXES, _normalize_keys
from scripts._prod_guard import is_prod


def _group_id(keys) -> Dict[str, str]:
    return {field: f"${field}" for field, _dir in _normalize_keys(keys)}


def check_collection(db, spec: Dict[str, Any]) -> Dict[str, Any]:
    coll = db[spec["collection"]]
    info = coll.index_information()
    new_name = spec["name"]
    old_names = spec.get("old_names") or []
    opts = spec.get("opts") or {}
    partial = opts.get("partialFilterExpression")

    pipeline: List[Dict[str, Any]] = []
    if partial:
        pipeline.append({"$match": partial})
    pipeline.extend(
        [
            {"$group": {"_id": _group_id(spec["new_keys"]), "count": {"$sum": 1}}},
            {"$match": {"count": {"$gt": 1}}},
        ]
    )
    dups = list(coll.aggregate(pipeline))
    return {
        "collection": spec["collection"],
        "new_index": new_name,
        "new_index_present": new_name in info,
        "old_indexes_present": [n for n in old_names if n in info],
        "duplicate_groups": len(dups),
        "duplicate_examples": dups[:5],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only company unique-index duplicate check")
    parser.add_argument("--uri", default=os.environ.get("MONGODB_URL", "mongodb://localhost:27017"))
    parser.add_argument("--db", default=os.environ.get("MONGODB_DB_NAME", "reamarc_test_db"))
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Unused: this script never writes. Accepted so it matches other script CLIs.",
    )
    args = parser.parse_args()

    if is_prod(args.uri, args.db):
        print("[ERROR] Refusing to run against a production database.", file=sys.stderr)
        return 1

    print(f"[check_company_unique_indexes] uri={args.uri!r} db={args.db!r} (read-only)")
    client = pymongo.MongoClient(args.uri)
    try:
        db = client[args.db]
        total_dups = 0
        for spec in COMPANY_UNIQUE_INDEXES:
            row = check_collection(db, spec)
            total_dups += row["duplicate_groups"]
            print(
                f"{row['collection']:<28} {row['new_index']:<40} "
                f"new={row['new_index_present']} old={row['old_indexes_present'] or '-'} "
                f"dup_groups={row['duplicate_groups']}"
            )
            for ex in row["duplicate_examples"]:
                print(f"    duplicate {ex.get('_id')} count={ex.get('count')}")
        print("-" * 72)
        print(f"TOTAL duplicate groups: {total_dups}")
        if total_dups:
            print("[FAIL] Resolve duplicates before deploying the new unique indexes.")
            return 1
        print("[OK] No duplicates on company unique key specs.")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
