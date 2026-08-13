from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import uuid
from datetime import datetime, timezone

from app.schemas.admin import (
    AdminCreateUser, AdminUpdateUser, AdminUserResponse,
    AdminCreateWorkspace, AdminAssignWorkspace
)
from app.schemas.workspace import WorkspaceResponse
from app.schemas.error import ErrorResponse
from app.core.security import require_roles, get_password_hash
from app.database import get_database

router = APIRouter(
    prefix="/admin",
    tags=["Admin Management"],
    dependencies=[Depends(require_roles(["admin"]))],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden - Admin Only"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    }
)


def _format_user_resp(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "email": doc["email"],
        "full_name": doc.get("full_name") or doc.get("name", "User"),
        "role": doc.get("role", "editor"),
        "is_active": doc.get("is_active", True),
        "workspace_ids": doc.get("workspace_ids", []),
    }


@router.get("/users", response_model=List[AdminUserResponse])
async def list_users():
    """List all registered users with their roles and workspace assignments."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    cursor = db.users.find({}, {"_id": 0, "hashed_password": 0})
    users_list = await cursor.to_list(length=None)
    return [_format_user_resp(u) for u in users_list]


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(user_in: AdminCreateUser):
    """Create a new user account (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    existing = await db.users.find_one({"email": user_in.email})
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email address already exists.")

    user_id = f"usr_{uuid.uuid4().hex[:10]}"
    hashed_pwd = get_password_hash(user_in.initial_password)

    ws_ids = user_in.workspace_ids or []
    if user_in.role == "admin":
        all_ws = await db.workspaces.find({}, {"id": 1, "_id": 0}).to_list(100)
        ws_ids = list(set([w["id"] for w in all_ws if "id" in w]))

    user_doc = {
        "_id": user_id,
        "id": user_id,
        "email": user_in.email,
        "full_name": user_in.full_name,
        "name": user_in.full_name,
        "hashed_password": hashed_pwd,
        "role": user_in.role,
        "is_active": True,
        "workspace_ids": ws_ids,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    return _format_user_resp(user_doc)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(user_id: str, user_in: AdminUpdateUser):
    """Update a user's role, status, or workspace access."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    existing_user = await db.users.find_one({"id": user_id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Primary Admin Protection: Prevent deactivating or demoting Admin accounts
    if existing_user.get("role") == "admin":
        if user_in.role is not None and user_in.role != "admin":
            raise HTTPException(status_code=400, detail="Cannot demote or modify the role of an Admin account.")
        if user_in.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate an Admin account.")

    update_fields = {}
    if user_in.full_name is not None:
        update_fields["full_name"] = user_in.full_name
        update_fields["name"] = user_in.full_name
    if user_in.role is not None:
        update_fields["role"] = user_in.role
    if user_in.is_active is not None:
        update_fields["is_active"] = user_in.is_active
    if user_in.workspace_ids is not None:
        update_fields["workspace_ids"] = user_in.workspace_ids

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    res = await db.users.update_one({"id": user_id}, {"$set": update_fields})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")

    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    return _format_user_resp(updated)


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
