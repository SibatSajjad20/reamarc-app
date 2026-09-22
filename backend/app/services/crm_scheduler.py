"""Native Reamarc Meeting Scheduler service.

Manages availability calculation, slot generation, conflict prevention,
lead ingestion into 'session_booked' stage, and calendar invite generation.
"""
from __future__ import annotations

import asyncio
import calendar
from collections import defaultdict
import hashlib
import hmac
import html as html_escape
import logging
import re
import urllib.parse
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from pydantic import EmailStr, TypeAdapter, ValidationError
from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.database import get_database
from app.services import crm_ingest
from app.services.crm_phone import digits_only, normalize_phone_e164

logger = logging.getLogger("app.crm.scheduler")

_EMAIL_ADAPTER = TypeAdapter(EmailStr)
_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")
_HTTPS_URL_RE = re.compile(r"^https://[^\s]+$", re.IGNORECASE)
_SLOT_INDEX_READY = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection not available.",
        )
    return db


DEFAULT_SCHEDULER_SETTINGS: Dict[str, Any] = {
    "key": "crm_scheduler_settings",
    "title": "Digital Services Consultancy Session",
    "description": (
        "Hi! thanks for showing interest.\n"
        "Our upcoming 30-minute meeting will provide an excellent opportunity for us to get better acquainted. "
        "During our conversation, we'll explore the challenges you're currently encountering and brainstorm "
        "ways in which we can collaborate effectively to address them and meet your specific requirements.\n"
        "I'm eagerly looking forward to our discussion. Thanks once again!"
    ),
    "slug": "consultancy",
    "host_name": "Muhammad Faizan Khan",
    "host_email": "faizan@reamarc.com",
    "duration_minutes": 30,
    "buffer_minutes": 0,
    "working_days": [1, 2, 3, 4, 5, 6],  # 1=Monday, ..., 6=Saturday
    "start_hour": "11:00",
    "end_hour": "23:00",
    "timezone": "Asia/Karachi",
    "location_type": "google_meet",
    "meeting_link": "https://meet.google.com/lookup/reamarc-strategy",
    "office_address": "Reamarc Office, Rawalpindi HQ, Pakistan",
    "office_map_url": "https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA",
    "notice_hours": 1,
    "max_days_advance": 30,
    "services": [
        "SEO Strategy & Organic Search",
        "Performance Marketing (Meta / Google Ads)",
        "Full-Stack Web Development",
        "UI/UX Design & Brand Transformation",
        "AI Workflows & Business Automation",
        "Comprehensive Digital Consultancy",
    ],
    "hr_whatsapp": "+923265550022",
    "careers_roles": [
        "Full-Stack Developer",
        "UI/UX & Product Designer",
        "Performance Marketer (Meta / Google Ads)",
        "Video Editor & Motion Designer",
        "AI & Automation Engineer",
        "Technical Copywriter",
        "Other Position",
    ],
}


def _sanitize_text(value: Any, *, max_len: int = 200, allow_newlines: bool = False) -> str:
    text = str(value or "")
    if allow_newlines:
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    else:
        text = _CTRL_RE.sub("", text)
    return text.strip()[:max_len]


def validate_email_address(raw: Any) -> str:
    text = _sanitize_text(raw, max_len=254).lower()
    if not text or "\r" in text or "\n" in text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please provide a valid email address.")
    try:
        return str(_EMAIL_ADAPTER.validate_python(text)).lower()
    except ValidationError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address.",
        ) from err


def validate_https_url(raw: Any, *, field_name: str = "URL") -> str:
    text = _sanitize_text(raw, max_len=2000)
    if not _HTTPS_URL_RE.match(text):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be an https:// link.",
        )
    parsed = urllib.parse.urlparse(text)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be an https:// link.",
        )
    return text


def is_https_url(raw: Any) -> bool:
    try:
        validate_https_url(raw)
        return True
    except HTTPException:
        return False


def _scheduler_tz(settings_doc: Dict[str, Any]) -> ZoneInfo:
    name = str(settings_doc.get("timezone") or "Asia/Karachi").strip() or "Asia/Karachi"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("Asia/Karachi")


def build_ics_token(lead_id: str, start_time: str) -> str:
    payload = f"{lead_id}|{start_time}"
    digest = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:32]
    return f"{lead_id}.{digest}"


def verify_ics_token(token: str, lead_id: str, start_time: str) -> bool:
    expected = build_ics_token(lead_id, start_time)
    given = str(token or "")
    if len(given) != len(expected):
        return False
    return hmac.compare_digest(given, expected)


async def get_scheduler_settings() -> Dict[str, Any]:
    """Retrieve scheduler configuration with fallback to company defaults."""
    db = _db()
    doc = await db.crm_scheduler_settings.find_one({"key": "crm_scheduler_settings"}, {"_id": 0})
    if not doc:
        return dict(DEFAULT_SCHEDULER_SETTINGS)
    merged = dict(DEFAULT_SCHEDULER_SETTINGS)
    merged.update(doc)
    return merged


async def _ensure_slot_index(db) -> None:
    global _SLOT_INDEX_READY
    if _SLOT_INDEX_READY:
        return
    create_index = getattr(db.crm_scheduler_slots, "create_index", None)
    if create_index:
        await create_index(
            [("date", 1), ("slot_time", 1)],
            unique=True,
            name="uniq_crm_scheduler_slot",
        )
    _SLOT_INDEX_READY = True


