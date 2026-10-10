"""
Pydantic schemas and enums for the Website Project Pipeline module.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def validate_http_url(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    val = str(v).strip()
    if not val:
        return None
    parsed = urlparse(val)
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        raise ValueError("URL must be a valid http or https link")
    return val


# Stages in canonical order
STAGES = [
    "strategy",
    "content",
    "design",
    "assets",
    "development",
    "qa",
    "client_review",
    "production",
    "completed",
]

STAGE_NAMES = {
    "strategy": "Strategy",
    "content": "Content",
    "design": "Design",
    "assets": "Creative Assets",
    "development": "Development",
    "qa": "Internal QA",
    "client_review": "Client Review",
    "production": "Production",
    "completed": "Completed",
}

HEALTH_STATUSES = [
    "on_track",
    "waiting_on_client",
    "on_hold",
    "at_risk",
    "completed",
]

WEBSITE_TYPES = [
    "brochure",
    "ecommerce",
    "web_app",
    "landing_page",
    "redesign",
    "other",
]

TASK_KINDS = ["task", "revision", "bug"]
TASK_STATUSES = ["todo", "in_progress", "review", "completed"]
TASK_PRIORITIES = ["low", "medium", "high", "urgent"]

GATE_KEYS = ["sitemap", "content", "design", "staging", "final"]
GATE_NAMES = {
    "sitemap": "Sitemap Approval",
    "content": "Content Approval",
    "design": "Design Approval",
    "staging": "Staging Website Review",
    "final": "Final Website Handover",
}
GATE_STATUSES = ["draft", "in_review", "changes_requested", "approved"]

FOLDERS = [
    "strategy",
    "content",
    "design",
    "assets",
    "development",
    "qa",
    "final",
]


class TaskComment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    user_id: str
    user_name: str
    text: str
    created_at: str


class WebsiteTaskCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=300)
    stage: str
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[str] = None
    status: str = "todo"
    priority: str = "medium"
    kind: str = "task"
    description: Optional[str] = None
    required: bool = True

    @field_validator("stage")
    @classmethod
    def validate_stage(cls, v: str) -> str:
        s = v.lower().strip()
        if s not in STAGES:
            raise ValueError(f"Invalid stage '{v}'. Must be one of {STAGES}")
        return s

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        s = v.lower().strip()
        if s not in TASK_STATUSES:
            raise ValueError(f"Invalid status '{v}'. Must be one of {TASK_STATUSES}")
        return s

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        p = v.lower().strip()
        if p not in TASK_PRIORITIES:
            raise ValueError(f"Invalid priority '{v}'. Must be one of {TASK_PRIORITIES}")
        return p

    @field_validator("kind")
    @classmethod
    def validate_kind(cls, v: str) -> str:
        k = v.lower().strip()
        if k not in TASK_KINDS:
            raise ValueError(f"Invalid kind '{v}'. Must be one of {TASK_KINDS}")
        return k


class WebsiteTaskUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    stage: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    kind: Optional[str] = None
    description: Optional[str] = None
    required: Optional[bool] = None


class WebsiteTaskCommentCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(..., min_length=1, max_length=4000)


class WebsiteTaskResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    project_id: str
    project_name: Optional[str] = None
    stage: str
    name: str
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[str] = None
    status: str
    priority: str
    kind: str
    description: Optional[str] = None
    required: bool
    comments: List[TaskComment] = []
    created_at: str
    updated_at: str


class GateDecisionHistoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    decision: str  # approved | changes_requested
    actor_id: str
    actor_name: str
    round: int
    comment: Optional[str] = None
    timestamp: str


class WebsiteGateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    project_id: str
    gate_key: str
    name: str
    stage: str
    status: str
    round: int
    history: List[GateDecisionHistoryItem] = []
    comment_thread: List[TaskComment] = []
    linked_files: List[str] = []
    updated_at: str


class WebsiteGateDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    decision: str  # approved | changes_requested
    comment: Optional[str] = None
    file_ids: Optional[List[str]] = None

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        d = v.lower().strip()
        if d not in ("approved", "changes_requested"):
            raise ValueError("Decision must be 'approved' or 'changes_requested'")
        return d


class WebsiteGateSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    notes: Optional[str] = None
    file_ids: Optional[List[str]] = None


class WebsiteGateRevisionTaskRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[str] = None
    priority: str = "high"


class WebsiteFileCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    folder: str
    name: str
    storage_key: Optional[str] = None
    external_url: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    task_id: Optional[str] = None
    gate_id: Optional[str] = None

    @field_validator("folder")
    @classmethod
    def validate_folder(cls, v: str) -> str:
        f = v.lower().strip()
        if f not in FOLDERS:
            raise ValueError(f"Invalid folder '{v}'. Must be one of {FOLDERS}")
        return f

    @field_validator("external_url")
    @classmethod
    def validate_external_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        val = str(v).strip()
        if not val:
            return None
        if len(val) > 2048:
            raise ValueError("URL cannot exceed 2048 characters")
        return validate_http_url(val)

    @model_validator(mode="after")
    def validate_storage_or_external_url(self) -> "WebsiteFileCreate":
        has_storage = bool(self.storage_key and str(self.storage_key).strip())
        has_url = bool(self.external_url and str(self.external_url).strip())
        if not has_storage and not has_url:
            raise ValueError("Either storage_key or external_url must be provided.")
        if has_url:
            url = str(self.external_url).strip()
            if len(url) > 2048:
                raise ValueError("external_url must not exceed 2048 characters")
            parsed = urlparse(url)
            if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
                raise ValueError("external_url must be a valid http or https URL")
        return self


class WebsiteDriveFileItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    mimeType: Optional[str] = None
    url: str
    sizeBytes: Optional[int] = None


class WebsiteDriveAttachRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    folder: str = "assets"
    task_id: Optional[str] = None
    gate_id: Optional[str] = None
    files: List[WebsiteDriveFileItem] = Field(default_factory=list)

    @field_validator("folder")
    @classmethod
    def validate_folder(cls, v: str) -> str:
        f = v.lower().strip()
        if f not in FOLDERS:
            raise ValueError(f"Invalid folder '{v}'. Must be one of {FOLDERS}")
        return f

    @model_validator(mode="after")
    def validate_files_count_and_urls(self) -> "WebsiteDriveAttachRequest":
        if not self.files:
            raise ValueError("At least one file must be provided.")
        if len(self.files) > 10:
            raise ValueError("Maximum 10 files allowed per request.")
        for item in self.files:
            fid = str(item.id or "").strip()
            if not fid:
                raise ValueError("File id cannot be empty.")
            fname = str(item.name or "").strip()
            if not fname:
                raise ValueError("File name cannot be empty.")
            u = str(item.url or "").strip()
            if not u:
                raise ValueError("File URL cannot be empty.")
            if len(u) > 2048:
                raise ValueError("File URL must not exceed 2048 characters.")
            parsed = urlparse(u)
            if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
                raise ValueError(f"Invalid URL for file '{item.name}'.")
            netloc = parsed.netloc.lower()
            if not (netloc == "drive.google.com" or netloc.endswith(".drive.google.com") or netloc == "docs.google.com" or netloc.endswith(".docs.google.com")):
                raise ValueError(f"URL '{u}' is not a valid Google Drive or Docs URL.")
        return self


class WebsiteFileResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    project_id: str
    folder: str
    name: str
    storage_key: Optional[str] = None
    external_url: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    task_id: Optional[str] = None
    gate_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str


class WebsiteActivityResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    project_id: str
    type: str
    body: str
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    created_at: str
    meta: Optional[Dict[str, Any]] = None


class WebsiteProjectCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=200)
    workspace_id: str
    client_name: Optional[str] = None
    manager_id: str
    manager_name: Optional[str] = None
    start_date: Optional[str] = None
    target_launch_date: Optional[str] = None
    website_type: str = "other"
    staging_url: Optional[str] = None
    live_url: Optional[str] = None
    description: Optional[str] = None

    @field_validator("website_type")
    @classmethod
    def validate_website_type(cls, v: str) -> str:
        t = v.lower().strip()
        if t not in WEBSITE_TYPES:
            raise ValueError(f"Invalid website type '{v}'. Must be one of {WEBSITE_TYPES}")
        return t

    @field_validator("staging_url", "live_url")
    @classmethod
    def validate_project_urls(cls, v: Optional[str]) -> Optional[str]:
        return validate_http_url(v)


class WebsiteProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    workspace_id: Optional[str] = None
    client_name: Optional[str] = None
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
    start_date: Optional[str] = None
    target_launch_date: Optional[str] = None
    website_type: Optional[str] = None
    on_hold: Optional[bool] = None
    at_risk_override: Optional[bool] = None
    staging_url: Optional[str] = None
    live_url: Optional[str] = None
    description: Optional[str] = None

    @field_validator("staging_url", "live_url")
    @classmethod
    def validate_project_urls(cls, v: Optional[str]) -> Optional[str]:
        return validate_http_url(v)


class StageTransitionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    target_stage: str
    note: Optional[str] = None

    @field_validator("target_stage")
    @classmethod
    def validate_target(cls, v: str) -> str:
        s = v.lower().strip()
        if s not in STAGES:
            raise ValueError(f"Invalid stage '{v}'")
        return s


class ForceStageTransitionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    target_stage: str
    reason: str = Field(..., min_length=3, max_length=1000)

    @field_validator("target_stage")
    @classmethod
    def validate_target(cls, v: str) -> str:
        s = v.lower().strip()
        if s not in STAGES:
            raise ValueError(f"Invalid stage '{v}'")
        return s


class WebsiteProjectResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    workspace_id: str
    client_name: str
    manager_id: str
    manager_name: Optional[str] = None
    start_date: Optional[str] = None
    target_launch_date: Optional[str] = None
    website_type: str
    stage: str
    health: str
    on_hold: bool = False
    at_risk_override: Optional[bool] = None
    staging_url: Optional[str] = None
    live_url: Optional[str] = None
    progress: int = 0
    frozen_progress: Optional[int] = None
    active_gate_key: Optional[str] = None
    overdue_tasks_count: int = 0
    required_tasks_open: int = 0
    total_tasks_count: int = 0
    completed_tasks_count: int = 0
    description: Optional[str] = None
    created_at: str
    updated_at: str


class WebsiteProjectListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: List[WebsiteProjectResponse]
    total: int


class WebsiteSummaryMetrics(BaseModel):
    model_config = ConfigDict(extra="ignore")

    active_projects: int = 0
    waiting_on_client: int = 0
    at_risk: int = 0
    overdue_tasks: int = 0
    launches_next_30_days: int = 0
    pending_approvals: int = 0
    on_hold: int = 0


class WebsiteTeamMemberResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    full_name: str
    email: str = ""
    role: str = "team_member"
    department: str = ""

