"""user_preferences.indicator_settings_templates + indicator_settings_shares

Revision ID: add_indicator_settings_templates
Revises: add_drawing_tool_templates_pref
Create Date: 2026-07-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.sqlite import JSON


revision = "add_indicator_settings_templates"
down_revision = "add_drawing_tool_templates_pref"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    tables = set(insp.get_table_names())

    if "user_preferences" in tables:
        cols = {c["name"] for c in insp.get_columns("user_preferences")}
        if "indicator_settings_templates" not in cols:
            op.add_column(
                "user_preferences",
                sa.Column("indicator_settings_templates", JSON(), nullable=True),
            )

    if "indicator_settings_shares" not in tables:
        op.create_table(
            "indicator_settings_shares",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("share_id", sa.String(length=24), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("indicator_type", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("params", JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_indicator_settings_shares_share_id", "indicator_settings_shares", ["share_id"], unique=True)
        op.create_index("ix_indicator_settings_shares_user_id", "indicator_settings_shares", ["user_id"], unique=False)
        op.create_index("ix_indicator_settings_shares_indicator_type", "indicator_settings_shares", ["indicator_type"], unique=False)


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    tables = set(insp.get_table_names())

    if "indicator_settings_shares" in tables:
        op.drop_table("indicator_settings_shares")

    if "user_preferences" in tables:
        cols = {c["name"] for c in insp.get_columns("user_preferences")}
        if "indicator_settings_templates" in cols:
            op.drop_column("user_preferences", "indicator_settings_templates")
