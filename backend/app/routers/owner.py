"""
backend/app/routers/owner.py
Owner Super-Admin Console Endpoints (/api/v1/owner/*)
Provides full multi-tenant fleet visibility and management for Faizan:
- List, view, create, update, and suspend tenant companies.
- One-click owner impersonation into company consoles (read-only by default).
- Immediate session revocation via company token version bumping.
- Cryptographically chained owner audit log retrieval.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field

from app.core.owner_audit import record_owner_audit_event
from app.core.security import (
    create_impersonation_token,
    get_password_hash,
    require_owner,
)
from app.core.tenant import get_global_db

router = APIRouter(
    prefix="/owner",
    tags=["Owner Console"],
    dependencies=[Depends(require_owner)],
)


# ==============================================================================
# SCHEMAS
# ==============================================================================

class CompanyCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=50)
    plan: str = Field("starter", pattern=r"^(starter|pro|enterprise)$")
    timezone: str = Field("Asia/Karachi", min_length=2, max_length=50)
    accent_color: str = Field("#6847E0", pattern=r"^#(?:[0-9a-fA-F]{3}){1,2}$")
    admin_name: str = Field(..., min_length=2, max_length=100)
    admin_email: EmailStr
    admin_password: Optional[str] = Field(None, min_length=8)
    max_users: int = Field(50, ge=1, le=10000)


class CompanyUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    slug: Optional[str] = Field(None, min_length=2, max_length=50)
    plan: Optional[str] = Field(None, pattern=r"^(starter|pro|enterprise)$")
    status: Optional[str] = Field(None, pattern=r"^(active|suspended)$")
    timezone: Optional[str] = Field(None, min_length=2, max_length=50)
    accent_color: Optional[str] = Field(None, pattern=r"^#(?:[0-9a-fA-F]{3}){1,2}$")
    logo_url: Optional[str] = None
    max_users: Optional[int] = Field(None, ge=1, le=10000)


class OwnerEnterRequest(BaseModel):
    reason: str = Field("Inspection / Support", max_length=255)
    read_only: bool = True


# ==============================================================================
# ENDPOINTS
# ==============================================================================

@router.get("/session")
async def get_owner_session(current_user: dict = Depends(require_owner)) -> Dict[str, Any]:
    """Verify owner session identity."""
    return {
        "user": {
            "id": current_user["id"],
            "name": current_user.get("name") or current_user.get("full_name"),
            "email": current_user["email"],
            "is_super_admin": True,
        },
        "is_owner": True,
    }


@router.get("/companies")
async def list_companies(current_user: dict = Depends(require_owner)) -> List[Dict[str, Any]]:
    """List all companies across the fleet with user counts."""
    gdb = get_global_db()
    companies = await gdb.companies.find({}, {"_id": 0}).to_list(1000)

    # Compute live user counts per company
    pipeline = [{"$group": {"_id": "$company_id", "count": {"$sum": 1}}}]
    user_counts = {doc["_id"]: doc["count"] async for doc in gdb.users.aggregate(pipeline)}

    for comp in companies:
        cid = comp.get("id")
        comp["user_count"] = user_counts.get(cid, 0)
        comp.setdefault("plan", "starter")
        if "limits" not in comp:
            comp["limits"] = {"max_users": 50}

    return companies


@router.post("/companies", status_code=status.HTTP_201_CREATED)
async def create_company(
    body: CompanyCreateRequest,
    current_user: dict = Depends(require_owner),
) -> Dict[str, Any]:
    """Provision a new tenant company, initial workspace, and admin user."""
    gdb = get_global_db()

    slug_clean = body.slug.strip().lower()
    if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", slug_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid slug format. Use lowercase letters, numbers, and hyphens.",
        )

    # Slug uniqueness check
    existing_slug = await gdb.companies.find_one({"slug": slug_clean})
    if existing_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Company slug '{slug_clean}' is already in use.",
        )

    # Admin email uniqueness check
    email_clean = str(body.admin_email).strip().lower()
    existing_user = await gdb.users.find_one({"email": email_clean})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{email_clean}' already exists.",
        )

    company_id = f"comp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # 1. Company document
    comp_doc = {
        "_id": company_id,
        "id": company_id,
        "name": body.name.strip(),
        "slug": slug_clean,
        "plan": body.plan,
        "status": "active",
        "timezone": body.timezone or "Asia/Karachi",
        "accent_color": body.accent_color or "#6847E0",
        "logo_url": None,
        "limits": {"max_users": body.max_users or 50},
        "token_version": 0,
        "created_at": now,
        "created_by": current_user["id"],
    }
    await gdb.companies.insert_one(comp_doc)

    # 2. Initial Admin User
    admin_id = f"usr_{uuid.uuid4().hex[:12]}"
    raw_password = body.admin_password or uuid.uuid4().hex[:16]
    admin_doc = {
        "_id": admin_id,
        "id": admin_id,
        "email": email_clean,
        "name": body.admin_name.strip(),
        "full_name": body.admin_name.strip(),
        "role": "admin",
        "company_id": company_id,
        "is_active": True,
        "hashed_password": get_password_hash(raw_password),
        "token_version": 0,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await gdb.users.insert_one(admin_doc)

    # 3. Default Workspace
    ws_id = f"ws_{uuid.uuid4().hex[:12]}"
    initials = "".join([w[0].upper() for w in body.name.split() if w][:2]) or "CO"
    await gdb.workspaces.insert_one({
        "_id": ws_id,
        "id": ws_id,
        "name": f"{body.name.strip()} Workspace",
        "brandColor": body.accent_color or "#6847E0",
        "initials": initials,
        "company_id": company_id,
        "is_default": True,
        "created_at": now_iso,
        "updated_at": now_iso,
    })

    # 4. Cryptographic audit event
    await record_owner_audit_event(
        global_db=gdb,
        action="create_company",
        actor_user_id=current_user["id"],
        target_company_id=company_id,
        details={
            "name": body.name,
            "slug": slug_clean,
            "plan": body.plan,
            "admin_email": email_clean,
        },
    )

    clean_comp = {k: v for k, v in comp_doc.items() if k != "_id"}
    clean_comp["user_count"] = 1
    return clean_comp


@router.get("/companies/{company_id}")
async def get_company_detail(
    company_id: str,
    current_user: dict = Depends(require_owner),
) -> Dict[str, Any]:
    """Retrieve complete metadata for a company."""
    gdb = get_global_db()
    comp = await gdb.companies.find_one({"id": company_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    users = await gdb.users.find({"company_id": company_id}, {"_id": 0, "hashed_password": 0}).to_list(100)
    workspaces = await gdb.workspaces.find({"company_id": company_id}, {"_id": 0}).to_list(20)

    comp["users"] = users
    comp["user_count"] = len(users)
    comp["workspaces"] = workspaces
    return comp


@router.patch("/companies/{company_id}")
async def update_company(
    company_id: str,
    body: CompanyUpdateRequest,
    current_user: dict = Depends(require_owner),
) -> Dict[str, Any]:
    """Update company settings or change status (suspend / activate)."""
    gdb = get_global_db()
    existing = await gdb.companies.find_one({"id": company_id})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    update_fields: Dict[str, Any] = {}
    if body.name is not None:
        update_fields["name"] = body.name.strip()
    if body.slug is not None:
        slug_clean = body.slug.strip().lower()
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", slug_clean):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid slug format.",
            )
        slug_dup = await gdb.companies.find_one({"slug": slug_clean, "id": {"$ne": company_id}})
        if slug_dup:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slug already in use.")
        update_fields["slug"] = slug_clean
    if body.plan is not None:
        update_fields["plan"] = body.plan
    if body.timezone is not None:
        update_fields["timezone"] = body.timezone
    if body.accent_color is not None:
        update_fields["accent_color"] = body.accent_color
    if body.logo_url is not None:
        update_fields["logo_url"] = body.logo_url
    if body.max_users is not None:
        update_fields["limits.max_users"] = body.max_users

    inc_fields: Dict[str, Any] = {}
    if body.status is not None:
        update_fields["status"] = body.status
        # Suspending increments token_version so all active user sessions are invalidated immediately
        if body.status == "suspended":
            inc_fields["token_version"] = 1

    mongo_update: Dict[str, Any] = {}
    if update_fields:
        mongo_update["$set"] = update_fields
    if inc_fields:
        mongo_update["$inc"] = inc_fields

    if mongo_update:
        await gdb.companies.update_one({"id": company_id}, mongo_update)

    # Record audit event
    await record_owner_audit_event(
        global_db=gdb,
        action="update_company",
        actor_user_id=current_user["id"],
        target_company_id=company_id,
        details=body.model_dump(exclude_unset=True),
    )

    updated = await gdb.companies.find_one({"id": company_id}, {"_id": 0})
    return updated


@router.post("/companies/{company_id}/enter")
async def enter_company_console(
    company_id: str,
    body: OwnerEnterRequest,
    current_user: dict = Depends(require_owner),
) -> Dict[str, Any]:
    """
    Issue an owner impersonation token into a tenant console.
    Defaults to read_only=True (60m).
    """
    gdb = get_global_db()
    company = await gdb.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    token = create_impersonation_token(
        user_id=current_user["id"],
        company_id=company_id,
        read_only=body.read_only,
        reason=body.reason,
    )

    await record_owner_audit_event(
        global_db=gdb,
        action="enter_company",
        actor_user_id=current_user["id"],
        target_company_id=company_id,
        details={
            "reason": body.reason,
            "read_only": body.read_only,
        },
    )

    return {
        "impersonation_token": token,
        "company": company,
        "read_only": body.read_only,
        "expires_in_minutes": 60 if body.read_only else 30,
    }


@router.post("/companies/{company_id}/reset-token-version")
async def reset_company_token_version(
    company_id: str,
    current_user: dict = Depends(require_owner),
) -> Dict[str, Any]:
    """Force logout all active sessions for a company."""
    gdb = get_global_db()
    res = await gdb.companies.find_one_and_update(
        {"id": company_id},
        {"$inc": {"token_version": 1}},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    await record_owner_audit_event(
        global_db=gdb,
        action="reset_token_version",
        actor_user_id=current_user["id"],
        target_company_id=company_id,
        details={"new_token_version": res.get("token_version", 1)},
    )

    return {
        "ok": True,
        "company_id": company_id,
        "token_version": res.get("token_version", 1),
    }


@router.get("/audit")
async def get_audit_log(
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(require_owner),
) -> List[Dict[str, Any]]:
    """Retrieve recent cryptographically chained owner audit log records."""
    gdb = get_global_db()
    records = await gdb.owner_audit.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return records
