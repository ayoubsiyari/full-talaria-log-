"""Lightweight schema patches for shared `users` table (journal + chart)."""

from sqlalchemy import inspect, text

from models import db


def ensure_users_schema(app) -> None:
    """Add columns introduced after initial deploy (safe to run every startup)."""
    with app.app_context():
        try:
            engine = db.engine
            dialect = engine.dialect.name
            with engine.begin() as conn:
                if dialect == "postgresql":
                    conn.execute(
                        text(
                            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                            "dashboard_module_grants TEXT"
                        )
                    )
                else:
                    insp = inspect(engine)
                    if "users" not in insp.get_table_names():
                        return
                    cols = {c["name"] for c in insp.get_columns("users")}
                    if "dashboard_module_grants" not in cols:
                        conn.execute(
                            text(
                                "ALTER TABLE users ADD COLUMN "
                                "dashboard_module_grants TEXT"
                            )
                        )
            app.logger.info("users schema patch applied (dashboard_module_grants)")
        except Exception as exc:
            app.logger.error("users schema patch failed: %s", exc)
