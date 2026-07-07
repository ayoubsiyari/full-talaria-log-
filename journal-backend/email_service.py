# email_service.py

from flask import current_app, render_template_string
from flask_mail import Mail, Message
import os
from email_templates import render_email_template, get_plain_text_template

mail = Mail()

# ── Branding for HTML emails ────────────────────────────────────────────────
# Logo must be a publicly reachable HTTPS URL (email clients won't load
# relative paths or the app's private host). Override via env if needed.
EMAIL_LOGO_URL = os.environ.get('EMAIL_LOGO_URL', 'https://www.talaria-log.com/logo-08.png')
EMAIL_BRAND_NAME = os.environ.get('EMAIL_BRAND_NAME', 'Talaria Trading Journal')
EMAIL_SITE_URL = os.environ.get('EMAIL_SITE_URL', 'https://www.talaria-log.com')


def _brand_email_html(heading, body_html):
    """Wrap content in a branded shell: logo header + signature footer.
    Table-based, inline-styled markup for broad email-client support."""
    return (
        '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0b1220;'
        'font-family:Arial,Helvetica,sans-serif;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="background:#0b1220;padding:24px 0;"><tr><td align="center">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        'style="max-width:600px;width:100%;background:#111a2e;border-radius:12px;'
        'overflow:hidden;border:1px solid #1e2a44;">'
        '<tr><td align="center" style="padding:28px 24px 8px;">'
        f'<img src="{EMAIL_LOGO_URL}" width="64" height="64" alt="{EMAIL_BRAND_NAME}" '
        'style="display:block;border:0;outline:none;">'
        f'<div style="color:#e6edf7;font-size:18px;font-weight:bold;margin-top:10px;">{EMAIL_BRAND_NAME}</div>'
        '</td></tr>'
        '<tr><td style="padding:8px 32px 8px;">'
        f'<h1 style="color:#ffffff;font-size:20px;margin:16px 0 8px;">{heading}</h1>'
        f'<div style="color:#c3cede;font-size:15px;line-height:1.6;">{body_html}</div>'
        '</td></tr>'
        '<tr><td style="padding:24px 32px 28px;border-top:1px solid #1e2a44;">'
        '<div style="color:#9fb0c9;font-size:14px;line-height:1.6;">Best regards,<br>'
        f'<strong style="color:#e6edf7;">The {EMAIL_BRAND_NAME} Team</strong><br>'
        f'<a href="{EMAIL_SITE_URL}" style="color:#5b9dff;text-decoration:none;">{EMAIL_SITE_URL}</a></div>'
        f'<div style="color:#5f708c;font-size:12px;margin-top:16px;">&copy; {EMAIL_BRAND_NAME}. All rights reserved.</div>'
        '</td></tr></table></td></tr></table></body></html>'
    )

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
    """Send verification email to user with 6-digit code (branded HTML)."""
    recipient = getattr(user, 'email', None) or str(user)
    try:
        subject = f"Verify Your Email - {EMAIL_BRAND_NAME}"

        body_html = (
            '<p>Welcome! Thanks for registering. Enter this verification code to '
            'complete your registration:</p>'
            '<div style="text-align:center;margin:24px 0;">'
            '<span style="display:inline-block;background:#0b1220;border:1px solid #2b3b5c;'
            'border-radius:10px;padding:14px 28px;color:#ffffff;font-size:30px;'
            f'letter-spacing:8px;font-weight:bold;">{verification_code}</span></div>'
            '<p style="color:#9fb0c9;font-size:13px;">This code expires in 15 minutes. '
            "If you didn't request this, you can safely ignore this email.</p>"
        )
        html_content = _brand_email_html("Verify your email", body_html)
        text_content = (
            f"Your {EMAIL_BRAND_NAME} verification code is: {verification_code}\n"
            "It expires in 15 minutes. If you didn't request this, ignore this email."
        )

        msg = Message(
            subject=subject,
            recipients=[recipient],
            html=html_content,
            body=text_content,
        )

        mail.send(msg)
        return True

    except Exception as e:
        current_app.logger.error(f"Failed to send verification email to {recipient}: {str(e)}")
        return False


def send_welcome_coupon_email(recipient_email, coupon_code, coupon_note=None):
    """Send a branded 'welcome discount' email with a coupon code after the
    user verifies their email (before payment)."""
    try:
        subject = f"Your welcome discount - {EMAIL_BRAND_NAME}"
        note_html = (
            f'<p style="color:#9fb0c9;font-size:13px;">{coupon_note}</p>' if coupon_note else ''
        )
        body_html = (
            '<p>Your email is verified. As a welcome gift, here is a discount code to '
            'use at checkout:</p>'
            '<div style="text-align:center;margin:24px 0;">'
            '<span style="display:inline-block;background:#0b1220;border:1px dashed #5b9dff;'
            'border-radius:10px;padding:14px 28px;color:#ffffff;font-size:24px;'
            f'letter-spacing:3px;font-weight:bold;">{coupon_code}</span></div>'
            f'{note_html}'
            '<p>Enter this code on the pricing page when you subscribe.</p>'
        )
        html_content = _brand_email_html("A gift before you start", body_html)
        text_content = (
            f"Your {EMAIL_BRAND_NAME} welcome discount code: {coupon_code}\n"
            "Enter it at checkout on the pricing page.\n"
        )
        if coupon_note:
            text_content += f"\n{coupon_note}\n"

        msg = Message(
            subject=subject,
            recipients=[recipient_email],
            html=html_content,
            body=text_content,
        )
        mail.send(msg)
        return True

    except Exception as e:
        current_app.logger.error(f"Failed to send welcome coupon email to {recipient_email}: {str(e)}")
        return False

