from pydantic import BaseModel, EmailStr, Field
from typing import List, Literal, Optional

class AdminCreateUser(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2)
    initial_password: str = Field(..., min_length=8)
    role: Literal["admin", "editor", "viewer", "client"] = "editor"
    workspace_ids: List[str] = []

class AdminUpdateUser(BaseModel):
    full_name: Optional[str] = None
    role: Optional[Literal["admin", "editor", "viewer", "client"]] = None
    is_active: Optional[bool] = None
    workspace_ids: Optional[List[str]] = None

class AdminUserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: Literal["admin", "editor", "viewer", "client"]
    is_active: bool
    workspace_ids: List[str]

class AdminCreateWorkspace(BaseModel):
    name: str = Field(..., min_length=2)
    industry: Optional[str] = "General B2B"
    brand_color: Optional[str] = "bg-indigo-500"
    initials: Optional[str] = None

class AdminAssignWorkspace(BaseModel):
    user_id: str
    workspace_id: str
    action: Literal["assign", "remove"] = "assign"
