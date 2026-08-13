from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class DailyLogColumn(BaseModel):
    key: str
    label: str
    type: str = "text"  # text, select, date, number
    options: Optional[List[str]] = None
    editable: bool = True
    width: Optional[str] = None

class DailyLogEntryCreate(BaseModel):
    date: str
    resource_name: str = ""
    role: str = ""
    client_project: str = ""
    task_description: str = ""
    task_type: str = "Scheduled Task"
    task_status: str = "Incomplete"
    revisions_done: str = ""
    deliverables: str = ""
    hours_utilized: str = "0:00"
    remarks: Optional[str] = ""
    month_sheet: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None

class DailyLogEntryUpdate(BaseModel):
    date: Optional[str] = None
    resource_name: Optional[str] = None
    role: Optional[str] = None
    client_project: Optional[str] = None
    task_description: Optional[str] = None
    task_type: Optional[str] = None
    task_status: Optional[str] = None
    revisions_done: Optional[str] = None
    deliverables: Optional[str] = None
    hours_utilized: Optional[str] = None
    remarks: Optional[str] = None
    month_sheet: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None

class DailyLogEntryResponse(BaseModel):
    id: str
    workspace_id: str
    date: str
    resource_name: str
    role: str
    client_project: str
    task_description: str
    task_type: str
    task_status: str
    revisions_done: str
    deliverables: str
    hours_utilized: str
    remarks: Optional[str] = ""
    month_sheet: str
    custom_fields: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class DailyLogColumnsConfig(BaseModel):
    workspace_id: str
    columns: List[DailyLogColumn]
