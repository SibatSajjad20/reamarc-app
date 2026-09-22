"""CRM permission overlay on existing Reamarc roles. No new UserRole values."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status

from app.core.security import get_current_user
from app.database import get_database
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
    """Admin and operations see every lead, whoever it is assigned to."""
    if not is_crm_user(user):
        return False
    role = _role(user)
    dept = _dept(user)
    return role in _ALL_LEADS_ROLES or dept in ("operations", "admin")


def is_sales_team_lead(user: Dict[str, Any]) -> bool:
    if not is_crm_user(user):
        return False
    return _role(user) in (UserRole.TEAM_LEAD.value, "team_lead") and _dept(user) == _SALES_DEPT


def is_sales_team_person(user: Optional[Dict[str, Any]]) -> bool:
    """Sales department team lead or member. Admin and operations are excluded."""
    if not user:
        return False
    if _role(user) in _ALL_LEADS_ROLES or _dept(user) in ("operations", "admin"):
        return False
    return _dept(user) == _SALES_DEPT and _role(user) in _SALES_ROLES


def lead_visible_to(
    user: Dict[str, Any],
    lead: Dict[str, Any],
    assignee: Optional[Dict[str, Any]] = None,
) -> bool:
    """Pipeline visibility.

    Admin and operations see every lead.
    Sales team leads see unassigned leads, their own, and leads assigned to sales teammates.
    They do not see leads assigned to admin or operations.
    Sales members see unassigned leads and leads assigned to themselves.
    """
    if not is_crm_user(user):
        return False
    if can_view_all_leads(user):
        return True
    assignee_id = lead.get("assigned_to") or None
    if not assignee_id or str(assignee_id) == str(user.get("id") or ""):
        return True
    if is_sales_team_lead(user):
        if not is_sales_team_person(assignee):
            return False
        assignee_doc_id = assignee.get("id")
        return not assignee_doc_id or str(assignee_doc_id) == str(assignee_id)
    return False


def can_assign_leads(user: Dict[str, Any]) -> bool:
    if not is_crm_user(user):
        return False
    role = _role(user)
    dept = _dept(user)
    return role in _ALL_LEADS_ROLES or dept in ("operations", "admin") or (
        role in (UserRole.TEAM_LEAD.value, "team_lead") and dept == _SALES_DEPT
    )


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


async def sales_team_user_ids() -> List[str]:
    """Ids of sales-department team leads and members, including inactive owners of existing leads."""
    db = get_database()
    if db is None:
        return []
    cursor = db.users.find(
        {"role": {"$in": list(_SALES_ROLES)}},
        {"_id": 0, "id": 1, "role": 1, "department": 1},
    )
    docs = await cursor.to_list(400)
    ids: List[str] = []
    for doc in docs:
        uid = doc.get("id")
        if uid and is_sales_team_person(doc):
            ids.append(str(uid))
    return list(dict.fromkeys(ids))


async def visibility_filter(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """None means no extra restriction (admin/operations see all).

    Sales team leads see unassigned leads plus leads owned by the sales team.
    Sales members see unassigned leads plus their own.
    """
    if can_view_all_leads(user):
        return None
    uid = user.get("id")
    if is_sales_team_lead(user):
        ids = await sales_team_user_ids()
        if uid and str(uid) not in ids:
            ids.append(str(uid))
        return {"$or": [{"assigned_to": None}, {"assigned_to": {"$in": ids}}]}
    return {"$or": [{"assigned_to": uid}, {"assigned_to": None}]}
