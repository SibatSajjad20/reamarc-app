"""
Pydantic schemas for Leaves, WFH, Short Leaves, and Regularization requests.
"""
from typing import Optional, Any, List, Dict
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.models.attendance import LeaveType, LeaveStatus


class LeaveCreateRequest(BaseModel):
    leave_type: LeaveType = Field(..., description="Type of request: sick, casual, annual, unpaid, wfh, short_leave, missed_punch_regularization, overtime, shift_change")
    start_date: Optional[str] = Field(default=None, description="Start date of leave or event in YYYY-MM-DD format")
    end_date: Optional[str] = Field(default=None, description="End date of leave or event in YYYY-MM-DD format")
    reason: Optional[str] = Field(default="", description="Detailed explanation or justification for the request")
    
    # Specific fields for Short Leave (1 - 3 hours)
    short_leave_hours: Optional[float] = Field(default=None, ge=0.5, le=4.0, description="Duration in hours for short leave (1.0 to 3.0)")
    short_leave_start_time: Optional[str] = Field(default=None, description="Start time for short leave (HH:MM)")
    short_leave_end_time: Optional[str] = Field(default=None, description="End time for short leave (HH:MM)")
    
    # Specific fields for Missed Punch Regularization
    regularization_date: Optional[str] = Field(default=None, description="Target date of missed punch to regularize (YYYY-MM-DD)")
    correction_target: Optional[str] = Field(default="time_in", description="Correction scope: 'time_in', 'time_out', or 'both'")
    regularization_check_in: Optional[str] = Field(default=None, description="Corrected check-in time (HH:MM)")
    regularization_check_out: Optional[str] = Field(default=None, description="Corrected check-out time (HH:MM)")
    original_check_in: Optional[str] = Field(default=None, description="Actual Time In on the record when the correction was submitted")
    original_check_out: Optional[str] = Field(default=None, description="Actual Time Out on the record when the correction was submitted")
    overtime_date: Optional[str] = Field(default=None, description="Date of claimed overtime YYYY-MM-DD")
    overtime_minutes: Optional[int] = Field(default=None, ge=0, description="Claimed overtime minutes")
    shift_end: Optional[str] = Field(default=None, description="Assigned shift end HH:MM")
    check_out: Optional[str] = Field(default=None, description="Actual checkout HH:MM")

    # Specific fields for Shift Change
    shift_change_dates: Optional[List[str]] = Field(default=None, description="1-14 dates: single day or contiguous range")
    shift_change_location: Optional[str] = Field(default="office", description="'office' | 'wfh'")
    shift_change_shift_id: Optional[str] = Field(default=None, description="Shift template id")
    shift_change_custom_start: Optional[str] = Field(default=None, description="Custom start HH:MM")
    shift_change_custom_end: Optional[str] = Field(default=None, description="Custom end HH:MM")
    shift_change_overnight: Optional[bool] = Field(default=False, description="Overnight flag for custom times")

    @model_validator(mode="before")
    @classmethod
    def normalize_incoming_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        # 1. Map request_type / regularization / leave_category to proper LeaveType enum
        req_type = data.get("request_type") or data.get("leave_type")
        category = data.get("leave_category")

        if req_type in ("regularization", "missed_punch_regularization"):
            data["leave_type"] = LeaveType.MISSED_PUNCH_REGULARIZATION.value
        elif req_type == "leave":
            data["leave_type"] = category or LeaveType.CASUAL.value
        elif req_type in ("wfh", "short_leave", "sick", "casual", "annual", "unpaid", "overtime", "shift_change"):
            data["leave_type"] = req_type

        # 2. Normalize regularization check-in / check-out aliases
        if "regularization_punch_in" in data and not data.get("regularization_check_in"):
            data["regularization_check_in"] = data["regularization_punch_in"]
        if "regularization_punch_out" in data and not data.get("regularization_check_out"):
            data["regularization_check_out"] = data["regularization_punch_out"]
        if "original_punch_in" in data and not data.get("original_check_in"):
            data["original_check_in"] = data["original_punch_in"]
        if "original_punch_out" in data and not data.get("original_check_out"):
            data["original_check_out"] = data["original_punch_out"]

        # 3. Normalize short leave duration aliases
        if "short_leave_duration_hours" in data and data.get("short_leave_hours") is None:
            try:
                data["short_leave_hours"] = float(data["short_leave_duration_hours"])
            except Exception:
                pass

        # 4. Normalize shift_change start_date/end_date if omitted but shift_change_dates provided
        raw_lt = data.get("leave_type")
        lt_str = getattr(raw_lt, "value", str(raw_lt) if raw_lt is not None else "")
        req_type_str = str(data.get("request_type") or "")
        if "shift_change" in (lt_str.lower(), req_type_str.lower()):
            sc_dates = data.get("shift_change_dates")
            if sc_dates and isinstance(sc_dates, list) and len(sc_dates) > 0:
                s_dates = sorted([str(d) for d in sc_dates if d])
                if s_dates:
                    if not data.get("start_date"):
                        data["start_date"] = s_dates[0]
                    if not data.get("end_date"):
                        data["end_date"] = s_dates[-1]

        data.pop("user_id", None)
        data.pop("status", None)
        data.pop("is_approved", None)
        data.pop("reviewed_by_id", None)
        data.pop("reviewed_by_name", None)

        return data

    @model_validator(mode="after")
    def validate_dates_and_times(self) -> "LeaveCreateRequest":
        from app.services.workdays import parse_iso_date
        import re as _re

        lt = self.leave_type.value if isinstance(self.leave_type, LeaveType) else str(self.leave_type)
        is_sc = lt == LeaveType.SHIFT_CHANGE.value

        if is_sc and self.shift_change_dates:
            sorted_dates = sorted([str(d) for d in self.shift_change_dates if d])
            if sorted_dates:
                if not self.start_date:
                    self.start_date = sorted_dates[0]
                if not self.end_date:
                    self.end_date = sorted_dates[-1]

        def _iso(field: str, value: Optional[str], required: bool = False) -> Optional[str]:
            if value is None or value == "":
                if required:
                    raise ValueError(f"{field} is required and must be YYYY-MM-DD")
                return None
            parsed = parse_iso_date(value)
            if parsed is None:
                raise ValueError(f"{field} must be a valid date in YYYY-MM-DD format")
            return parsed.isoformat()

        def _hhmm(field: str, value: Optional[str]) -> Optional[str]:
            if value is None or value == "":
                return None
            if not _re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", str(value).strip()):
                raise ValueError(f"{field} must be HH:MM (24-hour)")
            return str(value).strip()

        self.start_date = _iso("start_date", self.start_date, required=not is_sc) or self.start_date
        self.end_date = _iso("end_date", self.end_date, required=not is_sc) or self.end_date
        self.regularization_date = _iso("regularization_date", self.regularization_date)
        self.overtime_date = _iso("overtime_date", self.overtime_date)
        self.short_leave_start_time = _hhmm("short_leave_start_time", self.short_leave_start_time)
        self.short_leave_end_time = _hhmm("short_leave_end_time", self.short_leave_end_time)
        self.regularization_check_in = _hhmm("regularization_check_in", self.regularization_check_in)
        self.regularization_check_out = _hhmm("regularization_check_out", self.regularization_check_out)
        self.original_check_in = _hhmm("original_check_in", self.original_check_in)
        self.original_check_out = _hhmm("original_check_out", self.original_check_out)
        self.shift_end = _hhmm("shift_end", self.shift_end)
        self.check_out = _hhmm("check_out", self.check_out)
        self.shift_change_custom_start = _hhmm("shift_change_custom_start", self.shift_change_custom_start)
        self.shift_change_custom_end = _hhmm("shift_change_custom_end", self.shift_change_custom_end)

        lt = self.leave_type.value if isinstance(self.leave_type, LeaveType) else str(self.leave_type)
        if lt != LeaveType.SHIFT_CHANGE.value and not (self.reason and self.reason.strip()):
            raise ValueError("reason is required for leave requests")

        return self