async def update_scheduler_settings(patch: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    """Admin endpoint to update scheduler availability, working hours, and services."""
    db = _db()
    allowed_keys = {
        "title",
        "description",
        "host_name",
        "host_email",
        "duration_minutes",
        "buffer_minutes",
        "working_days",
        "start_hour",
        "end_hour",
        "timezone",
        "meeting_link",
        "office_address",
        "office_map_url",
        "notice_hours",
        "max_days_advance",
        "services",
        "hr_whatsapp",
        "careers_roles",
    }
    cleaned: Dict[str, Any] = {k: v for k, v in patch.items() if k in allowed_keys and v is not None}
    if "office_address" in cleaned:
        cleaned["office_address"] = _sanitize_text(cleaned["office_address"], max_len=300)
    if "office_map_url" in cleaned:
        cleaned["office_map_url"] = validate_https_url(cleaned["office_map_url"], field_name="Office map link")
    if "hr_whatsapp" in cleaned:
        cleaned["hr_whatsapp"] = _sanitize_text(cleaned["hr_whatsapp"], max_len=40)
    if "careers_roles" in cleaned:
        roles = cleaned["careers_roles"]
        if isinstance(roles, list):
            cleaned["careers_roles"] = [_sanitize_text(r, max_len=120) for r in roles[:30] if _sanitize_text(r, max_len=120)]
    if "host_email" in cleaned:
        cleaned["host_email"] = validate_email_address(cleaned["host_email"])
    if "meeting_link" in cleaned:
        cleaned["meeting_link"] = validate_https_url(cleaned["meeting_link"], field_name="Meeting link")
    if "host_name" in cleaned:
        cleaned["host_name"] = _sanitize_text(cleaned["host_name"], max_len=120)
    if "title" in cleaned:
        cleaned["title"] = _sanitize_text(cleaned["title"], max_len=200)
    if "description" in cleaned:
        cleaned["description"] = _sanitize_text(cleaned["description"], max_len=4000, allow_newlines=True)
    if "timezone" in cleaned:
        tz_name = _sanitize_text(cleaned["timezone"], max_len=80)
        try:
            ZoneInfo(tz_name)
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid timezone.",
            ) from err
        cleaned["timezone"] = tz_name
    if "duration_minutes" in cleaned:
        try:
            duration = int(cleaned["duration_minutes"])
        except (TypeError, ValueError) as err:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid duration.") from err
        if duration not in (15, 20, 30, 45, 60, 90):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duration must be a supported meeting length.")
        cleaned["duration_minutes"] = duration
    if "working_days" in cleaned:
        days = cleaned["working_days"]
        if not isinstance(days, list):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="working_days must be a list.")
        cleaned_days = []
        for day in days:
            try:
                day_n = int(day)
            except (TypeError, ValueError) as err:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid working day.") from err
            if day_n < 1 or day_n > 7:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid working day.")
            cleaned_days.append(day_n)
        cleaned["working_days"] = sorted(set(cleaned_days))
    if "services" in cleaned:
        services = cleaned["services"]
        if not isinstance(services, list):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="services must be a list.")
        cleaned["services"] = [_sanitize_text(s, max_len=120) for s in services[:30] if _sanitize_text(s, max_len=120)]
    if "start_hour" in cleaned or "end_hour" in cleaned:
        for key in ("start_hour", "end_hour"):
            if key not in cleaned:
                continue
            value = str(cleaned[key])
            try:
                hh, mm = [int(p) for p in value.split(":")]
                time(hh, mm)
            except Exception as err:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {key}.") from err
            cleaned[key] = f"{hh:02d}:{mm:02d}"
    cleaned["updated_at"] = _now()
    cleaned["updated_by"] = user.get("id")

    await db.crm_scheduler_settings.update_one(
        {"key": "crm_scheduler_settings"},
        {"$set": cleaned},
        upsert=True,
    )
    return await get_scheduler_settings()


def _format_time_label(hh_mm: str) -> str:
    """Format '14:30' into '2:30 PM'."""
    try:
        parts = [int(p) for p in hh_mm.split(":")]
        dt = time(hour=parts[0], minute=parts[1])
        return dt.strftime("%I:%M %p").lstrip("0")
    except Exception:
        return hh_mm


