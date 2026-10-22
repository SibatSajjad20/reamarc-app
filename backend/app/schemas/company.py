"""
backend/app/schemas/company.py
Schemas for company creation, update, and representation.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.models.company import CompanyStatus

RESERVED_SLUGS = {
    "owner", "admin", "api", "www", "app", "mail", "auth", "login",
    "static", "assets", "cdn", "status", "help", "support", "billing",
    "docs", "dashboard", "settings", "public", "reamarc", "root",
    "system", "test",
}

SLUG_REGEX = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$")


class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=32)
    admin_name: str = Field(..., min_length=2, max_length=100)
    admin_email: EmailStr
    logo_url: Optional[str] = None
    accent_color: Optional[str] = "#6847E0"
    timezone: Optional[str] = "Asia/Karachi"
    week_start: Optional[str] = "Monday"

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        s = v.strip().lower()
        if not SLUG_REGEX.match(s):
            raise ValueError(
                "Slug must consist of lowercase alphanumeric characters and hyphens, "
                "starting and ending with an alphanumeric character (2-32 chars)."
            )
        if s in RESERVED_SLUGS:
            raise ValueError(f"Slug '{s}' is reserved and cannot be used.")
        return s


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[CompanyStatus] = None
    limits: Optional[Dict[str, Any]] = None
    accent_color: Optional[str] = None
    timezone: Optional[str] = None
    week_start: Optional[str] = None
    logo_url: Optional[str] = None


class CompanyResponse(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    accent_color: str = "#6847E0"
    timezone: str = "Asia/Karachi"
    week_start: str = "Monday"
    status: CompanyStatus
    plan: str
    limits: Dict[str, Any]
    custom_domain: Optional[str] = None
    created_at: datetime
    created_by: Optional[str] = None
    user_count: Optional[int] = 0
    active_users_7d: Optional[int] = 0
    storage_mb: Optional[float] = 0.0
    admin_invite_status: Optional[str] = None
    last_activity: Optional[str] = None
