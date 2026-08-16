import asyncio
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional
from datetime import datetime, timezone
from app.config import settings

logger = logging.getLogger("app.email_service")


def _build_reminder_html(
    recipient_name: str,
    missing_dates: List[str],
    custom_message: Optional[str] = None,
    action_url: Optional[str] = None,
) -> str:
    app_url = action_url or f"{settings.APP_FRONTEND_URL}/daily-log"
    missing_dates_formatted = ", ".join(missing_dates) if missing_dates else "today"
    custom_note_block = (
        f"""<div style="background-color: #f4f4f5; border-left: 4px solid #6366f1; padding: 12px 16px; margin: 16px 0; border-radius: 6px; font-size: 13px; color: #3f3f46;">
            <strong>Admin Note:</strong> {custom_message}
        </div>"""
        if custom_message
        else ""
    )

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Work Log Reminder</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fafafa; margin: 0; padding: 24px 12px; color: #18181b;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 28px 24px; text-align: left;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em;">
        {settings.SMTP_FROM_NAME}
      </h1>
      <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px;">
        Daily Work Log Reminder
      </p>
    </div>

    <!-- Body Content -->
    <div style="padding: 32px 28px;">
      <h2 style="font-size: 16px; font-weight: 700; color: #18181b; margin-top: 0;">
        Hi {recipient_name},
      </h2>
      <p style="font-size: 14px; line-height: 1.6; color: #52525b; margin: 12px 0 20px 0;">
        This is a friendly reminder that your work log submission is pending for:
      </p>

      <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px;">
        <span style="font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">
          Pending Log Dates
        </span>
        <span style="font-size: 14px; font-weight: 700; color: #78350f; font-family: monospace;">
          {missing_dates_formatted}
        </span>
      </div>

      {custom_note_block}

      <p style="font-size: 13px; line-height: 1.5; color: #71717a; margin-bottom: 28px;">
        Please take a moment to record your completed tasks, hours utilized, and deliverables so your team activity remains up to date.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 28px 0;">
        <a href="{app_url}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 10px; box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);">
          Submit Daily Log Now &rarr;
        </a>
      </div>

      <p style="font-size: 11px; color: #a1a1aa; text-align: center; margin: 24px 0 0 0;">
        You are receiving this notification as a member of the organization.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f4f4f5; padding: 16px 24px; text-align: center; border-top: 1px solid #e4e4e7;">
      <p style="font-size: 11px; color: #71717a; margin: 0;">
        &copy; {datetime.now().year} {settings.PROJECT_NAME}. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>"""


import httpx


async def _send_resend_http(
    recipient_email: str,
    subject: str,
    html_content: str,
) -> bool:
    """Dispatches email via Resend HTTPS REST API (Bypasses all firewall port blocking)."""
    sender = settings.SMTP_FROM_EMAIL or "onboarding@resend.dev"
    from_header = f"{settings.SMTP_FROM_NAME} <{sender}>" if settings.SMTP_FROM_NAME else sender
    payload = {
        "from": from_header,
        "to": [recipient_email],
        "subject": subject,
        "html": html_content,
    }
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY.strip()}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post("https://api.resend.com/emails", json=payload, headers=headers)
        if res.status_code not in (200, 201):
            err_msg = f"Resend API error ({res.status_code}): {res.text}"
            logger.error(err_msg)
            raise RuntimeError(err_msg)
        logger.info(f"Successfully dispatched email via Resend to {recipient_email}")
        return True


async def _send_brevo_http(
    recipient_email: str,
    recipient_name: str,
    subject: str,
    html_content: str,
) -> bool:
    """Dispatches email via Brevo HTTPS REST API."""
    sender_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER or "noreply@reamarc.com"
    payload = {
        "sender": {"name": settings.SMTP_FROM_NAME, "email": sender_email},
        "to": [{"email": recipient_email, "name": recipient_name}],
        "subject": subject,
        "htmlContent": html_content,
    }
    headers = {
        "api-key": settings.BREVO_API_KEY.strip(),
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post("https://api.brevo.com/v3/smtp/email", json=payload, headers=headers)
        if res.status_code not in (200, 201):
            err_msg = f"Brevo API error ({res.status_code}): {res.text}"
            logger.error(err_msg)
            raise RuntimeError(err_msg)
        logger.info(f"Successfully dispatched email via Brevo to {recipient_email}")
        return True


async def _send_sendgrid_http(
    recipient_email: str,
    subject: str,
    html_content: str,
) -> bool:
    """Dispatches email via SendGrid HTTPS REST API."""
    sender_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER or "noreply@reamarc.com"
    payload = {
        "personalizations": [{"to": [{"email": recipient_email}]}],
        "from": {"email": sender_email, "name": settings.SMTP_FROM_NAME},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_content}],
    }
    headers = {
        "Authorization": f"Bearer {settings.SENDGRID_API_KEY.strip()}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post("https://api.sendgrid.com/v3/mail/send", json=payload, headers=headers)
        if res.status_code not in (200, 202):
            err_msg = f"SendGrid API error ({res.status_code}): {res.text}"
            logger.error(err_msg)
            raise RuntimeError(err_msg)
        logger.info(f"Successfully dispatched email via SendGrid to {recipient_email}")
        return True


def _send_smtp_sync(
    recipient_email: str,
    subject: str,
    html_content: str,
) -> bool:
    """Synchronous SMTP email delivery."""
    sender_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    if not sender_email or not settings.SMTP_PASSWORD:
        logger.info(
            f"[SIMULATED EMAIL] To: {recipient_email} | Subject: '{subject}' | Content preview: {html_content[:150]}..."
        )
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{sender_email}>"
    msg["To"] = recipient_email

    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            if settings.SMTP_TLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
            logger.info(f"Successfully dispatched reminder email to {recipient_email}")
            return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_email}: {str(e)}")
        raise e


class EmailService:
    @staticmethod
    async def send_log_reminder(
        recipient_email: str,
        recipient_name: str,
        missing_dates: List[str],
        custom_message: Optional[str] = None,
        action_url: Optional[str] = None,
    ) -> bool:
        """Asynchronously dispatches a branded Daily Log reminder email."""
        subject = f"Reminder: Please submit your Daily Log ({', '.join(missing_dates) if missing_dates else 'Today'})"
        html = _build_reminder_html(
            recipient_name=recipient_name,
            missing_dates=missing_dates,
            custom_message=custom_message,
            action_url=action_url,
        )

        # 1. Primary: HTTPS REST APIs (Bypasses Render/Vercel/Cloud port 587/465/25 blocking)
        if settings.RESEND_API_KEY and settings.RESEND_API_KEY.strip():
            return await _send_resend_http(recipient_email, subject, html)
        elif settings.BREVO_API_KEY and settings.BREVO_API_KEY.strip():
            return await _send_brevo_http(recipient_email, recipient_name, subject, html)
        elif settings.SENDGRID_API_KEY and settings.SENDGRID_API_KEY.strip():
            return await _send_sendgrid_http(recipient_email, subject, html)

        # 2. Fallback: Standard SMTP
        return await asyncio.to_thread(_send_smtp_sync, recipient_email, subject, html)
