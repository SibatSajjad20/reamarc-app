from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from app.models.user import UserRole

class MemberCreate(BaseModel):
    full_name: str = Field(..., min_length=2, description="Member's full name")
    email: EmailStr = Field(..., description="Corporate or work email address")
    role: UserRole = UserRole.TEAM_MEMBER
    phone: Optional[str] = None
    department: Optional[str] = None
    temporary_password: Optional[str] = None
    send_invite_email: bool = True
    is_active: bool = True

class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None

class MemberResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: UserRole
    phone: Optional[str] = None
    department: Optional[str] = None
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
    channel: str = "email" # "email", "in_app", "all"
    custom_message: Optional[str] = None

class ReminderResponse(BaseModel):
    success: bool
    message: str
    user_id: str
    channel: str
