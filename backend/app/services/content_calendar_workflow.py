"""Stage names, visibility, and legal campaign transitions.

Pure functions so the gates can be tested without a database.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

PIPELINE_STAGES = [
    "Content",
    "Content Internal Review",
    "Content Client Review",
    "Content Revision",
    "Creative Production",
    "Creative Internal Review",
    "Creative Client Review",
    "Creative Revision",
    "Ready to Post",
    "Posted",
    "Rejected",
]

DEFAULT_STAGE = "Content"

CONTENT_STAGES = PIPELINE_STAGES[:4]
CREATIVE_STAGES = PIPELINE_STAGES[4:8]
SOCIAL_STAGES = PIPELINE_STAGES[8:]
CLIENT_REVIEW_STAGES = ["Content Client Review", "Creative Client Review"]

LEGACY_STAGE_MAP = {
    "Content Review": "Content Internal Review",
    "Review Content": "Content Internal Review",
    "Design / Video": "Creative Production",
    "Design / Video Review": "Creative Internal Review",
    "Review": "Creative Internal Review",
    "Revision": "Creative Revision",
    "Approved": "Ready to Post",
    "Ready To Post": "Ready to Post",
}

ACTIONS = {
    "submit",
    "approve",
    "send_back",
    "request_revision",
    "post",
    "reject",
    "return_to_creative",
    "assign",
    "admin_move",
}

_TEAM_ROLES = {"team_lead", "team_member", "member"}
_CONTENT_DEPARTMENTS = {"content", "content and creative", "content & creative"}
_CREATIVE_DEPARTMENTS = {"creative", "content and creative", "content & creative"}
_COMBO_DEPARTMENTS = {"content and creative", "content & creative"}


class WorkflowError(ValueError):
    """A transition or edit the current user is not allowed to make."""


def resolve_stage(value: Optional[str]) -> Optional[str]:
    """Return a canonical stage, or None when the value is not a known stage."""
    text = str(value or "").strip()
    if not text:
        return DEFAULT_STAGE
    if text in PIPELINE_STAGES:
        return text
    mapped = LEGACY_STAGE_MAP.get(text)
    if mapped:
        return mapped
    lowered = text.lower()
    for stage in PIPELINE_STAGES:
        if stage.lower() == lowered:
            return stage
    for old, new in LEGACY_STAGE_MAP.items():
        if old.lower() == lowered:
            return new
    return None


def normalize_stage(value: Optional[str]) -> str:
    return resolve_stage(value) or DEFAULT_STAGE


def stored_stage_aliases(stages: List[str]) -> List[str]:
    """Stage values that may still be stored and normalize into `stages`."""
    wanted = set(stages)
    names = set(stages)
    for old, new in LEGACY_STAGE_MAP.items():
        if new in wanted:
            names.add(old)
    return list(names)


def _role(user: Optional[Dict[str, Any]]) -> str:
    return str((user or {}).get("role") or "").lower().strip()


def _user_departments(user: Optional[Dict[str, Any]]) -> Set[str]:
    if not user:
        return set()
    raw_list: List[str] = []
    if isinstance(user.get("departments"), list):
        for d in user["departments"]:
            if d:
                raw_list.append(str(d))
    dept_str = user.get("department")
    if isinstance(dept_str, str) and dept_str:
        for part in re.split(r"[,;/]|\band\b|&", dept_str, flags=re.IGNORECASE):
            s = part.strip()
            if s:
                raw_list.append(s)
    depts: Set[str] = set()
    for item in raw_list:
        clean = " ".join(re.sub(r"[_-]+", " ", str(item)).lower().split())
        if clean:
            depts.add(clean)
            if clean in ("content and creative", "content & creative"):
                depts.add("content")
                depts.add("creative")
    return depts


def _user_id(user: Optional[Dict[str, Any]]) -> str:
    if not user:
        return ""
    return str(user.get("id") or user.get("_id") or "")


def is_active(user: Optional[Dict[str, Any]]) -> bool:
    if not user:
        return False
    return user.get("is_active", True) is not False


def is_admin(user: Optional[Dict[str, Any]]) -> bool:
    return is_active(user) and _role(user) == "admin"


def is_client(user: Optional[Dict[str, Any]]) -> bool:
    return is_active(user) and _role(user) == "client"


def _team(user: Optional[Dict[str, Any]]) -> bool:
    return is_active(user) and _role(user) in _TEAM_ROLES


def is_performance(user: Optional[Dict[str, Any]]) -> bool:
    return _team(user) and "performance marketing" in _user_departments(user)


def is_content_actor(user: Optional[Dict[str, Any]]) -> bool:
    return _team(user) and "content" in _user_departments(user)


def is_content_lead(user: Optional[Dict[str, Any]]) -> bool:
    return is_active(user) and _role(user) == "team_lead" and "content" in _user_departments(user)


def is_creative_actor(user: Optional[Dict[str, Any]]) -> bool:
    return _team(user) and "creative" in _user_departments(user)


def is_creative_lead(user: Optional[Dict[str, Any]]) -> bool:
    return is_active(user) and _role(user) == "team_lead" and "creative" in _user_departments(user)


def is_social_actor(user: Optional[Dict[str, Any]]) -> bool:
    return _team(user) and "social media" in _user_departments(user)


def visible_stages(user: Optional[Dict[str, Any]]) -> Optional[List[str]]:
    """Stages this user may receive. None means every stage."""
    if not is_active(user):
        return []
    if is_admin(user) or is_performance(user) or is_client(user):
        return None
    depts = _user_departments(user)
    stages: List[str] = []
    if "content" in depts:
        stages.extend(CONTENT_STAGES)
    if "creative" in depts:
        stages.extend(CREATIVE_STAGES)
    if "social media" in depts:
        stages.extend(SOCIAL_STAGES)
    res = [s for s in PIPELINE_STAGES if s in stages]
    return res if res else []


def client_owns(user: Optional[Dict[str, Any]], item: Dict[str, Any]) -> bool:
    workspace_id = item.get("workspace_id")
    if not workspace_id:
        return False
    allowed = [str(value) for value in (user or {}).get("workspace_ids") or []]
    return str(workspace_id) in allowed


def can_view_item(user: Optional[Dict[str, Any]], item: Dict[str, Any]) -> bool:
    if not is_active(user):
        return False
    stage = normalize_stage(item.get("stage"))
    allowed = visible_stages(user)
    if allowed is not None and stage not in allowed:
        return False
    if is_client(user):
        return client_owns(user, item)
    return allowed is None or stage in allowed


def can_create(user: Optional[Dict[str, Any]]) -> bool:
    return is_admin(user) or is_content_actor(user)


def _is_assignee(user: Optional[Dict[str, Any]], item: Dict[str, Any]) -> bool:
    assignee = str(item.get("assignee_id") or "")
    return bool(assignee) and assignee == _user_id(user)


def can_edit_item(user: Optional[Dict[str, Any]], item: Dict[str, Any]) -> bool:
    if not can_view_item(user, item):
        return False
    if is_performance(user) or is_client(user):
        return False
    if is_admin(user):
        return True
    stage = normalize_stage(item.get("stage"))
    if stage in ("Content", "Content Revision"):
        return is_content_actor(user)
    if stage in ("Creative Production", "Creative Revision"):
        return is_creative_lead(user) or (is_creative_actor(user) and _is_assignee(user, item))
    if stage == "Ready to Post":
        return is_social_actor(user)
    return False


def _require_workspace(item: Dict[str, Any]) -> None:
    if not item.get("workspace_id"):
        raise WorkflowError("Assign a client workspace before sending this to the client.")


def resolve_transition(
    user: Optional[Dict[str, Any]],
    item: Dict[str, Any],
    action: str,
    note: Optional[str] = None,
    assignee_id: Optional[str] = None,
    assignee_name: Optional[str] = None,
    target_stage: Optional[str] = None,
) -> Dict[str, Any]:
    """Return the fields to write for a legal action, or raise WorkflowError."""
    if not is_active(user):
        raise WorkflowError("You cannot move this campaign.")
    if is_performance(user):
        raise WorkflowError("Performance Marketing can view the calendar but cannot move stages.")

    stage = normalize_stage(item.get("stage"))
    action_key = str(action or "").lower().strip().replace(" ", "_")
    if action_key not in ACTIONS:
        raise WorkflowError(f"Unknown action '{action}'.")

    if action_key == "admin_move":
        if not is_admin(user):
            raise WorkflowError("Only an administrator can move campaigns to arbitrary stages.")
        dest = target_stage or note
        resolved = resolve_stage(dest)
        if not resolved:
            raise WorkflowError(f"Target stage '{dest}' is not valid.")
        return {"stage": resolved, "submitted_from": None}

    if action_key == "submit":
        if stage in ("Content", "Content Revision"):
            if not (is_admin(user) or is_content_actor(user)):
                raise WorkflowError("Only the content team can submit content.")
            return {"stage": "Content Internal Review", "submitted_from": stage}
        if stage in ("Creative Production", "Creative Revision"):
            allowed = is_admin(user) or is_creative_lead(user) or (
                is_creative_actor(user) and _is_assignee(user, item)
            )
            if not allowed:
                raise WorkflowError("Only the assigned creative, or a creative team lead, can submit this.")
            return {"stage": "Creative Internal Review", "submitted_from": stage}
        raise WorkflowError("This stage cannot be submitted.")

    if action_key == "approve":
        if stage == "Content Internal Review":
            if not (is_admin(user) or is_content_lead(user)):
                raise WorkflowError("Only a content team lead can approve internal review.")
            _require_workspace(item)
            return {"stage": "Content Client Review"}
        if stage == "Creative Internal Review":
            if not (is_admin(user) or is_creative_lead(user)):
                raise WorkflowError("Only a creative team lead can approve internal review.")
            _require_workspace(item)
            return {"stage": "Creative Client Review"}
        if stage == "Content Client Review":
            if not (is_admin(user) or (is_client(user) and client_owns(user, item))):
                raise WorkflowError("Only the client can approve this content.")
            return {
                "stage": "Creative Production",
                "assignee_id": None,
                "assignee_name": None,
                "submitted_from": None,
            }
        if stage == "Creative Client Review":
            if not (is_admin(user) or (is_client(user) and client_owns(user, item))):
                raise WorkflowError("Only the client can approve this creative.")
            return {"stage": "Ready to Post", "submitted_from": None}
        raise WorkflowError("This stage cannot be approved.")

    if action_key == "send_back":
        origin = normalize_stage(item.get("submitted_from"))
        if stage == "Content Internal Review":
            if not (is_admin(user) or is_content_lead(user)):
                raise WorkflowError("Only a content team lead can send this back.")
            target = origin if origin in ("Content", "Content Revision") else "Content"
            return {"stage": target, "submitted_from": None}
        if stage == "Creative Internal Review":
            if not (is_admin(user) or is_creative_lead(user)):
                raise WorkflowError("Only a creative team lead can send this back.")
            target = origin if origin in ("Creative Production", "Creative Revision") else "Creative Production"
            return {"stage": target, "submitted_from": None}
        raise WorkflowError("This stage cannot be sent back.")

    if action_key == "request_revision":
        text = str(note or "").strip()
        if not text:
            raise WorkflowError("A revision note is required.")
        if stage == "Content Client Review":
            if not (is_admin(user) or (is_client(user) and client_owns(user, item))):
                raise WorkflowError("Only the client can request a content revision.")
            return {"stage": "Content Revision", "revision_note": text, "submitted_from": None}
        if stage == "Creative Client Review":
            if not (is_admin(user) or (is_client(user) and client_owns(user, item))):
                raise WorkflowError("Only the client can request a creative revision.")
            return {"stage": "Creative Revision", "revision_note": text, "submitted_from": None}
        raise WorkflowError("This stage is not waiting on the client.")

    if action_key in ("post", "reject", "return_to_creative"):
        if stage != "Ready to Post":
            raise WorkflowError("Only a campaign that is ready to post can be posted, rejected, or returned.")
        if not (is_admin(user) or is_social_actor(user)):
            raise WorkflowError("Only social media can update a campaign that is ready to post.")
        if action_key == "post":
            return {"stage": "Posted", "submitted_from": None}
        if action_key == "reject":
            return {"stage": "Rejected", "submitted_from": None, "revision_note": str(note or "").strip() or None}
        text = str(note or "").strip()
        if not text:
            raise WorkflowError("A note is required when returning a campaign to creative.")
        return {
            "stage": "Creative Revision",
            "revision_note": text,
            "submitted_from": None,
            "assignee_id": None,
            "assignee_name": None,
        }

    if action_key == "assign":
        if stage not in ("Creative Production", "Creative Revision"):
            raise WorkflowError("A creative assignee can only be set during creative production or revision.")
        if not (is_admin(user) or is_creative_lead(user)):
            raise WorkflowError("Only a creative team lead can assign this campaign.")
        chosen = str(assignee_id or "").strip()
        if not chosen:
            raise WorkflowError("Choose a creative team member.")
        return {"assignee_id": chosen, "assignee_name": str(assignee_name or "").strip() or None}

    raise WorkflowError(f"Unknown action '{action}'.")
