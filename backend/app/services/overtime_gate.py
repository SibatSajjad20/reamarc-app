"""
Checkout overtime / undertime gates.

Clock (shift end ± buffer) and claimed minutes must both qualify.
Credited hours stay capped until overtime is approved.
"""
from dataclasses import dataclass
from typing import Any, Literal, Optional, Union

from app.models.attendance import AttendanceStatus
from app.services.attendance_calculator import (
    DailyCalculationResult,
    format_minutes_to_hhmm,
    parse_time_to_minutes,
)

DEFAULT_OT_BUFFER = 10
DEFAULT_UT_BUFFER = 10

GateType = Literal["none", "overtime", "undertime"]
OvertimeStatus = Literal["not_applicable", "pending", "approved", "rejected"]


def shift_buffers(shift: Any) -> tuple[int, int]:
    if shift is None:
        return DEFAULT_OT_BUFFER, DEFAULT_UT_BUFFER
    if isinstance(shift, dict):
        ot = shift.get("overtime_buffer_minutes")
        ut = shift.get("undertime_buffer_minutes")
    else:
        ot = getattr(shift, "overtime_buffer_minutes", None)
        ut = getattr(shift, "undertime_buffer_minutes", None)
    return int(ot if ot is not None else DEFAULT_OT_BUFFER), int(
        ut if ut is not None else DEFAULT_UT_BUFFER
    )


def shift_times(shift: Any) -> tuple[str, str, bool]:
    if shift is None:
        return "09:30", "18:30", False
    if isinstance(shift, dict):
        return (
            shift.get("start_time") or "09:30",
            shift.get("end_time") or "18:30",
            bool(shift.get("is_night_shift") or shift.get("is_cross_midnight")),
        )
    return (
        getattr(shift, "start_time", None) or "09:30",
        getattr(shift, "end_time", None) or "18:30",
        bool(getattr(shift, "is_night_shift", False) or getattr(shift, "is_cross_midnight", False)),
    )


def adjusted_shift_end_minutes(
    shift_start: Union[str, int],
    shift_end: Union[str, int],
    is_night_shift: bool = False,
) -> int:
    start_m = parse_time_to_minutes(shift_start)
    end_m = parse_time_to_minutes(shift_end)
    if is_night_shift or end_m <= start_m:
        return end_m + 1440
    return end_m


def adjusted_check_in_minutes(
    check_in: Union[str, int],
    shift_start: Union[str, int],
    is_night_shift: bool = False,
) -> int:
    start_m = parse_time_to_minutes(shift_start)
    in_m = parse_time_to_minutes(check_in)
    if is_night_shift and in_m < (start_m - 360):
        return in_m + 1440
    return in_m


def adjusted_check_out_minutes(
    check_out: Union[str, int],
    check_in: Optional[Union[str, int]],
    shift_start: Union[str, int],
    shift_end: Union[str, int],
    is_night_shift: bool = False,
) -> int:
    start_m = parse_time_to_minutes(shift_start)
    end_m = parse_time_to_minutes(shift_end)
    out_m = parse_time_to_minutes(check_out)
    crosses = is_night_shift or end_m <= start_m
    in_adj = (
        adjusted_check_in_minutes(check_in, shift_start, is_night_shift)
        if check_in is not None
        else start_m
    )
    if crosses:
        if out_m < in_adj:
            return out_m + 1440
        return out_m
    if out_m < in_adj:
        return out_m + 1440
    return out_m


def minutes_after_shift_end(
    check_out: Union[str, int],
    shift_start: Union[str, int] = "09:30",
    shift_end: Union[str, int] = "18:30",
    is_night_shift: bool = False,
    check_in: Optional[Union[str, int]] = None,
) -> int:
    out_adj = adjusted_check_out_minutes(
        check_out, check_in, shift_start, shift_end, is_night_shift
    )
    end_adj = adjusted_shift_end_minutes(shift_start, shift_end, is_night_shift)
    return out_adj - end_adj


def classify_checkout_gate(
    check_out: Union[str, int],
    claimed_overtime_minutes: int,
    claimed_undertime_minutes: int,
    shift_start: Union[str, int] = "09:30",
    shift_end: Union[str, int] = "18:30",
    is_night_shift: bool = False,
    overtime_buffer_minutes: int = DEFAULT_OT_BUFFER,
    undertime_buffer_minutes: int = DEFAULT_UT_BUFFER,
    check_in: Optional[Union[str, int]] = None,
) -> GateType:
    delta = minutes_after_shift_end(
        check_out, shift_start, shift_end, is_night_shift, check_in
    )
    if delta > int(overtime_buffer_minutes or 0) and int(claimed_overtime_minutes or 0) > 0:
        return "overtime"
    if delta < -int(undertime_buffer_minutes or 0) and int(claimed_undertime_minutes or 0) > 0:
        return "undertime"
    return "none"


def in_end_buffer(
    check_out: Union[str, int],
    shift_start: Union[str, int] = "09:30",
    shift_end: Union[str, int] = "18:30",
    is_night_shift: bool = False,
    overtime_buffer_minutes: int = DEFAULT_OT_BUFFER,
    undertime_buffer_minutes: int = DEFAULT_UT_BUFFER,
    check_in: Optional[Union[str, int]] = None,
) -> bool:
    delta = minutes_after_shift_end(
        check_out, shift_start, shift_end, is_night_shift, check_in
    )
    return -int(undertime_buffer_minutes or 0) <= delta <= int(overtime_buffer_minutes or 0)


