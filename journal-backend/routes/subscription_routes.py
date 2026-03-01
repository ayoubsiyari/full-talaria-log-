# routes/subscription_routes.py
# Stripe Subscription Management for Admin Panel

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from models import db, User, Subscription, SubscriptionPlan, Payment, WebhookLog
from datetime import datetime, timedelta
from functools import wraps
import os
import json

try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False
    print("Warning: stripe not available. Subscription features will be disabled.")

subscription_bp = Blueprint('subscriptions', __name__)

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
    """Create a new subscription plan"""
    try:
        data = request.get_json() or {}
        
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        price = data.get('price', 0)
        interval = data.get('interval', 'month')
        features = data.get('features', [])
        trial_days = data.get('trial_days', 0)
        
        if not name:
            return jsonify({'error': 'Plan name is required'}), 400
        
        # Create Stripe product and price if API key is configured
        stripe_price_id = None
        stripe_product_id = None
        
        if STRIPE_AVAILABLE and stripe.api_key:
            try:
                # Create product in Stripe
                product = stripe.Product.create(
                    name=name,
                    description=description or name,
                )
                stripe_product_id = product.id
                
                # Create price in Stripe
                stripe_price = stripe.Price.create(
                    product=product.id,
                    unit_amount=int(price * 100),  # Stripe uses cents
                    currency='usd',
                    recurring={'interval': interval},
                )
                stripe_price_id = stripe_price.id
                
            except stripe.error.StripeError as e:
                current_app.logger.error(f"Stripe error creating plan: {e}")
                # Continue without Stripe integration
        
        # Create plan in database
        new_plan = SubscriptionPlan(
            name=name,
            description=description,
            price=price,
            interval=interval,
            stripe_price_id=stripe_price_id,
            stripe_product_id=stripe_product_id,
            features=json.dumps(features) if features else '[]',
            trial_days=trial_days,
            is_active=True
        )
        
        db.session.add(new_plan)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Plan created successfully',
            'plan': {
                'id': new_plan.id,
                'name': new_plan.name,
                'stripe_price_id': new_plan.stripe_price_id
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating plan: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/plans/<int:plan_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_plan(plan_id):
    """Update a subscription plan"""
    try:
        plan = SubscriptionPlan.query.get_or_404(plan_id)
        data = request.get_json() or {}
        
        if 'name' in data:
            plan.name = data['name'].strip()
        if 'description' in data:
            plan.description = data['description'].strip()
        if 'price' in data:
            plan.price = data['price']
        if 'features' in data:
            plan.features = json.dumps(data['features'])
        if 'trial_days' in data:
            plan.trial_days = data['trial_days']
        if 'is_active' in data:
            plan.is_active = data['is_active']
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Plan updated successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating plan: {e}")
        return jsonify({'error': 'Internal server error'}), 500


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
                'created_at': sub.created_at.isoformat() if sub.created_at else None
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
                'new_subscriptions_month': new_subs_month
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
            cid = pc.coupon.id if pc.coupon else None
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
            promo_params = {
                'coupon': coupon.id,
                'code': promo_code_str,
            }
            if data.get('max_redemptions'):
                promo_params['max_redemptions'] = data['max_redemptions']
            promo_code = stripe.PromotionCode.create(**promo_params)
        
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
    """Handle Stripe webhooks"""
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
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
        
        # Log the webhook
        log = WebhookLog(
            event_type=event.get('type', 'unknown'),
            event_id=event.get('id', ''),
            payload=payload[:5000],  # Truncate payload
            status='received'
        )
        db.session.add(log)
        
        # Handle specific events
        event_type = event.get('type', '')
        
        if event_type == 'customer.subscription.created':
            handle_subscription_created(event['data']['object'])
            log.status = 'processed'
            
        elif event_type == 'customer.subscription.updated':
            handle_subscription_updated(event['data']['object'])
            log.status = 'processed'
            
        elif event_type == 'customer.subscription.deleted':
            handle_subscription_deleted(event['data']['object'])
            log.status = 'processed'
            
        elif event_type == 'invoice.payment_succeeded':
            handle_payment_succeeded(event['data']['object'])
            log.status = 'processed'
            
        elif event_type == 'invoice.payment_failed':
            handle_payment_failed(event['data']['object'])
            log.status = 'processed'
        
        elif event_type == 'checkout.session.completed':
            handle_checkout_completed(event['data']['object'])
            log.status = 'processed'
        
        db.session.commit()
        
        return jsonify({'received': True}), 200
        
    except ValueError as e:
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        return jsonify({'error': 'Invalid signature'}), 400
    except Exception as e:
        current_app.logger.error(f"Webhook error: {e}")
        return jsonify({'error': str(e)}), 500


def handle_subscription_created(sub_data):
    """Handle new subscription from Stripe"""
    try:
        # Find user by Stripe customer ID
        user = User.query.filter_by(stripe_customer_id=sub_data.get('customer')).first()
        if not user:
            return
        
        # Find plan by Stripe price ID
        price_id = sub_data.get('items', {}).get('data', [{}])[0].get('price', {}).get('id')
        plan = SubscriptionPlan.query.filter_by(stripe_price_id=price_id).first()
        
        period_start = datetime.fromtimestamp(sub_data.get('current_period_start', 0))
        period_end = datetime.fromtimestamp(sub_data.get('current_period_end', 0))
        
        subscription = Subscription(
            user_id=user.id,
            plan_id=plan.id if plan else None,
            stripe_subscription_id=sub_data.get('id'),
            stripe_customer_id=sub_data.get('customer'),
            status=sub_data.get('status'),
            started_at=period_start,
            ends_at=period_end,
            current_period_start=period_start,
            current_period_end=period_end,
        )
        db.session.add(subscription)
        
        # Grant journal access
        user.has_journal_access = True
        
    except Exception as e:
        current_app.logger.error(f"Error handling subscription created: {e}")


def handle_subscription_updated(sub_data):
    """Handle subscription update from Stripe"""
    try:
        subscription = Subscription.query.filter_by(
            stripe_subscription_id=sub_data.get('id')
        ).first()
        
        if subscription:
            period_start = datetime.fromtimestamp(sub_data.get('current_period_start', 0))
            period_end = datetime.fromtimestamp(sub_data.get('current_period_end', 0))
            
            subscription.status = sub_data.get('status')
            subscription.started_at = period_start
            subscription.ends_at = period_end
            subscription.current_period_start = period_start
            subscription.current_period_end = period_end
            subscription.cancel_at_period_end = sub_data.get('cancel_at_period_end', False)
            
    except Exception as e:
        current_app.logger.error(f"Error handling subscription updated: {e}")


def handle_subscription_deleted(sub_data):
    """Handle subscription cancellation from Stripe"""
    try:
        subscription = Subscription.query.filter_by(
            stripe_subscription_id=sub_data.get('id')
        ).first()
        
        if subscription:
            subscription.status = 'cancelled'
            subscription.cancelled_at = datetime.utcnow()
            
            # Optionally revoke journal access
            user = User.query.get(subscription.user_id)
            if user:
                user.has_journal_access = False
            
    except Exception as e:
        current_app.logger.error(f"Error handling subscription deleted: {e}")


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
        
        subscription = Subscription(
            user_id=user.id,
            plan_id=plan.id if plan else None,
            stripe_subscription_id=stripe_sub_id,
            stripe_customer_id=session.customer,
            status=sub_data.get('status', 'active'),
            started_at=period_start,
            ends_at=period_end,
            current_period_start=period_start,
            current_period_end=period_end,
        )
        db.session.add(subscription)
        
        # Grant journal access
        user.has_journal_access = True
        
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
        
        # Grant journal access
        user.has_journal_access = True
        
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
                'features': json.loads(plan.features) if plan.features else [],
                'trial_days': plan.trial_days,
                'is_popular': plan.name.lower() == 'pro' or 'pro' in plan.name.lower()
            } for plan in plans]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting public plans: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/my-subscription', methods=['GET'])
