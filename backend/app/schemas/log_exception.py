from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class DayTargetResponse(BaseModel):
    date: str
    expected_hours: float = 8.0
    worked_hours: float = 0.0
    logged_hours: float = 0.0
    remaining_hours: float = 0.0
    has_checkin: bool = False
    has_checkout: bool = False
    compare_ready: bool = False
    shift_name: str = "Standard Shift"
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    is_full_leave: bool = False
    is_wfh: bool = False
    status: str = "green"
    pending_action: Optional[str] = None
    pending_message: Optional[str] = None
    follow_ups: List[Dict[str, Any]] = []


class ExceptionItemResponse(BaseModel):
    id: str
    user_id: str
    date: str
    full_name: str
    department: Optional[str] = None
    role: str
    exception_type: str
    message: str
    hours: float = 0.0
    severity: str = "medium"
    required_action: str = "review"
    status: str = "amber"
    action_status: str = "open"
    action_type: Optional[str] = None
    action_by_name: Optional[str] = None
    action_by_role: Optional[str] = None
    expected_hours: float = 0.0
    logged_hours: float = 0.0
    worked_hours: float = 0.0
    gap_hours: float = 0.0
    signed_gap_hours: float = 0.0
    has_checkin: bool = False
    has_checkout: bool = False
    task_count: int = 0
    is_missing_log: bool = False
    escalated: bool = False
    employee_notified: bool = False
    member_reason: Optional[str] = None
    previously_accepted_signed_gap_hours: Optional[float] = None
    reopen_note: Optional[str] = None


class ExceptionActionRequest(BaseModel):
    action: str = Field(..., description="explain | correct | review | escalate | accept | ask_again")


class MemberReasonRequest(BaseModel):
    date: str
    reason: str = Field(..., min_length=3, max_length=500)


class SnapshotHighlight(BaseModel):
    label: str
    value: str
    user_name: Optional[str] = None


class SnapshotPerson(BaseModel):
    user_id: str
    full_name: str
    department: Optional[str] = None
    role: str = "team_member"
    logged: bool = False
    worked_hours: float = 0.0
    logged_hours: float = 0.0
    gap_hours: float = 0.0
    signed_gap_hours: float = 0.0
    has_open_request: bool = False
    has_checkin: bool = False
    has_checkout: bool = False
    due: bool = False
    is_full_leave: bool = False


class SnapshotDepartment(BaseModel):
    name: str
    total: int = 0
    logged: int = 0
    missing: int = 0
    worked_hours: float = 0.0
    logged_hours: float = 0.0


class SnapshotResponse(BaseModel):
    date: str
    range: str = "today"
    employees_expected: int = 0
    logs_submitted: int = 0
    compliance_pct: float = 0.0
    expected_hours: float = 0.0
    logged_hours: float = 0.0
    unallocated_hours: float = 0.0
    tasks_completed: int = 0
    estimate_variance_hours: float = 0.0
    rework_hours: float = 0.0
    exception_count: int = 0
    summary: str = ""
    worked_hours: float = 0.0
    missed_workdays: int = 0
    highlights: List[SnapshotHighlight] = []
    hr_exceptions: List[ExceptionItemResponse] = []
    top_exceptions: List[ExceptionItemResponse] = []
    departments: List[SnapshotDepartment] = []
    people: List[SnapshotPerson] = []
    open_request_user_ids: List[str] = []
