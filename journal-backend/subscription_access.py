"""
Single source of truth for journal API access with Stripe subscriptions.

Stripe customers must have status active or trialing on a Subscription row.
The legacy User.has_journal_access flag is still used for manual / non-Stripe
comp access (no stripe_customer_id).
"""

from models import Subscription


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
    Admins: always. Stripe subscribers: only active/trialing subscription.
    Manual grants: has_journal_access when there is no Stripe customer id.
    """
    if getattr(user, "role", None) == "admin":
        return True
    if subscription_entitles_journal(user.id):
        return True
    if getattr(user, "has_journal_access", False) and not getattr(
        user, "stripe_customer_id", None
    ):
        return True
    return False
