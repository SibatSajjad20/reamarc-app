"""
One-off script to add Daily Log entries for Sibat Sajjad (November 2026).
Dry-run by default. Use --apply to execute insertion.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sys
import uuid

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

ROLE_TITLE_MAP = {
    "admin": "Admin",
    "hr": "HR",
    "team_lead": "Team Lead",
    "team_member": "Team Member",
    "member": "Team Member",
    "client": "Client",
}

ENTRIES = [
    {"date": "2026-11-02", "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall", "hours": 0.75, "task_description": "Moved the next-step button to the top of the screen when a unit is selected, across all sales modules"},
    {"date": "2026-11-02", "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall", "hours": 0.5, "task_description": "Fixed the /sold page prerender error"},
    {"date": "2026-11-04", "client_project": "Reamarc", "hours": 1.0, "task_description": "Finance receipt fixes: WHT auto-split, blocked over-settled receipts and accidental client credit, fixed receipt edit race"},
    {"date": "2026-11-04", "client_project": "Reamarc", "hours": 0.5, "task_description": "Fixed CRM push alerts so they reach sales users (admins still suppressed)"},
    {"date": "2026-11-04", "client_project": "Reamarc", "hours": 0.75, "task_description": "Orion One: added new images to the commercial, architecture and lake view slides"},
    {"date": "2026-11-05", "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall", "hours": 0.75, "task_description": "Inventory reset script and import preparation"},
    {"date": "2026-11-05", "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall", "hours": 1.5, "task_description": "Client CNIC and photo document uploads with booking and sale PDFs"},
    {"date": "2026-11-05", "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall", "hours": 1.25, "task_description": "Booking form new fields, numbering and declaration"},
    {"date": "2026-11-05", "client_project": "Reamarc", "hours": 1.25, "task_description": "Orion One: lakeside, location and amenities image updates"},
    {"date": "2026-11-06", "client_project": "Reamarc", "hours": 1.0, "task_description": "Daily Log: count pending overtime in hours to log"},
    {"date": "2026-11-06", "client_project": "Reamarc", "hours": 1.5, "task_description": "Orion One: Vercel to Hostinger migration, build fix and DNS"},
    {"date": "2026-11-06", "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall", "hours": 1.25, "task_description": "Booking form redesign and login screen with the Sardar's Mall logo"},
    {"date": "2026-11-06", "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall", "hours": 0.75, "task_description": "PropertyERP speed fixes and brand theme follow-up"},
]

EXPECTED_DAY_HOURS = {"2026-11-02": 1.25, "2026-11-04": 2.25, "2026-11-05": 4.75, "2026-11-06": 4.5}


async def main():
    parser = argparse.ArgumentParser(description="Add daily logs for Sibat Sajjad (Nov 2026)")
    parser.add_argument("--apply", action="store_true", help="Apply insertions to the database")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    # Pre-condition: Assert totals before touching DB
    assert len(ENTRIES) == 13, f"Expected 13 entries, found {len(ENTRIES)}"
    for day_str, exp_h in EXPECTED_DAY_HOURS.items():
        actual_h = round(sum(e["hours"] for e in ENTRIES if e["date"] == day_str), 2)
        assert actual_h == exp_h, f"Assertion failed for {day_str}: expected {exp_h}h, got {actual_h}h"

    db_name = getattr(settings, "MONGODB_DB_NAME", "") or ""
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[db_name]

    # Initialize app db_instance so app services (like recompute_day_score) share this client
    from app.database import db_instance
    db_instance.client = client
    db_instance.db = db

    # 1. User Lookup
    users = await db.users.find({
        "$or": [
            {"name": {"$regex": r"sib+at\s*saj+ad", "$options": "i"}},
            {"full_name": {"$regex": r"sib+at\s*saj+ad", "$options": "i"}},
            {"email": {"$regex": r"sibat", "$options": "i"}},
        ]
    }).to_list(10)

    if len(users) != 1:
        print(f"Error: Expected exactly 1 match for Sibat Sajjad, found {len(users)} in '{db_name}':")
        for u in users:
            print(f"  id={u.get('id') or u.get('_id')}, name={u.get('name')}, full_name={u.get('full_name')}, email={u.get('email')}")
        client.close()
        return

    user = users[0]
    user_id = str(user.get("id") or user.get("_id"))
    raw_role = user.get("role", "team_member")
    role_formatted = ROLE_TITLE_MAP.get(str(raw_role).lower(), str(raw_role).replace("_", " ").title())
    res_name = user.get("full_name") or user.get("name") or "Team Member"
    dept = user.get("department") or ""
    cid = user.get("company_id")

    print(f"Found User: id={user_id} | name={res_name} | email={user.get('email')} | role={role_formatted} | dept={dept} | company={cid}")
    print(f"Database: {db_name}")

    # 2. Check existing logs per date for duplicate guard & existing totals
    dates = sorted(list(EXPECTED_DAY_HOURS.keys()))
    existing_by_date = {}
    for d in dates:
        existing = await db.daily_log_entries.find({"user_id": user_id, "date": d}).to_list(100)
        existing_by_date[d] = existing

    # 3. Build candidate docs and check duplicates
    now_iso = datetime.now(timezone.utc).isoformat()
    plan = []
    new_docs = []

    for item in ENTRIES:
        d = item["date"]
        desc = item["task_description"].strip()
        existing_descs = {(x.get("task_description") or "").strip().lower() for x in existing_by_date[d]}
        is_dup = desc.lower() in existing_descs
        status = "SKIP" if is_dup else "NEW"

        doc = {
            "id": f"log-{uuid.uuid4().hex[:12]}",
            "workspace_id": "global",
            "user_id": user_id,
            "version": 1,
            "date": d,
            "resource_name": res_name,
            "role": role_formatted,
            "department": dept,
            "client_project": item["client_project"],
            "task_description": desc,
            "task_type": "Scheduled Task",
            "task_status": "Complete",
            "revisions_done": "",
            "deliverables": "",
            "hours_utilized": float(item["hours"]),
            "remarks": "",
            "start_time": None,
            "end_time": None,
            "estimated_hours": None,
            "variance_reason": None,
            "month_sheet": "November - 2026",
            "custom_fields": None,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        if cid:
            doc["company_id"] = cid

        plan.append((item, status, doc))
        if not is_dup:
            new_docs.append(doc)

    # 4. Print dry-run review table
    print("\n" + "=" * 105)
    print(f"{'Date':<11} | {'Client':<38} | {'Hours':<5} | {'Status':<6} | {'Description'}")
    print("=" * 105)
    for item, status, _ in plan:
        desc_preview = (item["task_description"][:45] + "...") if len(item["task_description"]) > 45 else item["task_description"]
        print(f"{item['date']:<11} | {item['client_project']:<38} | {item['hours']:<5.2f} | {status:<6} | {desc_preview}")
    print("-" * 105)

    print("\nPer-Day Hours Summary:")
    for d in dates:
        exist_h = round(sum(float(x.get("hours_utilized") or 0) for x in existing_by_date[d]), 2)
        new_h = round(sum(doc["hours_utilized"] for doc in new_docs if doc["date"] == d), 2)
        print(f"  {d}: Existing Logged = {exist_h:4.2f}h | New Planned = {new_h:4.2f}h | Total Projected = {(exist_h + new_h):4.2f}h")

    # 5. Apply branch
    if not args.apply:
        print(f"\n[DRY RUN] {len(new_docs)} new entries to insert ({len(plan) - len(new_docs)} skipped).")
        print("Run with --apply to write to the database.")
        client.close()
        return

    if not new_docs:
        print("\nAll candidate entries already exist. Nothing to insert.")
        client.close()
        return

    # Strict interactive confirmation
    if not args.yes:
        print(f"\n[APPLY MODE] Target Database: '{db_name}'")
        confirm = input(f"Type '{db_name}' to confirm insertion: ").strip()
        if confirm != db_name:
            print("Confirmation mismatch. Aborting without writing.")
            client.close()
            return

    # Insert only
    inserted_ids = []
    for doc in new_docs:
        await db.daily_log_entries.insert_one(doc)
        inserted_ids.append(doc["id"])
    print(f"\nSuccessfully inserted {len(inserted_ids)} records: {inserted_ids}")

    # Recompute daily log day scores
    from app.services.log_compliance import recompute_day_score
    from app.core.tenant import tenant_scope

    affected_dates = sorted(list(set(doc["date"] for doc in new_docs)))
    with tenant_scope(company_id=cid or "company_reamarc", user_id=user_id):
        for d in affected_dates:
            try:
                score = await recompute_day_score(user_id, d, actor=user)
                st = score.get("status") if score else "None"
                lh = score.get("logged_hours") if score else "None"
                print(f"  Day Score updated for {d}: status={st}, logged_hours={lh}")
            except Exception as exc:
                print(f"  Day Score recompute notice for {d}: {exc}")

    print("\nDone.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
