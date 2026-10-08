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


def is_ad_creative(item: Optional[Dict[str, Any]]) -> bool:
    if not item:
        return False
    cat = str(item.get("creative_category") or item.get("posting_type") or "").strip().lower()
    return bool(re.search(r"\b(ad(\s+creative)?|performance)\b", cat))


def stage_owner(stage: Optional[str], creative_category: Optional[str] = None) -> str:
    """Derives department owner based on pipeline stage and creative category."""
    norm = normalize_stage(stage)
    if norm in CREATIVE_STAGES:
        return "Creative"
    if norm in SOCIAL_STAGES:
        cat = str(creative_category or "").strip().lower()
        if re.search(r"\b(ad(\s+creative)?|performance)\b", cat):
            return "Performance Marketing"
        return "Social Media"
    return "Content"


def stage_default_approval_status(stage: Optional[str]) -> str:
    """Derives the default approval status for a given pipeline stage."""
    norm = normalize_stage(stage)
    if norm == "Content":
        return "Content Draft"
    if norm == "Content Internal Review":
        return "Content Internal Review"
    if norm == "Content Client Review":
        return "Content Client Review"
    if norm == "Content Revision":
        return "Changes Requested"
    if norm == "Creative Production":
        return "Creative Production"
    if norm == "Creative Internal Review":
        return "Creative Internal Review"
    if norm == "Creative Client Review":
        return "Creative Client Review"
    if norm == "Creative Revision":
        return "Changes Requested"
    if norm == "Ready to Post":
        return "Approved for Campaign"
    if norm == "Posted":
        return "Posted"
    if norm == "Rejected":
        return "Rejected"
    return "Content Draft"


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
    if is_client(user):
        return False
    if is_admin(user):
        return True
    stage = normalize_stage(item.get("stage"))
    if stage in ("Content", "Content Revision"):
        return is_content_actor(user)
    if stage in ("Creative Production", "Creative Revision"):
        return is_creative_lead(user) or (is_creative_actor(user) and _is_assignee(user, item))
    if stage == "Ready to Post":
        if is_ad_creative(item):
            return is_performance(user) or is_social_actor(user)
        return is_social_actor(user)
    if is_performance(user):
        return False
    return False


