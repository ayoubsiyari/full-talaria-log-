import os
from dotenv import load_dotenv
from datetime import timedelta

# Load environment variables from .env file
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'your-super-secret-key-change-this-in-production')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-jwt-secret-key-change-this-in-production')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Default to SQLite, will be overridden in production
    instance_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'instance'))
    if not os.path.exists(instance_path):
        os.makedirs(instance_path)
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

def init_prod_config(app):
    """Applies production-specific configurations from environment variables."""
    # Database configuration
    if os.environ.get('DATABASE_URL'):
        app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
        print("✅ Using PostgreSQL database (production mode)")
    else:
        print("⚠️  Using SQLite database (development mode)")

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

