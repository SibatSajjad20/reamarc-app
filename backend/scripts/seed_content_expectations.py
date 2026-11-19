"""Seed monthly content expectations on matching active client workspaces.

Run from the backend folder:
    python scripts/seed_content_expectations.py
    python scripts/seed_content_expectations.py --apply

Does not create workspaces. Unmatched names are printed and skipped.
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings

ASSH_EXPECTATIONS = {
    "period": "month",
    "lines": [
        {"creative_type": "Static", "expected": 5, "expected_max": 10, "included": False, "layout": None, "skip_months": None},
        {"creative_type": "Reel", "expected": 8, "expected_max": None, "included": False, "layout": None, "skip_months": None},
        {"creative_type": "Carousel", "expected": 3, "expected_max": None, "included": False, "layout": None, "skip_months": None},
        {
            "creative_type": "Animated Post",
            "expected": 4,
            "expected_max": None,
            "included": False,
            "layout": None,
            "skip_months": ["2026-11"],
        },
        {"creative_type": "Cover Image", "expected": 1, "expected_max": None, "included": False, "layout": None, "skip_months": None},
    ],
}

SP_EXPECTATIONS = {
    "period": "month",
    "lines": [
        {"creative_type": "Static", "expected": 10, "included": False, "layout": None},
        {"creative_type": "Carousel", "expected": 1, "included": False, "layout": "4x3"},
        {"creative_type": "Animated Post", "expected": 4, "included": False, "layout": None},
        {"creative_type": "Cover Image", "expected": 1, "included": False, "layout": None},
    ],
}

TARGETS = [
    {
        "label": "ASSH Developers Pvt. Ltd/Sardar Mall",
        "needles": ("assh", "sardar mall"),
        "expectations": ASSH_EXPECTATIONS,
    },
    {
        "label": "SP BUILDERS",
        "needles": ("sp builders", "spbuilders"),
        "expectations": SP_EXPECTATIONS,
    },
]


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


def workspace_matches(name: str, needles: tuple[str, ...]) -> bool:
    norm = normalize_name(name)
    if not norm:
        return False
    return any(needle in norm for needle in needles)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write expectations to matching workspaces")
    args = ap.parse_args()

    client = MongoClient(settings.MONGODB_URL, serverSelectionTimeoutMS=10000)
    db = client[settings.MONGODB_DB_NAME]
    workspaces = list(db.workspaces.find({"status": {"$ne": "inactive"}}, {"_id": 0, "id": 1, "name": 1, "status": 1}))
    print(f"active-ish workspaces: {len(workspaces)}")

    claimed: set[str] = set()
    unmatched: list[str] = []
    now = datetime.now(timezone.utc).isoformat()

    for target in TARGETS:
        matches = [
            ws
            for ws in workspaces
            if ws.get("id") not in claimed and workspace_matches(str(ws.get("name") or ""), target["needles"])
        ]
        if not matches:
            unmatched.append(target["label"])
            print(f"UNMATCHED: {target['label']}")
            continue
        for ws in matches:
            claimed.add(str(ws.get("id")))
            print(f"{'APPLY' if args.apply else 'DRY'}: {ws.get('name')} ({ws.get('id')}) <- {target['label']}")
            if args.apply:
                db.workspaces.update_one(
                    {"id": ws["id"]},
                    {"$set": {"content_expectations": target["expectations"], "updated_at": now}},
                )

    if unmatched:
        print(f"skipped unmatched: {len(unmatched)}")
        return 0 if args.apply else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