async def get_available_slots(target_date_str: str, client_timezone: Optional[str] = None) -> Dict[str, Any]:
    """Calculate and return available time slots for a given date string (YYYY-MM-DD)."""
    db = _db()
    sched_settings = await get_scheduler_settings()
    tzinfo = _scheduler_tz(sched_settings)

    try:
        req_date = date.fromisoformat(str(target_date_str or "").strip())
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Required format: YYYY-MM-DD",
        )

    now_local = datetime.now(tzinfo)
    today_local = now_local.date()

    # Range check
    max_advance = int(sched_settings.get("max_days_advance", 30))
    if req_date < today_local:
        return {
            "date": target_date_str,
            "is_available": False,
            "reason": "Date is in the past.",
            "slots": [],
        }

    if req_date > (today_local + timedelta(days=max_advance)):
        return {
            "date": target_date_str,
            "is_available": False,
            "reason": f"Bookings can only be made up to {max_advance} days in advance.",
            "slots": [],
        }

    weekday = req_date.isoweekday()
    working_days = sched_settings.get("working_days", [1, 2, 3, 4, 5, 6])
    if weekday not in working_days:
        return {
            "date": target_date_str,
            "is_available": False,
            "reason": "We are closed on weekends / non-working days.",
            "slots": [],
        }

    start_hour_str = sched_settings.get("start_hour", "11:00")
    end_hour_str = sched_settings.get("end_hour", "23:00")
    duration = int(sched_settings.get("duration_minutes", 30))

    try:
        sh, sm = [int(p) for p in start_hour_str.split(":")]
        eh, em = [int(p) for p in end_hour_str.split(":")]
    except Exception:
        sh, sm, eh, em = 10, 0, 19, 0

    start_dt = datetime.combine(req_date, time(sh, sm), tzinfo=tzinfo)
    end_dt = datetime.combine(req_date, time(eh, em), tzinfo=tzinfo)

    candidate_slots: List[Dict[str, Any]] = []
    curr = start_dt
    notice_hours = float(sched_settings.get("notice_hours", 1))
    min_allowed_time = now_local + timedelta(hours=notice_hours)

    while curr + timedelta(minutes=duration) <= end_dt:
        time_str = curr.strftime("%H:%M")
        is_past = curr < min_allowed_time if req_date == today_local else False

        candidate_slots.append({
            "time": time_str,
            "label": _format_time_label(time_str),
            "iso_start": curr.isoformat(),
            "iso_end": (curr + timedelta(minutes=duration)).isoformat(),
            "available": not is_past,
        })
        curr += timedelta(minutes=duration)

    await _ensure_slot_index(db)
    booked_times = set()
    reserved_cursor = db.crm_scheduler_slots.find({"date": target_date_str}, {"slot_time": 1})
    for row in await reserved_cursor.to_list(500):
        st = row.get("slot_time")
        if st:
            booked_times.add(st)

    cursor = db.crm_leads.find(
        {
            "meeting.status": {"$in": ["scheduled", "active", "confirmed"]},
            "$or": [
                {"meeting.date": target_date_str},
                {"meeting.start_time": {"$regex": f"^{target_date_str}"}},
            ],
        },
        {"meeting": 1},
    )
    booked_leads = await cursor.to_list(500)

    for lead in booked_leads:
        m = lead.get("meeting") or {}
        st = m.get("slot_time")
        if st:
            booked_times.add(st)
        else:
            # Try parsing start_time ISO
            start_iso = m.get("start_time")
            if start_iso and "T" in str(start_iso):
                try:
                    time_part = str(start_iso).split("T")[1][:5]
                    booked_times.add(time_part)
                except Exception:
                    pass

    # Mark booked slots as unavailable
    for slot in candidate_slots:
        if slot["time"] in booked_times:
            slot["available"] = False
            slot["reason"] = "Already booked"

    return {
        "date": target_date_str,
        "is_available": any(s["available"] for s in candidate_slots),
        "host_name": sched_settings.get("host_name"),
        "timezone": sched_settings.get("timezone"),
        "duration_minutes": duration,
        "slots": candidate_slots,
    }


async def get_month_availability(month_str: str, client_timezone: Optional[str] = None) -> Dict[str, Any]:
    """Calculate and return fully-booked / unavailable dates for a given month (YYYY-MM)."""
    db = _db()
    sched_settings = await get_scheduler_settings()
    tzinfo = _scheduler_tz(sched_settings)

    clean_month = str(month_str or "").strip()
    if not re.fullmatch(r"^\d{4}-(?:0[1-9]|1[0-2])$", clean_month):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid month format. Required format: YYYY-MM",
        )

    year, month = [int(p) for p in clean_month.split("-")]
    num_days = calendar.monthrange(year, month)[1]

    now_local = datetime.now(tzinfo)
    today_local = now_local.date()
    max_advance = int(sched_settings.get("max_days_advance", 30))
    working_days = sched_settings.get("working_days", [1, 2, 3, 4, 5, 6])
    notice_hours = float(sched_settings.get("notice_hours", 1))
    duration = int(sched_settings.get("duration_minutes", 30))

    start_hour_str = sched_settings.get("start_hour", "11:00")
    end_hour_str = sched_settings.get("end_hour", "23:00")
    try:
        sh, sm = [int(p) for p in start_hour_str.split(":")]
        eh, em = [int(p) for p in end_hour_str.split(":")]
    except Exception:
        sh, sm, eh, em = 10, 0, 19, 0

    dummy_date = date(2000, 1, 1)
    dummy_start = datetime.combine(dummy_date, time(sh, sm))
    dummy_end = datetime.combine(dummy_date, time(eh, em))
    base_slot_times: List[str] = []
    c = dummy_start
    while c + timedelta(minutes=duration) <= dummy_end:
        base_slot_times.append(c.strftime("%H:%M"))
        c += timedelta(minutes=duration)

    await _ensure_slot_index(db)
    month_start_str = f"{clean_month}-01"
    month_end_str = f"{clean_month}-{num_days:02d}"

    booked_by_date: Dict[str, set] = defaultdict(set)

    # 1. Fetch reserved slots from crm_scheduler_slots
    reserved_cursor = db.crm_scheduler_slots.find(
        {"date": {"$gte": month_start_str, "$lte": month_end_str}},
        {"date": 1, "slot_time": 1},
    )
    for row in await reserved_cursor.to_list(5000):
        d_str = row.get("date")
        st = row.get("slot_time")
        if d_str and st:
            booked_by_date[d_str].add(st)

    # 2. Fetch booked meetings from crm_leads
    leads_cursor = db.crm_leads.find(
        {
            "meeting.status": {"$in": ["scheduled", "active", "confirmed"]},
            "$or": [
                {"meeting.date": {"$gte": month_start_str, "$lte": month_end_str}},
                {"meeting.start_time": {"$regex": f"^{clean_month}"}},
            ],
        },
        {"meeting": 1},
    )
    for lead in await leads_cursor.to_list(5000):
        m = lead.get("meeting") or {}
        d_str = m.get("date")
        st = m.get("slot_time")
        if not d_str and m.get("start_time"):
            d_str = str(m.get("start_time"))[:10]
        if not st and m.get("start_time") and "T" in str(m.get("start_time")):
            try:
                st = str(m.get("start_time")).split("T")[1][:5]
            except Exception:
                pass
        if d_str and st and d_str.startswith(clean_month):
            booked_by_date[d_str].add(st)

    fully_booked_dates: List[str] = []

    for day_num in range(1, num_days + 1):
        cur_d = date(year, month, day_num)
        cur_d_str = f"{clean_month}-{day_num:02d}"

        weekday = cur_d.isoweekday()
        if weekday not in working_days:
            continue
        if cur_d < today_local:
            continue
        if cur_d > (today_local + timedelta(days=max_advance)):
            continue

        day_booked = booked_by_date.get(cur_d_str, set())
        has_available_slot = False

        if not base_slot_times:
            fully_booked_dates.append(cur_d_str)
            continue

        if cur_d == today_local:
            min_allowed_time = now_local + timedelta(hours=notice_hours)
            for st_str in base_slot_times:
                if st_str in day_booked:
                    continue
                try:
                    th, tm = [int(p) for p in st_str.split(":")]
                    slot_dt = datetime.combine(cur_d, time(th, tm), tzinfo=tzinfo)
                    if slot_dt >= min_allowed_time:
                        has_available_slot = True
                        break
                except Exception:
                    continue
        else:
            for st_str in base_slot_times:
                if st_str not in day_booked:
                    has_available_slot = True
                    break

        if not has_available_slot:
            fully_booked_dates.append(cur_d_str)

    return {
        "month": clean_month,
        "fully_booked_dates": sorted(fully_booked_dates),
        "working_days": working_days,
    }


