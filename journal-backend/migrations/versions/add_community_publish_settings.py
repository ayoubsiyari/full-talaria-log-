"""add strategy_templates publish_settings + backtest_snapshot

Revision ID: add_community_publish
Revises: add_user_public_id
Create Date: 2026-05-18

"""
import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON


revision = "add_community_publish"
down_revision = "add_user_public_id"
branch_labels = None
depends_on = None

_DEFAULT = json.dumps({
    "include_description": True,
    "include_conditions": True,
    "include_variables": True,
    "include_strategy_details": True,
    "include_backtest_stats": False,
    "allow_clone": True,
})


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "strategy_templates" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("strategy_templates")}
    json_type = sa.JSON().with_variant(SQLITE_JSON(), "sqlite")
    if "publish_settings" not in cols:
        op.add_column(
            "strategy_templates",
            sa.Column("publish_settings", json_type, nullable=True),
        )
        bind.execute(
            sa.text("UPDATE strategy_templates SET publish_settings = :d WHERE publish_settings IS NULL"),
            {"d": _DEFAULT},
        )
    if "backtest_snapshot" not in cols:
        op.add_column(
            "strategy_templates",
            sa.Column("backtest_snapshot", json_type, nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "strategy_templates" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("strategy_templates")}
    if "backtest_snapshot" in cols:
        op.drop_column("strategy_templates", "backtest_snapshot")
    if "publish_settings" in cols:
        op.drop_column("strategy_templates", "publish_settings")
