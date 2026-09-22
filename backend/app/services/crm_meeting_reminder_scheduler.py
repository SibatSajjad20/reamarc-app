"""Automated 10-Minute Meeting Reminder Scheduler.

Periodically polls CRM leads for scheduled meetings starting in 0-15 minutes
and dispatches high-priority reminder emails with the Google Meet join link.
"""
from __future__ import annotations

import asyncio
import html as html_escape
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.database import get_database
from app.services.crm_scheduler import is_https_url

logger = logging.getLogger("app.crm.meeting_reminder")


def _db():
    db = get_database()
    if db is None:
        raise RuntimeError("Database connection not available.")
    return db


def build_meeting_reminder_10m_html(
    attendee_name: str,
    meeting_info: Dict[str, Any],
) -> str:
    """Render a responsive, high-converting HTML reminder email for the upcoming meeting."""
    event_name = html_escape.escape(str(meeting_info.get("event_name") or "Digital Services Consultancy Session"))
    host_name = html_escape.escape(str(meeting_info.get("host_name") or "Muhammad Faizan Khan"))
    join_url = str(meeting_info.get("join_url") or "").strip()
    if not is_https_url(join_url):
        join_url = "https://meet.google.com"
    clean_join_url = html_escape.escape(join_url)
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
        body_intro = "This is a quick reminder that your session is starting in approximately <strong>10 minutes</strong>. Click below to enter the meeting room:"
        location_line = """<div>
          <span style="color: #64748b; display: inline-block; width: 90px;">Location:</span>
          <span style="color: #0f172a;">Google Meet</span>
        </div>"""
        action_button = f"""<a href="{clean_join_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);">
          &#9654; Join Google Meet Room
        </a>
        <p style="font-size: 11px; color: #94a3b8; margin-top: 8px;">
          Or copy link: <a href="{clean_join_url}" style="color: #2563eb; word-break: break-all;">{clean_join_url}</a>
        </p>"""
        tip_box = """<div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #1e40af; line-height: 1.5;">
        <strong>Tip:</strong> When you open the link, click <em>&ldquo;Ask to join&rdquo;</em> and the host will admit you immediately. Please ensure your camera and microphone permissions are enabled.
      </div>"""
    elif meeting_mode in ("zoom", "teams"):
        body_intro = f"This is a quick reminder that your session is starting in approximately <strong>10 minutes</strong>. Your host will be connecting with you via <strong>{mode_label}</strong> (link sent to WhatsApp &amp; Email)."
        location_line = f"""<div>
          <span style="color: #64748b; display: inline-block; width: 90px;">Platform:</span>
          <span style="color: #0f172a; font-weight: 600;">{mode_label}</span>
          <span style="display: block; font-size: 11px; color: #64748b; margin-top: 2px;">Direct link via WhatsApp &bull; Backup: Google Meet</span>
        </div>"""
        action_button = f"""<a href="{clean_join_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);">
          &#9654; Join Backup Google Meet Room
        </a>
        <p style="font-size: 11px; color: #94a3b8; margin-top: 8px;">
          Backup room link: <a href="{clean_join_url}" style="color: #2563eb; word-break: break-all;">{clean_join_url}</a>
        </p>"""
        tip_box = f"""<div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #1e40af; line-height: 1.5;">
        <strong>{mode_label} Notice:</strong> Please check your WhatsApp for the custom room link from your host. If you experience any connectivity difficulties, the backup Google Meet room above is active and ready.
      </div>"""
    else:  # in_person
        body_intro = f"This is a quick reminder that your in-person session at Reamarc Office is starting in approximately <strong>10 minutes</strong>. We look forward to meeting with you!"
        location_line = f"""<div>
          <span style="color: #64748b; display: inline-block; width: 90px;">Location:</span>
          <strong style="color: #0f172a;">In-Person &bull; {office_address}</strong>
        </div>"""
        action_button = f"""<a href="{office_map_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.35);">
          &#128205; View Office Location on Google Maps
        </a>
        <p style="font-size: 11px; color: #94a3b8; margin-top: 8px;">
          Remote backup room: <a href="{clean_join_url}" style="color: #2563eb; word-break: break-all;">{clean_join_url}</a>
        </p>"""
        tip_box = f"""<div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #92400e; line-height: 1.5;">
        <strong>Office Directions:</strong> Please arrive at <strong>{office_address}</strong> and check in at reception. If you are unable to attend in person, you can join online using the backup Google Meet room.
      </div>"""

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Starting in 10 Minutes: {event_name}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #0f172a;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">

    <!-- Header Banner -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%); padding: 28px 24px; text-align: left;">
      <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 10px; border-radius: 20px; margin-bottom: 10px;">
        Starting in 10 Minutes
      </span>
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.3;">
        Your Session Begins Shortly
      </h1>
      <p style="color: #dbeafe; margin: 6px 0 0 0; font-size: 13px;">
        {event_name} with {host_name}
      </p>
    </div>

    <!-- Main Body -->
    <div style="padding: 28px 24px;">
      <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
        Hi <strong>{safe_attendee}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 12px 0 20px 0;">
        {body_intro}
      </p>

      <!-- Primary Join Button -->
      <div style="text-align: center; margin: 24px 0 28px 0;">
        {action_button}
      </div>

      <!-- Meeting Details Card -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin-bottom: 20px; font-size: 13px;">
        <div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 90px;">Meeting:</span>
          <strong style="color: #0f172a;">{event_name}</strong>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 90px;">Date &amp; Time:</span>
          <strong style="color: #2563eb;">{date_str} at {time_label} ({timezone_str})</strong>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #64748b; display: inline-block; width: 90px;">Host:</span>
          <span style="color: #0f172a;">{host_name}</span>
        </div>
        {location_line}
      </div>

      <!-- Preparation Tip -->
      {tip_box}
    </div>

    <!-- Footer -->
    <div style="background-color: #f1f5f9; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
      <p style="margin: 0;">Reamarc AI &bull; Strategy &amp; Digital Solutions</p>
      <p style="margin: 4px 0 0 0; color: #94a3b8;">If you are unable to attend, please reply to this email to inform your host.</p>
    </div>

  </div>