def _build_google_calendar_url(
    title: str,
    description: str,
    location: str,
    start_dt: datetime,
    end_dt: datetime,
) -> str:
    """Build one-click 'Add to Google Calendar' URL."""
    fmt = "%Y%m%dT%H%M%SZ"
    start_utc = start_dt.astimezone(timezone.utc).strftime(fmt)
    end_utc = end_dt.astimezone(timezone.utc).strftime(fmt)

    params = {
        "action": "TEMPLATE",
        "text": title,
        "dates": f"{start_utc}/{end_utc}",
        "details": description,
        "location": location,
        "sprop": "website:reamarc.com",
    }
    return f"https://calendar.google.com/calendar/render?{urllib.parse.urlencode(params)}"


def generate_ics_calendar(
    *,
    lead_id: str,
    title: str,
    description: str,
    location: str,
    start_dt: datetime,
    end_dt: datetime,
    host_name: str,
    host_email: str,
    attendee_name: str,
    attendee_email: str,
) -> str:
    """Generate RFC 5545 iCalendar (.ics) string for Outlook, Apple Calendar, and mobile devices."""
    fmt = "%Y%m%dT%H%M%SZ"
    start_utc = start_dt.astimezone(timezone.utc).strftime(fmt)
    end_utc = end_dt.astimezone(timezone.utc).strftime(fmt)
    now_utc = datetime.now(timezone.utc).strftime(fmt)

    def _esc(t: str) -> str:
        return str(t or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

    def _esc_email(t: str) -> str:
        return re.sub(r"[^a-zA-Z0-9._%+\-@]", "", str(t or ""))

    return f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Reamarc AI//Meeting Scheduler//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:reamarc-meeting-{_esc(lead_id)}@reamarc.com
DTSTAMP:{now_utc}
DTSTART:{start_utc}
DTEND:{end_utc}
SUMMARY:{_esc(title)}
DESCRIPTION:{_esc(description)}
LOCATION:{_esc(location)}
ORGANIZER;CN={_esc(host_name)}:mailto:{_esc_email(host_email)}
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN={_esc(attendee_name)}:mailto:{_esc_email(attendee_email)}
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR""".strip()


async def book_meeting(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Reserve a slot uniquely, then create a new CRM lead. Never mutates existing leads."""
    db = _db()
    sched_settings = await get_scheduler_settings()

    name = _sanitize_text(payload.get("name"), max_len=120)
    email = validate_email_address(payload.get("email"))
    phone = _sanitize_text(payload.get("phone"), max_len=40)
    target_date = _sanitize_text(payload.get("date"), max_len=10)
    slot_time = _sanitize_text(payload.get("slot_time"), max_len=5)

    if not name or len(name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please provide your full name.")
    digits = digits_only(phone)
    _e164, phone_valid = normalize_phone_e164(phone)
    if not phone or len(digits) < 7 or len(digits) > 15:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please provide a valid contact number.")
    if not phone_valid and not (10 <= len(digits) <= 15):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please provide a valid contact number.")
    if not target_date or not slot_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please select both a date and time slot.")
    if not re.fullmatch(r"\d{2}:\d{2}", slot_time):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please select a valid time slot.")

    availability = await get_available_slots(target_date)
    matching_slot = next((s for s in availability.get("slots", []) if s["time"] == slot_time), None)

    if not matching_slot:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Time slot {slot_time} is not a valid working slot for {target_date}.",
        )
    if not matching_slot.get("available"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The {matching_slot.get('label', slot_time)} slot on {target_date} has just been booked. Please choose another time.",
        )

    duration = int(sched_settings.get("duration_minutes", 30))
    tzinfo = _scheduler_tz(sched_settings)
    try:
        sh, sm = [int(p) for p in slot_time.split(":")]
        req_d = date.fromisoformat(target_date)
        start_dt = datetime.combine(req_d, time(sh, sm), tzinfo=tzinfo)
        end_dt = start_dt + timedelta(minutes=duration)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date/time values.")

    start_iso = start_dt.isoformat()
    end_iso = end_dt.isoformat()

    meeting_url = sched_settings.get("meeting_link") or "https://meet.google.com/lookup/reamarc-strategy"
    if not is_https_url(meeting_url):
        meeting_url = "https://meet.google.com/lookup/reamarc-strategy"
    event_title = _sanitize_text(sched_settings.get("title") or "Digital Services Consultancy Session", max_len=200)
    host_name = _sanitize_text(sched_settings.get("host_name") or "Muhammad Faizan Khan", max_len=120)
    try:
        host_email = validate_email_address(sched_settings.get("host_email") or "faizan@reamarc.com")
    except HTTPException:
        host_email = "faizan@reamarc.com"

    company = _sanitize_text(payload.get("company"), max_len=160)
    website_raw = _sanitize_text(payload.get("website"), max_len=300)
    website = website_raw if (not website_raw or is_https_url(website_raw) or re.match(r"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", website_raw)) else ""
    service = _sanitize_text(payload.get("service"), max_len=300)
    note = _sanitize_text(payload.get("note"), max_len=2000, allow_newlines=True)

    raw_mode = _sanitize_text(payload.get("meeting_mode") or payload.get("location_preference") or "google_meet", max_len=40).lower()
    meeting_mode = raw_mode if raw_mode in {"google_meet", "zoom", "teams", "in_person"} else "google_meet"
    mode_labels = {
        "google_meet": "Google Meet",
        "zoom": "Zoom",
        "teams": "Microsoft Teams",
        "in_person": "In-Person (Office)",
    }
    meeting_mode_label = mode_labels.get(meeting_mode, "Google Meet")
    office_address = _sanitize_text(sched_settings.get("office_address") or "Reamarc Office, Rawalpindi HQ, Pakistan", max_len=300)
    office_map_url = sched_settings.get("office_map_url") or "https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA"

    qa_list = [
        {"question": "What services do you require?", "answer": service or "Consultancy"},
        {"question": "Preferred Meeting Mode", "answer": meeting_mode_label},
        {"question": "Please share a brief of your requirement", "answer": note or "No brief provided."},
    ]
    if company:
        qa_list.append({"question": "Business / Company Name", "answer": company})
    if website:
        qa_list.append({"question": "Website URL", "answer": website})

    meeting_dict: Dict[str, Any] = {
        "event_name": event_title,
        "date": target_date,
        "slot_time": slot_time,
        "start_time": start_iso,
        "end_time": end_iso,
        "timezone": sched_settings.get("timezone", "Asia/Karachi"),
        "join_url": meeting_url,
        "meeting_mode": meeting_mode,
        "location_type": meeting_mode,
        "location_label": meeting_mode_label,
        "office_address": office_address,
        "office_map_url": office_map_url,
        "status": "scheduled",
        "host_name": host_name,
        "host_email": host_email,
        "questions_and_answers": qa_list,
    }

    fields_dict: Dict[str, Any] = {
        "name": name,
        "email": email,
        "phone": phone,
        "company": company or None,
        "website": website or None,
        "service": service or None,
        "note": note or None,
        "budget": payload.get("budget"),
    }

    attribution = crm_ingest.extract_attribution(payload, default_platform="scheduler")

    await _ensure_slot_index(db)
    reservation = {
        "date": target_date,
        "slot_time": slot_time,
        "created_at": _now(),
        "lead_id": None,
    }
    try:
        await db.crm_scheduler_slots.insert_one(reservation)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The {matching_slot.get('label', slot_time)} slot on {target_date} has just been booked. Please choose another time.",
        )

    try:
        ingest_result = await crm_ingest.ingest_lead(
            fields=fields_dict,
            source_label="website_scheduler",
            campaign=_sanitize_text(payload.get("campaign") or attribution.get("utm_campaign") or "strategy_session", max_len=120),
            raw_payload=payload,
            attribution=attribution,
            initial_stage="session_booked",
            meeting=meeting_dict,
            next_follow_up_at=start_iso,
            skip_duplicate_merge=True,
        )
        lead = ingest_result["lead"]
        lead_id = lead["id"]
        await db.crm_scheduler_slots.update_one(
            {"date": target_date, "slot_time": slot_time},
            {"$set": {"lead_id": lead_id}},
        )
    except Exception:
        await db.crm_scheduler_slots.delete_one({"date": target_date, "slot_time": slot_time})
        raise

    if meeting_mode == "in_person":
        cal_loc = f"In-Person ({office_address})"
        loc_line = f"Location: In-Person ({office_address})\nRemote Backup Room: {meeting_url}"
    else:
        cal_loc = meeting_url
        loc_line = f"Meeting Method: {meeting_mode_label}\nGoogle Meet Room: {meeting_url}"

    cal_desc = (
        f"{event_title}\n\n"
        f"Host: {host_name} ({host_email})\n"
        f"Attendee: {name} ({email})\n"
        f"{loc_line}\n\n"
        f"Project Brief: {note or 'N/A'}"
    )
    google_cal_url = _build_google_calendar_url(
        title=f"{event_title} - Reamarc",
        description=cal_desc,
        location=cal_loc,
        start_dt=start_dt,
        end_dt=end_dt,
    )
    ics_token = build_ics_token(lead_id, start_iso)
    ics_path = f"/crm/public/scheduler/ics/{ics_token}"

    try:
        asyncio.create_task(
            send_booking_confirmation_emails(
                lead_id=lead_id,
                attendee_name=name,
                attendee_email=email,
                attendee_phone=phone,
                company=company or None,
                website=website or None,
                service=service or None,
                note=note or None,
                meeting_info=meeting_dict,
                google_cal_url=google_cal_url,
                ics_path=ics_path,
            )
        )
    except Exception as e:
        logger.warning(f"[CRM Scheduler] Could not schedule background email dispatch: {e}")

    return {
        "ok": True,
        "lead_id": lead_id,
        "meeting": {
            "title": event_title,
            "date": target_date,
            "slot_time": slot_time,
            "time_label": matching_slot.get("label", slot_time),
            "start_time": start_iso,
            "end_time": end_iso,
            "host_name": host_name,
            "join_url": meeting_url,
            "meeting_mode": meeting_mode,
            "location_label": meeting_mode_label,
            "office_address": office_address,
            "office_map_url": office_map_url,
            "timezone": sched_settings.get("timezone", "Asia/Karachi"),
        },
        "calendar_links": {
            "google": google_cal_url,
            "ics_path": ics_path,
        },
    }


