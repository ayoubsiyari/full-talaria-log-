# routes/admin_routes.py

from flask import Blueprint, request, jsonify, current_app, send_file, make_response
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt, create_access_token, create_refresh_token
from werkzeug.security import generate_password_hash
from models import db, User, Profile, JournalEntry, Group
import logging
from datetime import datetime, timedelta
from functools import wraps
import time
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    print("Warning: psutil not available. System metrics will be disabled.")
import os
import csv
import io

admin_bp = Blueprint('admin', __name__)

# Setup logging for admin actions
admin_logger = logging.getLogger('admin_actions')
admin_logger.setLevel(logging.INFO)

# Rate limiting for admin endpoints
admin_requests = {}

# Store recent activity for the dashboard
recent_activities = []

def rate_limit_admin(max_requests=10, window_seconds=60):
    """Rate limiting decorator for admin endpoints"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_id = get_jwt_identity()
            current_time = time.time()
            
            # Clean old entries
            admin_requests.clear()
            for key, timestamp in list(admin_requests.items()):
                if current_time - timestamp > window_seconds:
                    del admin_requests[key]
            
            # Check rate limit
            request_key = f"{user_id}_{f.__name__}"
            if request_key in admin_requests:
                return jsonify({"error": "Rate limit exceeded. Please wait before making another request."}), 429
            
            admin_requests[request_key] = current_time
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def is_admin_user():
    """
    Return True if the current JWT has is_admin=True.
    """
    claims = get_jwt()
    return claims.get('is_admin', False)
def admin_required(f):
    """
    Decorator to require admin access for endpoints
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_admin_user():
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """
    Decorator to require admin access for endpoints
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_admin_user():
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated_function

def log_admin_action(action, details=""):
    """Log admin actions for security audit"""
    user_id = get_jwt_identity()
    timestamp = datetime.now().isoformat()
    log_entry = f"{timestamp} - User {user_id} - {action} - {details}"
    admin_logger.info(log_entry)
    
    # Store in recent activities for dashboard
    activity = {
        "action": action,
        "details": details,
        "user_id": user_id,
        "timestamp": timestamp
    }
    recent_activities.append(activity)
    
    # Keep only last 100 activities
    if len(recent_activities) > 100:
        recent_activities.pop(0)

@admin_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@rate_limit_admin(max_requests=20, window_seconds=60)
def admin_dashboard():
    """
    Admin-only: Get comprehensive dashboard statistics.
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can access dashboard"}), 403

    try:
        # Get basic statistics
        total_users = User.query.count()
        total_profiles = Profile.query.count()
        total_trades = JournalEntry.query.count()
        total_journals = JournalEntry.query.count()
        
        # Get recent activity
        recent_users = User.query.order_by(User.id.desc()).limit(5).all()
        recent_trades = JournalEntry.query.order_by(JournalEntry.id.desc()).limit(10).all()
        
        # Get admin users
        admin_users = User.query.filter_by(is_admin=True).all()
        
        # Calculate some metrics
        active_users_30d = User.query.filter(
            User.created_at >= datetime.now() - timedelta(days=30)
        ).count()
        
        # Mask sensitive data
        masked_users = []
        for user in recent_users:
            email = user.email
            if email and '@' in email:
                parts = email.split('@')
                masked_email = f"{parts[0][:2]}***@{parts[1]}"
            else:
                masked_email = "***"
            
            masked_users.append({
                "id": user.id,
                "email": masked_email,
                "is_admin": user.is_admin,
                "created_at": user.created_at.isoformat() if user.created_at else None
            })
        
        masked_trades = []
        for trade in recent_trades:
            masked_trades.append({
                "id": trade.id,
                "symbol": trade.symbol,
                "entry_price": trade.entry_price,
                "exit_price": trade.exit_price,
                "pnl": trade.pnl,
                "created_at": trade.created_at.isoformat() if trade.created_at else None
            })
        
        dashboard_data = {
            "statistics": {
                "total_users": total_users,
                "total_profiles": total_profiles,
                "total_trades": total_trades,
                "total_journals": total_journals,
                "active_users_30d": active_users_30d,
                "admin_users_count": len(admin_users)
            },
            "recent_users": masked_users,
            "recent_trades": masked_trades,
            "admin_users": [
                {
                    "id": user.id,
                    "email": user.email[:2] + "***@" + user.email.split('@')[1] if '@' in user.email else "***",
                    "created_at": user.created_at.isoformat() if user.created_at else None
                }
                for user in admin_users
            ]
        }
        
        log_admin_action("VIEW_DASHBOARD", f"Viewed dashboard with {total_users} users")
        return jsonify(dashboard_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error in admin dashboard: {e}")
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/users', methods=['GET'])
@jwt_required()
@rate_limit_admin(max_requests=15, window_seconds=60)
def list_users():
    """
    Admin-only: List all users with pagination and filtering.
    Query params: page (default 1), per_page (default 20), search (optional)
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can view users"}), 403

    try:
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 1000)  # Max 1000 per page
        search = request.args.get('search', '').strip()
        
        query = User.query
        
        if search:
            query = query.filter(User.email.ilike(f'%{search}%'))
        
        pagination = query.order_by(User.id.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        users = []
        for user in pagination.items:
            # Return complete user information for admin interface
            users.append({
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "phone": user.phone,
                "country": user.country,
                "profile_image": user.profile_image,
                "is_admin": user.is_admin,
                "email_verified": user.email_verified,
                "has_journal_access": user.has_journal_access,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "updated_at": user.updated_at.isoformat() if user.updated_at else None,
                # Additional computed fields
                "profiles_count": len(user.profiles),
                "trades_count": len(user.journal_entries),
                "last_activity": user.updated_at.isoformat() if user.updated_at else None
            })
        
        result = {
            "users": users,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages,
                "has_next": pagination.has_next,
                "has_prev": pagination.has_prev
            }
        }
        
        log_admin_action("LIST_USERS", f"Listed {len(users)} users, page {page}")
        return jsonify(result), 200
        
    except Exception as e:
        current_app.logger.error(f"Error listing users: {e}")
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/users/<int:user_id>', methods=['GET'])
@jwt_required()
@rate_limit_admin(max_requests=20, window_seconds=60)
def get_user_details(user_id):
    """
    Admin-only: Get detailed user information by ID.
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can view user details"}), 403

    try:
        user = User.query.get_or_404(user_id)
        
        # Get user's profiles and trades
        profiles = Profile.query.filter_by(user_id=user_id).all()
        trades = JournalEntry.query.filter_by(user_id=user_id).order_by(JournalEntry.id.desc()).limit(10).all()
        journals = JournalEntry.query.filter_by(user_id=user_id).order_by(JournalEntry.id.desc()).limit(5).all()
        
        user_data = {
            "id": user.id,
            "email": user.email,  # Full email for admin view
            "full_name": user.full_name,
            "phone": user.phone,
            "country": user.country,
            "profile_image": user.profile_image,
            "is_admin": user.is_admin,
            "email_verified": user.email_verified,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
            "profiles_count": len(profiles),
            "trades_count": JournalEntry.query.filter_by(user_id=user_id).count(),
            "journals_count": JournalEntry.query.filter_by(user_id=user_id).count(),
            "profiles": [
                {
                    "id": profile.id,
                    "name": profile.name,
                    "description": profile.description,
                    "is_active": profile.is_active,
                    "created_at": profile.created_at.isoformat() if profile.created_at else None
                }
                for profile in profiles
            ],
            "recent_trades": [
                {
                    "id": trade.id,
                    "symbol": trade.symbol,
                    "direction": trade.direction,
                    "entry_price": trade.entry_price,
                    "exit_price": trade.exit_price,
                    "pnl": trade.pnl,
                    "strategy": trade.strategy,
                    "setup": trade.setup,
                    "date": trade.date.isoformat() if trade.date else None,
                    "created_at": trade.created_at.isoformat() if trade.created_at else None
                }
                for trade in trades
            ]
        }
        
        log_admin_action("VIEW_USER_DETAILS", f"Viewed details for user {user_id}")
        return jsonify(user_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting user details: {e}")
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/users', methods=['POST'])
@jwt_required()
@rate_limit_admin(max_requests=5, window_seconds=60)
def create_user():
    """
    Admin-only: Create a new user.
    Expect JSON: { email, password, is_admin (boolean) }
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can create users"}), 403

    try:
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        full_name = data.get('full_name', '').strip()
        phone = data.get('phone', '').strip()
        country = data.get('country', '').strip()
        profile_image = data.get('profile_image', '').strip()
        is_admin_flag = bool(data.get('is_admin', False))

        if not email or not password:
            return jsonify({"error": "Must include email and password"}), 400

        # Validate email format
        if '@' not in email or '.' not in email:
            return jsonify({"error": "Invalid email format"}), 400

        # Validate password strength
        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters long"}), 400

        if User.query.filter_by(email=email).first():
            return jsonify({"error": "Email already in use"}), 400

        hashed_pw = generate_password_hash(password)
        new_user = User()
        new_user.email = email
        new_user.password = hashed_pw
        new_user.full_name = full_name if full_name else None
        new_user.phone = phone if phone else None
        new_user.country = country if country else None
        new_user.profile_image = profile_image if profile_image else None
        new_user.is_admin = is_admin_flag
        db.session.add(new_user)
        db.session.commit() 

        log_admin_action("CREATE_USER", f"Created user {email} (admin: {is_admin_flag})")
        
        return jsonify({
            "message": "User created successfully",
            "user": {
                "id": new_user.id,
                "email": new_user.email,
                "full_name": new_user.full_name,
                "phone": new_user.phone,
                "country": new_user.country,
                "profile_image": new_user.profile_image,
                "is_admin": new_user.is_admin,
                "email_verified": new_user.email_verified,
                "created_at": new_user.created_at.isoformat() if new_user.created_at else None
            }
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error creating user: {e}")
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
@jwt_required()
@rate_limit_admin(max_requests=10, window_seconds=60)
def update_user(user_id):
    """
    Admin-only: Update user information.
    Expect JSON: { email (optional), is_admin (optional) }
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can update users"}), 403

    try:
        user = User.query.get_or_404(user_id)
        data = request.get_json() or {}
        
        if 'email' in data:
            new_email = data['email'].strip().lower()
            if '@' not in new_email or '.' not in new_email:
                return jsonify({"error": "Invalid email format"}), 400
            
            # Check if email is already taken by another user
            existing_user = User.query.filter_by(email=new_email).first()
            if existing_user and existing_user.id != user_id:
                return jsonify({"error": "Email already in use"}), 400
            
            user.email = new_email
        
        if 'is_admin' in data:
            user.is_admin = bool(data['is_admin'])
        if 'email_verified' in data:
            user.email_verified = bool(data['email_verified'])
        
        db.session.commit()
        
        log_admin_action("UPDATE_USER", f"Updated user {user_id}")
        
        return jsonify({
            "message": "User updated successfully",
            "user": {
                "id": user.id,
                "email": user.email,
                "is_admin": user.is_admin
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error updating user: {e}")
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
@rate_limit_admin(max_requests=3, window_seconds=60)
def delete_user(user_id):
    """
    Admin-only: Delete an existing user by ID.
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can delete users"}), 403

    try:
        user = User.query.get_or_404(user_id)
        user_email = user.email
        
        # Prevent admin from deleting themselves
        current_user_id = int(get_jwt_identity())
        if user_id == current_user_id:
            return jsonify({"error": "Cannot delete your own account"}), 400
        
        db.session.delete(user)
        db.session.commit()
        
        log_admin_action("DELETE_USER", f"Deleted user {user_id} ({user_email})")
        
        return jsonify({"message": f"User {user_email} deleted successfully"}), 200
        
    except Exception as e:
        current_app.logger.error(f"Error deleting user: {e}")
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/logs', methods=['GET'])
@jwt_required()
@rate_limit_admin(max_requests=10, window_seconds=60)
def get_admin_logs():
    """
    Admin-only: Get recent admin action logs.
    Query params: limit (default 50, max 100)
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can view logs"}), 403

    try:
        limit = min(request.args.get('limit', 50, type=int), 100)
        
        # Read admin logs from file
        logs = []
        try:
            with open('admin_access.log', 'r') as f:
                lines = f.readlines()
                for line in lines[-limit:]:
                    logs.append(line.strip())
        except FileNotFoundError:
            logs = ["No admin logs found"]
        
        log_admin_action("VIEW_LOGS", f"Viewed {len(logs)} log entries")
        
        return jsonify({
            "logs": logs,
            "count": len(logs)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting admin logs: {e}")
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/system/health', methods=['GET'])
@jwt_required()
@rate_limit_admin(max_requests=30, window_seconds=60)
def system_health():
    """
    Admin-only: Get system health information.
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can view system health"}), 403

    try:
        # Test database connection
        db_status = "healthy"
        try:
            db.session.execute(db.text("SELECT 1"))
        except Exception as e:
            db_status = f"error: {str(e)}"
        
        # Get basic system info
        health_data = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "database": {
                "status": db_status,
                "total_users": User.query.count(),
                "total_trades": JournalEntry.query.count()
            },
            "environment": current_app.config.get('ENV', 'development'),
            "debug_mode": current_app.config.get('DEBUG', False)
        }
        
        log_admin_action("VIEW_SYSTEM_HEALTH", f"System health check - DB: {db_status}")
        
        return jsonify(health_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error in system health check: {e}")
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/system/metrics', methods=['GET'])
@jwt_required()
@rate_limit_admin(max_requests=30, window_seconds=60)
def system_metrics():
    """
    Admin-only: Get detailed system metrics including CPU, memory, disk usage.
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can view system metrics"}), 403

    try:
        if PSUTIL_AVAILABLE:
            # Get system metrics using psutil
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # Get system uptime
            uptime_seconds = time.time() - psutil.boot_time()
            uptime_hours = uptime_seconds / 3600
            
            # Get load average (Linux only)
            try:
                load_avg = psutil.getloadavg()
            except:
                load_avg = [0, 0, 0]
            
            metrics_data = {
                "cpu": {
                    "percent": cpu_percent,
                    "count": psutil.cpu_count()
                },
                "memory": {
                    "total": memory.total,
                    "available": memory.available,
                    "percent": memory.percent,
                    "used": memory.used
                },
                "disk": {
                    "total": disk.total,
                    "used": disk.used,
                    "free": disk.free,
                    "percent": (disk.used / disk.total) * 100
                },
                "uptime": {
                    "seconds": uptime_seconds,
                    "hours": uptime_hours,
                    "formatted": f"{int(uptime_hours)}h {int((uptime_hours % 1) * 60)}m"
                },
                "load_average": load_avg,
                "timestamp": datetime.now().isoformat()
            }
        else:
            # Fallback when psutil is not available
            metrics_data = {
                "cpu": {
                    "percent": 0,
                    "count": 0
                },
                "memory": {
                    "total": 0,
                    "available": 0,
                    "percent": 0,
                    "used": 0
                },
                "disk": {
                    "total": 0,
                    "used": 0,
                    "free": 0,
                    "percent": 0
                },
                "uptime": {
                    "seconds": 0,
                    "hours": 0,
                    "formatted": "N/A"
                },
                "load_average": [0, 0, 0],
                "timestamp": datetime.now().isoformat(),
                "note": "System metrics disabled - psutil not available"
            }
        
        if PSUTIL_AVAILABLE:
            log_admin_action("VIEW_SYSTEM_METRICS", f"System metrics - CPU: {cpu_percent}%, Memory: {memory.percent}%")
        else:
            log_admin_action("VIEW_SYSTEM_METRICS", "System metrics disabled - psutil not available")
        
        return jsonify(metrics_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting system metrics: {e}")
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/activity', methods=['GET'])
@jwt_required()
@rate_limit_admin(max_requests=20, window_seconds=60)
def get_recent_activity():
    """
    Admin-only: Get recent admin activities for the dashboard.
    Query params: limit (default 10, max 50)
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can view activity"}), 403

    try:
        limit = min(request.args.get('limit', 10, type=int), 50)
        
        # Get recent activities
        activities = recent_activities[-limit:] if recent_activities else []
        
        # Format activities for frontend
        formatted_activities = []
        for activity in activities:
            # Get user email for display
            user = User.query.get(activity['user_id'])
            user_email = user.email if user else f"User {activity['user_id']}"
            
            formatted_activities.append({
                "action": activity['action'],
                "details": activity['details'],
                "user": user_email,
                "timestamp": activity['timestamp']
            })
        
        log_admin_action("VIEW_ACTIVITY", f"Viewed {len(formatted_activities)} activities")
        
        return jsonify({
            "activities": formatted_activities,
            "count": len(formatted_activities)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting recent activity: {e}")
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/users/bulk', methods=['POST'])
@jwt_required()
@rate_limit_admin(max_requests=5, window_seconds=60)
def bulk_user_operations():
    """
    Admin-only: Perform bulk operations on users.
    Expect JSON: { action: "delete"|"activate"|"deactivate", user_ids: [1,2,3] }
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can perform bulk operations"}), 403

    try:
        data = request.get_json() or {}
        action = data.get('action')
        user_ids = data.get('user_ids', [])
        
        if not action or not user_ids:
            return jsonify({"error": "Must provide action and user_ids"}), 400
        
        if action not in ['delete', 'activate', 'deactivate']:
            return jsonify({"error": "Invalid action. Must be delete, activate, or deactivate"}), 400
        
        current_user_id = int(get_jwt_identity())
        affected_users = []
        
        for user_id in user_ids:
            if user_id == current_user_id:
                continue  # Skip current user
                
            user = User.query.get(user_id)
            if not user:
                continue
                
            if action == 'delete':
                db.session.delete(user)
                affected_users.append(user.email)
            elif action == 'activate':
                user.email_verified = True
                affected_users.append(user.email)
            elif action == 'deactivate':
                user.email_verified = False
                affected_users.append(user.email)
        
        db.session.commit()
        
        log_admin_action(f"BULK_{action.upper()}", f"Bulk {action} on {len(affected_users)} users")
        
        return jsonify({
            "message": f"Bulk {action} completed successfully",
            "affected_users": affected_users,
            "count": len(affected_users)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error in bulk user operations: {e}")
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500

@admin_bp.route('/users/export', methods=['GET'])
@jwt_required()
@rate_limit_admin(max_requests=5, window_seconds=60)
def export_users():
    """
    Admin-only: Export users data in CSV format.
    Query params: format (default 'csv')
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can export users"}), 403

    try:
        export_format = request.args.get('format', 'csv').lower()
        
        if export_format != 'csv':
            return jsonify({"error": "Only CSV format is supported"}), 400
        
        # Get all users
        users = User.query.all()
        
        # Create CSV data
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(['ID', 'Email', 'Full Name', 'Phone', 'Country', 'Profile Image', 'Is Admin', 'Email Verified', 'Profiles Count', 'Trades Count', 'Created At', 'Updated At'])
        
        # Write user data
        for user in users:
            writer.writerow([
                user.id,
                user.email,
                user.full_name or '',
                user.phone or '',
                user.country or '',
                user.profile_image or '',
                user.is_admin,
                user.email_verified,
                len(user.profiles),
                len(user.journal_entries),
                user.created_at.isoformat() if user.created_at else '',
                user.updated_at.isoformat() if user.updated_at else ''
            ])
        
        output.seek(0)
        
        log_admin_action("EXPORT_USERS", f"Exported {len(users)} users to CSV")
        
        return send_file(
            io.BytesIO(output.getvalue().encode('utf-8')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'users-export-{datetime.now().strftime("%Y%m%d-%H%M%S")}.csv'
        )
        
    except Exception as e:
        current_app.logger.error(f"Error exporting users: {e}")
        return jsonify({"error": "Internal server error"}), 500

# Enhanced dashboard endpoint with more comprehensive data
@admin_bp.route('/dashboard/enhanced', methods=['GET'])
@jwt_required()
@rate_limit_admin(max_requests=20, window_seconds=60)
def enhanced_dashboard():
    """
    Admin-only: Get enhanced dashboard with more detailed statistics.
    """
    if not is_admin_user():
        return jsonify({"error": "Only admins can access enhanced dashboard"}), 403

    try:
        # Get comprehensive statistics
        total_users = User.query.count()
        active_users_30d = User.query.filter(
            User.created_at >= datetime.now() - timedelta(days=30)
        ).count()
        total_trades = JournalEntry.query.count()
        admin_users = User.query.filter_by(is_admin=True).count()
        
        # Get recent statistics
        users_today = User.query.filter(
            User.created_at >= datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        ).count()
        
        trades_today = JournalEntry.query.filter(
            JournalEntry.created_at >= datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        ).count()
        
        # Calculate growth rates
        users_last_week = User.query.filter(
            User.created_at >= datetime.now() - timedelta(days=7)
        ).count()
        
        users_last_month = User.query.filter(
            User.created_at >= datetime.now() - timedelta(days=30)
        ).count()
        
        # Get system metrics
        if PSUTIL_AVAILABLE:
            try:
                cpu_percent = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                disk = psutil.disk_usage('/')
            except:
                cpu_percent = 0
                memory = type('obj', (object,), {'percent': 0})()
                disk = type('obj', (object,), {'percent': 0})()
        else:
            cpu_percent = 0
            memory = type('obj', (object,), {'percent': 0})()
            disk = type('obj', (object,), {'percent': 0})()
        
        enhanced_data = {
            "total_users": total_users,
            "active_users": active_users_30d,
            "total_trades": total_trades,
            "admin_users": admin_users,
            "users_today": users_today,
            "trades_today": trades_today,
            "growth": {
                "users_this_week": users_last_week,
                "users_this_month": users_last_month,
                "weekly_growth": round(((users_last_week - (users_last_month - users_last_week)) / max(users_last_month - users_last_week, 1)) * 100, 1)
            },
            "system": {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "disk_percent": (disk.used / disk.total) * 100 if hasattr(disk, 'total') and disk.total > 0 else 0,
                "uptime": time.time() - psutil.boot_time()
            },
            "recent_activity": recent_activities[-5:] if recent_activities else []
        }
        
        log_admin_action("VIEW_ENHANCED_DASHBOARD", f"Enhanced dashboard - {total_users} users, {total_trades} trades")
        
        return jsonify(enhanced_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error in enhanced dashboard: {e}")
        return jsonify({"error": "Internal server error"}), 500


# ─── BULK USER IMPORT ──────────────────────────────────────────────────────

@admin_bp.route('/import-users', methods=['POST'])
@jwt_required()
@admin_required
@rate_limit_admin(max_requests=3, window_seconds=300)  # 3 imports per 5 minutes
def import_bulk_users():
    """
    Import multiple users from CSV/Excel file
    Expected format: email,password,full_name,phone,country,is_admin,group_name,account_type
    
    Account Types:
    - individual: Regular student accounts (sees only their own data)
    - group: Group accounts (sees ALL data from group members)  
    - admin: Admin accounts (full access)
    
    Group System:
    - Students log in individually: student1-group1@school.com
    - Group account sees ALL student data: group1@school.com
    - No conflicts, no crashes!
    """
    try:
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Validate file type
        allowed_extensions = {'.csv', '.xlsx', '.xls'}
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            return jsonify({'error': 'Only CSV and Excel files are allowed'}), 400
        
        imported_count = 0
        errors = []
        skipped_count = 0
        
        try:
            if file_ext == '.csv':
                # Read CSV file
                stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
                csv_input = csv.DictReader(stream)
                rows = list(csv_input)
            else:
                # Read Excel file
                import pandas as pd
                df = pd.read_excel(file)
                rows = df.to_dict('records')
            
            # Process each row
            for row_num, row in enumerate(rows, start=2):  # Start at 2 because row 1 is header
                try:
                    # Extract and validate data
                    email = str(row.get('email', '')).strip().lower()
                    password = str(row.get('password', '')).strip()
                    full_name = str(row.get('full_name', '')).strip()
                    phone = str(row.get('phone', '')).strip()
                    country = str(row.get('country', '')).strip()
                    is_admin = str(row.get('is_admin', 'false')).strip().lower() in ['true', '1', 'yes']
                    group_name = str(row.get('group_name', '')).strip()
                    account_type = str(row.get('account_type', 'individual')).strip().lower()
                    
                    # Validate account_type
                    if account_type not in ['individual', 'group', 'admin']:
                        account_type = 'individual'
                    
                    # Validate required fields
                    if not email or not password:
                        errors.append(f"Row {row_num}: Email and password are required")
                        continue
                    
                    # Check if user already exists
                    existing_user = User.query.filter_by(email=email).first()
                    if existing_user:
                        skipped_count += 1
                        errors.append(f"Row {row_num}: User {email} already exists - skipped")
                        continue
                    
                    # Validate email format
                    if '@' not in email or '.' not in email:
                        errors.append(f"Row {row_num}: Invalid email format: {email}")
                        continue
                    
                    # Validate password strength
                    if len(password) < 8:
                        errors.append(f"Row {row_num}: Password must be at least 8 characters")
                        continue
                    
                    # Handle group assignment
                    group_id = None
                    if group_name:
                        # Find or create group
                        group = Group.query.filter_by(name=group_name).first()
                        if not group:
                            group = Group(name=group_name, description=f"Auto-created group: {group_name}")
                            db.session.add(group)
                            db.session.flush()  # Get the group ID
                        group_id = group.id
                    
                    # Create new user
                    hashed_password = generate_password_hash(password)
                    
                    new_user = User(
                        email=email,
                        password=hashed_password,
                        full_name=full_name if full_name else None,
                        phone=phone if phone else None,
                        country=country if country else None,
                        is_admin=is_admin,
                        email_verified=True,  # Auto-verify imported users
                        group_id=group_id,  # Assign to group
                        account_type=account_type  # Set account type
                    )
                    
                    db.session.add(new_user)
                    db.session.flush()  # Get the user ID
                    
                    # Create default profile for the user
                    default_profile = Profile(
                        user_id=new_user.id,
                        name="Default Profile",
                        description="Default trading profile",
                        is_active=True
                    )
                    db.session.add(default_profile)
                    
                    imported_count += 1
                    
                except Exception as row_error:
                    errors.append(f"Row {row_num}: {str(row_error)}")
                    continue
            
            # Commit all changes
            db.session.commit()
            
            # Log the import activity
            activity = {
                "action": "bulk_user_import",
                "user": get_jwt_identity(),
                "timestamp": datetime.utcnow().isoformat(),
                "details": f"Imported {imported_count} users, skipped {skipped_count}, {len(errors)} errors",
                "imported_count": imported_count,
                "skipped_count": skipped_count,
                "error_count": len(errors)
            }
            recent_activities.insert(0, activity)
            if len(recent_activities) > 100:
                recent_activities.pop()
            
            return jsonify({
                'success': True,
                'message': f'Import completed successfully',
                'imported_count': imported_count,
                'skipped_count': skipped_count,
                'error_count': len(errors),
                'errors': errors[:10] if errors else []  # Return first 10 errors
            }), 200
            
        except Exception as parse_error:
            return jsonify({'error': f'Error parsing file: {str(parse_error)}'}), 400
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error in bulk user import: {e}")
        return jsonify({'error': 'Internal server error during import'}), 500


@admin_bp.route('/download-user-template', methods=['GET'])
@jwt_required()
@admin_required
def download_user_template():
    """
    Download CSV template for bulk user import
    """
    try:
        # Create CSV template
        template_data = [
            ['email', 'password', 'full_name', 'phone', 'country', 'is_admin', 'group_name', 'account_type'],
            ['student1-group1@school.com', 'StudentPass123!', 'John Smith', '+1234567890', 'United States', 'false', 'Group 1', 'individual'],
            ['student2-group1@school.com', 'StudentPass123!', 'Sarah Johnson', '+1234567891', 'United States', 'false', 'Group 1', 'individual'],
            ['student3-group1@school.com', 'StudentPass123!', 'Mike Wilson', '+1234567892', 'United States', 'false', 'Group 1', 'individual'],
            ['group1@school.com', 'GroupPass123!', 'Group 1 Account', '+1234567896', 'United States', 'false', 'Group 1', 'group'],
            ['student1-group2@school.com', 'StudentPass123!', 'Lisa Brown', '+1234567893', 'United States', 'false', 'Group 2', 'individual'],
            ['student2-group2@school.com', 'StudentPass123!', 'David Chen', '+1234567894', 'United States', 'false', 'Group 2', 'individual'],
            ['group2@school.com', 'GroupPass123!', 'Group 2 Account', '+1234567897', 'United States', 'false', 'Group 2', 'group'],
            ['teacher1@school.com', 'TeacherPass123!', 'Dr. Emily Davis', '+1234567895', 'United States', 'true', '', 'admin']
        ]
        
        # Create CSV string
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerows(template_data)
        csv_string = output.getvalue()
        output.close()
        
        # Create response
        response = make_response(csv_string)
        response.headers['Content-Type'] = 'text/csv'
        response.headers['Content-Disposition'] = 'attachment; filename=bulk_users_template.csv'
        
        return response
        
    except Exception as e:
        current_app.logger.error(f"Error downloading template: {e}")
        return jsonify({'error': 'Error generating template'}), 500


# ─── GROUP MANAGEMENT ──────────────────────────────────────────────────────

@admin_bp.route('/groups', methods=['GET'])
@jwt_required()
@admin_required
def get_groups():
    """
    Get all groups with member counts and basic stats
    """
    try:
        groups = Group.query.filter_by(is_active=True).all()
        
        groups_data = []
        for group in groups:
            # Count members
            member_count = User.query.filter_by(group_id=group.id).count()
            
            # Get basic stats
            member_ids = [user.id for user in group.users]
            total_trades = 0
            if member_ids:
                total_trades = JournalEntry.query.filter(JournalEntry.user_id.in_(member_ids)).count()
            
            groups_data.append({
                'id': group.id,
                'name': group.name,
                'description': group.description,
                'member_count': member_count,
                'total_trades': total_trades,
                'created_at': group.created_at.isoformat() if group.created_at else None
            })
        
        return jsonify({
            'success': True,
            'groups': groups_data
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting groups: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@admin_bp.route('/groups/<int:group_id>/analytics', methods=['GET'])
@jwt_required()
@admin_required
def get_group_analytics(group_id):
    """
    Get comprehensive analytics for a specific group
    Aggregates data from all members in the group
    """
    try:
        # Validate group exists
        group = Group.query.get(group_id)
        if not group:
            return jsonify({'error': 'Group not found'}), 404
        
        # Get all users in this group
        group_users = User.query.filter_by(group_id=group_id).all()
        user_ids = [user.id for user in group_users]
        
        if not user_ids:
            return jsonify({
                'success': True,
                'group': {
                    'id': group.id,
                    'name': group.name,
                    'description': group.description,
                    'member_count': 0
                },
                'analytics': {
                    'total_trades': 0,
                    'total_pnl': 0,
                    'win_rate': 0,
                    'members': []
                }
            }), 200
        
        # Get all trades for group members
        trades = JournalEntry.query.filter(JournalEntry.user_id.in_(user_ids)).all()
        
        # Calculate group analytics
        total_trades = len(trades)
        total_pnl = sum(trade.pnl for trade in trades if trade.pnl is not None)
        winning_trades = len([trade for trade in trades if trade.pnl and trade.pnl > 0])
        win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0
        
        # Individual member stats
        member_stats = []
        for user in group_users:
            user_trades = [trade for trade in trades if trade.user_id == user.id]
            user_total_trades = len(user_trades)
            user_total_pnl = sum(trade.pnl for trade in user_trades if trade.pnl is not None)
            user_winning_trades = len([trade for trade in user_trades if trade.pnl and trade.pnl > 0])
            user_win_rate = (user_winning_trades / user_total_trades * 100) if user_total_trades > 0 else 0
            
            member_stats.append({
                'user_id': user.id,
                'email': user.email,
                'full_name': user.full_name,
                'total_trades': user_total_trades,
                'total_pnl': round(user_total_pnl, 2),
                'win_rate': round(user_win_rate, 2),
                'winning_trades': user_winning_trades,
                'losing_trades': user_total_trades - user_winning_trades
            })
        
        # Sort members by performance (total_pnl)
        member_stats.sort(key=lambda x: x['total_pnl'], reverse=True)
        
        # Group performance by time periods
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        
        # Last 30 days trades
        last_30_days = now - timedelta(days=30)
        recent_trades = [trade for trade in trades if trade.created_at and trade.created_at >= last_30_days]
        recent_pnl = sum(trade.pnl for trade in recent_trades if trade.pnl is not None)
        
        return jsonify({
            'success': True,
            'group': {
                'id': group.id,
                'name': group.name,
                'description': group.description,
                'member_count': len(group_users),
                'created_at': group.created_at.isoformat() if group.created_at else None
            },
            'analytics': {
                'total_trades': total_trades,
                'total_pnl': round(total_pnl, 2),
                'win_rate': round(win_rate, 2),
                'winning_trades': winning_trades,
                'losing_trades': total_trades - winning_trades,
                'recent_trades_30d': len(recent_trades),
                'recent_pnl_30d': round(recent_pnl, 2),
                'average_pnl_per_trade': round(total_pnl / total_trades, 2) if total_trades > 0 else 0
            },
            'members': member_stats
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting group analytics: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@admin_bp.route('/groups', methods=['POST'])
@jwt_required()
@admin_required
def create_group():
    """
    Create a new group
    """
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        
        if not name:
            return jsonify({'error': 'Group name is required'}), 400
        
        # Check if group already exists
        existing_group = Group.query.filter_by(name=name).first()
        if existing_group:
            return jsonify({'error': 'Group name already exists'}), 400
        
        # Create new group
        new_group = Group(
            name=name,
            description=description if description else f"Group: {name}"
        )
        
        db.session.add(new_group)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Group created successfully',
            'group': {
                'id': new_group.id,
                'name': new_group.name,
                'description': new_group.description
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating group: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@admin_bp.route('/users/<int:user_id>/login-as', methods=['POST'])
@jwt_required()
@admin_required
@rate_limit_admin(max_requests=10, window_seconds=60)
def login_as_user(user_id):
    """Generate a login token for admin to login as a specific user"""
    try:
        # Get the target user
        target_user = User.query.get(user_id)
        if not target_user:
            return jsonify({"error": "User not found"}), 404
        
        # Get the admin user making the request
        admin_user_id = get_jwt_identity()
        admin_user = User.query.get(admin_user_id)
        
        # Check if user has an active profile
        active_profile = Profile.query.filter_by(user_id=target_user.id, is_active=True).first()
        has_active_profile = active_profile is not None
        
        # Create access and refresh tokens for the target user
        access_token = create_access_token(
            identity=str(target_user.id),
            additional_claims={"is_admin": target_user.is_admin}
        )
        refresh_token = create_refresh_token(
            identity=str(target_user.id),
            additional_claims={"is_admin": target_user.is_admin}
        )
        
        # Log the admin action
        log_admin_action("Login as user", f"Admin {admin_user.email} logged in as user {target_user.email}")
        
        return jsonify({
            "message": "Login token generated successfully",
            "token": access_token,
            "refresh_token": refresh_token,
            "user": {
                "id": target_user.id,
                "email": target_user.email,
                "email_verified": target_user.email_verified,
                "is_admin": target_user.is_admin,
                "full_name": target_user.full_name,
                "has_active_profile": has_active_profile
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error generating login token: {str(e)}")
        return jsonify({"error": "Failed to generate login token"}), 500
