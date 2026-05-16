"""Blueprint before_request: JWT + active journal entitlement (paid / manual / admin)."""

from flask import jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

from models import User
from subscription_access import user_entitles_journal
from dashboard_access import user_has_dashboard_module


def register_paid_journal_guard(blueprint, *, required_module=None, skip_endpoints=frozenset()):
    """JWT + full subscription, or admin-granted access to `required_module`."""

    @blueprint.before_request
    def _enforce_paid_journal_access():
        if request.method == "OPTIONS":
            return None

        ep = request.endpoint
        if ep in skip_endpoints:
            return None

        verify_jwt_in_request(optional=True)
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({"error": "Missing or malformed token"}), 401

        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            pass

        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        if user_entitles_journal(user):
            return None

        if required_module and user_has_dashboard_module(user, required_module):
            return None

        return jsonify(
            {
                "error": "Active subscription required",
                "action": "subscription_required",
            }
        ), 403
