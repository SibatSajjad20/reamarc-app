"""
Attendance & Shift Management Domain Models and Enums.
"""
from enum import Enum


class AttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    AWAITING_CHECKIN = "awaiting_checkin"
    LATE = "late"
    HALF_DAY = "half_day"
    ON_LEAVE = "on_leave"
    WFH = "wfh"
    HOLIDAY = "holiday"
    WEEKEND_OFF = "weekend_off"
    FIRST_SATURDAY_OFF = "first_saturday_off"
    SUNDAY_OFF = "sunday_off"
    MISSED_PUNCH = "missed_punch"
    SHORT_LEAVE = "short_leave"
    SICK_LEAVE = "sick_leave"
    CASUAL_LEAVE = "casual_leave"
    ANNUAL_LEAVE = "annual_leave"
    UNPAID_LEAVE = "unpaid_leave"


class LeaveType(str, Enum):
    SICK = "sick"
    CASUAL = "casual"
    ANNUAL = "annual"
    UNPAID = "unpaid"
    WFH = "wfh"
    SHORT_LEAVE = "short_leave"
    MISSED_PUNCH_REGULARIZATION = "missed_punch_regularization"


class LeaveStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ShiftType(str, Enum):
    STANDARD = "standard"        # Standard 09:30 - 18:30
    HR = "hr"                    # HR 09:00 - 18:00
    AFTERNOON = "afternoon"      # Afternoon 14:00 - 20:00
    NIGHT = "night"              # Night 21:00 - 05:00
    CUSTOM = "custom"


class BonusRecommendation(str, Enum):
    ELIGIBLE = "Eligible"
    REVIEW = "Under Review"
    NOT_ELIGIBLE = "Not Eligible"


class CalendarEventType(str, Enum):
    HOLIDAY = "holiday"
    WORKING_SATURDAY = "working_saturday"
    SPECIAL_EVENT = "special_event"