def _fmt_money(amount, currency='usd'):
    """Best-effort currency formatting for email display."""
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return None
    cur = (currency or 'usd').upper()
    symbol = {'USD': '$', 'EUR': '\u20ac', 'GBP': '\u00a3'}.get(cur, '')
    if symbol:
        return f"{symbol}{amt:,.2f}"
    return f"{amt:,.2f} {cur}"


def _info_row(label, value):
    return (
        '<tr>'
        f'<td style="padding:8px 0;color:#9fb0c9;font-size:14px;">{label}</td>'
        f'<td style="padding:8px 0;color:#e6edf7;font-size:14px;font-weight:bold;text-align:right;">{value}</td>'
        '</tr>'
    )


def send_subscription_welcome_email(user, details=None):
    """Branded confirmation email sent after a successful payment/subscription.
    Recaps the customer's info and the plan they purchased.

    details (dict, optional): {plan_name, amount, currency, interval,
    next_billing_date} — any missing field is simply omitted from the recap.
    """
    recipient = getattr(user, 'email', None) or str(user)
    details = details or {}
    try:
        user_name = (
            getattr(user, 'full_name', None)
            or getattr(user, 'name', None)
            or recipient
        )
        plan_name = details.get('plan_name') or 'Your plan'
        price = _fmt_money(details.get('amount'), details.get('currency'))
        interval = (details.get('interval') or '').strip().lower()
        interval_label = {'month': 'Monthly', 'year': 'Yearly',
                          'week': 'Weekly', 'day': 'Daily'}.get(interval, interval.title())
        next_billing = details.get('next_billing_date')

        subject = f"Payment confirmed — welcome to {plan_name} | {EMAIL_BRAND_NAME}"

        rows = _info_row('Name', user_name) + _info_row('Email', recipient) + _info_row('Plan', plan_name)
        if price:
            price_line = price + (f" / {interval_label.lower()}" if interval_label else '')
            rows += _info_row('Amount', price_line)
        if interval_label:
            rows += _info_row('Billing cycle', interval_label)
        if next_billing:
            rows += _info_row('Next renewal', next_billing)

        body_html = (
            f'<p>Hi {user_name},</p>'
            '<p>Your payment was successful and your subscription is now active. '
            "Here's a summary of your account:</p>"
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            'style="margin:18px 0;border-top:1px solid #1e2a44;border-bottom:1px solid #1e2a44;">'
            f'{rows}'
            '</table>'
            '<div style="text-align:center;margin:26px 0 8px;">'
            f'<a href="{EMAIL_SITE_URL}/dashboard" '
            'style="display:inline-block;background:#5b9dff;color:#0b1220;text-decoration:none;'
            'font-weight:bold;font-size:15px;padding:13px 30px;border-radius:8px;">Go to your dashboard</a>'
            '</div>'
            '<p style="color:#9fb0c9;font-size:13px;">You can manage or cancel your '
            'subscription anytime from your account settings. Thanks for choosing us!</p>'
        )
        html_content = _brand_email_html("You're all set!", body_html)

        text_lines = [
            f"Hi {user_name},",
            "",
            "Your payment was successful and your subscription is now active.",
            "",
            f"Plan: {plan_name}",
        ]
        if price:
            text_lines.append(f"Amount: {price}" + (f" / {interval_label.lower()}" if interval_label else ''))
        if next_billing:
            text_lines.append(f"Next renewal: {next_billing}")
        text_lines += ["", f"Manage your subscription: {EMAIL_SITE_URL}/dashboard", "",
                       f"— The {EMAIL_BRAND_NAME} Team"]
        text_content = "\n".join(text_lines)

        msg = Message(
            subject=subject,
            recipients=[recipient],
            html=html_content,
            body=text_content,
        )
        mail.send(msg)
        return True

    except Exception as e:
        current_app.logger.error(f"Failed to send subscription welcome email to {recipient}: {str(e)}")
        return False


def send_password_reset_email(user, reset_code):
    """Send a branded password-reset email with a 6-digit code."""
    recipient = getattr(user, 'email', None) or str(user)
    try:
        subject = f"Reset your password - {EMAIL_BRAND_NAME}"

        body_html = (
            '<p>We received a request to reset the password for your account. '
            'Enter this code to set a new password:</p>'
            '<div style="text-align:center;margin:24px 0;">'
            '<span style="display:inline-block;background:#0b1220;border:1px solid #2b3b5c;'
            'border-radius:10px;padding:14px 28px;color:#ffffff;font-size:30px;'
            f'letter-spacing:8px;font-weight:bold;">{reset_code}</span></div>'
            '<p style="color:#9fb0c9;font-size:13px;">This code expires in 15 minutes. '
            "If you didn't request a password reset, you can safely ignore this email — "
            'your password will stay the same.</p>'
        )
        html_content = _brand_email_html("Password reset", body_html)
        text_content = (
            f"Your {EMAIL_BRAND_NAME} password reset code is: {reset_code}\n"
            "It expires in 15 minutes. If you didn't request this, ignore this email."
        )

        msg = Message(
            subject=subject,
            recipients=[recipient],
            html=html_content,
            body=text_content,
        )

        mail.send(msg)
        return True

    except Exception as e:
        current_app.logger.error(f"Failed to send password reset email to {recipient}: {str(e)}")
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