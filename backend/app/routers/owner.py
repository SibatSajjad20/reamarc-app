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

from app.config import settings
from app.core.owner_audit import record_owner_audit_event
from app.core.security import (
    create_impersonation_token,
    get_password_hash,
    require_owner,
    invalidate_auth_cache,
)
from app.core.tenant import get_global_db

async def require_owner_console(
    request: Request,
    current_user: dict = Depends(require_owner),
) -> dict:
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return current_user
    if not getattr(settings, "MULTI_TENANT_ENABLED", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    return current_user


router = APIRouter(
    prefix="/owner",
    tags=["Owner Console"],
    dependencies=[Depends(require_owner_console)],
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


class GrantCompanyAccessRequest(BaseModel):
    company_id: str = Field(..., min_length=2, max_length=100)


class ProvisionMemberRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: Optional[str] = None
    company_id: str = Field(..., min_length=2, max_length=100)
    role: str = Field("team_member", min_length=2, max_length=50)
    temporary_password: Optional[str] = Field(None, min_length=8)



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
    creation_id = f"cr_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    admin_id = f"usr_{uuid.uuid4().hex[:12]}"
    mem_id = f"mem_{uuid.uuid4().hex[:12]}"
    ws_id = f"ws_{uuid.uuid4().hex[:12]}"
    setup_link = None

    async def _rollback() -> None:
        await gdb.company_memberships.delete_many({"creation_id": creation_id})
        await gdb.workspaces.delete_many({"creation_id": creation_id})
        await gdb.users.delete_many({"creation_id": creation_id})
        await gdb.companies.delete_many({"creation_id": creation_id})
        await gdb.password_resets.delete_many({"creation_id": creation_id})

    try:
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
            "creation_id": creation_id,
            "created_at": now,
            "created_by": current_user["id"],
        }
        await gdb.companies.insert_one(comp_doc)

        admin_doc = {
            "_id": admin_id,
            "id": admin_id,
            "email": email_clean,
            "name": body.admin_name.strip(),
            "full_name": body.admin_name.strip(),
            "role": "admin",
            "company_id": company_id,
            "is_active": True,
            "hashed_password": get_password_hash(uuid.uuid4().hex),
            "token_version": 0,
            "creation_id": creation_id,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await gdb.users.insert_one(admin_doc)

        await gdb.company_memberships.insert_one({
            "_id": mem_id,
            "id": mem_id,
            "user_id": admin_id,
            "company_id": company_id,
            "role": "admin",
            "status": "active",
            "needs_setup": False,
            "token_version": 0,
            "creation_id": creation_id,
            "granted_by": current_user["id"],
            "granted_at": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

        initials = "".join([w[0].upper() for w in body.name.split() if w][:2]) or "CO"
        await gdb.workspaces.insert_one({
            "_id": ws_id,
            "id": ws_id,
            "name": f"{body.name.strip()} Workspace",
            "brandColor": body.accent_color or "#6847E0",
            "initials": initials,
            "company_id": company_id,
            "is_default": True,
            "creation_id": creation_id,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

        from app.services.identity_guard import create_password_reset_link, send_password_reset_link_email
        setup_link = await create_password_reset_link(email_clean, hours=72)
        await gdb.password_resets.update_many(
            {"email": email_clean, "purpose": "link", "used": False},
            {"$set": {"creation_id": creation_id}},
        )
        await send_password_reset_link_email(email_clean, body.admin_name.strip(), setup_link)

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
    except Exception:
        await _rollback()
        raise

    clean_comp = {k: v for k, v in comp_doc.items() if k != "_id"}
    clean_comp["user_count"] = 1
    clean_comp["setup_link"] = setup_link
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


@router.post("/companies/{company_id}/resend-invite")
async def resend_company_invite(
    company_id: str,
    current_user: dict = Depends(require_owner),
) -> Dict[str, Any]:
    gdb = get_global_db()
    company = await gdb.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    admin = await gdb.users.find_one({"company_id": company_id, "role": "admin"})
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company admin not found.")
    from app.services.identity_guard import create_password_reset_link, send_password_reset_link_email
    email = str(admin.get("email") or "")
    name = admin.get("full_name") or admin.get("name") or "there"
    link = await create_password_reset_link(email, hours=72)
    await send_password_reset_link_email(email, name, link)
    return {"message": "Invite sent.", "setup_link": link}


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


@router.get("/members")
async def list_owner_members(
    search: Optional[str] = Query(None, description="Search by name or email"),
    current_user: dict = Depends(require_owner),
) -> List[Dict[str, Any]]:
    """List all users with email and their company memberships."""
    if not getattr(settings, "MULTI_COMPANY_ENABLED", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    gdb = get_global_db()
    user_query: Dict[str, Any] = {}
    if search:
        s_clean = re.escape(search.strip())
        user_query["$or"] = [
            {"email": {"$regex": s_clean, "$options": "i"}},
            {"name": {"$regex": s_clean, "$options": "i"}},
            {"full_name": {"$regex": s_clean, "$options": "i"}},
        ]

    users = await gdb.users.find(user_query, {"hashed_password": 0}).sort("created_at", -1).to_list(1000)
    user_ids = [u.get("id") or str(u.get("_id")) for u in users]

    memberships = await gdb.company_memberships.find({"user_id": {"$in": user_ids}}).to_list(5000)
    mems_by_user: Dict[str, List[dict]] = {}
    for m in memberships:
        mems_by_user.setdefault(m["user_id"], []).append(m)

    all_companies = await gdb.companies.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "logo_url": 1, "status": 1}).to_list(1000)
    comp_map = {c["id"]: c for c in all_companies}

    result = []
    for u in users:
        uid = u.get("id") or str(u.get("_id"))
        user_mems = mems_by_user.get(uid, [])
        formatted_mems = []
        for m in user_mems:
            cid = m["company_id"]
            comp = comp_map.get(cid, {})
            formatted_mems.append({
                "id": m.get("id") or str(m.get("_id")),
                "company_id": cid,
                "company_name": comp.get("name", cid),
                "company_slug": comp.get("slug", ""),
                "company_logo_url": comp.get("logo_url"),
                "company_status": comp.get("status", "active"),
                "role": m.get("role", "team_member"),
                "status": m.get("status", "active"),
                "needs_setup": bool(m.get("needs_setup", False)),
                "granted_at": m.get("granted_at"),
                "removed_at": m.get("removed_at"),
            })

        result.append({
            "id": uid,
            "email": u.get("email"),
            "name": u.get("full_name") or u.get("name", "User"),
            "full_name": u.get("full_name") or u.get("name", "User"),
            "is_active": u.get("is_active", True),
            "is_super_admin": u.get("is_super_admin", False),
            "created_at": u.get("created_at"),
            "memberships": formatted_mems,
        })

    return result


@router.post("/members", status_code=status.HTTP_201_CREATED)
async def provision_member(
    body: ProvisionMemberRequest,
    current_user: dict = Depends(require_owner),
) -> Dict[str, Any]:
    """Provision a new user account and assign them to an initial company membership."""
    if not getattr(settings, "MULTI_COMPANY_ENABLED", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    gdb = get_global_db()
    target_comp = await gdb.companies.find_one({"id": body.company_id})
    if not target_comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    email_clean = body.email.lower().strip()
    existing_user = await gdb.users.find_one({"email": email_clean})

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    if existing_user:
        user_id = existing_user.get("id") or str(existing_user.get("_id"))
        existing_mem = await gdb.company_memberships.find_one({"user_id": user_id, "company_id": body.company_id})
        if existing_mem and existing_mem.get("status") == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User is already an active member of {target_comp.get('name')}.",
            )
        mem_id = existing_mem["id"] if existing_mem else f"mem_{uuid.uuid4().hex[:12]}"
        mem_doc = {
            "status": "active",
            "role": body.role or "team_member",
            "primary_department": None,
            "departments": [],
            "content_stages": [],
            "access": {
                "attendance": False,
                "daily_log": False,
                "sales": False,
                "content_calendar": False,
                "website": False,
                "ads": False,
            },
            "needs_setup": True,
            "granted_by": current_user["id"],
            "granted_at": now_iso,
            "removed_by": None,
            "removed_at": None,
            "updated_at": now_iso,
        }
        if existing_mem:
            await gdb.company_memberships.update_one(
                {"_id": existing_mem["_id"]},
                {"$set": mem_doc, "$inc": {"token_version": 1}},
            )
        else:
            mem_doc["_id"] = mem_id
            mem_doc["id"] = mem_id
            mem_doc["user_id"] = user_id
            mem_doc["company_id"] = body.company_id
            mem_doc["token_version"] = 0
            mem_doc["created_at"] = now_iso
            await gdb.company_memberships.insert_one(mem_doc)

        invalidate_auth_cache(user_id=user_id, membership_id=mem_id)

        await record_owner_audit_event(
            global_db=gdb,
            action="provision_member",
            actor_user_id=current_user["id"],
            target_company_id=body.company_id,
            details={
                "user_id": user_id,
                "email": email_clean,
                "membership_id": mem_id,
                "note": "Existing user granted membership via provision",
            },
        )
        return {
            "ok": True,
            "user_id": user_id,
            "email": email_clean,
            "membership_id": mem_id,
            "company_id": body.company_id,
            "is_new_user": False,
        }

    user_id = f"usr_{uuid.uuid4().hex[:10]}"
    raw_pwd = (body.temporary_password or "").strip() or "Reamarc123!"
    hashed_pwd = get_password_hash(raw_pwd)

    new_user_doc = {
        "_id": user_id,
        "id": user_id,
        "email": email_clean,
        "name": body.full_name.strip(),
        "full_name": body.full_name.strip(),
        "phone": body.phone.strip() if body.phone else None,
        "phone_number": body.phone.strip() if body.phone else None,
        "hashed_password": hashed_pwd,
        "role": body.role or "team_member",
        "company_id": body.company_id,
        "is_active": True,
        "is_super_admin": False,
        "token_version": 0,
        "session_epoch": 0,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await gdb.users.insert_one(new_user_doc)

    mem_id = f"mem_{uuid.uuid4().hex[:12]}"
    mem_doc = {
        "_id": mem_id,
        "id": mem_id,
        "user_id": user_id,
        "company_id": body.company_id,
        "role": body.role or "team_member",
        "primary_department": None,
        "departments": [],
        "content_stages": [],
        "access": {
            "attendance": False,
            "daily_log": False,
            "sales": False,
            "content_calendar": False,
            "website": False,
            "ads": False,
        },
        "status": "active",
        "needs_setup": True,
        "granted_by": current_user["id"],
        "granted_at": now_iso,
        "removed_by": None,
        "removed_at": None,
        "token_version": 0,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await gdb.company_memberships.insert_one(mem_doc)

    await record_owner_audit_event(
        global_db=gdb,
        action="provision_member",
        actor_user_id=current_user["id"],
        target_company_id=body.company_id,
        details={
            "user_id": user_id,
            "email": email_clean,
            "membership_id": mem_id,
            "role": body.role,
        },
    )

    return {
        "ok": True,
        "user_id": user_id,
        "email": email_clean,
        "membership_id": mem_id,
        "company_id": body.company_id,
        "is_new_user": True,
    }


@router.post("/members/{user_id}/companies")
async def grant_company_access(
    user_id: str,
    body: GrantCompanyAccessRequest,
    current_user: dict = Depends(require_owner),
) -> Dict[str, Any]:
    """Give a user access to a company. Starts with minimal access and needs_setup=True."""
    if not getattr(settings, "MULTI_COMPANY_ENABLED", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    gdb = get_global_db()
    target_user = await gdb.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    target_comp = await gdb.companies.find_one({"id": body.company_id})
    if not target_comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    existing_mem = await gdb.company_memberships.find_one({"user_id": user_id, "company_id": body.company_id})

    if existing_mem:
        mem_id = existing_mem["id"]
        update_doc = {
            "status": "active",
            "role": "team_member",
            "primary_department": None,
            "departments": [],
            "content_stages": [],
            "access": {
                "attendance": False,
                "daily_log": False,
                "sales": False,
                "content_calendar": False,
                "website": False,
                "ads": False,
            },
            "needs_setup": True,
            "granted_by": current_user["id"],
            "granted_at": now_iso,
            "removed_by": None,
            "removed_at": None,
            "updated_at": now_iso,
        }
        await gdb.company_memberships.update_one(
            {"_id": existing_mem["_id"]},
            {"$set": update_doc, "$inc": {"token_version": 1}},
        )
    else:
        mem_id = f"mem_{uuid.uuid4().hex[:12]}"
        mem_doc = {
            "_id": mem_id,
            "id": mem_id,
            "user_id": user_id,
            "company_id": body.company_id,
            "role": "team_member",
            "primary_department": None,
            "departments": [],
            "content_stages": [],
            "access": {
                "attendance": False,
                "daily_log": False,
                "sales": False,
                "content_calendar": False,
                "website": False,
                "ads": False,
            },
            "status": "active",
            "needs_setup": True,
            "granted_by": current_user["id"],
            "granted_at": now_iso,
            "removed_by": None,
            "removed_at": None,
            "token_version": 0,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await gdb.company_memberships.insert_one(mem_doc)

    invalidate_auth_cache(user_id=user_id, membership_id=mem_id)

    await record_owner_audit_event(
        global_db=gdb,
        action="grant_company_access",
        actor_user_id=current_user["id"],
        target_company_id=body.company_id,
        details={
            "target_user_id": user_id,
            "target_user_email": target_user.get("email"),
            "membership_id": mem_id,
        },
    )

    return {
        "ok": True,
        "membership_id": mem_id,
        "user_id": user_id,
        "company_id": body.company_id,
        "status": "active",
        "needs_setup": True,
        "role": "team_member",
    }


@router.post("/members/{user_id}/companies/{company_id}/remove")
async def remove_company_access(
    user_id: str,
    company_id: str,
    current_user: dict = Depends(require_owner),
) -> Dict[str, Any]:
    """Soft-remove a user's company membership (sets status=removed, bumps token_version)."""
    if not getattr(settings, "MULTI_COMPANY_ENABLED", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    gdb = get_global_db()
    target_mem = await gdb.company_memberships.find_one({"user_id": user_id, "company_id": company_id})
    if not target_mem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found.")

    now_iso = datetime.now(timezone.utc).isoformat()
    await gdb.company_memberships.update_one(
        {"_id": target_mem["_id"]},
        {
            "$set": {
                "status": "removed",
                "removed_by": current_user["id"],
                "removed_at": now_iso,
                "updated_at": now_iso,
            },
            "$inc": {"token_version": 1},
        },
    )

    invalidate_auth_cache(user_id=user_id, membership_id=target_mem["id"])

    await record_owner_audit_event(
        global_db=gdb,
        action="remove_company_access",
        actor_user_id=current_user["id"],
        target_company_id=company_id,
        details={
            "target_user_id": user_id,
            "membership_id": target_mem["id"],
        },
    )

    return {
        "ok": True,
        "user_id": user_id,
        "company_id": company_id,
        "status": "removed",
    }

