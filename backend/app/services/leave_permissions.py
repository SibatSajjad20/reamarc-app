"""
Who may approve, reject, clarify, edit, or delete leave / WFH / punch-correction / overtime requests.

HR: anyone except their own (including Operations). HR's own requests go to Admin.
Operations: team members and team leads only (not own, not HR, not Admin).
Admin: everyone except their own row.
Nobody reviews their own request.
Delete: the applicant (pending only) or Admin (pending only).
"""
from typing import Any, Mapping, Optional

from fastapi import HTTPException, status

from app.services.attendance_permissions import (
    HR_REVIEWABLE,
    OPS_REVIEWABLE,
    actor_id,
    can_review_request,
    is_request_review_allowed,
    normalize_role,
)

ADMIN_REVIEWABLE = HR_REVIEWABLE

REVIEWABLE_BY_ROLE = {
    "hr": HR_REVIEWABLE,
    "operations": OPS_REVIEWABLE,
    "admin": ADMIN_REVIEWABLE,
}


def can_review_leave_request(
    reviewer: Mapping[str, Any],
    applicant_id: Optional[str],
    applicant_role: Optional[str],
) -> bool:
    return is_request_review_allowed(
        reviewer,
        {"id": applicant_id, "role": applicant_role},
    )


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
    can_review_request(reviewer, {"id": applicant_id, "role": applicant_role})


def can_edit_leave_status(
    actor: Mapping[str, Any],
    applicant_id: Optional[str],
    applicant_role: Optional[str],
) -> bool:
    """Same scope as request review: nobody edits their own; HR can edit anyone except self."""
    return can_review_leave_request(actor, applicant_id, applicant_role)


def assert_can_edit_leave_status(
    actor: Mapping[str, Any],
    applicant_id: Optional[str],
    applicant_role: Optional[str],
) -> None:
    can_review_request(actor, {"id": applicant_id, "role": applicant_role})


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

