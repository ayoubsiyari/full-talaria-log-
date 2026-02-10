# email_service.py

from flask import current_app, render_template_string
from flask_mail import Mail, Message
import os

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
    app.config['MAIL_DEFAULT_SENDER'] = username
    
    # Log the email configuration (without password)
    print(f"📧 Email configured with: {username} via {app.config['MAIL_SERVER']}:{app.config['MAIL_PORT']}")
    
    mail.init_app(app)

def send_verification_email(user, verification_code):
    """Send verification email to user with 6-digit code"""
    try:
        subject = "Verify Your Email - Talaria Trading Journal"
        
        # HTML email template
        html_template = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Verify Your Email</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                         color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .code-box { background: #fff; border: 3px solid #667eea; border-radius: 15px; 
                           padding: 20px; text-align: center; margin: 20px 0; }
                .verification-code { font-size: 32px; font-weight: bold; color: #667eea; 
                                   letter-spacing: 8px; font-family: monospace; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚀 Welcome to Talaria Trading Journal!</h1>
                </div>
                <div class="content">
                    <h2>Hi there!</h2>
                    <p>Thank you for registering with Talaria Trading Journal. To complete your registration and start tracking your trades, please enter this verification code:</p>
                    
                    <div class="code-box">
                        <div class="verification-code">{{ verification_code }}</div>
                    </div>
                    
                    <p><strong>Important:</strong> This verification code will expire in 10 minutes for security reasons.</p>
                    
                    <p>If you didn't create an account with us, you can safely ignore this email.</p>
                </div>
                <div class="footer">
                    <p>© 2024 Talaria Trading Journal. All rights reserved.</p>
                    <p>This email was sent to {{ user_email }}</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        text_template = """
        Welcome to Talaria Trading Journal!
        
        Hi there!
        
        Thank you for registering with Talaria Trading Journal. To complete your registration and start tracking your trades, please enter this verification code:
        
        {{ verification_code }}
        
        Important: This verification code will expire in 10 minutes for security reasons.
        
        If you didn't create an account with us, you can safely ignore this email.
        
        © 2024 Talaria Trading Journal. All rights reserved.
        """
        
        # Render templates
        html_content = render_template_string(html_template, verification_code=verification_code, user_email=user.email)
        text_content = render_template_string(text_template, verification_code=verification_code, user_email=user.email)
        
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
        
        # HTML email template in Arabic
        html_template = """
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="utf-8">
            <title>إعادة تعيين كلمة المرور</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; line-height: 1.8; color: #333; direction: rtl; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                         color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; text-align: center; }
                .code-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                           color: white; padding: 20px 40px; font-size: 32px; font-weight: bold; 
                           letter-spacing: 8px; border-radius: 10px; display: inline-block; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 إعادة تعيين كلمة المرور</h1>
                </div>
                <div class="content">
                    <h2>مرحباً!</h2>
                    <p>لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في Talaria Trading Journal.</p>
                    <p>استخدم الرمز التالي لإعادة تعيين كلمة المرور:</p>
                    
                    <div class="code-box">{{ reset_code }}</div>
                    
                    <div class="warning">
                        <p><strong>⚠️ تنبيه:</strong> هذا الرمز صالح لمدة 15 دقيقة فقط.</p>
                    </div>
                    
                    <p style="margin-top: 20px; color: #666;">إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد الإلكتروني.</p>
                </div>
                <div class="footer">
                    <p>© 2024 Talaria Trading Journal. جميع الحقوق محفوظة.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version in Arabic
        text_template = """
        إعادة تعيين كلمة المرور - Talaria Trading Journal
        
        مرحباً!
        
        لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.
        
        رمز التحقق الخاص بك هو: {{ reset_code }}
        
        تنبيه: هذا الرمز صالح لمدة 15 دقيقة فقط.
        
        إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد الإلكتروني.
        
        © 2024 Talaria Trading Journal. جميع الحقوق محفوظة.
        """
        
        # Render templates
        html_content = render_template_string(html_template, reset_code=reset_code, user_email=user.email)
        text_content = render_template_string(text_template, reset_code=reset_code, user_email=user.email)
        
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
        html_template = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset=\"utf-8\">
            <title>Welcome to Talaria Trading Journal</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                         color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class=\"container\">
                <div class=\"header\">
                    <h1>🎉 Welcome to Talaria Trading Journal!</h1>
                </div>
                <div class=\"content\">
                    <h2>Hi {{ user_name }}!</h2>
                    <p>Your email has been successfully verified. You can now use all features of Talaria Trading Journal.</p>
                    <p>We're excited to have you on board!</p>
                </div>
                <div class=\"footer\">
                    <p>© 2024 Talaria Trading Journal. All rights reserved.</p>
                    <p>This email was sent to {{ user_email }}</p>
                </div>
            </div>
        </body>
        </html>
        """
        text_template = """
        Welcome to Talaria Trading Journal!

        Hi {{ user_name }}!

        Your email has been successfully verified. You can now use all features of Talaria Trading Journal.

        We're excited to have you on board!
        
        © 2024 Talaria Trading Journal. All rights reserved.
        """
        html_content = render_template_string(html_template, user_name=user.full_name or user.email, user_email=user.email)
        text_content = render_template_string(text_template, user_name=user.full_name or user.email, user_email=user.email)
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