def build_booking_confirmation_html(
    attendee_name: str,
    meeting_info: Dict[str, Any],
    google_cal_url: str,
    ics_download_url: Optional[str] = None,
    note: Optional[str] = None,
    company: Optional[str] = None,
) -> str:
    """Render a responsive, branded HTML booking confirmation email with Google Meet and calendar buttons."""
    event_name = html_escape.escape(str(meeting_info.get("event_name") or "Digital Services Consultancy Session"))
    host_name = html_escape.escape(str(meeting_info.get("host_name") or "Muhammad Faizan Khan"))
    host_email = html_escape.escape(str(meeting_info.get("host_email") or "faizan@reamarc.com"))
    join_url = str(meeting_info.get("join_url") or "").strip()
    if not is_https_url(join_url):
        join_url = "https://meet.google.com"
    clean_join_url = html_escape.escape(join_url)
    clean_cal_url = html_escape.escape(google_cal_url or "#")
    date_str = html_escape.escape(str(meeting_info.get("date") or ""))
    slot_time = html_escape.escape(str(meeting_info.get("slot_time") or ""))
    time_label = html_escape.escape(str(meeting_info.get("time_label") or slot_time))
    timezone_str = html_escape.escape(str(meeting_info.get("timezone") or "Asia/Karachi"))
    safe_attendee = html_escape.escape(attendee_name or "there")

    meeting_mode = str(meeting_info.get("meeting_mode") or "google_meet").lower()
    mode_label = html_escape.escape(str(meeting_info.get("location_label") or "Google Meet"))
    office_address = html_escape.escape(str(meeting_info.get("office_address") or "Reamarc Office, Rawalpindi HQ, Pakistan"))
    office_map_url = html_escape.escape(str(meeting_info.get("office_map_url") or "https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA"))

    if meeting_mode == "google_meet":
        location_row = f"""<div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 100px;">Location:</span>
          <a href="{clean_join_url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; font-weight: 600; text-decoration: underline;">
            Join via Google Meet &rarr;
          </a>
        </div>"""
        action_button = f"""<a href="{clean_join_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 26px; border-radius: 10px; text-decoration: none; margin-right: 8px; margin-bottom: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
          &#9654; Join Google Meet
        </a>"""
        how_to_join = "A few minutes prior to the scheduled time, simply click the <strong>Join Google Meet</strong> button above. When prompted, click <em>&ldquo;Ask to join&rdquo;</em> and your host will let you in."
    elif meeting_mode in ("zoom", "teams"):
        location_row = f"""<div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 100px;">Platform:</span>
          <strong style="color: #0f172a;">{mode_label}</strong>
          <span style="display: block; margin-top: 4px; font-size: 12px; color: #475569;">
            Host will share your custom room link via WhatsApp &amp; Email prior to the call.
          </span>
          <span style="display: block; margin-top: 2px; font-size: 11px; color: #64748b;">
            Alternative Google Meet room: <a href="{clean_join_url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">Open Backup Room</a>
          </span>
        </div>"""
        action_button = f"""<a href="{clean_join_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 26px; border-radius: 10px; text-decoration: none; margin-right: 8px; margin-bottom: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
          &#9654; Join Google Meet (Backup)
        </a>"""
        how_to_join = f"Your host will send your personalized <strong>{mode_label}</strong> room link to your WhatsApp and email prior to the call. If you prefer or experience connectivity issues, the alternative <strong>Google Meet</strong> backup room above is also active."
    else:  # in_person
        location_row = f"""<div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 100px;">Location:</span>
          <strong style="color: #0f172a;">In-Person &bull; {office_address}</strong>
          <span style="display: block; margin-top: 4px; font-size: 12px;">
            <a href="{office_map_url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">
              &#128205; View on Google Maps &rarr;
            </a>
          </span>
          <span style="display: block; margin-top: 2px; font-size: 11px; color: #64748b;">
            Remote backup room: <a href="{clean_join_url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">Google Meet</a>
          </span>
        </div>"""
        action_button = f"""<a href="{office_map_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 26px; border-radius: 10px; text-decoration: none; margin-right: 8px; margin-bottom: 8px;">
          &#128205; View Office Map
        </a>"""
        how_to_join = f"Please arrive at <strong>{office_address}</strong> 5 minutes before your scheduled session. If you need assistance or wish to switch to an online video call, you can join the backup Google Meet room."

    company_row = (
        f"""<div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 100px;">Company:</span>
          <span style="color: #0f172a; font-weight: 500;">{html_escape.escape(company)}</span>
        </div>"""
        if company
        else ""
    )

    note_block = (
        f"""<div style="background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #334155; margin-top: 20px;">
          <strong style="color: #0f172a;">Your Requirements / Goals:</strong><br>
          <span style="display: block; margin-top: 4px; white-space: pre-line;">{html_escape.escape(note)}</span>
        </div>"""
        if note
        else ""
    )

    ics_block = (
        f"""<div style="text-align: center; margin-top: 14px;">
          <a href="{html_escape.escape(ics_download_url)}" style="color: #2563eb; font-size: 12px; font-weight: 600; text-decoration: underline;">
            Download Outlook / Apple Calendar (.ics file)
          </a>
        </div>"""
        if ics_download_url
        else ""
    )

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmed: {event_name}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #0f172a;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">

    <!-- Header Banner -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%); padding: 32px 24px; text-align: left;">
      <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 10px; border-radius: 20px; margin-bottom: 10px;">
        &#10003; Session Confirmed
      </span>
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.3;">
        You're Scheduled!
      </h1>
      <p style="color: #dbeafe; margin: 6px 0 0 0; font-size: 13px;">
        {event_name}
      </p>
    </div>

    <!-- Main Content -->
    <div style="padding: 28px 24px;">
      <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
        Hi <strong>{safe_attendee}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 12px 0 20px 0;">
        Your consultancy session has been confirmed. We look forward to speaking with you and exploring how we can accelerate your digital and marketing goals.
      </p>

      <!-- Booking Card -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px; font-size: 13px;">
        <div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 100px;">Meeting:</span>
          <strong style="color: #0f172a;">{event_name}</strong>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 100px;">Date &amp; Time:</span>
          <strong style="color: #2563eb;">{date_str} at {time_label} ({timezone_str})</strong>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 100px;">Host:</span>
          <span style="color: #0f172a;">{host_name} (<a href="mailto:{host_email}" style="color: #2563eb; text-decoration: none;">{host_email}</a>)</span>
        </div>
        {location_row}
        {company_row}
      </div>

      <!-- Action Buttons -->
      <div style="text-align: center; margin: 28px 0 20px 0;">
        {action_button}
        <a href="{clean_cal_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 22px; border-radius: 10px; text-decoration: none; margin-bottom: 8px;">
          + Add to Google Calendar
        </a>
        {ics_block}
      </div>

      {note_block}

      <!-- Reminder Notice -->
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b; line-height: 1.6;">
        <strong style="color: #334155;">How to join:</strong>
        <br>
        {how_to_join}
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f1f5f9; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
      <p style="margin: 0;">Reamarc AI &bull; Strategy &amp; Digital Solutions</p>
      <p style="margin: 4px 0 0 0; color: #94a3b8;">Questions or need to reschedule? Simply reply directly to this email.</p>
    </div>

  </div>
