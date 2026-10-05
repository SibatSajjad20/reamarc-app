"""Content Calendar access: admin, content, creative, social media, and performance marketing."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import Depends, HTTPException, status

from app.core.security import get_current_user
from app.models.user import UserRole
from app.services.content_calendar_workflow import is_client

_TEAM_ROLES = {
    UserRole.TEAM_LEAD.value,
    UserRole.TEAM_MEMBER.value,
    UserRole.MEMBER.value,
    "team_lead",
    "team_member",
    "member",
}
_ALLOWED_DEPARTMENTS = {
    "performance marketing",
    "content",
    "creative",
    "social media",
    "content and creative",
    "content & creative",
}


def _role(value: Any) -> str:
    return str(value or "").lower().strip()


def _department(value: Any) -> str:
    text = str(value or "").lower().strip()
    for ch in ("_", "-"):
        text = text.replace(ch, " ")
    return " ".join(text.split())


def can_access_content_calendar(user: Dict[str, Any] | None) -> bool:
    if not user or not user.get("is_active", True):
        return False
    role = _role(user.get("role"))
    if role == UserRole.ADMIN.value or role == "admin":
        return True
    return role in _TEAM_ROLES and _department(user.get("department")) in _ALLOWED_DEPARTMENTS


async def require_content_calendar_user(current_user: dict = Depends(get_current_user)) -> dict:
    if not can_access_content_calendar(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Content Calendar is limited to Admin and Content, Creative, Social Media, and Performance Marketing team leads and members.",
        )
    return current_user


def can_read_content_calendar(user: Dict[str, Any] | None) -> bool:
    """Staff calendar access, plus clients who only receive their review queue."""
    if can_access_content_calendar(user):
        return True
    return is_client(user)


async def require_content_calendar_reader(current_user: dict = Depends(get_current_user)) -> dict:
    if not can_read_content_calendar(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Content Calendar is limited to Admin and Content, Creative, Social Media, and Performance Marketing team leads and members.",
        )
    return current_user
