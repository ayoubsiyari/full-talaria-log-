import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends

from ..db import get_db
from ..deps import get_current_user
from ..models import BootcampRegistration, User
from ..schemas import BootcampRegisterIn
from ..settings import settings

logger = logging.getLogger(__name__)


def _send_registration_email(reg: BootcampRegistration) -> None:
    """Send email notification for new registration."""
    if not all([settings.smtp_host, settings.smtp_user, settings.smtp_password, settings.notification_email]):
        logger.info("Email settings not configured, skipping notification")
        return

    subject = f"New Mentorship Registration: {reg.full_name}"
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #1a1a2e; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">🎓 New Mentorship Registration</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <tr style="background: #f8f9fa;">
                    <td style="padding: 12px; font-weight: bold; color: #666;">Name:</td>
                    <td style="padding: 12px; color: #1a1a2e;">{reg.full_name}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; font-weight: bold; color: #666;">Email:</td>
                    <td style="padding: 12px; color: #1a1a2e;"><a href="mailto:{reg.email}">{reg.email}</a></td>
                </tr>
                <tr style="background: #f8f9fa;">
                    <td style="padding: 12px; font-weight: bold; color: #666;">Phone:</td>
                    <td style="padding: 12px; color: #1a1a2e;">{reg.phone or 'Not provided'}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; font-weight: bold; color: #666;">Country:</td>
                    <td style="padding: 12px; color: #1a1a2e;">{reg.country}</td>
                </tr>
                <tr style="background: #f8f9fa;">
                    <td style="padding: 12px; font-weight: bold; color: #666;">Age:</td>
                    <td style="padding: 12px; color: #1a1a2e;">{reg.age}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; font-weight: bold; color: #666;">Discord:</td>
                    <td style="padding: 12px; color: #1a1a2e;">{reg.discord}</td>
                </tr>
                <tr style="background: #f8f9fa;">
                    <td style="padding: 12px; font-weight: bold; color: #666;">Telegram:</td>
                    <td style="padding: 12px; color: #1a1a2e;">{reg.telegram or 'Not provided'}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; font-weight: bold; color: #666;">Instagram:</td>
                    <td style="padding: 12px; color: #1a1a2e;">{reg.instagram or 'Not provided'}</td>
                </tr>
            </table>
            
            <p style="margin-top: 25px; padding: 15px; background: #e8f4f8; border-radius: 5px; color: #1a1a2e;">
                <strong>Reply directly to this email</strong> to contact the applicant at <a href="mailto:{reg.email}">{reg.email}</a>
            </p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email or settings.smtp_user
    msg["To"] = settings.notification_email
    msg["Reply-To"] = reg.email  # Allow replying directly to the applicant

    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


