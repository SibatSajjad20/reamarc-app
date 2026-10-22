"""
backend/app/models/company.py
Company model definition for multi-tenant isolation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class CompanyStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class Company(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    accent_color: str = "#6847E0"
    timezone: str = "Asia/Karachi"
    week_start: str = "Monday"
    status: CompanyStatus = CompanyStatus.ACTIVE
    token_version: int = 0
    plan: str = "standard"
    limits: Dict[str, Any] = Field(default_factory=lambda: {"max_users": 100})
    custom_domain: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
