"""
Mathematical Calculation Engine for Attendance, Shifts, Overtime, Undertime, and Punctuality.
"""
from typing import Optional, Union, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime, time
import re
from app.models.attendance import AttendanceStatus, BonusRecommendation


@dataclass
class DailyCalculationResult:
    work_minutes: int
    work_hours: float
    work_duration_formatted: str       # "HH:MM", e.g. "08:05"
    overtime_minutes: int
    overtime_hours: float
    overtime_formatted: str           # "+HH:MM", e.g. "+00:05"
    undertime_minutes: int
    undertime_hours: float
    undertime_formatted: str          # "-HH:MM", e.g. "-00:25"
    late_minutes: int
    is_late: bool
    late_strike: int
    status: AttendanceStatus


@dataclass
class MonthlyAggregationResult:
    total_working_days: int
    days_present: int
    days_absent: int
    leave_count: int
    late_count: int
    short_leaves_count: int
    missed_punches: int
    total_work_minutes: int
    total_work_hours: float
    total_work_hours_formatted: str   # e.g. "176:25"
    overtime_minutes: int
    overtime_hours: float
    overtime_formatted: str           # e.g. "+04:15"
    undertime_minutes: int
    undertime_hours: float
    undertime_formatted: str          # e.g. "-01:30"
    net_variance_minutes: int
    net_variance_hours: float
    net_variance_formatted: str       # e.g. "+02:45"
    punctuality_percentage: float     # e.g. 96.5%
    bonus_recommendation: BonusRecommendation

    @property
    def total_overtime_minutes(self) -> int:
        return self.overtime_minutes

    @property
    def total_undertime_minutes(self) -> int:
        return self.undertime_minutes


def parse_time_to_minutes(time_val: Union[str, time, datetime, int, float]) -> int:
    """
    Parses various time representations into total minutes from 00:00 (0 to 1439).
    Supports '09:30', '09:30:00', '9:30 AM', '18:35', datetime, time objects.
    """
    if time_val is None:
        return 0
    if isinstance(time_val, (int, float)):
        return int(time_val)
    if isinstance(time_val, time):
        return time_val.hour * 60 + time_val.minute
    if isinstance(time_val, datetime):
        return time_val.hour * 60 + time_val.minute

    val_str = str(time_val).strip()
    if not val_str:
        return 0

    # Pattern: 12-hour format with AM/PM e.g., "09:30 AM", "9:12 pm"
    am_pm_match = re.match(r"^(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])$", val_str)
    if am_pm_match:
        hour = int(am_pm_match.group(1))
        minute = int(am_pm_match.group(2))
        meridiem = am_pm_match.group(3).upper()
        if meridiem == "PM" and hour < 12:
            hour += 12
        elif meridiem == "AM" and hour == 12:
            hour = 0
        return hour * 60 + minute

    # Pattern: 24-hour format e.g., "09:30", "18:35", "18:35:45"
    colon_match = re.match(r"^(\d{1,2}):(\d{2})(?::\d{2})?$", val_str)
    if colon_match:
        hour = int(colon_match.group(1))
        minute = int(colon_match.group(2))
        return hour * 60 + minute

    # ISO format timestamp e.g., "2026-08-19T09:30:00"
    if "T" in val_str:
        try:
            dt = datetime.fromisoformat(val_str)
            return dt.hour * 60 + dt.minute
        except ValueError:
            pass

    return 0


def format_minutes_to_hhmm(total_minutes: Union[int, float], show_sign: bool = False) -> str:
    """
    Converts integer or float total minutes into standard 'HH:MM' or '+/-HH:MM' string.
    Examples:
      - 485, show_sign=False -> "08:05"
      - 5, show_sign=True -> "+00:05"
      - -25, show_sign=True -> "-00:25"
      - 0, show_sign=True -> "+00:00"
    """
    rounded_mins = int(round(total_minutes))
    sign = "+" if rounded_mins >= 0 else "-"
    abs_mins = abs(rounded_mins)
    hours = abs_mins // 60
    mins = abs_mins % 60

    formatted = f"{hours:02d}:{mins:02d}"
    if show_sign:
        return f"{sign}{formatted}"
    return formatted


