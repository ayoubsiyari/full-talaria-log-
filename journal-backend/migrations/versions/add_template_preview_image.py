"""strategy_templates.preview_image for community card hero

Revision ID: add_template_preview_image
Revises: add_template_clones
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "add_template_preview_image"
down_revision = "add_template_clones"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "strategy_templates" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("strategy_templates")}
    if "preview_image" not in cols:
        op.add_column("strategy_templates", sa.Column("preview_image", sa.JSON(), nullable=True))


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "strategy_templates" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("strategy_templates")}
    if "preview_image" in cols:
        op.drop_column("strategy_templates", "preview_image")
