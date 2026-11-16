"""
One-off script to add October 2026 Daily Log entries for Sibat Sajjad in reamarc_db.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sys
import uuid

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

OCT_ENTRIES = [
    # 17 Oct
    {"date": "2026-10-17", "client_project": "Reamarc", "hours": 2.5, "task_description": "Multi-company setup, phases 1 to 5"},
    {"date": "2026-10-17", "client_project": "Reamarc", "hours": 0.8, "task_description": "Fixed companies overwriting each other's data"},
    {"date": "2026-10-17", "client_project": "Reamarc", "hours": 0.6, "task_description": "Fixed WhatsApp video previews"},

    # 19 Oct
    {"date": "2026-10-19", "client_project": "Reamarc", "hours": 0.8, "task_description": "Blocked cross-company profile edits and kept stored files separate per company"},
    {"date": "2026-10-19", "client_project": "Reamarc", "hours": 1.4, "task_description": "Fixed stage visibility and department names"},

    # 20 Oct
    {"date": "2026-10-20", "client_project": "Reamarc", "hours": 2.0, "task_description": "Multi-company round 2 and owner console redesign"},
    {"date": "2026-10-20", "client_project": "Reamarc", "hours": 1.8, "task_description": "Client logos and full-page client form"},
    {"date": "2026-10-20", "client_project": "Reamarc", "hours": 1.5, "task_description": "Staff proposal view and download"},
    {"date": "2026-10-20", "client_project": "Reamarc", "hours": 1.2, "task_description": "Stage access fix"},
    {"date": "2026-10-20", "client_project": "Reamarc", "hours": 1.0, "task_description": "Proposal download fix"},
    {"date": "2026-10-20", "client_project": "Reamarc", "hours": 1.0, "task_description": "Attendance permission changes"},
    {"date": "2026-10-20", "client_project": "Reamarc", "hours": 0.8, "task_description": "Client review downloads and platform icons"},
    {"date": "2026-10-20", "client_project": "Reamarc", "hours": 0.5, "task_description": "Profile photo"},

    # 21 Oct
    {"date": "2026-10-21", "client_project": "Reamarc", "hours": 1.2, "task_description": "Review download rules"},
    {"date": "2026-10-21", "client_project": "Reamarc", "hours": 1.5, "task_description": "Video playback fixes"},
    {"date": "2026-10-21", "client_project": "Reamarc", "hours": 1.5, "task_description": "Owner console branding"},
    {"date": "2026-10-21", "client_project": "Reamarc", "hours": 1.5, "task_description": "Kept each company's settings separate"},
    {"date": "2026-10-21", "client_project": "Reamarc", "hours": 1.0, "task_description": "Staging merges and preview caching"},

    # 22 Oct
    {"date": "2026-10-22", "client_project": "Reamarc", "hours": 4.0, "task_description": "Live multi-company hotfixes"},
    {"date": "2026-10-22", "client_project": "Reamarc", "hours": 2.0, "task_description": "Per-company database rules and setup"},
    {"date": "2026-10-22", "client_project": "Reamarc", "hours": 1.3, "task_description": "Video streaming and sign-in loading hang fix"},
    {"date": "2026-10-22", "client_project": "Reamarc", "hours": 1.0, "task_description": "Content calendar preview fix"},
    {"date": "2026-10-22", "client_project": "Reamarc", "hours": 0.5, "task_description": "Removed ghost memberships"},

    # 23 Oct
    {"date": "2026-10-23", "client_project": "Reamarc", "hours": 1.5, "task_description": "Fixed sessions dropping after access changes, with tests"},
    {"date": "2026-10-23", "client_project": "Reamarc", "hours": 1.5, "task_description": "Video thumbnails for WhatsApp and calendar previews"},
    {"date": "2026-10-23", "client_project": "Reamarc", "hours": 1.2, "task_description": "Edge-case fixes, such as a login limit per IP and a 100MB upload cap"},
    {"date": "2026-10-23", "client_project": "Reamarc", "hours": 1.2, "task_description": "Client portal video stills and scheduler"},

    # 24 Oct
    {"date": "2026-10-24", "client_project": "Reamarc", "hours": 1.5, "task_description": "Deactivated member history and timesheet picker"},
    {"date": "2026-10-24", "client_project": "Reamarc", "hours": 1.2, "task_description": "Relaxed attendance days"},
    {"date": "2026-10-24", "client_project": "Reamarc", "hours": 1.0, "task_description": "Review links and Drive downloads"},
    {"date": "2026-10-24", "client_project": "Reamarc", "hours": 1.0, "task_description": "Started the finance module"},
    {"date": "2026-10-24", "client_project": "Reamarc", "hours": 0.8, "task_description": "Notifications and dark-mode UX"},

    # 26 Oct
    {"date": "2026-10-26", "client_project": "Reamarc", "hours": 0.6, "task_description": "Finance fixes and merge"},
    {"date": "2026-10-26", "client_project": "Reamarc", "hours": 0.5, "task_description": "Branded finance report PDFs"},
    {"date": "2026-10-26", "client_project": "Reamarc", "hours": 0.3, "task_description": "Accounts limited to admin and operations"},

    # 30 Oct
    {"date": "2026-10-30", "client_project": "Reamarc", "hours": 1.5, "task_description": "Finance invoice dates, editing and public links"},
    {"date": "2026-10-30", "client_project": "Reamarc", "hours": 0.8, "task_description": "Attendance duplicate check-out fix"},
    {"date": "2026-10-30", "client_project": "Reamarc", "hours": 0.7, "task_description": "New Project for website team leads"},
    {"date": "2026-10-30", "client_project": "PropertyERP", "hours": 4.5, "task_description": "Properties, units, pricing and inventory"},

    # 31 Oct
    {"date": "2026-10-31", "client_project": "Reamarc", "hours": 2.0, "task_description": "Performance and load-time work"},
    {"date": "2026-10-31", "client_project": "Reamarc", "hours": 0.8, "task_description": "Daily-log export"},
    {"date": "2026-10-31", "client_project": "Reamarc", "hours": 0.6, "task_description": "Attendance hours from actual check-in"},
    {"date": "2026-10-31", "client_project": "Reamarc", "hours": 0.5, "task_description": "First-load loader"},
]


async def ensure_property_erp_workspace(db, company_id, user_id):
    """Ensure PropertyERP workspace exists so it appears cleanly in dropdowns and filters."""
    ws = await db.workspaces.find_one({"company_id": company_id, "name": "PropertyERP"})
    if not ws:
        now_iso = datetime.now(timezone.utc).isoformat()
        new_ws = {
            "id": f"ws-{uuid.uuid4().hex[:8]}",
            "name": "PropertyERP",
            "company_id": company_id,
            "initials": "PE",
            "brandColor": "#059669",
            "brand_color": "#059669",
            "brandGuidelines": "",
            "brand_guidelines": "",
            "status": "active",
            "priority": "Medium",
            "project_cycle": "Retainer",
            "health": "Good",
            "services": ["Website Design and Development", "Website Maintenance and Support"],
            "created_at": now_iso,
            "updated_at": now_iso,
            "user_id": user_id,
        }
        await db.workspaces.insert_one(new_ws)
        print(f"Created PropertyERP workspace: {new_ws['id']}")


async def main():
    parser = argparse.ArgumentParser(description="Add October 2026 daily logs for Sibat Sajjad")
    parser.add_argument("--apply", action="store_true", help="Apply insertions to the database")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    assert len(OCT_ENTRIES) == 43, f"Expected 43 entries, got {len(OCT_ENTRIES)}"

    db_name = getattr(settings, "MONGODB_DB_NAME", "") or ""
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[db_name]

    from app.database import db_instance
    db_instance.client = client
    db_instance.db = db

    users = await db.users.find({
        "$or": [
            {"name": {"$regex": r"sib+at\s*saj+ad", "$options": "i"}},
            {"full_name": {"$regex": r"sib+at\s*saj+ad", "$options": "i"}},
            {"email": {"$regex": r"sibat", "$options": "i"}},
        ]
    }).to_list(10)

    if len(users) != 1:
        print(f"Error: Expected exactly 1 match for Sibat Sajjad, found {len(users)} in '{db_name}'")
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

    # Ensure PropertyERP workspace exists
    if args.apply:
        await ensure_property_erp_workspace(db, cid or "company_reamarc", user_id)

    dates = sorted(list(set(e["date"] for e in OCT_ENTRIES)))
    existing_by_date = {}
    for d in dates:
        existing = await db.daily_log_entries.find({"user_id": user_id, "date": d}).to_list(100)
        existing_by_date[d] = existing

    now_iso = datetime.now(timezone.utc).isoformat()
    plan = []
    new_docs = []

    for item in OCT_ENTRIES:
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
            "month_sheet": "October - 2026",
            "custom_fields": None,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        if cid:
            doc["company_id"] = cid

        plan.append((item, status, doc))
        if not is_dup:
            new_docs.append(doc)

    print("\n" + "=" * 105)
    print(f"{'Date':<11} | {'Client':<20} | {'Hours':<5} | {'Status':<6} | {'Description'}")
    print("=" * 105)
    for item, status, _ in plan:
        desc_preview = (item["task_description"][:60] + "...") if len(item["task_description"]) > 60 else item["task_description"]
        print(f"{item['date']:<11} | {item['client_project']:<20} | {item['hours']:<5.2f} | {status:<6} | {desc_preview}")
    print("-" * 105)

    print("\nPer-Day Hours Summary:")
    for d in dates:
        exist_h = round(sum(float(x.get("hours_utilized") or 0) for x in existing_by_date[d]), 2)
        new_h = round(sum(doc["hours_utilized"] for doc in new_docs if doc["date"] == d), 2)
        print(f"  {d}: Existing Logged = {exist_h:4.2f}h | New Planned = {new_h:4.2f}h | Total Projected = {(exist_h + new_h):4.2f}h")

    if not args.apply:
        print(f"\n[DRY RUN] {len(new_docs)} new entries to insert ({len(plan) - len(new_docs)} skipped).")
        print("Run with --apply to write to the database.")
        client.close()
        return

    if not new_docs:
        print("\nAll candidate entries already exist. Nothing to insert.")
        client.close()
        return

    if not args.yes:
        confirm = input(f"Type '{db_name}' to confirm insertion: ").strip()
        if confirm != db_name:
            print("Confirmation mismatch. Aborting.")
            client.close()
            return

    inserted_ids = []
    for doc in new_docs:
        await db.daily_log_entries.insert_one(doc)
        inserted_ids.append(doc["id"])
    print(f"\nSuccessfully inserted {len(inserted_ids)} records for Sibat Sajjad (October 2026): {inserted_ids}")

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

    print("\nDone Sibat October logs.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
