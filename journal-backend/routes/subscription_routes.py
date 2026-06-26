# routes/subscription_routes.py
# Stripe Subscription Management for Admin Panel

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from sqlalchemy.exc import IntegrityError
from models import db, User, Subscription, SubscriptionPlan, Payment, WebhookLog
from datetime import datetime, timedelta
from collections import defaultdict
from functools import wraps
import threading
import time
import os
import json
import re

from security_redirects import append_checkout_session_placeholder, is_allowed_stripe_redirect_url
from subscription_access import admin_extension_entitles, user_entitles_journal
from plan_entitlements import (
    apply_plan_entitlements,
    merge_plan_features_for_display,
    revoke_to_free_tier,
    subscription_status_requires_revoke,
    user_should_revoke_entitlements,
)

try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False
    print("Warning: stripe not available. Subscription features will be disabled.")

subscription_bp = Blueprint('subscriptions', __name__)


def _apply_plan_entitlements_to_user(user, plan):
    """Apply plan caps to user cache (does not set has_journal_access — Stripe sub handles access)."""
    apply_plan_entitlements(user, plan)


def _maybe_revoke_user_entitlements(user):
    """Immediate cancel policy when no active subscription remains."""
    if not user:
        return
    if user_should_revoke_entitlements(user, Subscription, db.session):
        revoke_to_free_tier(user)


def _get_or_create_subscription(stripe_sub_id, **fields):
    """Idempotently create a Subscription for a Stripe subscription id.

    Closes the race where the `customer.subscription.created` webhook and the
    frontend `verify-session` fallback both try to insert the same subscription:
    we check for an existing row first, and if a concurrent transaction wins the
    insert (when a unique index is present) we recover the existing row instead
    of erroring. Returns (subscription, created).
    """
    if stripe_sub_id:
        existing = Subscription.query.filter_by(stripe_subscription_id=stripe_sub_id).first()
        if existing:
            return existing, False
    sub = Subscription(stripe_subscription_id=stripe_sub_id, **fields)
    db.session.add(sub)
    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        existing = (
            Subscription.query.filter_by(stripe_subscription_id=stripe_sub_id).first()
            if stripe_sub_id
            else None
        )
        if existing:
            return existing, False
        raise
    return sub, True


def _resolve_plan_for_stripe_subscription(sub_data):
    price_id = sub_data.get('items', {}).get('data', [{}])[0].get('price', {}).get('id')
    if price_id:
        plan = SubscriptionPlan.query.filter_by(stripe_price_id=price_id).first()
        if plan:
            return plan
        plan = SubscriptionPlan.query.filter_by(stripe_price_id_yearly=price_id).first()
        if plan:
            return plan
    meta_plan_id = (sub_data.get('metadata') or {}).get('plan_id')
    if meta_plan_id:
        try:
            return SubscriptionPlan.query.get(int(meta_plan_id))
        except (TypeError, ValueError):
            return None
    return None


# ═══════════════════════════════════════════════════════════════════
#  RATE LIMITING & BRUTE-FORCE PROTECTION
# ═══════════════════════════════════════════════════════════════════

_rate_lock = threading.Lock()
_coupon_attempts = defaultdict(list)     # ip -> [timestamp, ...]
_coupon_blocks = {}                      # ip -> unblock_timestamp
_checkout_attempts = defaultdict(list)   # ip -> [timestamp, ...]

COUPON_MAX_ATTEMPTS = 5                  # max tries before soft-block
COUPON_WINDOW_SECONDS = 600              # 10-minute sliding window
COUPON_BLOCK_AFTER = 15                  # hard-block IP after N total fails
COUPON_BLOCK_DURATION = 3600             # 1-hour hard-block
CHECKOUT_MAX_PER_MINUTE = 3              # max checkout creates per IP per minute


def _get_client_ip():
    # Prefer X-Real-IP: nginx sets it to $remote_addr (the actual connecting
    # address), so it cannot be spoofed by the client. X-Forwarded-For is only a
    # fallback for setups without nginx — its left-most value is client-supplied
    # and must not be trusted for rate-limit / brute-force counters on its own.
    real_ip = (request.headers.get('X-Real-IP') or '').strip()
    if real_ip:
        return real_ip
    forwarded = request.headers.get('X-Forwarded-For', '')
    return forwarded.split(',')[0].strip() if forwarded else (request.remote_addr or '127.0.0.1')


def _is_coupon_blocked(ip):
    with _rate_lock:
        if ip in _coupon_blocks:
            if time.time() < _coupon_blocks[ip]:
                return True
            del _coupon_blocks[ip]
    return False


def _record_coupon_attempt(ip, success=False):
    """Track coupon validation attempts per IP. Returns (allowed, remaining_attempts)."""
    now = time.time()
    with _rate_lock:
        if ip in _coupon_blocks and now < _coupon_blocks[ip]:
            return False, 0

        cutoff = now - COUPON_WINDOW_SECONDS
        _coupon_attempts[ip] = [t for t in _coupon_attempts[ip] if t > cutoff]

        if success:
            _coupon_attempts[ip].clear()
            return True, COUPON_MAX_ATTEMPTS

        _coupon_attempts[ip].append(now)
        count = len(_coupon_attempts[ip])

        if count >= COUPON_BLOCK_AFTER:
            _coupon_blocks[ip] = now + COUPON_BLOCK_DURATION
            try:
                current_app.logger.warning(
                    f"SECURITY: Coupon brute-force detected — blocked IP {ip} "
                    f"for {COUPON_BLOCK_DURATION}s ({count} attempts in {COUPON_WINDOW_SECONDS}s)"
                )
            except RuntimeError:
                pass
            return False, 0

        remaining = max(0, COUPON_MAX_ATTEMPTS - count)
        return count <= COUPON_MAX_ATTEMPTS, remaining


def _checkout_rate_ok(ip):
    """Enforce checkout rate limit. Returns True if allowed."""
    now = time.time()
    with _rate_lock:
        cutoff = now - 60
        _checkout_attempts[ip] = [t for t in _checkout_attempts[ip] if t > cutoff]
        if len(_checkout_attempts[ip]) >= CHECKOUT_MAX_PER_MINUTE:
            return False
        _checkout_attempts[ip].append(now)
        return True


def _sanitize_coupon_code(raw):
    """Strip and validate coupon code format — alphanumeric, dashes, underscores, 3-50 chars."""
    if not raw or not isinstance(raw, str):
        return None
    code = raw.strip().upper()
    if not re.match(r'^[A-Z0-9_\-]{3,50}$', code):
        return None
    return code


def _parse_features(raw):
    """Parse features from DB — handles JSON array string, comma-separated, or already a list."""
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    return [s.strip() for s in raw.split(',') if s.strip()]


# Initialize Stripe
if STRIPE_AVAILABLE:
    stripe.api_key = os.environ.get('STRIPE_SECRET_KEY', '')

def is_admin_user():
    """Return True if the current JWT has is_admin=True."""
    claims = get_jwt()
    return claims.get('is_admin', False)

