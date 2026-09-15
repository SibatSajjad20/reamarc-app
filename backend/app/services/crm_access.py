"""CRM permission overlay on existing Reamarc roles. No new UserRole values."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, status

from app.core.security import get_current_user
from app.models.user import UserRole

_ALL_LEADS_ROLES = {UserRole.ADMIN.value, UserRole.OPERATIONS.value, "admin", "operations"}
_SALES_ROLES = {UserRole.TEAM_LEAD.value, UserRole.TEAM_MEMBER.value, UserRole.MEMBER.value, "team_lead", "team_member", "member"}
_SALES_DEPT = "sales"


def _role(user: Dict[str, Any]) -> str:
    return str(user.get("role") or "").lower().strip()


def _dept(user: Dict[str, Any]) -> str:
    return str(user.get("department") or "").lower().strip()


def is_crm_user(user: Dict[str, Any]) -> bool:
    if not user or not user.get("is_active", True):
        return False
    flagged = user.get("crm_enabled")
    if flagged is False:
        return False
    role = _role(user)
    dept = _dept(user)
    if role in _ALL_LEADS_ROLES or dept in ("operations", "admin"):
        return True
    if dept == _SALES_DEPT and role in _SALES_ROLES:
        return True
    return False


def can_view_all_leads(user: Dict[str, Any]) -> bool:
    if not is_crm_user(user):
        return False
    role = _role(user)
    dept = _dept(user)
    return role in _ALL_LEADS_ROLES or dept in ("operations", "admin") or role in (UserRole.TEAM_LEAD.value, "team_lead")


def can_assign_leads(user: Dict[str, Any]) -> bool:
    if not is_crm_user(user):
        return False
    role = _role(user)
    dept = _dept(user)
    return role in _ALL_LEADS_ROLES or dept in ("operations", "admin") or role in (UserRole.TEAM_LEAD.value, "team_lead")


def can_manage_outcomes(user: Dict[str, Any]) -> bool:
    if not is_crm_user(user):
        return False
    role = _role(user)
    dept = _dept(user)
    return role in _ALL_LEADS_ROLES or dept in ("operations", "admin")


async def require_crm_user(current_user: dict = Depends(get_current_user)) -> dict:
    if not is_crm_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CRM access is limited to sales operators. Ask an admin to enable it.",
        )
    return current_user


def visibility_filter(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """None means no extra restriction (see all). Otherwise Mongo $or for own + unassigned."""
    if can_view_all_leads(user):
        return None
    uid = user.get("id")
    return {"$or": [{"assigned_to": uid}, {"assigned_to": None}]}