</body>
</html>"""


def build_host_booking_notification_html(
    host_name: str,
    attendee_name: str,
    attendee_email: str,
    attendee_phone: Optional[str],
    company: Optional[str],
    website: Optional[str],
    service: Optional[str],
    note: Optional[str],
    meeting_info: Dict[str, Any],
) -> str:
    """Render notification email sent to the host informing them of a newly booked session."""
    event_name = html_escape.escape(str(meeting_info.get("event_name") or "Strategy Session"))
    date_str = html_escape.escape(str(meeting_info.get("date") or ""))
    slot_time = html_escape.escape(str(meeting_info.get("slot_time") or ""))
    time_label = html_escape.escape(str(meeting_info.get("time_label") or slot_time))
    timezone_str = html_escape.escape(str(meeting_info.get("timezone") or "Asia/Karachi"))
    join_url = str(meeting_info.get("join_url") or "").strip()
    if not is_https_url(join_url):
        join_url = "https://meet.google.com"
    clean_join_url = html_escape.escape(join_url)

    safe_name = html_escape.escape(attendee_name or "New Client")
    safe_email = html_escape.escape(attendee_email or "N/A")
    safe_phone = html_escape.escape(attendee_phone or "N/A")
    safe_company = html_escape.escape(company or "N/A")
    safe_website = html_escape.escape(website or "N/A")
    safe_service = html_escape.escape(service or "Consultancy")
    safe_note = html_escape.escape(note or "None provided")

    meeting_mode = str(meeting_info.get("meeting_mode") or "google_meet").lower()
    mode_label = html_escape.escape(str(meeting_info.get("location_label") or "Google Meet"))
    clean_phone = re.sub(r"[^0-9]", "", attendee_phone or "")
    wa_link = f"https://wa.me/{clean_phone}" if clean_phone else None

    action_banner = ""
    if meeting_mode != "google_meet":
        wa_btn = (
            f"""<a href="{html_escape.escape(wa_link)}" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 12px; margin-right: 8px;">&#128172; Open WhatsApp Chat</a>"""
            if wa_link
            else ""
        )
        action_banner = f"""
      <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; color: #92400e;">
        <strong style="font-size: 14px; color: #b45309;">&#9888; ACTION REQUIRED: Attendee Requested {mode_label}</strong><br>
        Please reach out to <strong>{safe_name}</strong> to share your custom {mode_label} link or office directions:
        <div style="margin-top: 10px;">
          {wa_btn}
          <a href="mailto:{safe_email}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 12px;">Email Client</a>
        </div>
        <span style="font-size: 11px; color: #b45309; margin-top: 8px; display: block;">(Client was also provided the backup Google Meet room: <a href="{clean_join_url}" style="color: #b45309; text-decoration: underline;">{clean_join_url}</a>)</span>
      </div>
"""

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Booking: {safe_name}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #0f172a;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.05);">
    <div style="background: #0f172a; padding: 24px; color: #ffffff;">
      <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #38bdf8;">New Client Booking</span>
      <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 800; color: #ffffff;">{safe_name} booked {event_name}</h1>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">{date_str} at {time_label} ({timezone_str})</p>
    </div>
    <div style="padding: 24px;">
      {action_banner}
      <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Client Profile</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <tr><td style="padding: 6px 0; color: #64748b; width: 120px;">Name:</td><td><strong>{safe_name}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Meeting Mode:</td><td><strong style="color: #2563eb;">{mode_label}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Email:</td><td><a href="mailto:{safe_email}" style="color: #2563eb;">{safe_email}</a></td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Phone:</td><td>{safe_phone} {" &bull; <a href='" + html_escape.escape(wa_link) + "' target='_blank' style='color: #16a34a; font-weight: 600; text-decoration: none;'>WhatsApp &rarr;</a>" if wa_link else ""}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Company:</td><td>{safe_company}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Website:</td><td>{safe_website}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Service:</td><td>{safe_service}</td></tr>
      </table>

      <div style="background-color: #f1f5f9; border-left: 4px solid #0f172a; padding: 12px 16px; border-radius: 6px; font-size: 13px; margin-bottom: 24px;">
        <strong style="color: #0f172a;">Client Goals &amp; Challenges:</strong>
        <p style="margin: 4px 0 0 0; color: #334155; white-space: pre-line;">{safe_note}</p>
      </div>

      <div style="text-align: center;">
        <a href="{clean_join_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
          Open Google Meet Room (Backup) &rarr;
        </a>
      </div>
    </div>
  </div>
