import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_admin
from ..models import User
from ..schemas import UserPublic
from ..settings import settings

router = APIRouter(prefix="/api/admin", tags=["admin"])


class SendJournalEmailIn(BaseModel):
    email: EmailStr


class BulkEmailIn(BaseModel):
    emails: list[EmailStr]
    subject: str
    content: str  # HTML content


def _send_journal_access_email(email: str, name: str) -> None:
    """Send journal access instructions email to user."""
    subject = "🎓 دليل الوصول إلى منصة Talaria Journal"
    
    html_body = f"""
    <html dir="rtl">
    <body style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; background-color: #1a1a2e; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f0f23; border-radius: 15px; padding: 30px; border: 1px solid #3730a3; direction: rtl; text-align: right;">
            <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎓 Talaria Mentorship</h1>
                <p style="color: #a5b4fc; margin-top: 5px;">دليل الوصول إلى Journal</p>
            </div>
            
            <p style="color: #e0e7ff; font-size: 16px; line-height: 1.8;">
                مرحباً <strong style="color: #ffffff;">{name}</strong>،
            </p>
            
            <p style="color: #c7d2fe; font-size: 15px; line-height: 1.8;">
                يسعدنا إرشادك لكيفية الوصول إلى منصة Journal الخاصة بالمنتورشيب.
            </p>
            
            <div style="background-color: #1e1b4b; border-radius: 10px; padding: 20px; margin: 25px 0; border: 1px solid #3730a3;">
                <h3 style="color: #60a5fa; margin-top: 0; font-size: 16px;">📍 الطريقة الأولى: من الموقع الرئيسي</h3>
                <ol style="color: #c7d2fe; font-size: 14px; line-height: 2; padding-right: 20px; margin: 0;">
                    <li>اذهب إلى الموقع الرئيسي <a href="https://talaria-log.com" style="color: #60a5fa;">talaria-log.com</a></li>
                    <li>اضغط على زر <strong style="color: #fbbf24;">2025 Mentorship Login</strong> في أعلى الصفحة</li>
                    <li>سيتم تحويلك إلى صفحة تسجيل الدخول</li>
                    <li>أدخل بريدك الإلكتروني وكلمة المرور</li>
                </ol>
            </div>
            
            <div style="background-color: #052e16; border-radius: 10px; padding: 20px; margin: 25px 0; border: 1px solid #16a34a;">
                <h3 style="color: #4ade80; margin-top: 0; font-size: 16px;">🔗 الطريقة الثانية: الرابط المباشر</h3>
                <p style="color: #bbf7d0; font-size: 14px; line-height: 1.8; margin: 0 0 15px 0;">
                    يمكنك الوصول مباشرة إلى صفحة تسجيل الدخول عبر الرابط التالي:
                </p>
                <div style="text-align: center;">
                    <a href="https://talaria-log.com/journal/login" style="display: inline-block; background-color: #4ade80; color: #052e16; padding: 12px 25px; border-radius: 8px; font-size: 14px; font-weight: bold; text-decoration: none;">
                        🚀 الدخول إلى Journal
                    </a>
                </div>
                <p style="color: #86efac; font-size: 13px; text-align: center; margin-top: 15px; margin-bottom: 0;">
                    https://talaria-log.com/journal/login
                </p>
            </div>
            
            <div style="background-color: #422006; border-radius: 10px; padding: 15px; margin: 25px 0; border: 1px solid #ca8a04;">
                <p style="color: #fef3c7; font-size: 13px; line-height: 1.8; margin: 0;">
                    💡 <strong>نصيحة:</strong> احفظ الرابط المباشر في متصفحك للوصول السريع في المستقبل.
                </p>
            </div>
            
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #3730a3;">
                إذا واجهت أي مشكلة، تواصل معنا على info@talaria-log.com
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
    msg["From"] = f"Talaria Mentorship <{settings.smtp_from_email or settings.smtp_user}>"
    msg["To"] = email

    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


@router.get("/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.execute(select(User).order_by(User.created_at.desc())).scalars().all()
    return {"users": [UserPublic.model_validate(u, from_attributes=True) for u in users]}


@router.post("/send-journal-email")
def send_journal_email(
    payload: SendJournalEmailIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Send journal access instructions email to a specific user."""
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    _send_journal_access_email(user.email, user.name)
    return {"message": f"Journal access email sent to {user.email}"}


def _send_bulk_email(email: str, subject: str, html_content: str) -> None:
    """Send a custom email to a user."""
    html_body = f"""
    <html dir="rtl">
    <body style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; background-color: #1a1a2e; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f0f23; border-radius: 15px; padding: 30px; border: 1px solid #3730a3; direction: rtl; text-align: right;">
            <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎓 Talaria Mentorship</h1>
            </div>
            
            <div style="color: #e0e7ff; font-size: 15px; line-height: 1.8;">
                {html_content}
            </div>
            
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #3730a3;">
                إذا واجهت أي مشكلة، تواصل معنا على info@talaria-log.com
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
    msg["From"] = f"Talaria Mentorship <{settings.smtp_from_email or settings.smtp_user}>"
    msg["To"] = email
    msg["Message-ID"] = make_msgid(domain="talaria-log.com")
    msg["Date"] = formatdate(localtime=True)

    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


@router.post("/send-bulk-email")
def send_bulk_email(
    payload: BulkEmailIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Send a custom email to multiple users at once."""
    sent_count = 0
    errors = []
    
    for email in payload.emails:
        try:
            _send_bulk_email(email, payload.subject, payload.content)
            sent_count += 1
        except Exception as e:
            errors.append({"email": email, "error": str(e)})
    
    return {
        "message": f"Email sent to {sent_count} users",
        "total": len(payload.emails),
        "sent": sent_count,
        "failed": len(errors),
        "errors": errors
    }


@router.post("/send-journal-email-all")
def send_journal_email_all(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Send journal access instructions email to all users with journal access."""
    users = db.execute(select(User).where(User.has_journal_access == True)).scalars().all()
    
    sent_count = 0
    errors = []
    
    for user in users:
        try:
            _send_journal_access_email(user.email, user.name)
            sent_count += 1
        except Exception as e:
            errors.append({"email": user.email, "error": str(e)})
    
    return {
        "message": f"Journal access email sent to {sent_count} users",
        "total_users": len(users),
        "sent": sent_count,
        "errors": errors
    }
