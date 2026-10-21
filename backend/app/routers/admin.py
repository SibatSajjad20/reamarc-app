from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from typing import List, Optional, Dict, Set, Any
import logging
import uuid
import secrets
import string
import re
from datetime import datetime, timezone, timedelta, date

from app.schemas.user import (
    MemberCreate,
    MemberUpdate,
    MemberResponse,
    MemberActivityResponse,
    ReminderRequest,
    ReminderResponse,
    member_phone_from_doc,
)
from app.models.user import UserRole, EmploymentType
from app.services.attendance_golive import purge_pre_joining_attendance
from app.core.mongo_filters import exact_ci, contains_ci
from app.schemas.admin import (
    WorkspaceCreate,
    WorkspaceUpdate,
    WorkspaceResponse,
    AdAccountCreate,
    AdAccountUpdate,
    AdAccountResponse,
)
from app.config import settings
from app.schemas.error import ErrorResponse
from app.core.security import (
    require_admin,
    require_hr_or_admin,
    require_operations_or_admin,
    require_management_role,
    get_password_hash,
    bump_session_epoch,
    invalidate_auth_cache,
    get_current_user,
)
from app.core.mongo_filters import exact_ci
from app.database import get_database
from app.core.encryption import encrypt_credential_fields
from app.services.email_service import EmailService
from app.services.log_compliance import pkt_today, PKT, batch_expected_targets, person_day_is_leave, person_day_is_due
from app.routers.daily_log import is_workday, SYSTEM_START_DATE
from app.services.access import (
    canonicalize_departments,
    get_primary_stage,
    normalize_stage,
)

logger = logging.getLogger(__name__)

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


def _format_datetime(v: Any) -> Optional[str]:
    if v is None:
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


def _format_date(v: Any) -> Optional[str]:
    if v is None:
        return None
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    return str(v)


def _format_member_resp(doc: dict) -> dict:
    raw_role = doc.get("role", UserRole.TEAM_MEMBER.value)
    try:
        role_val = UserRole(raw_role)
    except ValueError:
        role_val = UserRole.TEAM_MEMBER

    dept = doc.get("department")
    primary_out = None
    if role_val in (UserRole.ADMIN, UserRole.OPERATIONS):
        dept = "All"
        depts = ["All"]
        primary_out = "All"
    elif role_val == UserRole.HR:
        dept = "HR"
        depts = ["HR"]
        primary_out = "HR"
    elif role_val == UserRole.CLIENT:
        dept = None
        depts = []
        primary_out = None
    else:
        packed = canonicalize_departments(
            departments=doc.get("departments") if isinstance(doc.get("departments"), list) else None,
            primary=doc.get("primary_department"),
            department=dept if isinstance(dept, str) else None,
        )
        depts = packed["departments"]
        dept = packed["department"]
        primary_out = packed["primary_department"]

    raw_emp = str(doc.get("employment_type") or EmploymentType.CONTRACT.value).lower()
    try:
        employment_type = EmploymentType(raw_emp)
    except ValueError:
        employment_type = EmploymentType.CONTRACT

    return {
        "id": doc.get("id") or str(doc.get("_id")),
        "email": doc["email"],
        "full_name": doc.get("full_name") or doc.get("name", "User"),
        "role": role_val,
        "phone": member_phone_from_doc(doc),
        "department": dept,
        "departments": depts,
        "primary_department": primary_out,
        "joining_date": _format_date(doc.get("joining_date")),
        "employment_type": employment_type,
        "probation_start_date": _format_date(doc.get("probation_start_date")),
        "probation_end_date": _format_date(doc.get("probation_end_date")),
        "is_active": doc.get("is_active", True),
        "deactivated_at": _format_datetime(doc.get("deactivated_at")),
        "deactivation_date": _format_date(doc.get("deactivation_date")),
        "created_at": _format_datetime(doc.get("created_at")),
        "workspace_ids": [str(value) for value in (doc.get("workspace_ids") or []) if value],
        "avatar_url": doc.get("avatar_url"),
        "company_id": doc.get("company_id"),
        "is_super_admin": doc.get("is_super_admin", False),
        "needs_setup": bool(doc.get("needs_setup", False)),
        "login_managed_elsewhere": bool(doc.get("login_managed_elsewhere", False)),
        "can_edit": bool(doc.get("can_edit", True)),
        "can_edit_identity": bool(doc.get("can_edit_identity", True)),
        "can_edit_role": bool(doc.get("can_edit_role", True)),
    }


