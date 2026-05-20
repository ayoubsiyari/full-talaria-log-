"""template_clones — one copy per user per community template

Revision ID: add_template_clones
Revises: add_template_likes_shares
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "add_template_clones"
down_revision = "add_template_likes_shares"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "template_clones" not in insp.get_table_names():
        op.create_table(
            "template_clones",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("strategy_templates.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("strategy_id", sa.Integer(), sa.ForeignKey("strategies.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("template_id", "user_id", name="uq_template_clone_user"),
        )


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "template_clones" in insp.get_table_names():
        op.drop_table("template_clones")
