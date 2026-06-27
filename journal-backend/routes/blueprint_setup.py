"""Register paid-access guards and blueprints (order matters for Flask 3)."""

from routes.admin_routes import admin_bp
from routes.auth_routes import auth_bp
from routes.mfa_routes import mfa_bp
from routes.chart_routes import chart_bp
from routes.feature_flags_routes import feature_flags_bp
from routes.feed_routes import feed_bp
from routes.journal import journal_bp
from routes.paid_access import register_paid_journal_guard
from routes.profile_routes import profile_bp
from routes.strategy_routes import strategy_bp
from routes.subscription_routes import subscription_bp
from routes.template_routes import template_bp

_JOURNAL_PUBLIC = frozenset(
    {
        "journal.health_check",
        "journal.market_benchmark",
        "journal.serve_journal_screenshot",
    }
)


def register_all_blueprints(app):
    register_paid_journal_guard(
        journal_bp,
        required_module="journal",
        skip_endpoints=_JOURNAL_PUBLIC,
    )
    register_paid_journal_guard(strategy_bp, required_module="strategies")
    register_paid_journal_guard(profile_bp, required_module="journal")
    register_paid_journal_guard(chart_bp, required_module="chart")
    register_paid_journal_guard(
        feed_bp,
        required_module="community",
        skip_endpoints=frozenset({"feed.feed_explore"}),
    )
    register_paid_journal_guard(
        template_bp,
        required_module="strategies",
        skip_endpoints=frozenset({"templates.list_templates_public"}),
    )
    register_paid_journal_guard(
        feature_flags_bp,
        skip_endpoints=frozenset({"feature_flags.get_public_feature_flags"}),
    )

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(mfa_bp, url_prefix="/api/auth/mfa")
    app.register_blueprint(journal_bp, url_prefix="/api/journal")
    app.register_blueprint(profile_bp, url_prefix="/api/profile")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(strategy_bp, url_prefix="/api")
    app.register_blueprint(feed_bp, url_prefix="/api")
    app.register_blueprint(template_bp, url_prefix="/api")
    app.register_blueprint(feature_flags_bp, url_prefix="/api")
    app.register_blueprint(subscription_bp, url_prefix="/api/subscriptions")
    app.register_blueprint(chart_bp, url_prefix="/api/chart")
