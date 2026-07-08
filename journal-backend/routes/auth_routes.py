# routes/auth_routes.py

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity, get_jwt
from sqlalchemy import text
from models import db, User, Profile, BlockedIP, SecurityLog, FailedLoginAttempt
from email_service import send_verification_email, send_password_reset_email, send_welcome_email, send_welcome_coupon_email
from datetime import datetime, timedelta
import os
import re

import security_bootstrap

security_bootstrap.install_security_package()

from talaria_security.constants import MAX_FAILED_LOGIN_ATTEMPTS, LOCKOUT_WINDOW_MINUTES
from talaria_security.password import (
    hash_password,
    needs_rehash,
    validate_password_strength,
    verify_password,
)

from subscription_access import user_entitles_journal

# Security settings (aligned with enterprise_website_security_spec.md §4.2)
MAX_FAILED_ATTEMPTS = MAX_FAILED_LOGIN_ATTEMPTS
BLOCK_DURATION_HOURS = 24
FAILED_ATTEMPT_WINDOW_HOURS = max(1, LOCKOUT_WINDOW_MINUTES // 60)
ALERT_THRESHOLD = max(3, MAX_FAILED_ATTEMPTS - 2)
ADMIN_EMAIL = os.environ.get('ADMIN_ALERT_EMAIL', 'contact@talaria.services')

# Basic email shape check + hard length caps. This is input hygiene / abuse
# prevention (oversized payloads, malformed data, stored-XSS surface); SQL
# injection itself is already prevented by the ORM / bound parameters.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_EMAIL_LEN = 254
MAX_NAME_LEN = 120


def _is_valid_email(value: str) -> bool:
    return bool(value) and len(value) <= MAX_EMAIL_LEN and EMAIL_RE.match(value) is not None


SIGNUP_ALLOWLIST_SETTING = "mentorship_signup_allowlist_only"
SIGNUP_BLOCKED_MESSAGE = (
    "Registration is currently open to Mentorship members only. "
    "If you believe this is a mistake, please contact support."
)


def _signup_allowlist_only():
    """Invite-only registration toggle. Reads the shared app_settings row (managed
    from the chart admin); falls back to env MENTORSHIP_SIGNUP_ALLOWLIST_ONLY."""
    try:
        row = db.session.execute(
            text("SELECT value FROM app_settings WHERE key = :k"),
            {"k": SIGNUP_ALLOWLIST_SETTING},
        ).first()
        if row and row[0] is not None:
            return str(row[0]).strip().lower() in ("1", "true", "yes", "on")
    except Exception:
        pass
    return str(os.getenv("MENTORSHIP_SIGNUP_ALLOWLIST_ONLY", "true")).strip().lower() in (
        "1", "true", "yes", "on",
    )


def _allowlist_lookup(email):
    """Return (id, cohort_id) for an approved email, or None."""
    try:
        return db.session.execute(
            text("SELECT id, cohort_id FROM mentorship_allowlist WHERE email = :e"),
            {"e": (email or "").strip().lower()},
        ).first()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Signup wizard: pre-account email verification (see /signup/check|send-code|
# verify-code below). A short-lived row in signup_verifications proves the
# registrant controls the mailbox before the account is created.
# ---------------------------------------------------------------------------
import random as _random

SIGNUP_CODE_TTL_MINUTES = 15          # how long an emailed code is valid
SIGNUP_COMPLETE_WINDOW_MINUTES = 30   # after verifying, time allowed to finish signup
SIGNUP_RESEND_COOLDOWN_SECONDS = 45   # min seconds between code sends
SIGNUP_MAX_VERIFY_ATTEMPTS = 6        # wrong-code attempts before a new code is required


class _PendingRecipient:
    """Lightweight stand-in so send_verification_email() can address a mailbox
    for which no User row exists yet."""

    def __init__(self, email):
        self.email = email
        self.name = email.split("@")[0] if email else ""


def _gen_signup_code():
    return f"{_random.randint(0, 999999):06d}"


def _as_dt(value):
    """Normalize a DB timestamp (datetime on Postgres, str on SQLite) to datetime."""
    if value is None or isinstance(value, datetime):
        return value
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(str(value)[:26], fmt)
        except (ValueError, TypeError):
            continue
    return None


def _signup_eligibility(email):
    """Return (invited: bool, exists: bool) for a prospective registrant."""
    exists = User.query.filter_by(email=email).first() is not None
    invited = True
    if _signup_allowlist_only():
        invited = _allowlist_lookup(email) is not None
    return invited, exists


def _email_verified_for_signup(email):
    """True when the mailbox completed the verify-code step within the window."""
    try:
        row = db.session.execute(
            text("SELECT verified, expires_at FROM signup_verifications WHERE email = :e"),
            {"e": email},
        ).first()
    except Exception:
        return False
    if not row or not row[0]:
        return False
    exp = _as_dt(row[1])
    return not exp or datetime.utcnow() <= exp


def _consume_signup_verification(email):
    try:
        db.session.execute(
            text("DELETE FROM signup_verifications WHERE email = :e"), {"e": email}
        )
    except Exception:
        pass


def _signup_welcome_coupon():
    """Return (code, note) for the admin-configured signup welcome coupon, or
    (None, None) when disabled/unset. Read from the shared app_settings table
    (managed from the chart admin dashboard)."""
    try:
        rows = db.session.execute(
            text(
                "SELECT key, value FROM app_settings WHERE key IN "
                "('signup_welcome_coupon_enabled','signup_welcome_coupon_code','signup_welcome_coupon_note')"
            )
        ).fetchall()
    except Exception:
        return (None, None)
    data = {r[0]: r[1] for r in rows}
    enabled = str(data.get("signup_welcome_coupon_enabled") or "").strip().lower() in (
        "1", "true", "yes", "on",
    )
    code = (data.get("signup_welcome_coupon_code") or "").strip()
    if not enabled or not code:
        return (None, None)
    note = (data.get("signup_welcome_coupon_note") or "").strip() or None
    return (code, note)


def send_security_alert(subject, message, ip_address, event_type='attack_detected'):
    """Send security alert email to admin."""
    try:
        from flask_mail import Message
        from app import mail
        
        html_content = f'''
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 20px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🚨 Security Alert</h1>
            </div>
            <div style="background: #1e293b; padding: 30px; border-radius: 0 0 10px 10px; color: #e2e8f0;">
                <h2 style="color: #f87171; margin-top: 0;">{subject}</h2>
                <div style="background: #0f172a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; color: #94a3b8;"><strong>IP Address:</strong> <span style="color: #ef4444; font-family: monospace;">{ip_address}</span></p>
                    <p style="margin: 10px 0 0 0; color: #94a3b8;"><strong>Event Type:</strong> {event_type}</p>
                    <p style="margin: 10px 0 0 0; color: #94a3b8;"><strong>Time:</strong> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
                </div>
                <p style="color: #cbd5e1;">{message}</p>
                <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <p style="margin: 0; color: #92400e; font-size: 14px;">
                        <strong>Action Required:</strong> Review this activity in the Admin Dashboard → Health → Security section.
                    </p>
                </div>
            </div>
            <p style="text-align: center; color: #64748b; font-size: 12px; margin-top: 20px;">
                Talaria Trading Journal Security System
            </p>
        </div>
        '''
        
        msg = Message(
            subject=f"🚨 {subject}",
            sender=('Talaria Security', os.environ.get('MAIL_DEFAULT_SENDER', 'noreply@talaria.services')),
            recipients=[ADMIN_EMAIL],
            html=html_content
        )
        mail.send(msg)
        current_app.logger.info(f"Security alert sent: {subject}")
        return True
    except Exception as e:
        current_app.logger.error(f"Failed to send security alert: {str(e)}")
        return False


def get_client_ip():
    """Get the real client IP address."""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    if request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    return request.remote_addr or 'unknown'


def is_ip_blocked(ip_address):
    """Check if an IP is blocked."""
    blocked = BlockedIP.query.filter_by(ip_address=ip_address).first()
    if blocked and blocked.is_active():
        return True
    return False


def record_failed_login(ip_address, email_attempted=None):
    """Record a failed login attempt and auto-block if threshold exceeded."""
    try:
        # Record the failed attempt
        attempt = FailedLoginAttempt(
            ip_address=ip_address,
            email_attempted=email_attempted,
            user_agent=request.headers.get('User-Agent', '')[:500]
        )
        db.session.add(attempt)
        
        # Count recent failed attempts from this IP
        since = datetime.utcnow() - timedelta(hours=FAILED_ATTEMPT_WINDOW_HOURS)
        recent_attempts = FailedLoginAttempt.query.filter(
            FailedLoginAttempt.ip_address == ip_address,
            FailedLoginAttempt.attempted_at >= since
        ).count()
        
        # Send warning alert at threshold (before block)
        if recent_attempts == ALERT_THRESHOLD:
            send_security_alert(
                subject="Suspicious Login Activity Detected",
                message=f"Multiple failed login attempts ({recent_attempts}) detected from IP address {ip_address}. "
                        f"Targeted email: {email_attempted or 'Unknown'}. "
                        f"The IP will be automatically blocked after {MAX_FAILED_ATTEMPTS} attempts.",
                ip_address=ip_address,
                event_type='suspicious_activity'
            )
        
        # Auto-block if too many failures
        if recent_attempts >= MAX_FAILED_ATTEMPTS:
            existing_block = BlockedIP.query.filter_by(ip_address=ip_address).first()
            if not existing_block:
                new_block = BlockedIP(
                    ip_address=ip_address,
                    reason=f"Auto-blocked: {recent_attempts} failed login attempts",
                    blocked_until=datetime.utcnow() + timedelta(hours=BLOCK_DURATION_HOURS),
                    failed_attempts=recent_attempts,
                    blocked_by='system'
                )
                db.session.add(new_block)
                
                # Log security event
                log_entry = SecurityLog(
                    ip_address=ip_address,
                    event_type='auto_block',
                    details=f"Auto-blocked after {recent_attempts} failed login attempts. Target: {email_attempted}",
                    endpoint='/auth/login'
                )
                db.session.add(log_entry)
                
                # Send CRITICAL alert for auto-block
                send_security_alert(
                    subject="⛔ IP Address Auto-Blocked",
                    message=f"IP address {ip_address} has been automatically blocked after {recent_attempts} failed login attempts. "
                            f"Targeted email: {email_attempted or 'Unknown'}. "
                            f"Block duration: {BLOCK_DURATION_HOURS} hours. "
                            f"User Agent: {request.headers.get('User-Agent', 'Unknown')[:100]}",
                    ip_address=ip_address,
                    event_type='ip_blocked'
                )
        
        db.session.commit()
        return recent_attempts
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error recording failed login: {str(e)}")
        return 0


def clear_failed_attempts(ip_address):
    """Clear failed login attempts after successful login."""
    try:
        FailedLoginAttempt.query.filter_by(ip_address=ip_address).delete()
        db.session.commit()
    except:
        db.session.rollback()

# Support legacy werkzeug/passlib hashes; new passwords use bcrypt via talaria_security
def verify_password_compat(stored_hash, password):
    return verify_password(stored_hash, password)

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login_user():
    """
    Expect JSON: { "email": "...", "password": "..." }
    If credentials match, returns { token, refresh_token, user: { id, email, email_verified } }.
    """
    # Get client IP for security checks
    client_ip = get_client_ip()
    
    # Check if IP is blocked
    if is_ip_blocked(client_ip):
        return jsonify({"error": "Access denied. Your IP has been temporarily blocked due to too many failed attempts. Please try again later."}), 403
    
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({"error": "Please enter both your email and password to log in."}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        # Record failed attempt
        record_failed_login(client_ip, email)
        return jsonify({"error": "No account found with this email. Please check your email or register for a new account."}), 401

    # Check if user is active
    if not user.is_active:
        return jsonify({
            "error": "account_disabled",
            "message": "Your account has been deactivated by an administrator. Please contact support if you need help.",
        }), 403

    pw_matches = verify_password_compat(user.password, password)

    if not pw_matches:
        # Record failed attempt
        record_failed_login(client_ip, email)
        return jsonify({"error": "Incorrect password. Please try again or reset your password if you've forgotten it."}), 401

    # MFA gate (spec §4.1) — admins must enroll; others when enabled
    from routes.mfa_routes import verify_user_mfa
    from models import UserMfaSettings

    mfa_settings = UserMfaSettings.query.filter_by(user_id=user.id).first()
    totp_code = (data.get('totp_code') or data.get('mfa_code') or '').strip()

    if user.is_admin and (not mfa_settings or not mfa_settings.enabled):
        return jsonify(
            {
                "error": "mfa_setup_required",
                "message": "Admin accounts must enable MFA before signing in.",
            }
        ), 403

    if mfa_settings and mfa_settings.enabled:
        if not totp_code:
            return jsonify(
                {
                    "error": "mfa_required",
                    "message": "Enter the code from your authenticator app.",
                    "email": user.email,
                }
            ), 403
        if not verify_user_mfa(user.id, totp_code):
            record_failed_login(client_ip, email)
            return jsonify({"error": "Invalid MFA code"}), 401

    # Upgrade legacy password hash to bcrypt on successful login
    if needs_rehash(user.password):
        try:
            user.password = hash_password(password)
            db.session.commit()
        except ValueError:
            pass

    # has_journal_access is the admin manual full-access flag; do not overwrite on login.
    from dashboard_access import effective_dashboard_modules, user_has_any_dashboard_access

    has_journal_access = user_entitles_journal(user)
    dashboard_modules = effective_dashboard_modules(user)
    
    # Successful login - clear failed attempts for this IP
    clear_failed_attempts(client_ip)

    # Check if user has an active profile
    active_profile = Profile.query.filter_by(user_id=user.id, is_active=True).first()
    has_active_profile = active_profile is not None

    # Create both access and refresh tokens with admin claim
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"is_admin": user.is_admin}
    )
    refresh_token = create_refresh_token(
        identity=str(user.id),
        additional_claims={"is_admin": user.is_admin}
    )

    return jsonify({
        "token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "email_verified": True,
            "is_admin": user.is_admin,
            "has_active_profile": has_active_profile,
            "has_journal_access": has_journal_access,
            "has_dashboard_access": user_has_any_dashboard_access(user),
            "dashboard_modules": dashboard_modules,
        }
    }), 200


