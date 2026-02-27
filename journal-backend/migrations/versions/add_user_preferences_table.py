"""add user_preferences table

Revision ID: add_user_preferences
Revises: add_chart_settings
Create Date: 2026-02-27 11:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.sqlite import JSON


# revision identifiers, used by Alembic.
revision = 'add_user_preferences'
down_revision = 'add_chart_settings'
branch_labels = None
depends_on = None


def upgrade():
    # Create user_preferences table
    op.create_table(
        'user_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('tool_defaults', JSON(), nullable=True),
        sa.Column('timeframe_favorites', JSON(), nullable=True),
        sa.Column('chart_templates', JSON(), nullable=True),
        sa.Column('keyboard_shortcuts', JSON(), nullable=True),
        sa.Column('drawing_tool_styles', JSON(), nullable=True),
        sa.Column('panel_sync_settings', JSON(), nullable=True),
        sa.Column('panel_settings', JSON(), nullable=True),
        sa.Column('market_config', JSON(), nullable=True),
        sa.Column('protection_settings', JSON(), nullable=True),
        sa.Column('general_settings', JSON(), nullable=True),
        sa.Column('keep_drawing_enabled', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )


def downgrade():
    op.drop_table('user_preferences')