class LeaveBalanceUpdateRequest(BaseModel):
    year: Optional[int] = Field(default=None, description="Leave year (defaults to current calendar year)")
    annual_used_opening: Optional[float] = Field(default=None, ge=0, description="Annual days already taken")
    sick_used_opening: Optional[float] = Field(default=None, ge=0, description="Sick days already taken")
    annual_entitled: Optional[float] = Field(default=None, ge=0, description="Total annual leave quota for this employee")
    sick_entitled: Optional[float] = Field(default=None, ge=0, description="Total sick leave quota for this employee")


class LeaveBalanceResponse(BaseModel):
    user_id: str
    user_name: Optional[str] = None
    department: Optional[str] = None
    year: int
    annual_entitled: float = 14.0
    sick_entitled: float = 8.0
    annual_used_opening: float = 0.0
    sick_used_opening: float = 0.0
    annual_used_in_app: float = 0.0
    sick_used_in_app: float = 0.0
    annual_pending: float = 0.0
    sick_pending: float = 0.0
    annual_remaining: float = 14.0
    sick_remaining: float = 8.0
    undertime_days_deducted: float = 0.0
    total_undertime_hours: float = 0.0
    carried_undertime_hours: float = 0.0
    go_live_date: str = "2026-08-21"


class LeaveReviewRequest(BaseModel):
    status: LeaveStatus = Field(..., description="Decision status: 'approved', 'rejected', or 'needs_info'")
    review_comments: Optional[str] = Field(default=None, description="Optional reviewer remarks or approval note")
    rejection_reason: Optional[str] = Field(default=None, description="Mandatory reason if status is rejected")
    clarification_prompt: Optional[str] = Field(default=None, description="Prompt when status is needs_info")


