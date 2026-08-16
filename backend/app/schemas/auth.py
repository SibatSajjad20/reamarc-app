from pydantic import BaseModel, EmailStr, Field
from typing import List, Literal, Optional

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    name: str = Field(..., min_length=2, description="User full name")

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str = "member"
    department: Optional[str] = None
    designation: Optional[str] = None
    is_active: bool = True
    workspace_ids: List[str] = []

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

