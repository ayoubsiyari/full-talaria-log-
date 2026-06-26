# email_service.py

from flask import current_app, render_template_string
from flask_mail import Mail, Message
import os
from email_templates import render_email_template, get_plain_text_template

mail = Mail()

def init_mail(app):
    """Initialize Flask-Mail with the app using domain email configuration"""
    # Use domain email settings if available, otherwise fall back to Gmail
    app.config['MAIL_SERVER'] = os.environ.get('DOMAIN_EMAIL_SMTP_SERVER', 'smtp.gmail.com')
    app.config['MAIL_PORT'] = int(os.environ.get('DOMAIN_EMAIL_SMTP_PORT', '587'))
    app.config['MAIL_USE_TLS'] = os.environ.get('DOMAIN_EMAIL_USE_TLS', 'True').lower() == 'true'
    app.config['MAIL_USE_SSL'] = os.environ.get('DOMAIN_EMAIL_USE_SSL', 'False').lower() == 'true'
    
    # Use domain email credentials if available, otherwise fall back to Gmail
    username = os.environ.get('DOMAIN_EMAIL_USERNAME') or os.environ.get('GMAIL_USERNAME')
    password = os.environ.get('DOMAIN_EMAIL_PASSWORD') or os.environ.get('GMAIL_APP_PASSWORD')

    app.config['MAIL_USERNAME'] = username
    app.config['MAIL_PASSWORD'] = password

    # The "From" address must be decoupled from the SMTP username. With Gmail the
    # username *is* the email, so we fall back to it (unchanged behavior). With AWS
    # SES the SMTP username is an access-key id (AKIA…), NOT an email — so the
    # sender must be an explicitly verified SES identity. Set EMAIL_FROM_ADDRESS
    # (and optionally EMAIL_FROM_NAME) to that verified address when using SES.
    from_address = (
        os.environ.get('EMAIL_FROM_ADDRESS')
        or os.environ.get('MAIL_DEFAULT_SENDER')
        or username
    )
    from_name = os.environ.get('EMAIL_FROM_NAME')
    if from_name and from_address:
        app.config['MAIL_DEFAULT_SENDER'] = (from_name, from_address)
    else:
        app.config['MAIL_DEFAULT_SENDER'] = from_address

    # Log the email configuration (without password)
    print(
        f"📧 Email configured: from={from_address} login={username} "
        f"via {app.config['MAIL_SERVER']}:{app.config['MAIL_PORT']} "
        f"(TLS={app.config['MAIL_USE_TLS']}, SSL={app.config['MAIL_USE_SSL']})"
    )

    mail.init_app(app)

def send_verification_email(user, verification_code):
    """Send verification email to user with 6-digit code"""
    try:
        subject = "Verify Your Email - Talaria Trading Journal"
        
        # Load template from file, fallback to inline if not found
        html_content = render_email_template(
            'verification-email.html',
            verification_code=verification_code,
            user_email=user.email
        )
        text_content = get_plain_text_template(
            'verification',
            verification_code=verification_code,
            user_email=user.email
        )
        
        # Create and send message
        msg = Message(
            subject=subject,
            recipients=[user.email],
            html=html_content,
            body=text_content
        )
        
        mail.send(msg)
        return True
        
    except Exception as e:
        current_app.logger.error(f"Failed to send verification email to {user.email}: {str(e)}")
        return False

def send_password_reset_email(user, reset_code):
    """Send password reset email to user with 6-digit code in Arabic"""
    try:
        subject = "رمز إعادة تعيين كلمة المرور - Talaria"
        
        # Load template from file
        html_content = render_email_template(
            'password-reset-ar.html',
            reset_code=reset_code,
            user_email=user.email
        )
        text_content = get_plain_text_template(
            'password_reset_ar',
            reset_code=reset_code,
            user_email=user.email
        )
        
        # Create and send message
        msg = Message(
            subject=subject,
            recipients=[user.email],
            html=html_content,
            body=text_content
        )
        
        mail.send(msg)
        return True
        
    except Exception as e:
        current_app.logger.error(f"Failed to send password reset email to {user.email}: {str(e)}")
        return False 

def send_welcome_email(user):
    """Send a welcome email to the user after successful verification"""
    try:
        subject = "Welcome to Talaria Trading Journal!"
        
        user_name = user.full_name or user.email
        
        # Load template from file
        html_content = render_email_template(
            'welcome-email.html',
            user_name=user_name,
            user_email=user.email
        )
        text_content = get_plain_text_template(
            'welcome',
            user_name=user_name,
            user_email=user.email
        )
        
        msg = Message(
            subject=subject,
            recipients=[user.email],
            html=html_content,
            body=text_content
        )
        mail.send(msg)
        return True
    except Exception as e:
        current_app.logger.error(f"Failed to send welcome email to {user.email}: {str(e)}")
        return False 