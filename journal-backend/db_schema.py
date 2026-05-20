"""Lightweight schema patches for shared `users` table (journal + chart)."""

from sqlalchemy import inspect, text

from models import db
from user_public_id import backfill_missing_public_ids


def ensure_users_schema(app) -> None:
    """Add columns introduced after initial deploy (safe to run every startup)."""
    with app.app_context():
        try:
            engine = db.engine
            dialect = engine.dialect.name
            with engine.begin() as conn:
                insp = inspect(engine)
                if dialect == "postgresql":
                    conn.execute(
                        text(
                            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                            "dashboard_module_grants TEXT"
                        )
                    )
                    conn.execute(
                        text(
                            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                            "public_id VARCHAR(20)"
                        )
                    )
                    conn.execute(
                        text(
                            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_id "
                            "ON users (public_id) WHERE public_id IS NOT NULL"
                        )
                    )
                    conn.execute(
                        text(
                            "ALTER TABLE strategy_templates ADD COLUMN IF NOT EXISTS "
                            "publish_settings JSONB"
                        )
                    )
                    conn.execute(
                        text(
                            "ALTER TABLE strategy_templates ADD COLUMN IF NOT EXISTS "
                            "backtest_snapshot JSONB"
                        )
                    )
                    conn.execute(
                        text(
                            "ALTER TABLE strategy_templates ADD COLUMN IF NOT EXISTS "
                            "share_count INTEGER NOT NULL DEFAULT 0"
                        )
                    )
                    conn.execute(
                        text(
                            "CREATE TABLE IF NOT EXISTS template_likes ("
                            "id SERIAL PRIMARY KEY, "
                            "template_id INTEGER NOT NULL REFERENCES strategy_templates(id), "
                            "user_id INTEGER NOT NULL REFERENCES users(id), "
                            "created_at TIMESTAMP, "
                            "CONSTRAINT uq_template_like_user UNIQUE (template_id, user_id)"
                            ")"
                        )
                    )
                else:
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
                    if "public_id" not in cols:
                        conn.execute(
                            text("ALTER TABLE users ADD COLUMN public_id VARCHAR(20)")
                        )
                        try:
                            conn.execute(
                                text(
                                    "CREATE UNIQUE INDEX ix_users_public_id "
                                    "ON users (public_id)"
                                )
                            )
                        except Exception:
                            pass
                    if "strategy_templates" in insp.get_table_names():
                        st_cols = {c["name"] for c in insp.get_columns("strategy_templates")}
                        if "publish_settings" not in st_cols:
                            conn.execute(
                                text(
                                    "ALTER TABLE strategy_templates ADD COLUMN "
                                    "publish_settings JSON"
                                )
                            )
                        if "backtest_snapshot" not in st_cols:
                            conn.execute(
                                text(
                                    "ALTER TABLE strategy_templates ADD COLUMN "
                                    "backtest_snapshot JSON"
                                )
                            )
                        if "share_count" not in st_cols:
                            conn.execute(
                                text(
                                    "ALTER TABLE strategy_templates ADD COLUMN "
                                    "share_count INTEGER NOT NULL DEFAULT 0"
                                )
                            )
                    if "template_likes" not in insp.get_table_names():
                        conn.execute(
                            text(
                                "CREATE TABLE template_likes ("
                                "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                                "template_id INTEGER NOT NULL, "
                                "user_id INTEGER NOT NULL, "
                                "created_at DATETIME, "
                                "FOREIGN KEY(template_id) REFERENCES strategy_templates(id), "
                                "FOREIGN KEY(user_id) REFERENCES users(id), "
                                "UNIQUE(template_id, user_id)"
                                ")"
                            )
                        )
            app.logger.info(
                "schema patch applied (users public_id, strategy_templates publish)"
            )
            try:
                n = backfill_missing_public_ids()
                if n:
                    app.logger.info("assigned public_id to %s user(s)", n)
            except Exception as backfill_exc:
                app.logger.warning("public_id backfill skipped: %s", backfill_exc)
        except Exception as exc:
            app.logger.error("users schema patch failed: %s", exc)
