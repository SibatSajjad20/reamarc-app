"""
Who may approve, reject, clarify, edit, or delete leave / WFH / punch-correction / overtime requests.

HR: team members and team leads only.
Operations: team members and team leads only (HR requests go strictly to Admin).
Admin: everyone except their own row.
Nobody reviews their own request.
Delete: the applicant (pending only) or Admin (pending only).
"""
from typing import Any, Mapping, Optional

from fastapi import HTTPException, status

STAFF_ROLES = {"team_member", "member", "team_lead"}
HR_REVIEWABLE = STAFF_ROLES
OPS_REVIEWABLE = STAFF_ROLES
ADMIN_REVIEWABLE = STAFF_ROLES | {"hr", "operations", "admin", "client"}

REVIEWABLE_BY_ROLE = {
    "hr": HR_REVIEWABLE,
    "operations": OPS_REVIEWABLE,
    "admin": ADMIN_REVIEWABLE,
}


def normalize_role(role: Optional[str]) -> str:
    value = str(role or "team_member").strip().lower()
    if value == "member":
        return "team_member"
    return value or "team_member"


def actor_id(user: Mapping[str, Any]) -> str:
    return str(user.get("id") or user.get("_id") or "")


def can_review_leave_request(
    reviewer: Mapping[str, Any],
    applicant_id: Optional[str],
    applicant_role: Optional[str],
) -> bool:
    reviewer_id = actor_id(reviewer)
    if reviewer_id and applicant_id and reviewer_id == str(applicant_id):
        return False
    allowed = REVIEWABLE_BY_ROLE.get(normalize_role(reviewer.get("role")))
    if not allowed:
        return False
    return normalize_role(applicant_role) in allowed


def can_delete_leave_request(
    actor: Mapping[str, Any],
    applicant_id: Optional[str],
    request_status: Optional[str] = None,
    allow_scoped_hide: bool = False,
) -> bool:
    actor_role = normalize_role(actor.get("role"))
    st = str(request_status or "").strip().lower()
    is_in_flight = st in ("pending", "appealed", "needs_info", "")

    if is_in_flight:
        if actor_role == "admin":
            return True
        return bool(actor_id(actor) and applicant_id and actor_id(actor) == str(applicant_id))

    if allow_scoped_hide:
        if actor_role in ("admin", "hr", "operations"):
            return True
        return bool(actor_id(actor) and applicant_id and actor_id(actor) == str(applicant_id))

    return False


def assert_can_review_leave_request(
    reviewer: Mapping[str, Any],
    applicant_id: Optional[str],
    applicant_role: Optional[str],
) -> None:
    if can_review_leave_request(reviewer, applicant_id, applicant_role):
        return
    reviewer_role = normalize_role(reviewer.get("role"))
    if actor_id(reviewer) and applicant_id and actor_id(reviewer) == str(applicant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot approve or reject your own request.",
        )
    if reviewer_role == "hr":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR can only review team member and team lead requests. HR requests go strictly to Admin.",
        )
    if reviewer_role == "operations":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operations cannot review this request. Admin must review HR, Operations, and Admin requests.",
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to review this request.",
    )


def can_edit_leave_status(
    actor: Mapping[str, Any],
    applicant_id: Optional[str],
    applicant_role: Optional[str],
) -> bool:
    """
    Admin can edit any status (except own row).
    HR can edit statuses of team members and team leads (except own row).
    Operations can edit statuses of team members and team leads (except own row).
    """
    return can_review_leave_request(actor, applicant_id, applicant_role)


def assert_can_edit_leave_status(
    actor: Mapping[str, Any],
    applicant_id: Optional[str],
    applicant_role: Optional[str],
) -> None:
    if can_edit_leave_status(actor, applicant_id, applicant_role):
        return
    actor_role = normalize_role(actor.get("role"))
    if actor_id(actor) and applicant_id and actor_id(actor) == str(applicant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot edit the status of your own request.",
        )
    if actor_role == "hr":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR can only edit statuses for team members and team leads. Admin must edit HR requests.",
        )
    if actor_role == "operations":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operations cannot edit this request status. Admin must edit HR and Operations requests.",
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to edit this request status.",
    )


def assert_can_delete_leave_request(
    actor: Mapping[str, Any],
    applicant_id: Optional[str],
    request_status: Optional[str] = None,
    allow_scoped_hide: bool = False,
) -> None:
    st = str(request_status or "").strip().lower()
    is_in_flight = st in ("pending", "appealed", "needs_info", "")

    if not is_in_flight and not allow_scoped_hide:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending requests can be deleted.",
        )
    if not can_delete_leave_request(actor, applicant_id, request_status, allow_scoped_hide=allow_scoped_hide):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this request.",
        )


# Aliases for backward/forward compatibility
can_review_leave = can_review_leave_request
assert_can_review_leave = assert_can_review_leave_request

