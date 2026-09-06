from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import List, Optional
from app.models.user import UserRole, EmploymentType


def _validate_iso_date(value: Optional[str], field_name: str) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) != 10 or cleaned[4] != "-" or cleaned[7] != "-":
        raise ValueError(f"{field_name} must be YYYY-MM-DD")
    return cleaned


class MemberCreate(BaseModel):
    full_name: str = Field(..., min_length=2, description="Member's full name")
    email: EmailStr = Field(..., description="Corporate or work email address")
    role: UserRole = UserRole.TEAM_MEMBER
    phone: str = Field(..., min_length=5, description="Member's contact phone number")
    department: Optional[str] = None
    joining_date: str = Field(..., description="First day attendance tracking starts (YYYY-MM-DD)")
    employment_type: EmploymentType = EmploymentType.CONTRACT
    probation_start_date: Optional[str] = Field(
        None, description="Probation period start (YYYY-MM-DD); required when employment_type is probation"
    )
    probation_end_date: Optional[str] = Field(
        None, description="Probation period end (YYYY-MM-DD); required when employment_type is probation"
    )
    temporary_password: Optional[str] = None
    send_invite_email: bool = True
    is_active: bool = True

    @field_validator("joining_date")
    @classmethod
    def validate_joining_date(cls, v: str) -> str:
        value = _validate_iso_date(v, "joining_date")
        if not value:
            raise ValueError("joining_date is required")
        return value

    @field_validator("probation_start_date", "probation_end_date")
    @classmethod
    def validate_probation_dates(cls, v: Optional[str]) -> Optional[str]:
        return _validate_iso_date(v, "probation date")

    @model_validator(mode="after")
    def validate_probation_range(self):
        if self.employment_type == EmploymentType.PROBATION:
            start = self.probation_start_date or self.joining_date
            end = self.probation_end_date
            if not end:
                raise ValueError("probation_end_date is required when employment_type is probation")
            if start > end:
                raise ValueError("probation_start_date must be on or before probation_end_date")
            self.probation_start_date = start
            self.probation_end_date = end
        else:
            self.probation_start_date = None
            self.probation_end_date = None
        return self


class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    department: Optional[str] = None
    joining_date: Optional[str] = None
    employment_type: Optional[EmploymentType] = None
    probation_start_date: Optional[str] = None
    probation_end_date: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("joining_date")
    @classmethod
    def validate_joining_date(cls, v: Optional[str]) -> Optional[str]:
        return _validate_iso_date(v, "joining_date")

    @field_validator("probation_start_date", "probation_end_date")
    @classmethod
    def validate_probation_dates(cls, v: Optional[str]) -> Optional[str]:
        return _validate_iso_date(v, "probation date")

    @model_validator(mode="after")
    def validate_probation_range(self):
        if self.employment_type == EmploymentType.CONTRACT:
            # Explicitly clear probation window when switching to contract.
            if self.probation_start_date is None and self.probation_end_date is None:
                pass
            return self
        if self.employment_type == EmploymentType.PROBATION:
            start = self.probation_start_date or self.joining_date
            end = self.probation_end_date
            if not end:
                raise ValueError("probation_end_date is required when employment_type is probation")
            if start and end and start > end:
                raise ValueError("probation_start_date must be on or before probation_end_date")
            if start:
                self.probation_start_date = start
        elif self.probation_start_date and self.probation_end_date:
            if self.probation_start_date > self.probation_end_date:
                raise ValueError("probation_start_date must be on or before probation_end_date")
        return self


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(None, min_length=8)


class MemberResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: UserRole
    phone: Optional[str] = None
    department: Optional[str] = None
    joining_date: Optional[str] = None
    employment_type: EmploymentType = EmploymentType.CONTRACT
    probation_start_date: Optional[str] = None
    probation_end_date: Optional[str] = None
    is_active: bool
    created_at: Optional[str] = None


class MemberActivityResponse(BaseModel):
    user_id: str
    full_name: str
    email: str
    phone: Optional[str] = None
    department: Optional[str] = None
    role: str
    last_logged_date: Optional[str] = None
    logged_today: bool = False
    days_missed: int = 0
    missing_dates: List[str] = []


class UserLogActivityResponse(BaseModel):
    user_id: str
    full_name: str
    last_logged_date: Optional[str] = None
    logged_today: bool = False
    missing_dates: List[str] = []


class ReminderRequest(BaseModel):
    channel: str = "email"  # "email", "in_app", "all"
    custom_message: Optional[str] = None


class ReminderResponse(BaseModel):
    success: bool = True
    message: str
    user_id: Optional[str] = None
    channel: str = "email"
    recipient_email: Optional[str] = None
    recipient_name: Optional[str] = None
    missing_dates: List[str] = []
    timestamp: Optional[str] = None