MEMBERSHIP_ONLY_USER_KEYS = {
    "role",
    "department",
    "departments",
    "primary_department",
    "needs_setup",
}


async def _attach_member_edit_flags(
    resp: dict,
    caller: dict,
    target_user: dict,
    target_role: Any,
    *,
    extra_active_memberships: Optional[int] = None,
) -> dict:
    from app.services.identity_guard import member_edit_flags

    flags = await member_edit_flags(
        caller,
        target_user,
        target_role,
        extra_active_memberships=extra_active_memberships,
    )
    resp["can_edit"] = flags.can_edit
    resp["can_edit_identity"] = flags.can_edit_identity
    resp["can_edit_role"] = flags.can_edit_role
    return resp


async def _client_workspace_ids(db, raw_ids: list) -> list:
    """Active client workspaces a client login is allowed to review."""
    cleaned = []
    for raw in raw_ids or []:
        workspace_id = str(raw or "").strip()
        if workspace_id and workspace_id not in cleaned:
            cleaned.append(workspace_id)
    if not cleaned:
        raise HTTPException(
            status_code=400,
            detail="A client account must be linked to at least one active client.",
        )
    found = await db.workspaces.find(
        {"id": {"$in": cleaned}, "status": {"$ne": "inactive"}},
        {"id": 1},
    ).to_list(length=200)
    found_ids = {str(doc.get("id")) for doc in found}
    missing = [workspace_id for workspace_id in cleaned if workspace_id not in found_ids]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="One or more selected clients are not active.",
        )
    return cleaned


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
        "contract_start_date": _format_date(doc.get("contract_start_date")),
        "contract_end_date": _format_date(doc.get("contract_end_date")),
        "services": doc.get("services") or [],
        "health": doc.get("health", "Good"),
        "poc_name": doc.get("poc_name"),
        "poc_email": doc.get("poc_email"),
        "poc_phone": doc.get("poc_phone"),
        "billing_name": doc.get("billing_name"),
        "billing_email": doc.get("billing_email"),
        "billing_phone": doc.get("billing_phone"),
        "isDefault": bool(doc.get("isDefault", False)),
        "created_at": _format_datetime(doc.get("created_at")),
        "updated_at": _format_datetime(doc.get("updated_at")),
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
        "created_at": _format_datetime(doc.get("created_at")),
        "updated_at": _format_datetime(doc.get("updated_at")),
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
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: dict = Depends(get_current_user),
):
    """List all registered members in the organization."""
    if getattr(settings, "MULTI_COMPANY_ENABLED", False):
        from app.core.tenant import get_global_db
        gdb = get_global_db()
        current_cid = current_user.get("company_id")
        mem_query: Dict[str, Any] = {"company_id": current_cid}
        if is_active is None or is_active is True:
            mem_query["status"] = "active"
        elif is_active is False:
            mem_query["status"] = {"$in": ["inactive", "removed"]}
        if role:
            mem_query["role"] = role.lower()
        if department:
            mem_query["$or"] = [
                {"department": exact_ci(department)},
                {"departments": exact_ci(department)},
                {"primary_department": exact_ci(department)},
            ]

        mems = await gdb.company_memberships.find(mem_query).to_list(1000)
        if not mems:
            return []

        user_ids = [m["user_id"] for m in mems]
        u_cursor = gdb.users.find({"$or": [{"id": {"$in": user_ids}}, {"_id": {"$in": user_ids}}]})
        users = await u_cursor.to_list(1000)
        user_by_id = {u.get("id") or str(u.get("_id")): u for u in users}
        extra_ids = set(
            await gdb.company_memberships.distinct(
                "user_id",
                {"user_id": {"$in": user_ids}, "status": "active", "company_id": {"$ne": current_cid}},
            )
        )

        results = []
        for m in mems:
            u = user_by_id.get(m["user_id"])
            if not u:
                continue
            merged = dict(u)
            merged["role"] = m.get("role", "team_member")
            merged["department"] = m.get("department")
            merged["departments"] = m.get("departments") or []
            merged["primary_department"] = m.get("primary_department")
            merged["needs_setup"] = bool(m.get("needs_setup", False))
            merged["company_id"] = current_cid
            merged["is_active"] = (m.get("status") == "active")
            home = u.get("company_id")
            merged["login_managed_elsewhere"] = bool(
                u.get("is_super_admin") or home != current_cid or m["user_id"] in extra_ids
            )

            if search:
                s_lower = search.strip().lower()
                full_name = str(merged.get("full_name") or merged.get("name") or "").lower()
                email = str(merged.get("email") or "").lower()
                if s_lower not in full_name and s_lower not in email:
                    continue

            extras_count = 1 if m["user_id"] in extra_ids else 0
            formatted = _format_member_resp(merged)
            await _attach_member_edit_flags(
                formatted,
                current_user,
                merged,
                merged.get("role"),
                extra_active_memberships=extras_count,
            )
            results.append(formatted)

        return results

    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    if department:
        query["department"] = exact_ci(department)
    if role:
        query["role"] = role.lower()
    if search:
        query["$or"] = [
            {"full_name": contains_ci(search)},
            {"name": contains_ci(search)},
            {"email": contains_ci(search)},
        ]

    cursor = db.users.find(query).sort("created_at", -1)
    members = await cursor.to_list(200)
    results = []
    for m in members:
        formatted = _format_member_resp(m)
        await _attach_member_edit_flags(formatted, current_user, m, m.get("role"))
        results.append(formatted)
    return results


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
        query["department"] = exact_ci(department)

    if getattr(settings, "MULTI_COMPANY_ENABLED", False):
        from app.services.access import tracked_users
        users = await tracked_users(db, "daily_log")
        if department:
            users = [
                u for u in users
                if (u.get("department") == department or department in (u.get("departments") or []))
            ]
        users.sort(key=lambda u: (u.get("full_name") or u.get("name") or "").lower())
    else:
        cursor = db.users.find(query).sort("full_name", 1)
        users = await cursor.to_list(200)
        from app.services.access import is_tracked
        users = [u for u in users if is_tracked(u, "daily_log")]

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

    # Batch load all daily log entries for the workdays in a single query
    entries_by_user: Dict[str, Set[str]] = {}
    entries_by_name: Dict[str, Set[str]] = {}
    if workdays:
        all_entries = await db.daily_log_entries.find(
            {"date": {"$in": workdays}},
            {"_id": 0, "user_id": 1, "resource_name": 1, "date": 1}
        ).to_list(5000)
        for e in all_entries:
            d = e.get("date")
            if not d:
                continue
            e_uid = e.get("user_id")
            if e_uid:
                entries_by_user.setdefault(str(e_uid), set()).add(d)
            rname = str(e.get("resource_name") or "").strip().lower()
            if rname:
                entries_by_name.setdefault(rname, set()).add(d)

    # Batch load last logged date per user in a single aggregation pipeline
    last_logged_by_user: Dict[str, str] = {}
    if user_ids:
        last_entries = await db.daily_log_entries.aggregate([
            {"$match": {"user_id": {"$in": user_ids}}},
            {"$sort": {"date": -1}},
            {"$group": {"_id": "$user_id", "last_date": {"$first": "$date"}}}
        ]).to_list(len(user_ids) + 50)
        for row in last_entries:
            if row.get("_id") and row.get("last_date"):
                last_logged_by_user[str(row["_id"])] = row["last_date"]

    result = []
    for u in users:
        uid = u.get("id") or str(u.get("_id"))
        fname = u.get("full_name") or u.get("name", "User")
        fname_lower = fname.strip().lower()

        logged_dates = entries_by_user.get(uid, set()) | entries_by_name.get(fname_lower, set())
        logged_today = today_str in logged_dates

        missing = []
        for d in workdays:
            if d in logged_dates:
                continue
            att = att_by_key.get((uid, d)) or {}
            target = targets.get((uid, d)) or {}
            if person_day_is_leave(target, att):
                continue
            if not person_day_is_due(d, today_str, target, att):
                continue
            missing.append(d)

        last_logged = last_logged_by_user.get(uid)
        if not last_logged:
            # Fallback for rare legacy records without user_id
            legacy_last = await db.daily_log_entries.find_one(
                {"resource_name": exact_ci(fname)},
                sort=[("date", -1)]
            )
            if legacy_last and legacy_last.get("date"):
                last_logged = legacy_last["date"]

        result.append({
            "user_id": uid,
            "full_name": fname,
            "email": u["email"],
            "phone": member_phone_from_doc(u),
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
            "$or": [{"user_id": user_id}, {"resource_name": exact_ci(fname)}],
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
        if not person_day_is_due(d, today_str, target, att):
            continue
        # 48 Working-Hours Expiration Gate: do not remind if backfill window has passed
        from app.services.log_compliance import compute_log_submission_window
        win = await compute_log_submission_window(
            user_id=user_id,
            target_date_str=d,
            user_dept=member.get("department"),
            now_dt=now,
        )
        if win.get("is_expired"):
            continue
        missing_dates.append(d)
    if not missing_dates:
        raise HTTPException(
            status_code=409,
            detail="Cannot send reminder: daily log submission window (>48 working hours) has expired or shift has not finished.",
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
    reminder_body = req.custom_message or f"Reminder to submit daily log for {formatted_missing}"
    from app.services.push_service import dispatch_to_users
    await dispatch_to_users(
        user_ids=[user_id],
        title="Daily Log Submission Reminder",
        body=reminder_body,
        kind="admin_reminder",
        sender_id=str(current_user.get("id") or ""),
        sender_name=current_user.get("full_name") or current_user.get("name") or "Administrator",
        sender_role=current_user.get("role"),
        data={"missing_dates": missing_dates},
    )

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


@router.post("/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
@router.post("/users", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def create_member(
    member_in: MemberCreate,
    current_user: dict = Depends(require_hr_or_admin),
):
    """Create a new team member account (HR or Admin)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    is_caller_admin = current_user.get("role") in (UserRole.ADMIN.value, "admin")

    # Prevent creating additional Super Admin accounts
    if member_in.role in (UserRole.ADMIN, "admin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Creating additional Super Admin accounts is not permitted. Only one Super Admin exists.",
        )
    if member_in.role in (UserRole.OPERATIONS, "operations") and not is_caller_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can assign the operations role.",
        )

    from fastapi.responses import JSONResponse
    from app.core.tenant import get_global_db

    email_clean = member_in.email.lower()
    gdb = get_global_db()
    existing = None
    if gdb is not None:
        existing = await gdb.users.find_one({"email": email_clean})
    if existing is None:
        existing = await db.users.find_one({"email": email_clean})
    if existing:
        if getattr(settings, "MULTI_COMPANY_ENABLED", False):
            return JSONResponse(
                status_code=status.HTTP_201_CREATED,
                content={"message": "If this person can be added, they'll get an email"},
            )
        raise HTTPException(
            status_code=400, detail="Could not add this person with that email."
        )

    user_id = f"usr_{uuid.uuid4().hex[:10]}"
    raw_pwd = (
        member_in.temporary_password.strip()
        if member_in.temporary_password
        else _generate_temp_password()
    )
    hashed_pwd = get_password_hash(raw_pwd)

    # Auto set department: "All" for Admin/Operations, "HR" for HR, None for Client
    primary_val = None
    if member_in.role in (UserRole.ADMIN, UserRole.OPERATIONS):
        dept_val = "All"
        depts_list = ["All"]
        primary_val = "All"
    elif member_in.role == UserRole.HR:
        dept_val = "HR"
        depts_list = ["HR"]
        primary_val = "HR"
    elif member_in.role == UserRole.CLIENT:
        dept_val = None
        depts_list = []
        primary_val = None
    else:
        packed = canonicalize_departments(
            departments=list(member_in.departments) if member_in.departments else None,
            primary=member_in.primary_department,
            department=member_in.department,
        )
        depts_list = packed["departments"]
        dept_val = packed["department"]
        primary_val = packed["primary_department"]

    now_iso = datetime.now(timezone.utc).isoformat()
    workspace_ids = await _client_workspace_ids(db, member_in.workspace_ids) if member_in.role == UserRole.CLIENT else []
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
        "departments": depts_list,
        "primary_department": primary_val,
        "joining_date": member_in.joining_date.strip() if member_in.joining_date else None,
        "employment_type": member_in.employment_type.value,
        "probation_start_date": member_in.probation_start_date,
        "probation_end_date": member_in.probation_end_date,
        "is_active": member_in.is_active,
        "workspace_ids": workspace_ids,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    if getattr(settings, "MULTI_COMPANY_ENABLED", False) and gdb is not None:
        user_cid = current_user.get("company_id")
        user_doc["company_id"] = user_cid
        await gdb.users.insert_one(user_doc)
        mem_id = f"mem_{uuid.uuid4().hex[:12]}"
        await gdb.company_memberships.insert_one({
            "_id": mem_id,
            "id": mem_id,
            "user_id": user_id,
            "company_id": user_cid,
            "role": member_in.role.value,
            "primary_department": user_doc.get("primary_department"),
            "departments": user_doc.get("departments") or [],
            "status": "active",
            "needs_setup": False,
            "token_version": 0,
            "granted_by": current_user["id"],
            "granted_at": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso,
        })
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={"message": "If this person can be added, they'll get an email"},
        )
    else:
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

    multi_enabled = getattr(settings, "MULTI_COMPANY_ENABLED", False)
    target_mem = None
    gdb = None
    if multi_enabled:
        from app.core.tenant import get_global_db
        gdb = get_global_db()
        existing_user = await gdb.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
        if not existing_user:
            raise HTTPException(status_code=404, detail="Member not found.")
        target_mem = await gdb.company_memberships.find_one({
            "user_id": user_id,
            "company_id": current_user.get("company_id"),
        })
        if not target_mem:
            raise HTTPException(status_code=404, detail="Member not found.")
        target_role = target_mem.get("role", "team_member")
        is_target_admin = target_role in (UserRole.ADMIN.value, "admin")
        caller_mem = await gdb.company_memberships.find_one({
            "user_id": current_user.get("id"),
            "company_id": current_user.get("company_id"),
            "status": "active",
        })
        if caller_mem and caller_mem.get("role"):
            current_user = {**current_user, "role": caller_mem.get("role")}
    else:
        existing_user = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
        if not existing_user:
            raise HTTPException(status_code=404, detail="Member not found.")
        target_role = existing_user.get("role", "team_member")
        is_target_admin = target_role in (UserRole.ADMIN.value, "admin")
    is_caller_admin = current_user.get("role") in (UserRole.ADMIN.value, "admin")

    from app.services.identity_guard import (
        assert_can_edit_member,
        assert_super_admin_protected,
        can_edit_global_identity,
        identity_keys_in_update,
        invalidate_global_login,
        is_owner_actor,
        remove_company_membership,
        HOME_LOGIN_MSG,
    )
    payload_fields = member_in.model_dump(exclude_unset=True)
    await assert_can_edit_member(current_user, existing_user, target_role, payload_fields)
    assert_super_admin_protected(current_user, existing_user)
    may_edit_identity = await can_edit_global_identity(current_user, existing_user)

    # Super Admin Protection: HR cannot modify the Super Admin account
    if is_target_admin and not is_caller_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR cannot modify the Super Admin account. Only the Super Admin can edit their own profile.",
        )

    # Primary Admin Protection: non-owners cannot demote/deactivate Admins.
    # The owner may, as long as the company still has another Admin.
    if is_target_admin:
        demoting = member_in.role is not None and member_in.role != UserRole.ADMIN
        deactivating = member_in.is_active is False
        if demoting or deactivating:
            if is_owner_actor(current_user):
                from app.services.identity_guard import assert_company_keeps_an_admin
                await assert_company_keeps_an_admin(
                    gdb,
                    current_user.get("company_id"),
                    excluding_user_id=user_id,
                )
            else:
                if demoting:
                    raise HTTPException(
                        status_code=400, detail="Cannot demote or modify the role of an Admin account."
                    )
                if deactivating:
                    raise HTTPException(status_code=400, detail="Cannot deactivate an Admin account.")

    # Prevent promoting any non-admin to admin (owner may still do this)
    if not is_target_admin and member_in.role in (UserRole.ADMIN, "admin") and not is_owner_actor(current_user):
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
        existing_role = str(existing_user.get("role") or "").lower()
        assigning_ops = member_in.role in (UserRole.OPERATIONS, "operations")
        already_ops = existing_role in (UserRole.OPERATIONS.value, "operations")
        if assigning_ops and not is_caller_admin and not already_ops:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an administrator can assign the operations role.",
            )
        update_fields["role"] = member_in.role.value
        if member_in.role in (UserRole.ADMIN, UserRole.OPERATIONS):
            update_fields["department"] = "All"
            update_fields["departments"] = ["All"]
            update_fields["primary_department"] = "All"
        elif member_in.role == UserRole.HR:
            update_fields["department"] = "HR"
            update_fields["departments"] = ["HR"]
            update_fields["primary_department"] = "HR"
        elif member_in.role == UserRole.CLIENT:
            update_fields["department"] = None
            update_fields["departments"] = []
            update_fields["primary_department"] = None

    target_role = member_in.role.value if member_in.role else existing_user.get("role")
    is_special_role = target_role in (
        "admin", "operations", "hr", "client",
        UserRole.ADMIN.value, UserRole.OPERATIONS.value, UserRole.HR.value, UserRole.CLIENT.value
    )
    if not is_special_role and (
        member_in.primary_department is not None
        or member_in.departments is not None
        or member_in.department is not None
    ):
        incoming_depts = member_in.departments if member_in.departments is not None else existing_user.get("departments")
        incoming_primary = (
            member_in.primary_department
            if member_in.primary_department is not None
            else existing_user.get("primary_department")
        )
        incoming_dept_str = member_in.department if member_in.department is not None else None
        packed = canonicalize_departments(
            departments=list(incoming_depts) if isinstance(incoming_depts, list) else None,
            primary=incoming_primary,
            department=incoming_dept_str,
        )
        update_fields["primary_department"] = packed["primary_department"]
        update_fields["departments"] = packed["departments"]
        update_fields["department"] = packed["department"]
    if member_in.is_active is not None:
        update_fields["is_active"] = member_in.is_active
        if member_in.is_active is False:
            from app.services.attendance_golive import pkt_today_str
            update_fields["deactivated_at"] = datetime.now(timezone.utc).isoformat()
            update_fields["deactivation_date"] = (member_in.deactivation_date or "").strip() or pkt_today_str()
        else:
            update_fields["deactivated_at"] = None
            update_fields["deactivation_date"] = None
    elif member_in.deactivation_date is not None:
        update_fields["deactivation_date"] = member_in.deactivation_date.strip() or None
    if member_in.crm_enabled is not None:
        update_fields["crm_enabled"] = bool(member_in.crm_enabled)
    if member_in.crm_paused is not None:
        update_fields["crm_paused"] = bool(member_in.crm_paused)
    target_role = member_in.role.value if member_in.role else existing_user.get("role")
    if target_role in (UserRole.CLIENT.value, "client"):
        if member_in.workspace_ids is not None:
            update_fields["workspace_ids"] = await _client_workspace_ids(db, member_in.workspace_ids)
        elif not existing_user.get("workspace_ids"):
            raise HTTPException(
                status_code=400,
                detail="A client account must be linked to at least one active client.",
            )
    elif member_in.role is not None:
        update_fields["workspace_ids"] = []
    if member_in.joining_date is not None:
        update_fields["joining_date"] = member_in.joining_date.strip() if member_in.joining_date else None
    if member_in.employment_type is not None:
        update_fields["employment_type"] = member_in.employment_type.value
        if member_in.employment_type == EmploymentType.CONTRACT:
            update_fields["probation_start_date"] = None
            update_fields["probation_end_date"] = None
        else:
            start = (
                member_in.probation_start_date
                or member_in.joining_date
                or existing_user.get("probation_start_date")
                or existing_user.get("joining_date")
            )
            end = member_in.probation_end_date or existing_user.get("probation_end_date")
            if not end:
                raise HTTPException(
                    status_code=400,
                    detail="probation_end_date is required when employment_type is probation",
                )
            if start and end and str(start) > str(end):
                raise HTTPException(
                    status_code=400,
                    detail="probation_start_date must be on or before probation_end_date",
                )
            update_fields["probation_start_date"] = start
            update_fields["probation_end_date"] = end
    else:
        if member_in.probation_start_date is not None:
            update_fields["probation_start_date"] = member_in.probation_start_date
        if member_in.probation_end_date is not None:
            update_fields["probation_end_date"] = member_in.probation_end_date
        start = update_fields.get("probation_start_date", existing_user.get("probation_start_date"))
        end = update_fields.get("probation_end_date", existing_user.get("probation_end_date"))
        if start and end and str(start) > str(end):
            raise HTTPException(
                status_code=400,
                detail="probation_start_date must be on or before probation_end_date",
            )

    if not update_fields:
        formatted = _format_member_resp(existing_user)
        await _attach_member_edit_flags(formatted, current_user, existing_user, target_role)
        return formatted

    new_primary = update_fields.get("primary_department", existing_user.get("primary_department"))
    new_primary_stage = get_primary_stage(new_primary)
    stored_extras = existing_user.get("content_stages") or []
    if isinstance(stored_extras, list) and new_primary_stage:
        cleaned_extras = [
            s for s in stored_extras
            if normalize_stage(s) and normalize_stage(s) != new_primary_stage
        ]
        if cleaned_extras != list(stored_extras):
            update_fields["content_stages"] = cleaned_extras
            update_fields["access_version"] = int(existing_user.get("access_version") or 1) + 1

    # For dual users / non-home companies, drop identical identity fields before check
    for k in list(update_fields.keys()):
        if k in ("name", "full_name") and update_fields[k] in (existing_user.get("full_name"), existing_user.get("name")):
            del update_fields[k]
        elif k in ("phone", "phone_number") and update_fields[k] in (existing_user.get("phone"), existing_user.get("phone_number")):
            del update_fields[k]
        elif k == "email" and update_fields[k] == (existing_user.get("email") or "").lower():
            del update_fields[k]
        elif k == "is_active":
            mem_active = (target_mem.get("status") == "active") if target_mem else existing_user.get("is_active")
            if update_fields[k] == existing_user.get("is_active") and update_fields[k] == mem_active:
                del update_fields[k]

    pending_identity = identity_keys_in_update(update_fields)
    # If caller is non-home company, is_active only toggles membership in this company
    if not may_edit_identity and "is_active" in pending_identity:
        target_active = update_fields.pop("is_active")
        update_fields.pop("deactivated_at", None)
        update_fields.pop("deactivation_date", None)
        pending_identity.discard("is_active")
        if multi_enabled and target_mem:
            if target_active is False:
                await remove_company_membership(user_id, current_user.get("company_id"))
                target_mem["status"] = "removed"
            else:
                now_iso = datetime.now(timezone.utc).isoformat()
                await gdb.company_memberships.update_one(
                    {"id": target_mem["id"]},
                    {"$set": {"status": "active", "updated_at": now_iso}}
                )
                target_mem["status"] = "active"
            invalidate_auth_cache(user_id=user_id, membership_id=target_mem["id"])

    if pending_identity and not may_edit_identity:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=HOME_LOGIN_MSG)

    if multi_enabled and target_mem:
        now_iso = datetime.now(timezone.utc).isoformat()
        mem_set: Dict[str, Any] = {"updated_at": now_iso}
        if member_in.role is not None:
            mem_set["role"] = member_in.role.value
            mem_set["needs_setup"] = False
        if "department" in update_fields:
            mem_set["department"] = update_fields["department"]
        if "departments" in update_fields:
            mem_set["departments"] = update_fields["departments"]
        if "primary_department" in update_fields:
            mem_set["primary_department"] = update_fields["primary_department"]
        if "is_active" in update_fields and may_edit_identity:
            if update_fields["is_active"] is False:
                mem_set["status"] = "inactive"
                mem_set["deactivated_at"] = update_fields.get("deactivated_at")
                mem_set["deactivation_date"] = update_fields.get("deactivation_date")
            else:
                mem_set["status"] = "active"
                mem_set["deactivated_at"] = None
                mem_set["deactivation_date"] = None

        await gdb.company_memberships.update_one({"id": target_mem["id"]}, {"$set": mem_set})
        invalidate_auth_cache(user_id=user_id, membership_id=target_mem["id"])

        user_set = {
            k: v for k, v in update_fields.items() if k not in MEMBERSHIP_ONLY_USER_KEYS
        }
        if may_edit_identity and user_set:
            user_set["updated_at"] = now_iso
            updated_user = await gdb.users.find_one_and_update(
                {"$or": [{"id": user_id}, {"_id": user_id}]},
                {"$set": user_set},
                return_document=True,
            )
            if not updated_user:
                updated_user = dict(existing_user)
                updated_user.update(user_set)
        else:
            updated_user = dict(existing_user)

        updated_user["role"] = mem_set.get("role", target_mem.get("role", "team_member"))
        updated_user["department"] = mem_set.get("department", target_mem.get("department"))
        updated_user["departments"] = mem_set.get("departments", target_mem.get("departments") or [])
        updated_user["primary_department"] = mem_set.get("primary_department", target_mem.get("primary_department"))
        updated_user["needs_setup"] = bool(mem_set.get("needs_setup", target_mem.get("needs_setup", False)))
        updated_user["company_id"] = current_user.get("company_id")
        if not may_edit_identity:
            updated_user["login_managed_elsewhere"] = True
    else:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        updated_user = await db.users.find_one_and_update(
            {"$or": [{"id": user_id}, {"_id": user_id}]},
            {"$set": update_fields},
            return_document=True,
        )

    if ("hashed_password" in update_fields or "email" in update_fields or update_fields.get("is_active") is False) and may_edit_identity:
        await invalidate_global_login(user_id)

    new_joining = update_fields.get("joining_date")
    if new_joining and new_joining != existing_user.get("joining_date"):
        await purge_pre_joining_attendance(user_id, new_joining)

    formatted = _format_member_resp(updated_user)
    await _attach_member_edit_flags(
        formatted,
        current_user,
        updated_user,
        updated_user.get("role"),
    )
    return formatted


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

    multi_enabled = getattr(settings, "MULTI_COMPANY_ENABLED", False)
    gdb = None
    if multi_enabled:
        from app.core.tenant import get_global_db
        gdb = get_global_db()

    caller_cid = current_user.get("company_id")
    if multi_enabled and gdb is not None:
        caller_mem = await gdb.company_memberships.find_one({
            "user_id": user_id,
            "company_id": caller_cid,
            "status": "active",
        })
        if not caller_mem:
            raise HTTPException(status_code=404, detail="Member not found.")

    target_coll = gdb.users if multi_enabled and gdb is not None else db.users
    existing_user = await target_coll.find_one({"$or": [{"id": user_id}, {"_id": user_id}]})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Member not found.")

    target_role = existing_user.get("role", "team_member")
    if multi_enabled and gdb is not None:
        target_mem = await gdb.company_memberships.find_one({
            "user_id": user_id,
            "company_id": caller_cid,
        })
        if target_mem and target_mem.get("role"):
            target_role = target_mem.get("role")
        caller_mem = await gdb.company_memberships.find_one({
            "user_id": current_user.get("id"),
            "company_id": caller_cid,
            "status": "active",
        })
        if caller_mem and caller_mem.get("role"):
            current_user = {**current_user, "role": caller_mem.get("role")}

    from app.services.identity_guard import assert_can_edit_member, assert_company_keeps_an_admin, is_owner_actor
    await assert_can_edit_member(
        current_user,
        existing_user,
        target_role,
        {"_action": "delete", "is_active": False},
    )

    target_is_admin = existing_user.get("is_super_admin") or target_role in (UserRole.ADMIN.value, "admin")
    if target_is_admin:
        if existing_user.get("is_super_admin") or not is_owner_actor(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The Super Admin account cannot be deleted.",
            )
        await assert_company_keeps_an_admin(
            gdb,
            caller_cid,
            excluding_user_id=user_id,
        )

    from app.services.identity_guard import remove_company_membership

    caller_cid = current_user.get("company_id")
    target_home = existing_user.get("company_id")
    has_other_membership = False
    if multi_enabled and gdb is not None:
        other_count = await gdb.company_memberships.count_documents({
            "user_id": user_id,
            "company_id": {"$ne": caller_cid},
            "status": "active",
        })
        has_other_membership = (other_count > 0)

    if target_is_admin and multi_enabled:
        await remove_company_membership(user_id, caller_cid)
        still_active = await gdb.company_memberships.count_documents({
            "user_id": user_id,
            "status": "active",
        })
        if still_active < 1:
            await target_coll.update_one(
                {"$or": [{"id": user_id}, {"_id": user_id}]},
                {"$set": {"is_active": False}},
            )
        return {"message": "Removed from this company."}

    if multi_enabled and (has_other_membership or target_home != caller_cid):
        await remove_company_membership(user_id, caller_cid)
        return {"message": "Removed from this company."}

    if multi_enabled and gdb is not None:
        await remove_company_membership(user_id, caller_cid)

    await target_coll.delete_one({"$or": [{"id": user_id}, {"_id": user_id}]})
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

    # Upsert credentials if provided (encrypt before write; never store plaintext)
    if acc_in.access_token or acc_in.refresh_token or acc_in.developer_token or acc_in.client_id:
        try:
            cred_doc = encrypt_credential_fields({
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
            })
        except ValueError as err:
            raise HTTPException(status_code=500, detail="Encryption configuration error.") from err
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
        try:
            cred_doc = encrypt_credential_fields({
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
            })
        except ValueError as err:
            raise HTTPException(status_code=500, detail="Encryption configuration error.") from err
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
