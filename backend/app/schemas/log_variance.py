from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DateRangeInfo(BaseModel):
    start: str
    end: str
    today_included: bool = False
    today: str = ""


class LiveHours(BaseModel):
    worked: int = 0
    logged: int = 0


class LogVarianceThresholds(BaseModel):
    under_target_min: int = 30
    large_variance_min: int = 60
    over_logged_min: int = 30
    late_hours: int = 48
    coverage_target_pct: int = 95


class LogVarianceDay(BaseModel):
    date: str
    status: str
    status_label: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    worked: int = 0
    pending_ot: int = 0
    expected: int = 0
    logged: int = 0
    variance: int = 0
    coverage_pct: Optional[float] = None
    tone: str = "neutral"
    flags: List[str] = Field(default_factory=list)
    entries_count: int = 0
    compare_ready: bool = False
    tasks: List[Dict[str, Any]] = Field(default_factory=list)


class LogVarianceAggregates(BaseModel):
    days_scheduled: int = 0
    days_present: int = 0
    days_logged: int = 0
    days_missing: int = 0
    days_under_target: int = 0
    days_absent: int = 0
    days_leave: int = 0
    days_off: int = 0
    days_missing_checkout: int = 0
    worked: int = 0
    logged: int = 0
    expected: int = 0
    variance: int = 0
    coverage_pct: Optional[float] = None
    avg_logged_per_day: Optional[int] = None
    avg_worked_per_day: Optional[int] = None
    avg_logged_per_scheduled_day: Optional[int] = None
    submission_pct: Optional[float] = None
    attendance_vs_plan_pct: Optional[float] = None
    logged_outside: int = 0
    pending_ot: int = 0
    scheduled_complete_logged: int = 0
    scheduled_complete_days: int = 0


class LogVarianceSummary(LogVarianceAggregates):
    people: int = 0
    open_exceptions: int = 0
    today_live: LiveHours = Field(default_factory=LiveHours)


class DepartmentSummary(BaseModel):
    department: str
    people: int = 0
    coverage_pct: Optional[float] = None
    avg_logged_per_day: Optional[int] = None
    days_missing: int = 0
    days_present: int = 0
    worked: int = 0
    logged: int = 0


class EmployeeRow(LogVarianceAggregates):
    user_id: str
    name: str
    avatar: Optional[str] = None
    department: Optional[str] = None
    role: str = "team_member"
    inactive: bool = False
    joining_date: Optional[str] = None
    flags: List[str] = Field(default_factory=list)
    open_exceptions: int = 0
    today_live: Optional[LiveHours] = None


class LogVarianceResponse(BaseModel):
    range: DateRangeInfo
    generated_at: str
    summary: LogVarianceSummary
    departments: List[DepartmentSummary] = Field(default_factory=list)
    rows: List[EmployeeRow] = Field(default_factory=list)
    thresholds: LogVarianceThresholds = Field(default_factory=LogVarianceThresholds)


class EmployeeDetailUser(BaseModel):
    user_id: str
    name: str
    avatar: Optional[str] = None
    department: Optional[str] = None
    role: str = "team_member"
    email: Optional[str] = None
    inactive: bool = False
    joining_date: Optional[str] = None
    deactivation_date: Optional[str] = None


class EmployeeDetailResponse(BaseModel):
    user: EmployeeDetailUser
    summary: LogVarianceAggregates
    days: List[LogVarianceDay] = Field(default_factory=list)
    range: Optional[DateRangeInfo] = None


class ExceptionItem(BaseModel):
    id: str
    user_id: str
    user_name: str
    avatar: Optional[str] = None
    department: Optional[str] = None
    role: str = "team_member"
    date: str
    type: str
    type_label: str
    detail: str
    review_state: str = "open"
    worked: int = 0
    logged: int = 0
    variance: int = 0
    expected: int = 0
    has_checkin: bool = False
    has_checkout: bool = False
    is_wfh: bool = False
    action_status: str = "open"
    escalated: bool = False
    member_reason: Optional[str] = None
    reopen_note: Optional[str] = None


class ExceptionGroup(BaseModel):
    key: str
    label: str
    count: int = 0
    user_id: Optional[str] = None
    avatar: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    flags: List[str] = Field(default_factory=list)
    items: List[ExceptionItem] = Field(default_factory=list)


class ExceptionsTotalsByType(BaseModel):
    all: int = 0
    no_log: int = 0
    over_logged: int = 0
    missing_checkout: int = 0
    large_variance: int = 0
    logged_on_leave_or_off: int = 0
    logged_without_attendance: int = 0
    logged_late: int = 0


class ExceptionsResponse(BaseModel):
    groups: List[ExceptionGroup] = Field(default_factory=list)
    totals_by_type: ExceptionsTotalsByType = Field(default_factory=ExceptionsTotalsByType)
    reviewed_count: int = 0
    range: Optional[DateRangeInfo] = None
