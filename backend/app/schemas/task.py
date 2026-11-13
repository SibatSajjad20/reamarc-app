"""Pydantic schemas for the Task Manager module."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator


TASK_STATUSES = ["todo", "in_progress", "in_review", "completed", "cancelled"]
OPEN_STATUSES = ["todo", "in_progress", "in_review"]
TASK_PRIORITIES = ["low", "medium", "high", "urgent"]
TASK_SCOPES = ["mine", "assigned_by_me", "created_by_me", "watching", "all"]
RECURRENCE_FREQS = ["daily", "weekly", "monthly"]
ATTACHMENT_KINDS = ["upload", "drive", "link"]
DEFAULT_REMINDER_OFFSETS = [1440, 60]

STAGE_LABELS = {
    "todo": "To Do",
    "in_progress": "In Progress",
    "in_review": "In Review",
    "completed": "Completed",
    "cancelled": "Cancelled",
}


def parse_ymd(value: Optional[str], field: str = "date") -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        datetime.strptime(raw, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"{field} must be a real YYYY-MM-DD date") from exc
    return raw


def validate_priority_value(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    p = str(v).strip().lower()
    if p not in TASK_PRIORITIES:
        raise ValueError(f"Invalid priority '{v}'")
    return p


def validate_stage_value(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip().lower()
    if s not in TASK_STATUSES:
        raise ValueError(f"Invalid status '{v}'")
    return s


def validate_due_time_value(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return v
    raw = str(v).strip()
    if len(raw) >= 5 and raw[2] == ":":
        hh, mm = raw[:2], raw[3:5]
        if hh.isdigit() and mm.isdigit() and 0 <= int(hh) <= 23 and 0 <= int(mm) <= 59:
            return f"{hh}:{mm}"
    raise ValueError("due_time must be HH:MM")


def validate_http_url(value: str) -> str:
    raw = (value or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("URL must be http:// or https:// with a host")
    return raw


class AssignmentHop(BaseModel):
    model_config = ConfigDict(extra="ignore")

    from_id: Optional[str] = None
    from_name: Optional[str] = None
    to_id: str
    to_name: str = ""
    department: str = ""
    at: str = ""
    note: Optional[str] = None


class ChecklistItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    text: str = Field(..., min_length=1, max_length=500)
    done: bool = False
    done_by: Optional[str] = None
    done_at: Optional[str] = None


class ChecklistItemCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(..., min_length=1, max_length=500)


class ChecklistItemPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: Optional[str] = Field(None, min_length=1, max_length=500)
    done: Optional[bool] = None


class TaskRelated(BaseModel):
    model_config = ConfigDict(extra="ignore")

    workspace_id: Optional[str] = None
    client_name: Optional[str] = None
    website_project_id: Optional[str] = None
    content_item_id: Optional[str] = None


class TaskRecurrence(BaseModel):
    model_config = ConfigDict(extra="ignore")

    freq: Literal["daily", "weekly", "monthly"]
    interval: int = Field(1, ge=1, le=52)
    by_weekday: Optional[List[int]] = None
    until: Optional[str] = None

    @field_validator("by_weekday")
    @classmethod
    def validate_weekdays(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return v
        cleaned = []
        for day in v:
            d = int(day)
            if d < 0 or d > 6:
                raise ValueError("by_weekday values must be 0..6 (Mon..Sun)")
            if d not in cleaned:
                cleaned.append(d)
        return cleaned

    @field_validator("until")
    @classmethod
    def validate_until(cls, v: Optional[str]) -> Optional[str]:
        return parse_ymd(v, "recurrence.until")


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=10000)
    priority: str = "medium"
    assignee_id: Optional[str] = None
    watcher_ids: Optional[List[str]] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    reminder_offsets: Optional[List[int]] = None
    estimate_hours: Optional[float] = Field(None, ge=0, le=1000)
    progress: Optional[int] = Field(None, ge=0, le=100)
    checklist: Optional[List[ChecklistItemCreate]] = None
    parent_id: Optional[str] = None
    related: Optional[TaskRelated] = None
    recurrence: Optional[TaskRecurrence] = None
    blocked: bool = False
    blocked_reason: Optional[str] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        t = (v or "").strip()
        if not t:
            raise ValueError("Title is required")
        if len(t) > 200:
            raise ValueError("Title must be 1–200 characters")
        return t

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        return validate_priority_value(v) or "medium"

    @field_validator("start_date", "due_date")
    @classmethod
    def validate_dates(cls, v: Optional[str], info) -> Optional[str]:
        return parse_ymd(v, info.field_name)

    @field_validator("due_time")
    @classmethod
    def validate_due_time(cls, v: Optional[str]) -> Optional[str]:
        return validate_due_time_value(v)

    @field_validator("reminder_offsets")
    @classmethod
    def validate_offsets(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return v
        cleaned = []
        for n in v:
            val = int(n)
            if val < 0 or val > 60 * 24 * 30:
                raise ValueError("reminder_offsets must be 0..43200 minutes")
            if val not in cleaned:
                cleaned.append(val)
        return cleaned

    @model_validator(mode="after")
    def dates_order(self) -> "TaskCreate":
        if self.due_time and not self.due_date:
            raise ValueError("due_time requires due_date")
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValueError("due_date must be on or after start_date")
        until = self.recurrence.until if self.recurrence else None
        if until and self.due_date and until < self.due_date:
            raise ValueError("recurrence.until must be on or after due_date")
        return self


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=10000)
    priority: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    reminder_offsets: Optional[List[int]] = None
    estimate_hours: Optional[float] = Field(None, ge=0, le=1000)
    progress: Optional[int] = Field(None, ge=0, le=100)
    related: Optional[TaskRelated] = None
    recurrence: Optional[TaskRecurrence] = None
    watcher_ids: Optional[List[str]] = None
    if_updated_at: Optional[str] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        t = v.strip()
        if not t:
            raise ValueError("Title is required")
        if len(t) > 200:
            raise ValueError("Title must be 1–200 characters")
        return t

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: Optional[str]) -> Optional[str]:
        return validate_priority_value(v)

    @field_validator("start_date", "due_date")
    @classmethod
    def validate_dates(cls, v: Optional[str], info) -> Optional[str]:
        return parse_ymd(v, info.field_name)

    @field_validator("due_time")
    @classmethod
    def validate_due_time(cls, v: Optional[str]) -> Optional[str]:
        return validate_due_time_value(v)

    @model_validator(mode="after")
    def dates_order(self) -> "TaskUpdate":
        if self.due_time and self.due_date is None and self.due_time != "":
            # Clearing due_date while sending due_time is invalid; a due_time with
            # due_date omitted is allowed (existing due_date stays on the task).
            pass
        if self.due_time and self.due_date == "":
            raise ValueError("due_time requires due_date")
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValueError("due_date must be on or after start_date")
        until = self.recurrence.until if self.recurrence else None
        if until and self.due_date and until < self.due_date:
            raise ValueError("recurrence.until must be on or after due_date")
        if self.due_time and not self.due_date and self.due_date is not None:
            raise ValueError("due_time requires due_date")
        return self


class TaskStagePatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    to: str
    reason: Optional[str] = None

    @field_validator("to")
    @classmethod
    def validate_to(cls, v: str) -> str:
        s = validate_stage_value(v)
        if not s:
            raise ValueError(f"Invalid status '{v}'")
        return s


class TaskAssignRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    assignee_id: str = Field(..., min_length=1)
    note: Optional[str] = Field(None, max_length=2000)


class TaskBlockRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    blocked: bool
    reason: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def reason_when_blocked(self) -> "TaskBlockRequest":
        if self.blocked and not (self.reason or "").strip():
            raise ValueError("blocked_reason is required when blocking")
        return self


class TaskCancelRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    reason: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        validation_alias=AliasChoices("reason", "cancel_reason"),
    )


class TaskBatchItem(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str
    stage: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    cancel: Optional[bool] = None
    cancel_reason: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("cancel_reason", "reason"),
    )

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: Optional[str]) -> Optional[str]:
        return validate_priority_value(v)

    @field_validator("stage")
    @classmethod
    def validate_stage(cls, v: Optional[str]) -> Optional[str]:
        return validate_stage_value(v)

    @field_validator("due_date")
    @classmethod
    def validate_due(cls, v: Optional[str]) -> Optional[str]:
        return parse_ymd(v, "due_date")


class TaskBatchRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: List[TaskBatchItem] = Field(..., min_length=1, max_length=100)


class TaskWatcherRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: str = Field(..., min_length=1)


class TaskCommentCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(..., min_length=1, max_length=4000)
    question: bool = False
    add_watchers: Optional[List[str]] = None


class TaskCommentPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(..., min_length=1, max_length=4000)


class TaskLinkAttachment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=300)
    url: str = Field(..., min_length=1, max_length=2000)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        return validate_http_url(v)


class TaskDriveAttachment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    drive_file_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=300)
    mime_type: Optional[str] = None
    url: Optional[str] = None
    thumb: Optional[str] = None
    size_bytes: Optional[int] = None


class TaskSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    excluded_roles: Optional[List[str]] = None
    excluded_departments: Optional[List[str]] = None
    wip_limit: Optional[int] = Field(None, ge=0, le=500)
    sla: Optional[Dict[str, Any]] = None


class TaskSavedViewCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=80)
    view: str = Field("list", max_length=40)
    filters: Dict[str, Any] = Field(default_factory=dict)


class TaskReadMark(BaseModel):
    model_config = ConfigDict(extra="ignore")

    last_read_at: Optional[str] = None


class TaskConversationLastComment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_name: str = ""
    text_preview: str = ""
    created_at: Optional[str] = None


class TaskConversationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    task_id: str
    serial: str = ""
    title: str = ""
    status: str = "todo"
    last_comment: Optional[TaskConversationLastComment] = None
    unread_count: int = 0


class TaskConversationListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: List[TaskConversationItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    limit: int = 50


class TaskChatUnreadResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    total: int = 0
    by_task: Dict[str, int] = Field(default_factory=dict)


class TaskMentionableUser(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    role: Optional[str] = None
    department: Optional[str] = None
    departments: Optional[List[str]] = None
    avatar: Optional[str] = None
    will_add_watcher: bool = False


class TaskResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    serial: str
    title: str
    description: str = ""
    status: str
    priority: str
    blocked: bool = False
    blocked_reason: Optional[str] = None
    creator_id: Optional[str] = None
    creator_name: str = ""
    assignee_id: Optional[str] = None
    assignee_name: str = ""
    assignee_role: Optional[str] = None
    assigner_id: Optional[str] = None
    assigner_name: str = ""
    assigner_role: Optional[str] = None
    department: str = ""
    assignment_chain: List[Dict[str, Any]] = Field(default_factory=list)
    involved_ids: List[str] = Field(default_factory=list)
    watcher_ids: List[str] = Field(default_factory=list)
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    reminder_offsets: List[int] = Field(default_factory=lambda: list(DEFAULT_REMINDER_OFFSETS))
    estimate_hours: Optional[float] = None
    progress: int = 0
    checklist: List[Dict[str, Any]] = Field(default_factory=list)
    parent_id: Optional[str] = None
    related: Optional[Dict[str, Any]] = None
    recurrence: Optional[Dict[str, Any]] = None
    recurrence_source_id: Optional[str] = None
    attachments_count: int = 0
    comments_count: int = 0
    subtasks_count: int = 0
    completed_at: Optional[str] = None
    completed_by: Optional[str] = None
    cancelled_at: Optional[str] = None
    cancelled_by: Optional[str] = None
    cancel_reason: Optional[str] = None
    review_requested_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    view_only: bool = False


class TaskListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: List[Dict[str, Any]]
    total: int = 0
    page: int = 1
    limit: int = 50
    stage_counts: Dict[str, int] = Field(default_factory=dict)


class TaskCountsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    todo: int = 0
    in_progress: int = 0
    in_review: int = 0
    completed: int = 0
    cancelled: int = 0
    overdue: int = 0
    today: int = 0
    upcoming: int = 0
    no_due: int = 0
    blocked: int = 0
    open: int = 0


class TaskImportItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    serial: Optional[str] = Field(default=None, max_length=40)
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=10000)
    status: Optional[str] = None
    priority: Optional[str] = "medium"
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    estimate_hours: Optional[float] = Field(default=None, ge=0, le=1000)
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    blocked: bool = False
    blocked_reason: Optional[str] = None

    @field_validator("title")
    @classmethod
    def strip_import_title(cls, v: str) -> str:
        t = (v or "").strip()
        if not t:
            raise ValueError("Title is required")
        return t

    @field_validator("priority")
    @classmethod
    def validate_import_priority(cls, v: Optional[str]) -> str:
        return validate_priority_value(v) or "medium"

    @field_validator("status")
    @classmethod
    def validate_import_status(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        return validate_stage_value(v)

    @field_validator("start_date", "due_date")
    @classmethod
    def validate_import_dates(cls, v: Optional[str], info) -> Optional[str]:
        return parse_ymd(v, info.field_name)

    @field_validator("due_time")
    @classmethod
    def validate_import_due_time(cls, v: Optional[str]) -> Optional[str]:
        return validate_due_time_value(v)


class TaskBulkImportRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: List[TaskImportItem] = Field(..., max_length=1000)
    upsert_by_serial: bool = True


class TaskBulkImportResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    total_processed: int
    inserted_count: int
    updated_count: int
    errors: List[str] = []
