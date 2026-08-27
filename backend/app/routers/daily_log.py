from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import FileResponse
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import re
import os
from app.database import get_database
from app.core.security import get_current_user, require_admin
from app.schemas.daily_log import (
    DailyLogEntryCreate,
    DailyLogEntryUpdate,
    DailyLogEntryResponse,
    DailyLogColumn,
)
from app.schemas.user import UserLogActivityResponse
from app.models.user import UserRole


router = APIRouter(
    prefix="/daily-log",
    tags=["Daily Log"],
    responses={
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden"},
        404: {"description": "Not Found"},
        409: {"description": "Conflict (Optimistic Concurrency Control)"},
        500: {"description": "Internal Server Error"},
    }
)

DEFAULT_COLUMNS: List[dict] = [
    {"key": "date", "label": "Date", "type": "date", "editable": True},
    {"key": "resource_name", "label": "Resource Name", "type": "text", "editable": True},
    {"key": "role", "label": "Role", "type": "text", "editable": True},
    {"key": "department", "label": "Department", "type": "text", "editable": True},
    {"key": "client_project", "label": "Client / Project", "type": "text", "editable": True},
    {"key": "task_description", "label": "Task Description", "type": "text", "editable": True},
    {
        "key": "task_type",
        "label": "Task Type",
        "type": "select",
        "options": ["Scheduled Task", "Runtime Task"],
        "editable": True,
    },
    {
        "key": "task_status",
        "label": "Task Status",
        "type": "select",
        "options": ["Completed", "Incomplete", "Blocker"],
        "editable": True,
    },
    {"key": "revisions_done", "label": "Revisions / Updates Done", "type": "text", "editable": True},
    {"key": "deliverables", "label": "Deliverables Submitted (Links / Files)", "type": "text", "editable": True},
    {"key": "hours_utilized", "label": "Hours Utilized", "type": "number", "editable": True},
    {"key": "remarks", "label": "Remarks (Optional)", "type": "text", "editable": True},
]

# --- System start date: August 2026 ---
SYSTEM_START_YEAR = 2026
SYSTEM_START_MONTH = 8  # August
GLOBAL_CONFIG_KEY = "global_org_daily_log"

# Company local timezone: Pakistan Standard Time (PKT, UTC+5 / Asia/Karachi)
PKT_TIMEZONE = timezone(timedelta(hours=5))


def _get_current_month_sheet() -> str:
    now = datetime.now(PKT_TIMEZONE)
    return f"{now.strftime('%B')} - {now.year}"


def _generate_sheet_list() -> List[str]:
    """Generate month sheet tabs from August 2026 through the current month."""
    now = datetime.now(PKT_TIMEZONE)
    months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]
    sheets: List[str] = []

    year = SYSTEM_START_YEAR
    month = SYSTEM_START_MONTH

    while True:
        sheets.append(f"{months[month - 1]} - {year}")
        if year == now.year and month == now.month:
            break
        month += 1
        if month > 12:
            month = 1
            year += 1
        # Safety limit
        if len(sheets) > 120:
            break

    return sheets


SYSTEM_START_DATE = "2026-08-19"


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


async def _get_recent_workdays(days: int = 7) -> List[str]:
    """Last N company workdays (Mon-Fri + working Saturdays, excluding 1st Sat, Sunday, and calendar holidays)."""
    from app.services.workdays import recent_company_workdays
    return await recent_company_workdays(days, start_date=SYSTEM_START_DATE)


