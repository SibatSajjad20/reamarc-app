"""
Pydantic schemas for Leaves, WFH, Short Leaves, and Regularization requests.
"""
from typing import Optional, Any
from pydantic import BaseModel, Field, model_validator
from app.models.attendance import LeaveType, LeaveStatus


class LeaveCreateRequest(BaseModel):
    leave_type: LeaveType = Field(..., description="Type of request: sick, casual, annual, unpaid, wfh, short_leave, missed_punch_regularization, overtime")
    start_date: str = Field(..., description="Start date of leave or event in YYYY-MM-DD format")
    end_date: str = Field(..., description="End date of leave or event in YYYY-MM-DD format")
    reason: str = Field(..., description="Detailed explanation or justification for the request")
    
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
        elif req_type in ("wfh", "short_leave", "sick", "casual", "annual", "unpaid", "overtime"):
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

        data.pop("user_id", None)
        data.pop("status", None)
        data.pop("is_approved", None)
        data.pop("reviewed_by_id", None)
        data.pop("reviewed_by_name", None)

        return data


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
    go_live_date: str = "2026-08-21"


class LeaveReviewRequest(BaseModel):
    status: LeaveStatus = Field(..., description="Decision status: 'approved' or 'rejected'")
    review_comments: Optional[str] = Field(default=None, description="Optional reviewer remarks or feedback")


class LeaveResponse(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    department: Optional[str] = None
    leave_type: LeaveType
    request_type: Optional[str] = None
    leave_category: Optional[str] = None
    start_date: str
    end_date: str
    reason: str
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
    reviewed_by_id: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    review_comments: Optional[str] = None
    rejection_reason: Optional[str] = None
    reviewed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_computed_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        lt = data.get("leave_type")
        if isinstance(lt, LeaveType):
            lt = lt.value

        if lt in ("sick", "casual", "annual", "unpaid"):
            data["request_type"] = "leave"
            data["leave_category"] = lt
        elif lt == "missed_punch_regularization":
            data["request_type"] = "regularization"
        elif lt:
            data["request_type"] = lt

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
