"""Find (and optionally delete) the placeholder client workspace that company creation used to add.

Run from the backend folder:
    python scripts/remove_empty_default_workspace.py --company-slug dataviz            # DRY RUN (default, read-only)
    python scripts/remove_empty_default_workspace.py --company-slug dataviz --apply --id ws_xxxxxxxxxxxx

Rules:
- Only workspaces flagged is_default=True by the old company-creation code are candidates.
- A candidate is deleted only if NOTHING references it in any collection (content, client logins,
  team memberships, website projects, leads, drive folders, etc.).
- --apply needs the exact workspace id from the dry run. One workspace per run.
- It never prints connection strings, tokens or passwords.
"""
from __future__ import annotations

import argparse
import sys

from pymongo import MongoClient

from app.config import settings

REF_FIELDS = ("workspace_id", "workspace_ids", "workspaceId", "client_workspace_id", "workspace")


def references(db, ws_id: str) -> dict:
    found = {}
    for name in sorted(db.list_collection_names()):
        if name == "workspaces" or name.startswith("system."):
            continue
        q = {"$or": [{f: ws_id} for f in REF_FIELDS]}
        n = db[name].count_documents(q, limit=1000)
        if n:
            found[name] = n
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--company-slug", required=True)
    ap.add_argument("--apply", action="store_true", help="actually delete (needs --id)")
    ap.add_argument("--id", help="exact workspace id to delete (from the dry run)")
    args = ap.parse_args()

    client = MongoClient(settings.MONGODB_URL, serverSelectionTimeoutMS=10000)
    db = client[settings.MONGODB_DB_NAME]
    print(f"database: {settings.MONGODB_DB_NAME}")

    company = db.companies.find_one({"slug": args.company_slug.strip().lower()}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    if not company:
        print("company not found")
        return 1
    print(f"company: {company.get('name')} ({company['id']})")

    cands = list(db.workspaces.find({"company_id": company["id"], "is_default": True},
                                    {"_id": 0, "id": 1, "name": 1, "created_at": 1, "creation_id": 1, "logo_url": 1}))
    if not cands:
        print("no placeholder (is_default) workspace for this company - nothing to do")
        return 0

    deletable = []
    for ws in cands:
        refs = references(db, ws["id"])
        status = "EMPTY - safe to delete" if not refs else f"IN USE - keep ({refs})"
        print(f"- {ws['id']}  name={ws.get('name')!r}  created={ws.get('created_at')}  logo={'yes' if ws.get('logo_url') else 'no'}  -> {status}")
        if not refs:
            deletable.append(ws["id"])

    if not args.apply:
        print(f"\nDRY RUN: would delete {len(deletable)} workspace(s): {deletable or 'none'}. Nothing was changed.")
        return 0

    if not args.id or args.id not in deletable:
        print("refusing: --apply needs --id set to one EMPTY workspace id listed above")
        return 2
    # Re-check right before deleting.
    if references(db, args.id):
        print("refusing: workspace gained references since the check")
        return 2
    res = db.workspaces.delete_one({"id": args.id, "company_id": company["id"], "is_default": True})
    print(f"deleted {res.deleted_count} workspace ({args.id})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
