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


def calculate_daily_attendance(
    check_in_time: Optional[Union[str, time, datetime]],
    check_out_time: Optional[Union[str, time, datetime]],
    shift_start: Union[str, time, datetime] = "09:30",
    shift_end: Union[str, time, datetime] = "18:30",
    break_duration_minutes: int = 60,
    grace_period_minutes: int = 30,
    expected_hours: float = 8.0,
    is_night_shift: bool = False,
    is_wfh: bool = False,
    is_short_leave: bool = False,
    short_leave_hours: float = 0.0,
) -> DailyCalculationResult:
    """
    Pure mathematical calculation for a single daily attendance record.

    Rules:
    1. Working Hours: Time Out - max(Time In, Shift Start) - Break Duration
       - Early arrivals before shift start do not gain unapproved overtime.
    2. Grace Buffer: Arrival <= Shift Start + 30m is not late (late_strike = 0),
       but reflects undertime unless worked late.
       Arrival > Shift Start + 30m triggers late_strike = 1 and is_late = True.
    3. Night Shifts: Properly calculates positive duration across midnight.
    4. Overtime & Undertime: Calculated against expected shift hours.
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

    # Determine if shift crosses midnight
    crosses_midnight = is_night_shift or (shift_end_mins < shift_start_mins)
    
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
        expected_work_mins = int(round(expected_hours * 60))
        return DailyCalculationResult(
            work_minutes=0,
            work_hours=0.0,
            work_duration_formatted="00:00",
            overtime_minutes=0,
            overtime_hours=0.0,
            overtime_formatted="+00:00",
            undertime_minutes=expected_work_mins,
            undertime_hours=expected_hours,
            undertime_formatted=format_minutes_to_hhmm(-expected_work_mins, show_sign=True),
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

    # Gross worked minutes
    effective_check_in = max(check_in_adjusted, shift_start_mins)
    gross_work_minutes = max(0, check_out_adjusted - effective_check_in)

    # Net work minutes (deduct mandatory break)
    net_work_minutes = max(0, gross_work_minutes - break_duration_minutes)
    work_hours = round(net_work_minutes / 60.0, 4)
    work_duration_formatted = format_minutes_to_hhmm(net_work_minutes, show_sign=False)

    # Overtime & Undertime against expected hours
    if is_short_leave and short_leave_hours > 0:
        short_leave_mins = int(round(short_leave_hours * 60))
        net_work_minutes_for_variance = net_work_minutes + short_leave_mins
    else:
        net_work_minutes_for_variance = net_work_minutes

    expected_work_minutes = int(round(expected_hours * 60))
    if net_work_minutes_for_variance > expected_work_minutes:
        overtime_minutes = net_work_minutes_for_variance - expected_work_minutes
        undertime_minutes = 0
    elif net_work_minutes_for_variance < expected_work_minutes:
        overtime_minutes = 0
        undertime_minutes = expected_work_minutes - net_work_minutes_for_variance
    else:
        overtime_minutes = 0
        undertime_minutes = 0

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
