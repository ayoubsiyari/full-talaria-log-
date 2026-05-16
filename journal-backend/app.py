# app.py

from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required
from models import db
from config import Config, init_prod_config
from email_service import init_mail
import os

# 1️⃣ Import the Blueprint objects by name:
from routes.auth_routes import auth_bp
# Use the new modular journal routes package
from routes.journal import journal_bp
from routes.profile_routes import profile_bp
from routes.admin_routes import admin_bp  # <-- your new admin routes
from routes.strategy_routes import strategy_bp
from routes.feed_routes import feed_bp
from routes.template_routes import template_bp
from routes.feature_flags_routes import feature_flags_bp
from routes.subscription_routes import subscription_bp
from routes.chart_routes import chart_bp
from routes.paid_access import register_paid_journal_guard
from db_schema import ensure_users_schema

import jwt as pyjwt

app = Flask(__name__)
app.config.from_object(Config)

# Apply production-specific configurations from environment variables
init_prod_config(app)

# JWT setup
jwt = JWTManager(app)

# DB setup
db.init_app(app)
ensure_users_schema(app)

# Email setup
init_mail(app)

# CORS setup
if app.config.get('ENV') == 'production':
    # Production: Use specific origins from config
    cors_origins = app.config.get('CORS_ORIGINS', [])
    # Add common VPS patterns
    cors_origins.extend([
        'http://31.97.192.82',
        'https://31.97.192.82',
        'http://31.97.192.82:3000',
        'https://31.97.192.82:3000',
        'http://talaria-log.com',
        'https://talaria-log.com',
        'http://www.talaria-log.com',
        'https://www.talaria-log.com'
    ])
    CORS(app, origins=cors_origins, supports_credentials=True)
else:
    # Development: Allow all origins
    CORS(app, origins=['http://localhost:3000', 'http://127.0.0.1:3000', '*'], 
         supports_credentials=True, 
         allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'])

# Register routes
app.register_blueprint(auth_bp,    url_prefix='/api/auth')
app.register_blueprint(journal_bp, url_prefix='/api/journal')
app.register_blueprint(profile_bp, url_prefix='/api/profile')
app.register_blueprint(admin_bp,   url_prefix='/api/admin')   # ← register admin
app.register_blueprint(strategy_bp, url_prefix='/api')
app.register_blueprint(feed_bp, url_prefix='/api')
app.register_blueprint(template_bp, url_prefix='/api')
app.register_blueprint(feature_flags_bp, url_prefix='/api') # Strategy routes
app.register_blueprint(subscription_bp, url_prefix='/api/subscriptions')  # Subscription management
app.register_blueprint(chart_bp, url_prefix='/api/chart')  # Chart drawings

# Paid journal features (auth + subscription); public browse endpoints are skipped.
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

@app.route('/api/admin/dashboard-modules', methods=['GET'])
@jwt_required()
def dashboard_modules_catalog():
    from flask_jwt_extended import get_jwt_identity
    from models import User
    from dashboard_access import modules_catalog

    user = User.query.get(get_jwt_identity())
    if not user or not user.is_admin:
        return jsonify({"error": "Admin access required"}), 403
    return jsonify({"modules": modules_catalog()}), 200


@app.route('/', methods=['GET'])
def home():
    return {
        "status": "✅ Backend Running", 
        "cors_configured": True, 
        "environment": app.config.get('ENV', 'development'),
        "database": "PostgreSQL" if app.config.get('DATABASE_URL') else "SQLite"
    }

# JWT error handlers
@jwt.invalid_token_loader
def handle_invalid_token(e):
    if app.config.get('DEBUG'):
        print("❌ Invalid token error:", e)
    return jsonify({"error": "Invalid token"}), 422

@jwt.unauthorized_loader
def handle_missing_token(e):
    if app.config.get('DEBUG'):
        print("❌ Missing or malformed token")
    return jsonify({"error": "Missing or malformed token"}), 401

@app.route('/debug/verify-token', methods=['POST'])
def debug_verify_token():
    if not app.config.get('DEBUG'):
        return jsonify({"error": "Debug endpoint disabled in production"}), 404
        
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({"error": "No token provided"}), 400

    token = auth_header.split(' ')[1]
    secret = app.config.get('JWT_SECRET_KEY')

    try:
        decoded = pyjwt.decode(token, secret, algorithms=["HS256"])
        return jsonify({
            "status": "valid",
            "decoded": decoded,
        })
    except pyjwt.InvalidSignatureError:
        return jsonify({
            "status": "invalid_signature",
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        })

@app.before_request
def log_request_info():
    if app.config.get('DEBUG'):
        app.logger.debug('Headers: %s', request.headers)
        app.logger.debug('Body: %s', request.get_data())


@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    response.headers['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none'"
    proto = request.headers.get('X-Forwarded-Proto', '')
    if request.is_secure or proto.lower() == 'https':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response


# Add a catch-all route to handle OPTIONS for all paths
@app.route('/<path:path>', methods=['OPTIONS'])
def options_handler(path):
    response = make_response()
    if app.config.get('ENV') == 'production':
        origin = request.headers.get('Origin')
        cors_origins = app.config.get('CORS_ORIGINS', [])
        # Add common VPS patterns to allowed origins
        cors_origins.extend([
            'http://31.97.192.82',
            'https://31.97.192.82',
            'http://31.97.192.82:3000',
            'https://31.97.192.82:3000',
            'http://talaria-log.com',
            'https://talaria-log.com',
            'http://www.talaria-log.com',
            'https://www.talaria-log.com'
        ])
        if origin in cors_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
    else:
        # Development: Allow all origins
        response.headers['Access-Control-Allow-Origin'] = '*'
    
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Max-Age'] = '600'
    return response

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print("✅ Tables created:", db.metadata.tables.keys())
    
    # Production: Use environment port or default to 5000
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=app.config.get('DEBUG', False), host='0.0.0.0', port=port)