def can_delete_item(user: Optional[Dict[str, Any]], item: Dict[str, Any]) -> bool:
    if not is_active(user):
        return False
    if is_client(user):
        return False
    if is_admin(user) or is_content_lead(user):
        return True
    created_by = str(item.get("created_by") or "")
    if created_by and created_by == _user_id(user):
        stage = normalize_stage(item.get("stage"))
        return stage in ("Content", "Content Revision") and is_content_actor(user)
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

    stage = normalize_stage(item.get("stage"))
    action_key = str(action or "").lower().strip().replace(" ", "_")
    if action_key not in ACTIONS:
        raise WorkflowError(f"Unknown action '{action}'.")

    # Performance marketing can only act on Ready to Post ad creatives unless also a social actor
    if is_performance(user) and not is_social_actor(user):
        if not (stage == "Ready to Post" and is_ad_creative(item) and action_key in ("post", "reject", "return_to_creative")):
            raise WorkflowError("Performance Marketing can view the calendar but cannot move stages.")

    category = item.get("creative_category") or item.get("posting_type")

    if action_key == "admin_move":
        if not is_admin(user):
            raise WorkflowError("Only an administrator can move campaigns to arbitrary stages.")
        dest = target_stage or note
        resolved = resolve_stage(dest)
        if not resolved:
            raise WorkflowError(f"Target stage '{dest}' is not valid.")
        return {
            "stage": resolved,
            "submitted_from": None,
            "design_owner": stage_owner(resolved, category),
            "approval_status": stage_default_approval_status(resolved),
        }

    if action_key == "submit":
        if stage in ("Content", "Content Revision"):
            if not (is_admin(user) or is_content_actor(user)):
                raise WorkflowError("Only the content team can submit content.")
            target = "Content Internal Review"
            return {
                "stage": target,
                "submitted_from": stage,
                "design_owner": stage_owner(target),
                "approval_status": target,
            }
        if stage in ("Creative Production", "Creative Revision"):
            allowed = is_admin(user) or is_creative_lead(user) or (
                is_creative_actor(user) and _is_assignee(user, item)
            )
            if not allowed:
                raise WorkflowError("Only the assigned creative, or a creative team lead, can submit this.")
            target = "Creative Internal Review"
            return {
                "stage": target,
                "submitted_from": stage,
                "design_owner": stage_owner(target),
                "approval_status": target,
            }
        raise WorkflowError("This stage cannot be submitted.")

    if action_key == "approve":
        if stage == "Content Internal Review":
            if not (is_admin(user) or is_content_lead(user)):
                raise WorkflowError("Only a content team lead can approve internal review.")
            _require_workspace(item)
            target = "Content Client Review"
            return {
                "stage": target,
                "design_owner": stage_owner(target),
                "approval_status": target,
            }
        if stage == "Creative Internal Review":
            if not (is_admin(user) or is_creative_lead(user)):
                raise WorkflowError("Only a creative team lead can approve internal review.")
            _require_workspace(item)
            target = "Creative Client Review"
            return {
                "stage": target,
                "design_owner": stage_owner(target),
                "approval_status": target,
            }
        if stage == "Content Client Review":
            if not (is_admin(user) or (is_client(user) and client_owns(user, item))):
                raise WorkflowError("Only the client can approve this content.")
            target = "Creative Production"
            return {
                "stage": target,
                "assignee_id": None,
                "assignee_name": None,
                "submitted_from": None,
                "design_owner": stage_owner(target),
                "approval_status": target,
            }
        if stage == "Creative Client Review":
            if not (is_admin(user) or (is_client(user) and client_owns(user, item))):
                raise WorkflowError("Only the client can approve this creative.")
            target = "Ready to Post"
            return {
                "stage": target,
                "submitted_from": None,
                "design_owner": stage_owner(target, category),
                "approval_status": "Approved for Campaign",
            }
        raise WorkflowError("This stage cannot be approved.")

    if action_key == "send_back":
        origin = normalize_stage(item.get("submitted_from"))
        send_back_note = str(note or "").strip()
        if stage == "Content Internal Review":
            if not (is_admin(user) or is_content_lead(user)):
                raise WorkflowError("Only a content team lead can send this back.")
            if target_stage:
                target = normalize_stage(target_stage)
                if target not in ("Content", "Content Revision"):
                    raise WorkflowError("Invalid target stage for sending back content.")
            else:
                target = origin if origin in ("Content", "Content Revision") else "Content"
            res = {
                "stage": target,
                "submitted_from": None,
                "design_owner": stage_owner(target, category),
                "approval_status": "Changes Requested",
            }
            if send_back_note:
                res["revision_note"] = send_back_note
            return res
        if stage == "Creative Internal Review":
            if not (is_admin(user) or is_creative_lead(user)):
                raise WorkflowError("Only a creative team lead can send this back.")
            if target_stage:
                target = normalize_stage(target_stage)
                if target not in ("Creative Production", "Creative Revision"):
                    raise WorkflowError("Invalid target stage for sending back creative.")
            else:
                target = origin if origin in ("Creative Production", "Creative Revision") else "Creative Production"
            res = {
                "stage": target,
                "submitted_from": None,
                "design_owner": stage_owner(target, category),
                "approval_status": "Changes Requested",
            }
            if send_back_note:
                res["revision_note"] = send_back_note
            return res
        raise WorkflowError("This stage cannot be sent back.")

    if action_key == "request_revision":
        text = str(note or "").strip()
        if not text:
            raise WorkflowError("A revision note is required.")
        if stage == "Content Client Review":
            if not (is_admin(user) or (is_client(user) and client_owns(user, item))):
                raise WorkflowError("Only the client can request a content revision.")
            target = "Content Revision"
            return {
                "stage": target,
                "revision_note": text,
                "submitted_from": None,
                "design_owner": stage_owner(target, category),
                "approval_status": "Changes Requested",
            }
        if stage == "Creative Client Review":
            if not (is_admin(user) or (is_client(user) and client_owns(user, item))):
                raise WorkflowError("Only the client can request a creative revision.")
            target = "Creative Revision"
            return {
                "stage": target,
                "revision_note": text,
                "submitted_from": None,
                "design_owner": stage_owner(target, category),
                "approval_status": "Changes Requested",
            }
        raise WorkflowError("This stage is not waiting on the client.")

    if action_key in ("post", "reject", "return_to_creative"):
        if stage != "Ready to Post":
            raise WorkflowError("Only a campaign that is ready to post can be posted, rejected, or returned.")
        allowed = is_admin(user) or (
            (is_performance(user) or is_social_actor(user)) if is_ad_creative(item) else is_social_actor(user)
        )
        if not allowed:
            if is_ad_creative(item):
                raise WorkflowError("Only performance marketing or social media can update an ad creative that is ready to post.")
            raise WorkflowError("Only social media can update an organic campaign that is ready to post.")
        posting_owner = stage_owner("Posted", category)
        reject_owner = stage_owner("Rejected", category)
        if action_key == "post":
            return {
                "stage": "Posted",
                "submitted_from": None,
                "design_owner": posting_owner,
                "approval_status": "Posted",
            }
        if action_key == "reject":
            return {
                "stage": "Rejected",
                "submitted_from": None,
                "revision_note": str(note or "").strip() or None,
                "design_owner": reject_owner,
                "approval_status": "Rejected",
            }
        text = str(note or "").strip()
        if not text:
            raise WorkflowError("A note is required when returning a campaign to creative.")
        return {
            "stage": "Creative Revision",
            "revision_note": text,
            "submitted_from": None,
            "assignee_id": None,
            "assignee_name": None,
            "design_owner": "Creative",
            "approval_status": "Changes Requested",
        }

    if action_key == "assign":
        if stage in ("Content", "Content Revision"):
            if not (is_admin(user) or is_content_lead(user)):
                raise WorkflowError("Only a content team lead or admin can assign content.")
        elif stage in ("Creative Production", "Creative Revision"):
            if not (is_admin(user) or is_creative_lead(user)):
                raise WorkflowError("Only a creative team lead or admin can assign creative.")
        else:
            raise WorkflowError("Assignees can only be set during content or creative production/revision stages.")

        chosen = str(assignee_id or "").strip()
        if not chosen or chosen.lower() in ("unassigned", "none"):
            return {"assignee_id": None, "assignee_name": None}
        return {"assignee_id": chosen, "assignee_name": str(assignee_name or "").strip() or None}

    raise WorkflowError(f"Unknown action '{action}'.")
