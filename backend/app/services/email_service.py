import asyncio
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional
from datetime import datetime, timezone
import httpx
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


def _build_password_reset_html(
    recipient_name: str,
    code: str,
) -> str:
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
    """Synchronous SMTP email delivery with simulated log fallback if unconfigured."""
    sender_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    if not sender_email or not settings.SMTP_PASSWORD:
        logger.info(
            f"[NOTIFICATION RECORD] Email to: {recipient_email} | Subject: '{subject}' | Content: {html_content[:180]}..."
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
            logger.info(f"Successfully dispatched email to {recipient_email}")
            return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_email}: {str(e)}")
        # If external SMTP fails (e.g. invalid credentials or network timeout), log the notification record so user operation doesn't crash
        logger.info(
            f"[NOTIFICATION RECORD (FALLBACK)] Email to: {recipient_email} | Subject: '{subject}'"
        )
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
        **kwargs,
    ) -> bool:
        """Asynchronously dispatches a branded Daily Log reminder email."""
        target_email = recipient_email or to_email
        target_name = recipient_name or user_name or "Team Member"
        dates = missing_dates if (missing_dates is not None and len(missing_dates) > 0) else [datetime.now(timezone.utc).strftime("%Y-%m-%d")]

        if not target_email:
            logger.error("No recipient email provided for log reminder.")
            return False

        dates_str = ", ".join(dates)
        subject = f"Reminder: Please submit your Daily Log ({dates_str})"
        html = _build_reminder_html(
            recipient_name=target_name,
            missing_dates=dates,
            custom_message=custom_message,
            action_url=action_url,
        )

        # Cascade through configured HTTP REST providers, then fallback to SMTP
        if settings.RESEND_API_KEY and settings.RESEND_API_KEY.strip():
            try:
                resend_ok = await _send_resend_http(target_email, subject, html)
                if resend_ok:
                    return True
            except Exception as e:
                logger.warning(f"Resend dispatch failed for {target_email}, attempting fallback: {e}")

        if settings.BREVO_API_KEY and settings.BREVO_API_KEY.strip():
            try:
                brevo_ok = await _send_brevo_http(target_email, target_name, subject, html)
                if brevo_ok:
                    return True
            except Exception as e:
                logger.warning(f"Brevo dispatch failed for {target_email}, attempting fallback: {e}")

        if settings.SENDGRID_API_KEY and settings.SENDGRID_API_KEY.strip():
            try:
                sendgrid_ok = await _send_sendgrid_http(target_email, subject, html)
                if sendgrid_ok:
                    return True
            except Exception as e:
                logger.warning(f"SendGrid dispatch failed for {target_email}, attempting fallback: {e}")

        # Fallback: Standard SMTP
        try:
            return await asyncio.to_thread(_send_smtp_sync, target_email, subject, html)
        except Exception as e:
            logger.error(f"SMTP dispatch fallback error for {target_email}: {e}")
            return False

    @staticmethod
    async def send_password_reset_code(
        recipient_email: str,
        code: str,
        recipient_name: Optional[str] = None,
    ) -> bool:
        """Asynchronously dispatches a branded Password Reset verification code email."""
        if not recipient_email:
            logger.error("No recipient email provided for password reset code.")
            return False

        target_name = recipient_name or "User"
        subject = f"{code} is your Reamarc AI password reset code"
        html = _build_password_reset_html(
            recipient_name=target_name,
            code=code,
        )

        # Cascade through configured HTTP REST providers, then fallback to SMTP
        if settings.RESEND_API_KEY and settings.RESEND_API_KEY.strip():
            try:
                resend_ok = await _send_resend_http(recipient_email, subject, html)
                if resend_ok:
                    return True
            except Exception as e:
                logger.warning(f"Resend dispatch failed for {recipient_email}, attempting fallback: {e}")

        if settings.BREVO_API_KEY and settings.BREVO_API_KEY.strip():
            try:
                brevo_ok = await _send_brevo_http(recipient_email, target_name, subject, html)
                if brevo_ok:
                    return True
            except Exception as e:
                logger.warning(f"Brevo dispatch failed for {recipient_email}, attempting fallback: {e}")

        if settings.SENDGRID_API_KEY and settings.SENDGRID_API_KEY.strip():
            try:
                sendgrid_ok = await _send_sendgrid_http(recipient_email, subject, html)
                if sendgrid_ok:
                    return True
            except Exception as e:
                logger.warning(f"SendGrid dispatch failed for {recipient_email}, attempting fallback: {e}")

        # Fallback: Standard SMTP
        try:
            return await asyncio.to_thread(_send_smtp_sync, recipient_email, subject, html)
        except Exception as e:
            logger.error(f"SMTP dispatch fallback error for {recipient_email}: {e}")
            return False
