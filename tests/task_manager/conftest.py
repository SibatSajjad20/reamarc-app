"""Shared fixtures for Task Manager tests. Local mongomock / reamarc_test_db only."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault("MONGODB_DB_NAME", "reamarc_test_db")


def user(uid: str, role: str, dept: str = "", **extra):
    doc = {
        "id": uid,
        "email": f"{uid}@tm-test.com",
        "full_name": uid.replace(".", " ").title(),
        "name": uid.replace(".", " ").title(),
        "role": role,
        "is_active": True,
        "primary_department": dept,
        "department": dept,
        "departments": [dept] if dept else [],
    }
    doc.update(extra)
    return doc


ADMIN = user("admin", "admin")
LEAD_CONTENT = user("lead.content", "team_lead", "Content")
MEMBER_C1 = user("member.content1", "team_member", "Content")
MEMBER_C2 = user("member.content2", "team_member", "Content")
LEAD_WEB = user("lead.web", "team_lead", "Website")
MEMBER_WEB = user("member.web", "team_member", "Website")
HR = user("hr", "hr", "HR")
OPS = user("ops", "operations")
MEMBER_HR = user("member.hr", "team_member", "HR")
LEAD_SEO = user("lead.seo", "team_lead", "SEO")
OTHER_LEAD = user("other.lead", "team_lead", "Content", company_id="tm_other_co", email="other.lead@tm-test.com")


def task_doc(**kwargs):
    base = {
        "id": "tsk_test1",
        "serial": "T-0001",
        "title": "Test task",
        "status": "todo",
        "priority": "medium",
        "creator_id": LEAD_CONTENT["id"],
        "assigner_id": LEAD_CONTENT["id"],
        "assignee_id": MEMBER_C1["id"],
        "department": "Content",
        "involved_ids": [LEAD_CONTENT["id"], MEMBER_C1["id"]],
        "assignment_chain": [
            {
                "from_id": LEAD_CONTENT["id"],
                "from_name": "Lead Content",
                "to_id": MEMBER_C1["id"],
                "to_name": "Member Content1",
                "department": "Content",
            }
        ],
        "watcher_ids": [],
        "blocked": False,
        "checklist": [],
    }
    base.update(kwargs)
    return base