</body>
</html>"""


async def send_booking_confirmation_emails(
    lead_id: str,
    attendee_name: str,
    attendee_email: str,
    attendee_phone: Optional[str],
    company: Optional[str],
    website: Optional[str],
    service: Optional[str],
    note: Optional[str],
    meeting_info: Dict[str, Any],
    google_cal_url: str,
    ics_path: str,
) -> None:
    """Asynchronously dispatches confirmation emails to both attendee and host."""
    from app.config import settings
    from app.services.crm_ingest import SYSTEM_ACTOR, append_activity
    from app.services.email_service import EmailService

    base_url = (settings.APP_FRONTEND_URL or "").rstrip("/")
    ics_download_url = f"{base_url}{ics_path}" if base_url else ics_path

    # 1. Send Attendee Confirmation Email
    if attendee_email:
        try:
            attendee_html = build_booking_confirmation_html(
                attendee_name=attendee_name,
                meeting_info=meeting_info,
                google_cal_url=google_cal_url,
                ics_download_url=ics_download_url,
                note=note,
                company=company,
            )
            event_title = meeting_info.get("event_name", "Consultancy Session")
            host_name = meeting_info.get("host_name", "Muhammad Faizan Khan")
            subject = f"Confirmed: {event_title} with {host_name}"

            ok = await EmailService.send_html_email(
                recipient_email=attendee_email,
                subject=subject,
                html=attendee_html,
                recipient_name=attendee_name,
            )
            if ok:
                await append_activity(
                    lead_id,
                    "email_sent",
                    f"Booking confirmation email sent to attendee: {attendee_email}.",
                    SYSTEM_ACTOR,
                )
                logger.info(f"[CRM Scheduler] Booking confirmation sent to attendee: {attendee_email}")
        except Exception as e:
            logger.error(f"[CRM Scheduler] Failed sending confirmation to {attendee_email}: {e}")

    # 2. Send Host Notification Email
    host_email = meeting_info.get("host_email")
    if host_email and host_email.lower().strip() != attendee_email.lower().strip():
        try:
            host_html = build_host_booking_notification_html(
                host_name=meeting_info.get("host_name", "Host"),
                attendee_name=attendee_name,
                attendee_email=attendee_email,
                attendee_phone=attendee_phone,
                company=company,
                website=website,
                service=service,
                note=note,
                meeting_info=meeting_info,
            )
            mode_tag = f"[{meeting_info.get('location_label', 'New').upper()}]" if meeting_info.get("meeting_mode") and meeting_info.get("meeting_mode") != "google_meet" else "[New Booking]"
            host_subject = f"{mode_tag} {attendee_name} booked {meeting_info.get('event_name', 'Session')} ({meeting_info.get('date')} at {meeting_info.get('slot_time')})"
            ok = await EmailService.send_html_email(
                recipient_email=host_email,
                subject=host_subject,
                html=host_html,
                recipient_name=meeting_info.get("host_name"),
            )
            if ok:
                await append_activity(
                    lead_id,
                    "email_sent",
                    f"New booking notification email sent to host: {host_email}.",
                    SYSTEM_ACTOR,
                )
                logger.info(f"[CRM Scheduler] Host notification sent to: {host_email}")
        except Exception as e:
            logger.error(f"[CRM Scheduler] Failed sending host notification to {host_email}: {e}")

