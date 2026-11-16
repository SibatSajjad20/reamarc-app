"""
Script to add Daily Log entries for Salman Tahir in reamarc_db.
Dry-run by default. Use --apply to execute insertion.
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

SALMAN_ENTRIES = [
    # 3-10-26 (2026-10-03)
    {
        "date": "2026-10-03",
        "month_sheet": "October - 2026",
        "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall",
        "task_description": "sardar mall: animated post",
        "hours": 0.5,
    },
    {
        "date": "2026-10-03",
        "month_sheet": "October - 2026",
        "client_project": "SP Builders",
        "task_description": "sm builders: reel added (orion)",
        "hours": 0.5,
    },
    {
        "date": "2026-10-03",
        "month_sheet": "October - 2026",
        "client_project": "Apex Transfers",
        "task_description": "apex transfers: product page added",
        "hours": 2.0,
    },
    {
        "date": "2026-10-03",
        "month_sheet": "October - 2026",
        "client_project": "Northwoods Retreat",
        "task_description": "northwoods retreat: static post added",
        "hours": 0.5,
    },
    {
        "date": "2026-10-03",
        "month_sheet": "October - 2026",
        "client_project": "Frame Lines  Builders",
        "task_description": "frame line builders: static post added",
        "hours": 0.5,
    },
    {
        "date": "2026-10-03",
        "month_sheet": "October - 2026",
        "client_project": "Mr Uzair Client Karachi",
        "task_description": "mr uzair client karachi: reel added",
        "hours": 0.5,
    },
    # 4-10-26 (2026-10-04)
    {
        "date": "2026-10-04",
        "month_sheet": "October - 2026",
        "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall",
        "task_description": "sardar mall: static post",
        "hours": 0.5,
    },
    {
        "date": "2026-10-04",
        "month_sheet": "October - 2026",
        "client_project": "Frame Lines  Builders",
        "task_description": "frame line builders: static post",
        "hours": 0.5,
    },
    {
        "date": "2026-10-04",
        "month_sheet": "October - 2026",
        "client_project": "Northwoods Retreat",
        "task_description": "northwoods retreat: static post",
        "hours": 0.5,
    },
    {
        "date": "2026-10-04",
        "month_sheet": "October - 2026",
        "client_project": "ZEM Bulider",
        "task_description": "zem builder: static post",
        "hours": 0.5,
    },
    {
        "date": "2026-10-04",
        "month_sheet": "October - 2026",
        "client_project": "Apex Transfers",
        "task_description": "apex transfers: product pages added",
        "hours": 2.0,
    },
    # 6-11-26 (2026-11-06)
    {
        "date": "2026-11-06",
        "month_sheet": "November - 2026",
        "client_project": "ASSH  Developers  Pvt. Ltd/ Sardar Mall",
        "task_description": "sardar mall: allama iqbal post",
        "hours": 0.5,
    },
    {
        "date": "2026-11-06",
        "month_sheet": "November - 2026",
        "client_project": "ZEM Bulider",
        "task_description": "zem builder: jumma post",
        "hours": 0.5,
    },
    {
        "date": "2026-11-06",
        "month_sheet": "November - 2026",
        "client_project": "Reamarc",
        "task_description": "reamarc: allama iqbal post",
        "hours": 0.5,
    },
    {
        "date": "2026-11-06",
        "month_sheet": "November - 2026",
        "client_project": "Frame Lines  Builders",
        "task_description": "frame line builders: allama iqbal post",
        "hours": 0.5,
    },
    {
        "date": "2026-11-06",
        "month_sheet": "November - 2026",
        "client_project": "SP Builders",
        "task_description": "sm builders: allama iqbal post",
        "hours": 0.5,
    },
    {
        "date": "2026-11-06",
        "month_sheet": "November - 2026",
        "client_project": "DataViz",
        "task_description": "dataviz: pages data updated",
        "hours": 1.0,
    },
]


async def main():
    parser = argparse.ArgumentParser(description="Add daily logs for Salman Tahir")
    parser.add_argument("--apply", action="store_true", help="Apply insertions to the database")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    db_name = getattr(settings, "MONGODB_DB_NAME", "") or ""
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[db_name]

    from app.database import db_instance
    db_instance.client = client
    db_instance.db = db

    users = await db.users.find({
        "$or": [
            {"name": {"$regex": "salman", "$options": "i"}},
            {"full_name": {"$regex": "salman", "$options": "i"}},
            {"email": {"$regex": "salman", "$options": "i"}},
        ]
    }).to_list(10)

    if len(users) != 1:
        print(f"Error: Expected 1 match for Salman, found {len(users)} in {db_name}")
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

    dates = ["2026-10-03", "2026-10-04", "2026-11-06"]
    existing_by_date = {}
    for d in dates:
        existing = await db.daily_log_entries.find({"user_id": user_id, "date": d}).to_list(100)
        existing_by_date[d] = existing

    now_iso = datetime.now(timezone.utc).isoformat()
    plan = []
    new_docs = []

    for item in SALMAN_ENTRIES:
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
            "task_status": "Completed",
            "revisions_done": "",
            "deliverables": "",
            "hours_utilized": float(item["hours"]),
            "remarks": "",
            "start_time": None,
            "end_time": None,
            "estimated_hours": None,
            "variance_reason": None,
            "month_sheet": item["month_sheet"],
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
    print(f"{'Date':<11} | {'Client':<38} | {'Hours':<5} | {'Status':<6} | {'Description'}")
    print("=" * 105)
    for item, status, _ in plan:
        print(f"{item['date']:<11} | {item['client_project']:<38} | {item['hours']:<5.2f} | {status:<6} | {item['task_description']}")
    print("-" * 105)

    if not args.apply:
        print(f"\n[DRY RUN] {len(new_docs)} new entries to insert.")
        client.close()
        return

    if not new_docs:
        print("Nothing new to insert.")
        client.close()
        return

    if not args.yes:
        confirm = input(f"Type '{db_name}' to confirm insertion: ").strip()
        if confirm != db_name:
            print("Aborting.")
            client.close()
            return

    inserted_ids = []
    for doc in new_docs:
        await db.daily_log_entries.insert_one(doc)
        inserted_ids.append(doc["id"])
    print(f"\nSuccessfully inserted {len(inserted_ids)} records for Salman Tahir: {inserted_ids}")

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

    print("\nDone Salman logs.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
