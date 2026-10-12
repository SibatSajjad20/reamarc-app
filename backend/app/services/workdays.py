"""
Shared company workday rules.

A date is off when it is:
- Sunday
- the first Saturday of the month (unless marked working_saturday)
- a company_calendar holiday

A working_saturday (or is_workday_override) on the calendar forces that date to be a workday.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, Optional, Set, Tuple, Union

from app.database import get_database
from app.models.attendance import CalendarEventType


@dataclass(frozen=True)
class DayClassification:
    is_off: bool
    kind: str  # workday | sunday | first_saturday | holiday
    label: str
    holiday_title: Optional[str] = None

    @property
    def is_workday(self) -> bool:
        return not self.is_off


def parse_iso_date(value) -> Optional[date]:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def is_sunday(d: date) -> bool:
    return d.weekday() == 6


def is_first_saturday(d: date) -> bool:
    return d.weekday() == 5 and d.day <= 7


def weekday_is_workday(d: date) -> bool:
    """Sunday / 1st Saturday pattern only — ignores company calendar."""
    if is_sunday(d):
        return False
    if is_first_saturday(d):
        return False
    return True


def classify_with_calendar(
    d: date,
    holidays: Set[str],
    working_saturdays: Set[str],
    holiday_titles: Optional[Dict[str, str]] = None,
) -> DayClassification:
    iso = d.isoformat()
    titles = holiday_titles or {}

    if iso in holidays:
        title = (titles.get(iso) or "Public Holiday").strip() or "Public Holiday"
        return DayClassification(True, "holiday", title, title)

    if iso in working_saturdays:
        return DayClassification(False, "workday", "Working day")

    if is_sunday(d):
        return DayClassification(True, "sunday", "Sunday — Rest day")

    if is_first_saturday(d):
        return DayClassification(True, "first_saturday", "1st Saturday — Rest day")

    return DayClassification(False, "workday", "Working day")


def format_off_day_reason(classification: DayClassification, d_or_iso: Union[date, str]) -> str:
    parsed_d = parse_iso_date(d_or_iso)
    if parsed_d:
        day_name = parsed_d.strftime("%a")
        month_name = parsed_d.strftime("%b")
        day_str = f"{day_name}, {parsed_d.day} {month_name}"
    else:
        day_str = str(d_or_iso)[:10]

    if classification.kind == "holiday":
        title = classification.holiday_title or classification.label
        return f"{day_str} is a company holiday ({title}). Logs can't be added on holidays."
    if classification.kind == "sunday":
        return "Sunday is a rest day. Logs can't be added on rest days."
    if classification.kind == "first_saturday":
        return "The 1st Saturday is a rest day. Logs can't be added on rest days."
    return f"{classification.label}. Logs can't be added on rest days."


class OffDayIndex:
    def __init__(
        self,
        holidays: Optional[Set[str]] = None,
        working_saturdays: Optional[Set[str]] = None,
        holiday_titles: Optional[Dict[str, str]] = None,
    ):
        self.holidays = holidays or set()
        self.working_saturdays = working_saturdays or set()
        self.holiday_titles = holiday_titles or {}

    def classify(self, d: date) -> DayClassification:
        return classify_with_calendar(d, self.holidays, self.working_saturdays, self.holiday_titles)

    def classify_iso(self, iso: str) -> DayClassification:
        parsed = parse_iso_date(iso)
        if parsed is None:
            return DayClassification(True, "holiday", "Invalid date")
        return self.classify(parsed)

    def is_workday(self, d: date) -> bool:
        return self.classify(d).is_workday

    def is_workday_iso(self, iso: str) -> bool:
        return self.classify_iso(iso).is_workday

    def is_off_iso(self, iso: str) -> bool:
        return not self.is_workday_iso(iso)


async def load_calendar_overrides(start: date, end: date) -> Tuple[Set[str], Set[str], Dict[str, str]]:
    holidays: Set[str] = set()
    working_saturdays: Set[str] = set()
    titles: Dict[str, str] = {}

    if end < start:
        start, end = end, start

    db = get_database()
    if db is None:
        return holidays, working_saturdays, titles

    try:
        cursor = db.company_calendar.find(
            {"date": {"$gte": start.isoformat(), "$lte": end.isoformat()}},
            {"_id": 0},
        )
        docs = await cursor.to_list(length=400)
    except Exception:
        return holidays, working_saturdays, titles

    for doc in docs:
        ev_date = str(doc.get("date") or "")[:10]
        if not ev_date:
            continue
        ev_type = doc.get("event_type")
        title = (doc.get("title") or "").strip()
        if ev_type in (CalendarEventType.HOLIDAY.value, "holiday") or doc.get("is_off_day") is True:
            holidays.add(ev_date)
            if title:
                titles[ev_date] = title
        if (
            doc.get("is_workday_override")
            or ev_type in (CalendarEventType.WORKING_SATURDAY.value, "working_saturday")
        ):
            working_saturdays.add(ev_date)

    return holidays, working_saturdays, titles


async def load_off_day_index(start: date, end: date) -> OffDayIndex:
    holidays, working, titles = await load_calendar_overrides(start, end)
    return OffDayIndex(holidays, working, titles)


async def classify_date(value) -> DayClassification:
    parsed = parse_iso_date(value)
    if parsed is None:
        return DayClassification(True, "holiday", "Invalid date")
    index = await load_off_day_index(parsed, parsed)
    return index.classify(parsed)


async def classify_date_for_user(
    user_id: Optional[str],
    value: Any,
    include_pending: bool = False,
) -> DayClassification:
    """
    Returns company classification, except when the user has an approved override
    with working_day=True (or a pending one, for check-in only if include_pending=True),
    in which case returns a workday labelled 'Shift change'.
    """
    parsed = parse_iso_date(value)
    if parsed is None:
        return DayClassification(True, "holiday", "Invalid date")
    iso_date = parsed.isoformat()
    db = get_database()
    if db is not None and user_id:
        assign = await db.user_shift_assignments.find_one({"user_id": user_id}, {"_id": 0})
        if assign:
            for ov in (assign.get("date_overrides") or []):
                if ov.get("date") == iso_date:
                    if ov.get("working_day") is True or ov.get("source") == "shift_change":
                        return DayClassification(False, "workday", "Shift change")
        if include_pending:
            pending_sc = await db.leave_requests.find_one({
                "user_id": user_id,
                "status": "pending",
                "leave_type": "shift_change",
                "$or": [
                    {"shift_change_dates": iso_date},
                    {"start_date": {"$lte": iso_date}, "end_date": {"$gte": iso_date}},
                ],
            })
            if pending_sc:
                return DayClassification(False, "workday", "Shift change")

    return await classify_date(parsed)


async def is_company_workday(value) -> bool:
    return (await classify_date(value)).is_workday


async def recent_company_workdays(days: int = 7, *, start_date: Optional[str] = None) -> list:
    """Latest `days` company workdays (ISO strings), newest first."""
    today = datetime.now().astimezone().date()
    try:
        from zoneinfo import ZoneInfo
        today = datetime.now(ZoneInfo("Asia/Karachi")).date()
    except Exception:
        pass

    bound = parse_iso_date(start_date) or date(2026, 8, 19)
    lookback = today - timedelta(days=max(days * 4, 28))
    index = await load_off_day_index(max(lookback, bound), today)

    workdays = []
    current = today
    while len(workdays) < days and current >= bound:
        if index.is_workday(current):
            workdays.append(current.isoformat())
        current -= timedelta(days=1)
    return workdays


def attendance_status_for_off_day(kind: str) -> str:
    if kind == "sunday":
        return "sunday_off"
    if kind == "first_saturday":
        return "first_saturday_off"
    return "holiday"
