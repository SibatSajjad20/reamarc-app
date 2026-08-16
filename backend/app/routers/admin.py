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
    AdAccountCreate,
    AdAccountUpdate,
    AdAccountResponse,
)
from app.schemas.error import ErrorResponse
from app.core.security import require_admin, get_password_hash
from app.database import get_database
from app.services.email_service import EmailService

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
    },
)


def _format_member_resp(doc: dict) -> dict:
    raw_role = doc.get("role", UserRole.MEMBER.value)
    role_val = UserRole.ADMIN if raw_role == "admin" else UserRole.MEMBER
    return {
        "id": doc.get("id") or str(doc.get("_id")),
        "email": doc["email"],
        "full_name": doc.get("full_name") or doc.get("name", "User"),
        "role": role_val,
        "phone": doc.get("phone"),
        "department": doc.get("department"),
        "designation": doc.get("designation"),
        "is_active": doc.get("is_active", True),
        "created_at": doc.get("created_at"),
    }


def _format_account_resp(doc: dict) -> dict:
    name = doc.get("name", "Ad Account")
    platform = doc.get("platform")
    if not platform or platform in ("Meta / Google", "Meta Ads / Google Ads"):
        if any(k in name.lower() for k in ["ed&c", "ednc", "elegant design"]):
            platform = "Meta & Google"
        else:
            platform = "Meta Ads"

    return {
        "id": doc.get("id") or str(doc.get("_id")),
        "name": name,
        "platform": platform,
        "industry": doc.get("industry", "General B2B"),
        "brandColor": doc.get("brandColor") or doc.get("brand_color", "bg-indigo-600"),
        "brand_color": doc.get("brand_color") or doc.get("brandColor", "bg-indigo-600"),
        "initials": doc.get("initials") or name[:2].upper(),
        "account_id": doc.get("account_id"),
        "pixel_id": doc.get("pixel_id"),
        "isDefault": doc.get("isDefault", False),
        "created_at": doc.get("created_at"),
    }


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _get_recent_workdays(days: int = 7) -> List[str]:
    """Returns the last N workdays (excluding weekends) in ISO date format (YYYY-MM-DD), latest first."""
    workdays: List[str] = []
    current = datetime.now(timezone.utc).date()
    while len(workdays) < days:
        if current.weekday() < 5:  # Monday to Friday
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
        role = m.get("role", "member")
        is_admin_role = role in ("admin", "ADMIN")

        if is_admin_role:
            activity_list.append(
                {
                    "user_id": uid,
                    "full_name": fname,
                    "email": m["email"],
                    "phone": m.get("phone"),
                    "designation": m.get("designation"),
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
                "designation": m.get("designation"),
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


@router.post("/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
@router.post("/users", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
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
        "designation": member_in.designation.strip() if member_in.designation else None,
        "is_active": member_in.is_active,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.users.insert_one(user_doc)
    return _format_member_resp(user_doc)


@router.patch("/members/{user_id}", response_model=MemberResponse)
@router.patch("/users/{user_id}", response_model=MemberResponse)
async def update_member(user_id: str, member_in: MemberUpdate):
    """Update a member's name, email, phone, password, role, or designation."""
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
    if member_in.designation is not None:
        update_fields["designation"] = (
            member_in.designation.strip() if member_in.designation else None
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


@router.delete("/members/{user_id}")
@router.delete("/users/{user_id}")
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


# ─── AD ACCOUNT & BRAND MANAGEMENT (ADMIN ONLY) ───────────────────────────────

@router.get("/ad-accounts", response_model=List[AdAccountResponse])
@router.get("/workspaces", response_model=List[AdAccountResponse])
async def list_ad_accounts():
    """List all configured client ad accounts / brands."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    cursor = db.workspaces.find({})
    accounts = await cursor.to_list(100)
    return [_format_account_resp(a) for a in accounts]


@router.post("/ad-accounts", response_model=AdAccountResponse, status_code=status.HTTP_201_CREATED)
@router.post("/workspaces", response_model=AdAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_ad_account(acc_in: AdAccountCreate):
    """Create a new client brand / ad account profile (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    acc_id = f"acc-{uuid.uuid4().hex[:8]}"
    initials = acc_in.initials or acc_in.name[:2].upper()
    now_iso = datetime.now(timezone.utc).isoformat()

    acc_doc = {
        "id": acc_id,
        "name": acc_in.name,
        "platform": acc_in.platform or "Meta Ads",
        "initials": initials,
        "brandColor": acc_in.brand_color or "bg-indigo-600",
        "brand_color": acc_in.brand_color or "bg-indigo-600",
        "industry": acc_in.industry or "General B2B",
        "account_id": acc_in.account_id,
        "pixel_id": acc_in.pixel_id,
        "isDefault": False,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    await db.workspaces.insert_one(acc_doc.copy())
    return _format_account_resp(acc_doc)


@router.patch("/ad-accounts/{account_id}", response_model=AdAccountResponse)
@router.patch("/workspaces/{account_id}", response_model=AdAccountResponse)
async def update_ad_account(account_id: str, acc_in: AdAccountUpdate):
    """Update an ad account's details, platform, or brand styling."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    update_fields = {}
    if acc_in.name is not None:
        update_fields["name"] = acc_in.name
    if acc_in.platform is not None:
        update_fields["platform"] = acc_in.platform
    if acc_in.industry is not None:
        update_fields["industry"] = acc_in.industry
    if acc_in.brand_color is not None:
        update_fields["brandColor"] = acc_in.brand_color
        update_fields["brand_color"] = acc_in.brand_color
    if acc_in.initials is not None:
        update_fields["initials"] = acc_in.initials
    if acc_in.account_id is not None:
        update_fields["account_id"] = acc_in.account_id
    if acc_in.pixel_id is not None:
        update_fields["pixel_id"] = acc_in.pixel_id

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    res = await db.workspaces.find_one_and_update(
        {"id": account_id}, {"$set": update_fields}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Ad account not found.")

    return _format_account_resp(res)


@router.delete("/ad-accounts/{account_id}")
@router.delete("/workspaces/{account_id}")
async def delete_ad_account(account_id: str):
    """Delete an ad account (Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    res = await db.workspaces.delete_one({"id": account_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ad account not found.")

    return {"message": "Ad account deleted successfully."}
