"""
Who may change attendance records vs who may approve requests.

Attendance changes (manual entry, override, missed-punch inquiry, shift
assignment, leave-balance edit):
- Nobody changes their own row.
- Operations cannot change anyone's attendance.
- HR can change anyone except themselves (including Operations).
- Admin can change anyone except themselves.
- HR's own attendance is Admin-only.

Requests (leave, shift-change, WFH, etc.):
- Nobody reviews their own request.
- Operations can review team_member and team_lead only.
- HR can review anyone except themselves (including Operations).
- HR's own requests are Admin-only.
"""
from typing import Any, Mapping, Optional, Union

from fastapi import HTTPException, status

STAFF_ROLES = {"team_member", "member", "team_lead"}
OPS_REVIEWABLE = STAFF_ROLES
HR_REVIEWABLE = STAFF_ROLES | {"hr", "operations", "admin", "client"}
ADMIN_REVIEWABLE = HR_REVIEWABLE

SELF_ATTENDANCE_MESSAGE = "You can't change your own attendance. Ask Admin."
SELF_REQUEST_MESSAGE = "You cannot approve or reject your own request."

Target = Union[str, Mapping[str, Any], None]


def normalize_role(role: Optional[str]) -> str:
    value = str(role or "team_member").strip().lower()
    if value == "member":
        return "team_member"
    if value in ("ops", "operation"):
        return "operations"
    return value or "team_member"


def actor_id(user: Mapping[str, Any]) -> str:
    return str(user.get("id") or user.get("_id") or "")


def target_id(target: Target) -> str:
    if target is None:
        return ""
    if isinstance(target, str):
        return str(target)
    return str(target.get("id") or target.get("_id") or target.get("user_id") or "")


def target_role(target: Target) -> str:
    if target is None or isinstance(target, str):
        return ""
    return normalize_role(target.get("role") or target.get("user_role"))


def is_attendance_change_allowed(actor: Mapping[str, Any], target: Target) -> bool:
    aid = actor_id(actor)
    tid = target_id(target)
    if aid and tid and aid == tid:
        return False
    role = normalize_role(actor.get("role"))
    if role == "operations":
        return False
    return role in ("hr", "admin")


def is_request_review_allowed(actor: Mapping[str, Any], target: Target) -> bool:
    aid = actor_id(actor)
    tid = target_id(target)
    if aid and tid and aid == tid:
        return False
    role = normalize_role(actor.get("role"))
    applicant = target_role(target)
    if role == "operations":
        return applicant in OPS_REVIEWABLE
    if role == "hr":
        return applicant in HR_REVIEWABLE
    if role == "admin":
        return applicant in ADMIN_REVIEWABLE
    return False


def can_change_attendance(actor: Mapping[str, Any], target: Target) -> bool:
    if is_attendance_change_allowed(actor, target):
        return True
    aid = actor_id(actor)
    tid = target_id(target)
    if aid and tid and aid == tid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SELF_ATTENDANCE_MESSAGE)
    if normalize_role(actor.get("role")) == "operations":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operations cannot change anyone's attendance. Ask Admin.",
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to change this attendance.",
    )


def can_review_request(actor: Mapping[str, Any], target: Target) -> bool:
    if is_request_review_allowed(actor, target):
        return True
    aid = actor_id(actor)
    tid = target_id(target)
    if aid and tid and aid == tid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SELF_REQUEST_MESSAGE)
    if normalize_role(actor.get("role")) == "operations":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operations can only review team member and team lead requests.",
        )
    if normalize_role(actor.get("role")) == "hr":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR cannot review their own requests. Ask Admin.",
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to review this request.",
    )
