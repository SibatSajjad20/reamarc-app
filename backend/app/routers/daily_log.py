from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
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


def _get_current_month_sheet() -> str:
    now = datetime.now()
    return f"{now.strftime('%B')} - {now.year}"


def _generate_sheet_list() -> List[str]:
    """Generate month sheet tabs from August 2026 through the current month."""
    now = datetime.now()
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


def _get_recent_workdays(days: int = 7) -> List[str]:
    """Returns the last N workdays (Monday-Friday) in ISO date format (YYYY-MM-DD), latest first."""
    workdays: List[str] = []
    current = datetime.now(timezone.utc).date()
    while len(workdays) < days:
        if current.weekday() < 5:
            workdays.append(current.isoformat())
        current -= timedelta(days=1)
    return workdays


@router.get("/my-activity", response_model=UserLogActivityResponse)
async def get_my_log_activity(
    days: int = Query(7, ge=1, le=30, description="Past workdays window to check"),
    current_user: dict = Depends(get_current_user),
):
    """Calculates missing Daily Log dates for the current user to display smart backfill reminders."""
    db = get_database()
    uid = current_user["id"]
    fname = current_user.get("name") or current_user.get("full_name", "User")
    is_admin = current_user.get("role") == UserRole.ADMIN.value or current_user.get("role") == "admin"

    if is_admin or db is None:
        return {
            "user_id": uid,
            "full_name": fname,
            "last_logged_date": None,
            "logged_today": True,
            "missing_dates": [],
        }

    workdays = _get_recent_workdays(days)
    today_iso = datetime.now(timezone.utc).date().isoformat()
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

    missing = [w for w in workdays if w not in submitted_dates]
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
        return config["columns"]
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
    user_id: Optional[str] = Query(None, description="Filter by user id (Admin only)"),
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

    # Scoped Query Filter Construction
    query_filter: dict = {}

    # ROLE-BASED SCOPING:
    # If user is a Member, strictly restrict to their own logs
    is_admin = current_user.get("role") == UserRole.ADMIN.value or current_user.get("role") == "admin"
    if not is_admin:
        current_uid = current_user["id"]
        current_name = current_user.get("name") or current_user.get("full_name")
        query_filter["$or"] = [
            {"user_id": current_uid},
            {"user_id": {"$exists": False}, "resource_name": current_name},
            {"user_id": None, "resource_name": current_name},
        ]
    else:
        # Admin can filter by specific user_id or resource_name
        if user_id:
            query_filter["user_id"] = user_id
        if resource_name:
            query_filter["resource_name"] = {"$regex": resource_name, "$options": "i"}

    if start_date and end_date:
        query_filter["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query_filter["date"] = {"$gte": start_date}
    elif end_date:
        query_filter["date"] = {"$lte": end_date}
    elif month_sheet:
        query_filter["month_sheet"] = month_sheet
    else:
        # Default bounded scope: current month sheet
        query_filter["month_sheet"] = _get_current_month_sheet()

    if client_project:
        query_filter["client_project"] = {"$regex": client_project, "$options": "i"}
    if task_status:
        query_filter["task_status"] = task_status
    if task_type:
        query_filter["task_type"] = task_type

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
        # Ensure hours_utilized is float
        try:
            doc["hours_utilized"] = float(doc.get("hours_utilized", 0.0) or 0.0)
        except (ValueError, TypeError):
            doc["hours_utilized"] = 0.0
        result.append(doc)

    return result


@router.post("/entries", response_model=DailyLogEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    entry_in: DailyLogEntryCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    now_iso = datetime.now(timezone.utc).isoformat()
    month_sheet = entry_in.month_sheet or _get_current_month_sheet()

    entry_dict = entry_in.model_dump()
    entry_dict["id"] = f"log-{uuid.uuid4().hex[:12]}"
    entry_dict["workspace_id"] = "global"
    entry_dict["user_id"] = current_user["id"]
    if not entry_dict.get("resource_name"):
        entry_dict["resource_name"] = current_user.get("name") or current_user.get("full_name", "Team Member")
    if not entry_dict.get("role"):
        entry_dict["role"] = current_user.get("designation") or current_user.get("department") or "Contributor"

    entry_dict["month_sheet"] = month_sheet
    entry_dict["version"] = 1
    entry_dict["created_at"] = now_iso
    entry_dict["updated_at"] = now_iso

    await db.daily_log_entries.insert_one(entry_dict)
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

    is_admin = current_user.get("role") == UserRole.ADMIN.value or current_user.get("role") == "admin"
    existing_entry = await db.daily_log_entries.find_one({"id": entry_id})
    if not existing_entry:
        raise HTTPException(status_code=404, detail=f"Log entry '{entry_id}' not found.")

    # Permissions check: Members can only update their own log entries
    if not is_admin:
        entry_uid = existing_entry.get("user_id")
        entry_rname = existing_entry.get("resource_name")
        curr_name = current_user.get("name") or current_user.get("full_name")
        if entry_uid and entry_uid != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to edit another member's log entry.",
            )
        elif not entry_uid and entry_rname and entry_rname != curr_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to edit another member's log entry.",
            )

    update_data = {k: v for k, v in entry_in.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

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
        # Fallback update without version locking
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
    return res


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    is_admin = current_user.get("role") == UserRole.ADMIN.value or current_user.get("role") == "admin"
    existing_entry = await db.daily_log_entries.find_one({"id": entry_id})
    if not existing_entry:
        raise HTTPException(status_code=404, detail=f"Log entry '{entry_id}' not found.")

    # Permissions check: Members can only delete their own entries
    if not is_admin:
        entry_uid = existing_entry.get("user_id")
        entry_rname = existing_entry.get("resource_name")
        curr_name = current_user.get("name") or current_user.get("full_name")
        if entry_uid and entry_uid != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete another member's log entry.",
            )
        elif not entry_uid and entry_rname and entry_rname != curr_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete another member's log entry.",
            )

    res = await db.daily_log_entries.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Log entry '{entry_id}' not found.")

    return {"message": "Entry deleted successfully."}
