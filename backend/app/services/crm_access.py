"""CRM permission overlay on existing Reamarc roles. No new UserRole values."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status

from app.core.security import get_current_user
from app.database import get_database
from app.models.user import UserRole

# Legacy constant kept only for is_sales_team_person / can_assign_leads which still use role checks
_SALES_ROLES = {UserRole.TEAM_LEAD.value, UserRole.TEAM_MEMBER.value, UserRole.MEMBER.value, "team_lead", "team_member", "member"}
_SALES_DEPT = "sales"


def _role(user: Dict[str, Any]) -> str:
    return str(user.get("role") or "").lower().strip()


def _dept(user: Dict[str, Any]) -> str:
    return str(user.get("department") or "").lower().strip()


def is_crm_user(user: Dict[str, Any]) -> bool:
    """A user can access CRM if they have at least `own` level on the sales module.

    Admin gets this automatically via the resolver.
    """
    if not user or not user.get("is_active", True):
        return False
    flagged = user.get("crm_enabled")
    if flagged is False:
        return False
    from app.services.permissions import load_ctx, resolve, level_gte
    ctx = load_ctx(user)
    if ctx.role == "operations":
        return True
    lvl = resolve(ctx, "sales")
    return level_gte("sales", lvl, "own")


def can_view_all_leads(user: Dict[str, Any]) -> bool:
    """Admin and sales leads (or users with sales=all override) see every lead."""
    if not user:
        return False
    from app.services.permissions import load_ctx, resolve
    ctx = load_ctx(user)
    if ctx.role == "operations":
        return True
    return resolve(ctx, "sales") == "all"


def is_sales_team_lead(user: Dict[str, Any]) -> bool:
    """True if user is a sales team_lead with primary sales department."""
    if not is_crm_user(user):
        return False
    from app.services.permissions import parse_user_departments, normalize_dept, load_ctx, resolve
    ctx = load_ctx(user)
    if ctx.role not in ("team_lead", "lead"):
        return False
    return resolve(ctx, "sales") == "all"


def is_sales_team_person(user: Optional[Dict[str, Any]]) -> bool:
    """Sales department team lead or member. Admin and non-sales users are excluded."""
    if not user:
        return False
    from app.services.permissions import load_ctx, resolve, level_gte
    ctx = load_ctx(user)
    role = ctx.role
    if role in ("admin", "hr", "operations", "client"):
        return False
    lvl = resolve(ctx, "sales")
    return level_gte("sales", lvl, "own")


def lead_visible_to(
    user: Dict[str, Any],
    lead: Dict[str, Any],
    assignee: Optional[Dict[str, Any]] = None,
) -> bool:
    """Pipeline visibility.

    sales=all → every lead.
    sales team leads → unassigned leads, their own, and leads assigned to sales teammates.
      They do not see leads assigned to admin/operations/non-sales users.
    sales members (own) → unassigned leads and leads assigned to themselves.
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
    from app.services.permissions import load_ctx, resolve
    ctx = load_ctx(user)
    return resolve(ctx, "sales") == "all"


def can_manage_outcomes(user: Dict[str, Any]) -> bool:
    if not is_crm_user(user):
        return False
    from app.services.permissions import load_ctx, resolve
    ctx = load_ctx(user)
    return resolve(ctx, "sales") == "all"


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
        {"_id": 0, "id": 1, "role": 1, "department": 1, "departments": 1, "primary_department": 1},
    )
    docs = await cursor.to_list(400)
    ids: List[str] = []
    for doc in docs:
        uid = doc.get("id")
        if uid and is_sales_team_person(doc):
            ids.append(str(uid))
    return list(dict.fromkeys(ids))


async def visibility_filter(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """None means no extra restriction (admin/sales-all see all).

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
