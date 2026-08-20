"""
Pydantic schemas for Attendance, Punch Card, Daily Matrix, and Punctuality.
"""
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from app.models.attendance import AttendanceStatus, BonusRecommendation
from app.schemas.shift import ShiftResponse


class CheckInRequest(BaseModel):
    latitude: Optional[float] = Field(default=None, description="Current latitude from browser geolocation")
    longitude: Optional[float] = Field(default=None, description="Current longitude from browser geolocation")
    notes: Optional[str] = Field(default=None, description="Optional check-in notes / remarks")
    client_ip: Optional[str] = Field(default=None, description="Client IP address passed from router/client")


class CheckOutRequest(BaseModel):
    latitude: Optional[float] = Field(default=None, description="Current latitude from browser geolocation")
    longitude: Optional[float] = Field(default=None, description="Current longitude from browser geolocation")
    notes: Optional[str] = Field(default=None, description="Optional check-out notes / remarks")


class BreakActionRequest(BaseModel):
    action: Literal["start", "end"] = Field(..., description="Break action: start or end")
    notes: Optional[str] = Field(default=None, description="Optional break notes")


class AttendanceRecordResponse(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    employee_name: Optional[str] = None
    department: Optional[str] = None
    date: str = Field(..., description="Date of attendance in YYYY-MM-DD")
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    break_minutes: int = Field(default=0, description="Break duration in minutes")
    working_hours_minutes: int = Field(default=0, description="Total net working duration in minutes")
    overtime_minutes: int = Field(default=0, description="Overtime in minutes")
    undertime_minutes: int = Field(default=0, description="Undertime in minutes")
    work_hours: float = Field(default=0.0, description="Total net working hours in decimal format")
    work_duration_formatted: str = Field(default="00:00", description="Formatted work hours as HH:MM")
    overtime_hours: float = Field(default=0.0, description="Net overtime hours in decimal format")
    overtime_formatted: str = Field(default="+00:00", description="Formatted overtime as +HH:MM")
    undertime_hours: float = Field(default=0.0, description="Net undertime hours in decimal format")
    undertime_formatted: str = Field(default="-00:00", description="Formatted undertime as -HH:MM")
    late_minutes: int = Field(default=0, description="Minutes late compared to shift start")
    is_late: bool = Field(default=False, description="Whether arrival triggered a late strike (> 30 min buffer)")
    late_strike: int = Field(default=0, description="Late strike counter (0 or 1)")
    status: AttendanceStatus = Field(default=AttendanceStatus.PRESENT, description="Current attendance status")
    is_wfh: bool = Field(default=False, description="Whether this day was worked from home")
    is_wfh_approved: bool = Field(default=False, description="Alias of is_wfh for frontend punch-card contracts")
    is_missed_punch: bool = Field(default=False, description="Flagged by midnight worker for missing check-out")
    is_on_break: bool = Field(default=False, description="Whether the employee currently has an open break")
    break_start_time: Optional[str] = None
    check_in_ip: Optional[str] = None
    check_in_location: Optional[Dict[str, float]] = None
    ip_verified: bool = Field(default=False)
    gps_verified: bool = Field(default=False)
    notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @classmethod
    def from_mongo(cls, data: Dict[str, Any]) -> "AttendanceRecordResponse":
        doc = dict(data or {})
        doc.pop("_id", None)
        cin = doc.get("punch_in") or doc.get("check_in")
        cout = doc.get("punch_out") or doc.get("check_out")
        doc["punch_in"] = cin
        doc["check_in"] = cin
        doc["punch_out"] = cout
        doc["check_out"] = cout
        display_name = doc.get("employee_name") or doc.get("user_name")
        doc["employee_name"] = display_name
        doc["user_name"] = display_name
        doc["is_wfh_approved"] = bool(doc.get("is_wfh_approved", doc.get("is_wfh", False)))
        loc = doc.get("check_in_location") or {}
        doc["ip_verified"] = bool(doc.get("ip_verified") or doc.get("check_in_ip"))
        doc["gps_verified"] = bool(
            doc.get("gps_verified")
            or (isinstance(loc, dict) and loc.get("latitude") is not None and loc.get("longitude") is not None)
        )
        if "working_hours_minutes" not in doc or doc["working_hours_minutes"] is None:
            doc["working_hours_minutes"] = int(round(float(doc.get("work_hours", 0) or 0) * 60))
        if "overtime_minutes" not in doc or doc["overtime_minutes"] is None:
            doc["overtime_minutes"] = int(round(float(doc.get("overtime_hours", 0) or 0) * 60))
        if "undertime_minutes" not in doc or doc["undertime_minutes"] is None:
            doc["undertime_minutes"] = int(round(float(doc.get("undertime_hours", 0) or 0) * 60))
        return cls(**doc)


class PunchStatusResponse(BaseModel):
    is_checked_in: bool
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    active_duration_seconds: Optional[int] = None
    current_status: AttendanceStatus
    shift: Optional[ShiftResponse] = None
    is_wfh_approved: bool = False
    can_check_in: bool = True
    can_check_out: bool = False
    today_record: Optional[AttendanceRecordResponse] = None


class TodayAttendanceResponse(BaseModel):
    record: Optional[AttendanceRecordResponse] = None
    shift: ShiftResponse
    is_wfh_approved: bool = False
    punch_status: PunchStatusResponse
    has_active_break: bool = False
    can_punch_in: bool = True
    can_punch_out: bool = False
    office_latitude: float = 33.5315
    office_longitude: float = 73.1382
    geofence_radius_meters: float = 500.0
    client_ip: Optional[str] = None
    is_ip_verified: bool = False


class DailyMatrixSummary(BaseModel):
    total_headcount: int = 0
    present: int = 0
    on_time: int = 0
    late: int = 0
    wfh: int = 0
    leaves: int = 0
    absent: int = 0


class DailyMatrixRow(BaseModel):
    user_id: str
    employee_code: str = "EMP"
    employee_name: str
    department: Optional[str] = "General"
    role: str = "team_member"
    shift_name: str
    shift_timing: str = "09:30 - 18:30"
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    break_minutes: int = 60
    effective_hours_minutes: int = 0
    status: AttendanceStatus = AttendanceStatus.ABSENT
    status_badge: str = "Absent"
    work_hours: str = "00:00"
    late_minutes: int = 0
    is_late: bool = False
    is_late_alert: bool = False
    ip_verified: bool = False
    gps_verified: bool = False
    distance_meters: Optional[int] = None
    is_wfh_approved: bool = False
    notes: Optional[str] = None
    record_id: Optional[str] = None


class DailyMatrixResponse(BaseModel):
    date: str
    summary: DailyMatrixSummary
    total_employees: int = 0
    present_count: int = 0
    absent_count: int = 0
    late_count: int = 0
    wfh_count: int = 0
    leave_count: int = 0
    rows: List[DailyMatrixRow]


class MonthlyPunctualityRow(BaseModel):
    user_id: str
    employee_name: str
    department: Optional[str] = None
    shift_name: str
    total_working_days: int
    days_present: int
    days_absent: int
    leave_count: int
    late_count: int
    short_leaves_count: int
    total_work_hours: float
    total_work_hours_formatted: str
    overtime_hours: float
    overtime_formatted: str
    undertime_hours: float
    undertime_formatted: str
    net_variance_hours: float
    net_variance_formatted: str
    punctuality_percentage: float
    punctuality_score_percent: Optional[float] = None
    missed_punches: int = 0
    late_strikes: Optional[int] = None
    leaves_taken: Optional[int] = None
    working_days: Optional[int] = None
    bonus_recommendation: BonusRecommendation


class MonthlyPunctualitySummary(BaseModel):
    average_punctuality_percent: float = 0.0
    total_overtime_formatted: str = "+00:00"
    total_undertime_formatted: str = "-00:00"
    total_late_strikes: int = 0
    bonus_eligible_count: int = 0
    total_employees: int = 0


class MonthlyPunctualityResponse(BaseModel):
    year: int
    month: int
    department: Optional[str] = None
    total_employees: int
    summary: MonthlyPunctualitySummary = Field(default_factory=MonthlyPunctualitySummary)
    rows: List[MonthlyPunctualityRow]


class MonthlyTimesheetResponse(BaseModel):
    user_id: str = ""
    employee_name: str = ""
    year: int = 0
    month: int = 0
    records: List[AttendanceRecordResponse]
    summary: MonthlyPunctualityRow


class SecuritySettingsSchema(BaseModel):
    office_public_ips: List[str] = Field(
        default_factory=lambda: ["127.0.0.1", "::1"],
        description="List of whitelisted public and loopback IP addresses"
    )
    office_subnets: List[str] = Field(
        default_factory=lambda: ["192.168.1.0/24", "10.0.0.0/8", "110.39.1.0/24"],
        description="List of authorized office CIDR subnet ranges"
    )
    office_latitude: float = Field(
        default=33.52049,
        description="Office geographic latitude (Business Bay, Sector F DHA Phase 1, Rawalpindi)"
    )
    office_longitude: float = Field(
        default=73.09145,
        description="Office geographic longitude (Business Bay, Sector F DHA Phase 1, Rawalpindi)"
    )
    geofence_radius_meters: float = Field(
        default=150.0,
        ge=10.0,
        description="Maximum permitted distance in meters from office coordinate"
    )
    enforce_ip_whitelist: bool = Field(
        default=True,
        description="Enable/disable Tier 1 IP Whitelist verification"
    )
    enforce_gps_geofence: bool = Field(
        default=True,
        description="Enable/disable Tier 3 GPS Geofencing verification"
    )
    allow_wfh_bypass: bool = Field(
        default=True,
        description="Allow approved WFH requests to bypass IP and GPS checks"
    )
