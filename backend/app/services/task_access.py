"""Pure Task Manager permission logic. No database access."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from app.services.access import (
    canonical_department,
    effective_access,
    get_user_primary_department,
    normalize_dept,
    normalize_role,
    parse_user_departments,
)

OPEN_STATUSES = ("todo", "in_progress", "in_review")
TERMINAL_STATUSES = ("completed", "cancelled")
ALL_STATUSES = OPEN_STATUSES + TERMINAL_STATUSES

DEFAULT_EXCLUDED_ROLES = ["hr", "operations"]
DEFAULT_EXCLUDED_DEPARTMENTS = ["HR"]

HR_DEPT_MARKERS = {"hr", "human resources", "human resource"}


class TaskAccessError(Exception):
    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def uid_of(user: Optional[Dict[str, Any]]) -> str:
    if not user:
        return ""
    return str(user.get("id") or "").strip()


def role_of(user: Optional[Dict[str, Any]]) -> str:
    if not user:
        return "team_member"
    return normalize_role(user.get("role"))


def display_name(user: Optional[Dict[str, Any]]) -> str:
    if not user:
        return ""
    return str(user.get("full_name") or user.get("name") or "").strip()


def is_admin(user: Optional[Dict[str, Any]]) -> bool:
    return role_of(user) == "admin"


def is_lead(user: Optional[Dict[str, Any]]) -> bool:
    return role_of(user) == "team_lead"


def is_member(user: Optional[Dict[str, Any]]) -> bool:
    return role_of(user) == "team_member"


def is_client(user: Optional[Dict[str, Any]]) -> bool:
    return role_of(user) == "client"


def dept_set(user: Optional[Dict[str, Any]]) -> Set[str]:
    names = parse_user_departments(user)
    out: Set[str] = set()
    for name in names:
        canon = canonical_department(name)
        if canon:
            out.add(canon)
    primary = get_user_primary_department(user)
    if primary:
        out.add(canonical_department(primary))
    return {d for d in out if d}


def share_department(a: Optional[Dict[str, Any]], b: Optional[Dict[str, Any]]) -> bool:
    return bool(dept_set(a) & dept_set(b))


def default_task_settings() -> Dict[str, Any]:
    return {
        "excluded_roles": list(DEFAULT_EXCLUDED_ROLES),
        "excluded_departments": list(DEFAULT_EXCLUDED_DEPARTMENTS),
        "wip_limit": None,
        "sla": {"urgent_hours": 24},
    }


def _norm_role_list(values: Optional[Iterable[str]]) -> Set[str]:
    return {normalize_role(v) for v in (values or []) if v}


def _dept_markers(name: str) -> Set[str]:
    canon = canonical_department(name)
    norm = normalize_dept(name)
    markers = {canon, norm, canon.lower(), norm.lower()}
    collapsed = "".join(norm.split())
    if collapsed:
        markers.add(collapsed)
    if norm in HR_DEPT_MARKERS or canon.lower() in HR_DEPT_MARKERS:
        markers.update(HR_DEPT_MARKERS)
        markers.add("HR")
    return {m for m in markers if m}


def is_task_excluded(user: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    """Admin is never excluded. Role or primary department match the company exclusion lists."""
    if not user or is_admin(user):
        return False
    cfg = settings or default_task_settings()
    excluded_roles_raw = cfg.get("excluded_roles")
    if excluded_roles_raw is None:
        excluded_roles_raw = DEFAULT_EXCLUDED_ROLES
    excluded_roles = _norm_role_list(excluded_roles_raw)
    if role_of(user) in excluded_roles:
        return True
    excluded_depts = cfg.get("excluded_departments")
    if excluded_depts is None:
        excluded_depts = DEFAULT_EXCLUDED_DEPARTMENTS
    excluded_markers: Set[str] = set()
    for d in excluded_depts:
        excluded_markers |= _dept_markers(str(d))
    primary = get_user_primary_department(user)
    if primary and (_dept_markers(primary) & excluded_markers):
        return True
    return False


def module_on(user: Optional[Dict[str, Any]]) -> bool:
    if not user:
        return False
    from app.services.company_modules import module_enabled, modules_from_user

    if not module_enabled(modules_from_user(user), "tasks"):
        return False
    if is_admin(user):
        return True
    return bool(effective_access(user)["modules"].get("tasks"))


def can_open_module(user: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    if not user or user.get("is_active") is False:
        return False
    from app.services.company_modules import module_enabled, modules_from_user

    if not module_enabled(modules_from_user(user), "tasks"):
        return False
    if is_client(user):
        return False
    if is_task_excluded(user, settings):
        return False
    if is_admin(user):
        return True
    if module_on(user):
        return True
    # HR / Ops after the company exclusion is flipped off (walkthrough §14.4 step 11).
    if role_of(user) in ("hr", "operations"):
        return True
    return False


def involved_ids_of(task: Optional[Dict[str, Any]]) -> Set[str]:
    if not task:
        return set()
    ids: Set[str] = set()
    for key in ("creator_id", "assignee_id", "assigner_id"):
        val = str(task.get(key) or "").strip()
        if val:
            ids.add(val)
    for extra in task.get("involved_ids") or []:
        val = str(extra or "").strip()
        if val:
            ids.add(val)
    for extra in task.get("watcher_ids") or []:
        val = str(extra or "").strip()
        if val:
            ids.add(val)
    for hop in task.get("assignment_chain") or []:
        if not isinstance(hop, dict):
            continue
        for key in ("from_id", "to_id"):
            val = str(hop.get(key) or "").strip()
            if val:
                ids.add(val)
    return ids


def is_involved(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]]) -> bool:
    uid = uid_of(user)
    return bool(uid) and uid in involved_ids_of(task)


def is_creator(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]]) -> bool:
    return bool(uid_of(user)) and uid_of(user) == str((task or {}).get("creator_id") or "")


def is_assignee(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]]) -> bool:
    return bool(uid_of(user)) and uid_of(user) == str((task or {}).get("assignee_id") or "")


def is_assigner(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]]) -> bool:
    return bool(uid_of(user)) and uid_of(user) == str((task or {}).get("assigner_id") or "")


def is_self_assigned(task: Optional[Dict[str, Any]]) -> bool:
    if not task:
        return False
    assignee = str(task.get("assignee_id") or "")
    assigner = str(task.get("assigner_id") or "")
    return bool(assignee) and assignee == assigner


def chain_from_ids(task: Optional[Dict[str, Any]]) -> List[str]:
    ids: List[str] = []
    seen: Set[str] = set()
    for hop in (task or {}).get("assignment_chain") or []:
        if not isinstance(hop, dict):
            continue
        val = str(hop.get("from_id") or "").strip()
        if val and val not in seen:
            seen.add(val)
            ids.append(val)
    return ids


def is_chain_assigner(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]]) -> bool:
    uid = uid_of(user)
    return bool(uid) and uid in chain_from_ids(task)


def is_department_lead_of_task(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]]) -> bool:
    if not is_lead(user) or not task:
        return False
    task_dept = canonical_department(str(task.get("department") or ""))
    if not task_dept:
        return False
    return task_dept in dept_set(user)


def _task_role(task: Optional[Dict[str, Any]], key: str) -> str:
    return normalize_role((task or {}).get(key))


def assigner_is_admin(task: Optional[Dict[str, Any]]) -> bool:
    return _task_role(task, "assigner_role") == "admin"


def assignee_is_lead(task: Optional[Dict[str, Any]]) -> bool:
    return _task_role(task, "assignee_role") == "team_lead"


def assignee_is_member(task: Optional[Dict[str, Any]]) -> bool:
    return _task_role(task, "assignee_role") == "team_member"


def is_approver(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    """Admin, chain assigners, or the assignee's department lead. Never the assignee,
    except a team lead who was assigned by admin or who assigned the task to themselves.
    When an admin assigned it to a team member, only that department's team lead may approve.
    """
    if not user or not task or user.get("is_active") is False:
        return False
    if is_client(user) or is_task_excluded(user, settings):
        return False
    if is_lead(user) and is_assignee(user, task) and (is_self_assigned(task) or assigner_is_admin(task)):
        return True
    if is_assignee(user, task):
        return False
    if assigner_is_admin(task) and assignee_is_member(task):
        return is_department_lead_of_task(user, task)
    if is_admin(user):
        return True
    if is_chain_assigner(user, task):
        return True
    if is_department_lead_of_task(user, task):
        return True
    return False


def can_reassign(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    """Admin, current assignee, or current assigner, and only while the task is open."""
    if not user or not task or user.get("is_active") is False:
        return False
    if is_client(user) or is_task_excluded(user, settings):
        return False
    status = str(task.get("status") or "").strip().lower()
    if status not in OPEN_STATUSES:
        return False
    if is_admin(user):
        return True
    uid = uid_of(user)
    return uid in (str(task.get("assignee_id") or ""), str(task.get("assigner_id") or ""))


def lead_sees_department(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]]) -> bool:
    if not is_lead(user) or not task:
        return False
    task_dept = canonical_department(str(task.get("department") or ""))
    if not task_dept:
        return False
    return task_dept in dept_set(user)


def can_view(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    if not user or not task or user.get("is_active") is False:
        return False
    if is_client(user) or is_task_excluded(user, settings):
        return False
    if is_admin(user):
        return True
    if not can_open_module(user, settings):
        return False
    if is_involved(user, task):
        return True
    if lead_sees_department(user, task):
        return True
    return False


def can_comment(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    return can_view(user, task, settings)


def can_edit(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    """Title / description / priority / due. Current assigner (or admin).

    Original creator stays involved after delegation but cannot edit the later hop
    (spec §4.3 'Delegation visibility'). While they remain the current assigner they
    can still edit — that covers the matrix row 'creator or current assigner'.
    """
    if not can_view(user, task, settings):
        return False
    if is_admin(user):
        return True
    return is_assigner(user, task)


def can_edit_checklist(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    """Assignee needs to tick items (walkthrough §14.4 step 5)."""
    if not can_view(user, task, settings):
        return False
    if is_admin(user) or is_creator(user, task) or is_assigner(user, task) or is_assignee(user, task):
        return True
    return False


def can_attach(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    if not can_view(user, task, settings):
        return False
    if is_admin(user):
        return True
    return is_creator(user, task) or is_assigner(user, task) or is_assignee(user, task)


def can_add_watcher(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    if not can_view(user, task, settings):
        return False
    if is_admin(user):
        return True
    return is_creator(user, task) or is_assigner(user, task)


def can_cancel(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    if not can_view(user, task, settings):
        return False
    if is_admin(user):
        return True
    return is_creator(user, task) or is_assigner(user, task)


def can_delete(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]] = None, settings: Optional[Dict[str, Any]] = None) -> bool:
    if not user or is_task_excluded(user, settings) or is_client(user):
        return False
    return is_admin(user)


def can_assign_to(
    actor: Optional[Dict[str, Any]],
    target: Optional[Dict[str, Any]],
    settings: Optional[Dict[str, Any]] = None,
) -> bool:
    if not actor or not target:
        return False
    if is_task_excluded(actor, settings) or is_client(actor):
        return False
    if target.get("is_active") is False:
        return False
    if is_client(target) or is_task_excluded(target, settings):
        return False
    if is_admin(actor):
        return True
    if uid_of(actor) == uid_of(target):
        return True
    actor_role = role_of(actor)
    target_role = role_of(target)
    shared = share_department(actor, target)
    if actor_role == "team_lead":
        if shared:
            return target_role in ("team_member", "team_lead")
        return target_role == "team_lead"
    if actor_role == "team_member":
        if not shared:
            return False
        return target_role in ("team_member", "team_lead")
    if actor_role in ("hr", "operations") and not is_task_excluded(actor, settings):
        return shared
    return False


def assignable_users(
    actor: Optional[Dict[str, Any]],
    candidates: Sequence[Dict[str, Any]],
    settings: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for cand in candidates or []:
        cid = uid_of(cand)
        if not cid or cid in seen:
            continue
        if can_assign_to(actor, cand, settings):
            seen.add(cid)
            out.append(cand)
    return out


def visibility_query(user: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Mongo filter for tasks this user may see. Empty dict = everything (admin)."""
    if not user or is_client(user) or is_task_excluded(user, settings):
        return {"id": {"$in": []}}
    if is_admin(user):
        return {}
    uid = uid_of(user)
    if is_lead(user):
        depts = sorted(dept_set(user))
        clauses: List[Dict[str, Any]] = [{"involved_ids": uid}]
        if depts:
            clauses.append({"department": {"$in": depts}})
        return {"$or": clauses}
    return {"involved_ids": uid}


