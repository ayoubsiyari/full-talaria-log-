"""Run DB schema patches once in the gunicorn master before workers fork."""

import os


def when_ready(server):
    # Avoid duplicate migrations when workers import app.py
    os.environ["TALARIA_SKIP_SCHEMA_ON_IMPORT"] = "1"
    from app import app
    from db_schema import ensure_security_schema, ensure_users_schema
    from models import db

    with app.app_context():
        db.create_all()
    ensure_users_schema(app)
    ensure_security_schema(app)
    server.log.info("journal-backend schema ready (master init)")
