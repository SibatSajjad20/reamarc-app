"""
Company-calendar relaxed / early-leave days (e.g. monthly cricket Saturday).

One calendar row: people may check out from `leave_from` without undertime.
WFH that day and named exclusions keep normal shift rules.
"""
from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Mapping, Optional

from app.services.attendance_calculator import parse_time_to_minutes

RELAXED_DAY_TYPE = "relaxed_day"
DEFAULT_LEAVE_FROM = "16:00"

_relaxed_by_date: ContextVar[Dict[str, "RelaxedDayPolicy"]] = ContextVar(
    "relaxed_day_by_date",
    default=None,
)


@dataclass(frozen=True)
class RelaxedDayPolicy:
    leave_from: str
    exclude_user_ids: frozenset[str]
    exclude_wfh: bool = True


def set_relaxed_by_date(mapping: Optional[Mapping[str, RelaxedDayPolicy]]) -> None:
    _relaxed_by_date.set(dict(mapping or {}))


def relaxed_policy_for_date(date_str: Optional[str]) -> Optional[RelaxedDayPolicy]:
    if not date_str:
        return None
    bound = _relaxed_by_date.get()
    if not bound:
        return None
    return bound.get(str(date_str))


def policy_from_calendar_doc(doc: Optional[Mapping[str, Any]]) -> Optional[RelaxedDayPolicy]:
    if not doc:
        return None
    event_type = str(doc.get("event_type") or "").strip().lower()
    if event_type != RELAXED_DAY_TYPE:
        return None
    leave_from = str(doc.get("leave_from") or DEFAULT_LEAVE_FROM).strip() or DEFAULT_LEAVE_FROM
    raw_ids = doc.get("exclude_user_ids") or []
    ids = frozenset(str(uid) for uid in raw_ids if uid)
    exclude_wfh = doc.get("exclude_wfh")
    if exclude_wfh is None:
        exclude_wfh = True
    return RelaxedDayPolicy(
        leave_from=leave_from,
        exclude_user_ids=ids,
        exclude_wfh=bool(exclude_wfh),
    )


def policies_from_events(events: Iterable[Mapping[str, Any]]) -> Dict[str, RelaxedDayPolicy]:
    out: Dict[str, RelaxedDayPolicy] = {}
    for event in events or []:
        policy = policy_from_calendar_doc(event)
        date_str = str(event.get("date") or "")
        if policy and date_str:
            out[date_str] = policy
    return out


def record_is_wfh(doc: Optional[Mapping[str, Any]], shift: Any = None) -> bool:
    if doc and (
        doc.get("is_wfh")
        or str(doc.get("status") or "").lower() == "wfh"
        or str(doc.get("location") or "").lower() == "wfh"
    ):
        return True
    if shift is None:
        return False
    if isinstance(shift, dict):
        name = str(shift.get("name") or "").lower()
        shift_type = str(shift.get("shift_type") or "").lower()
        return bool(shift.get("is_wfh") or "wfh" in name or shift_type == "wfh")
    name = str(getattr(shift, "name", "") or "").lower()
    shift_type = str(getattr(shift, "shift_type", "") or "").lower()
    return bool(getattr(shift, "is_wfh", False) or "wfh" in name or shift_type == "wfh")


def policy_applies(
    policy: Optional[RelaxedDayPolicy],
    user_id: Optional[str],
    is_wfh: bool,
) -> bool:
    if policy is None:
        return False
    if user_id and str(user_id) in policy.exclude_user_ids:
        return False
    if policy.exclude_wfh and is_wfh:
        return False
    return True


def checkout_at_or_after(check_out: Optional[str], leave_from: Optional[str]) -> bool:
    if not check_out or not leave_from:
        return False
    return parse_time_to_minutes(check_out) >= parse_time_to_minutes(leave_from)


def calc_kwargs_for(
    policy: Optional[RelaxedDayPolicy],
    user_id: Optional[str],
    is_wfh: bool,
) -> Dict[str, Any]:
    if not policy_applies(policy, user_id, is_wfh):
        return {}
    return {
        "count_from_actual_check_in": True,
        "waive_undertime_after": policy.leave_from,
    }


def extra_for_record(
    doc: Optional[Mapping[str, Any]],
    shift: Any = None,
    policy: Optional[RelaxedDayPolicy] = None,
) -> Dict[str, Any]:
    if not doc:
        return {}
    date_str = str(doc.get("date") or "")
    resolved = policy or relaxed_policy_for_date(date_str)
    is_wfh = record_is_wfh(doc, shift)
    return calc_kwargs_for(resolved, doc.get("user_id"), is_wfh)
