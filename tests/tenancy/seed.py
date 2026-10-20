"""
tests/tenancy/seed.py
Seeds test fixtures prefixed with tnt_ for multi-tenant verification:
- Company A: "Reamarc" (id: tnt_comp_a, active)
- Company B: "Sample Co" (id: tnt_comp_b, active)
- Company C: "Sample Two" (id: tnt_comp_c, suspended)

Each company has:
- 4 users (admin, team_lead, team_member, operations)
- workspace, shifts, holidays, attendance, leaves, logs, CRM leads/deals/ingest,
  website project, content items, ad accounts, notifications, devices,
  and integration secrets (TNT_SECRET_A_..., TNT_SECRET_B_...).
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from typing import Any, Dict, List
import pymongo
from app.core.security import get_password_hash

COMPANIES_SEED = [
    {
        "_id": "tnt_comp_a",
        "id": "tnt_comp_a",
        "name": "Reamarc",
        "slug": "tnt-reamarc",
        "logo_url": "https://example.com/logo-a.png",
        "accent_color": "#6847E0",
        "timezone": "Asia/Karachi",
        "week_start": "Monday",
        "status": "active",
        "token_version": 0,
        "plan": "pro",
        "limits": {"max_users": 50},
        "custom_domain": None,
        "created_at": datetime.now(timezone.utc),
        "created_by": "system",
    },
    {
        "_id": "tnt_comp_b",
        "id": "tnt_comp_b",
        "name": "Sample Co",
        "slug": "sample-co",
        "logo_url": "https://example.com/logo-b.png",
        "accent_color": "#00AA66",
        "timezone": "America/New_York",
        "week_start": "Monday",
        "status": "active",
        "token_version": 0,
        "plan": "pro",
        "limits": {"max_users": 50},
        "custom_domain": None,
        "created_at": datetime.now(timezone.utc),
        "created_by": "system",
    },
    {
        "_id": "tnt_comp_c",
        "id": "tnt_comp_c",
        "name": "Sample Two",
        "slug": "sample-two",
        "logo_url": "https://example.com/logo-c.png",
        "accent_color": "#DC2626",
        "timezone": "Europe/London",
        "week_start": "Monday",
        "status": "suspended",
        "token_version": 0,
        "plan": "free",
        "limits": {"max_users": 10},
        "custom_domain": None,
        "created_at": datetime.now(timezone.utc),
        "created_by": "system",
    },
]

ROLES = ["admin", "team_lead", "team_member", "operations"]

def get_suffix(cid: str) -> str:
    return cid.replace("tnt_comp_", "")

def build_seed_data() -> Dict[str, List[Dict[str, Any]]]:
    hashed_pwd = get_password_hash("Secret123!")
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    
    data: Dict[str, List[Dict[str, Any]]] = {
        "companies": COMPANIES_SEED,
        "users": [],
        "workspaces": [],
        "shifts": [],
        "company_calendar": [],
        "attendance_records": [],
        "leave_requests": [],
        "leave_balances": [],
        "daily_log_columns": [],
        "daily_log_entries": [],
        "crm_leads": [],
        "crm_deals": [],
        "crm_ingest_sources": [],
        "crm_scheduler_settings": [],
        "website_projects": [],
        "content_calendar_items": [],
        "ad_accounts": [],
        "ad_account_credentials": [],
        "notifications": [],
        "mobile_devices": [],
        "company_integrations": [],
    }

    for comp in COMPANIES_SEED:
        cid = comp["id"]
        sfx = get_suffix(cid)
        sfx_upper = sfx.upper()

        # Users
        for r in ROLES:
            data["users"].append({
                "_id": f"tnt_user_{sfx}_{r}",
                "id": f"tnt_user_{sfx}_{r}",
                "email": f"{r}_{sfx}@tnt-example.com",
                "name": f"{r.title()} {sfx_upper}",
                "role": r,
                "hashed_password": hashed_pwd,
                "is_active": True,
                "is_super_admin": False,
                "company_id": cid,
                "token_version": 0,
                "department": "Operations" if r == "operations" else "General",
                "primary_department": "Operations" if r == "operations" else "General",
                "departments": ["Operations" if r == "operations" else "General"],
                "designation": r.replace("_", " ").title(),
                "created_at": now_iso,
            })

        # Workspace
        data["workspaces"].append({
            "_id": f"tnt_ws_{sfx}",
            "id": f"tnt_ws_{sfx}",
            "name": f"Workspace {sfx_upper}",
            "company_id": cid,
            "status": "active",
            "initials": f"W{sfx_upper}",
            "brandColor": "bg-indigo-600",
            "project_cycle": "Retainer",
            "priority": "Medium",
            "health": "Good",
            "guidelines_text": f"Guidelines for {sfx_upper}",
            "public_review_token": f"tnt_rev_token_{sfx}",
            "created_at": now_iso,
        })

        # Shift
        data["shifts"].append({
            "_id": f"tnt_shift_{sfx}",
            "id": f"tnt_shift_{sfx}",
            "name": f"Shift 9-6 {sfx_upper}",
            "company_id": cid,
            "start_time": "09:00",
            "end_time": "18:00",
            "grace_period_minutes": 15,
            "is_active": True,
            "created_at": now_iso,
        })

        # Company Calendar (Holiday)
        data["company_calendar"].append({
            "_id": f"tnt_holiday_{sfx}",
            "id": f"tnt_holiday_{sfx}",
            "company_id": cid,
            "title": f"Holiday {sfx_upper}",
            "name": f"Holiday {sfx_upper}",
            "date": "2026-12-25",
            "type": "holiday",
            "event_type": "holiday",
            "is_recurring": False,
        })

        # Attendance
        data["attendance_records"].append({
            "_id": f"tnt_att_{sfx}",
            "id": f"tnt_att_{sfx}",
            "company_id": cid,
            "user_id": f"tnt_user_{sfx}_team_member",
            "date": "2026-10-15",
            "punch_in": "2026-10-15T09:05:00Z",
            "punch_out": "2026-10-15T18:00:00Z",
            "status": "present",
            "work_arrangement": "office",
        })

        # Leave
        data["leave_requests"].append({
            "_id": f"tnt_leave_{sfx}",
            "id": f"tnt_leave_{sfx}",
            "company_id": cid,
            "user_id": f"tnt_user_{sfx}_team_member",
            "leave_type": "annual",
            "start_date": "2026-11-01",
            "end_date": "2026-11-02",
            "status": "approved",
            "reason": f"Vacation {sfx_upper}",
        })
        data["leave_balances"].append({
            "_id": f"tnt_bal_{sfx}",
            "id": f"tnt_bal_{sfx}",
            "company_id": cid,
            "user_id": f"tnt_user_{sfx}_team_member",
            "year": 2026,
            "annual_quota": 14,
            "annual_used": 2,
            "sick_quota": 8,
            "sick_used": 1,
        })

        # Daily Log
        data["daily_log_columns"].append({
            "_id": f"tnt_cols_{sfx}",
            "id": f"tnt_cols_{sfx}",
            "company_id": cid,
            "workspace_id": f"tnt_ws_{sfx}",
            "columns": [{"key": "task", "label": "Task"}, {"key": "hours", "label": "Hours"}],
        })
        data["daily_log_entries"].append({
            "_id": f"tnt_log_{sfx}",
            "id": f"tnt_log_{sfx}",
            "company_id": cid,
            "workspace_id": f"tnt_ws_{sfx}",
            "user_id": f"tnt_user_{sfx}_team_member",
            "date": "2026-10-15",
            "task": f"Completed work for {sfx_upper}",
            "hours": 6.0,
        })

        # CRM
        data["crm_leads"].append({
            "_id": f"tnt_lead_{sfx}",
            "id": f"tnt_lead_{sfx}",
            "company_id": cid,
            "name": f"Lead {sfx_upper}",
            "email": f"lead_{sfx}@target.test",
            "phone": "+1234567890",
            "stage": "new",
            "status": "active",
            "source": "manual",
            "created_at": now_iso,
        })
        data["crm_deals"].append({
            "_id": f"tnt_deal_{sfx}",
            "id": f"tnt_deal_{sfx}",
            "company_id": cid,
            "name": f"Deal {sfx_upper}",
            "value": 10000,
            "stage": "proposal",
            "lead_id": f"tnt_lead_{sfx}",
            "created_at": now_iso,
        })
        ingest_token = f"tnt_ingest_tok_{sfx}"
        data["crm_ingest_sources"].append({
            "_id": f"tnt_src_{sfx}",
            "id": f"tnt_src_{sfx}",
            "company_id": cid,
            "name": f"Ingest Source {sfx_upper}",
            "token": ingest_token,
            "token_hash": hashlib.sha256(ingest_token.encode("utf-8")).hexdigest(),
            "is_active": True,
            "enabled": True,
            "created_at": now_iso,
        })
        data["crm_scheduler_settings"].append({
            "_id": f"tnt_sched_{sfx}",
            "id": f"tnt_sched_{sfx}",
            "company_id": cid,
            "booking_link_slug": f"booking-{sfx}",
            "duration_minutes": 30,
            "is_active": True,
        })

        # Website
        data["website_projects"].append({
            "_id": f"tnt_web_{sfx}",
            "id": f"tnt_web_{sfx}",
            "company_id": cid,
            "name": f"Website Project {sfx_upper}",
            "domain": f"site-{sfx}.test",
            "status": "in_progress",
            "workspace_id": f"tnt_ws_{sfx}",
        })

        # Content Calendar
        data["content_calendar_items"].append({
            "_id": f"tnt_content_{sfx}",
            "id": f"tnt_content_{sfx}",
            "company_id": cid,
            "title": f"Content Post {sfx_upper}",
            "content_concept": f"Concept for {sfx_upper}",
            "workspace_id": f"tnt_ws_{sfx}",
            "client_name": f"Client {sfx_upper}",
            "scheduled_date": "2026-10-25",
            "publish_date": "2026-10-25",
            "status": "draft",
            "approval_status": "Content Draft",
            "stage": "Content",
            "content_type": "Scheduled",
            "creative_category": "Organic Creative",
            "share_token": f"tnt_rev_token_{sfx}",
            "created_at": now_iso,
            "updated_at": now_iso,
            "attachments": [],
        })

        # Ad accounts & credentials
        data["ad_accounts"].append({
            "_id": f"tnt_ad_{sfx}",
            "id": f"tnt_ad_{sfx}",
            "company_id": cid,
            "name": f"Ad Account {sfx_upper}",
            "platform": "meta",
            "account_id": f"act_100_{sfx}",
        })
        data["ad_account_credentials"].append({
            "_id": f"tnt_cred_{sfx}",
            "id": f"tnt_cred_{sfx}",
            "company_id": cid,
            "workspace_id": f"tnt_ws_{sfx}",
            "platform": "meta",
            "account_id": f"act_100_{sfx}",
            "access_token": f"TNT_SECRET_{sfx_upper}_AD_KEY",
        })

        # Notifications & Devices
        data["notifications"].append({
            "_id": f"tnt_notif_{sfx}",
            "id": f"tnt_notif_{sfx}",
            "company_id": cid,
            "user_id": f"tnt_user_{sfx}_team_member",
            "title": f"Notification {sfx_upper}",
            "message": f"Message for {sfx_upper}",
            "read": False,
            "created_at": now_iso,
        })
        data["mobile_devices"].append({
            "_id": f"tnt_dev_{sfx}",
            "id": f"tnt_dev_{sfx}",
            "company_id": cid,
            "user_id": f"tnt_user_{sfx}_team_member",
            "expo_push_token": f"ExponentPushToken[tnt_{sfx}_push]",
            "platform": "ios",
        })

        # Integrations
        data["company_integrations"].append({
            "_id": f"tnt_integ_{sfx}",
            "id": f"tnt_integ_{sfx}",
            "company_id": cid,
            "meta": {
                "page_id": f"meta_page_{sfx}",
                "page_access_token": f"TNT_SECRET_{sfx_upper}_META_TOKEN",
                "form_ids": [f"form_{sfx}_1"],
            },
            "smtp": {
                "host": "smtp.mailgun.org",
                "user": f"postmaster@{sfx}.example.com",
                "password": f"TNT_SECRET_{sfx_upper}_SMTP_KEY",
                "from_name": f"{sfx_upper} Notification",
                "from_email": f"no-reply@{sfx}.example.com",
            },
        })

    return data


def seed_tenancy_sync(uri: str, db_name: str) -> None:
    client = pymongo.MongoClient(uri)
    db = client[db_name]
    data = build_seed_data()
    for coll_name, docs in data.items():
        coll = db[coll_name]
        for doc in docs:
            coll.replace_one({"_id": doc["_id"]}, doc, upsert=True)
    client.close()


async def seed_tenancy_async(db: Any) -> None:
    data = build_seed_data()
    for coll_name, docs in data.items():
        coll = db[coll_name]
        for doc in docs:
            await coll.replace_one({"_id": doc["_id"]}, doc, upsert=True)


def clean_tenancy_sync(uri: str, db_name: str) -> None:
    client = pymongo.MongoClient(uri)
    db = client[db_name]
    data = build_seed_data()
    for coll_name, docs in data.items():
        ids = [doc["_id"] for doc in docs]
        db[coll_name].delete_many({"_id": {"$in": ids}})
    db.company_integrations.delete_many({"company_id": {"$in": ["tnt_comp_a", "tnt_comp_b", "tnt_comp_c"]}})
    db.owner_audit.delete_many({"target_company_id": {"$in": ["tnt_comp_a", "tnt_comp_b", "tnt_comp_c"]}})
    db.owner_sessions.delete_many({})
    db.rate_limit_counters.delete_many({})
    db.job_locks.delete_many({})
    try:
        from app.core.limiter import limiter
        limiter._storage.reset()
    except Exception:
        pass
    client.close()


async def clean_tenancy_async(db: Any) -> None:
    data = build_seed_data()
    for coll_name, docs in data.items():
        ids = [doc["_id"] for doc in docs]
        await db[coll_name].delete_many({"_id": {"$in": ids}})
    await db.company_integrations.delete_many({"company_id": {"$in": ["tnt_comp_a", "tnt_comp_b", "tnt_comp_c"]}})
    await db.owner_audit.delete_many({"target_company_id": {"$in": ["tnt_comp_a", "tnt_comp_b", "tnt_comp_c"]}})
    await db.owner_sessions.delete_many({})
    await db.rate_limit_counters.delete_many({})
    await db.job_locks.delete_many({})
    try:
        from app.core.limiter import limiter
        limiter._storage.reset()
    except Exception:
        pass
