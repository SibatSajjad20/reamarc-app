from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
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
from app.core.security import (
    require_admin,
    require_hr_or_admin,
    require_operations_or_admin,
    require_management_role,
    get_password_hash,
)
from app.database import get_database
from app.services.email_service import EmailService
from app.services.log_compliance import pkt_today, PKT, batch_expected_targets, person_day_is_leave, person_day_is_due
from app.routers.daily_log import is_workday, SYSTEM_START_DATE

router = APIRouter(
    prefix="/admin",
    tags=["Admin Management"],
    dependencies=[Depends(require_management_role)],
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
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

    dept = doc.get("department")
    if role_val in (UserRole.ADMIN, UserRole.HR, UserRole.OPERATIONS):
        dept = "All"

    return {
        "id": doc.get("id") or str(doc.get("_id")),
        "email": doc["email"],
        "full_name": doc.get("full_name") or doc.get("name", "User"),
        "role": role_val,
        "phone": doc.get("phone"),
        "department": dept,
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
        "status": str(doc.get("status", "active")),
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
        "name": doc.get("name", "Untitled Account"),
        "platform": doc.get("platform", "Meta Ads"),
        "account_id": doc.get("account_id", ""),
        "pixel_id": doc.get("pixel_id"),
        "workspace_id": ws_id,
        "workspace_name": ws_name,
        "currency": doc.get("currency", "USD"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ─── TEAM DIRECTORY & MEMBERS ────────────────────────────────────────────────

@router.get("/members", response_model=List[MemberResponse])
@router.get("/users", response_model=List[MemberResponse])
async def list_members(
    department: Optional[str] = Query(None, description="Filter by department name"),
    role: Optional[str] = Query(None, description="Filter by member role (admin, hr, operations, team_lead, team_member)"),
    search: Optional[str] = Query(None, description="Search by name or email"),
):
    """List all registered members in the organization."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    query = {}
    if department:
        query["department"] = {"$regex": f"^{department}$", "$options": "i"}
    if role:
        query["role"] = role.lower()
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]

    cursor = db.users.find(query).sort("created_at", -1)
    members = await cursor.to_list(200)
    return [_format_member_resp(m) for m in members]


@router.get("/members/activity", response_model=List[MemberActivityResponse])
async def list_members_activity(
    department: Optional[str] = Query(None, description="Filter activity by department"),
):
    """Retrieve daily log compliance and activity status for all active team members."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    query = {
        "role": {
            "$nin": [
                "admin",
                "client",
                "operations",
                UserRole.ADMIN.value,
                UserRole.CLIENT.value,
                UserRole.OPERATIONS.value,
            ]
        }
    }
    if department:
        query["department"] = {"$regex": f"^{department}$", "$options": "i"}

    cursor = db.users.find(query).sort("full_name", 1)
    users = await cursor.to_list(200)

    now = datetime.now(PKT)
    today_str = pkt_today()

    try:
        start_date_obj = datetime.strptime(SYSTEM_START_DATE, "%Y-%m-%d").date()
    except Exception:
        start_date_obj = now.date()

    from app.services.workdays import recent_company_workdays
    workdays = await recent_company_workdays(7, start_date=SYSTEM_START_DATE)

    user_ids = [u.get("id") or str(u.get("_id")) for u in users]
    att_by_key: dict = {}
    if user_ids and workdays:
        att_docs = await db.attendance_records.find(
            {"user_id": {"$in": user_ids}, "date": {"$in": workdays}},
            {"_id": 0, "user_id": 1, "date": 1, "check_in": 1, "punch_in": 1, "check_out": 1, "punch_out": 1, "work_hours": 1, "status": 1},
        ).to_list(4000)
        for rec in att_docs:
            if rec.get("user_id") and rec.get("date"):
                att_by_key[(rec["user_id"], rec["date"])] = rec
    targets = await batch_expected_targets(users, workdays) if workdays else {}

    result = []
    for u in users:
        uid = u.get("id") or str(u.get("_id"))
        fname = u.get("full_name") or u.get("name", "User")
        
        recent_entries = await db.daily_log_entries.find(
            {
                "$or": [{"user_id": uid}, {"resource_name": {"$regex": f"^{fname}$", "$options": "i"}}],
                "date": {"$in": workdays}
            },
            {"date": 1}
        ).to_list(20)
        logged_dates = {e["date"] for e in recent_entries if e.get("date")}
        logged_today = today_str in logged_dates

        missing = []
        for d in workdays:
            if d in logged_dates:
                continue
            att = att_by_key.get((uid, d)) or {}
            target = targets.get((uid, d)) or {}
            if person_day_is_leave(target, att):
                continue
            if d == today_str and not person_day_is_due(d, today_str, target, att):
                continue
            missing.append(d)

        last_entry = await db.daily_log_entries.find_one(
            {"$or": [{"user_id": uid}, {"resource_name": {"$regex": f"^{fname}$", "$options": "i"}}]},
            sort=[("date", -1)]
        )
        last_logged = last_entry["date"] if last_entry and last_entry.get("date") else None

        result.append({
            "user_id": uid,
            "full_name": fname,
            "email": u["email"],
            "phone": u.get("phone"),
            "department": u.get("department"),
            "role": u.get("role", "team_member"),
            "last_logged_date": last_logged,
            "logged_today": logged_today,
            "days_missed": len(missing),
            "missing_dates": missing,
        })

    return result


@router.post("/members/{user_id}/remind", response_model=ReminderResponse, dependencies=[Depends(require_hr_or_admin)])
@router.post("/users/{user_id}/remind", response_model=ReminderResponse, dependencies=[Depends(require_hr_or_admin)])
@router.post("/remind-log", response_model=ReminderResponse, dependencies=[Depends(require_hr_or_admin)])
async def remind_member_log(
    user_id: Optional[str] = None,
    reminder_in: Optional[ReminderRequest] = Body(default=None),
):
    """Send an automated or custom email reminder to a member who missed their daily log."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    if not user_id:
        raise HTTPException(status_code=400, detail="User ID is required.")

    req = reminder_in or ReminderRequest()

    member = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")

    open_req = await db.daily_log_day_scores.find_one(
        {
            "user_id": user_id,
            "action_status": {"$in": ["waiting_on_employee", "waiting_on_reviewer"]},
        },
        {"_id": 0, "date": 1, "action_by_name": 1},
    )
    if open_req:
        who = open_req.get("action_by_name") or "their lead"
        raise HTTPException(
            status_code=409,
            detail=f"Already has an open log request from {who} for {open_req.get('date')}. Use Exceptions instead of a second reminder.",
        )

    now = datetime.now(PKT)
    today_str = pkt_today()
    try:
        start_date_obj = datetime.strptime(SYSTEM_START_DATE, "%Y-%m-%d").date()
    except Exception:
        start_date_obj = now.date()

    from app.services.workdays import recent_company_workdays
    workdays = await recent_company_workdays(7, start_date=SYSTEM_START_DATE)

    fname = member.get("full_name") or member.get("name", "Team Member")
    recent_entries = await db.daily_log_entries.find(
        {
            "$or": [{"user_id": user_id}, {"resource_name": {"$regex": f"^{fname}$", "$options": "i"}}],
            "date": {"$in": workdays}
        },
        {"date": 1}
    ).to_list(20)
    logged_dates = {e["date"] for e in recent_entries if e.get("date")}
    att_docs = await db.attendance_records.find(
        {"user_id": user_id, "date": {"$in": workdays}},
        {"_id": 0, "date": 1, "check_out": 1, "punch_out": 1, "work_hours": 1, "status": 1},
    ).to_list(20)
    att_by_day = {d.get("date"): d for d in att_docs if d.get("date")}
    targets = await batch_expected_targets([member], workdays)
    missing_dates = []
    for d in workdays:
        if d in logged_dates:
            continue
        att = att_by_day.get(d) or {}
        target = targets.get((user_id, d)) or {}
        if person_day_is_leave(target, att):
            continue
        if d == today_str and not person_day_is_due(d, today_str, target, att):
            continue
        missing_dates.append(d)
    if not missing_dates:
        raise HTTPException(
            status_code=409,
            detail="Nothing to remind — they are on leave or today's shift has not finished.",
        )

    formatted_missing = ", ".join(missing_dates) if missing_dates else today_str

    if req.channel in ("email", "all"):
        try:
            await EmailService.send_log_reminder(
                recipient_email=member["email"],
                recipient_name=fname,
                missing_dates=missing_dates,
                custom_message=req.custom_message,
            )
        except Exception as e:
            logger.error(f"[Admin] Email sending failed for {member['email']}: {e}")

    now_iso = now.isoformat()
    notif_doc = {
        "id": f"notif_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "title": "Daily Log Submission Reminder",
        "message": req.custom_message
        or f"Reminder to submit daily log for {formatted_missing}",
        "missing_dates": missing_dates,
        "created_at": now_iso,
        "read": False,
    }
    await db.notifications.insert_one(notif_doc)

    return {
        "success": True,
        "message": f"Daily Log reminder for ({formatted_missing}) successfully sent to {member['email']}",
        "user_id": user_id,
        "channel": req.channel,
        "recipient_email": member["email"],
        "recipient_name": fname,
        "missing_dates": missing_dates,
        "timestamp": now_iso,
    }


@router.post("/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_hr_or_admin)])
@router.post("/users", response_model=MemberResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_hr_or_admin)])
async def create_member(member_in: MemberCreate):
    """Create a new team member account (HR or Admin)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    # Prevent creating additional Super Admin accounts
    if member_in.role in (UserRole.ADMIN, "admin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Creating additional Super Admin accounts is not permitted. Only one Super Admin exists.",
        )

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

    # Auto set department: "All" for Admin/Operations, "HR" for HR
    if member_in.role in (UserRole.ADMIN, UserRole.OPERATIONS):
        dept_val = "All"
    elif member_in.role == UserRole.HR:
        dept_val = member_in.department.strip() if (member_in.department and member_in.department != "All") else "HR"
    else:
        dept_val = member_in.department.strip() if member_in.department else None

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
        "phone_number": member_in.phone.strip() if member_in.phone else None,
        "department": dept_val,
        "is_active": member_in.is_active,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.users.insert_one(user_doc)
    return _format_member_resp(user_doc)


@router.patch("/members/{user_id}", response_model=MemberResponse)
@router.patch("/users/{user_id}", response_model=MemberResponse)
async def update_member(
    user_id: str,
    member_in: MemberUpdate,
    current_user: dict = Depends(require_hr_or_admin),
):
    """Update a member's name, email, phone, password, role, or department (HR or Admin)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    existing_user = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Member not found.")

    is_target_admin = existing_user.get("role") in (UserRole.ADMIN.value, "admin")
    is_caller_admin = current_user.get("role") in (UserRole.ADMIN.value, "admin")

    # Super Admin Protection: HR cannot modify the Super Admin account
    if is_target_admin and not is_caller_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR cannot modify the Super Admin account. Only the Super Admin can edit their own profile.",
        )

    # Primary Admin Protection: Prevent deactivating or demoting Admin accounts
    if is_target_admin:
        if member_in.role is not None and member_in.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=400, detail="Cannot demote or modify the role of an Admin account."
            )
        if member_in.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate an Admin account.")

    # Prevent promoting any non-admin to admin
    if not is_target_admin and member_in.role in (UserRole.ADMIN, "admin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Promoting accounts to Super Admin is not permitted.",
        )

    update_fields = {}
    if member_in.full_name is not None:
        update_fields["full_name"] = member_in.full_name.strip()
        update_fields["name"] = member_in.full_name.strip()
    if member_in.email is not None:
        new_email = member_in.email.lower()
        if new_email != existing_user.get("email"):
            conflict = await db.users.find_one({"email": new_email, "id": {"$ne": user_id}})
            if conflict:
                raise HTTPException(status_code=400, detail="Email is already taken by another user.")
        update_fields["email"] = new_email
    if member_in.phone is not None:
        update_fields["phone"] = member_in.phone.strip()
        update_fields["phone_number"] = member_in.phone.strip()
    if member_in.password is not None and member_in.password.strip():
        update_fields["hashed_password"] = get_password_hash(member_in.password.strip())
    if member_in.role is not None:
        update_fields["role"] = member_in.role.value
        if member_in.role in (UserRole.ADMIN, UserRole.OPERATIONS):
            update_fields["department"] = "All"
        elif member_in.role == UserRole.HR:
            update_fields["department"] = "HR"
    if member_in.department is not None:
        target_role = member_in.role.value if member_in.role else existing_user.get("role")
        if target_role in ("admin", "operations", UserRole.ADMIN.value, UserRole.OPERATIONS.value):
            update_fields["department"] = "All"
        elif target_role in ("hr", UserRole.HR.value):
            update_fields["department"] = member_in.department.strip() if (member_in.department and member_in.department != "All") else "HR"
        else:
            update_fields["department"] = member_in.department.strip()
    if member_in.is_active is not None:
        update_fields["is_active"] = member_in.is_active

    if not update_fields:
        return _format_member_resp(existing_user)

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated_user = await db.users.find_one_and_update(
        {"$or": [{"id": user_id}, {"_id": user_id}]},
        {"$set": update_fields},
        return_document=True,
    )
    return _format_member_resp(updated_user)


@router.delete("/members/{user_id}")
@router.delete("/users/{user_id}")
async def delete_member(
    user_id: str,
    current_user: dict = Depends(require_hr_or_admin),
):
    """Delete a user account (HR or Admin)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    existing_user = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Member not found.")

    if existing_user.get("role") in (UserRole.ADMIN.value, "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The Super Admin account cannot be deleted.",
        )

    await db.users.delete_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    from app.services.member_cleanup import purge_user_related_records, purge_orphaned_member_records
    await purge_user_related_records(db, existing_user, user_id)
    await purge_orphaned_member_records(db)
    return {"message": "Member and all related logs, attendance, and leave records were deleted."}


# ─── WORKSPACES MANAGEMENT ───────────────────────────────────────────────────

@router.get("/workspaces", response_model=List[WorkspaceResponse])
async def list_workspaces():
    """List all configured client agency workspaces."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    cursor = db.workspaces.find({})
    workspaces = await cursor.to_list(100)
    return [_format_workspace_resp(w) for w in workspaces]


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_operations_or_admin)])
async def create_workspace(ws_in: WorkspaceCreate):
    """Create a new client brand workspace (Operations or Admin)."""
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
        "status": ws_in.status or "active",
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


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceResponse, dependencies=[Depends(require_operations_or_admin)])
async def update_workspace(workspace_id: str, ws_in: WorkspaceUpdate):
    """Update a client brand workspace (Operations or Admin)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    update_fields = {}
    if ws_in.name is not None:
        update_fields["name"] = ws_in.name
    if ws_in.brand_color is not None:
        update_fields["brandColor"] = ws_in.brand_color
        update_fields["brand_color"] = ws_in.brand_color
    if ws_in.status is not None:
        update_fields["status"] = ws_in.status
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


@router.delete("/workspaces/{workspace_id}", dependencies=[Depends(require_operations_or_admin)])
async def delete_workspace(workspace_id: str):
    """Disallow workspace deletion."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Workspace deletion is disabled. Workspaces can only be marked as Inactive.",
    )


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
    """Update an ad account's platform, account ID, currency, or associated workspace (Admin only)."""
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
