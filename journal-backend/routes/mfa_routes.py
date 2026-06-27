# routes/mfa_routes.py — TOTP MFA (enterprise_website_security_spec.md §4.1)

from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

import security_bootstrap

security_bootstrap.install_security_package()

from talaria_security.mfa_totp import (
    generate_backup_codes,
    generate_totp_secret,
    hash_backup_codes,
    provisioning_uri,
    verify_backup_code,
    verify_totp,
)

from models import db, User, UserMfaSettings, SecurityLog
from routes.auth_routes import get_client_ip

mfa_bp = Blueprint('mfa', __name__)


def _mfa_for_user(user_id: int) -> UserMfaSettings | None:
    return UserMfaSettings.query.filter_by(user_id=user_id).first()


def user_requires_mfa(user: User) -> bool:
    """Admins must use MFA; optional for other users once enabled."""
    settings = _mfa_for_user(user.id)
    if settings and settings.enabled:
        return True
    return user.is_admin


def verify_user_mfa(user_id: int, code: str) -> bool:
    settings = _mfa_for_user(user_id)
    if not settings or not settings.enabled or not settings.totp_secret:
        return False
    if verify_totp(settings.totp_secret, code.strip()):
        return True
    if settings.backup_codes_hash:
        ok, updated = verify_backup_code(settings.backup_codes_hash, code)
        if ok:
            settings.backup_codes_hash = updated
            db.session.commit()
            return True
    return False


@mfa_bp.route('/status', methods=['GET'])
@jwt_required()
def mfa_status():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    settings = _mfa_for_user(user_id)
    return jsonify(
        {
            "enabled": bool(settings and settings.enabled),
            "required": user.is_admin,
            "pending_setup": bool(settings and settings.pending_secret and not settings.enabled),
        }
    ), 200


@mfa_bp.route('/setup', methods=['POST'])
@jwt_required()
def mfa_setup():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    settings = _mfa_for_user(user_id)
    if not settings:
        settings = UserMfaSettings(user_id=user_id)
        db.session.add(settings)

    if settings.enabled:
        return jsonify({"error": "MFA is already enabled. Disable it first to reconfigure."}), 400

    secret = generate_totp_secret()
    settings.pending_secret = secret
    db.session.commit()

    return jsonify(
        {
            "secret": secret,
            "provisioning_uri": provisioning_uri(secret, user.email),
            "message": "Scan the URI in your authenticator app, then POST /api/auth/mfa/confirm with a code.",
        }
    ), 200


@mfa_bp.route('/confirm', methods=['POST'])
@jwt_required()
def mfa_confirm():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}
    code = (data.get('code') or '').strip()
    if not code:
        return jsonify({"error": "Authenticator code is required"}), 400

    settings = _mfa_for_user(user_id)
    if not settings or not settings.pending_secret:
        return jsonify({"error": "Call /api/auth/mfa/setup first"}), 400

    if not verify_totp(settings.pending_secret, code):
        return jsonify({"error": "Invalid authenticator code"}), 400

    backup_codes = generate_backup_codes()
    settings.totp_secret = settings.pending_secret
    settings.pending_secret = None
    settings.backup_codes_hash = hash_backup_codes(backup_codes)
    settings.enabled = True
    settings.enabled_at = datetime.utcnow()

    log = SecurityLog(
        ip_address=get_client_ip(),
        event_type='mfa_enabled',
        details=f"MFA enabled for user {user.email}",
        endpoint='/auth/mfa/confirm',
        user_id=user.id,
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(
        {
            "success": True,
            "backup_codes": backup_codes,
            "message": "Store backup codes securely. They will not be shown again.",
        }
    ), 200


@mfa_bp.route('/disable', methods=['POST'])
@jwt_required()
def mfa_disable():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.is_admin:
        return jsonify({"error": "MFA cannot be disabled for admin accounts."}), 403

    data = request.get_json() or {}
    code = (data.get('code') or '').strip()
    if not verify_user_mfa(user_id, code):
        return jsonify({"error": "Valid authenticator or backup code required"}), 403

    settings = _mfa_for_user(user_id)
    if settings:
        settings.enabled = False
        settings.totp_secret = None
        settings.pending_secret = None
        settings.backup_codes_hash = None
        db.session.commit()

    return jsonify({"success": True}), 200