@dataclass
class SettledHours:
    work_minutes: int
    work_hours: float
    work_duration_formatted: str
    overtime_minutes: int
    overtime_hours: float
    overtime_formatted: str
    undertime_minutes: int
    undertime_hours: float
    undertime_formatted: str
    pending_overtime_minutes: int
    claimed_overtime_minutes: int
    overtime_status: OvertimeStatus
    gate: GateType
    minutes_past_end: int


def _from_calc(calc: DailyCalculationResult) -> dict:
    return {
        "work_minutes": calc.work_minutes,
        "work_hours": calc.work_hours,
        "work_duration_formatted": calc.work_duration_formatted,
        "overtime_minutes": calc.overtime_minutes,
        "overtime_hours": calc.overtime_hours,
        "overtime_formatted": calc.overtime_formatted,
        "undertime_minutes": calc.undertime_minutes,
        "undertime_hours": calc.undertime_hours,
        "undertime_formatted": calc.undertime_formatted,
    }


def settle_checkout_hours(
    claimed: DailyCalculationResult,
    shift_end_calc: DailyCalculationResult,
    gate: GateType,
    minutes_past_end: int,
    overtime_status: Optional[str] = None,
    auto_approve: bool = False,
) -> SettledHours:
    """
    claimed: hours if the actual Time Out is fully credited.
    shift_end_calc: hours if Time Out is treated as shift end (cap / buffer clip).
    """
    status = str(overtime_status or "").strip().lower()
    claimed_ot = int(claimed.overtime_minutes or 0)

    if auto_approve or status == "approved":
        hours = _from_calc(claimed)
        resolved: OvertimeStatus = "approved" if claimed_ot > 0 else "not_applicable"
        pending = 0
    elif status == "rejected":
        base_mins = max(0, claimed.work_minutes - claimed_ot)
        hours = {
            "work_minutes": base_mins,
            "work_hours": round(base_mins / 60.0, 4),
            "work_duration_formatted": format_minutes_to_hhmm(base_mins, show_sign=False),
            "overtime_minutes": 0,
            "overtime_hours": 0.0,
            "overtime_formatted": "+00:00",
            "undertime_minutes": claimed.undertime_minutes,
            "undertime_hours": claimed.undertime_hours,
            "undertime_formatted": claimed.undertime_formatted,
        }
        resolved = "rejected"
        pending = 0
    elif gate == "overtime":
        base_mins = max(0, claimed.work_minutes - claimed_ot)
        hours = {
            "work_minutes": base_mins,
            "work_hours": round(base_mins / 60.0, 4),
            "work_duration_formatted": format_minutes_to_hhmm(base_mins, show_sign=False),
            "overtime_minutes": 0,
            "overtime_hours": 0.0,
            "overtime_formatted": "+00:00",
            "undertime_minutes": claimed.undertime_minutes,
            "undertime_hours": claimed.undertime_hours,
            "undertime_formatted": claimed.undertime_formatted,
        }
        resolved = "pending"
        pending = claimed_ot
    elif gate == "undertime":
        hours = _from_calc(claimed)
        resolved = "not_applicable"
        pending = 0
    else:
        # Inside the end buffer: clip tiny OT/UT from leaving a few minutes off.
        hours = _from_calc(shift_end_calc)
        resolved = "not_applicable"
        pending = 0

    return SettledHours(
        work_minutes=hours["work_minutes"],
        work_hours=hours["work_hours"],
        work_duration_formatted=hours["work_duration_formatted"],
        overtime_minutes=hours["overtime_minutes"],
        overtime_hours=hours["overtime_hours"],
        overtime_formatted=hours["overtime_formatted"],
        undertime_minutes=hours["undertime_minutes"],
        undertime_hours=hours["undertime_hours"],
        undertime_formatted=hours["undertime_formatted"],
        pending_overtime_minutes=pending,
        claimed_overtime_minutes=claimed_ot,
        overtime_status=resolved,
        gate=gate,
        minutes_past_end=minutes_past_end,
    )


def settled_to_record_fields(settled: SettledHours) -> dict:
    return {
        "working_hours_minutes": settled.work_minutes,
        "work_hours": settled.work_hours,
        "work_duration_formatted": settled.work_duration_formatted,
        "overtime_minutes": settled.overtime_minutes,
        "overtime_hours": settled.overtime_hours,
        "overtime_formatted": settled.overtime_formatted,
        "undertime_minutes": settled.undertime_minutes,
        "undertime_hours": settled.undertime_hours,
        "undertime_formatted": settled.undertime_formatted,
        "pending_overtime_minutes": settled.pending_overtime_minutes,
        "claimed_overtime_minutes": settled.claimed_overtime_minutes,
        "overtime_status": settled.overtime_status,
    }


def checkout_gate_payload(
    gate: GateType,
    shift_end: str,
    overtime_buffer_minutes: int,
    undertime_buffer_minutes: int,
    claimed_minutes: int,
    minutes_past_end: int,
) -> dict:
    if gate == "overtime":
        message = (
            f"Your shift ended at {shift_end}. Enter the reason you stayed "
            "before checking out. Overtime needs HR approval."
        )
    elif gate == "undertime":
        message = (
            f"You are leaving before {shift_end}. Enter the reason, "
            "then the shift will close."
        )
    else:
        message = None
    return {
        "type": gate,
        "shift_end": shift_end,
        "overtime_buffer_minutes": overtime_buffer_minutes,
        "undertime_buffer_minutes": undertime_buffer_minutes,
        "claimed_minutes": claimed_minutes,
        "minutes_past_end": minutes_past_end,
        "past_shift_end": minutes_past_end > 0,
        "message": message,
    }


def format_pending_overtime(minutes: int) -> str:
    return format_minutes_to_hhmm(max(0, int(minutes or 0)), show_sign=True)
