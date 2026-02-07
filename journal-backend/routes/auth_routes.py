# routes/auth_routes.py

from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import check_password_hash, generate_password_hash
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity, get_jwt
from models import db, User, Profile
from email_service import send_verification_email, send_password_reset_email, send_welcome_email
from passlib.context import CryptContext
import os

# Support both werkzeug and passlib password hashing (for compatibility with trading-chart backend)
_pwd_passlib = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def verify_password_compat(stored_hash, password):
    """Verify password against both werkzeug and passlib hash formats."""
    # Try werkzeug first
    try:
        if check_password_hash(stored_hash, password):
            return True
    except (ValueError, TypeError):
        pass
    
    # Try passlib (used by trading-chart backend)
    try:
        if _pwd_passlib.verify(password, stored_hash):
            return True
    except (ValueError, TypeError):
        pass
    
    return False

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login_user():
    """
    Expect JSON: { "email": "...", "password": "..." }
    If credentials match, returns { token, refresh_token, user: { id, email, email_verified } }.
    """
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({"error": "Please enter both your email and password to log in."}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "No account found with this email. Please check your email or register for a new account."}), 401

    # Check if user has journal access
    if not user.has_journal_access:
        return jsonify({
            "error": "You don't have access to the trading journal. Please contact support.",
            "action": "no_access"
        }), 403

    # Check if user is active
    if not user.is_active:
        return jsonify({"error": "Your account is disabled. Please contact support."}), 403

    pw_matches = verify_password_compat(user.password, password)

    if not pw_matches:
        return jsonify({"error": "Incorrect password. Please try again or reset your password if you've forgotten it."}), 401

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
            "has_active_profile": has_active_profile
        }
    }), 200


@auth_bp.route('/register', methods=['POST'])
def register_user():
    """
    Registration is disabled - users should register through the main platform.
    """
    return jsonify({"error": "Registration is disabled. Please register through the main platform at talaria-log.com"}), 403


@auth_bp.route('/verify-email', methods=['POST'])
def verify_email():
    """
    Expect JSON: { "code": "..." }
    Verifies user email with the provided 6-digit code.
    """
    data = request.get_json() or {}
    code = data.get('code', '').strip()

    if not code:
        return jsonify({"error": "Verification code is required"}), 400

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

    # Generate reset token
    reset_token = user.generate_verification_token()  # Reuse the same method
    db.session.commit()

    # Send password reset email
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"
    
    email_sent = send_password_reset_email(user, reset_url)
    
    if not email_sent:
        return jsonify({"error": "Failed to send password reset email"}), 500

    return jsonify({
        "message": "If an account with this email exists, a password reset link has been sent."
    }), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Expect JSON: { "token": "...", "new_password": "..." }
    Resets user password with the provided token.
    """
    data = request.get_json() or {}
    token = data.get('token', '')
    new_password = data.get('new_password', '')

    if not token or not new_password:
        return jsonify({"error": "Token and new password are required"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long"}), 400

    user = User.query.filter_by(verification_token=token).first()
    
    if not user:
        return jsonify({"error": "Invalid reset token"}), 400

    if user.is_verification_token_expired():
        return jsonify({"error": "Reset token has expired"}), 400

    # Update password and clear token
    user.password = generate_password_hash(new_password)
    user.verification_token = None
    user.verification_token_expires = None
    
    db.session.commit()

    return jsonify({
        "message": "Password reset successfully! You can now log in with your new password."
    }), 200


@auth_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str)
    data = request.get_json()
    user = User.query.get_or_404(user_id)

    if data.get('password'):
        user.password = generate_password_hash(data['password'])

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
    return jsonify({
        'email': user.email,
        'name': user.name,
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
        claims = get_jwt()
        
        # Check if user still exists
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        return jsonify({
            "valid": True,
            "user": {
                "id": user.id,
                "email": user.email,
                "is_admin": user.is_admin,
                "email_verified": True
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
        return jsonify({"error": "No account found with this email."}), 404
    return jsonify({"verified": True, "has_journal_access": user.has_journal_access}), 200
