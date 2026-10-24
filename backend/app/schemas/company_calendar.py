"""
Pydantic schemas for Company Calendar, Public Holidays, and Working Saturday Overrides.
"""
from typing import Optional, List, Any
from pydantic import BaseModel, Field, model_validator
from app.models.attendance import CalendarEventType


class CalendarEventBase(BaseModel):
    title: str = Field(..., description="Event or holiday title, e.g., 'Eid-ul-Fitr Day 1'")
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    event_type: CalendarEventType = Field(default=CalendarEventType.HOLIDAY, description="Event type: holiday, working_saturday, special_event, relaxed_day")
    description: Optional[str] = Field(default=None, description="Optional notes or details")
    is_workday_override: bool = Field(default=False, description="Set to True if this Saturday or weekend day is an active working day")
    is_off_day: Optional[bool] = Field(default=None, description="Frontend alias: True for holidays / off days")
    leave_from: Optional[str] = Field(default=None, description="HH:MM. On relaxed_day, checkout at or after this time has no undertime.")
    exclude_user_ids: List[str] = Field(default_factory=list, description="People who keep normal shift rules on a relaxed day")
    exclude_wfh: bool = Field(default=True, description="WFH that day is not part of the early leave")

    @model_validator(mode="before")
    @classmethod
    def normalize_event_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        event_type = data.get("event_type")
        if event_type == "event":
            data["event_type"] = CalendarEventType.SPECIAL_EVENT.value
        if data.get("event_type") in (CalendarEventType.WORKING_SATURDAY.value, "working_saturday"):
            data["is_workday_override"] = True
        if data.get("is_off_day") is True:
            data["is_workday_override"] = False
            if not data.get("event_type"):
                data["event_type"] = CalendarEventType.HOLIDAY.value
        if data.get("event_type") in (CalendarEventType.RELAXED_DAY.value, "relaxed_day"):
            data["is_off_day"] = False
            data["is_workday_override"] = bool(data.get("is_workday_override"))
            if not data.get("leave_from"):
                data["leave_from"] = "16:00"
            if data.get("exclude_wfh") is None:
                data["exclude_wfh"] = True
            data["exclude_user_ids"] = [str(uid) for uid in (data.get("exclude_user_ids") or []) if uid]
        return data


class CalendarEventCreate(CalendarEventBase):
    pass


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    event_type: Optional[CalendarEventType] = None
    description: Optional[str] = None
    is_workday_override: Optional[bool] = None
    leave_from: Optional[str] = None
    exclude_user_ids: Optional[List[str]] = None
    exclude_wfh: Optional[bool] = None


class CalendarEventResponse(CalendarEventBase):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_is_off_day(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        event_type = data.get("event_type")
        if data.get("is_off_day") is None:
            data["is_off_day"] = event_type == CalendarEventType.HOLIDAY.value or event_type == "holiday"
        return data


class CalendarMonthResponse(BaseModel):
    year: int
    month: Optional[int] = None
    events: List[CalendarEventResponse]
    holidays: List[str] = Field(default_factory=list, description="List of holiday date strings YYYY-MM-DD")
    working_saturdays: List[str] = Field(default_factory=list, description="List of working Saturday date strings YYYY-MM-DD")
