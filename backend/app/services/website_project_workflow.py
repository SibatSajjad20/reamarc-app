"""
Core state machine, workflow rules, progress calculation, and access logic for Website Projects.
Pure business logic module — no direct database dependencies to ensure isolated testability.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple
import re
from app.schemas.website_project import (
    STAGES,
    STAGE_NAMES,
    HEALTH_STATUSES,
    GATE_KEYS,
    GATE_NAMES,
)

# Map each stage to its client approval gate (if any)
STAGE_GATE_MAP: Dict[str, Optional[str]] = {
    "strategy": "sitemap",
    "content": "content",
    "design": "design",
    "assets": None,
    "development": None,
    "qa": None,
    "client_review": "staging",
    "production": "final",
    "completed": None,
}

# Next sequential stage for auto-advance
NEXT_STAGE_MAP: Dict[str, Optional[str]] = {
    "strategy": "content",
    "content": "design",
    "design": "development",  # Opens both Development and parallel Assets
    "assets": "development",   # Assets runs in parallel; manually or fallback to dev
    "development": "qa",
    "qa": "client_review",
    "client_review": "production",
    "production": "completed",
    "completed": None,
}

MANAGEMENT_ROLES: Set[str] = {"admin", "superadmin", "operations"}
ALLOWED_DEPARTMENTS: Set[str] = {
    "content",
    "creative",
    "website",
    "web development",
    "software development",
    "software",
    "design",
}


class WorkflowError(Exception):
    """Raised when a website project workflow rule or transition is violated."""
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _normalize(val: Any) -> str:
    return str(val or "").strip().lower()


def _clean_dept_token(token: str) -> str:
    cleaned = token.lower().strip()
    cleaned = re.sub(r"[_-]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def get_user_departments(user: Dict[str, Any] | None) -> Set[str]:
    """Extracts and normalizes all department tokens for a user."""
    if not user:
        return set()
    result = set()
    raw_dept = user.get("department")
    if isinstance(raw_dept, str) and raw_dept:
        tokens = re.split(r"[,;/]|\band\b|&", raw_dept, flags=re.IGNORECASE)
        for d in tokens:
            cleaned = _clean_dept_token(d)
            if cleaned:
                result.add(cleaned)
                if cleaned in ("content and creative", "content & creative"):
                    result.add("content")
                    result.add("creative")
    raw_depts = user.get("departments")
    if isinstance(raw_depts, list):
        for d in raw_depts:
            if isinstance(d, str):
                tokens = re.split(r"[,;/]|\band\b|&", d, flags=re.IGNORECASE)
                for tok in tokens:
                    cleaned = _clean_dept_token(tok)
                    if cleaned:
                        result.add(cleaned)
                        if cleaned in ("content and creative", "content & creative"):
                            result.add("content")
                            result.add("creative")
    return result


def is_admin_or_ops(user: Dict[str, Any] | None) -> bool:
    if not user:
        return False
    return _normalize(user.get("role")) in MANAGEMENT_ROLES


def is_website_lead(user: Dict[str, Any] | None) -> bool:
    if not user:
        return False
    role = _normalize(user.get("role"))
    if role not in ("team_lead", "lead"):
        return False
    depts = get_user_departments(user)
    return bool(depts & {"website", "web development", "software development", "software"})


def is_client(user: Dict[str, Any] | None) -> bool:
    if not user:
        return False
    return _normalize(user.get("role")) == "client"


def client_workspace_ids(user: Dict[str, Any] | None) -> Set[str]:
    if not user:
        return set()
    raw = user.get("workspace_ids") or []
    return {str(w).strip() for w in raw if str(w).strip()}


def can_view_project(user: Dict[str, Any] | None, project: Dict[str, Any]) -> bool:
    """Checks if a user is permitted to view a website project."""
    if not user or not user.get("is_active", True):
        return False
    if is_admin_or_ops(user) or is_website_lead(user):
        return True

    proj_ws = str(project.get("workspace_id") or "").strip()
    if is_client(user):
        return bool(proj_ws and proj_ws in client_workspace_ids(user))

    # Assigned Project Manager
    if str(project.get("manager_id") or "").strip() == str(user.get("id") or "").strip():
        return True

    # Staff with allowed department
    depts = get_user_departments(user)
    return bool(depts & ALLOWED_DEPARTMENTS)


def can_manage_project(user: Dict[str, Any] | None, project: Dict[str, Any]) -> bool:
    """Checks if a user is permitted to edit project metadata or force transitions."""
    if not user or not user.get("is_active", True):
        return False
    if is_admin_or_ops(user) or is_website_lead(user):
        return True
    return str(project.get("manager_id") or "").strip() == str(user.get("id") or "").strip()


def can_edit_task(
    user: Dict[str, Any] | None,
    project: Dict[str, Any],
    task: Dict[str, Any],
) -> bool:
    """Checks if a user can update or check off a specific task."""
    if not user or not user.get("is_active", True):
        return False
    if can_manage_project(user, project):
        return True
    user_id = str(user.get("id") or "").strip()
    return str(task.get("assignee_id") or "").strip() == user_id


def can_client_review_gate(user: Dict[str, Any] | None, project: Dict[str, Any]) -> bool:
    """Checks if a client is permitted to approve or request changes on a gate."""
    if not user or not user.get("is_active", True) or not is_client(user):
        return False
    proj_ws = str(project.get("workspace_id") or "").strip()
    return bool(proj_ws and proj_ws in client_workspace_ids(user))


def check_transition(
    project: Dict[str, Any],
    target_stage: str,
    stage_tasks: List[Dict[str, Any]],
    stage_gate: Optional[Dict[str, Any]],
    asset_tasks: Optional[List[Dict[str, Any]]] = None,
    is_force: bool = False,
) -> Tuple[bool, Optional[str], List[str]]:
    """
    Validates whether a project can transition to target_stage.
    Returns (is_allowed, error_reason, list_of_warnings).
    """
    current_stage = project.get("stage", "strategy")
    target_stage = target_stage.lower().strip()
    if target_stage not in STAGES:
        return False, f"Unknown target stage '{target_stage}'", []

    if current_stage == target_stage:
        return True, None, []

    # Project on hold cannot advance
    if project.get("on_hold"):
        if is_force:
            return True, None, ["Project is on hold (force move applied)."]
        return False, "Project is on hold. Auto-advance and stage transitions are paused.", []

    curr_idx = STAGES.index(current_stage) if current_stage in STAGES else 0
    targ_idx = STAGES.index(target_stage)

    # Backward moves are allowed for PM / Admin
    if targ_idx < curr_idx:
        return True, None, [f"Moving backwards from {STAGE_NAMES.get(current_stage)} to {STAGE_NAMES.get(target_stage)}."]

    # If force move is specified, bypass stage gates with warning
    if is_force:
        return True, None, [f"Forced transition to {STAGE_NAMES.get(target_stage)}."]

    # Non-sequential jump forward is not allowed without force
    expected_next = NEXT_STAGE_MAP.get(current_stage)
    if target_stage != expected_next and not (current_stage == "design" and target_stage == "assets"):
        return False, f"Cannot jump from {STAGE_NAMES.get(current_stage)} directly to {STAGE_NAMES.get(target_stage)}. Next stage is {STAGE_NAMES.get(expected_next)}.", []

    warnings: List[str] = []

    # 1. Check approval gate for the current stage
    gate_key = STAGE_GATE_MAP.get(current_stage)
    if gate_key:
        if not stage_gate or stage_gate.get("status") != "approved":
            gate_label = GATE_NAMES.get(gate_key, gate_key.capitalize())
            return False, f"Stage requires {gate_label} to be approved by client before advancing.", []

    # 2. Check required tasks in the current stage
    open_required_tasks = [
        t for t in stage_tasks
        if t.get("required", True) and _normalize(t.get("status")) != "completed"
    ]
    if open_required_tasks:
        count = len(open_required_tasks)
        task_names = ", ".join(f"'{t.get('name')}'" for t in open_required_tasks[:2])
        if count > 2:
            task_names += f" and {count - 2} more"
        return False, f"Cannot advance: {count} required task(s) incomplete ({task_names}).", []

    # 3. Creative assets parallel warning (Development -> QA)
    if current_stage == "development" and target_stage == "qa":
        if asset_tasks:
            open_asset_tasks = [
                t for t in asset_tasks
                if _normalize(t.get("status")) != "completed"
            ]
            if open_asset_tasks:
                warnings.append(f"Notice: {len(open_asset_tasks)} creative asset task(s) remain open.")

    return True, None, warnings


def calculate_progress(
    stage: str,
    on_hold: bool,
    frozen_progress: Optional[int],
    stage_tasks: List[Dict[str, Any]],
    stage_gate: Optional[Dict[str, Any]],
) -> int:
    """
    Computes overall project progress percentage (0 - 100).
    Formula: min(100, round(((completed_stages + current_stage_fraction) / 8) * 100))
    On hold freezes the progress score.
    """
    stage = stage.lower().strip()
    if stage == "completed":
        return 100

    if on_hold and frozen_progress is not None:
        return max(0, min(100, int(frozen_progress)))

    curr_idx = STAGES.index(stage) if stage in STAGES else 0

    req_tasks = [t for t in stage_tasks if t.get("required", True)]
    if req_tasks:
        completed = [t for t in req_tasks if _normalize(t.get("status")) == "completed"]
        fraction = len(completed) / len(req_tasks)
    else:
        # No required tasks: check gate
        gate_key = STAGE_GATE_MAP.get(stage)
        if gate_key and stage_gate:
            gate_status = _normalize(stage_gate.get("status"))
            if gate_status == "approved":
                fraction = 1.0
            elif gate_status == "in_review":
                fraction = 0.5
            else:
                fraction = 0.0
        else:
            fraction = 0.0

    score = round(((curr_idx + fraction) / 8.0) * 100)
    return max(0, min(100, int(score)))


def calculate_health(
    project: Dict[str, Any],
    gates: List[Dict[str, Any]],
    overdue_task_count: int,
    now_date_str: str,
) -> str:
    """
    Calculates project health status:
    - completed: stage is completed
    - on_hold: manual toggle
    - at_risk: launch date passed, ≥3 overdue tasks, or manual override
    - waiting_on_client: any gate currently in_review
    - on_track: otherwise
    """
    if _normalize(project.get("stage")) == "completed":
        return "completed"

    if project.get("on_hold"):
        return "on_hold"

    if project.get("at_risk_override") is True:
        return "at_risk"

    # Launch date passed
    target_launch = str(project.get("target_launch_date") or "").strip()
    if target_launch and len(target_launch) >= 10 and target_launch[:10] < now_date_str[:10]:
        if project.get("at_risk_override") is not False:
            return "at_risk"

    # 3 or more overdue tasks
    if overdue_task_count >= 3:
        if project.get("at_risk_override") is not False:
            return "at_risk"

    # Any approval gate is currently with client
    for g in gates:
        if _normalize(g.get("status")) == "in_review":
            return "waiting_on_client"

    return "on_track"