@router.get("/submission-window")
async def get_submission_window(
    date: str = Query(..., description="Target date to check (YYYY-MM-DD)"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns whether the current user can create or edit logs for a specific date
    under the shift-start and 48 working-hours rule.
    """
    from app.services.log_compliance import compute_log_submission_window
    return await compute_log_submission_window(
        user_id=current_user["id"],
        target_date_str=date,
        user_dept=current_user.get("department"),
    )


@router.get("/my-activity", response_model=UserLogActivityResponse)
async def get_my_log_activity(
    days: int = Query(7, ge=1, le=30, description="Past workdays window to check"),
    current_user: dict = Depends(get_current_user),
):
    """Calculates missing Daily Log dates for the current user to display smart backfill reminders."""
    db = get_database()
    uid = current_user["id"]
    fname = current_user.get("full_name") or current_user.get("name", "User")
    user_role = current_user.get("role", "team_member")
    is_exempt = user_role in (
        UserRole.ADMIN.value, "admin",
        UserRole.OPERATIONS.value, "operations",
        UserRole.CLIENT.value, "client"
    )

    if is_exempt or db is None:
        return {
            "user_id": uid,
            "full_name": fname,
            "last_logged_date": None,
            "logged_today": True,
            "missing_dates": [],
        }

    workdays = await _get_recent_workdays(days)
    today_iso = datetime.now(PKT_TIMEZONE).date().isoformat()
    min_date = workdays[-1] if workdays else today_iso

    entries_cursor = db.daily_log_entries.find(
        {
            "date": {"$gte": min_date},
            "$or": [
                {"user_id": uid},
                {"resource_name": {"$regex": f"^{fname}$", "$options": "i"}},
            ],
        },
        {"_id": 0, "date": 1},
    )
    entries = await entries_cursor.to_list(length=100)
    submitted_dates = {e["date"] for e in entries if e.get("date")}

    from app.services.log_compliance import (
        batch_expected_targets,
        person_day_is_leave,
        person_day_is_due,
        pkt_today,
        compute_log_submission_window,
    )

    leave_days = set()
    not_due_today = False
    if workdays:
        targets = await batch_expected_targets([current_user], workdays)
        att_docs = await db.attendance_records.find(
            {"user_id": uid, "date": {"$in": workdays}},
            {"_id": 0, "date": 1, "status": 1, "check_out": 1, "punch_out": 1, "work_hours": 1},
        ).to_list(40)
        att_by_day = {d.get("date"): d for d in att_docs if d.get("date")}
        today_pkt = pkt_today()
        for day in workdays:
            att = att_by_day.get(day) or {}
            target = targets.get((uid, day)) or {}
            if person_day_is_leave(target, att):
                leave_days.add(day)
            if day == today_pkt and not person_day_is_due(day, today_pkt, target, att):
                not_due_today = True

    raw_missing = [
        w for w in workdays
        if w not in submitted_dates and w not in leave_days and not (w == today_iso and not_due_today)
    ]

    # Only include missing dates whose 48 working-hour window is currently active/open
    missing = []
    for m_day in raw_missing:
        win = await compute_log_submission_window(uid, m_day, user_dept=current_user.get("department"))
        if win.get("is_open"):
            missing.append(m_day)

    logged_today = today_iso in submitted_dates

    sorted_submitted = sorted(list(submitted_dates), reverse=True)
    last_logged = sorted_submitted[0] if sorted_submitted else None

    return {
        "user_id": uid,
        "full_name": fname,
        "last_logged_date": last_logged,
        "logged_today": logged_today,
        "missing_dates": missing,
    }


@router.get("/day-target")
async def get_day_target(
    date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today PKT"),
    current_user: dict = Depends(get_current_user),
):
    """Logged hours vs attendance time-in/time-out for the current user, plus open follow-ups."""
    from app.services.log_compliance import (
        pkt_today,
        get_expected_log_hours,
        get_attendance_worked,
        load_user_day_entries,
        classify_day_status,
        recent_workdays,
        person_day_is_leave,
        live_day_hours,
    )

    user_role = current_user.get("role", "team_member")
    if user_role in (UserRole.CLIENT.value, "client"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client accounts do not have access to internal daily logs.")

    date_str = date or pkt_today()
    uid = current_user["id"]
    target = await get_expected_log_hours(uid, date_str, current_user.get("department"))
    punch = await get_attendance_worked(uid, date_str)
    entries = await load_user_day_entries(uid, date_str)
    logged = 0.0
    for e in entries:
        try:
            logged += float(e.get("hours_utilized") or 0)
        except (TypeError, ValueError):
            pass
    logged = round(logged, 2)
    is_wfh = bool(target.get("is_wfh") or punch.get("is_wfh"))
    has_checkout = bool(punch.get("has_checkout"))
    has_checkin = bool(punch.get("has_checkin"))
    if has_checkout:
        worked = float(punch.get("work_hours") or 0)
        compare_ready = True
    elif is_wfh and not has_checkin:
        worked = float(target.get("expected_hours") or 0)
        compare_ready = True
    else:
        worked = float(punch.get("work_hours") or 0)
        compare_ready = False

    on_leave = person_day_is_leave(target, punch)
    status, _exc = classify_day_status(
        logged,
        worked,
        is_full_leave=on_leave,
        has_checkout=has_checkout,
        has_checkin=has_checkin,
        has_log=logged > 0 or len(entries) > 0,
        is_wfh=is_wfh,
        compare_ready=compare_ready,
    )

    remaining = round(max(0.0, worked - logged), 2) if compare_ready else 0.0
    pending_action = None
    pending_message = None
    follow_ups = []
    db = get_database()
    if db is not None:
        score = await db.daily_log_day_scores.find_one({"user_id": uid, "date": date_str}, {"_id": 0})
        if (not on_leave) and score and score.get("action_status") == "waiting_on_employee":
            pending_action = score.get("action_type") or "explain"
            who = "HR" if str(score.get("action_by_role") or "").lower() == "hr" else "your lead"
            if "hr" in (score.get("action_by_name") or "").lower() and not score.get("action_by_role"):
                who = "HR"
            pending_message = f"{who} asked you to {pending_action} your log for {date_str}."

        window = await _get_recent_workdays(7)
        waiting = await db.daily_log_day_scores.find(
            {
                "user_id": uid,
                "date": {"$in": window},
                "action_status": {"$in": ["waiting_on_employee", "waiting_on_reviewer"]},
            },
            {"_id": 0},
        ).to_list(20)
        from app.services.log_compliance import person_day_is_leave, batch_expected_targets
        leave_targets = await batch_expected_targets([current_user], window)
        leave_att = await db.attendance_records.find(
            {"user_id": uid, "date": {"$in": window}},
            {"_id": 0, "date": 1, "status": 1},
        ).to_list(20)
        leave_att_by_day = {d.get("date"): d for d in leave_att if d.get("date")}
        for item in waiting:
            item_day = item.get("date")
            if person_day_is_leave(leave_targets.get((uid, item_day)) or {}, leave_att_by_day.get(item_day)):
                continue
            actor_role = str(item.get("action_by_role") or "").lower()
            who = item.get("action_by_name") or ("HR" if actor_role == "hr" else "Your lead")
            astatus = item.get("action_status")
            live = await live_day_hours(uid, item_day)
            logged_h = live["logged_hours"]
            worked_h = live["worked_hours"]
            signed = live["signed_gap_hours"]
            if astatus == "waiting_on_reviewer":
                msg = f"Your reason for {item.get('date')} is waiting on {who}."
            else:
                verb = "send a reason" if item.get("action_type") == "explain" else "add the missing time"
                msg = f"{who} asked you to {verb} for {item.get('date')} — {logged_h}h logged vs {worked_h}h at work."
            follow_ups.append({
                "date": item.get("date"),
                "id": item.get("id"),
                "action_type": item.get("action_type"),
                "action_status": astatus,
                "action_by_name": item.get("action_by_name"),
                "member_reason": item.get("member_reason") or "",
                "logged_hours": logged_h,
                "worked_hours": worked_h,
                "signed_gap_hours": signed,
                "is_missing_log": live["is_missing_log"],
                "can_send_reason": astatus == "waiting_on_employee",
                "message": msg,
            })

    return {
        "date": date_str,
        "expected_hours": float(target["expected_hours"]),
        "worked_hours": worked,
        "logged_hours": logged,
        "remaining_hours": remaining,
        "has_checkin": has_checkin,
        "has_checkout": has_checkout,
        "compare_ready": compare_ready,
        "shift_name": target.get("shift_name"),
        "shift_start": target.get("shift_start"),
        "shift_end": target.get("shift_end"),
        "is_full_leave": on_leave,
        "is_wfh": is_wfh,
        "status": status,
        "pending_action": pending_action,
        "pending_message": pending_message,
        "follow_ups": follow_ups,
    }


@router.get("/columns", response_model=List[DailyLogColumn])
async def get_columns(
    current_user: dict = Depends(get_current_user),
):
    """Retrieve organization Daily Log columns schema."""
    db = get_database()
    if db is None:
        return DEFAULT_COLUMNS

    config = await db.daily_log_columns.find_one({"$or": [{"key": GLOBAL_CONFIG_KEY}, {"workspace_id": {"$exists": True}}]})
    if config and "columns" in config:
        cols = list(config["columns"])
        if not any(c.get("key") == "department" for c in cols):
            role_idx = next((i for i, c in enumerate(cols) if c.get("key") == "role"), -1)
            dept_col = {"key": "department", "label": "Department", "type": "text", "editable": True}
            if role_idx != -1:
                cols.insert(role_idx + 1, dept_col)
            else:
                cols.append(dept_col)
        return cols
    return DEFAULT_COLUMNS


@router.put("/columns", response_model=List[DailyLogColumn])
async def update_columns(
    columns: List[DailyLogColumn],
    current_user: dict = Depends(require_admin),
):
    """Update column schema (Strictly Admin only)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    col_dicts = [col.model_dump() for col in columns]
    await db.daily_log_columns.update_one(
        {"key": GLOBAL_CONFIG_KEY},
        {"$set": {"key": GLOBAL_CONFIG_KEY, "columns": col_dicts, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return columns


@router.get("/sheets", response_model=List[str])
async def get_sheets(
    current_user: dict = Depends(get_current_user),
):
    sheets = _generate_sheet_list()

    db = get_database()
    if db is None:
        return sheets

    existing_sheets = await db.daily_log_entries.distinct("month_sheet")
    for sheet in existing_sheets:
        if sheet and sheet not in sheets:
            sheets.append(sheet)

    return sheets


@router.get("/entries", response_model=List[DailyLogEntryResponse])
async def get_entries(
    month_sheet: Optional[str] = Query(None, description="Month sheet tab filter e.g. 'August - 2026'"),
    start_date: Optional[str] = Query(None, description="Start date for bounded query (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for bounded query (YYYY-MM-DD)"),
    department: Optional[str] = Query(None, description="Filter by department"),
    user_id: Optional[str] = Query(None, description="Filter by user id"),
    resource_name: Optional[str] = Query(None, description="Filter by resource / member name"),
    client_project: Optional[str] = Query(None, description="Filter by client / project"),
    task_status: Optional[str] = Query(None, description="Filter by task status"),
    task_type: Optional[str] = Query(None, description="Filter by task type"),
    limit: int = Query(300, ge=1, le=2000, description="Max entries to return"),
    skip: int = Query(0, ge=0, description="Number of entries to skip for pagination"),
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        return []

    user_role = current_user.get("role", "team_member")
    if user_role == "client" or user_role == UserRole.CLIENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client accounts do not have access to internal daily logs.",
        )

    current_uid = current_user["id"]
    current_name = current_user.get("name") or current_user.get("full_name")
    current_dept = current_user.get("department")

    # Scoped Query Filter Construction
    query_filter: dict = {}

    # 1. ROLE-BASED DATA SCOPING
    if user_role in (UserRole.ADMIN.value, "admin", UserRole.HR.value, "hr", UserRole.OPERATIONS.value, "operations"):
        # Admin, HR & Operations have global visibility across all departments and members
        if department and department.lower() != "all":
            query_filter["department"] = {"$regex": f"^{department.strip()}$", "$options": "i"}
        if user_id:
            query_filter["user_id"] = user_id
        if resource_name:
            query_filter["resource_name"] = {"$regex": resource_name, "$options": "i"}
    elif user_role in (UserRole.TEAM_LEAD.value, "team_lead"):
        # Team Lead can see all logs in their assigned department + their own logs
        if current_dept:
            dept_regex = {"$regex": f"^{current_dept.strip()}$", "$options": "i"}
            if user_id:
                query_filter["$and"] = [
                    {"$or": [{"department": dept_regex}, {"user_id": current_uid}]},
                    {"user_id": user_id},
                ]
            elif resource_name:
                query_filter["$and"] = [
                    {"$or": [{"department": dept_regex}, {"user_id": current_uid}]},
                    {"resource_name": {"$regex": resource_name, "$options": "i"}},
                ]
            else:
                query_filter["$or"] = [
                    {"department": dept_regex},
                    {"user_id": current_uid},
                ]
        else:
            # Fallback if lead has no department assigned yet
            query_filter["user_id"] = current_uid
    else:
        # Regular Team Member: strictly restricted to their own submitted logs
        query_filter["$or"] = [
            {"user_id": current_uid},
            {"user_id": {"$exists": False}, "resource_name": current_name},
            {"user_id": None, "resource_name": current_name},
        ]

    # 2. DATE FILTERING (Today, Week, Month, Custom Range)
    if start_date and end_date:
        query_filter["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query_filter["date"] = {"$gte": start_date}
    elif end_date:
        query_filter["date"] = {"$lte": end_date}
    elif month_sheet and month_sheet.lower() != "all":
        query_filter["month_sheet"] = month_sheet
    elif not month_sheet:
        # Default bounded scope: current month sheet
        query_filter["month_sheet"] = _get_current_month_sheet()

    if client_project:
        query_filter["client_project"] = {"$regex": client_project, "$options": "i"}
    if task_status:
        query_filter["task_status"] = task_status
    if task_type:
        query_filter["task_type"] = task_type

    if user_role in (UserRole.ADMIN.value, "admin", UserRole.HR.value, "hr", UserRole.OPERATIONS.value, "operations"):
        from app.services.member_cleanup import purge_orphaned_member_records
        try:
            await purge_orphaned_member_records(db)
        except Exception:
            pass

    cursor = (
        db.daily_log_entries
        .find(query_filter)
        .sort([("date", -1), ("created_at", -1)])
        .skip(skip)
        .limit(limit)
    )
    entries = await cursor.to_list(length=limit)

    result = []
    for doc in entries:
        doc["id"] = doc.get("id") or str(doc.get("_id"))
        doc["workspace_id"] = doc.get("workspace_id", "global")
        doc["version"] = int(doc.get("version", 1))
        try:
            doc["hours_utilized"] = float(doc.get("hours_utilized", 0.0) or 0.0)
        except (ValueError, TypeError):
            doc["hours_utilized"] = 0.0
        result.append(doc)

    return result


# Allowed file extensions for deliverables
ALLOWED_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".svg", ".docx", ".doc", ".txt", ".zip", ".xlsx", ".csv"
}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


@router.post("/upload")
async def upload_deliverable(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a deliverable attachment file securely (max 25MB)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file filename provided.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed types: PDF, PNG, JPG, JPEG, SVG, DOCX, DOC, TXT, ZIP, XLSX, CSV."
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 25MB.")

    clean_original = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename)
    safe_name = f"{uuid.uuid4().hex[:10]}_{clean_original}"

    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "uploads",
        "deliverables"
    )
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, safe_name)

    with open(file_path, "wb") as f:
        f.write(content)

    file_url = f"/uploads/deliverables/{safe_name}"

    return {
        "file_url": file_url,
        "file_name": file.filename,
        "file_size": len(content),
    }


@router.get("/download-file")
async def download_file(
    file_path: str = Query(..., description="File path under /uploads"),
    current_user: dict = Depends(get_current_user),
):
    """Download an uploaded file attachment. Requires an authenticated internal user."""
    user_role = current_user.get("role", "team_member")
    if user_role in ("client", UserRole.CLIENT.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client accounts do not have access to internal daily logs.",
        )
    clean_relative = file_path.replace("/uploads/", "").lstrip("/").lstrip("\\")
    base_uploads = os.path.abspath(os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "uploads"
    ))
    full_path = os.path.abspath(os.path.normpath(os.path.join(base_uploads, clean_relative)))

    if not full_path.startswith(base_uploads) or not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Requested file not found.")

    raw_filename = os.path.basename(full_path)
    clean_display_name = re.sub(r"^[a-f0-9]{10}_", "", raw_filename)

    return FileResponse(
        path=full_path,
        filename=clean_display_name,
        media_type="application/octet-stream"
    )


@router.post("/entries", response_model=DailyLogEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    entry_in: DailyLogEntryCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user_role = current_user.get("role", "team_member")
    if user_role in (
        "client", UserRole.CLIENT.value,
        "operations", UserRole.OPERATIONS.value,
        "admin", UserRole.ADMIN.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin, Operations, and Client accounts do not log daily entries.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    today_iso = datetime.now(PKT_TIMEZONE).strftime("%Y-%m-%d")
    
    # Restrict log submission date: cannot be earlier than SYSTEM_START_DATE or in the future
    if entry_in.date:
        if entry_in.date < SYSTEM_START_DATE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Daily logs cannot be submitted for dates earlier than {SYSTEM_START_DATE}."
            )
        if entry_in.date > today_iso:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Daily logs cannot be submitted for future dates (Today is {today_iso})."
            )
        from app.services.workdays import classify_date
        day_info = await classify_date(entry_in.date)
        if day_info.is_off:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Daily logs cannot be submitted on {day_info.label} ({entry_in.date}).",
            )

        # 48 Working-Hours & Shift-Start Gate (Strict equality, zero exemptions)
        from app.services.log_compliance import compute_log_submission_window
        window_res = await compute_log_submission_window(
            user_id=current_user["id"],
            target_date_str=entry_in.date,
            user_dept=current_user.get("department"),
        )
        if not window_res.get("is_valid") or not window_res.get("is_open"):
            err_msg = window_res.get("error") or f"Submission window for {entry_in.date} is closed."
            err_status = status.HTTP_400_BAD_REQUEST if (window_res.get("is_not_started") or window_res.get("is_off_day")) else status.HTTP_403_FORBIDDEN
            raise HTTPException(status_code=err_status, detail=err_msg)

    # Calculate month sheet dynamically from entry date if available
    date_val = entry_in.date
    if date_val:
        try:
            dt = datetime.strptime(date_val, "%Y-%m-%d")
            month_sheet = dt.strftime("%B - %Y")
        except Exception:
            month_sheet = entry_in.month_sheet or _get_current_month_sheet()
    else:
        month_sheet = entry_in.month_sheet or _get_current_month_sheet()

    entry_dict = entry_in.model_dump()
    entry_dict["id"] = f"log-{uuid.uuid4().hex[:12]}"
    entry_dict["workspace_id"] = "global"

    # HARDCODED IDENTITY SAFEGUARDS (Derived directly from authenticated login profile)
    raw_role = current_user.get("role", "team_member")
    role_title_map = {
        "admin": "Admin",
        "hr": "HR",
        "team_lead": "Team Lead",
        "team_member": "Team Member",
        "member": "Team Member",
        "client": "Client",
    }
    role_formatted = role_title_map.get(str(raw_role).lower(), str(raw_role).replace("_", " ").title())

    entry_dict["user_id"] = current_user["id"]
    entry_dict["resource_name"] = current_user.get("full_name") or current_user.get("name", "Team Member")
    entry_dict["role"] = role_formatted
    entry_dict["department"] = current_user.get("department") or ""

    entry_dict["month_sheet"] = month_sheet
    entry_dict["version"] = 1
    entry_dict["created_at"] = now_iso
    entry_dict["updated_at"] = now_iso

    from app.services.log_compliance import (
        hours_from_start_end,
        load_user_day_entries,
        assert_no_overlap_or_duplicate,
        recompute_day_score,
    )

    auto_hours = hours_from_start_end(entry_dict.get("start_time"), entry_dict.get("end_time"))
    if auto_hours is not None:
        entry_dict["hours_utilized"] = auto_hours

    existing_same_day = await load_user_day_entries(entry_dict["user_id"], entry_dict["date"])
    assert_no_overlap_or_duplicate(existing_same_day, entry_dict)

    await db.daily_log_entries.insert_one(entry_dict)
    try:
        await recompute_day_score(
            entry_dict["user_id"],
            entry_dict["date"],
            variance_reason=entry_dict.get("variance_reason"),
            actor=current_user,
        )
    except Exception:
        pass
    return entry_dict


@router.put("/entries/{entry_id}", response_model=DailyLogEntryResponse)
@router.patch("/entries/{entry_id}", response_model=DailyLogEntryResponse)
async def update_entry(
    entry_id: str,
    entry_in: DailyLogEntryUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user_role = current_user.get("role", "team_member")
    is_admin = user_role in (UserRole.ADMIN.value, "admin")
    is_lead = user_role in (UserRole.TEAM_LEAD.value, "team_lead")
    lead_dept = current_user.get("department")

    existing_entry = await db.daily_log_entries.find_one({"id": entry_id})
    if not existing_entry:
        raise HTTPException(status_code=404, detail=f"Log entry '{entry_id}' not found.")

    # Permissions check:
    entry_uid = existing_entry.get("user_id")
    entry_rname = existing_entry.get("resource_name")
    entry_dept = existing_entry.get("department")
    curr_id = current_user.get("id") or str(current_user.get("_id"))
    curr_name = (current_user.get("full_name") or current_user.get("name") or "").strip().lower()

    if not is_admin:
        is_own_entry = (
            (entry_uid and str(entry_uid) == str(curr_id))
            or (entry_rname and curr_name and entry_rname.strip().lower() == curr_name)
        )
        is_dept_lead_entry = is_lead and lead_dept and entry_dept and lead_dept.lower() == entry_dept.lower()
        is_hr = user_role in (UserRole.HR.value, "hr")

        if not (is_own_entry or is_dept_lead_entry or is_hr):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to edit this log entry. Only the author who logged the entry can edit it.",
            )

    update_data = {k: v for k, v in entry_in.model_dump().items() if v is not None}
    
    # HARDCODED IDENTITY SAFEGUARDS: Do not allow changing user_id, resource_name, role, or department via Daily Log edit
    update_data.pop("user_id", None)
    update_data.pop("resource_name", None)
    update_data.pop("role", None)
    update_data.pop("department", None)

    target_uid = existing_entry.get("user_id") or current_user["id"]
    orig_date = existing_entry.get("date")
    new_date = update_data.get("date")

    # 48 Working-Hours Expiration Gate for editing (Strict equality, zero exemptions)
    from app.services.log_compliance import compute_log_submission_window
    if orig_date:
        orig_win = await compute_log_submission_window(
            user_id=target_uid,
            target_date_str=orig_date,
            user_dept=existing_entry.get("department") or current_user.get("department"),
        )
        if not orig_win.get("is_valid") or not orig_win.get("is_open"):
            err_msg = orig_win.get("error") or f"The 48 working-hour window for editing {orig_date} has expired."
            err_status = status.HTTP_400_BAD_REQUEST if (orig_win.get("is_not_started") or orig_win.get("is_off_day")) else status.HTTP_403_FORBIDDEN
            raise HTTPException(status_code=err_status, detail=err_msg)

    if new_date and new_date != orig_date:
        new_win = await compute_log_submission_window(
            user_id=target_uid,
            target_date_str=new_date,
            user_dept=existing_entry.get("department") or current_user.get("department"),
        )
        if not new_win.get("is_valid") or not new_win.get("is_open"):
            err_msg = new_win.get("error") or f"The submission window for {new_date} is closed."
            err_status = status.HTTP_400_BAD_REQUEST if (new_win.get("is_not_started") or new_win.get("is_off_day")) else status.HTTP_403_FORBIDDEN
            raise HTTPException(status_code=err_status, detail=err_msg)

    if "date" in update_data and update_data["date"]:
        today_iso = datetime.now(PKT_TIMEZONE).strftime("%Y-%m-%d")
        dt_str = str(update_data["date"])
        if dt_str < SYSTEM_START_DATE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Daily log date cannot be set earlier than {SYSTEM_START_DATE}."
            )
        if dt_str > today_iso:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Daily log date cannot be set to a future date (Today is {today_iso})."
            )
        from app.services.workdays import classify_date
        day_info = await classify_date(dt_str)
        if day_info.is_off:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Daily logs cannot be submitted on {day_info.label} ({dt_str}).",
            )
        try:
            dt = datetime.strptime(str(update_data["date"]), "%Y-%m-%d")
            update_data["month_sheet"] = dt.strftime("%B - %Y")
        except Exception:
            pass

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    from app.services.log_compliance import (
        hours_from_start_end,
        load_user_day_entries,
        assert_no_overlap_or_duplicate,
        recompute_day_score,
    )

    merged = {**existing_entry, **update_data}
    auto_hours = hours_from_start_end(merged.get("start_time"), merged.get("end_time"))
    if auto_hours is not None:
        update_data["hours_utilized"] = auto_hours
        merged["hours_utilized"] = auto_hours

    target_uid = existing_entry.get("user_id")
    target_date = merged.get("date") or existing_entry.get("date")
    if target_uid and target_date:
        existing_same_day = await load_user_day_entries(target_uid, target_date)
        assert_no_overlap_or_duplicate(existing_same_day, merged, exclude_id=entry_id)

    # Optimistic Concurrency Control (OCC) Check
    if entry_in.version is not None:
        update_data.pop("version", None)
        update_filter = {
            "id": entry_id,
            "version": entry_in.version,
        }
        res = await db.daily_log_entries.find_one_and_update(
            update_filter,
            {"$set": update_data, "$inc": {"version": 1}},
            return_document=True,
        )

        if not res:
            existing = await db.daily_log_entries.find_one({"id": entry_id})
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This record was modified by another session. Please refresh and try again."
                )
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Log entry '{entry_id}' not found.")
    else:
        update_data.pop("version", None)
        res = await db.daily_log_entries.find_one_and_update(
            {"id": entry_id},
            {"$set": update_data, "$inc": {"version": 1}},
            return_document=True,
        )
        if not res:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Log entry '{entry_id}' not found.")

    res["id"] = res.get("id") or str(res.get("_id"))
    res["workspace_id"] = res.get("workspace_id", "global")
    res["version"] = int(res.get("version", 1))
    try:
        from app.services.log_compliance import recompute_day_score
        uid = res.get("user_id") or existing_entry.get("user_id")
        dte = res.get("date") or existing_entry.get("date")
        if uid and dte:
            await recompute_day_score(
                uid,
                dte,
                variance_reason=update_data.get("variance_reason"),
                actor=current_user,
            )
            old_date = existing_entry.get("date")
            if old_date and old_date != dte:
                await recompute_day_score(uid, old_date, actor=current_user)
    except Exception:
        pass
    return res


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user_role = current_user.get("role", "team_member")
    is_admin = user_role in (UserRole.ADMIN.value, "admin")
    is_lead = user_role in (UserRole.TEAM_LEAD.value, "team_lead")
    lead_dept = current_user.get("department")

    existing_entry = await db.daily_log_entries.find_one({"id": entry_id})
    if not existing_entry:
        raise HTTPException(status_code=404, detail=f"Log entry '{entry_id}' not found.")

    entry_uid = existing_entry.get("user_id")
    entry_rname = existing_entry.get("resource_name")
    entry_dept = existing_entry.get("department")
    curr_id = current_user.get("id") or str(current_user.get("_id"))
    curr_name = (current_user.get("full_name") or current_user.get("name") or "").strip().lower()

    if not is_admin:
        is_own_entry = (
            (entry_uid and str(entry_uid) == str(curr_id))
            or (entry_rname and curr_name and entry_rname.strip().lower() == curr_name)
        )
        is_dept_lead_entry = is_lead and lead_dept and entry_dept and lead_dept.lower() == entry_dept.lower()
        is_hr = user_role in (UserRole.HR.value, "hr")

        if not (is_own_entry or is_dept_lead_entry or is_hr):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this log entry. Only the author who logged the entry can delete it.",
            )

    # 48 Working-Hours Expiration Gate for deleting (Strict equality, zero exemptions)
    if existing_entry.get("date"):
        from app.services.log_compliance import compute_log_submission_window
        win_del = await compute_log_submission_window(
            user_id=entry_uid or current_user["id"],
            target_date_str=existing_entry["date"],
            user_dept=entry_dept or current_user.get("department"),
        )
        if not win_del.get("is_valid") or not win_del.get("is_open"):
            err_msg = win_del.get("error") or f"The 48 working-hour window for {existing_entry['date']} has expired."
            err_status = status.HTTP_400_BAD_REQUEST if (win_del.get("is_not_started") or win_del.get("is_off_day")) else status.HTTP_403_FORBIDDEN
            raise HTTPException(status_code=err_status, detail=err_msg)

    res = await db.daily_log_entries.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Log entry '{entry_id}' not found.")

    try:
        from app.services.log_compliance import recompute_day_score
        if entry_uid and existing_entry.get("date"):
            await recompute_day_score(entry_uid, existing_entry["date"], actor=current_user)
    except Exception:
        pass

    return {"message": "Entry deleted successfully."}
