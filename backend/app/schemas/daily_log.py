from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any, Union
import re

def parse_duration_to_hours(val: Any) -> float:
    """
    Normalizes flexible human time inputs into a standard decimal float.
    Supported formats:
      - "0:30" -> 0.5
      - "1.5" or 1.5 -> 1.5
      - "2 hrs" / "2h" / "2 hours" -> 2.0
      - "45 mins" / "45m" / "45 min" -> 0.75
      - "1h 30m" / "1hr 30min" -> 1.5
      - "1:15" -> 1.25
    Raises ValueError with descriptive guidance if unparseable.
    """
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        if val < 0:
            raise ValueError("Time utilized cannot be negative.")
        return round(float(val), 2)
    
    val_str = str(val).strip().lower()
    if not val_str:
        return 0.0

    # Pattern 1: HH:MM or H:MM (e.g., "0:30", "1:45", "02:15")
    colon_match = re.match(r"^(\d+):(\d{1,2})$", val_str)
    if colon_match:
        h = int(colon_match.group(1))
        m = int(colon_match.group(2))
        if m >= 60:
            raise ValueError("Minutes in time format cannot be 60 or greater.")
        return round(h + (m / 60.0), 2)

    # Pattern 2: Combinations of hours and minutes (e.g., "1h 30m", "2 hrs", "45 mins")
    hours = 0.0
    minutes = 0.0
    has_match = False

    h_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b", val_str)
    if h_match:
        hours = float(h_match.group(1))
        has_match = True

    m_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b", val_str)
    if m_match:
        minutes = float(m_match.group(1))
        has_match = True

    if has_match:
        total = hours + (minutes / 60.0)
        if total < 0:
            raise ValueError("Time utilized cannot be negative.")
        return round(total, 2)

    # Pattern 3: Simple decimal or integer string (e.g., "1.5", "2", "0.75")
    try:
        dec_val = float(val_str)
        if dec_val < 0:
            raise ValueError("Time utilized cannot be negative.")
        return round(dec_val, 2)
    except ValueError:
        pass

    raise ValueError("Please provide time in a valid format (e.g., 1.5, 2 hrs, or 0:30)")


class DailyLogColumn(BaseModel):
    key: str
    label: str
    type: str = "text"  # text, select, date, number
    options: Optional[List[str]] = None
    editable: bool = True
    width: Optional[str] = None


class DailyLogEntryCreate(BaseModel):
    user_id: Optional[str] = None
    date: str
    resource_name: str = ""
    role: str = ""
    department: Optional[str] = None
    client_project: str = ""
    task_description: str = ""
    task_type: str = "Scheduled Task"
    task_status: str = "Incomplete"
    revisions_done: str = ""
    deliverables: str = ""
    hours_utilized: Union[float, str] = 0.0
    remarks: Optional[str] = ""
    month_sheet: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None

    @field_validator("hours_utilized", mode="before")
    @classmethod
    def validate_hours_utilized(cls, v: Any) -> float:
        return parse_duration_to_hours(v)


class DailyLogEntryUpdate(BaseModel):
    version: Optional[int] = Field(None, description="Current record version for Optimistic Concurrency Control (OCC)")
    user_id: Optional[str] = None
    date: Optional[str] = None
    resource_name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    client_project: Optional[str] = None
    task_description: Optional[str] = None
    task_type: Optional[str] = None
    task_status: Optional[str] = None
    revisions_done: Optional[str] = None
    deliverables: Optional[str] = None
    hours_utilized: Optional[Union[float, str]] = None
    remarks: Optional[str] = None
    month_sheet: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None

    @field_validator("hours_utilized", mode="before")
    @classmethod
    def validate_hours_utilized(cls, v: Any) -> Optional[float]:
        if v is None:
            return None
        return parse_duration_to_hours(v)


class DailyLogEntryResponse(BaseModel):
    id: str
    workspace_id: str
    user_id: Optional[str] = None
    version: int = 1
    date: str
    resource_name: str
    role: str
    department: Optional[str] = None
    client_project: str
    task_description: str
    task_type: str
    task_status: str
    revisions_done: str
    deliverables: str
    hours_utilized: float = 0.0
    remarks: Optional[str] = ""
    month_sheet: str
    custom_fields: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DailyLogColumnsConfig(BaseModel):
    workspace_id: str
    columns: List[DailyLogColumn]
