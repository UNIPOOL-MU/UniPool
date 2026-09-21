"""
Email helper functions.
Contains utilities for sending emails via SendGrid and other providers.
"""

import httpx
from datetime import datetime, timezone, timedelta
from config.settings import (
    SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, EMAIL_FROM_NAME,
    RESEND_API_KEY, RESEND_FROM_EMAIL, GMAIL_ADDRESS, GMAIL_APP_PASSWORD
)
import logging

logger = logging.getLogger("unipool.email")

async def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """
    Send an email using the best available email service.
    Tries SendGrid first, falls back to other services if needed.

    Args:
        to_email: Recipient email address
        subject: Email subject line
        html_content: HTML content of the email

    Returns:
        True if email was sent successfully, False otherwise
    """
    # Try SendGrid first (primary choice as SMTP is blocked on Render)
    if SENDGRID_API_KEY and SENDGRID_FROM_EMAIL:
        return await _send_via_sendgrid(to_email, subject, html_content)

    # Fallback to Resend if configured
    if RESEND_API_KEY and RESEND_FROM_EMAIL:
        return await _send_via_resend(to_email, subject, html_content)

    # Fallback to Gmail SMTP (may not work on Render due to port blocking)
    if GMAIL_ADDRESS and GMAIL_APP_PASSWORD:
        return await _send_via_gmail_smtp(to_email, subject, html_content)

    logger.warning("No email service configured. Email not sent.")
    return False

async def _send_via_sendgrid(to_email: str, subject: str, html_content: str) -> bool:
    """
    Send email via SendGrid HTTP API.

    Args:
        to_email: Recipient email address
        subject: Email subject line
        html_content: HTML content of the email

    Returns:
        True if email was sent successfully, False otherwise
    """
    try:
        payload = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": SENDGRID_FROM_EMAIL, "name": EMAIL_FROM_NAME},
            "subject": subject,
            "content": [{"type": "text/html", "value": html_content}],
        }

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={
                    "Authorization": f"Bearer {SENDGRID_API_KEY}",
                    "Content-Type": "application/json"
                }
            )
            if response.status_code == 202:
                return True
            else:
                logger.error(f"SendGrid API returned {response.status_code}: {response.text}")
                return False
    except Exception as e:
        logger.error(f"SendGrid email failed: {e}")
        return False

async def _send_via_resend(to_email: str, subject: str, html_content: str) -> bool:
    """
    Send email via Resend HTTP API.

    Args:
        to_email: Recipient email address
        subject: Email subject line
        html_content: HTML content of the email

    Returns:
        True if email was sent successfully, False otherwise
    """
    try:
        payload = {
            "from": f"{EMAIL_FROM_NAME} <{RESEND_FROM_EMAIL}>",
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json"
                }
            )
            if response.status_code == 200:
                return True
            else:
                # Log the error response for debugging
                logger.error(
                    f"Resend API returned {response.status_code}: {response.text}. "
                    f"Check that RESEND_API_KEY is valid and RESEND_FROM_EMAIL is verified in Resend account."
                )
                return False
    except Exception as e:
        logger.error(f"Resend email failed: {e}")
        return False

async def _send_via_gmail_smtp(to_email: str, subject: str, html_content: str) -> bool:
    """
    Send email via Gmail SMTP (fallback option).

    Note: This may not work on Render.com due to outbound SMTP port blocking.

    Args:
        to_email: Recipient email address
        subject: Email subject line
        html_content: HTML content of the email

    Returns:
        True if email was sent successfully, False otherwise
    """
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart()
        msg['From'] = GMAIL_ADDRESS
        msg['To'] = to_email
        msg['Subject'] = subject

        msg.attach(MIMEText(html_content, 'html'))

        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        text = msg.as_string()
        server.sendmail(GMAIL_ADDRESS, to_email, text)
        server.quit()

        return True
    except Exception as e:
        logger.error(f"Gmail SMTP email failed: {e}")
        return False