@jwt_required()
def get_my_subscription():
    """Get current user's subscription status"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Get active subscription
        subscription = Subscription.query.filter(
            Subscription.user_id == user_id,
            Subscription.status.in_(['active', 'trialing'])
        ).first()
        
        if not subscription:
            return jsonify({
                'success': True,
                'has_subscription': False,
                'subscription': None,
                'plan': None
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
                'features': json.loads(plan.features) if plan.features else []
            } if plan else None
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting user subscription: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@subscription_bp.route('/checkout', methods=['POST'])
@jwt_required()
def create_checkout_session():
    """Create a Stripe Checkout session for subscription"""
    try:
        if not STRIPE_AVAILABLE or not stripe.api_key:
            return jsonify({'error': 'Payment system not configured'}), 503
        
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json() or {}
        plan_id = data.get('plan_id')
        success_url = data.get('success_url', os.environ.get('FRONTEND_URL', 'http://localhost:3001') + '/subscription/success')
        cancel_url = data.get('cancel_url', os.environ.get('FRONTEND_URL', 'http://localhost:3001') + '/pricing')
        
        if not plan_id:
            return jsonify({'error': 'Plan ID is required'}), 400
        
        plan = SubscriptionPlan.query.get(plan_id)
        if not plan or not plan.is_active:
            return jsonify({'error': 'Invalid plan'}), 400
        
        # Auto-create Stripe product/price if not yet linked
        if not plan.stripe_price_id:
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
        
        # Create checkout session
        session_params = {
            'customer': user.stripe_customer_id,
            'payment_method_types': ['card'],
            'line_items': [{
                'price': plan.stripe_price_id,
                'quantity': 1,
            }],
            'mode': 'subscription',
            'success_url': success_url + '?session_id={CHECKOUT_SESSION_ID}',
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
            'allow_promotion_codes': True,
        }
        
        # Add trial period if plan has one
        if plan.trial_days > 0:
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
        return_url = data.get('return_url', os.environ.get('FRONTEND_URL', 'http://localhost:3001') + '/settings')
        
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
