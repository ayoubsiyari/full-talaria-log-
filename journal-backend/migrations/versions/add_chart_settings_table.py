"""add chart_settings table

Revision ID: add_chart_settings
Revises: add_chart_drawings
Create Date: 2026-02-27 11:35:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.sqlite import JSON


# revision identifiers, used by Alembic.
revision = 'add_chart_settings'
down_revision = 'add_chart_drawings'
branch_labels = None
depends_on = None


def upgrade():
    # Create chart_settings table
    op.create_table(
        'chart_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('symbol', sa.String(length=50), nullable=False),
        sa.Column('session_id', sa.String(length=100), nullable=True),
        sa.Column('settings_data', JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'symbol', 'session_id', name='uq_user_symbol_session_settings')
    )


def downgrade():
    op.drop_table('chart_settings')
