"""user_preferences.drawing_tool_templates for cross-device drawing tool templates

Revision ID: add_drawing_tool_templates_pref
Revises: add_template_preview_image
Create Date: 2026-06-21

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.sqlite import JSON


revision = "add_drawing_tool_templates_pref"
down_revision = "add_template_preview_image"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "user_preferences" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("user_preferences")}
    if "drawing_tool_templates" not in cols:
        op.add_column(
            "user_preferences",
            sa.Column("drawing_tool_templates", JSON(), nullable=True),
        )
    if "v9_chart_templates" not in cols:
        op.add_column(
            "user_preferences",
            sa.Column("v9_chart_templates", JSON(), nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "user_preferences" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("user_preferences")}
    if "drawing_tool_templates" in cols:
        op.drop_column("user_preferences", "drawing_tool_templates")
    if "v9_chart_templates" in cols:
        op.drop_column("user_preferences", "v9_chart_templates")
