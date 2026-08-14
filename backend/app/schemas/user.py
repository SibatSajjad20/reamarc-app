from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from app.models.user import UserRole

class MemberCreate(BaseModel):
    full_name: str = Field(..., min_length=2, description="Member's full name")
    email: EmailStr = Field(..., description="Corporate or work email address")
    role: UserRole = UserRole.MEMBER
    department: Optional[str] = None  # e.g., Engineering, AI, Design, QA, Marketing, Operations
    designation: Optional[str] = None # e.g., "Full-Stack Developer", "AI Engineer"
    temporary_password: Optional[str] = None # Optional manual password or auto-generate
    send_invite_email: bool = True
    is_active: bool = True
    workspace_ids: Optional[List[str]] = []

class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    is_active: Optional[bool] = None
    workspace_ids: Optional[List[str]] = None

class MemberResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: UserRole
    department: Optional[str] = None
    designation: Optional[str] = None
    is_active: bool
    workspace_ids: Optional[List[str]] = []
    created_at: Optional[str] = None
