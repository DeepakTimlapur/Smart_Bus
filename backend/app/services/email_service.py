import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from typing import Dict, Any
from backend.app.config import (
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USERNAME,
    SMTP_PASSWORD,
    SMTP_FROM,
    FRONTEND_URL,
)
from backend.app.db import persist_mock_data

logger = logging.getLogger("smart_bus.email")


def send_student_credentials(
    student_name: str,
    student_id: str,
    email: str,
    temp_password: str,
    db: Any,
) -> Dict[str, Any]:
    """
    Delivers temporary student login credentials via SMTP or development logging.
    Records every attempt in the MongoDB 'email_logs' collection.
    Returns status and clear descriptive message for UI display.
    """
    login_url = f"{FRONTEND_URL.rstrip('/')}/login"
    timestamp = datetime.now(timezone.utc).isoformat()

    # If SMTP is not configured: Enter safe DEVELOPMENT MODE
    if not SMTP_HOST or not SMTP_USERNAME:
        banner = (
            "\n"
            + "=" * 55 + "\n"
            + " [DEV MODE] STUDENT CREDENTIALS DISPATCH\n"
            + "=" * 55 + "\n"
            + f" Student Name:       {student_name}\n"
            + f" Student ID:         {student_id}\n"
            + f" Login Email:        {email}\n"
            + f" Temporary Password: {temp_password}\n"
            + f" Portal URL:         {login_url}\n"
            + f" Security:           Change password upon first sign-in\n"
            + "=" * 55 + "\n"
        )
        print(banner, flush=True)
        logger.info(f"Student credentials logged for {student_id} ({email}) in dev mode.")

        # Record in MongoDB email_logs
        log_record = {
            "student_id": student_id,
            "student_name": student_name,
            "email": email,
            "subject": "Smart Bus Transit - Student Login Credentials",
            "status": "DEV_MODE_LOGGED",
            "provider": "LOCAL_CONSOLE",
            "timestamp": timestamp,
            "temp_password_hint": f"{temp_password[:2]}***{temp_password[-2:]}" if len(temp_password) >= 4 else "***",
            "created_at": timestamp,
        }
        try:
            db.email_logs.insert_one(log_record)
            persist_mock_data()
        except Exception as e:
            logger.warning(f"Could not write to email_logs: {e}")

        return {
            "delivered": False,
            "dev_mode": True,
            "status": "DEV_MODE_LOGGED",
            "message": f"Student account created. Login credentials displayed in backend console (SMTP not configured in .env).",
            "temp_password": temp_password,
        }

    # Real SMTP Dispatch
    subject = "Smart Bus Transit OS - Your Student Account Credentials"
    text_content = f"""
Smart Bus Transit System
==================================================
Welcome, {student_name}!

Your student transit account has been generated. Use the credentials below to log into the Smart Bus Transit portal:

Student ID: {student_id}
Username / Email: {email}
Temporary Password: {temp_password}

Login URL: {login_url}

IMPORTANT SECURITY NOTICE:
Please log in immediately and update your password under your profile settings.

For assistance, contact the Campus Transport Management office.
==================================================
"""

    html_content = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Smart Bus Transit Credentials</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f6f9; padding: 24px;">
  <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background-color: #0f172a; padding: 24px; text-align: center; color: #ffffff;">
      <h2 style="margin: 0; font-size: 22px; letter-spacing: -0.5px;">Smart Bus Transit OS</h2>
      <p style="margin: 6px 0 0; color: #94a3b8; font-size: 14px;">Campus Intelligent Fleet & Transport</p>
    </div>
    <div style="padding: 28px;">
      <h3 style="margin-top: 0; color: #1e293b;">Welcome, {student_name}</h3>
      <p style="color: #475569; font-size: 15px; line-height: 1.5;">
        Your student portal account is now active. You can now view your assigned route, live bus locations, driver details, and fee statements in real time.
      </p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <div style="margin-bottom: 8px;"><strong style="color: #64748b; font-size: 13px; text-transform: uppercase;">Student ID:</strong> <span style="font-family: monospace; font-size: 15px; font-weight: 600; color: #0f172a;">{student_id}</span></div>
        <div style="margin-bottom: 8px;"><strong style="color: #64748b; font-size: 13px; text-transform: uppercase;">Login Email:</strong> <span style="font-family: monospace; font-size: 15px; color: #0f172a;">{email}</span></div>
        <div><strong style="color: #64748b; font-size: 13px; text-transform: uppercase;">Temporary Password:</strong> <span style="background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-weight: 700; font-size: 16px;">{temp_password}</span></div>
      </div>

      <div style="text-align: center; margin: 26px 0;">
        <a href="{login_url}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; border-radius: 8px; font-size: 15px;">Log in to Transit Portal &rarr;</a>
      </div>

      <p style="color: #dc2626; font-size: 13px; line-height: 1.4; border-left: 3px solid #dc2626; padding-left: 10px; margin: 18px 0;">
        <strong>Security Notice:</strong> You are required to update your temporary password immediately upon your first sign-in.
      </p>
    </div>
    <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
      Smart Bus Fleet Management System &bull; Campus Transit Department
    </div>
  </div>
</body>
</html>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = email
    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12) as server:
            server.starttls()
            if SMTP_USERNAME and SMTP_PASSWORD:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [email], msg.as_string())

        logger.info(f"Successfully dispatched credentials email to {email} for student {student_id}")

        # Log success
        db.email_logs.insert_one({
            "student_id": student_id,
            "student_name": student_name,
            "email": email,
            "subject": subject,
            "status": "DELIVERED",
            "provider": "SMTP",
            "timestamp": timestamp,
            "created_at": timestamp,
        })
        persist_mock_data()

        return {
            "delivered": True,
            "dev_mode": False,
            "status": "DELIVERED",
            "message": f"Login credentials successfully sent to student email ({email}).",
            "temp_password": temp_password,
        }

    except Exception as exc:
        error_msg = str(exc)
        logger.error(f"Failed to send credentials email via SMTP to {email}: {error_msg}")

        # Log failure
        db.email_logs.insert_one({
            "student_id": student_id,
            "student_name": student_name,
            "email": email,
            "subject": subject,
            "status": "FAILED",
            "error": error_msg,
            "provider": "SMTP",
            "timestamp": timestamp,
            "created_at": timestamp,
        })
        persist_mock_data()

        return {
            "delivered": False,
            "dev_mode": False,
            "status": "FAILED",
            "message": f"Student created, but email delivery failed: {error_msg}",
            "temp_password": temp_password,
        }
