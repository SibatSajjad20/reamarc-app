import asyncio
import logging
import re
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Any, Dict, List, Optional

import httpx
from pydantic import EmailStr, TypeAdapter, ValidationError

from app.config import settings

_FROM_NAME_UNSAFE = re.compile(r'[\r\n<>"\\,;:@]')
_EMAIL_ADAPTER = TypeAdapter(EmailStr)
_SIMPLE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

logger = logging.getLogger("app.email_service")


def sanitize_from_name(name: Optional[str]) -> str:
    cleaned = _FROM_NAME_UNSAFE.sub("", str(name or ""))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()[:64]
    return cleaned or (settings.SMTP_FROM_NAME or "Notifications")


def _valid_reply_to(raw: Optional[str]) -> Optional[str]:
    text = str(raw or "").strip()
    if not text or "\r" in text or "\n" in text:
        return None
    reamarc_addrs = {
        (settings.SMTP_FROM_EMAIL or "").strip().lower(),
        (settings.SMTP_USER or "").strip().lower(),
    }
    reamarc_addrs.discard("")
    try:
        email = str(_EMAIL_ADAPTER.validate_python(text)).lower()
    except ValidationError:
        if not _SIMPLE_EMAIL.match(text.lower()):
            return None
        email = text.lower()
    if email in reamarc_addrs:
        return None
    return email


def _logo_block(logo_url: Optional[str], company_name: str) -> str:
    if not logo_url or not str(logo_url).startswith("https://"):
        return ""
    safe = str(logo_url).replace('"', "")
    return (
        f'<img src="{safe}" alt="{company_name}" '
        'style="max-height: 36px; max-width: 160px; display: block; margin-bottom: 8px;" />'
    )


async def resolve_sender_identity(company: Optional[dict] = None) -> dict:
    """Return display identity for outbound mail. Transport address is unchanged."""
    from app.core.integrations import is_reamarc_company
    from app.core.tenant import get_tenant_context
    from app.services.company_branding import company_admin_reply_email, get_company_doc

    cid = None
    if company:
        cid = company.get("id") or company.get("company_id")
    if not cid:
        ctx = get_tenant_context()
        cid = ctx.company_id if ctx else None
    if company is None and cid:
        company = await get_company_doc(cid)

    if is_reamarc_company(cid):
        return {
            "from_name": settings.SMTP_FROM_NAME,
            "reply_to": None,
            "company_name": (company or {}).get("name") or settings.SMTP_FROM_NAME,
            "logo_url": (company or {}).get("logo_url"),
            "accent_color": (company or {}).get("accent_color") or "#4f46e5",
            "_reamarc": True,
        }

    from app.services.company_branding import brand_name_of

    company_name = brand_name_of(company) if company else sanitize_from_name("")
    from_name = sanitize_from_name(company_name)
    reply_to = _valid_reply_to(
        (company or {}).get("contact_email") or (company or {}).get("support_email")
    )
    if not reply_to and cid:
        reply_to = _valid_reply_to(await company_admin_reply_email(cid))
    return {
        "from_name": from_name,
        "reply_to": reply_to,
        "company_name": from_name,
        "logo_url": (company or {}).get("logo_url"),
        "accent_color": (company or {}).get("accent_color") or "#4f46e5",
        "_reamarc": False,
    }


async def _company_custom_smtp(company: Optional[dict]) -> Optional[dict]:
    from app.core.integrations import current_company_id, get_integration, is_reamarc_company

    cid = (company or {}).get("id") or current_company_id()
    if is_reamarc_company(cid):
        return None
    integ = await get_integration(company=company, kind="smtp")
    if integ and integ.get("connected"):
        return integ
    return None


