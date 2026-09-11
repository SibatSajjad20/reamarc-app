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
    start_date: Optional[str] = None
    end_date: Optional[str] = None
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


class DailyTaskItem(BaseModel):
    id: Optional[str] = None
    task_description: str = ""
    client_project: Optional[str] = None
    task_type: Optional[str] = None
    task_status: Optional[str] = None
    hours_utilized: float = 0.0
    progress_percentage: Optional[int] = None
    blockers: Optional[str] = None


class DayComplianceDetail(BaseModel):
    date: str
    day_name: str
    is_workday: bool = True
    is_off_day: bool = False
    off_day_label: Optional[str] = None
    is_leave: bool = False
    status: str = "not_started"
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    worked_hours: float = 0.0
    logged_hours: float = 0.0
    gap_hours: float = 0.0
    signed_gap_hours: float = 0.0
    due: bool = False
    tasks: List[DailyTaskItem] = []
    member_reason: Optional[str] = None
    action_status: Optional[str] = None
    action_type: Optional[str] = None


class EmployeeComplianceDetailResponse(BaseModel):
    user_id: str
    full_name: str
    email: Optional[str] = None
    department: Optional[str] = None
    role: str = "team_member"
    start_date: str
    end_date: str
    total_worked_hours: float = 0.0
    total_logged_hours: float = 0.0
    total_signed_gap_hours: float = 0.0
    days_expected: int = 0
    days_logged: int = 0
    days_missing: int = 0
    days: List[DayComplianceDetail] = []

