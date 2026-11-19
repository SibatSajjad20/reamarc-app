"""Rewrite messy content-calendar creative_type labels to canonical values.

Run from the backend folder:
    python scripts/normalize_creative_types.py
    python scripts/normalize_creative_types.py --apply
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings
from app.schemas.content_calendar import canonicalize_creative_type

COLLECTION = "content_calendar_items"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    client = MongoClient(settings.MONGODB_URL, serverSelectionTimeoutMS=10000)
    db = client[settings.MONGODB_DB_NAME]
    coll = db[COLLECTION]

    changes: Counter[str] = Counter()
    to_write = []
    for doc in coll.find({}, {"_id": 0, "id": 1, "creative_type": 1, "serial": 1}):
        raw = doc.get("creative_type")
        canon = canonicalize_creative_type(raw)
        if not canon or canon == raw:
            continue
        changes[f"{raw!r} -> {canon!r}"] += 1
        to_write.append((doc.get("id"), canon, doc.get("serial")))

    print(f"rows to rewrite: {len(to_write)}")
    for label, n in changes.most_common():
        print(f"  {n}  {label}")

    if not args.apply:
        print("dry run; pass --apply to write")
        return 0

    now = datetime.now(timezone.utc).isoformat()
    for item_id, canon, _serial in to_write:
        if not item_id:
            continue
        coll.update_one({"id": item_id}, {"$set": {"creative_type": canon, "updated_at": now}})
    print(f"updated {len(to_write)} items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