def format_hours_to_hhmm(hours: float, show_sign: bool = False) -> str:
    """
    Converts decimal hours (e.g. 8.0833) into HH:MM or +/-HH:MM formatted string.
    """
    return format_minutes_to_hhmm(hours * 60.0, show_sign=show_sign)


def shift_span_minutes(
    shift_start: Union[str, time, datetime] = "09:30",
    shift_end: Union[str, time, datetime] = "18:30",
    is_night_shift: bool = False,
) -> int:
    """Gross scheduled minutes from shift start to end, including overnight spans."""
    start_m = parse_time_to_minutes(shift_start)
    end_m = parse_time_to_minutes(shift_end)
    if is_night_shift or end_m <= start_m:
        end_m += 1440
    return max(0, end_m - start_m)


def derive_expected_work_minutes(
    shift_start: Union[str, time, datetime] = "09:30",
    shift_end: Union[str, time, datetime] = "18:30",
    break_duration_minutes: int = 0,
    is_night_shift: bool = False,
) -> int:
    """
    Net expected minutes = scheduled span minus unpaid break.
    Standard 09:30-18:30 with 60m lunch -> 480 minutes (8h).
    Afternoon 14:00-20:00 with 0 break -> 360 minutes (6h).
    """
    unpaid = max(0, int(break_duration_minutes or 0))
    return max(0, shift_span_minutes(shift_start, shift_end, is_night_shift) - unpaid)


def derive_expected_hours(
    shift_start: Union[str, time, datetime] = "09:30",
    shift_end: Union[str, time, datetime] = "18:30",
    break_duration_minutes: int = 0,
    is_night_shift: bool = False,
) -> float:
    return round(
        derive_expected_work_minutes(shift_start, shift_end, break_duration_minutes, is_night_shift) / 60.0,
        2,
    )


def resolve_break_window(
    shift_start: Union[str, time, datetime],
    shift_end: Union[str, time, datetime],
    break_duration_minutes: int = 0,
    break_start_time: Optional[Union[str, time, datetime]] = None,
    break_end_time: Optional[Union[str, time, datetime]] = None,
    is_night_shift: bool = False,
) -> Optional[tuple]:
    """
    Returns unpaid break as (start_mins, end_mins) on the same offset timeline as the shift.
    Explicit window wins. Otherwise the break is placed at the shift midpoint.
    """
    duration = max(0, int(break_duration_minutes or 0))
    if duration <= 0:
        return None

    start_m = parse_time_to_minutes(shift_start)
    end_m = parse_time_to_minutes(shift_end)
    crosses = is_night_shift or end_m <= start_m
    if crosses:
        end_m += 1440

    if break_start_time and break_end_time:
        b_start = parse_time_to_minutes(break_start_time)
        b_end = parse_time_to_minutes(break_end_time)
        if b_end <= b_start:
            b_end += 1440
        if crosses and b_start < (start_m - 360):
            b_start += 1440
            b_end += 1440
        return (b_start, b_end)

    mid = start_m + max(0, end_m - start_m) // 2
    half = duration // 2
    return (mid - half, mid - half + duration)


def interval_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> int:
    return max(0, min(a_end, b_end) - max(a_start, b_start))


