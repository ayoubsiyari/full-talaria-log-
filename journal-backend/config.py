import os
from dotenv import load_dotenv
from datetime import timedelta

# Load environment variables from .env file
load_dotenv()

_WEAK_SECRET_MARKERS = frozenset({
    'your-super-secret-key-change-this-in-production',
    'your-jwt-secret-key-change-this-in-production',
    'dev-secret-change-me',
    'jwt-secret-change-me',
})

# docker-compose.yml defaults (32+ chars) — allowed so fresh deploys boot without a custom .env
_DOCKER_COMPOSE_SAFE_SECRETS = frozenset({
    'local-docker-journal-secret-minimum-32-characters-long',
    'local-docker-journal-jwt-secret-minimum-32-characters',
})


def _is_weak_secret(value: str) -> bool:
    if not value:
        return True
    if value in _DOCKER_COMPOSE_SAFE_SECRETS:
        return False
    if value in _WEAK_SECRET_MARKERS:
        return True
    return len(value) < 32


def assert_production_security(app):
    """Fail fast in production if secrets or database are left in a dangerous default state."""
    if os.environ.get('DISABLE_PROD_SECURITY_CHECK', '').strip().lower() in ('1', 'true', 'yes', 'on'):
        print('⚠️  DISABLE_PROD_SECURITY_CHECK is set — production security assertions skipped')
        return
    if app.config.get('ENV') != 'production':
        return
    sk = app.config.get('SECRET_KEY') or ''
    jk = app.config.get('JWT_SECRET_KEY') or ''
    if _is_weak_secret(sk):
        raise RuntimeError(
            'Production requires SECRET_KEY: set a random value of at least 32 characters '
            '(not a placeholder). Or set DISABLE_PROD_SECURITY_CHECK=1 only for emergencies.'
        )
    if _is_weak_secret(jk):
        raise RuntimeError(
            'Production requires JWT_SECRET_KEY: set a random value of at least 32 characters '
            '(not a placeholder). Or set DISABLE_PROD_SECURITY_CHECK=1 only for emergencies.'
        )
    uri = app.config.get('SQLALCHEMY_DATABASE_URI') or ''
    if not uri.startswith(('postgresql://', 'postgresql+psycopg2://', 'postgres://')):
        raise RuntimeError(
            'Production requires PostgreSQL (DATABASE_URL must start with postgresql:// or postgres://). '
            'Or set DISABLE_PROD_SECURITY_CHECK=1 only for emergencies.'
        )


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'your-super-secret-key-change-this-in-production')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-jwt-secret-key-change-this-in-production')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3001')
    
    # Default to SQLite, will be overridden in production
    instance_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'instance'))
    os.makedirs(instance_path, exist_ok=True)
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        f'sqlite:///{os.path.join(instance_path, "journal.db")}')
    CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
    
    # Environment settings
    DEBUG = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    ENV = os.environ.get('FLASK_ENV', 'development')
    
    # Set JWT token expirations
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)  # 24 hours
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)  # 30 days

    # Auth hardening: accept the access JWT from EITHER the Authorization header
    # (legacy localStorage path) OR an httpOnly cookie set by the chart backend.
    # During rollout both work, so nothing breaks while clients migrate.
    # The cookie name must match the chart's JOURNAL_COOKIE_NAME ("journal_token").
    # CSRF protection is intentionally OFF here and enabled in a later phase
    # (double-submit token) once the frontend sends the X-CSRF-TOKEN header;
    # SameSite=Lax on the cookie provides interim cross-site protection.
    JWT_TOKEN_LOCATION = ['headers', 'cookies']
    JWT_ACCESS_COOKIE_NAME = os.environ.get('JOURNAL_COOKIE_NAME', 'journal_token')
    JWT_COOKIE_SECURE = os.environ.get('JWT_COOKIE_SECURE', 'False').lower() == 'true'
    JWT_COOKIE_SAMESITE = os.environ.get('JWT_COOKIE_SAMESITE', 'Lax')
    # Double-submit CSRF for cookie-authenticated writes. flask-jwt-extended ONLY
    # enforces this for tokens read from cookies (state-changing methods) — tokens
    # presented via the Authorization header are exempt, so the legacy localStorage
    # path keeps working unchanged until the frontend fully switches to the cookie.
    # The chart embeds a matching `csrf` claim and sets a readable csrf_access_token
    # cookie; the frontend echoes it in the X-CSRF-TOKEN header.
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_ACCESS_CSRF_COOKIE_NAME = os.environ.get('JOURNAL_CSRF_COOKIE_NAME', 'csrf_access_token')
    JWT_CSRF_IN_COOKIES = True

def init_prod_config(app):
    """Applies production-specific configurations from environment variables."""
    # Database configuration
    if os.environ.get('DATABASE_URL'):
        app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
        print("✅ Using PostgreSQL database (production mode)")
    else:
        print("⚠️  Using SQLite database (development mode)")

    # Connection pool tuning (Postgres only — SQLite uses a non-QueuePool and
    # rejects pool_size). pool_pre_ping drops connections the DB closed while
    # idle so requests don't 500 with "server closed the connection"; the rest
    # bound how many connections each gunicorn worker can hold.
    uri = app.config.get('SQLALCHEMY_DATABASE_URI') or ''
    if uri.startswith(('postgresql://', 'postgresql+psycopg2://', 'postgres://')):
        def _int_env(name, default):
            try:
                return int(os.environ.get(name, str(default)))
            except (TypeError, ValueError):
                return default
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
            'pool_size': _int_env('DB_POOL_SIZE', 10),
            'max_overflow': _int_env('DB_MAX_OVERFLOW', 20),
            'pool_timeout': _int_env('DB_POOL_TIMEOUT', 30),
            'pool_recycle': _int_env('DB_POOL_RECYCLE', 1800),
            'pool_pre_ping': True,
        }
        print("✅ DB connection pool configured (pre-ping on, recycle 1800s)")

    # CORS configuration
    cors_origins_env = os.environ.get('CORS_ALLOWED_ORIGINS')
    if cors_origins_env:
        app.config['CORS_ORIGINS'] = cors_origins_env.split(',')
        print(f"✅ CORS configured for production: {app.config['CORS_ORIGINS']}")
    else:
        print(f"⚠️ CORS configured for development: {app.config['CORS_ORIGINS']}")

    # File upload settings
    app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_CONTENT_LENGTH', 16 * 1024 * 1024))  # 16MB max file size
    app.config['UPLOAD_FOLDER'] = os.environ.get('UPLOAD_FOLDER', 'uploads')

    assert_production_security(app)

