from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
import uuid
import secrets
import string
from datetime import datetime, timezone

from app.schemas.user import MemberCreate, MemberUpdate, MemberResponse
from app.models.user import UserRole
from app.schemas.admin import (
    AdminCreateWorkspace, AdminAssignWorkspace
)
from app.schemas.workspace import WorkspaceResponse
from app.schemas.error import ErrorResponse
from app.core.security import require_admin, get_password_hash
from app.database import get_database

router = APIRouter(
    prefix="/admin",
    tags=["Admin Management"],
    dependencies=[Depends(require_admin)],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden - Admin Only"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)


def _format_member_resp(doc: dict) -> dict:
    raw_role = doc.get("role", UserRole.MEMBER.value)
    role_val = UserRole.ADMIN if raw_role == "admin" else UserRole.MEMBER
    return {
        "id": doc.get("id") or str(doc.get("_id")),
        "email": doc["email"],
        "full_name": doc.get("full_name") or doc.get("name", "User"),
        "role": role_val,
        "department": doc.get("department"),
        "designation": doc.get("designation"),
        "is_active": doc.get("is_active", True),
        "workspace_ids": doc.get("workspace_ids", []),
        "created_at": doc.get("created_at"),
    }


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ─── TEAM MEMBER MANAGEMENT ENDPOINTS ──────────────────────────────────────────

@router.get("/members", response_model=List[MemberResponse])
@router.get("/users", response_model=List[MemberResponse])
async def list_members(
    search: Optional[str] = Query(None, description="Search by name or email"),
    department: Optional[str] = Query(None, description="Filter by department"),
    role: Optional[str] = Query(None, description="Filter by role ('admin' or 'member')"),
    is_active: Optional[bool] = Query(None, description="Filter by active/inactive status"),
    limit: int = Query(200, ge=1, le=1000),
    skip: int = Query(0, ge=0),
):
    """List all registered team members with optional filters and pagination (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    query: dict = {}
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    if department:
        query["department"] = department
    if role:
        query["role"] = role
    if is_active is not None:
        query["is_active"] = is_active

    cursor = db.users.find(query, {"_id": 0, "hashed_password": 0}).sort("created_at", -1).skip(skip).limit(limit)
    users_list = await cursor.to_list(length=limit)
    return [_format_member_resp(u) for u in users_list]


@router.post("/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
@router.post("/users", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def create_member(member_in: MemberCreate):
    """Create a new team member account (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    existing = await db.users.find_one({"email": member_in.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="A member with this email address already exists.")

    user_id = f"usr_{uuid.uuid4().hex[:10]}"
    
    raw_pwd = member_in.temporary_password.strip() if member_in.temporary_password else _generate_temp_password()
    hashed_pwd = get_password_hash(raw_pwd)

    ws_ids = member_in.workspace_ids or []
    if member_in.role == UserRole.ADMIN:
        all_ws = await db.workspaces.find({}, {"id": 1, "_id": 0}).to_list(100)
        ws_ids = list(set([w["id"] for w in all_ws if "id" in w]))

    now_iso = datetime.now(timezone.utc).isoformat()
    user_doc = {
        "_id": user_id,
        "id": user_id,
        "email": member_in.email.lower(),
        "full_name": member_in.full_name.strip(),
        "name": member_in.full_name.strip(),
        "hashed_password": hashed_pwd,
        "role": member_in.role.value,
        "department": member_in.department.strip() if member_in.department else None,
        "designation": member_in.designation.strip() if member_in.designation else None,
        "is_active": member_in.is_active,
        "workspace_ids": ws_ids,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.users.insert_one(user_doc)
    return _format_member_resp(user_doc)


@router.patch("/members/{user_id}", response_model=MemberResponse)
@router.patch("/users/{user_id}", response_model=MemberResponse)
async def update_member(user_id: str, member_in: MemberUpdate):
    """Update a member's role, status, department, designation, or workspace access."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    existing_user = await db.users.find_one({"id": user_id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Member not found.")

    # Primary Admin Protection: Prevent deactivating or demoting Admin accounts
    if existing_user.get("role") == UserRole.ADMIN.value or existing_user.get("role") == "admin":
        if member_in.role is not None and member_in.role != UserRole.ADMIN:
            raise HTTPException(status_code=400, detail="Cannot demote or modify the role of an Admin account.")
        if member_in.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate an Admin account.")

    update_fields = {}
    if member_in.full_name is not None:
        update_fields["full_name"] = member_in.full_name.strip()
        update_fields["name"] = member_in.full_name.strip()
    if member_in.role is not None:
        update_fields["role"] = member_in.role.value
    if member_in.department is not None:
        update_fields["department"] = member_in.department.strip() if member_in.department else None
    if member_in.designation is not None:
        update_fields["designation"] = member_in.designation.strip() if member_in.designation else None
    if member_in.is_active is not None:
        update_fields["is_active"] = member_in.is_active
    if member_in.workspace_ids is not None:
        update_fields["workspace_ids"] = member_in.workspace_ids

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    res = await db.users.update_one({"id": user_id}, {"$set": update_fields})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Member not found.")

    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    return _format_member_resp(updated)


# ─── WORKSPACE MANAGEMENT (ADMIN ONLY) ─────────────────────────────────────────

@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace_admin(ws_in: AdminCreateWorkspace):
    """Create a new workspace entity (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    ws_id = f"ws-{uuid.uuid4().hex[:8]}"
    initials = ws_in.initials or ws_in.name[:2].upper()

    ws_doc = {
        "id": ws_id,
        "name": ws_in.name,
        "initials": initials,
        "brandColor": ws_in.brand_color or "bg-indigo-500",
        "industry": ws_in.industry or "General B2B",
        "isDefault": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.workspaces.insert_one(ws_doc.copy())
    return {
        "id": ws_id,
        "name": ws_in.name,
        "initials": initials,
        "brandColor": ws_in.brand_color or "bg-indigo-500",
        "industry": ws_in.industry or "General B2B",
        "isDefault": False,
    }


@router.post("/workspaces/assign")
async def assign_workspace_user(payload: AdminAssignWorkspace):
    """Assign or remove a user from a workspace."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user = await db.users.find_one({"id": payload.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    ws = await db.workspaces.find_one({"id": payload.workspace_id})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    current_ws_ids = user.get("workspace_ids", [])
    if payload.action == "assign":
        if payload.workspace_id not in current_ws_ids:
            current_ws_ids.append(payload.workspace_id)
            await db.users.update_one({"id": payload.user_id}, {"$set": {"workspace_ids": current_ws_ids}})
    elif payload.action == "remove":
        current_ws_ids = [w for w in current_ws_ids if w != payload.workspace_id]
        await db.users.update_one({"id": payload.user_id}, {"$set": {"workspace_ids": current_ws_ids}})

    return {
        "message": f"Successfully {payload.action}ed user '{user.get('email')}' to workspace '{ws.get('name')}'.",
        "user_id": payload.user_id,
        "workspace_ids": current_ws_ids,
    }
