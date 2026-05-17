"""Blueprint before_request: JWT + subscription or admin-granted module access."""

from flask import current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from dashboard_access import (
    user_has_any_dashboard_access,
    user_has_dashboard_module,
    user_has_full_dashboard_modules,
)
from models import User


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

        if user_may_access_paid_route(user, required_module):
            return None

        return jsonify(
            {
                "error": "Active subscription required",
                "action": "subscription_required",
            }
        ), 403