def admin_required(f):
    """Decorator to require admin access for endpoints"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_admin_user():
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated_function


# ─── SUBSCRIPTION PLANS ──────────────────────────────────────────────────────

@subscription_bp.route('/plans', methods=['GET'])
@jwt_required()
@admin_required
def get_plans():
    """Get all subscription plans"""
    try:
        plans = SubscriptionPlan.query.filter_by(is_active=True).order_by(SubscriptionPlan.price).all()
        
        return jsonify({
            'success': True,
            'plans': [{
                'id': plan.id,
                'name': plan.name,
                'description': plan.description,
                'price': plan.price,
                'interval': plan.interval,
                'stripe_price_id': plan.stripe_price_id,
                'features': plan.features,
                'trial_days': plan.trial_days,
                'is_active': plan.is_active,
                'subscriber_count': Subscription.query.filter_by(plan_id=plan.id, status='active').count(),
                'created_at': plan.created_at.isoformat() if plan.created_at else None
            } for plan in plans]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting plans: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/plans', methods=['POST'])
@jwt_required()
@admin_required
def create_plan():
    """Deprecated — use chart admin dashboard /api/admin/subscriptions/plans."""
    return jsonify({
        'error': 'This endpoint is deprecated. Use the chart admin dashboard to manage plans.',
        'admin_url': '/admin-dashboard.html#subscriptions',
    }), 410


@subscription_bp.route('/plans/<int:plan_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_plan(plan_id):
    """Deprecated — use chart admin dashboard /api/admin/subscriptions/plans/{id}."""
    return jsonify({
        'error': 'This endpoint is deprecated. Use the chart admin dashboard to manage plans.',
        'admin_url': '/admin-dashboard.html#subscriptions',
    }), 410


# ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────

@subscription_bp.route('/', methods=['GET'])
@jwt_required()
@admin_required
def get_subscriptions():
    """Get all subscriptions with pagination"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        status = request.args.get('status', None)
        
        query = Subscription.query
        
        if status:
            query = query.filter_by(status=status)
        
        pagination = query.order_by(Subscription.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        subscriptions = []
        for sub in pagination.items:
            user = User.query.get(sub.user_id)
            plan = SubscriptionPlan.query.get(sub.plan_id) if sub.plan_id else None
            st = (sub.status or '').lower()
            needs_payment = st in ('past_due', 'unpaid')
            ext_active = bool(
                user
                and user.access_expires_at
                and datetime.utcnow() < user.access_expires_at
            )
            journal_ok = user_entitles_journal(user) if user else False

            subscriptions.append({
                'id': sub.id,
                'user_id': sub.user_id,
                'user_email': user.email if user else 'Unknown',
                'user_name': user.name if user else 'Unknown',
                'plan_name': plan.name if plan else 'Unknown',
                'status': sub.status,
                'current_period_start': sub.current_period_start.isoformat() if sub.current_period_start else None,
                'current_period_end': sub.current_period_end.isoformat() if sub.current_period_end else None,
                'cancel_at_period_end': sub.cancel_at_period_end,
                'stripe_subscription_id': sub.stripe_subscription_id,
                'created_at': sub.created_at.isoformat() if sub.created_at else None,
                'needs_payment': needs_payment,
                'access_expires_at': user.access_expires_at.isoformat() if (user and user.access_expires_at) else None,
                'admin_extension_active': ext_active,
                'journal_access_effective': journal_ok,
            })
        
        return jsonify({
            'success': True,
            'subscriptions': subscriptions,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting subscriptions: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/admin/users/<int:user_id>/grant-access-extension', methods=['POST'])
@jwt_required()
@admin_required
def grant_access_extension(user_id):
    """Extend temporary journal login access (admin goodwill). Adds days to User.access_expires_at."""
    try:
        data = request.get_json() or {}
        days = int(data.get('days', 7))
        if days < 1 or days > 366:
            return jsonify({'error': 'days must be between 1 and 366'}), 400

        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        base = datetime.utcnow()
        if user.access_expires_at and user.access_expires_at > base:
            base = user.access_expires_at
        user.access_expires_at = base + timedelta(days=days)
        db.session.commit()

        return jsonify({
            'success': True,
            'access_expires_at': user.access_expires_at.isoformat(),
            'has_journal_access': user_entitles_journal(user),
        }), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f'grant_access_extension: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/admin/users/<int:user_id>/clear-access-extension', methods=['POST'])
@jwt_required()
@admin_required
def clear_access_extension(user_id):
    """Remove admin-granted extension window."""
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        user.access_expires_at = None
        db.session.commit()
        return jsonify({
            'success': True,
            'access_expires_at': None,
            'has_journal_access': user_entitles_journal(user),
        }), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f'clear_access_extension: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/stats', methods=['GET'])
@jwt_required()
@admin_required
def get_subscription_stats():
    """Get subscription statistics (MRR, ARR, churn, etc.)"""
    try:
        # Active subscriptions
        active_subs = Subscription.query.filter_by(status='active').count()
        
        # Trialing subscriptions
        trialing_subs = Subscription.query.filter_by(status='trialing').count()
        
        # Cancelled subscriptions (last 30 days)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        cancelled_subs = Subscription.query.filter(
            Subscription.status == 'cancelled',
            Subscription.cancelled_at >= thirty_days_ago
        ).count()
        
        # Calculate MRR
        mrr = 0
        active_subscriptions = Subscription.query.filter_by(status='active').all()
        for sub in active_subscriptions:
            if sub.plan_id:
                plan = SubscriptionPlan.query.get(sub.plan_id)
                if plan:
                    if plan.interval == 'month':
                        mrr += plan.price
                    elif plan.interval == 'year':
                        mrr += plan.price / 12
        
        # ARR = MRR * 12
        arr = mrr * 12
        
        # Churn rate (cancelled / total active at start of period)
        total_at_start = active_subs + cancelled_subs
        churn_rate = (cancelled_subs / total_at_start * 100) if total_at_start > 0 else 0
        
        # Total revenue (all time)
        total_revenue = db.session.query(db.func.sum(Payment.amount)).filter(
            Payment.status == 'succeeded'
        ).scalar() or 0
        
        # Revenue this month
        start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        monthly_revenue = db.session.query(db.func.sum(Payment.amount)).filter(
            Payment.status == 'succeeded',
            Payment.created_at >= start_of_month
        ).scalar() or 0
        
        # Failed payments (last 30 days)
        failed_payments = Payment.query.filter(
            Payment.status == 'failed',
            Payment.created_at >= thirty_days_ago
        ).count()
        
        # New subscriptions this month
        new_subs_month = Subscription.query.filter(
            Subscription.created_at >= start_of_month
        ).count()
        
        needs_payment = Subscription.query.filter(
            Subscription.status.in_(['past_due', 'unpaid'])
        ).count()
        admin_extension_users = User.query.filter(
            User.access_expires_at.isnot(None),
            User.access_expires_at > datetime.utcnow()
        ).count()

        return jsonify({
            'success': True,
            'stats': {
                'active_subscriptions': active_subs,
                'trialing_subscriptions': trialing_subs,
                'cancelled_last_30d': cancelled_subs,
                'mrr': round(mrr, 2),
                'arr': round(arr, 2),
                'churn_rate': round(churn_rate, 2),
                'total_revenue': round(total_revenue, 2),
                'monthly_revenue': round(monthly_revenue, 2),
                'failed_payments_30d': failed_payments,
                'new_subscriptions_month': new_subs_month,
                'needs_payment_count': needs_payment,
                'admin_extension_active_count': admin_extension_users,
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting subscription stats: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# ─── PAYMENTS ──────────────────────────────────────────────────────────────

@subscription_bp.route('/payments', methods=['GET'])
@jwt_required()
@admin_required
def get_payments():
    """Get payment history with pagination"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        status = request.args.get('status', None)
        
        query = Payment.query
        
        if status:
            query = query.filter_by(status=status)
        
        pagination = query.order_by(Payment.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        payments = []
        for payment in pagination.items:
            user = User.query.get(payment.user_id) if payment.user_id else None
            
            payments.append({
                'id': payment.id,
                'user_email': user.email if user else 'Unknown',
                'amount': payment.amount,
                'currency': payment.currency,
                'status': payment.status,
                'description': payment.description,
                'stripe_payment_id': payment.stripe_payment_id,
                'created_at': payment.created_at.isoformat() if payment.created_at else None
            })
        
        return jsonify({
            'success': True,
            'payments': payments,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting payments: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/payments/<int:payment_id>/refund', methods=['POST'])
@jwt_required()
@admin_required
def refund_payment(payment_id):
    """Refund a payment"""
    try:
        payment = Payment.query.get_or_404(payment_id)
        
        if payment.status != 'succeeded':
            return jsonify({'error': 'Can only refund successful payments'}), 400
        
        if payment.refunded:
            return jsonify({'error': 'Payment already refunded'}), 400
        
        # Process refund through Stripe
        if STRIPE_AVAILABLE and stripe.api_key and payment.stripe_payment_id:
            try:
                refund = stripe.Refund.create(
                    payment_intent=payment.stripe_payment_id,
                )
                
                if refund.status == 'succeeded':
                    payment.refunded = True
                    payment.refund_amount = payment.amount
                    payment.refunded_at = datetime.utcnow()
                    db.session.commit()
                    
                    return jsonify({
                        'success': True,
                        'message': 'Payment refunded successfully'
                    }), 200
                else:
                    return jsonify({'error': f'Refund failed: {refund.status}'}), 400
                    
            except stripe.error.StripeError as e:
                return jsonify({'error': f'Stripe error: {str(e)}'}), 400
        else:
            # Manual refund tracking
            payment.refunded = True
            payment.refund_amount = payment.amount
            payment.refunded_at = datetime.utcnow()
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Payment marked as refunded (manual)'
            }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error refunding payment: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# ─── COUPONS ──────────────────────────────────────────────────────────────

@subscription_bp.route('/coupons', methods=['GET'])
@jwt_required()
@admin_required
def get_coupons():
    """Get all coupons from Stripe"""
    try:
        if not STRIPE_AVAILABLE or not stripe.api_key:
            return jsonify({
                'success': True,
                'coupons': [],
                'message': 'Stripe not configured'
            }), 200
        
        coupons = stripe.Coupon.list(limit=100)
        
        # Fetch all promotion codes to map them to coupons
        promo_codes = stripe.PromotionCode.list(limit=100)
        coupon_promos = {}
        for pc in promo_codes.data:
            promo = getattr(pc, 'promotion', None)
            cid = promo.coupon if promo else (pc.coupon.id if hasattr(pc, 'coupon') and pc.coupon else None)
            if cid:
                if cid not in coupon_promos:
                    coupon_promos[cid] = []
                coupon_promos[cid].append(pc.code)
        
        return jsonify({
            'success': True,
            'coupons': [{
                'id': coupon.id,
                'name': coupon.name,
                'percent_off': coupon.percent_off,
                'amount_off': coupon.amount_off,
                'duration': coupon.duration,
                'duration_in_months': coupon.duration_in_months,
                'max_redemptions': coupon.max_redemptions,
                'times_redeemed': coupon.times_redeemed,
                'valid': coupon.valid,
                'promotion_codes': coupon_promos.get(coupon.id, []),
                'created': datetime.fromtimestamp(coupon.created).isoformat()
            } for coupon in coupons.data]
        }), 200
        
    except stripe.error.StripeError as e:
        return jsonify({'error': f'Stripe error: {str(e)}'}), 400
    except Exception as e:
        current_app.logger.error(f"Error getting coupons: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/coupons', methods=['POST'])
@jwt_required()
@admin_required
def create_coupon():
    """Create a new coupon + promotion code in Stripe"""
    try:
        if not STRIPE_AVAILABLE or not stripe.api_key:
            return jsonify({'error': 'Stripe not configured'}), 400
        
        data = request.get_json() or {}
        
        coupon_params = {
            'name': data.get('name', 'Discount'),
            'duration': data.get('duration', 'once'),
        }
        
        if data.get('percent_off'):
            coupon_params['percent_off'] = data['percent_off']
        elif data.get('amount_off'):
            coupon_params['amount_off'] = int(data['amount_off'] * 100)
            coupon_params['currency'] = 'usd'
        else:
            return jsonify({'error': 'Must provide percent_off or amount_off'}), 400
        
        if data.get('duration_in_months'):
            coupon_params['duration_in_months'] = data['duration_in_months']
        if data.get('max_redemptions'):
            coupon_params['max_redemptions'] = data['max_redemptions']
        
        coupon = stripe.Coupon.create(**coupon_params)
        
        # Auto-create a Promotion Code so customers can use it at checkout
        promo_code_str = data.get('code', '').strip().upper()
        promo_code = None
        if promo_code_str:
            extra = {'max_redemptions': data['max_redemptions']} if data.get('max_redemptions') else {}
            try:
                promo_code = stripe.PromotionCode.create(
                    promotion={'type': 'coupon', 'coupon': coupon.id},
                    code=promo_code_str, **extra)
            except (stripe.error.StripeError, Exception):
                promo_code = stripe.PromotionCode.create(
                    coupon=coupon.id, code=promo_code_str, **extra)
        
        return jsonify({
            'success': True,
            'message': 'Coupon created successfully' + (f' with code: {promo_code_str}' if promo_code else ''),
            'coupon': {
                'id': coupon.id,
                'name': coupon.name
            },
            'promotion_code': {
                'id': promo_code.id,
                'code': promo_code.code
            } if promo_code else None
        }), 201
        
    except stripe.error.StripeError as e:
        return jsonify({'error': f'Stripe error: {str(e)}'}), 400
    except Exception as e:
        current_app.logger.error(f"Error creating coupon: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/coupons/<coupon_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_coupon(coupon_id):
    """Deactivate a coupon + its promotion codes in Stripe"""
    try:
        if not STRIPE_AVAILABLE or not stripe.api_key:
            return jsonify({'error': 'Stripe not configured'}), 503

        stripe.Coupon.delete(coupon_id)

        return jsonify({'success': True, 'message': 'Coupon deleted'}), 200

    except stripe.error.StripeError as e:
        return jsonify({'error': f'Stripe error: {str(e)}'}), 400
    except Exception as e:
        current_app.logger.error(f"Error deleting coupon: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# ─── SECURE COUPON VALIDATION (rate-limited, brute-force protected) ──────────

@subscription_bp.route('/validate-coupon', methods=['POST'])
@jwt_required()
def validate_coupon():
    """
    Validate a promotion code before checkout.
    Rate-limited per IP: 5 attempts per 10 min, hard-block after 15 fails.
    """
    ip = _get_client_ip()

    if _is_coupon_blocked(ip):
        return jsonify({
            'error': 'Too many attempts. Please try again later.',
            'blocked': True
        }), 429

    if not STRIPE_AVAILABLE or not stripe.api_key:
        return jsonify({'error': 'Payment system not configured'}), 503

    data = request.get_json() or {}
    raw_code = data.get('code', '')
    code = _sanitize_coupon_code(raw_code)

    if not code:
        return jsonify({'error': 'Invalid coupon code format'}), 400

    allowed, remaining = _record_coupon_attempt(ip, success=False)
    if not allowed:
        return jsonify({
            'error': 'Too many attempts. Please try again later.',
            'blocked': True
        }), 429

    try:
        promo_codes = stripe.PromotionCode.list(code=code, active=True, limit=1)

        if not promo_codes.data:
            return jsonify({
                'valid': False,
                'error': 'Invalid or expired coupon code',
                'remaining_attempts': remaining
            }), 200

        promo = promo_codes.data[0]
        # New Stripe API nests coupon under promotion; retrieve full coupon object
        promo_obj = getattr(promo, 'promotion', None)
        coupon_id = promo_obj.coupon if promo_obj else (promo.coupon.id if hasattr(promo, 'coupon') and promo.coupon else None)
        if not coupon_id:
            return jsonify({
                'valid': False,
                'error': 'Invalid coupon structure',
                'remaining_attempts': remaining
            }), 200
        coupon = stripe.Coupon.retrieve(coupon_id)

        if not coupon.valid:
            return jsonify({
                'valid': False,
                'error': 'This coupon has expired',
                'remaining_attempts': remaining
            }), 200

        if promo.max_redemptions and promo.times_redeemed >= promo.max_redemptions:
            return jsonify({
                'valid': False,
                'error': 'This coupon has reached its usage limit',
                'remaining_attempts': remaining
            }), 200

        # Success — clear the attempt counter for this IP
        _record_coupon_attempt(ip, success=True)

        discount_info = {
            'promo_id': promo.id,
            'code': promo.code,
            'coupon_id': coupon.id,
        }
        if coupon.percent_off:
            discount_info['type'] = 'percent'
            discount_info['percent_off'] = coupon.percent_off
            discount_info['label'] = f'{coupon.percent_off}% off'
        elif coupon.amount_off:
            discount_info['type'] = 'amount'
            discount_info['amount_off'] = coupon.amount_off / 100
            discount_info['currency'] = coupon.currency or 'usd'
            discount_info['label'] = f'${coupon.amount_off / 100:.2f} off'

        discount_info['duration'] = coupon.duration
        if coupon.duration == 'repeating' and coupon.duration_in_months:
            discount_info['duration_in_months'] = coupon.duration_in_months

        return jsonify({
            'valid': True,
            'discount': discount_info
        }), 200

    except stripe.error.StripeError as e:
        current_app.logger.error(f"Stripe error validating coupon: {e}")
        return jsonify({'valid': False, 'error': 'Could not validate coupon'}), 200
    except Exception as e:
        current_app.logger.error(f"Error validating coupon: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# ─── WEBHOOK LOGS ──────────────────────────────────────────────────────────

@subscription_bp.route('/webhooks/logs', methods=['GET'])
@jwt_required()
@admin_required
def get_webhook_logs():
    """Get webhook logs with pagination"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        pagination = WebhookLog.query.order_by(WebhookLog.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        logs = [{
            'id': log.id,
            'event_type': log.event_type,
            'event_id': log.event_id,
            'status': log.status,
            'error_message': log.error_message,
            'created_at': log.created_at.isoformat() if log.created_at else None
        } for log in pagination.items]
        
        return jsonify({
            'success': True,
            'logs': logs,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting webhook logs: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# ─── STRIPE WEBHOOK HANDLER ──────────────────────────────────────────────────

@subscription_bp.route('/webhook', methods=['POST'])
def stripe_webhook():
    """Handle Stripe webhooks with signature verification and idempotency."""
    if not STRIPE_AVAILABLE:
        return jsonify({'error': 'Stripe not available'}), 400

    payload = request.get_data(as_text=True)
    sig_header = request.headers.get('Stripe-Signature')
    webhook_secret = (os.environ.get('STRIPE_WEBHOOK_SECRET') or '').strip()

    if not webhook_secret:
        current_app.logger.error('Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not configured')
        return jsonify({'error': 'Webhook endpoint not configured'}), 503

    if not sig_header:
        return jsonify({'error': 'Missing Stripe-Signature header'}), 400

    # 1) Verify the signature before doing anything else.
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except ValueError:
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError:
        return jsonify({'error': 'Invalid signature'}), 400

    event_id = event.get('id', '')
    event_type = event.get('type', 'unknown')

    # 2) Idempotency: skip if we already processed this exact event.
    if event_id:
        existing = WebhookLog.query.filter_by(event_id=event_id, status='processed').first()
        if existing:
            return jsonify({'received': True, 'duplicate': True}), 200

    # 3) Persist a 'received' record up-front and commit it on its own, so we keep
    #    an audit row even if handler processing later fails and is rolled back.
    log = WebhookLog(
        event_type=event_type,
        event_id=event_id,
        payload=payload[:5000],
        status='received',
    )
    db.session.add(log)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        log = None

    def _mark_log(status, error=None):
        if log is None:
            return
        try:
            log.status = status
            if error is not None:
                log.error_message = str(error)[:1000]
            db.session.commit()
        except Exception:
            db.session.rollback()

    handlers = {
        'customer.subscription.created': handle_subscription_created,
        'customer.subscription.updated': handle_subscription_updated,
        'customer.subscription.deleted': handle_subscription_deleted,
        'invoice.payment_succeeded': handle_payment_succeeded,
        'invoice.payment_failed': handle_payment_failed,
        'checkout.session.completed': handle_checkout_completed,
    }
    handler = handlers.get(event_type)

    # 4) Event types we don't act on are acknowledged so Stripe stops retrying.
    if handler is None:
        _mark_log('processed')
        return jsonify({'received': True, 'ignored': True}), 200

    # 5) Run the handler. On failure, mark the event failed and return 500 so
    #    Stripe retries later — we must never silently drop an entitlement change.
    try:
        handler(event['data']['object'])
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Webhook handler error for {event_type} ({event_id}): {e}")
        _mark_log('failed', error=e)
        return jsonify({'error': 'Webhook processing failed'}), 500

    _mark_log('processed')
    return jsonify({'received': True}), 200


def handle_subscription_created(sub_data):
    """Handle new subscription from Stripe"""
    try:
        # Find user by Stripe customer ID
        user = User.query.filter_by(stripe_customer_id=sub_data.get('customer')).first()
        if not user:
            return
        
        # Find plan by Stripe price ID
        plan = _resolve_plan_for_stripe_subscription(sub_data)
        
        period_start = datetime.fromtimestamp(sub_data.get('current_period_start', 0))
        period_end = datetime.fromtimestamp(sub_data.get('current_period_end', 0))
        
        subscription, _created = _get_or_create_subscription(
            sub_data.get('id'),
            user_id=user.id,
            plan_id=plan.id if plan else None,
            stripe_customer_id=sub_data.get('customer'),
            status=sub_data.get('status'),
            started_at=period_start,
            ends_at=period_end,
            current_period_start=period_start,
            current_period_end=period_end,
        )
        
        _apply_plan_entitlements_to_user(user, plan)
        
    except Exception as e:
        # Re-raise so the webhook dispatcher can mark this event failed and
        # return 500, prompting Stripe to retry (entitlements must not be lost).
        current_app.logger.error(f"Error handling subscription created: {e}")
        raise


def handle_subscription_updated(sub_data):
    """Handle subscription update from Stripe"""
    try:
        subscription = Subscription.query.filter_by(
            stripe_subscription_id=sub_data.get('id')
        ).first()
        
        if subscription:
            period_start = datetime.fromtimestamp(sub_data.get('current_period_start', 0))
            period_end = datetime.fromtimestamp(sub_data.get('current_period_end', 0))
            new_status = sub_data.get('status')
            
            subscription.status = new_status
            subscription.started_at = period_start
            subscription.ends_at = period_end
            subscription.current_period_start = period_start
            subscription.current_period_end = period_end
            subscription.cancel_at_period_end = sub_data.get('cancel_at_period_end', False)

            user = User.query.get(subscription.user_id)
            plan = _resolve_plan_for_stripe_subscription(sub_data)
            if plan:
                subscription.plan_id = plan.id

            if user:
                st = (new_status or '').lower()
                if st in ('active', 'trialing') and plan:
                    _apply_plan_entitlements_to_user(user, plan)
                elif subscription_status_requires_revoke(new_status):
                    _maybe_revoke_user_entitlements(user)

    except Exception as e:
        current_app.logger.error(f"Error handling subscription updated: {e}")
        raise


def handle_subscription_deleted(sub_data):
    """Handle subscription cancellation from Stripe"""
    try:
        subscription = Subscription.query.filter_by(
            stripe_subscription_id=sub_data.get('id')
        ).first()
        
        if subscription:
            subscription.status = 'cancelled'
            subscription.cancelled_at = datetime.utcnow()
            user = User.query.get(subscription.user_id)
            if user:
                _maybe_revoke_user_entitlements(user)
            
    except Exception as e:
        current_app.logger.error(f"Error handling subscription deleted: {e}")
        raise


def handle_payment_succeeded(invoice_data):
    """Handle successful payment from Stripe"""
    try:
        customer_id = invoice_data.get('customer')
        user = User.query.filter_by(stripe_customer_id=customer_id).first()
        
        # Find related subscription
        stripe_sub_id = invoice_data.get('subscription')
        subscription = Subscription.query.filter_by(stripe_subscription_id=stripe_sub_id).first() if stripe_sub_id else None
        
        payment = Payment(
            user_id=user.id if user else None,
            subscription_id=subscription.id if subscription else None,
            provider='stripe',
            amount=invoice_data.get('amount_paid', 0) / 100,  # Convert from cents
            currency=invoice_data.get('currency', 'usd'),
            status='succeeded',
            invoice_url=invoice_data.get('hosted_invoice_url'),
            stripe_payment_id=invoice_data.get('payment_intent'),
            stripe_invoice_id=invoice_data.get('id'),
            description=f"Invoice {invoice_data.get('number', 'N/A')}"
        )
        db.session.add(payment)
        
    except Exception as e:
        current_app.logger.error(f"Error handling payment succeeded: {e}")
        raise


def handle_payment_failed(invoice_data):
    """Handle failed payment from Stripe"""
    try:
        customer_id = invoice_data.get('customer')
        user = User.query.filter_by(stripe_customer_id=customer_id).first()
        
        # Find related subscription
        stripe_sub_id = invoice_data.get('subscription')
        subscription = Subscription.query.filter_by(stripe_subscription_id=stripe_sub_id).first() if stripe_sub_id else None
        
        payment = Payment(
            user_id=user.id if user else None,
            subscription_id=subscription.id if subscription else None,
            provider='stripe',
            amount=invoice_data.get('amount_due', 0) / 100,
            currency=invoice_data.get('currency', 'usd'),
            status='failed',
            invoice_url=invoice_data.get('hosted_invoice_url'),
            stripe_payment_id=invoice_data.get('payment_intent'),
            stripe_invoice_id=invoice_data.get('id'),
            description=f"Failed: Invoice {invoice_data.get('number', 'N/A')}"
        )
        db.session.add(payment)

    except Exception as e:
        current_app.logger.error(f"Error handling payment failed: {e}")
        raise


# ─── CHECKOUT SESSION HANDLER ────────────────────────────────────────────────

def handle_checkout_completed(session_data):
    """Handle checkout.session.completed - creates subscription if not already created by subscription.created"""
    try:
        customer_id = session_data.get('customer')
        stripe_sub_id = session_data.get('subscription')
        
        user = User.query.filter_by(stripe_customer_id=customer_id).first()
        if not user:
            current_app.logger.warning(f"Checkout completed but no user found for customer {customer_id}")
            return
        
        # Check if subscription already exists (from customer.subscription.created event)
        existing = Subscription.query.filter_by(stripe_subscription_id=stripe_sub_id).first()
        if existing:
            return  # Already handled
        
        # Retrieve the full subscription from Stripe
        if stripe_sub_id:
            sub = stripe.Subscription.retrieve(stripe_sub_id)
            handle_subscription_created(sub)
        
    except Exception as e:
        current_app.logger.error(f"Error handling checkout completed: {e}")
        raise


# ─── VERIFY SESSION (FRONTEND FALLBACK) ─────────────────────────────────────

@subscription_bp.route('/verify-session', methods=['POST'])
@jwt_required()
def verify_checkout_session():
    """Verify a completed checkout session and create subscription if needed.
    This is the frontend fallback when webhooks haven't fired yet."""
    try:
        if not STRIPE_AVAILABLE or not stripe.api_key:
            return jsonify({'error': 'Stripe not configured'}), 503
        
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json() or {}
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({'error': 'Session ID is required'}), 400
        
        # Retrieve the checkout session from Stripe
        session = stripe.checkout.Session.retrieve(session_id, expand=['subscription'])
        
        if session.payment_status != 'paid' and session.status != 'complete':
            return jsonify({'error': 'Payment not completed', 'status': session.status}), 400
        
        # Verify this session belongs to this user
        if session.customer != user.stripe_customer_id:
            return jsonify({'error': 'Session does not belong to this user'}), 403
        
        stripe_sub_id = session.subscription.id if session.subscription else None
        
        if not stripe_sub_id:
            return jsonify({'error': 'No subscription in session'}), 400
        
        # Check if subscription already exists in our DB
        existing = Subscription.query.filter_by(stripe_subscription_id=stripe_sub_id).first()
        if existing:
            return jsonify({
                'success': True,
                'message': 'Subscription already active',
                'subscription_id': existing.id,
                'status': existing.status
            }), 200
        
        # Create the subscription from the Stripe data
        sub_data = session.subscription
        price_id = sub_data['items']['data'][0]['price']['id'] if sub_data.get('items') else None
        plan = SubscriptionPlan.query.filter_by(stripe_price_id=price_id).first()
        
        period_start = datetime.fromtimestamp(sub_data.get('current_period_start', 0))
        period_end = datetime.fromtimestamp(sub_data.get('current_period_end', 0))
        
        subscription, _created = _get_or_create_subscription(
            stripe_sub_id,
            user_id=user.id,
            plan_id=plan.id if plan else None,
            stripe_customer_id=session.customer,
            status=sub_data.get('status', 'active'),
            started_at=period_start,
            ends_at=period_end,
            current_period_start=period_start,
            current_period_end=period_end,
        )
        
        _apply_plan_entitlements_to_user(user, plan)
        
        # Record the payment so it shows in admin Payments tab
        try:
            latest_invoice_id = sub_data.get('latest_invoice')
            if latest_invoice_id:
                invoice = stripe.Invoice.retrieve(latest_invoice_id)
                payment = Payment(
                    user_id=user.id,
                    subscription_id=subscription.id,
                    provider='stripe',
                    amount=invoice.get('amount_paid', 0) / 100,
                    currency=invoice.get('currency', 'usd'),
                    status='succeeded' if invoice.get('paid') else 'pending',
                    invoice_url=invoice.get('hosted_invoice_url'),
                    stripe_payment_id=invoice.get('payment_intent'),
                    stripe_invoice_id=invoice.get('id'),
                    description=f"Invoice {invoice.get('number', 'N/A')}"
                )
                db.session.add(payment)
        except Exception as inv_err:
            current_app.logger.warning(f"Could not record payment from invoice: {inv_err}")
        
        db.session.commit()
        
        current_app.logger.info(f"Subscription created via verify-session for user {user.id}")
        
        return jsonify({
            'success': True,
            'message': 'Subscription activated',
            'subscription_id': subscription.id,
            'status': subscription.status
        }), 201
        
    except stripe.error.StripeError as e:
        current_app.logger.error(f"Stripe error verifying session: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error verifying checkout session: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# ─── MANUAL SUBSCRIPTION MANAGEMENT ──────────────────────────────────────────

@subscription_bp.route('/users/<int:user_id>/subscription', methods=['POST'])
@jwt_required()
@admin_required
def assign_subscription(user_id):
    """Manually assign a subscription to a user"""
    try:
        user = User.query.get_or_404(user_id)
        data = request.get_json() or {}
        
        plan_id = data.get('plan_id')
        duration_days = data.get('duration_days', 30)
        
        # Create manual subscription
        subscription = Subscription(
            user_id=user.id,
            plan_id=plan_id,
            status='active',
            current_period_start=datetime.utcnow(),
            current_period_end=datetime.utcnow() + timedelta(days=duration_days),
            is_manual=True
        )
        db.session.add(subscription)
        
        plan = SubscriptionPlan.query.get(plan_id) if plan_id else None
        _apply_plan_entitlements_to_user(user, plan)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Subscription assigned to {user.email}'
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error assigning subscription: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/subscriptions/<int:sub_id>/cancel', methods=['POST'])
@jwt_required()
@admin_required
def cancel_subscription(sub_id):
    """Cancel a subscription"""
    try:
        subscription = Subscription.query.get_or_404(sub_id)
        
        # Cancel in Stripe if connected
        if STRIPE_AVAILABLE and stripe.api_key and subscription.stripe_subscription_id:
            try:
                stripe.Subscription.delete(subscription.stripe_subscription_id)
            except stripe.error.StripeError as e:
                current_app.logger.error(f"Stripe cancellation error: {e}")
        
        subscription.status = 'cancelled'
        subscription.cancelled_at = datetime.utcnow()
        user = User.query.get(subscription.user_id)
        if user:
            _maybe_revoke_user_entitlements(user)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Subscription cancelled'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error cancelling subscription: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# ─── USER-FACING ENDPOINTS ───────────────────────────────────────────────────

@subscription_bp.route('/public/plans', methods=['GET'])
def get_public_plans():
    """Get all active subscription plans (public endpoint)"""
    try:
        plans = SubscriptionPlan.query.filter_by(is_active=True).order_by(SubscriptionPlan.price).all()
        
        return jsonify({
            'success': True,
            'plans': [{
                'id': plan.id,
                'name': plan.name,
                'description': plan.description,
                'price': plan.price,
                'price_monthly': plan.price_monthly if hasattr(plan, 'price_monthly') else plan.price,
                'price_yearly': plan.price_yearly if hasattr(plan, 'price_yearly') else (plan.price * 10 if plan.price else 0),
                'interval': plan.interval,
                'features': merge_plan_features_for_display(
                    max_trading_sessions=getattr(plan, 'max_trading_sessions', None),
                    max_tickers_per_session=getattr(plan, 'max_tickers_per_session', None),
                    max_supporting_tickers_per_session=getattr(
                        plan, 'max_supporting_tickers_per_session', None
                    ),
                    stored_features=_parse_features(plan.features),
                ),
                'trial_days': plan.trial_days,
                'max_trading_sessions': getattr(plan, 'max_trading_sessions', None),
                'max_tickers_per_session': getattr(plan, 'max_tickers_per_session', None),
                'max_supporting_tickers_per_session': getattr(plan, 'max_supporting_tickers_per_session', None),
                'tier_rank': int(getattr(plan, 'tier_rank', 0) or 0),
                'is_popular': plan.name.lower() == 'pro' or 'pro' in plan.name.lower()
            } for plan in plans]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting public plans: {e}")
        return jsonify({'error': 'Internal server error'}), 500


def _reconcile_user_stripe_subscriptions_from_stripe(user_id, user):
    """
    Pull latest subscription status from Stripe and update our DB.
    Refresh /my-subscription must not rely on stale rows when webhooks were missed.
    """
    if not STRIPE_AVAILABLE or not getattr(stripe, 'api_key', None):
        return
    if not user or not user.stripe_customer_id:
        return
    subs = Subscription.query.filter(
        Subscription.user_id == user_id,
        Subscription.stripe_subscription_id.isnot(None),
    ).all()
    if not subs:
        return
    for sub in subs:
        try:
            ss = stripe.Subscription.retrieve(sub.stripe_subscription_id)
            if isinstance(ss, dict):
                status = ss.get('status')
                cps = ss.get('current_period_start') or 0
                cpe = ss.get('current_period_end') or 0
                catpe = ss.get('cancel_at_period_end', False)
            else:
                status = getattr(ss, 'status', None)
                cps = getattr(ss, 'current_period_start', None) or 0
                cpe = getattr(ss, 'current_period_end', None) or 0
                catpe = getattr(ss, 'cancel_at_period_end', False)
            period_start = datetime.fromtimestamp(int(cps))
            period_end = datetime.fromtimestamp(int(cpe))
            sub.status = status
            sub.started_at = period_start
            sub.ends_at = period_end
            sub.current_period_start = period_start
            sub.current_period_end = period_end
            sub.cancel_at_period_end = bool(catpe)
            if (status or '').lower() in ('active', 'trialing') and sub.plan_id:
                user = User.query.get(user_id)
                plan = SubscriptionPlan.query.get(sub.plan_id)
                if user and plan:
                    _apply_plan_entitlements_to_user(user, plan)
            elif subscription_status_requires_revoke(status):
                user = User.query.get(user_id)
                if user:
                    _maybe_revoke_user_entitlements(user)
        except Exception as e:
            current_app.logger.warning(
                'Stripe reconcile failed for subscription %s: %s',
                getattr(sub, 'stripe_subscription_id', None),
                e,
            )
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f'Subscription reconcile commit failed: {e}')


def _lapsed_subscription_summary(sub):
    if not sub:
        return None
    plan_name = None
    if sub.plan_id:
        pl = SubscriptionPlan.query.get(sub.plan_id)
        if pl:
            plan_name = pl.name
    return {
        'status': sub.status,
        'plan_id': sub.plan_id,
        'plan_name': plan_name,
        'current_period_end': sub.current_period_end.isoformat() if sub.current_period_end else None,
    }


def _user_extension_json(user):
    if not user:
        return {'access_extension_until': None, 'has_admin_extension_active': False}
    active = admin_extension_entitles(user)
    return {
        'access_extension_until': user.access_expires_at.isoformat() if active else None,
        'has_admin_extension_active': active,
    }


def _access_denial_context(user, uid):
    """
    When the user has no active/trialing subscription, describe why (for professional UI).
    """
    latest = (
        Subscription.query.filter(Subscription.user_id == uid)
        .order_by(Subscription.id.desc())
        .first()
    )
    st = (latest.status or '').lower() if latest else ''
    has_stripe = bool(user.stripe_customer_id)
    billing_issue = st in ('past_due', 'unpaid')
    if billing_issue:
        return {
            'billing_issue': True,
            'has_stripe_customer': has_stripe,
            'access_denial_reason': 'payment_required',
            'lapsed_subscription': _lapsed_subscription_summary(latest),
        }
    if latest and has_stripe:
        if st in ('canceled', 'cancelled', 'canceled'):
            return {
                'billing_issue': False,
                'has_stripe_customer': True,
                'access_denial_reason': 'subscription_ended',
                'lapsed_subscription': _lapsed_subscription_summary(latest),
            }
        return {
            'billing_issue': False,
            'has_stripe_customer': True,
            'access_denial_reason': 'subscription_inactive',
            'lapsed_subscription': _lapsed_subscription_summary(latest),
        }
    expires = getattr(user, 'access_expires_at', None)
    if expires and expires < datetime.utcnow() and (getattr(user, 'role', '') or '') != 'admin':
        return {
            'billing_issue': False,
            'has_stripe_customer': has_stripe,
            'access_denial_reason': 'access_period_ended',
            'access_expired_at': expires.isoformat(),
            'lapsed_subscription': _lapsed_subscription_summary(latest) if latest else None,
        }
    return {
        'billing_issue': False,
        'has_stripe_customer': has_stripe,
        'access_denial_reason': 'no_plan',
        'lapsed_subscription': _lapsed_subscription_summary(latest) if latest else None,
    }


@subscription_bp.route('/my-subscription', methods=['GET'])
@jwt_required()
def get_my_subscription():
    """Get current user's subscription status"""
    try:
        user_id = get_jwt_identity()
        try:
            uid = int(user_id)
        except (TypeError, ValueError):
            uid = user_id
        user = User.query.get(uid)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404

        _reconcile_user_stripe_subscriptions_from_stripe(uid, user)
        user = User.query.get(uid)
        
        # Get active subscription
        subscription = Subscription.query.filter(
            Subscription.user_id == uid,
            Subscription.status.in_(['active', 'trialing'])
        ).first()
        
        if not subscription:
            denial = _access_denial_context(user, uid)
            return jsonify({
                'success': True,
                'has_subscription': False,
                'has_journal_access': user_entitles_journal(user),
                'subscription': None,
                'plan': None,
                **denial,
                **_user_extension_json(user),
            }), 200
        
        plan = SubscriptionPlan.query.get(subscription.plan_id) if subscription.plan_id else None
        
        # Check if in grace period
        is_grace_period = False
        grace_days_left = 0
        if subscription.current_period_end:
            grace_end = subscription.current_period_end + timedelta(days=3)  # 3-day grace period
            if datetime.utcnow() > subscription.current_period_end and datetime.utcnow() < grace_end:
                is_grace_period = True
                grace_days_left = (grace_end - datetime.utcnow()).days
        
        return jsonify({
            'success': True,
            'has_subscription': True,
            'has_journal_access': user_entitles_journal(user),
            'billing_issue': False,
            'has_stripe_customer': bool(user.stripe_customer_id),
            'access_denial_reason': None,
            'lapsed_subscription': None,
            'subscription': {
                'id': subscription.id,
                'status': subscription.status,
                'started_at': (subscription.started_at or subscription.current_period_start).isoformat() if (subscription.started_at or subscription.current_period_start) else None,
                'ends_at': (subscription.ends_at or subscription.current_period_end).isoformat() if (subscription.ends_at or subscription.current_period_end) else None,
                'current_period_start': subscription.current_period_start.isoformat() if subscription.current_period_start else None,
                'current_period_end': subscription.current_period_end.isoformat() if subscription.current_period_end else None,
                'cancel_at_period_end': subscription.cancel_at_period_end,
                'is_trial': subscription.status == 'trialing',
                'is_grace_period': is_grace_period,
                'grace_days_left': grace_days_left
            },
            'plan': {
                'id': plan.id,
                'name': plan.name,
                'price': plan.price,
                'price_monthly': plan.price_monthly if hasattr(plan, 'price_monthly') else plan.price,
                'price_yearly': plan.price_yearly if hasattr(plan, 'price_yearly') else 0,
                'interval': plan.interval,
                'features': _parse_features(plan.features)
            } if plan else None,
            **_user_extension_json(user),
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting user subscription: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/checkout', methods=['POST'])
@jwt_required()
def create_checkout_session():
    """Create a Stripe Checkout session for subscription.
    Rate-limited per IP. Accepts optional coupon_code (must be pre-validated via /validate-coupon)."""
    ip = _get_client_ip()
    if not _checkout_rate_ok(ip):
        return jsonify({'error': 'Too many checkout attempts. Please wait a moment.'}), 429

    try:
        if not STRIPE_AVAILABLE or not stripe.api_key:
            return jsonify({'error': 'Payment system not configured'}), 503

        user_id = get_jwt_identity()
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json() or {}
        plan_id = data.get('plan_id')
        coupon_code = _sanitize_coupon_code(data.get('coupon_code', ''))
        default_base = (
            os.environ.get('FRONTEND_URL')
            or current_app.config.get('FRONTEND_URL')
            or 'http://localhost:3001'
        ).rstrip('/')
        success_url = data.get('success_url') or f'{default_base}/subscription/success'
        cancel_url = data.get('cancel_url') or f'{default_base}/pricing'

        if not is_allowed_stripe_redirect_url(success_url, current_app):
            return jsonify({'error': 'Invalid or disallowed success_url'}), 400
        if not is_allowed_stripe_redirect_url(cancel_url, current_app):
            return jsonify({'error': 'Invalid or disallowed cancel_url'}), 400

        if not plan_id:
            return jsonify({'error': 'Plan ID is required'}), 400

        billing_interval = (data.get('billing_interval') or data.get('interval') or 'month').strip().lower()
        if billing_interval not in ('month', 'year', 'monthly', 'yearly'):
            return jsonify({'error': 'Invalid billing_interval'}), 400
        if billing_interval in ('monthly',):
            billing_interval = 'month'
        if billing_interval in ('yearly',):
            billing_interval = 'year'

        plan = SubscriptionPlan.query.get(plan_id)
        if not plan or not plan.is_active:
            return jsonify({'error': 'Invalid plan'}), 400

        # Auto-create Stripe product/price if not yet linked
        stripe_price_id = plan.stripe_price_id
        if billing_interval == 'year':
            stripe_price_id = plan.stripe_price_id_yearly
            if not stripe_price_id:
                return jsonify({'error': 'Yearly billing is not configured for this plan'}), 400
        elif not stripe_price_id:
            try:
                product = stripe.Product.create(
                    name=plan.name,
                    description=plan.description or plan.name,
                )
                stripe_price = stripe.Price.create(
                    product=product.id,
                    unit_amount=int(plan.price * 100),
                    currency='usd',
                    recurring={'interval': plan.interval or 'month'},
                )
                plan.stripe_price_id = stripe_price.id
                plan.stripe_product_id = product.id
                db.session.commit()
                current_app.logger.info(f"Auto-created Stripe product/price for plan {plan.id}: {stripe_price.id}")
                stripe_price_id = plan.stripe_price_id
            except stripe.error.StripeError as e:
                current_app.logger.error(f"Failed to auto-create Stripe price for plan {plan.id}: {e}")
                return jsonify({'error': 'Failed to configure plan for payments'}), 500

        # Get or create Stripe customer
        if not user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=user.email,
                name=user.name,
                metadata={'user_id': user.id}
            )
            user.stripe_customer_id = customer.id
            db.session.commit()

        # Build checkout session
        session_params = {
            'customer': user.stripe_customer_id,
            'payment_method_types': ['card'],
            'line_items': [{
                'price': stripe_price_id,
                'quantity': 1,
            }],
            'mode': 'subscription',
            'success_url': append_checkout_session_placeholder(success_url),
            'cancel_url': cancel_url,
            'metadata': {
                'user_id': user.id,
                'plan_id': plan.id
            },
            'subscription_data': {
                'metadata': {
                    'user_id': user.id,
                    'plan_id': plan.id
                }
            },
        }

        # Apply server-validated coupon if provided; otherwise show Stripe's promo field
        if coupon_code:
            try:
                promo_list = stripe.PromotionCode.list(code=coupon_code, active=True, limit=1)
                if promo_list.data:
                    pc = promo_list.data[0]
                    promo_info = getattr(pc, 'promotion', None)
                    cid = promo_info.coupon if promo_info else (pc.coupon.id if hasattr(pc, 'coupon') and pc.coupon else None)
                    coupon_obj = stripe.Coupon.retrieve(cid) if cid else None
                    if coupon_obj and coupon_obj.valid:
                        session_params['discounts'] = [{'promotion_code': pc.id}]
                else:
                    return jsonify({'error': 'Invalid or expired coupon code'}), 400
            except stripe.error.StripeError:
                return jsonify({'error': 'Could not apply coupon'}), 400
        else:
            session_params['allow_promotion_codes'] = True

        # Add trial period if plan has one (only if no coupon applied — avoid stacking)
        if plan.trial_days > 0 and 'discounts' not in session_params:
            session_params['subscription_data']['trial_period_days'] = plan.trial_days

        session = stripe.checkout.Session.create(**session_params)

        return jsonify({
            'success': True,
            'checkout_url': session.url,
            'session_id': session.id
        }), 200

    except stripe.error.StripeError as e:
        current_app.logger.error(f"Stripe error creating checkout: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error creating checkout session: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/portal', methods=['POST'])
@jwt_required()
def create_portal_session():
    """Create a Stripe Customer Portal session for subscription management"""
    try:
        if not STRIPE_AVAILABLE or not stripe.api_key:
            return jsonify({'error': 'Payment system not configured'}), 503
        
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if not user.stripe_customer_id:
            return jsonify({'error': 'No subscription found'}), 400
        
        data = request.get_json() or {}
        default_base = (
            os.environ.get('FRONTEND_URL')
            or current_app.config.get('FRONTEND_URL')
            or 'http://localhost:3001'
        ).rstrip('/')
        return_url = data.get('return_url') or f'{default_base}/settings'

        if not is_allowed_stripe_redirect_url(return_url, current_app):
            return jsonify({'error': 'Invalid or disallowed return_url'}), 400

        session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=return_url
        )
        
        return jsonify({
            'success': True,
            'portal_url': session.url
        }), 200
        
    except stripe.error.StripeError as e:
        current_app.logger.error(f"Stripe error creating portal: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error creating portal session: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/cancel-my-subscription', methods=['POST'])
@jwt_required()
def cancel_my_subscription():
    """Cancel current user's subscription at period end"""
    try:
        user_id = get_jwt_identity()
        
        subscription = Subscription.query.filter(
            Subscription.user_id == user_id,
            Subscription.status.in_(['active', 'trialing'])
        ).first()
        
        if not subscription:
            return jsonify({'error': 'No active subscription found'}), 400
        
        # Cancel in Stripe (at period end)
        if STRIPE_AVAILABLE and stripe.api_key and subscription.stripe_subscription_id:
            try:
                stripe.Subscription.modify(
                    subscription.stripe_subscription_id,
                    cancel_at_period_end=True
                )
            except stripe.error.StripeError as e:
                current_app.logger.error(f"Stripe cancellation error: {e}")
        
        subscription.cancel_at_period_end = True
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Subscription will be cancelled at the end of the billing period',
            'cancel_date': subscription.current_period_end.isoformat() if subscription.current_period_end else None
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error cancelling subscription: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/reactivate-subscription', methods=['POST'])
@jwt_required()
def reactivate_subscription():
    """Reactivate a subscription that was set to cancel"""
    try:
        user_id = get_jwt_identity()
        
        subscription = Subscription.query.filter(
            Subscription.user_id == user_id,
            Subscription.status.in_(['active', 'trialing']),
            Subscription.cancel_at_period_end == True
        ).first()
        
        if not subscription:
            return jsonify({'error': 'No cancelling subscription found'}), 400
        
        # Reactivate in Stripe
        if STRIPE_AVAILABLE and stripe.api_key and subscription.stripe_subscription_id:
            try:
                stripe.Subscription.modify(
                    subscription.stripe_subscription_id,
                    cancel_at_period_end=False
                )
            except stripe.error.StripeError as e:
                current_app.logger.error(f"Stripe reactivation error: {e}")
        
        subscription.cancel_at_period_end = False
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Subscription reactivated successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error reactivating subscription: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/invoices', methods=['GET'])
@jwt_required()
def get_my_invoices():
    """Get current user's payment history/invoices"""
    try:
        user_id = get_jwt_identity()
        
        payments = Payment.query.filter_by(user_id=user_id).order_by(Payment.created_at.desc()).limit(50).all()
        
        return jsonify({
            'success': True,
            'invoices': [{
                'id': p.id,
                'subscription_id': p.subscription_id if hasattr(p, 'subscription_id') else None,
                'provider': p.provider if hasattr(p, 'provider') else 'stripe',
                'amount': p.amount,
                'currency': p.currency,
                'status': p.status,
                'invoice_url': p.invoice_url if hasattr(p, 'invoice_url') else None,
                'description': p.description,
                'created_at': p.created_at.isoformat() if p.created_at else None,
                'stripe_invoice_id': p.stripe_invoice_id
            } for p in payments]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting invoices: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/invoice/<invoice_id>/download', methods=['GET'])
@jwt_required()
def download_invoice(invoice_id):
    """Get invoice PDF download URL from Stripe"""
    try:
        if not STRIPE_AVAILABLE or not stripe.api_key:
            return jsonify({'error': 'Payment system not configured'}), 503
        
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user or not user.stripe_customer_id:
            return jsonify({'error': 'No billing account found'}), 400
        
        # Get invoice from Stripe
        invoice = stripe.Invoice.retrieve(invoice_id)
        
        # Verify invoice belongs to this customer
        if invoice.customer != user.stripe_customer_id:
            return jsonify({'error': 'Invoice not found'}), 404
        
        return jsonify({
            'success': True,
            'invoice_pdf': invoice.invoice_pdf,
            'hosted_invoice_url': invoice.hosted_invoice_url
        }), 200
        
    except stripe.error.StripeError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error downloading invoice: {e}")
        return jsonify({'error': 'Internal server error'}), 500
