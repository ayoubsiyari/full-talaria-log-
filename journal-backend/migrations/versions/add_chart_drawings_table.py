"""add chart_drawings table

Revision ID: add_chart_drawings
Revises: 
Create Date: 2026-02-27 11:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.sqlite import JSON


# revision identifiers, used by Alembic.
revision = 'add_chart_drawings'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Create chart_drawings table
    op.create_table(
        'chart_drawings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('symbol', sa.String(length=50), nullable=False),
        sa.Column('session_id', sa.String(length=100), nullable=True),
        sa.Column('drawings_data', JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'symbol', 'session_id', name='uq_user_symbol_session')
    )


def downgrade():
    op.drop_table('chart_drawings')