class LeaveClarificationRequest(BaseModel):
    clarification_response: str = Field(..., min_length=2, description="Employee response to clarification request")


class LeaveAppealRequest(BaseModel):
    appeal_reason: str = Field(..., min_length=3, description="Employee reason for appealing the rejection")


class LeaveStatusEditRequest(BaseModel):
    new_status: LeaveStatus = Field(..., description="New status to set ('approved', 'rejected', 'cancelled')")
    reason: str = Field(..., min_length=3, description="Mandatory reason for modifying the status")


class ShiftScheduleDetail(BaseModel):
    date: str
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    auto_wfh: bool = False
    is_rest_day: bool = False
    rest_reason: Optional[str] = None


class ShiftRequestedDetail(BaseModel):
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    location: str = "office"
    break_duration_minutes: int = 60
    expected_hours: float = 8.0
    is_night_shift: bool = False


class LeaveResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    user_id: str
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    department: Optional[str] = None
    leave_type: LeaveType
    request_type: Optional[str] = None
    leave_category: Optional[str] = None
    start_date: Optional[str] = "2026-01-01"
    end_date: Optional[str] = "2026-01-01"
    reason: Optional[str] = ""
    status: LeaveStatus = LeaveStatus.PENDING
    short_leave_hours: Optional[float] = None
    short_leave_duration_hours: Optional[float] = None
    short_leave_start_time: Optional[str] = None
    short_leave_end_time: Optional[str] = None
    regularization_date: Optional[str] = None
    correction_target: Optional[str] = None
    regularization_check_in: Optional[str] = None
    regularization_check_out: Optional[str] = None
    regularization_punch_in: Optional[str] = None
    regularization_punch_out: Optional[str] = None
    original_check_in: Optional[str] = None
    original_check_out: Optional[str] = None
    original_punch_in: Optional[str] = None
    original_punch_out: Optional[str] = None
    overtime_date: Optional[str] = None
    overtime_minutes: Optional[int] = None
    shift_end: Optional[str] = None
    check_out: Optional[str] = None
    shift_change_dates: Optional[List[str]] = None
    shift_change_location: Optional[str] = None
    shift_change_shift_id: Optional[str] = None
    shift_change_custom_start: Optional[str] = None
    shift_change_custom_end: Optional[str] = None
    shift_change_overnight: Optional[bool] = None
    current_schedule: Optional[List[ShiftScheduleDetail]] = None
    requested: Optional[ShiftRequestedDetail] = None
    same_day: Optional[bool] = None
    applied_at: Optional[str] = None
    cancelled_dates: Optional[List[str]] = None
    reviewed_by_id: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    review_comments: Optional[str] = None
    rejection_reason: Optional[str] = None
    clarification_prompt: Optional[str] = None
    clarification_response: Optional[str] = None
    clarification_requested_at: Optional[str] = None
    clarification_submitted_at: Optional[str] = None
    has_appealed: Optional[bool] = False
    appeal_reason: Optional[str] = None
    appealed_at: Optional[str] = None
    appeal_reviewed_by_name: Optional[str] = None
    appeal_reviewed_at: Optional[str] = None
    status_history: Optional[List[Dict[str, Any]]] = []
    reviewed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_computed_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        # 1. Ensure id and user_id exist as strings
        if not data.get("id"):
            data["id"] = str(data.get("_id") or "req_unknown")
        else:
            data["id"] = str(data["id"])
        if not data.get("user_id"):
            data["user_id"] = str(data.get("applicant_id") or data.get("userId") or "user_unknown")
        else:
            data["user_id"] = str(data["user_id"])

        # 2. Normalize leave_type
        raw_lt = data.get("leave_type")
        if isinstance(raw_lt, LeaveType):
            raw_lt = raw_lt.value
        raw_lt_str = str(raw_lt or data.get("request_type") or "casual").strip().lower()

        if raw_lt_str in ("regularization", "missed_punch", "missed_punch_regularization"):
            data["leave_type"] = LeaveType.MISSED_PUNCH_REGULARIZATION.value
            data["request_type"] = "regularization"
        elif raw_lt_str in ("sick", "casual", "annual", "unpaid"):
            data["leave_type"] = raw_lt_str
            data["request_type"] = "leave"
            data["leave_category"] = raw_lt_str
        elif raw_lt_str in ("wfh", "short_leave", "overtime", "shift_change"):
            data["leave_type"] = raw_lt_str
            data["request_type"] = raw_lt_str
        else:
            data["leave_type"] = LeaveType.CASUAL.value
            data["request_type"] = "leave"

        # 3. Normalize status
        raw_st = data.get("status")
        if isinstance(raw_st, LeaveStatus):
            raw_st = raw_st.value
        raw_st_str = str(raw_st or "pending").strip().lower()
        if raw_st_str in ("canceled", "cancelled"):
            data["status"] = LeaveStatus.CANCELLED.value
        elif raw_st_str in ("pending", "needs_info", "approved", "rejected", "appealed"):
            data["status"] = raw_st_str
        else:
            data["status"] = LeaveStatus.PENDING.value

        # 4. Guarantee start_date and end_date are valid non-empty strings
        sc_dates = data.get("shift_change_dates")
        sc_first = sc_dates[0] if (isinstance(sc_dates, list) and len(sc_dates) > 0) else None
        sc_last = sc_dates[-1] if (isinstance(sc_dates, list) and len(sc_dates) > 0) else None

        start_d = (
            data.get("start_date")
            or data.get("regularization_date")
            or data.get("overtime_date")
            or sc_first
            or (str(data.get("created_at") or "")[:10])
            or "2026-01-01"
        )
        end_d = (
            data.get("end_date")
            or start_d
            or sc_last
            or "2026-01-01"
        )
        data["start_date"] = str(start_d)
        data["end_date"] = str(end_d)

        # 5. Normalize punch and duration aliases
        if "regularization_check_in" in data and not data.get("regularization_punch_in"):
            data["regularization_punch_in"] = data["regularization_check_in"]
        if "regularization_check_out" in data and not data.get("regularization_punch_out"):
            data["regularization_punch_out"] = data["regularization_check_out"]
        if "original_check_in" in data and not data.get("original_punch_in"):
            data["original_punch_in"] = data["original_check_in"]
        if "original_check_out" in data and not data.get("original_punch_out"):
            data["original_punch_out"] = data["original_check_out"]
        if "short_leave_hours" in data and not data.get("short_leave_duration_hours"):
            data["short_leave_duration_hours"] = data["short_leave_hours"]
        if data.get("review_comments") and not data.get("rejection_reason"):
            data["rejection_reason"] = data["review_comments"]

        return data


class ShiftChangePreviewItem(BaseModel):
    date: str
    current_schedule: ShiftScheduleDetail
    requested: ShiftRequestedDetail
    conflict: Optional[str] = None
    cut_off: Optional[str] = None
    same_day: bool = False
    is_rest_day: bool = False


class ShiftChangePreviewResponse(BaseModel):
    items: List[ShiftChangePreviewItem]