@auth_bp.route('/register', methods=['POST'])
@auth_bp.route('/signup', methods=['POST'])
def register_user():
    """
    Expect JSON: { "name": "...", "email": "...", "password": "..." }
    Creates a new user account and sends verification email.
    """
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not name:
        return jsonify({"error": "Name is required"}), 400
    if len(name) > MAX_NAME_LEN:
        return jsonify({"error": "Name is too long."}), 400

    if not email:
        return jsonify({"error": "Email is required"}), 400
    if not _is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    ok, msg = validate_password_strength(password)
    if not ok:
        return jsonify({"error": msg}), 400

    try:
        password_hash = hash_password(password)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    # Check if email already exists
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({"error": "An account with this email already exists"}), 400

    # Invite-only gate: when allowlist mode is on, non-approved emails are not
    # blocked — they are created as WAITLIST accounts (no access) so we capture
    # the lead. Approved emails register normally.
    allow_entry = None
    waitlisted = False
    if _signup_allowlist_only():
        allow_entry = _allowlist_lookup(email)
        if not allow_entry:
            waitlisted = True

    # Signup wizard gate: the mailbox must have completed the email-code step.
    if not _email_verified_for_signup(email):
        return jsonify({
            "error": "Please verify your email with the code we sent before creating your account.",
            "code": "verification_required",
        }), 400

    # Create new user (auto-verified - email_verified is a property that returns True)
    new_user = User(
        name=name,
        email=email,
        password=password_hash,
        is_active=True,
        has_journal_access=False,
        is_waitlisted=waitlisted,
    )
    # Link the registrant to their cohort (for reporting) when they were invited —
    # even if allowlist-only mode is off (allow_entry is None then), so invited
    # students still land in their cohort roster.
    invite = allow_entry or _allowlist_lookup(email)
    if invite and invite[1]:
        new_user.group_id = invite[1]

    db.session.add(new_user)
    db.session.flush()
    from user_public_id import ensure_user_public_id
    ensure_user_public_id(new_user, commit=False)
    if invite:
        try:
            db.session.execute(
                text("UPDATE mentorship_allowlist SET registered_at = :now WHERE id = :id"),
                {"now": datetime.utcnow(), "id": invite[0]},
            )
        except Exception:
            pass
    # Email was already verified via the signup wizard; consume the pending row.
    _consume_signup_verification(email)
    db.session.commit()

    if waitlisted:
        return jsonify({
            "message": (
                "You're on the waitlist! Your account is created but access is "
                "pending approval. We'll email you when a spot opens."
            ),
            "waitlist": True,
            "requires_verification": False,
            "email": email,
        }), 201

    return jsonify({
        "message": "Account created successfully! You can now log in.",
        "requires_verification": False,
        "email": email
    }), 201