def calculate_daily_attendance(
    check_in_time: Optional[Union[str, time, datetime]],
    check_out_time: Optional[Union[str, time, datetime]],
    shift_start: Union[str, time, datetime] = "09:30",
    shift_end: Union[str, time, datetime] = "18:30",
    break_duration_minutes: int = 60,
    break_start_time: Optional[Union[str, time, datetime]] = None,
    break_end_time: Optional[Union[str, time, datetime]] = None,
    grace_period_minutes: int = 30,
    expected_hours: Optional[float] = None,  # kept for callers; expected is derived from span - break
    is_night_shift: bool = False,
    is_wfh: bool = False,
    is_short_leave: bool = False,
    short_leave_hours: float = 0.0,
) -> DailyCalculationResult:
    """
    Pure mathematical calculation for a single daily attendance record.

    Rules:
    1. Gross clocked time starts at max(check-in, shift start). Early arrivals do not count.
       Time after shift end is overtime; leaving before shift end is undertime.
       Late arrival is a late strike, not undertime.
    2. Unpaid break is deducted only for overlap with the shift's break window
       (standard lunch 13:00-14:00, or custom window / midpoint).
    3. Expected hours = shift span minus that shift's unpaid break duration.
    4. Grace Buffer: Arrival <= Shift Start + grace is not a late strike.
    5. Night shifts calculate a positive duration across midnight.
    """
    if check_in_time is None:
        return DailyCalculationResult(
            work_minutes=0,
            work_hours=0.0,
            work_duration_formatted="00:00",
            overtime_minutes=0,
            overtime_hours=0.0,
            overtime_formatted="+00:00",
            undertime_minutes=0,
            undertime_hours=0.0,
            undertime_formatted="-00:00",
            late_minutes=0,
            is_late=False,
            late_strike=0,
            status=AttendanceStatus.ABSENT,
        )

    shift_start_mins = parse_time_to_minutes(shift_start)
    shift_end_mins = parse_time_to_minutes(shift_end)
    check_in_mins = parse_time_to_minutes(check_in_time)
    unpaid_break = max(0, int(break_duration_minutes or 0))
    expected_work_minutes = derive_expected_work_minutes(
        shift_start, shift_end, unpaid_break, is_night_shift
    )
    _ = expected_hours  # callers may still pass stored expected_hours; span minus break is source of truth

    # Determine if shift crosses midnight
    crosses_midnight = is_night_shift or (shift_end_mins <= shift_start_mins)
    
    if crosses_midnight:
        shift_end_adjusted = shift_end_mins + 1440
        # If check-in is in early morning after midnight, offset by +1440
        if check_in_mins < (shift_start_mins - 360):
            check_in_adjusted = check_in_mins + 1440
        else:
            check_in_adjusted = check_in_mins
    else:
        shift_end_adjusted = shift_end_mins
        check_in_adjusted = check_in_mins

    # 1. Grace buffer & Late calculation
    buffer_deadline = shift_start_mins + grace_period_minutes
    if check_in_adjusted <= buffer_deadline:
        is_late = False
        late_strike = 0
        late_minutes = 0
    else:
        is_late = True
        late_strike = 1
        late_minutes = max(0, check_in_adjusted - shift_start_mins)

    # 2. Check-out and Working Hours calculation
    if check_out_time is None:
        # Currently punched in or missed punch
        status = AttendanceStatus.WFH if is_wfh else (AttendanceStatus.LATE if is_late else AttendanceStatus.PRESENT)
        return DailyCalculationResult(
            work_minutes=0,
            work_hours=0.0,
            work_duration_formatted="00:00",
            overtime_minutes=0,
            overtime_hours=0.0,
            overtime_formatted="+00:00",
            undertime_minutes=0,
            undertime_hours=0.0,
            undertime_formatted="-00:00",
            late_minutes=late_minutes,
            is_late=is_late,
            late_strike=late_strike,
            status=status,
        )

    check_out_mins = parse_time_to_minutes(check_out_time)
    if crosses_midnight:
        if check_out_mins < check_in_adjusted:
            check_out_adjusted = check_out_mins + 1440
        else:
            check_out_adjusted = check_out_mins
    else:
        if check_out_mins < check_in_adjusted:
            # Check-out after midnight on day shift
            check_out_adjusted = check_out_mins + 1440
        else:
            check_out_adjusted = check_out_mins

    # Gross worked minutes: early clock-in is clipped to shift start; late stay counts.
    effective_check_in = max(check_in_adjusted, shift_start_mins)
    gross_work_minutes = max(0, check_out_adjusted - effective_check_in)

    break_window = resolve_break_window(
        shift_start=shift_start,
        shift_end=shift_end,
        break_duration_minutes=unpaid_break,
        break_start_time=break_start_time,
        break_end_time=break_end_time,
        is_night_shift=is_night_shift or crosses_midnight,
    )
    deducted_break = 0
    if break_window and gross_work_minutes > 0:
        deducted_break = min(
            unpaid_break,
            interval_overlap(effective_check_in, check_out_adjusted, break_window[0], break_window[1]),
        )

    net_work_minutes = max(0, gross_work_minutes - deducted_break)
    work_hours = round(net_work_minutes / 60.0, 4)
    work_duration_formatted = format_minutes_to_hhmm(net_work_minutes, show_sign=False)

    short_leave_mins = int(round(float(short_leave_hours or 0.0) * 60)) if is_short_leave else 0
    effective_expected_work_minutes = max(0, expected_work_minutes - short_leave_mins)

    # Clocked OT / UT vs the assigned shift end and net effective hours.
    # Time worked past shift end first covers any late-arrival deficit.
    work_variance = net_work_minutes - effective_expected_work_minutes
    minutes_past_end = check_out_adjusted - shift_end_adjusted

    if minutes_past_end > 0:
        overtime_minutes = max(0, min(minutes_past_end, work_variance))
        undertime_minutes = max(0, effective_expected_work_minutes - net_work_minutes)
    elif minutes_past_end < 0:
        overtime_minutes = 0
        undertime_minutes = max(0, effective_expected_work_minutes - net_work_minutes)
    else:
        overtime_minutes = 0
        undertime_minutes = max(0, effective_expected_work_minutes - net_work_minutes)

    overtime_hours = round(overtime_minutes / 60.0, 4)
    overtime_formatted = format_minutes_to_hhmm(overtime_minutes, show_sign=True)

    undertime_hours = round(undertime_minutes / 60.0, 4)
    undertime_formatted = format_minutes_to_hhmm(-undertime_minutes, show_sign=True) if undertime_minutes > 0 else "-00:00"

    # Determine status badge
    if is_wfh:
        status = AttendanceStatus.WFH
    elif is_late:
        status = AttendanceStatus.LATE
    elif is_short_leave:
        status = AttendanceStatus.SHORT_LEAVE
    else:
        status = AttendanceStatus.PRESENT

    return DailyCalculationResult(
        work_minutes=net_work_minutes,
        work_hours=work_hours,
        work_duration_formatted=work_duration_formatted,
        overtime_minutes=overtime_minutes,
        overtime_hours=overtime_hours,
        overtime_formatted=overtime_formatted,
        undertime_minutes=undertime_minutes,
        undertime_hours=undertime_hours,
        undertime_formatted=undertime_formatted,
        late_minutes=late_minutes,
        is_late=is_late,
        late_strike=late_strike,
        status=status,
    )