async def _dispatch_outbound(
    recipient_email: str,
    recipient_name: str,
    subject: str,
    html: str,
    *,
    company: Optional[dict] = None,
    from_name: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    integ = await _company_custom_smtp(company)
    if integ:
        return await asyncio.to_thread(
            _send_custom_smtp_sync, integ, recipient_email, subject, html, from_name, reply_to
        )
    if settings.BREVO_API_KEY and settings.BREVO_API_KEY.strip():
        try:
            if await _send_brevo_http(
                recipient_email, recipient_name, subject, html, from_name=from_name, reply_to=reply_to
            ):
                return True
        except Exception as e:
            logger.warning(f"Brevo dispatch failed for {recipient_email}, attempting fallback: {e}")
    if settings.RESEND_API_KEY and settings.RESEND_API_KEY.strip():
        try:
            if await _send_resend_http(
                recipient_email, subject, html, from_name=from_name, reply_to=reply_to
            ):
                return True
        except Exception as e:
            logger.warning(f"Resend dispatch failed for {recipient_email}, attempting fallback: {e}")
    if settings.SENDGRID_API_KEY and settings.SENDGRID_API_KEY.strip():
        try:
            if await _send_sendgrid_http(
                recipient_email, subject, html, from_name=from_name, reply_to=reply_to
            ):
                return True
        except Exception as e:
            logger.warning(f"SendGrid dispatch failed for {recipient_email}, attempting fallback: {e}")
    try:
        return await asyncio.to_thread(
            _send_smtp_sync, recipient_email, subject, html, from_name, reply_to
        )
    except Exception as e:
        logger.error(f"SMTP dispatch fallback error for {recipient_email}: {e}")
        return False


def _build_reminder_html(
    recipient_name: str,
    missing_dates: List[str],
    custom_message: Optional[str] = None,
    action_url: Optional[str] = None,
    company_name: Optional[str] = None,
    accent_color: Optional[str] = None,
    logo_url: Optional[str] = None,
) -> str:
    app_url = action_url or f"{settings.APP_FRONTEND_URL}/daily-log"
    missing_dates_formatted = ", ".join(missing_dates) if missing_dates else "today"
    brand_name = company_name or settings.SMTP_FROM_NAME
    color = accent_color or "#4f46e5"
    logo_html = _logo_block(logo_url, brand_name)
    custom_note_block = (
        f"""<div style="background-color: #f4f4f5; border-left: 4px solid {color}; padding: 12px 16px; margin: 16px 0; border-radius: 6px; font-size: 13px; color: #3f3f46;">
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
    <div style="background: linear-gradient(135deg, {color} 0%, {color} 100%); padding: 28px 24px; text-align: left;">
      {logo_html}      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em;">
        {brand_name}
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
        <a href="{app_url}" style="display: inline-block; background-color: {color}; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 10px; box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);">
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
        &copy; {datetime.now().year} {brand_name}. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>"""


def _build_password_reset_html(
    recipient_name: str,
    code: str,
    identity: Optional[Dict[str, Any]] = None,
) -> str:
    if identity and not identity.get("_reamarc"):
        brand = identity.get("company_name") or settings.SMTP_FROM_NAME
        color = identity.get("accent_color") or "#4f46e5"
        logo_html = _logo_block(identity.get("logo_url"), brand)
        return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fafafa; margin: 0; padding: 24px 12px; color: #18181b;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, {color} 0%, {color} 100%); padding: 28px 24px; text-align: left;">
      {logo_html}
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em;">
        {brand}
      </h1>
      <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px;">
        Account Security &amp; Password Reset
      </p>
    </div>
    <div style="padding: 32px 28px;">
      <h2 style="font-size: 16px; font-weight: 700; color: #18181b; margin-top: 0;">
        Hi {recipient_name},
      </h2>
      <p style="font-size: 14px; line-height: 1.6; color: #52525b; margin: 12px 0 20px 0;">
        We received a request to reset your password for your {brand} account. Use the 6-digit verification code below to set a new password:
      </p>
      <div style="background-color: #eef2ff; border: 2px dashed {color}; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
        <span style="font-size: 11px; font-weight: 700; color: #4338ca; text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 8px;">
          Verification Code
        </span>
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 0.3em; color: {color}; font-family: 'Courier New', Courier, monospace; display: inline-block;">
          {code}
        </span>
        <p style="font-size: 12px; color: {color}; margin: 8px 0 0 0; font-weight: 500;">
          Expires in 10 minutes (5 attempts maximum)
        </p>
      </div>
      <div style="background-color: #f8fafc; border-left: 4px solid #94a3b8; padding: 12px 16px; margin: 20px 0; border-radius: 6px; font-size: 12px; color: #64748b; line-height: 1.5;">
        <strong>Security Notice:</strong> If you did not request a password reset, please ignore this email or reach out to your administrator. Your password will remain unchanged.
      </div>
      <p style="font-size: 11px; color: #a1a1aa; text-align: center; margin: 24px 0 0 0;">
        This automated security verification was sent by {brand}.
      </p>
    </div>
    <div style="background-color: #f4f4f5; padding: 16px 24px; text-align: center; border-top: 1px solid #e4e4e7;">
      <p style="font-size: 11px; color: #71717a; margin: 0;">
        &copy; {datetime.now().year} {brand}. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>"""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fafafa; margin: 0; padding: 24px 12px; color: #18181b;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 28px 24px; text-align: left;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em;">
        {settings.SMTP_FROM_NAME}
      </h1>
      <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px;">
        Account Security &amp; Password Reset
      </p>
    </div>

    <!-- Body Content -->
    <div style="padding: 32px 28px;">
      <h2 style="font-size: 16px; font-weight: 700; color: #18181b; margin-top: 0;">
        Hi {recipient_name},
      </h2>
      <p style="font-size: 14px; line-height: 1.6; color: #52525b; margin: 12px 0 20px 0;">
        We received a request to reset your password for your Reamarc AI account. Use the 6-digit verification code below to set a new password:
      </p>

      <!-- 6-digit OTP Code Box -->
      <div style="background-color: #eef2ff; border: 2px dashed #6366f1; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
        <span style="font-size: 11px; font-weight: 700; color: #4338ca; text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 8px;">
          Verification Code
        </span>
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 0.3em; color: #4f46e5; font-family: 'Courier New', Courier, monospace; display: inline-block;">
          {code}
        </span>
        <p style="font-size: 12px; color: #6366f1; margin: 8px 0 0 0; font-weight: 500;">
          Expires in 10 minutes (5 attempts maximum)
        </p>
      </div>

      <div style="background-color: #f8fafc; border-left: 4px solid #94a3b8; padding: 12px 16px; margin: 20px 0; border-radius: 6px; font-size: 12px; color: #64748b; line-height: 1.5;">
        <strong>Security Notice:</strong> If you did not request a password reset, please ignore this email or reach out to your administrator. Your password will remain unchanged.
      </div>

      <p style="font-size: 11px; color: #a1a1aa; text-align: center; margin: 24px 0 0 0;">
        This automated security verification was sent by {settings.PROJECT_NAME}.
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


async def _send_resend_http(
    recipient_email: str,
    subject: str,
    html_content: str,
    from_name: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """Dispatches email via Resend HTTPS REST API (Bypasses all firewall port blocking)."""
    sender = settings.SMTP_FROM_EMAIL or "onboarding@resend.dev"
    display = from_name if from_name is not None else settings.SMTP_FROM_NAME
    from_header = f"{display} <{sender}>" if display else sender
    payload = {
        "from": from_header,
        "to": [recipient_email],
        "subject": subject,
        "html": html_content,
    }
    if reply_to:
        payload["reply_to"] = reply_to
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
    from_name: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """Dispatches email via Brevo HTTPS REST API."""
    sender_email = (settings.SMTP_FROM_EMAIL or settings.SMTP_USER or "").strip()
    if not sender_email:
        raise ValueError("SMTP_FROM_EMAIL or SMTP_USER must be configured for Brevo email delivery")
    if "@resend.dev" in sender_email and settings.SMTP_USER:
        sender_email = settings.SMTP_USER.strip()
    display = from_name if from_name is not None else settings.SMTP_FROM_NAME
    payload = {
        "sender": {"name": display, "email": sender_email},
        "to": [{"email": recipient_email, "name": recipient_name}],
        "subject": subject,
        "htmlContent": html_content,
    }
    if reply_to:
        payload["replyTo"] = {"email": reply_to}
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
    from_name: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """Dispatches email via SendGrid HTTPS REST API."""
    sender_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER or "noreply@reamarc.com"
    display = from_name if from_name is not None else settings.SMTP_FROM_NAME
    payload = {
        "personalizations": [{"to": [{"email": recipient_email}]}],
        "from": {"email": sender_email, "name": display},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_content}],
    }
    if reply_to:
        payload["reply_to"] = {"email": reply_to}
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
    from_name: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """Synchronous SMTP email delivery with simulated log fallback if unconfigured."""
    sender_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    if not sender_email or not settings.SMTP_PASSWORD:
        logger.info(
            f"[NOTIFICATION RECORD] Email to: {recipient_email} | Subject: '{subject}' | Content: {html_content[:180]}..."
        )
        return True

    display = from_name if from_name is not None else settings.SMTP_FROM_NAME
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((display or "", sender_email))
    msg["To"] = recipient_email
    if reply_to:
        msg["Reply-To"] = reply_to

    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            if settings.SMTP_TLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
            logger.info(f"Successfully dispatched email to {recipient_email}")
            return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_email}: {str(e)}")
        # If external SMTP fails (e.g. invalid credentials or network timeout), log the notification record so user operation doesn't crash
        logger.info(
            f"[NOTIFICATION RECORD (FALLBACK)] Email to: {recipient_email} | Subject: '{subject}'"
        )
        return False


def _send_custom_smtp_sync(
    smtp_cfg: dict,
    recipient_email: str,
    subject: str,
    html_content: str,
    from_name: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    host = smtp_cfg.get("host")
    port = int(smtp_cfg.get("port") or 587)
    user = smtp_cfg.get("user")
    password = smtp_cfg.get("password")
    from_name = from_name or smtp_cfg.get("from_name") or "Notifications"
    from_email = smtp_cfg.get("from_email") or user

    if not host or not user or not password:
        logger.info(
            f"[NOTIFICATION RECORD] Email to: {recipient_email} | Subject: '{subject}' | Content: {html_content[:180]}..."
        )
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name or "", from_email))
    msg["To"] = recipient_email
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            server.login(user, password)
            server.send_message(msg)
            logger.info(f"Successfully dispatched email via custom SMTP to {recipient_email}")
            return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_email} via custom SMTP: {e}")
        return False


class EmailService:
    @staticmethod
    async def send_log_reminder(
        recipient_email: Optional[str] = None,
        recipient_name: Optional[str] = None,
        missing_dates: Optional[List[str]] = None,
        custom_message: Optional[str] = None,
        action_url: Optional[str] = None,
        to_email: Optional[str] = None,
        user_name: Optional[str] = None,
        company: Optional[Dict] = None,
        **kwargs,
    ) -> bool:
        """Asynchronously dispatches a branded Daily Log reminder email."""
        target_email = recipient_email or to_email
        target_name = recipient_name or user_name or "Team Member"
        dates = missing_dates if (missing_dates is not None and len(missing_dates) > 0) else [datetime.now(timezone.utc).strftime("%Y-%m-%d")]

        if not target_email:
            logger.error("No recipient email provided for log reminder.")
            return False

        from app.database import get_database
        db = get_database()
        if db is not None:
            from app.services.access import is_tracked
            from app.core.mongo_filters import exact_ci
            from app.services.company_members import company_member_users
            found = await company_member_users(
                {"email": exact_ci(target_email)},
                db=db,
                projection={"_id": 0, "hashed_password": 0},
                include_needs_setup=True,
                limit=1,
            )
            u = found[0] if found else None
            if u and not is_tracked(u, "daily_log"):
                logger.info(f"Skipping log reminder for {target_email}: daily_log is off for this account.")
                return False

        identity = await resolve_sender_identity(company)
        dates_str = ", ".join(dates)
        subject = f"Reminder: Please submit your Daily Log ({dates_str})"
        if identity.get("_reamarc"):
            html = _build_reminder_html(
                recipient_name=target_name,
                missing_dates=dates,
                custom_message=custom_message,
                action_url=action_url,
                company_name=(company or {}).get("name"),
                accent_color=(company or {}).get("accent_color"),
                logo_url=None,
            )
        else:
            html = _build_reminder_html(
                recipient_name=target_name,
                missing_dates=dates,
                custom_message=custom_message,
                action_url=action_url,
                company_name=identity.get("company_name"),
                accent_color=identity.get("accent_color"),
                logo_url=identity.get("logo_url"),
            )
        return await _dispatch_outbound(
            target_email,
            target_name,
            subject,
            html,
            company=company,
            from_name=identity.get("from_name"),
            reply_to=identity.get("reply_to"),
        )

    @staticmethod
    async def send_password_reset_code(
        recipient_email: str,
        code: str,
        recipient_name: Optional[str] = None,
        company: Optional[Dict] = None,
    ) -> bool:
        """Asynchronously dispatches a branded Password Reset verification code email."""
        if not recipient_email:
            logger.error("No recipient email provided for password reset code.")
            return False

        identity = await resolve_sender_identity(company)
        target_name = recipient_name or "User"
        if identity.get("_reamarc"):
            subject = f"{code} is your Reamarc AI password reset code"
        else:
            subject = f"{code} is your {identity.get('company_name')} password reset code"
        html = _build_password_reset_html(
            recipient_name=target_name,
            code=code,
            identity=identity,
        )
        return await _dispatch_outbound(
            recipient_email,
            target_name,
            subject,
            html,
            company=company,
            from_name=identity.get("from_name"),
            reply_to=identity.get("reply_to"),
        )

    @staticmethod
    async def send_html_email(
        recipient_email: str,
        subject: str,
        html: str,
        recipient_name: Optional[str] = None,
        company: Optional[Dict] = None,
    ) -> bool:
        if not recipient_email:
            return False
        target_name = recipient_name or "there"
        identity = await resolve_sender_identity(company)
        return await _dispatch_outbound(
            recipient_email,
            target_name,
            subject,
            html,
            company=company,
            from_name=identity.get("from_name"),
            reply_to=identity.get("reply_to"),
        )
