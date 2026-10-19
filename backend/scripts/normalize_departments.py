"""Canonicalise user (and membership) department fields.

Default is --dry-run: print before -> after and make no writes.
Pass --apply to persist changes and log each write to permission_audit.

Also drops content_stages entries that equal the user's primary stage.

Do not run --apply against production without reviewing a dry-run first.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.database import connect_to_mongo, db_instance  # noqa: E402
from app.services.access import (  # noqa: E402
    canonicalize_departments,
    get_primary_stage,
    normalize_stage,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _plan_user(doc: Dict[str, Any]) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
    role = str(doc.get("role") or "").lower()
    if role in ("admin", "operations", "hr", "client"):
        extras = doc.get("content_stages")
        if not isinstance(extras, list) or not extras:
            return None
        primary_stage = get_primary_stage(doc.get("primary_department"))
        cleaned = [s for s in extras if normalize_stage(s) and normalize_stage(s) != primary_stage]
        if cleaned == list(extras):
            return None
        before = {"content_stages": extras}
        after = {"content_stages": cleaned}
        return before, after

    packed = canonicalize_departments(
        departments=doc.get("departments") if isinstance(doc.get("departments"), list) else None,
        primary=doc.get("primary_department"),
        department=doc.get("department") if isinstance(doc.get("department"), str) else None,
    )
    extras = doc.get("content_stages") if isinstance(doc.get("content_stages"), list) else []
    primary_stage = get_primary_stage(packed["primary_department"])
    cleaned_extras = [s for s in extras if normalize_stage(s) and normalize_stage(s) != primary_stage]

    before = {
        "primary_department": doc.get("primary_department"),
        "departments": doc.get("departments"),
        "department": doc.get("department"),
        "content_stages": extras,
    }
    after = {
        "primary_department": packed["primary_department"],
        "departments": packed["departments"],
        "department": packed["department"],
        "content_stages": cleaned_extras,
    }
    if before == after:
        return None
    return before, after


def _plan_membership(doc: Dict[str, Any]) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
    packed = canonicalize_departments(
        departments=doc.get("departments") if isinstance(doc.get("departments"), list) else None,
        primary=doc.get("primary_department"),
        department=doc.get("department") if isinstance(doc.get("department"), str) else None,
    )
    before = {
        "primary_department": doc.get("primary_department"),
        "departments": doc.get("departments"),
        "department": doc.get("department"),
    }
    after = {
        "primary_department": packed["primary_department"],
        "departments": packed["departments"],
        "department": packed["department"],
    }
    if before == after:
        return None
    return before, after


def _label(doc: Dict[str, Any]) -> str:
    return (
        str(doc.get("email") or doc.get("full_name") or doc.get("name") or doc.get("user_id") or doc.get("id") or doc.get("_id") or "?")
    )


async def run(apply: bool) -> int:
    await connect_to_mongo()
    db = db_instance.db
    if db is None:
        print("Database unavailable.")
        return 1

    changed = 0
    users = await db.users.find({}).to_list(length=10000)
    for doc in users:
        plan = _plan_user(doc)
        if not plan:
            continue
        before, after = plan
        changed += 1
        print(f"user {_label(doc)}: {before} -> {after}")
        if apply:
            await db.users.update_one(
                {"_id": doc["_id"]},
                {"$set": {**after, "updated_at": _now_iso()}, "$inc": {"access_version": 1}},
            )
            await db.permission_audit.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "at": _now_iso(),
                    "actor_id": "script:normalize_departments",
                    "actor_name": "normalize_departments.py",
                    "target_type": "user",
                    "target_id": str(doc.get("id") or doc.get("_id")),
                    "target_name": _label(doc),
                    "department": after.get("primary_department"),
                    "module": "departments",
                    "before": str(before),
                    "after": str(after),
                    "reason": "Canonicalise departments and drop primary-stage extras",
                }
            )

    names = await db.list_collection_names()
    if "company_memberships" in names:
        memberships = await db.company_memberships.find({}).to_list(length=10000)
        for doc in memberships:
            plan = _plan_membership(doc)
            if not plan:
                continue
            before, after = plan
            changed += 1
            print(f"membership {_label(doc)}: {before} -> {after}")
            if apply:
                await db.company_memberships.update_one({"_id": doc["_id"]}, {"$set": {**after, "updated_at": _now_iso()}})
                await db.permission_audit.insert_one(
                    {
                        "id": str(uuid.uuid4()),
                        "at": _now_iso(),
                        "actor_id": "script:normalize_departments",
                        "actor_name": "normalize_departments.py",
                        "target_type": "company_membership",
                        "target_id": str(doc.get("id") or doc.get("_id")),
                        "target_name": _label(doc),
                        "department": after.get("primary_department"),
                        "module": "departments",
                        "before": str(before),
                        "after": str(after),
                        "reason": "Canonicalise membership departments",
                    }
                )

    mode = "APPLY" if apply else "DRY-RUN"
    print(f"{mode}: {changed} record(s) would change." if not apply else f"{mode}: {changed} record(s) updated.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Canonicalise stored department fields.")
    parser.add_argument("--apply", action="store_true", help="Write changes. Default is dry-run.")
    parser.add_argument("--dry-run", action="store_true", help="Print changes only (default).")
    args = parser.parse_args()
    apply = bool(args.apply) and not args.dry_run
    return asyncio.run(run(apply=apply))


if __name__ == "__main__":
    raise SystemExit(main())
