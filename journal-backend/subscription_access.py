"""
Single source of truth for journal API access with Stripe subscriptions.

Stripe customers must have status active or trialing on a Subscription row.
The legacy User.has_journal_access flag is still used for manual / non-Stripe
comp access (no stripe_customer_id).

Admin-granted login extensions use User.access_expires_at (UTC): access until
that time even if Stripe is past_due (temporary goodwill access).
"""

from datetime import datetime

from models import Subscription


def admin_extension_entitles(user):
    """Temporary journal access set from admin dashboard (until access_expires_at)."""
    exp = getattr(user, "access_expires_at", None)
    return bool(exp and datetime.utcnow() < exp)


def subscription_entitles_journal(user_id):
    """True when the user has a paid Stripe subscription in good standing."""
    row = Subscription.query.filter(
        Subscription.user_id == user_id,
        Subscription.status.in_(["active", "trialing"]),
    ).first()
    return row is not None


def user_entitles_journal(user):
    """
    Whether journal APIs should allow this user.
    Admins: always. Admin extension window: until access_expires_at.
    Stripe subscribers: only active/trialing subscription.
    Manual grants: has_journal_access when there is no Stripe customer id.
    """
    if getattr(user, "role", None) == "admin":
        return True
    if admin_extension_entitles(user):
        return True
    if subscription_entitles_journal(user.id):
        return True
    if getattr(user, "has_journal_access", False) and not getattr(
        user, "stripe_customer_id", None
    ):
        return True
    return False