</body>
</html>"""


async def run_meeting_reminder_tick() -> int:
    """Scan CRM leads for upcoming scheduled meetings and dispatch 10-minute reminders."""
    from app.services.email_service import EmailService
    from app.services.crm_ingest import append_activity, SYSTEM_ACTOR

    db = _db()
    now_utc = datetime.now(timezone.utc)

    # Query active scheduled meetings where 10m reminder has not yet been sent
    cursor = db.crm_leads.find(
        {
            "meeting.status": {"$in": ["scheduled", "confirmed", "active"]},
            "meeting.reminder_10m_sent": {"$ne": True},
            "email": {"$exists": True, "$ne": None, "$ne": ""},
        },
        {"_id": 0, "id": 1, "name": 1, "email": 1, "meeting": 1},
    )
    leads = await cursor.to_list(500)
    sent_count = 0

    for lead in leads:
        lead_id = lead.get("id")
        email = str(lead.get("email") or "").strip()
        meeting = lead.get("meeting") or {}
        st_raw = meeting.get("start_time")

        if not lead_id or not email or not st_raw:
            continue

        try:
            start_dt = datetime.fromisoformat(str(st_raw).replace("Z", "+00:00"))
        except Exception:
            continue

        # Minutes until meeting starts
        diff_minutes = (start_dt - now_utc).total_seconds() / 60.0

        # Meeting already passed -> suppress future reminder attempts
        if diff_minutes < 0:
            await db.crm_leads.update_one(
                {"id": lead_id},
                {
                    "$set": {
                        "meeting.reminder_10m_sent": True,
                        "meeting.reminder_10m_skipped": "past_start_time",
                    }
                },
            )
            continue

        # Meeting starts within the next 15 minutes (and at least 0 mins remaining)
        if 0 <= diff_minutes <= 15:
            attendee_name = str(lead.get("name") or "there").strip()
            event_name = meeting.get("event_name", "Consultancy Session")
            host_name = meeting.get("host_name", "Muhammad Faizan Khan")

            html_body = build_meeting_reminder_10m_html(
                attendee_name=attendee_name,
                meeting_info=meeting,
            )
            subject = f"Starting in 10 minutes: {event_name} with {host_name}"

            try:
                ok = await EmailService.send_html_email(
                    recipient_email=email,
                    subject=subject,
                    html=html_body,
                    recipient_name=attendee_name,
                )
                if not ok:
                    logger.warning(
                        "[CRM Meeting Reminder] Email provider did not accept reminder for %s (%s)",
                        email,
                        lead_id,
                    )
                    continue
                await db.crm_leads.update_one(
                    {"id": lead_id},
                    {
                        "$set": {
                            "meeting.reminder_10m_sent": True,
                            "meeting.reminder_10m_sent_at": now_utc.isoformat(),
                        }
                    },
                )
                await append_activity(
                    lead_id,
                    "meeting_reminder_sent",
                    f"Automated 10-minute meeting reminder email sent to {email}.",
                    SYSTEM_ACTOR,
                )
                sent_count += 1
                logger.info(f"[CRM Meeting Reminder] Successfully sent reminder to {email} for lead {lead_id}")
            except Exception as err:
                logger.error(f"[CRM Meeting Reminder] Failed sending reminder to {email} ({lead_id}): {err}")

    return sent_count


async def start_crm_meeting_reminder_scheduler() -> None:
    """Continuous 60-second polling loop for scheduled meeting reminders."""
    logger.info("[CRM] Meeting reminder scheduler started (60s tick).")
    while True:
        try:
            await run_meeting_reminder_tick()
        except asyncio.CancelledError:
            logger.info("[CRM] Meeting reminder scheduler stopped.")
            raise
        except Exception as err:
            logger.warning("[CRM] Meeting reminder tick error: %s", err)
        await asyncio.sleep(60)
