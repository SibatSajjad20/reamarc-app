from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
import uuid
import secrets
import string
from datetime import datetime, timezone, timedelta

from app.schemas.user import (
    MemberCreate,
    MemberUpdate,
    MemberResponse,
    MemberActivityResponse,
    ReminderRequest,
    ReminderResponse,
)
from app.models.user import UserRole
from app.schemas.admin import (
    WorkspaceCreate,
    WorkspaceUpdate,
    WorkspaceResponse,
    AdAccountCreate,
    AdAccountUpdate,
    AdAccountResponse,
)
from app.schemas.error import ErrorResponse
from app.core.security import require_admin, require_hr_or_admin, get_password_hash
from app.database import get_database
from app.services.email_service import EmailService

router = APIRouter(
    prefix="/admin",
    tags=["Admin Management"],
    dependencies=[Depends(require_hr_or_admin)],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden - Admin or HR Only"},
        404: {"model": ErrorResponse, "description": "Not Found"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    },
)


def _format_member_resp(doc: dict) -> dict:
    raw_role = doc.get("role", UserRole.TEAM_MEMBER.value)
    try:
        role_val = UserRole(raw_role)
    except ValueError:
        role_val = UserRole.TEAM_MEMBER
    return {
        "id": doc.get("id") or str(doc.get("_id")),
        "email": doc["email"],
        "full_name": doc.get("full_name") or doc.get("name", "User"),
        "role": role_val,
        "phone": doc.get("phone"),
        "department": doc.get("department"),
        "is_active": doc.get("is_active", True),
        "created_at": doc.get("created_at"),
    }