def _send_user_confirmation_email(reg: BootcampRegistration) -> None:
    """Send confirmation email to the user who registered."""
    if not all([settings.smtp_host, settings.smtp_user, settings.smtp_password]):
        logger.info("Email settings not configured, skipping user confirmation")
        return

    subject = "مرحباً بك في برنامج Talaria للمنتورشيب - تم تأكيد التسجيل"
    
    html_body = f"""
    <html dir="rtl">
    <body style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; background-color: #1a1a2e; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f0f23; border-radius: 15px; padding: 30px; border: 1px solid #3730a3; direction: rtl; text-align: right;">
            <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎓 Talaria Mentorship 2026</h1>
                <p style="color: #a5b4fc; margin-top: 5px;">تم تأكيد التسجيل</p>
            </div>
            
            <p style="color: #e0e7ff; font-size: 16px; line-height: 1.8;">
                عزيزي <strong style="color: #ffffff;">{reg.full_name}</strong>،
            </p>
            
            <p style="color: #c7d2fe; font-size: 15px; line-height: 1.8;">
                شكراً لتسجيلك في برنامج Talaria للمنتورشيب! تم استلام طلبك وهو قيد المراجعة.
            </p>
            
            <div style="background-color: #1e1b4b; border-radius: 10px; padding: 20px; margin: 25px 0; border: 1px solid #3730a3;">
                <h3 style="color: #a5b4fc; margin-top: 0; font-size: 16px;">تفاصيل التسجيل</h3>
                <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                    <tr>
                        <td style="padding: 8px 0; color: #94a3b8; font-size: 14px; width: 80px;">الاسم:</td>
                        <td style="padding: 8px 0; color: #ffffff; font-size: 14px; word-break: break-word;"><strong>{reg.full_name}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">البريد:</td>
                        <td style="padding: 8px 0; color: #60a5fa; font-size: 14px; direction: ltr; text-align: right; word-break: break-all;"><strong>{reg.email}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">الهاتف:</td>
                        <td style="padding: 8px 0; color: #ffffff; font-size: 14px; direction: ltr; text-align: right;"><strong>{reg.phone or 'غير متوفر'}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">الدولة:</td>
                        <td style="padding: 8px 0; color: #ffffff; font-size: 14px; word-break: break-word;"><strong>{reg.country}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #94a3b8; font-size: 14px;">Discord:</td>
                        <td style="padding: 8px 0; color: #ffffff; font-size: 14px; direction: ltr; text-align: right; word-break: break-all;"><strong>{reg.discord}</strong></td>
                    </tr>
                </table>
            </div>
            
            <div style="background-color: #422006; border-radius: 10px; padding: 20px; margin: 25px 0; border: 1px solid #ca8a04;">
                <h3 style="color: #fbbf24; margin-top: 0; font-size: 16px;">✅ الشروط والأحكام التي وافقت عليها</h3>
                <ul style="color: #fef3c7; font-size: 13px; line-height: 2; padding-right: 20px; margin: 0;">
                </ul>
                <div style="text-align: center; margin-top: 15px;">
                    <a href="https://talaria-log.com/files/mentorship-agreement.pdf" style="display: inline-block; background-color: #fbbf24; color: #422006; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: bold; text-decoration: none; margin-bottom: 10px;">📥 تحميل إقرار واتفاقية  (PDF)</a>
                </div>
                
            </div>
            
            <div style="background-color: #052e16; border-radius: 10px; padding: 20px; margin: 25px 0; border: 1px solid #16a34a;">
                <h3 style="color: #4ade80; margin-top: 0; font-size: 16px;">📌 ما التالي؟</h3>
                <p style="color: #bbf7d0; font-size: 14px; line-height: 1.8; margin: 0;">
                    سيقوم فريقنا بمراجعة طلبك والتواصل معك قريباً عبر البريد الإلكتروني مع تعليمات إضافية خلال 48h 
                </p>
            </div>
            
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #3730a3;">
                إذا كان لديك أي أسئلة، رد على هذا البريد أو تواصل معنا على info@talaria-log.com
            </p>
            
            <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 15px;">
                © 2026 Talaria-Log. جميع الحقوق محفوظة.
            </p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email or settings.smtp_user
    msg["To"] = reg.email

    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


def _append_registration_to_google_sheets(reg: BootcampRegistration) -> None:
    if not settings.google_sheets_spreadsheet_id:
        return
    if not settings.google_service_account_file:
        return

    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    creds = Credentials.from_service_account_file(
        settings.google_service_account_file,
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    values = [
        [
            (reg.created_at.isoformat() if getattr(reg, "created_at", None) else ""),
            reg.full_name,
            reg.email,
            reg.phone or "",
            reg.country,
            reg.age,
            reg.telegram or "",
            reg.discord,
            reg.instagram or "",
            reg.agree_terms,
            reg.agree_rules,
        ]
    ]
    service.spreadsheets().values().append(
        spreadsheetId=settings.google_sheets_spreadsheet_id,
        range=f"{settings.google_sheets_sheet_name}!A1",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": values},
    ).execute()

router = APIRouter(prefix="/api/bootcamp", tags=["bootcamp"])


@router.post("/register")
def register(
    payload: BootcampRegisterIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.agree_terms or not payload.agree_rules:
        raise HTTPException(status_code=400, detail="Terms and rules must be accepted")
    if payload.age < 18:
        raise HTTPException(status_code=400, detail="Must be 18 or older")

    reg = BootcampRegistration(
        full_name=(user.name or "").strip() or payload.full_name.strip(),
        email=(user.email or "").lower() or str(payload.email).lower(),
        phone=(payload.phone.strip() if payload.phone else None),
        country=payload.country.strip(),
        age=int(payload.age),
        telegram=(payload.telegram.strip() if payload.telegram else None),
        discord=payload.discord.strip(),
        instagram=(payload.instagram.strip() if payload.instagram else None),
        agree_terms=bool(payload.agree_terms),
        agree_rules=bool(payload.agree_rules),
    )
    db.add(reg)
    
    # Also save phone and country to user profile
    if payload.phone and payload.phone.strip():
        user.phone = payload.phone.strip()
    if payload.country and payload.country.strip():
        user.country = payload.country.strip()
    
    db.commit()
    db.refresh(reg)
    try:
        _append_registration_to_google_sheets(reg)
    except Exception:
        logger.exception("google_sheets_append_failed")
    try:
        _send_registration_email(reg)
    except Exception:
        logger.exception("email_notification_failed")
    try:
        _send_user_confirmation_email(reg)
    except Exception:
        logger.exception("user_confirmation_email_failed")
    return {"ok": True, "id": reg.id}
