"""Blueprint before_request: JWT + subscription or admin-granted module access."""

from flask import current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from dashboard_access import (
    user_has_any_dashboard_access,
    user_has_dashboard_module,
    user_has_full_dashboard_modules,
)
from models import User
from platform_sections import user_may_use_platform_section

JOURNAL_MODULE_PLATFORM_SECTION = {
    "strategies": "strategies",
    "backtest": "sessions",
}


def user_may_access_paid_route(user, required_module: str | None) -> bool:
    if user_has_full_dashboard_modules(user):
        return True
    if required_module:
        return user_has_dashboard_module(user, required_module)
    return user_has_any_dashboard_access(user)


def register_paid_journal_guard(
    blueprint,
    *,
    required_module: str | None = None,
    skip_endpoints=frozenset(),
):
    """Attach access check to a blueprint. Call before app.register_blueprint (Flask 3)."""

    @blueprint.before_request
    def _enforce_paid_journal_access():
        if request.method == "OPTIONS":
            return None

        if request.endpoint in skip_endpoints:
            return None

        verify_jwt_in_request(optional=True)
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({"error": "Missing or malformed token"}), 401

        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            pass

        try:
            user = User.query.get(user_id)
        except Exception as exc:
            current_app.logger.exception("paid_access user load failed: %s", exc)
            return jsonify(
                {
                    "error": "Database schema is updating; retry in a moment",
                    "detail": str(exc)[:200],
                }
            ), 503

        if not user:
            return jsonify({"error": "User not found"}), 404

        # Banned/deactivated users must lose journal access immediately, even if
        # their (chart-minted) JWT hasn't expired yet.
        if not getattr(user, "is_active", True):
            return jsonify(
                {
                    "error": "account_disabled",
                    "action": "account_disabled",
                    "message": "Your account has been deactivated. Please contact support.",
                }
            ), 403

        # Waitlist leads have a real account but NO access to anything until an
        # admin approves them.
        if getattr(user, "is_waitlisted", False):
            return jsonify(
                {
                    "error": "waitlisted",
                    "action": "waitlisted",
                    "message": "Your account is on the waitlist. Access is pending approval.",
                }
            ), 403

        platform_section = JOURNAL_MODULE_PLATFORM_SECTION.get(required_module or "")
        if platform_section and not user_may_use_platform_section(user, platform_section):
            return jsonify(
                {
                    "error": "This section is temporarily unavailable",
                    "code": "platform_section_disabled",
                    "section": platform_section,
                }
            ), 403

        if user_may_access_paid_route(user, required_module):
            return None

        return jsonify(
            {
                "error": "Active subscription required",
                "action": "subscription_required",
            }
        ), 403