def is_view_only(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> bool:
    """Lead department visibility without being involved: view + comment only."""
    if not can_view(user, task, settings):
        return True
    if is_admin(user) or is_involved(user, task):
        return False
    return lead_sees_department(user, task)


def can_transition(
    user: Optional[Dict[str, Any]],
    task: Optional[Dict[str, Any]],
    to: str,
    reason: Optional[str] = None,
    settings: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, str]:
    if not user or not task:
        return False, "Missing task"
    if is_task_excluded(user, settings) or is_client(user):
        return False, "You cannot access tasks"
    dest = (to or "").strip().lower()
    if dest not in ALL_STATUSES:
        return False, f"Invalid status '{to}'"
    current = str(task.get("status") or "todo").strip().lower()
    if dest == current:
        return True, ""
    if current == "cancelled":
        return False, "Cancelled tasks cannot change stage"
    admin = is_admin(user)
    creator = is_creator(user, task)
    assigner = is_assigner(user, task)
    assignee = is_assignee(user, task)

    if dest == "cancelled":
        if admin or creator or assigner:
            return True, ""
        return False, "Only the creator or current assigner can cancel this task"

    if current == "completed":
        if dest == "in_progress" and (admin or creator or assigner):
            return True, ""
        return False, "Completed tasks can only be reopened to In Progress"

    if dest == "todo":
        if admin or assigner:
            return True, ""
        return False, "Only the assigner can move this task back to To Do"

    if dest == "in_progress":
        if current == "in_review":
            if assignee:
                return False, "You cannot send back your own task"
            if not is_approver(user, task, settings):
                return False, "Only an approver can send a task back"
            if not (reason or "").strip():
                return False, "A reason is required when sending a task back"
            return True, ""
        if admin or assigner or assignee:
            return True, ""
        return False, "Only the assignee or assigner can start this task"

    if dest == "in_review":
        if current not in ("in_progress", "todo"):
            return False, "Submit for review from In Progress"
        if admin:
            return True, ""
        if assignee and not is_self_assigned(task):
            return True, ""
        if assigner:
            return True, ""
        return False, "Only the assignee can submit this task for review"

    if dest == "completed":
        if assignee and not is_approver(user, task, settings):
            return False, "You cannot approve your own task"
        if current != "in_review" and not admin:
            return False, "Approve from In Review"
        if not is_approver(user, task, settings):
            return False, "Only an approver can complete this task"
        return True, ""

    return False, f"Cannot move from {current} to {dest}"


def allowed_transitions(user: Optional[Dict[str, Any]], task: Optional[Dict[str, Any]], settings: Optional[Dict[str, Any]] = None) -> List[str]:
    current = str((task or {}).get("status") or "todo")
    out = [current]
    for dest in ALL_STATUSES:
        ok, _ = can_transition(user, task, dest, reason="x", settings=settings)
        if ok and dest not in out:
            out.append(dest)
    return out