# Email template functions
def match_email_html(recipient_name: str, match: dict, own: dict) -> str:
    """
    Generate HTML email content for pool match notifications.

    Args:
        recipient_name: Name of the recipient
        match: Dictionary containing matched pool information
        own: Dictionary containing recipient's own pool information

    Returns:
        HTML string for the email
    """
    from services.auth_service import _fmt_ist
    return f"""
    <html><body style="font-family:Arial,sans-serif;background:#FFF9F2;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <tr><td style="background:#1A237E;padding:20px 24px;color:#FFECC2;">
          <div style="font-size:22px;font-weight:700;color:#FF9933;">UniPool</div>
          <div style="font-size:14px;opacity:0.9;">A fellow traveller matched your route</div>
        </td></tr>
        <tr><td style="padding:24px;color:#1C1917;">
          <p>Namaste {recipient_name},</p>
          <p>Good news — someone on UniPool just posted a cab-pool request that overlaps with yours within a 1-hour window.</p>
          <table cellpadding="8" cellspacing="0" style="background:#FFECC2;border-radius:12px;width:100%;margin:12px 0;">
            <tr><td><b>{match['user_name']}</b><br/>{match['from_location']} → {match['to_location']}<br/>
            <span style="color:#B05C00;">{_fmt_ist(match['travel_datetime'])}</span><br/>
            Reply to: <a href="mailto:{match['user_email']}">{match['user_email']}</a></td></tr>
          </table>
          <p style="color:#3D352F;font-size:13px;">Your request: {own['from_location']} → {own['to_location']} at {_fmt_ist(own['travel_datetime'])}</p>
          <p>Reach out and split the fare. Safe travels!</p>
          <p style="color:#B05C00;font-weight:600;">— Team UniPool</p>
        </td></tr>
      </table>
    </body></html>
    """

def join_request_email_html(recipient_name: str, requester_name: str, pool: dict, action: str) -> str:
    """
    Generate HTML email content for join request notifications.

    Args:
        recipient_name: Name of the recipient (pool owner or requester)
        requester_name: Name of the requester
        pool: Dictionary containing pool information
        action: Either 'received' (owner got request) or 'accepted' (requester got accepted)

    Returns:
        HTML string for the email
    """
    if action == "received":
        heading = "New ride request"
        body = f"<b>{requester_name}</b> wants to travel with you on this pool:"
    else:
        heading = "Request accepted!"
        body = f"<b>{pool['user_name']}</b> accepted your request to travel together:"

    from services.auth_service import _fmt_ist
    return f"""
    <html><body style="font-family:Arial,sans-serif;background:#FFF9F2;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <tr><td style="background:#1A237E;padding:20px 24px;color:#FFECC2;">
          <div style="font-size:22px;font-weight:700;color:#FF9933;">UniPool</div>
        </td></tr>
        <tr><td style="padding:24px;color:#1C1917;">
          <p>Namaste {recipient_name},</p>
          <p>{body}</p>
          <table cellpadding="8" cellspacing="0" style="background:#FFECC2;border-radius:12px;width:100%;margin:12px 0;">
            <tr><td><b>{pool['user_name']}</b><br/>{pool['from_location']} → {pool['to_location']}<br/>
            <span style="color:#B05C00;">{_fmt_ist(pool['travel_datetime'])}</span><br/>
            Reply to: <a href="mailto:{pool['user_email']}">{pool['user_email']}</a></td></tr>
          </table>
          <p style="color:#B05C00;font-weight:600;">— Team UniPool</p>
        </td></tr>
      </table>
    </body></html>
    """

def college_verification_email_html(code: str, email: str) -> str:
    """
    Generate HTML email content for college verification code.

    Args:
        code: 6-digit verification code
        email: College email address

    Returns:
        HTML string for the email
    """
    return f"""
    <html><body style="font-family:Arial,sans-serif;background:#FFF9F2;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <tr><td style="background:#1A237E;padding:20px 24px;color:#FFECC2;">
          <div style="font-size:22px;font-weight:700;color:#FF9933;">UniPool</div>
          <div style="font-size:14px;opacity:0.9;">College ID Verification</div>
        </td></tr>
        <tr><td style="padding:24px;color:#1C1917;">
          <p>Namaste,</p>
          <p>Your college verification code is:</p>
          <h1 style="background:#FFECC2;padding:20px;text-align:center;font-size:32px;letter-spacing:8px;font-weight:bold;color:#B05C00;">
            {code}
          </h1>
          <p>Please enter this code in the UniPool app to verify your college ID:</p>
          <p><code>{email}</code></p>
          <p>This code will expire in 15 minutes.</p>
          <p>If you didn't request this verification, please ignore this email.</p>
          <p style="color:#B05C00;font-weight:600;">— Team UniPool</p>
        </td></tr>
      </table>
    </body></html>
    """

def signup_verification_email_html(code: str, email: str) -> str:
    """Generate the six-digit verification email for a normal UniPool signup."""
    safe_email = (email or "").strip()
    return f"""
    <!doctype html>
    <html><body style="font-family:Arial,sans-serif;background:#f6f8fb;padding:24px;color:#10214A">
      <div style="max-width:560px;margin:auto;background:white;border-radius:16px;padding:28px">
        <h2 style="margin-top:0">Verify your UniPool email</h2>
        <p>Use this code to finish creating the account for <strong>{safe_email}</strong>.</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;margin:24px 0">{code}</div>
        <p>This code expires in 15 minutes. If you did not try to create a UniPool account, you can ignore this email.</p>
      </div>
    </body></html>
    """
