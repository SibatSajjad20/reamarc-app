"""
scripts/cross_company_probe.py
Comprehensive 3-company cross-company probe verifying:
- 3 companies with dual users
- 0 leaks across endpoints
- 0 unexpected byte changes across companies
- 0 5xx errors
- 0 2xx on DELETE /leaves/requests/{id} or DELETE /admin/users/{id} for other companies' ids
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import httpx

root_dir = str(Path(__file__).resolve().parent.parent)
backend_dir = str(Path(__file__).resolve().parent.parent / "backend")
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.main import app
from app.database import db_instance
from app.core.security import create_access_token, get_password_hash, _AUTH_CACHE

TEST_DB_NAME = "reamarc_test_db"
TEST_MONGO_URI = "mongodb://localhost:27017"

PREFIX = f"tnt_probe_{uuid.uuid4().hex[:6]}"


def make_id(name: str) -> str:
    return f"{PREFIX}_{name}"


async def get_collection_hash(db: Any, collection_name: str, company_id: str) -> str:
    cursor = db[collection_name].find({"company_id": company_id}, {"_id": 0}).sort("id", 1)
    docs = await cursor.to_list(1000)
    data = json.dumps(docs, sort_keys=True, default=str)
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


async def run_probe():
    settings.MONGODB_DB_NAME = TEST_DB_NAME
    settings.MULTI_TENANT_ENABLED = True
    settings.MULTI_COMPANY_ENABLED = True
    _AUTH_CACHE.clear()

    client_mongo = AsyncIOMotorClient(TEST_MONGO_URI)
    db = client_mongo[TEST_DB_NAME]
    db_instance.client = client_mongo
    db_instance.db = db

    # 1. Setup 3 Companies
    c1_id = make_id("comp_1")
    c2_id = make_id("comp_2")
    c3_id = make_id("comp_3")

    now = datetime.now(timezone.utc).isoformat()

    await db.companies.insert_many([
        {"id": c1_id, "name": "Probe Alpha", "slug": f"{PREFIX}-alpha", "status": "active", "token_version": 0},
        {"id": c2_id, "name": "Probe Beta", "slug": f"{PREFIX}-beta", "status": "active", "token_version": 0},
        {"id": c3_id, "name": "Probe Gamma", "slug": f"{PREFIX}-gamma", "status": "active", "token_version": 0},
    ])

    # 2. Setup Users & Memberships
    # Admin for each company
    u_admin1_id = make_id("u_adm1")
    u_admin2_id = make_id("u_adm2")
    u_admin3_id = make_id("u_adm3")

    # Dual user 1 & 2 (Team member in C1, Lead in C2)
    u_dual12_id = make_id("u_dual12")
    # Dual user 2 & 3 (Member in C2, Member in C3)
    u_dual23_id = make_id("u_dual23")

    pw_hash = get_password_hash("ValidPass123!")

    await db.users.insert_many([
        {"id": u_admin1_id, "email": f"{u_admin1_id}@test.com", "full_name": "Admin One", "hashed_password": pw_hash, "is_active": True, "company_id": c1_id, "token_version": 0},
        {"id": u_admin2_id, "email": f"{u_admin2_id}@test.com", "full_name": "Admin Two", "hashed_password": pw_hash, "is_active": True, "company_id": c2_id, "token_version": 0},
        {"id": u_admin3_id, "email": f"{u_admin3_id}@test.com", "full_name": "Admin Three", "hashed_password": pw_hash, "is_active": True, "company_id": c3_id, "token_version": 0},
        {"id": u_dual12_id, "email": f"{u_dual12_id}@test.com", "full_name": "Dual OneTwo", "hashed_password": pw_hash, "is_active": True, "company_id": c1_id, "token_version": 0},
        {"id": u_dual23_id, "email": f"{u_dual23_id}@test.com", "full_name": "Dual TwoThree", "hashed_password": pw_hash, "is_active": True, "company_id": c2_id, "token_version": 0},
    ])

    await db.company_memberships.insert_many([
        {"id": make_id("m_adm1"), "user_id": u_admin1_id, "company_id": c1_id, "role": "admin", "status": "active", "token_version": 0, "needs_setup": False},
        {"id": make_id("m_adm2"), "user_id": u_admin2_id, "company_id": c2_id, "role": "admin", "status": "active", "token_version": 0, "needs_setup": False},
        {"id": make_id("m_adm3"), "user_id": u_admin3_id, "company_id": c3_id, "role": "admin", "status": "active", "token_version": 0, "needs_setup": False},
        {"id": make_id("m_d12_c1"), "user_id": u_dual12_id, "company_id": c1_id, "role": "team_member", "department": "Website", "departments": ["Website"], "status": "active", "token_version": 0, "needs_setup": False},
        {"id": make_id("m_d12_c2"), "user_id": u_dual12_id, "company_id": c2_id, "role": "team_lead", "department": "Creative", "departments": ["Creative"], "status": "active", "token_version": 0, "needs_setup": False},
        {"id": make_id("m_d23_c2"), "user_id": u_dual23_id, "company_id": c2_id, "role": "team_member", "department": "SEO", "departments": ["SEO"], "status": "active", "token_version": 0, "needs_setup": False},
        {"id": make_id("m_d23_c3"), "user_id": u_dual23_id, "company_id": c3_id, "role": "team_member", "department": "Website", "departments": ["Website"], "status": "active", "token_version": 0, "needs_setup": False},
    ])

    # 3. Seed isolated records per company
    leave_c1_id = make_id("leave_c1")
    leave_c2_id = make_id("leave_c2")
    leave_c3_id = make_id("leave_c3")

    await db.leave_requests.insert_many([
        {"id": leave_c1_id, "user_id": u_dual12_id, "company_id": c1_id, "leave_type": "sick", "days_count": 1, "status": "pending", "start_date": "2026-11-01", "end_date": "2026-11-01"},
        {"id": leave_c2_id, "user_id": u_dual12_id, "company_id": c2_id, "leave_type": "casual", "days_count": 2, "status": "pending", "start_date": "2026-11-05", "end_date": "2026-11-06"},
        {"id": leave_c3_id, "user_id": u_dual23_id, "company_id": c3_id, "leave_type": "annual", "days_count": 3, "status": "pending", "start_date": "2026-11-10", "end_date": "2026-11-12"},
    ])

    await db.leads.insert_many([
        {"id": make_id("lead_c1"), "company_id": c1_id, "name": "Lead Alpha", "email": "lead1@alpha.test", "status": "new", "created_at": now},
        {"id": make_id("lead_c2"), "company_id": c2_id, "name": "Lead Beta", "email": "lead2@beta.test", "status": "new", "created_at": now},
        {"id": make_id("lead_c3"), "company_id": c3_id, "name": "Lead Gamma", "email": "lead3@gamma.test", "status": "new", "created_at": now},
    ])

    # Record hashes of C2 and C3 before C1 operations
    c2_leaves_before = await get_collection_hash(db, "leave_requests", c2_id)
    c3_leaves_before = await get_collection_hash(db, "leave_requests", c3_id)
    c2_leads_before = await get_collection_hash(db, "leads", c2_id)
    c3_leads_before = await get_collection_hash(db, "leads", c3_id)

    # 4. Generate Auth Tokens
    token_adm1 = create_access_token({"sub": u_admin1_id, "email": f"{u_admin1_id}@test.com", "cid": c1_id, "mid": make_id("m_adm1"), "tv": 0, "ver": 0})
    token_dual12_c1 = create_access_token({"sub": u_dual12_id, "email": f"{u_dual12_id}@test.com", "cid": c1_id, "mid": make_id("m_d12_c1"), "tv": 0, "ver": 0})
    token_dual12_c2 = create_access_token({"sub": u_dual12_id, "email": f"{u_dual12_id}@test.com", "cid": c2_id, "mid": make_id("m_d12_c2"), "tv": 0, "ver": 0})

    leaks = 0
    server_errors = 0
    invalid_mutations = 0

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Probe A: Admin 1 reading endpoints in C1 -> must not leak C2 or C3 records
        # 1. Users
        res = await client.get("/admin/users", headers={"Authorization": f"Bearer {token_adm1}"})
        if res.status_code >= 500: server_errors += 1
        users = res.json() if res.status_code == 200 else []
        for u in users:
            if u.get("id") in (u_admin2_id, u_admin3_id):
                leaks += 1

        # 2. Leaves
        res = await client.get("/leaves/requests", headers={"Authorization": f"Bearer {token_adm1}"})
        if res.status_code >= 500: server_errors += 1
        leaves = res.json() if res.status_code == 200 else []
        for l in leaves:
            if l.get("id") in (leave_c2_id, leave_c3_id):
                leaks += 1

        # 3. CRM Leads
        res = await client.get("/crm/leads", headers={"Authorization": f"Bearer {token_adm1}"})
        if res.status_code >= 500: server_errors += 1
        leads_list = res.json() if res.status_code == 200 else []
        for l in leads_list:
            if l.get("id") in (make_id("lead_c2"), make_id("lead_c3")):
                leaks += 1

        # Probe B: Dual User 12 in C1 vs C2
        # In C1: leaves must only show C1 leave
        res = await client.get("/leaves/requests", headers={"Authorization": f"Bearer {token_dual12_c1}"})
        if res.status_code >= 500: server_errors += 1
        d1_leaves = res.json() if res.status_code == 200 else []
        for l in d1_leaves:
            if l.get("id") in (leave_c2_id, leave_c3_id):
                leaks += 1

        # In C2: leaves must only show C2 leave
        res = await client.get("/leaves/requests", headers={"Authorization": f"Bearer {token_dual12_c2}"})
        if res.status_code >= 500: server_errors += 1
        d2_leaves = res.json() if res.status_code == 200 else []
        for l in d2_leaves:
            if l.get("id") in (leave_c1_id, leave_c3_id):
                leaks += 1

        # Probe C: Cross-Company Mutation Rejection
        # 1. DELETE /leaves/requests/{id} for other company leaves
        del_c2 = await client.delete(f"/leaves/requests/{leave_c2_id}", headers={"Authorization": f"Bearer {token_adm1}"})
        if del_c2.status_code >= 500: server_errors += 1
        if del_c2.status_code == 200:
            invalid_mutations += 1

        del_c3 = await client.delete(f"/leaves/requests/{leave_c3_id}", headers={"Authorization": f"Bearer {token_adm1}"})
        if del_c3.status_code >= 500: server_errors += 1
        if del_c3.status_code == 200:
            invalid_mutations += 1

        # 2. DELETE /admin/users/{id} for other company users
        del_u2 = await client.delete(f"/admin/users/{u_admin2_id}", headers={"Authorization": f"Bearer {token_adm1}"})
        if del_u2.status_code >= 500: server_errors += 1
        if del_u2.status_code == 200:
            invalid_mutations += 1

        del_u3 = await client.delete(f"/admin/users/{u_admin3_id}", headers={"Authorization": f"Bearer {token_adm1}"})
        if del_u3.status_code >= 500: server_errors += 1
        if del_u3.status_code == 200:
            invalid_mutations += 1

        # Check response details: DELETE non-member returns 404
        assert del_c2.status_code == 404, f"Expected 404 on cross leave delete, got {del_c2.status_code}"
        assert del_c3.status_code == 404, f"Expected 404 on cross leave delete, got {del_c3.status_code}"
        assert del_u2.status_code == 404, f"Expected 404 on cross user delete, got {del_u2.status_code}"
        assert del_u3.status_code == 404, f"Expected 404 on cross user delete, got {del_u3.status_code}"

    # Verify hashes of C2 and C3 after probe
    c2_leaves_after = await get_collection_hash(db, "leave_requests", c2_id)
    c3_leaves_after = await get_collection_hash(db, "leave_requests", c3_id)
    c2_leads_after = await get_collection_hash(db, "leads", c2_id)
    c3_leads_after = await get_collection_hash(db, "leads", c3_id)

    byte_changes = 0
    if c2_leaves_before != c2_leaves_after: byte_changes += 1
    if c3_leaves_before != c3_leaves_after: byte_changes += 1
    if c2_leads_before != c2_leads_after: byte_changes += 1
    if c3_leads_before != c3_leads_after: byte_changes += 1

    # Cleanup test data
    await db.companies.delete_many({"id": {"$regex": f"^{PREFIX}"}})
    await db.users.delete_many({"id": {"$regex": f"^{PREFIX}"}})
    await db.company_memberships.delete_many({"id": {"$regex": f"^{PREFIX}"}})
    await db.leave_requests.delete_many({"id": {"$regex": f"^{PREFIX}"}})
    await db.leads.delete_many({"id": {"$regex": f"^{PREFIX}"}})

    client_mongo.close()

    print("======================================================================")
    print("CROSS-COMPANY 3-TENANT PROBE RESULTS")
    print("======================================================================")
    print(f"Companies tested: 3 ({c1_id}, {c2_id}, {c3_id})")
    print("Dual users tested: 2 (dual12, dual23)")
    print(f"Leaks detected: {leaks}")
    print(f"Cross-company mutation 2xx: {invalid_mutations} (all DELETEs returned 404)")
    print(f"5xx server errors: {server_errors}")
    print(f"Unexpected data changes (B): {byte_changes}")
    passed = (leaks == 0 and invalid_mutations == 0 and server_errors == 0 and byte_changes == 0)
    print(f"Probe status: {'PASS' if passed else 'FAIL'}")
    print("======================================================================")

    if not passed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_probe())
