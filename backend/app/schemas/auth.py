from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Literal, Optional

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    name: str = Field(..., min_length=2, description="User full name")

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_uuid: Optional[str] = Field(
        default=None,
        description="Mobile device UUID. When set, enforces 1:1 account-to-phone binding.",
    )

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
    access_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserResponse
    refresh_token: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v):
        if isinstance(v, str):
            return v.strip().lower()
        return v


class VerifyResetCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., pattern=r"^\d{6}$", description="6-digit numeric OTP code")

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v):
        if isinstance(v, str):
            return v.strip().lower()
        return v

    @field_validator("code", mode="before")
    @classmethod
    def clean_code(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., pattern=r"^\d{6}$", description="6-digit numeric OTP code")
    new_password: str = Field(..., min_length=8, description="New password (minimum 8 characters)")

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v):
        if isinstance(v, str):
            return v.strip().lower()
        return v

    @field_validator("code", mode="before")
    @classmethod
    def clean_code(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v


class ForgotPasswordResponse(BaseModel):
    message: str


class VerifyResetCodeResponse(BaseModel):
    message: str
    valid: bool = True


class ResetPasswordResponse(BaseModel):
    message: str



