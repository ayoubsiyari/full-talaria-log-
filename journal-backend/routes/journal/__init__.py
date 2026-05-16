# routes/journal/__init__.py
"""
Journal routes package - Split from the monolithic journal_routes.py

Modules:
- trades: CRUD operations for journal entries
- filters: Common filtering logic
- analytics: Stats and performance metrics
- import_export: Excel/CSV import and export
- exit_analysis: Trade exit analysis
- advanced: Advanced analytics (streaks, equity, combinations)
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from models import User
from subscription_access import user_entitles_journal
from dashboard_access import user_has_dashboard_module

# Create the main journal blueprint
journal_bp = Blueprint('journal', __name__)


@journal_bp.before_request
def enforce_journal_access():
    if request.method == 'OPTIONS':
        return None

    # Public endpoints
    if request.endpoint in {
        'journal.health_check',
        'journal.market_benchmark',
        'journal.serve_journal_screenshot',
    }:
        return None

    verify_jwt_in_request(optional=True)
    user_id = get_jwt_identity()

    if not user_id:
        return jsonify({'error': 'Missing or malformed token'}), 401

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        pass

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if user_entitles_journal(user):
        return None

    if user_has_dashboard_module(user, "journal"):
        return None

    return jsonify({
        'error': 'Active subscription required',
        'action': 'subscription_required'
    }), 403

# Import route modules to register them with the blueprint
from . import trades
from . import filters
from . import analytics
from . import import_export
from . import exit_analysis
from . import advanced
from . import brokers
