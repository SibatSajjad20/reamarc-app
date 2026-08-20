"""
Pydantic schemas for Shift Management.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from app.models.attendance import ShiftType


class ShiftBase(BaseModel):
    name: str = Field(..., description="Shift template name, e.g., 'Standard Shift'")
    shift_type: ShiftType = Field(default=ShiftType.STANDARD, description="Type/Category of the shift")
    start_time: str = Field(default="09:30", description="Shift start time in HH:MM format (24-hour)")
    end_time: str = Field(default="18:30", description="Shift end time in HH:MM format (24-hour)")
    break_duration_minutes: int = Field(default=60, ge=0, description="Unpaid break duration in minutes")
    break_start_time: Optional[str] = Field(default=None, description="Unpaid break start HH:MM (e.g. 13:00)")
    break_end_time: Optional[str] = Field(default=None, description="Unpaid break end HH:MM (e.g. 14:00)")
    grace_period_minutes: int = Field(default=30, ge=0, description="Buffer in minutes before arrival counts as late strike")
    expected_hours: float = Field(default=8.0, ge=0.0, description="Net expected working hours per day (span minus unpaid break)")
    is_night_shift: bool = Field(default=False, description="Whether shift spans across midnight into the next day")
    description: Optional[str] = Field(default=None, description="Optional notes or description for the shift")
    is_active: bool = Field(default=True, description="Whether shift template is active")


class ShiftCreate(ShiftBase):
    pass


class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    shift_type: Optional[ShiftType] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    break_duration_minutes: Optional[int] = None
    break_start_time: Optional[str] = None
    break_end_time: Optional[str] = None
    grace_period_minutes: Optional[int] = None
    expected_hours: Optional[float] = None
    is_night_shift: Optional[bool] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ShiftResponse(ShiftBase):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ShiftAssignmentRequest(BaseModel):
    user_id: str = Field(..., description="Target user ID for shift assignment")
    shift_id: str = Field(..., description="Target shift ID")
    effective_from: Optional[str] = Field(default=None, description="Effective start date YYYY-MM-DD")


DEFAULT_SHIFTS: List[Dict[str, Any]] = [
    {
        "name": "Standard Shift",
        "shift_type": ShiftType.STANDARD,
        "start_time": "09:30",
        "end_time": "18:30",
        "break_duration_minutes": 60,
        "break_start_time": "13:00",
        "break_end_time": "14:00",
        "grace_period_minutes": 30,
        "expected_hours": 8.0,
        "is_night_shift": False,
        "description": "Standard office working hours (09:30 AM - 06:30 PM with 1 hour lunch break)",
        "is_active": True,
    },
    {
        "name": "HR Shift",
        "shift_type": ShiftType.HR,
        "start_time": "09:00",
        "end_time": "18:00",
        "break_duration_minutes": 60,
        "break_start_time": "13:00",
        "break_end_time": "14:00",
        "grace_period_minutes": 30,
        "expected_hours": 8.0,
        "is_night_shift": False,
        "description": "Human Resources working hours (09:00 AM - 06:00 PM with 1 hour lunch break)",
        "is_active": True,
    },
    {
        "name": "Afternoon Shift",
        "shift_type": ShiftType.AFTERNOON,
        "start_time": "14:00",
        "end_time": "20:00",
        "break_duration_minutes": 0,
        "break_start_time": None,
        "break_end_time": None,
        "grace_period_minutes": 30,
        "expected_hours": 6.0,
        "is_night_shift": False,
        "description": "Afternoon shift (02:00 PM - 08:00 PM, no unpaid break, 6 expected hours)",
        "is_active": True,
    },
    {
        "name": "Night Shift",
        "shift_type": ShiftType.NIGHT,
        "start_time": "21:00",
        "end_time": "05:00",
        "break_duration_minutes": 60,
        "break_start_time": "01:00",
        "break_end_time": "02:00",
        "grace_period_minutes": 30,
        "expected_hours": 7.0,
        "is_night_shift": True,
        "description": "Overnight shift (09:00 PM - 05:00 AM next day with 1 hour meal break)",
        "is_active": True,
    },
    {
        "name": "WFH Day",
        "shift_type": ShiftType.CUSTOM,
        "start_time": "10:00",
        "end_time": "19:00",
        "break_duration_minutes": 60,
        "break_start_time": "14:00",
        "break_end_time": "15:00",
        "grace_period_minutes": 30,
        "expected_hours": 8.0,
        "is_night_shift": False,
        "description": "Remote daytime template (10:00 AM - 07:00 PM). Assign then edit times per person.",
        "is_active": True,
        "id": "shift_wfh_day",
    },
    {
        "name": "WFH Night",
        "shift_type": ShiftType.CUSTOM,
        "start_time": "21:00",
        "end_time": "05:00",
        "break_duration_minutes": 60,
        "break_start_time": "01:00",
        "break_end_time": "02:00",
        "grace_period_minutes": 30,
        "expected_hours": 7.0,
        "is_night_shift": True,
        "description": "Remote overnight template (09:00 PM - 05:00 AM). Assign then edit times per person.",
        "is_active": True,
        "id": "shift_wfh_night",
    },
]
