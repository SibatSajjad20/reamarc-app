from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid
from app.database import get_database
from app.core.security import get_current_user, get_workspace_context
from app.schemas.daily_log import (
    DailyLogEntryCreate,
    DailyLogEntryUpdate,
    DailyLogEntryResponse,
    DailyLogColumn,
    DailyLogColumnsConfig,
)

router = APIRouter(
    prefix="/daily-log",
    tags=["Daily Log"],
    responses={
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden"},
        404: {"description": "Not Found"},
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


@router.get("/columns", response_model=List[DailyLogColumn])
async def get_columns(
    workspace_id: str = Depends(get_workspace_context),
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        return DEFAULT_COLUMNS

    config = await db.daily_log_columns.find_one({"workspace_id": workspace_id})
    if config and "columns" in config:
        return config["columns"]
    return DEFAULT_COLUMNS


@router.put("/columns", response_model=List[DailyLogColumn])
async def update_columns(
    columns: List[DailyLogColumn],
    workspace_id: str = Depends(get_workspace_context),
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    col_dicts = [col.model_dump() for col in columns]
    await db.daily_log_columns.update_one(
        {"workspace_id": workspace_id},
        {"$set": {"workspace_id": workspace_id, "columns": col_dicts, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return columns


@router.get("/sheets", response_model=List[str])
async def get_sheets(
    workspace_id: str = Depends(get_workspace_context),
    current_user: dict = Depends(get_current_user),
):
    sheets = _generate_sheet_list()

    db = get_database()
    if db is None:
        return sheets

    existing_sheets = await db.daily_log_entries.distinct("month_sheet", {"workspace_id": workspace_id})
    for sheet in existing_sheets:
        if sheet and sheet not in sheets:
            sheets.append(sheet)

    return sheets


@router.get("/entries", response_model=List[DailyLogEntryResponse])
async def get_entries(
    month_sheet: Optional[str] = Query(None),
    workspace_id: str = Depends(get_workspace_context),
    current_user: dict = Depends(get_current_user),
):
    sheet = month_sheet or _get_current_month_sheet()
    db = get_database()

    if db is None:
        return []

    cursor = db.daily_log_entries.find({"workspace_id": workspace_id, "month_sheet": sheet})
    entries = await cursor.to_list(length=500)

    result = []
    for doc in entries:
        doc["id"] = doc.get("id") or str(doc.get("_id"))
        result.append(doc)

    return result


@router.post("/entries", response_model=DailyLogEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    entry_in: DailyLogEntryCreate,
    workspace_id: str = Depends(get_workspace_context),
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    now_iso = datetime.now(timezone.utc).isoformat()
    month_sheet = entry_in.month_sheet or _get_current_month_sheet()

    entry_dict = entry_in.model_dump()
    entry_dict["id"] = f"log-{uuid.uuid4().hex[:12]}"
    entry_dict["workspace_id"] = workspace_id
    entry_dict["month_sheet"] = month_sheet
    entry_dict["created_at"] = now_iso
    entry_dict["updated_at"] = now_iso

    await db.daily_log_entries.insert_one(entry_dict)
    return entry_dict


@router.put("/entries/{entry_id}", response_model=DailyLogEntryResponse)
async def update_entry(
    entry_id: str,
    entry_in: DailyLogEntryUpdate,
    workspace_id: str = Depends(get_workspace_context),
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    update_data = {k: v for k, v in entry_in.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    res = await db.daily_log_entries.find_one_and_update(
        {"id": entry_id, "workspace_id": workspace_id},
        {"$set": update_data},
        return_document=True,
    )

    if not res:
        raise HTTPException(status_code=404, detail=f"Log entry '{entry_id}' not found.")

    res["id"] = res.get("id") or str(res.get("_id"))
    return res


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    workspace_id: str = Depends(get_workspace_context),
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    res = await db.daily_log_entries.delete_one({"id": entry_id, "workspace_id": workspace_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Log entry '{entry_id}' not found.")

    return {"message": "Entry deleted successfully."}
