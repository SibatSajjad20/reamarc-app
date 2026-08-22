"""Date-aware shift assignment resolution. No database or settings imports."""
from datetime import datetime
from typing import Any, Dict, Optional


def weekday_key_for_date(date_str: str) -> str:
    """Monday=0 … Sunday=6, matching Python date.weekday()."""
    return str(datetime.strptime(date_str, "%Y-%m-%d").date().weekday())


def _rule_from_weekday_map(rules: Any, key: str) -> Dict[str, Any]:
    if not isinstance(rules, dict):
        return {}
    raw = rules.get(key)
    if raw is None:
        try:
            raw = rules.get(int(key))
        except (TypeError, ValueError):
            raw = None
    return raw if isinstance(raw, dict) else {}


def resolve_shift_assignment_for_date(
    assignment: Optional[Dict[str, Any]],
    date_str: str,
) -> Dict[str, Any]:
    """
    Resolve shift_id + auto_wfh for a calendar date.
    Priority: date override → weekday rule → legacy assignment.shift_id.
    """
    if not assignment:
        return {"shift_id": None, "auto_wfh": False}

    shift_id = assignment.get("shift_id")
    auto_wfh = False
    rule = _rule_from_weekday_map(assignment.get("weekday_rules"), weekday_key_for_date(date_str))
    if rule.get("shift_id"):
        shift_id = rule.get("shift_id")
    if "auto_wfh" in rule:
        auto_wfh = bool(rule.get("auto_wfh"))

    for override in assignment.get("date_overrides") or []:
        if not isinstance(override, dict):
            continue
        if str(override.get("date") or "") != date_str:
            continue
        if override.get("shift_id"):
            shift_id = override.get("shift_id")
        if override.get("auto_wfh") is not None:
            auto_wfh = bool(override.get("auto_wfh"))
        break

    return {"shift_id": shift_id, "auto_wfh": bool(auto_wfh)}