def calculate_monthly_aggregation(
    daily_results: List[Dict[str, Any]],
    total_working_days: int = 22,
) -> MonthlyAggregationResult:
    """
    Calculates aggregated monthly metrics for an employee:
    - Total work hours, Overtime, Undertime, Net Variance
    - Punctuality Percentage score
    - Bonus Recommendation Engine
    """
    total_work_minutes = 0
    total_overtime_minutes = 0
    total_undertime_minutes = 0
    late_count = 0
    days_present = 0
    days_absent = 0
    leave_count = 0
    short_leaves_count = 0
    missed_punches = 0

    present_statuses = {
        AttendanceStatus.PRESENT,
        AttendanceStatus.LATE,
        AttendanceStatus.WFH,
        AttendanceStatus.SHORT_LEAVE,
    }
    leave_statuses = {
        AttendanceStatus.ON_LEAVE,
        AttendanceStatus.SICK_LEAVE,
        AttendanceStatus.CASUAL_LEAVE,
        AttendanceStatus.ANNUAL_LEAVE,
        AttendanceStatus.UNPAID_LEAVE,
    }
    off_statuses = {
        AttendanceStatus.HOLIDAY,
        AttendanceStatus.WEEKEND_OFF,
        AttendanceStatus.FIRST_SATURDAY_OFF,
        AttendanceStatus.SUNDAY_OFF,
    }

    for rec in daily_results:
        status = rec.get("status")
        if isinstance(status, str):
            try:
                status = AttendanceStatus(status)
            except ValueError:
                status = None

        if status in present_statuses:
            days_present += 1
        elif status == AttendanceStatus.ABSENT:
            days_absent += 1
        elif status in leave_statuses:
            leave_count += 1
        elif status == AttendanceStatus.MISSED_PUNCH:
            missed_punches += 1

        if rec.get("is_short_leave") or status == AttendanceStatus.SHORT_LEAVE:
            short_leaves_count += 1

        late_count += int(rec.get("late_strike", 0))
        total_work_minutes += int(rec.get("work_minutes", 0))
        total_overtime_minutes += int(rec.get("overtime_minutes", 0))

        # Only sum undertime for days where the employee had attendance sessions
        if status not in {AttendanceStatus.ABSENT, *leave_statuses, *off_statuses, None}:
            total_undertime_minutes += int(rec.get("undertime_minutes", 0))

    net_variance_minutes = total_overtime_minutes - total_undertime_minutes

    total_work_hours = round(total_work_minutes / 60.0, 2)
    overtime_hours = round(total_overtime_minutes / 60.0, 2)
    undertime_hours = round(total_undertime_minutes / 60.0, 2)
    net_variance_hours = round(net_variance_minutes / 60.0, 2)

    total_work_hours_formatted = format_minutes_to_hhmm(total_work_minutes, show_sign=False)
    overtime_formatted = format_minutes_to_hhmm(total_overtime_minutes, show_sign=True)
    undertime_formatted = format_minutes_to_hhmm(-total_undertime_minutes, show_sign=True) if total_undertime_minutes > 0 else "-00:00"
    net_variance_formatted = format_minutes_to_hhmm(net_variance_minutes, show_sign=True)

    # Punctuality Score Calculation
    if total_working_days <= 0:
        punctuality_percentage = 100.0
    else:
        # Standard grading penalty: each late strike deducts 4%, absent deducts 10%, short leave deducts 2%
        penalty = (late_count * 4.0) + (days_absent * 10.0) + (short_leaves_count * 2.0)
        score = 100.0 - penalty
        punctuality_percentage = round(max(0.0, min(100.0, score)), 1)

    # Bonus Recommendation Engine
    if (late_count <= 2 and days_absent == 0 and net_variance_minutes >= 0 and punctuality_percentage >= 90.0):
        bonus_recommendation = BonusRecommendation.ELIGIBLE
    elif (late_count <= 4 and days_absent <= 1 and punctuality_percentage >= 75.0):
        bonus_recommendation = BonusRecommendation.REVIEW
    else:
        bonus_recommendation = BonusRecommendation.NOT_ELIGIBLE

    return MonthlyAggregationResult(
        total_working_days=total_working_days,
        days_present=days_present,
        days_absent=days_absent,
        leave_count=leave_count,
        late_count=late_count,
        short_leaves_count=short_leaves_count,
        missed_punches=missed_punches,
        total_work_minutes=total_work_minutes,
        total_work_hours=total_work_hours,
        total_work_hours_formatted=total_work_hours_formatted,
        overtime_minutes=total_overtime_minutes,
        overtime_hours=overtime_hours,
        overtime_formatted=overtime_formatted,
        undertime_minutes=total_undertime_minutes,
        undertime_hours=undertime_hours,
        undertime_formatted=undertime_formatted,
        net_variance_minutes=net_variance_minutes,
        net_variance_hours=net_variance_hours,
        net_variance_formatted=net_variance_formatted,
        punctuality_percentage=punctuality_percentage,
        bonus_recommendation=bonus_recommendation,
    )
