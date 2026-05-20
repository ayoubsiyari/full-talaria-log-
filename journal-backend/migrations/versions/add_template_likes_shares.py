"""template_likes table + strategy_templates.share_count

Revision ID: add_template_likes_shares
Revises: add_community_publish_settings
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "add_template_likes_shares"
down_revision = "add_community_publish"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "strategy_templates" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("strategy_templates")}
        if "share_count" not in cols:
            op.add_column(
                "strategy_templates",
                sa.Column("share_count", sa.Integer(), nullable=False, server_default="0"),
            )
    if "template_likes" not in insp.get_table_names():
        op.create_table(
            "template_likes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("strategy_templates.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("template_id", "user_id", name="uq_template_like_user"),
        )


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "template_likes" in insp.get_table_names():
        op.drop_table("template_likes")
    if "strategy_templates" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("strategy_templates")}
        if "share_count" in cols:
            op.drop_column("strategy_templates", "share_count")
