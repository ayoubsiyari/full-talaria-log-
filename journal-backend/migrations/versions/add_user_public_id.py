"""add users.public_id for community strategy authors

Revision ID: add_user_public_id
Revises: add_user_preferences
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "add_user_public_id"
down_revision = "add_user_preferences"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    if "public_id" not in cols:
        op.add_column("users", sa.Column("public_id", sa.String(20), nullable=True))
    try:
        op.create_index("ix_users_public_id", "users", ["public_id"], unique=True)
    except Exception:
        pass


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    if "users" not in insp.get_table_names():
        return
    indexes = {i["name"] for i in insp.get_indexes("users")}
    if "ix_users_public_id" in indexes:
        op.drop_index("ix_users_public_id", table_name="users")
    cols = {c["name"] for c in insp.get_columns("users")}
    if "public_id" in cols:
        op.drop_column("users", "public_id")
