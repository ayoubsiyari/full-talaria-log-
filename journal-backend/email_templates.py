# email_templates.py
"""
Email template loader utility.
Loads HTML email templates from the email-templates folder.
"""

import os
from flask import render_template_string

# Path to email templates folder (relative to project root)
TEMPLATES_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'email-templates')


def load_template(template_name):
    """
    Load an HTML email template from the email-templates folder.
    
    Args:
        template_name: Name of the template file (e.g., 'verification-email.html')
    
    Returns:
        Template content as string, or None if not found
    """
    template_path = os.path.join(TEMPLATES_FOLDER, template_name)
    
    if os.path.exists(template_path):
        with open(template_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    print(f"⚠️ Email template not found: {template_path}")
    return None


def render_email_template(template_name, **context):
    """
    Load and render an email template with the given context.
    
    Args:
        template_name: Name of the template file
        **context: Variables to pass to the template
    
    Returns:
        Rendered HTML string, or None if template not found
    """
    template_content = load_template(template_name)
    if template_content:
        return render_template_string(template_content, **context)
    return None


# Plain text fallback templates
PLAIN_TEXT_TEMPLATES = {
    'verification': """
Welcome to Talaria Trading Journal!

Hi there!

Thank you for registering with Talaria Trading Journal. To complete your registration and start tracking your trades, please enter this verification code:

{{ verification_code }}

Important: This verification code will expire in 10 minutes for security reasons.

If you didn't create an account with us, you can safely ignore this email.

© 2024 Talaria Trading Journal. All rights reserved.
""",
    
    'password_reset_ar': """
إعادة تعيين كلمة المرور - Talaria Trading Journal

مرحباً!

لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.

رمز التحقق الخاص بك هو: {{ reset_code }}

تنبيه: هذا الرمز صالح لمدة 15 دقيقة فقط.

إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد الإلكتروني.

© 2024 Talaria Trading Journal. جميع الحقوق محفوظة.
""",

    'welcome': """
Welcome to Talaria Trading Journal!

Hi {{ user_name }}!

Your email has been successfully verified. You can now use all features of Talaria Trading Journal.

We're excited to have you on board!

© 2024 Talaria Trading Journal. All rights reserved.
"""
}


def get_plain_text_template(template_key, **context):
    """
    Get a plain text version of an email template.
    
    Args:
        template_key: Key of the plain text template
        **context: Variables to pass to the template
    
    Returns:
        Rendered plain text string
    """
    template = PLAIN_TEXT_TEMPLATES.get(template_key, '')
    return render_template_string(template, **context)
