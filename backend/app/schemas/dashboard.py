from typing import Dict, Optional
from pydantic import BaseModel, Field


class CrmSummarySection(BaseModel):
    stages: Dict[str, int] = Field(default_factory=dict)
    total: int = 0
    overdueFollowUps: Optional[int] = None
    unassigned: Optional[int] = None


class ContentSummarySection(BaseModel):
    stages: Dict[str, int] = Field(default_factory=dict)
    activeTotal: int = 0


class WebsiteSummarySection(BaseModel):
    stages: Dict[str, int] = Field(default_factory=dict)
    total: int = 0


class ApprovalsSummarySection(BaseModel):
    pendingLeaves: int = 0
    pendingMissedPunch: int = 0
    pendingLogExceptions: int = 0


class AttendanceTodaySummarySection(BaseModel):
    present: int = 0
    late: int = 0
    remote: int = 0
    absent: int = 0
    onLeave: int = 0


class LogsSummarySection(BaseModel):
    missingToday: int = 0
    missingYesterday: int = 0


class DashboardMetaSection(BaseModel):
    generatedAt: str
    role: str
    department: Optional[str] = None


class DashboardSummaryResponse(BaseModel):
    crm: Optional[CrmSummarySection] = None
    content: Optional[ContentSummarySection] = None
    website: Optional[WebsiteSummarySection] = None
    approvals: Optional[ApprovalsSummarySection] = None
    attendanceToday: Optional[AttendanceTodaySummarySection] = None
    logs: Optional[LogsSummarySection] = None
    meta: DashboardMetaSection