def _format_workspace_resp(doc: dict) -> dict:
    ws_id = str(doc.get("id", str(doc.get("_id", ""))))
    return {
        "id": ws_id,
        "name": doc.get("name", "Untitled Workspace"),
        "brandColor": doc.get("brandColor") or doc.get("brand_color") or "bg-indigo-600",
        "brand_color": doc.get("brand_color") or doc.get("brandColor") or "bg-indigo-600",
        "initials": doc.get("initials") or doc.get("name", "WS")[:2].upper(),
        "proposal_url": doc.get("proposal_url"),
        "proposal_name": doc.get("proposal_name"),
        "proposal_size": doc.get("proposal_size"),
        "project_cycle": doc.get("project_cycle", "Retainer"),
        "priority": doc.get("priority", "Medium"),
        "contract_start_date": doc.get("contract_start_date"),
        "contract_end_date": doc.get("contract_end_date"),
        "services": doc.get("services") or [],
        "health": doc.get("health", "Good"),
        "poc_name": doc.get("poc_name"),
        "poc_email": doc.get("poc_email"),
        "poc_phone": doc.get("poc_phone"),
        "billing_name": doc.get("billing_name"),
        "billing_email": doc.get("billing_email"),
        "billing_phone": doc.get("billing_phone"),
        "isDefault": bool(doc.get("isDefault", False)),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


async def _format_ad_account_resp(doc: dict, db=None) -> dict:
    acc_id = str(doc.get("id", str(doc.get("_id", ""))))
    ws_id = doc.get("workspace_id")
    ws_name = None
    if ws_id and db is not None:
        ws_doc = await db.workspaces.find_one({"id": ws_id})
        if ws_doc:
            ws_name = ws_doc.get("name")

    return {
        "id": acc_id,
        "name": doc.get("name", "Untitled Ad Account"),
        "platform": doc.get("platform", "Meta Ads"),
        "account_id": doc.get("account_id", ""),
        "pixel_id": doc.get("pixel_id"),
        "workspace_id": ws_id,
        "workspace_name": ws_name,
        "currency": doc.get("currency", "USD"),
        "status": doc.get("status", "active"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def is_workday(date_obj) -> bool:
    """
    Evaluates whether a given date is an official working day:
      - Monday through Friday: Always working days.
      - Sunday: Always an off day.
      - Saturday: 1st Saturday of the month (day 1-7) is OFF; all remaining Saturdays (day > 7) are WORKING DAYS.
    """
    w = date_obj.weekday()
    if w == 6:  # Sunday
        return False
    if w == 5:  # Saturday: 1st Saturday of the month is off
        return date_obj.day > 7
    return True  # Monday - Friday


def _get_recent_workdays(days: int = 7) -> List[str]:
    """Returns the last N workdays (Mon-Fri + working Saturdays, excluding 1st Sat & Sun) in ISO date format (YYYY-MM-DD), latest first."""
    workdays: List[str] = []
    current = datetime.now(timezone.utc).date()
    while len(workdays) < days:
        if is_workday(current):
            workdays.append(current.isoformat())
        current -= timedelta(days=1)
    return workdays


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

    cursor = (
        db.users.find(query, {"_id": 0, "hashed_password": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    users_list = await cursor.to_list(length=limit)
    return [_format_member_resp(u) for u in users_list]


@router.get("/members/activity", response_model=List[MemberActivityResponse])
async def get_members_activity(
    days: int = Query(7, ge=1, le=30, description="Number of past workdays to evaluate"),
):
    """Calculates Daily Log activity, missing workdays, and last logged date for all team members (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    workdays = _get_recent_workdays(days)
    today_iso = datetime.now(timezone.utc).date().isoformat()

    cursor = db.users.find({"is_active": True}, {"_id": 0, "hashed_password": 0}).sort("full_name", 1)
    members = await cursor.to_list(length=500)

    # Fetch recent log entries within the workday window
    min_date = workdays[-1] if workdays else today_iso
    entries_cursor = db.daily_log_entries.find(
        {"date": {"$gte": min_date}},
        {"_id": 0, "user_id": 1, "resource_name": 1, "date": 1},
    )
    entries = await entries_cursor.to_list(length=5000)

    # Map user/resource entries by date
    entries_by_user: dict = {}
    for entry in entries:
        uid = entry.get("user_id")
        rname = (entry.get("resource_name") or "").strip().lower()
        d = entry.get("date")
        if not d:
            continue

        if uid:
            entries_by_user.setdefault(uid, set()).add(d)
        if rname:
            entries_by_user.setdefault(rname, set()).add(d)

    activity_list: List[dict] = []
    for m in members:
        uid = m.get("id") or str(m.get("_id"))
        fname = m.get("full_name") or m.get("name", "User")
        fname_lower = fname.strip().lower()
        role = m.get("role", "team_member")
        department = m.get("department")
        is_exempt_role = role.lower() in ("admin", "hr", "client")

        if is_exempt_role:
            activity_list.append(
                {
                    "user_id": uid,
                    "full_name": fname,
                    "email": m["email"],
                    "phone": m.get("phone"),
                    "department": department,
                    "role": role,
                    "last_logged_date": None,
                    "logged_today": True,
                    "days_missed": 0,
                    "missing_dates": [],
                }
            )
            continue

        submitted_dates = entries_by_user.get(uid, set()).union(
            entries_by_user.get(fname_lower, set())
        )

        missing = [w for w in workdays if w not in submitted_dates]
        logged_today = today_iso in submitted_dates

        sorted_submitted = sorted(list(submitted_dates), reverse=True)
        last_logged = sorted_submitted[0] if sorted_submitted else None

        activity_list.append(
            {
                "user_id": uid,
                "full_name": fname,
                "email": m["email"],
                "phone": m.get("phone"),
                "department": department,
                "role": role,
                "last_logged_date": last_logged,
                "logged_today": logged_today,
                "days_missed": len(missing),
                "missing_dates": missing,
            }
        )

    return activity_list


@router.post("/members/{user_id}/remind", response_model=ReminderResponse)
async def send_member_reminder(
    user_id: str,
    reminder_in: ReminderRequest,
):
    """Trigger an email/in-app reminder to a specific team member who missed daily logs (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    member = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found.")

    workdays = _get_recent_workdays(7)
    today_iso = datetime.now(timezone.utc).date().isoformat()
    min_date = workdays[-1] if workdays else today_iso

    # Fetch member submitted dates
    fname = member.get("full_name") or member.get("name", "User")
    entries_cursor = db.daily_log_entries.find(
        {
            "date": {"$gte": min_date},
            "$or": [
                {"user_id": user_id},
                {"resource_name": {"$regex": f"^{fname}$", "$options": "i"}},
            ],
        },
        {"_id": 0, "date": 1},
    )
    entries = await entries_cursor.to_list(length=100)
    submitted_dates = {e["date"] for e in entries if e.get("date")}

    missing_dates = [w for w in workdays if w not in submitted_dates]
    if not missing_dates:
        missing_dates = [today_iso]

    now_iso = datetime.now(timezone.utc).isoformat()

    # Dispatch email reminder
    if reminder_in.channel in ("email", "all"):
        try:
            await EmailService.send_log_reminder(
                recipient_email=member["email"],
                recipient_name=fname,
                missing_dates=missing_dates,
                custom_message=reminder_in.custom_message,
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to dispatch email reminder: {str(e)}",
            )

    # Record notification in database
    notif_doc = {
        "id": f"notif_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "type": "daily_log_reminder",
        "channel": reminder_in.channel,
        "title": "Daily Log Submission Reminder",
        "message": reminder_in.custom_message
        or f"Reminder to submit daily log for {', '.join(missing_dates)}",
        "missing_dates": missing_dates,
        "created_at": now_iso,
        "read": False,
    }
    await db.notifications.insert_one(notif_doc)

    return {
        "success": True,
        "message": f"Daily Log reminder successfully sent to {member['email']}",
        "channel": reminder_in.channel,
        "recipient_email": member["email"],
        "recipient_name": fname,
        "missing_dates": missing_dates,
        "timestamp": now_iso,
    }


@router.post("/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
@router.post("/users", response_model=MemberResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_member(member_in: MemberCreate):
    """Create a new team member account (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    existing = await db.users.find_one({"email": member_in.email.lower()})
    if existing:
        raise HTTPException(
            status_code=400, detail="A member with this email address already exists."
        )

    user_id = f"usr_{uuid.uuid4().hex[:10]}"
    raw_pwd = (
        member_in.temporary_password.strip()
        if member_in.temporary_password
        else _generate_temp_password()
    )
    hashed_pwd = get_password_hash(raw_pwd)

    now_iso = datetime.now(timezone.utc).isoformat()
    user_doc = {
        "_id": user_id,
        "id": user_id,
        "email": member_in.email.lower(),
        "full_name": member_in.full_name.strip(),
        "name": member_in.full_name.strip(),
        "hashed_password": hashed_pwd,
        "role": member_in.role.value,
        "phone": member_in.phone.strip() if member_in.phone else None,
        "department": member_in.department.strip() if member_in.department else None,
        "is_active": member_in.is_active,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.users.insert_one(user_doc)
    return _format_member_resp(user_doc)


@router.patch("/members/{user_id}", response_model=MemberResponse, dependencies=[Depends(require_admin)])
@router.patch("/users/{user_id}", response_model=MemberResponse, dependencies=[Depends(require_admin)])
async def update_member(user_id: str, member_in: MemberUpdate):
    """Update a member's name, email, phone, password, role, or department."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    existing_user = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Member not found.")

    # Primary Admin Protection: Prevent deactivating or demoting Admin accounts
    if existing_user.get("role") == UserRole.ADMIN.value or existing_user.get("role") == "admin":
        if member_in.role is not None and member_in.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=400, detail="Cannot demote or modify the role of an Admin account."
            )
        if member_in.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate an Admin account.")

    update_fields = {}
    if member_in.full_name is not None:
        update_fields["full_name"] = member_in.full_name.strip()
        update_fields["name"] = member_in.full_name.strip()
    if member_in.email is not None:
        clean_email = str(member_in.email).lower().strip()
        conflict = await db.users.find_one(
            {
                "email": clean_email,
                "id": {"$ne": user_id},
                "_id": {"$ne": user_id},
            }
        )
        if conflict:
            raise HTTPException(
                status_code=400,
                detail="This email address is already in use by another account.",
            )
        update_fields["email"] = clean_email
    if member_in.phone is not None:
        update_fields["phone"] = member_in.phone.strip() if member_in.phone else None
    if member_in.password is not None and member_in.password.strip():
        if len(member_in.password.strip()) < 8:
            raise HTTPException(
                status_code=400, detail="Password must be at least 8 characters long."
            )
        update_fields["hashed_password"] = get_password_hash(member_in.password.strip())
    if member_in.role is not None:
        update_fields["role"] = member_in.role.value
    if member_in.department is not None:
        update_fields["department"] = (
            member_in.department.strip() if member_in.department else None
        )
    if member_in.is_active is not None:
        update_fields["is_active"] = member_in.is_active

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    res = await db.users.update_one(
        {"$or": [{"id": user_id}, {"_id": user_id}]}, {"$set": update_fields}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Member not found.")

    updated = await db.users.find_one(
        {"$or": [{"id": user_id}, {"_id": user_id}]}, {"_id": 0, "hashed_password": 0}
    )
    return _format_member_resp(updated)


@router.delete("/members/{user_id}", dependencies=[Depends(require_admin)])
@router.delete("/users/{user_id}", dependencies=[Depends(require_admin)])
async def delete_member(user_id: str):
    """Permanently delete a team member account from database (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    existing_user = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Member not found.")

    # Safety check: prevent deleting the last administrator
    if existing_user.get("role") in (UserRole.ADMIN.value, "admin"):
        admin_count = await db.users.count_documents(
            {"role": {"$in": [UserRole.ADMIN.value, "admin"]}}
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=400, detail="Cannot delete the primary administrator account."
            )

    res = await db.users.delete_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found or already removed.")

    return {"message": "Team member successfully deleted from database.", "id": user_id}


# ─── WORKSPACES MANAGEMENT (ADMIN ONLY) ──────────────────────────────────────

@router.get("/workspaces", response_model=List[WorkspaceResponse])
async def list_workspaces():
    """List all configured client agency workspaces."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    cursor = db.workspaces.find({})
    workspaces = await cursor.to_list(100)
    return [_format_workspace_resp(w) for w in workspaces]


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_workspace(ws_in: WorkspaceCreate):
    """Create a new client brand workspace (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    ws_id = f"ws-{uuid.uuid4().hex[:8]}"
    initials = ws_in.initials or ws_in.name[:2].upper()
    now_iso = datetime.now(timezone.utc).isoformat()

    ws_doc = {
        "id": ws_id,
        "name": ws_in.name,
        "brandColor": ws_in.brand_color or "bg-indigo-600",
        "brand_color": ws_in.brand_color or "bg-indigo-600",
        "initials": initials,
        "proposal_url": ws_in.proposal_url,
        "proposal_name": ws_in.proposal_name,
        "proposal_size": ws_in.proposal_size,
        "project_cycle": ws_in.project_cycle or "Retainer",
        "priority": ws_in.priority or "Medium",
        "contract_start_date": ws_in.contract_start_date,
        "contract_end_date": ws_in.contract_end_date,
        "services": ws_in.services or [],
        "health": ws_in.health or "Good",
        "poc_name": ws_in.poc_name,
        "poc_email": ws_in.poc_email,
        "poc_phone": ws_in.poc_phone,
        "billing_name": ws_in.billing_name,
        "billing_email": ws_in.billing_email,
        "billing_phone": ws_in.billing_phone,
        "isDefault": ws_in.is_default,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    await db.workspaces.insert_one(ws_doc.copy())
    return _format_workspace_resp(ws_doc)


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceResponse, dependencies=[Depends(require_admin)])
async def update_workspace(workspace_id: str, ws_in: WorkspaceUpdate):
    """Update a client brand workspace."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    update_fields = {}
    if ws_in.name is not None:
        update_fields["name"] = ws_in.name
    if ws_in.brand_color is not None:
        update_fields["brandColor"] = ws_in.brand_color
        update_fields["brand_color"] = ws_in.brand_color
    if ws_in.initials is not None:
        update_fields["initials"] = ws_in.initials
    if ws_in.proposal_url is not None:
        update_fields["proposal_url"] = ws_in.proposal_url
    if ws_in.proposal_name is not None:
        update_fields["proposal_name"] = ws_in.proposal_name
    if ws_in.proposal_size is not None:
        update_fields["proposal_size"] = ws_in.proposal_size
    if ws_in.project_cycle is not None:
        update_fields["project_cycle"] = ws_in.project_cycle
    if ws_in.priority is not None:
        update_fields["priority"] = ws_in.priority
    if ws_in.contract_start_date is not None:
        update_fields["contract_start_date"] = ws_in.contract_start_date
    if ws_in.contract_end_date is not None:
        update_fields["contract_end_date"] = ws_in.contract_end_date
    if ws_in.services is not None:
        update_fields["services"] = ws_in.services
    if ws_in.health is not None:
        update_fields["health"] = ws_in.health
    if ws_in.poc_name is not None:
        update_fields["poc_name"] = ws_in.poc_name
    if ws_in.poc_email is not None:
        update_fields["poc_email"] = ws_in.poc_email
    if ws_in.poc_phone is not None:
        update_fields["poc_phone"] = ws_in.poc_phone
    if ws_in.billing_name is not None:
        update_fields["billing_name"] = ws_in.billing_name
    if ws_in.billing_email is not None:
        update_fields["billing_email"] = ws_in.billing_email
    if ws_in.billing_phone is not None:
        update_fields["billing_phone"] = ws_in.billing_phone
    if ws_in.is_default is not None:
        update_fields["isDefault"] = ws_in.is_default

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    res = await db.workspaces.find_one_and_update(
        {"id": workspace_id}, {"$set": update_fields}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    return _format_workspace_resp(res)


@router.delete("/workspaces/{workspace_id}", dependencies=[Depends(require_admin)])
async def delete_workspace(workspace_id: str):
    """Delete a client workspace (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    res = await db.workspaces.delete_one({"id": workspace_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    return {"message": "Workspace deleted successfully."}


# ─── AD ACCOUNTS MANAGEMENT (ADMIN ONLY) ────────────────────────────────────

@router.get("/ad-accounts", response_model=List[AdAccountResponse])
async def list_ad_accounts():
    """List all configured advertising accounts from db.ad_accounts."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    cursor = db.ad_accounts.find({})
    accounts = await cursor.to_list(100)

    resp = []
    for a in accounts:
        resp.append(await _format_ad_account_resp(a, db))
    return resp


@router.post("/ad-accounts", response_model=AdAccountResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_ad_account(acc_in: AdAccountCreate):
    """Create a new advertising account in db.ad_accounts (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    acc_id = f"adacc-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    platform = "Google Ads" if "google" in acc_in.platform.lower() and "meta" not in acc_in.platform.lower() else "Meta Ads"

    acc_doc = {
        "id": acc_id,
        "name": acc_in.name,
        "platform": platform,
        "account_id": acc_in.account_id,
        "pixel_id": acc_in.pixel_id,
        "workspace_id": acc_in.workspace_id,
        "currency": acc_in.currency or "USD",
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    await db.ad_accounts.insert_one(acc_doc.copy())

    # Upsert credentials if provided
    if acc_in.access_token or acc_in.refresh_token or acc_in.developer_token or acc_in.client_id:
        cred_doc = {
            "account_id": acc_in.account_id,
            "workspace_id": acc_in.workspace_id or acc_id,
            "workspace_name": acc_in.name,
            "platform": "Google" if "google" in platform.lower() else "Meta",
            "access_token": acc_in.access_token or "",
            "refresh_token": acc_in.refresh_token or "",
            "developer_token": acc_in.developer_token or "",
            "client_id": acc_in.client_id or "",
            "client_secret": acc_in.client_secret or "",
            "updated_at": now_iso,
        }
        await db.ad_account_credentials.update_one(
            {"account_id": acc_in.account_id},
            {"$set": cred_doc},
            upsert=True
        )

    return await _format_ad_account_resp(acc_doc, db)


@router.patch("/ad-accounts/{account_id}", response_model=AdAccountResponse, dependencies=[Depends(require_admin)])
async def update_ad_account(account_id: str, acc_in: AdAccountUpdate):
    """Update an ad account's platform, account ID, currency, or associated workspace."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    update_fields = {}
    if acc_in.name is not None:
        update_fields["name"] = acc_in.name
    if acc_in.platform is not None:
        platform = "Google Ads" if "google" in acc_in.platform.lower() and "meta" not in acc_in.platform.lower() else "Meta Ads"
        update_fields["platform"] = platform
    if acc_in.account_id is not None:
        update_fields["account_id"] = acc_in.account_id
    if acc_in.pixel_id is not None:
        update_fields["pixel_id"] = acc_in.pixel_id
    if acc_in.workspace_id is not None:
        update_fields["workspace_id"] = acc_in.workspace_id
    if acc_in.currency is not None:
        update_fields["currency"] = acc_in.currency

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    res = await db.ad_accounts.find_one_and_update(
        {"id": account_id}, {"$set": update_fields}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Ad account not found.")

    # Upsert credentials if provided
    if acc_in.access_token or acc_in.refresh_token or acc_in.developer_token or acc_in.client_id:
        target_account_id = acc_in.account_id or res.get("account_id")
        cred_doc = {
            "account_id": target_account_id,
            "workspace_id": acc_in.workspace_id or res.get("workspace_id") or account_id,
            "workspace_name": acc_in.name or res.get("name"),
            "platform": "Google" if "google" in str(res.get("platform", "")).lower() else "Meta",
            "access_token": acc_in.access_token or "",
            "refresh_token": acc_in.refresh_token or "",
            "developer_token": acc_in.developer_token or "",
            "client_id": acc_in.client_id or "",
            "client_secret": acc_in.client_secret or "",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ad_account_credentials.update_one(
            {"account_id": target_account_id},
            {"$set": cred_doc},
            upsert=True
        )

    return await _format_ad_account_resp(res, db)


@router.delete("/ad-accounts/{account_id}", dependencies=[Depends(require_admin)])
async def delete_ad_account(account_id: str):
    """Delete an ad account from db.ad_accounts (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    res = await db.ad_accounts.delete_one({"id": account_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ad account not found.")

    return {"message": "Ad account deleted successfully."}


# ─── DYNAMIC SYSTEM DEPARTMENTS & ROLES SETTINGS ─────────────────────────────

DEFAULT_SYSTEM_CONFIG = {
    "departments": [
        "Website",
        "Creative",
        "Content",
        "SEO",
        "Performance Marketing",
        "AI",
    ],
    "roles": [
        {"id": "admin", "label": "Admin", "description": "Full system control and user management"},
        {"id": "hr", "label": "HR", "description": "All departments logs & compliance access"},
        {"id": "team_lead", "label": "Team Lead", "description": "Leads department and oversees team logs"},
        {"id": "team_member", "label": "Team Member", "description": "Records own tasks & daily logs"},
        {"id": "client", "label": "Client", "description": "Sandbox Client Portal & Approvals only"},
    ],
}

@router.get("/system-config")
async def get_system_config():
    """Retrieve dynamic agency departments and roles configuration."""
    db = get_database()
    if db is None:
        return DEFAULT_SYSTEM_CONFIG

    cfg = await db.system_settings.find_one({"key": "system_config"}, {"_id": 0})
    if not cfg:
        return DEFAULT_SYSTEM_CONFIG

    return {
        "departments": cfg.get("departments") or DEFAULT_SYSTEM_CONFIG["departments"],
        "roles": cfg.get("roles") or DEFAULT_SYSTEM_CONFIG["roles"],
    }


@router.put("/system-config", dependencies=[Depends(require_admin)])
async def update_system_config(config_in: dict):
    """Update dynamic agency departments and roles configuration (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    departments = config_in.get("departments")
    roles = config_in.get("roles")

    if not isinstance(departments, list) or not isinstance(roles, list):
        raise HTTPException(status_code=400, detail="Invalid system configuration payload.")

    clean_departments = [str(d).strip() for d in departments if str(d).strip()]
    if not clean_departments:
        clean_departments = DEFAULT_SYSTEM_CONFIG["departments"]

    clean_roles = []
    for r in roles:
        if isinstance(r, dict) and r.get("id") and r.get("label"):
            clean_roles.append({
                "id": str(r["id"]).strip().lower().replace(" ", "_"),
                "label": str(r["label"]).strip(),
                "description": str(r.get("description", "")).strip(),
            })

    if not clean_roles:
        clean_roles = DEFAULT_SYSTEM_CONFIG["roles"]

    doc = {
        "key": "system_config",
        "departments": clean_departments,
        "roles": clean_roles,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.system_settings.update_one(
        {"key": "system_config"},
        {"$set": doc},
        upsert=True,
    )

    return {
        "departments": clean_departments,
        "roles": clean_roles,
    }
