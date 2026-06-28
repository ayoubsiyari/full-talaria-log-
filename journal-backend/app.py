# app.py

import security_bootstrap

security_bootstrap.install_security_package()

try:
    from talaria_security.headers import apply_security_headers, generate_csp_nonce
except ImportError:
    import secrets

    def generate_csp_nonce():
        return secrets.token_urlsafe(16)

    def apply_security_headers(headers, *, nonce=None, https=False, api_mode=False):
        headers["X-Content-Type-Options"] = "nosniff"
        headers["X-Frame-Options"] = "DENY"
        if https:
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

from flask import Flask, jsonify, request, make_response, g
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from models import db
from config import Config, init_prod_config
from email_service import init_mail
import os

from routes.blueprint_setup import register_all_blueprints
from db_schema import ensure_users_schema, ensure_security_schema

import jwt as pyjwt

# Error tracking (opt-in): only initializes when SENTRY_DSN is set, so local/dev
# and any deploy without a DSN behave exactly as before. The Flask integration
# is auto-enabled by sentry-sdk when Flask is importable.
_SENTRY_DSN = os.environ.get('SENTRY_DSN', '').strip()
if _SENTRY_DSN:
    try:
        import sentry_sdk

        def _float_env(name, default):
            try:
                return float(os.environ.get(name, str(default)))
            except (TypeError, ValueError):
                return default

        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            environment=os.environ.get('SENTRY_ENVIRONMENT', os.environ.get('FLASK_ENV', 'production')),
            traces_sample_rate=_float_env('SENTRY_TRACES_SAMPLE_RATE', 0.0),
            send_default_pii=False,
        )
        print('✅ Sentry error tracking enabled (journal-backend)')
    except Exception as _exc:  # never let observability setup break boot
        print(f'⚠️  Sentry init skipped (journal-backend): {_exc}')

app = Flask(__name__)
app.config.from_object(Config)

# Apply production-specific configurations from environment variables
init_prod_config(app)

# JWT setup
jwt = JWTManager(app)

# DB setup
db.init_app(app)
if not os.environ.get("TALARIA_SKIP_SCHEMA_ON_IMPORT"):
    with app.app_context():
        db.create_all()
    ensure_users_schema(app)
    ensure_security_schema(app)

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

register_all_blueprints(app)


@app.route('/api/health', methods=['GET'])
def api_health():
    """Docker / load-balancer probe — no auth, no DB."""
    return jsonify({"ok": True, "service": "journal-backend"}), 200


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
def assign_csp_nonce():
    g.csp_nonce = generate_csp_nonce()


@app.before_request
def log_request_info():
    if app.config.get('DEBUG'):
        app.logger.debug('Headers: %s', request.headers)
        app.logger.debug('Body: %s', request.get_data())


@app.after_request
def add_security_headers(response):
    proto = request.headers.get('X-Forwarded-Proto', '')
    https = request.is_secure or proto.lower() == 'https'
    nonce = getattr(g, 'csp_nonce', None) or generate_csp_nonce()
    apply_security_headers(response.headers, nonce=nonce, https=https, api_mode=True)
    for header in ('Server', 'X-Powered-By', 'X-AspNet-Version', 'X-AspNetMvc-Version'):
        response.headers.pop(header, None)
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