@auth_bp.route('/signup/check', methods=['POST'])
def signup_check():
    """Step 1 of the signup wizard: is this email allowed to register?

    Returns { invited, exists } without sending anything. When invite-only mode
    is off, every new email is 'invited'. Existing emails are flagged so the UI
    can steer the user to log in instead.
    """
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not _is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    invited, exists = _signup_eligibility(email)
    if exists:
        return jsonify({
            "invited": invited,
            "exists": True,
            "message": "An account with this email already exists. Please log in.",
        }), 200
    if not invited:
        # Not on the mentorship allowlist while invite-only mode is on: instead of
        # turning them away, let them finish signup as a WAITLIST lead (no access
        # until an admin approves them). The frontend switches to a waitlist copy.
        return jsonify({
            "invited": False,
            "waitlist": True,
            "exists": False,
            "code": "waitlist",
            "message": (
                "You're not on the Mentorship list yet. You can still create an "
                "account to join the waitlist — we'll email you when a spot opens."
            ),
        }), 200
    return jsonify({"invited": True, "exists": False}), 200


@auth_bp.route('/signup/send-code', methods=['POST'])
def signup_send_code():
    """Step 2 of the signup wizard: email a 6-digit verification code.

    Re-checks eligibility (invite-only + not-already-registered), enforces a
    resend cooldown, then stores a short-lived code and sends it.
    """
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not _is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    invited, exists = _signup_eligibility(email)
    if exists:
        return jsonify({
            "error": "An account with this email already exists. Please log in.",
            "code": "exists",
        }), 400
    # Non-invited emails are NOT blocked here — they still verify their mailbox so
    # the waitlist collects real, reachable leads. Access is withheld at register.

    now = datetime.utcnow()
    try:
        existing = db.session.execute(
            text("SELECT last_sent_at FROM signup_verifications WHERE email = :e"),
            {"e": email},
        ).first()
    except Exception:
        existing = None
    if existing and existing[0]:
        last_sent = _as_dt(existing[0])
        if last_sent and (now - last_sent).total_seconds() < SIGNUP_RESEND_COOLDOWN_SECONDS:
            return jsonify({
                "error": "Please wait a moment before requesting another code.",
            }), 429

    code = _gen_signup_code()
    expires = now + timedelta(minutes=SIGNUP_CODE_TTL_MINUTES)
    try:
        db.session.execute(
            text("DELETE FROM signup_verifications WHERE email = :e"), {"e": email}
        )
        db.session.execute(
            text(
                "INSERT INTO signup_verifications "
                "(email, code, expires_at, verified, attempts, last_sent_at, created_at) "
                "VALUES (:e, :c, :x, :verified, 0, :now, :now)"
            ),
            {"e": email, "c": code, "x": expires, "verified": False, "now": now},
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not start verification. Please try again."}), 500

    sent = send_verification_email(_PendingRecipient(email), code)
    if not sent:
        return jsonify({
            "error": "We couldn't send the verification email. Please try again shortly.",
        }), 502

    return jsonify({
        "message": "Verification code sent. Check your inbox.",
        "expires_in": SIGNUP_CODE_TTL_MINUTES * 60,
    }), 200


@auth_bp.route('/signup/verify-code', methods=['POST'])
def signup_verify_code():
    """Step 3 of the signup wizard: confirm the emailed code.

    On success the pending row is marked verified and its window extended so the
    user has time to set a password and finish registering.
    """
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()
    if not email or not code:
        return jsonify({"error": "Email and code are required."}), 400

    try:
        row = db.session.execute(
            text("SELECT code, expires_at, attempts, verified FROM signup_verifications WHERE email = :e"),
            {"e": email},
        ).first()
    except Exception:
        row = None
    if not row:
        return jsonify({"error": "Please request a verification code first."}), 400

    stored_code, expires_at, attempts, verified = row[0], _as_dt(row[1]), int(row[2] or 0), bool(row[3])
    if verified:
        return jsonify({"message": "Email already verified.", "verified": True}), 200
    if expires_at and datetime.utcnow() > expires_at:
        return jsonify({"error": "This code has expired. Please request a new one."}), 400
    if attempts >= SIGNUP_MAX_VERIFY_ATTEMPTS:
        return jsonify({"error": "Too many attempts. Please request a new code."}), 429
    if code != str(stored_code):
        try:
            db.session.execute(
                text("UPDATE signup_verifications SET attempts = attempts + 1 WHERE email = :e"),
                {"e": email},
            )
            db.session.commit()
        except Exception:
            db.session.rollback()
        return jsonify({"error": "Incorrect code. Please try again."}), 400

    new_window = datetime.utcnow() + timedelta(minutes=SIGNUP_COMPLETE_WINDOW_MINUTES)
    try:
        db.session.execute(
            text("UPDATE signup_verifications SET verified = :v, expires_at = :x WHERE email = :e"),
            {"v": True, "x": new_window, "e": email},
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not confirm the code. Please try again."}), 500

    # Welcome-discount nudge: email the admin-configured coupon (if enabled)
    # right after verification, before payment. Never block verification on it.
    # Waitlist leads (not on the mentorship allowlist while invite-only mode is on)
    # must NOT get the gift coupon automatically — an admin sends it to them
    # manually from the dashboard once they decide to let them in.
    try:
        invited_now, _exists = _signup_eligibility(email)
        if invited_now:
            coupon_code, coupon_note = _signup_welcome_coupon()
            if coupon_code:
                send_welcome_coupon_email(email, coupon_code, coupon_note)
    except Exception:
        pass

    return jsonify({"message": "Email verified.", "verified": True}), 200


@auth_bp.route('/verify-email', methods=['POST'])
def verify_email():
    """
    Expect JSON: { "email": "...", "code": "..." }
    Verifies user email with the provided 6-digit code.
    """
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    code = data.get('code', '').strip()

    if not code:
        return jsonify({"error": "Verification code is required"}), 400

    # Find user by email or code
    if email:
        user = User.query.filter_by(email=email, verification_code=code).first()
    else:
        user = User.query.filter_by(verification_code=code).first()
    
    if not user:
        return jsonify({"error": "Invalid verification code"}), 400

    if user.is_verification_code_expired():
        return jsonify({"error": "Verification code has expired. Please request a new verification email."}), 400

    # Mark email as verified and clear code
    user.email_verified = True
    user.verification_code = None
    user.verification_code_expires = None
    
    db.session.commit()

    # Send welcome email after successful verification
    send_welcome_email(user)

    return jsonify({
        "message": "Email verified successfully! You can now log in to your account."
    }), 200


@auth_bp.route('/resend-verification', methods=['POST'])
def resend_verification():
    """
    Expect JSON: { "email": "..." }
    Resends verification email with new code to user.
    """
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({"error": "Email is required"}), 400

    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.email_verified:
        return jsonify({"error": "Email is already verified"}), 400

    # Generate new verification code
    verification_code = user.generate_verification_code()
    db.session.commit()

    # Send verification email
    email_sent = send_verification_email(user, verification_code)
    
    if not email_sent:
        return jsonify({"error": "Failed to send verification email"}), 500

    return jsonify({
        "message": "Verification email sent successfully! Please check your inbox."
    }), 200


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """
    Expect JSON: { "email": "..." }
    Sends password reset email to user.
    """
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({"error": "Email is required"}), 400

    user = User.query.filter_by(email=email).first()
    
    if not user:
        # Don't reveal if user exists or not for security
        return jsonify({
            "message": "If an account with this email exists, a password reset link has been sent."
        }), 200

    # Generate 6-digit reset code
    reset_code = user.generate_verification_token()
    db.session.commit()

    # Send password reset email with code
    email_sent = send_password_reset_email(user, reset_code)
    
    if not email_sent:
        return jsonify({"error": "Failed to send password reset email"}), 500

    return jsonify({
        "message": "تم إرسال رمز التحقق إلى بريدك الإلكتروني"
    }), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Expect JSON: { "email": "...", "code": "...", "new_password": "..." }
    Resets user password with the provided 6-digit code.
    """
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    code = data.get('code', '').strip()
    new_password = data.get('new_password', '')

    if not email or not code or not new_password:
        return jsonify({"error": "Email, verification code, and new password are required"}), 400

    ok, msg = validate_password_strength(new_password)
    if not ok:
        return jsonify({"error": msg}), 400

    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({"error": "Invalid verification code"}), 400

    if not user.verify_reset_token(code):
        return jsonify({"error": "Verification code expired or invalid"}), 400

    try:
        user.password = hash_password(new_password)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    user.clear_reset_token()
    
    db.session.commit()

    return jsonify({
        "message": "Password reset successfully. You can now sign in."
    }), 200


@auth_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str)
    data = request.get_json()
    user = User.query.get_or_404(user_id)

    if data.get('password'):
        ok, msg = validate_password_strength(data['password'])
        if not ok:
            return jsonify({"error": msg}), 400
        try:
            user.password = hash_password(data['password'])
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    db.session.commit()
    return jsonify({
        'msg': 'Profile updated',
        'email': user.email
    }), 200


@auth_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str)
    user = User.query.get_or_404(user_id)
    from user_public_id import ensure_user_public_id
    public_id = ensure_user_public_id(user)
    return jsonify({
        'email': user.email,
        'name': user.name,
        'public_id': public_id,
        'profile_image': ""
    }), 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token"""
    current_user_id = get_jwt_identity()
    claims = get_jwt()
    new_access_token = create_access_token(
        identity=current_user_id,
        additional_claims={"is_admin": claims.get('is_admin', False)}
    )
    return jsonify({"token": new_access_token}), 200
    

@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """Logout user (client should remove tokens)"""
    return jsonify({"message": "Logged out successfully"}), 200


@auth_bp.route('/validate-token', methods=['POST'])
@jwt_required()
def validate_token():
    """
    Validate if the current token is still valid and return user info
    """
    try:
        user_id = get_jwt_identity()
        
        # Check if user still exists
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        from dashboard_access import effective_dashboard_modules, user_has_any_dashboard_access

        has_journal_access = user_entitles_journal(user)
        dashboard_modules = effective_dashboard_modules(user)

        from user_public_id import ensure_user_public_id
        public_id = ensure_user_public_id(user)
        return jsonify({
            "valid": True,
            "user": {
                "id": user.id,
                "email": user.email,
                "is_admin": user.is_admin,
                "email_verified": True,
                "has_journal_access": has_journal_access,
                "has_dashboard_access": user_has_any_dashboard_access(user),
                "dashboard_modules": dashboard_modules,
                "public_id": public_id,
            }
        }), 200
    except Exception as e:
        current_app.logger.error(f"Token validation error: {str(e)}")
        return jsonify({"error": "Invalid token"}), 401


@auth_bp.route('/check-email-verified', methods=['POST'])
def check_email_verified():
    """
    Expect JSON: { "email": "..." }
    Returns { verified: true/false }
    """
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    if not email:
        return jsonify({"error": "Email is required."}), 400
    user = User.query.filter_by(email=email).first()
    if not user:
        # Return same shape to prevent user enumeration
        return jsonify({"verified": False, "has_journal_access": False}), 200

    has_journal_access = user_entitles_journal(user)

    return jsonify({"verified": True, "has_journal_access": has_journal_access}), 200
