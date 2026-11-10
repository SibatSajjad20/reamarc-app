"""Seed local Task Manager walkthrough users + tasks.

Refuses any database other than local reamarc_test_db.
Password for every seeded user: 12345678
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


PASSWORD = "12345678"
DB_NAME = "reamarc_test_db"
KARACHI = ZoneInfo("Asia/Karachi")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


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


def _refuse() -> tuple[str, str]:
    uri = os.environ.get("MONGODB_URL") or "mongodb://localhost:27017"
    db_name = os.environ.get("MONGODB_DB_NAME") or DB_NAME
    env = str(os.environ.get("ENVIRONMENT") or "").strip().lower()
    hosts = _hosts(uri)
    if env == "production" or db_name != DB_NAME or not hosts or any(h not in LOCAL_HOSTS for h in hosts):
        print("[ERROR] Refusing to seed. Only localhost/127.0.0.1/::1 + reamarc_test_db is allowed.", file=sys.stderr)
        sys.exit(1)
    return uri, db_name


def main() -> None:
    uri, db_name = _refuse()
    from pymongo import MongoClient
    from app.core.security import get_password_hash

    hashed = get_password_hash(PASSWORD)
    today = datetime.now(KARACHI).date()
    client = MongoClient(uri)
    db = client[db_name]

    companies = [
        {"id": "company_reamarc", "slug": "reamarc", "name": "Reamarc (test)", "status": "active", "timezone": "Asia/Karachi"},
        {"id": "tm_other_co", "slug": "tm-other", "name": "Other Co (test)", "status": "active", "timezone": "Asia/Karachi"},
    ]
    for company in companies:
        db.companies.update_one({"id": company["id"]}, {"$set": {**company, "_id": company["id"]}}, upsert=True)

    people = [
        {"id": "usr_tm_admin", "email": "admin@tm-test.com", "role": "admin", "primary_department": "", "full_name": "TM Admin"},
        {"id": "usr_tm_lead_content", "email": "lead.content@tm-test.com", "role": "team_lead", "primary_department": "Content", "full_name": "Lead Content"},
        {"id": "usr_tm_member_c1", "email": "member.content1@tm-test.com", "role": "team_member", "primary_department": "Content", "full_name": "Member Content 1"},
        {"id": "usr_tm_member_c2", "email": "member.content2@tm-test.com", "role": "team_member", "primary_department": "Content", "full_name": "Member Content 2"},
        {"id": "usr_tm_lead_web", "email": "lead.web@tm-test.com", "role": "team_lead", "primary_department": "Website", "full_name": "Lead Web"},
        {"id": "usr_tm_member_web", "email": "member.web@tm-test.com", "role": "team_member", "primary_department": "Website", "full_name": "Member Web"},
        {"id": "usr_tm_lead_seo", "email": "lead.seo@tm-test.com", "role": "team_lead", "primary_department": "SEO", "full_name": "Lead SEO"},
        {"id": "usr_tm_hr", "email": "hr@tm-test.com", "role": "hr", "primary_department": "HR", "full_name": "HR User"},
        {"id": "usr_tm_ops", "email": "ops@tm-test.com", "role": "operations", "primary_department": "", "full_name": "Ops User"},
        {"id": "usr_tm_member_hr", "email": "member.hr@tm-test.com", "role": "team_member", "primary_department": "HR", "full_name": "Member HR"},
    ]

    for person in people:
        dept = person["primary_department"]
        doc = {
            **person,
            "name": person["full_name"],
            "hashed_password": hashed,
            "is_active": True,
            "department": dept,
            "departments": [dept] if dept else [],
            "company_id": "company_reamarc",
        }
        db.users.update_one({"email": person["email"]}, {"$set": doc}, upsert=True)

    other_lead = {
        "id": "usr_tm_other_lead",
        "email": "other.lead@tm-test.com",
        "role": "team_lead",
        "primary_department": "Content",
        "full_name": "Other Lead",
        "name": "Other Lead",
        "hashed_password": hashed,
        "is_active": True,
        "department": "Content",
        "departments": ["Content"],
        "company_id": "tm_other_co",
    }
    db.users.update_one({"email": other_lead["email"]}, {"$set": other_lead}, upsert=True)

    db.task_settings.update_one(
        {"_id": "task_settings"},
        {"$set": {"excluded_roles": ["hr", "operations"], "excluded_departments": ["HR"], "sla": {"urgent_hours": 24}}},
        upsert=True,
    )

    lc = "usr_tm_lead_content"
    mc1 = "usr_tm_member_c1"
    mc2 = "usr_tm_member_c2"
    lw = "usr_tm_lead_web"
    mw = "usr_tm_member_web"
    names = {p["id"]: p["full_name"] for p in people}
    names[other_lead["id"]] = other_lead["full_name"]

    def hop(frm, to, dept, name_from, name_to):
        return {"from_id": frm, "from_name": name_from, "to_id": to, "to_name": name_to, "department": dept, "at": datetime.now(KARACHI).isoformat()}

    def tsk(i, title, status, assignee, assigner, dept, due_offset, extra=None, company_id="company_reamarc"):
        due = (today + timedelta(days=due_offset)).isoformat() if due_offset is not None else None
        involved = list({assigner, assignee})
        doc = {
            "id": f"tsk_seed_{i:02d}",
            "company_id": company_id,
            "serial": f"T-{i:04d}",
            "title": title,
            "description": title,
            "status": status,
            "priority": "medium",
            "blocked": False,
            "creator_id": assigner,
            "creator_name": names.get(assigner, assigner),
            "assignee_id": assignee,
            "assignee_name": names.get(assignee, assignee),
            "assigner_id": assigner,
            "assigner_name": names.get(assigner, assigner),
            "department": dept,
            "assignment_chain": [hop(assigner, assignee, dept, names.get(assigner, assigner), names.get(assignee, assignee))],
            "involved_ids": involved,
            "watcher_ids": [],
            "due_date": due,
            "due_time": None,
            "progress": 0,
            "checklist": [],
            "attachments_count": 0,
            "comments_count": 0,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        if extra:
            doc.update(extra)
        return doc

    tasks = [
        tsk(1, "Overdue content brief", "todo", mc1, lc, "Content", -3),
        tsk(2, "Overdue website QA", "in_progress", mw, lw, "Website", -2),
        tsk(3, "Overdue peer review", "in_review", mc2, lc, "Content", -1),
        tsk(4, "Due today copy pass", "todo", mc1, lc, "Content", 0),
        tsk(5, "Due today web polish", "in_progress", mw, lw, "Website", 0),
        tsk(6, "Upcoming landing outline", "todo", mc2, lc, "Content", 2),
        tsk(7, "Upcoming homepage hero", "todo", lw, lc, "Website", 3),
        tsk(8, "Upcoming SEO checklist", "in_progress", mc1, lc, "Content", 5),
        tsk(9, "Weekly report", "todo", mc1, lc, "Content", 1, extra={"recurrence": {"freq": "weekly", "interval": 1}}),
        tsk(10, "Blocked asset request", "in_progress", mc2, lc, "Content", 4, extra={"blocked": True, "blocked_reason": "Waiting on brand kit"}),
        tsk(11, "Completed style guide", "completed", mc1, lc, "Content", -4),
        tsk(12, "In review homepage copy", "in_review", mw, lw, "Website", 1),
        tsk(
            13,
            "Other company task",
            "todo",
            other_lead["id"],
            other_lead["id"],
            "Content",
            1,
            company_id="tm_other_co",
        ),
    ]
    for task in tasks:
        db.tasks.update_one({"id": task["id"]}, {"$set": task}, upsert=True)

    db.task_counters.update_one({"_id": "task_serial"}, {"$set": {"seq": 13}}, upsert=True)
    print(f"Seeded {len(people) + 1} users and {len(tasks)} tasks into {db_name}. Password: {PASSWORD}")
    client.close()


if __name__ == "__main__":
    main()
