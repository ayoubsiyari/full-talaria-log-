"""strategy_definition + social + templates + journal strategy_id

Revision ID: add_strategy_lab
Revises: add_user_preferences
Create Date: 2026-04-12

"""
import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy import JSON, inspect


revision = 'add_strategy_lab'
down_revision = 'add_user_preferences'
branch_labels = None
depends_on = None


def _default_definition():
    return {
        'instrument': '',
        'style': '',
        'direction': 'both',
        'timeframe': '',
        'conditions': [],
        'variables': [],
    }


def _column_names(bind, table: str):
    insp = inspect(bind)
    if not insp.has_table(table):
        return []
    return [c['name'] for c in insp.get_columns(table)]


def upgrade():
    bind = op.get_bind()
    default_json = json.dumps(_default_definition())
    dialect = bind.dialect.name

    strat_cols = _column_names(bind, 'strategies')
    if 'strategy_definition' not in strat_cols:
        op.add_column('strategies', sa.Column('strategy_definition', JSON(), nullable=True))
        if dialect == 'postgresql':
            bind.execute(
                sa.text('UPDATE strategies SET strategy_definition = CAST(:j AS jsonb)'),
                {'j': default_json},
            )
        else:
            bind.execute(
                sa.text('UPDATE strategies SET strategy_definition = :j'),
                {'j': default_json},
            )
        op.alter_column('strategies', 'strategy_definition', nullable=False)
    else:
        if dialect == 'postgresql':
            bind.execute(
                sa.text(
                    'UPDATE strategies SET strategy_definition = CAST(:j AS jsonb) '
                    'WHERE strategy_definition IS NULL'
                ),
                {'j': default_json},
            )
        else:
            bind.execute(
                sa.text(
                    'UPDATE strategies SET strategy_definition = :j WHERE strategy_definition IS NULL'
                ),
                {'j': default_json},
            )

    insp = inspect(bind)
    if not insp.has_table('strategy_posts'):
        op.create_table(
            'strategy_posts',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('strategy_id', sa.Integer(), nullable=False),
            sa.Column('caption', sa.Text(), nullable=True),
            sa.Column('images', JSON(), nullable=False, server_default='[]'),
            sa.Column('visibility', sa.String(20), nullable=False, server_default='public'),
            sa.Column('include_description', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('include_conditions', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('include_variables', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('include_stats', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('include_heatmap', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('include_trades', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['strategy_id'], ['strategies.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    if not inspect(bind).has_table('post_likes'):
        op.create_table(
            'post_likes',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('post_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['post_id'], ['strategy_posts.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('post_id', 'user_id', name='uq_post_like_user'),
        )

    if not inspect(bind).has_table('post_comments'):
        op.create_table(
            'post_comments',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('post_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('parent_id', sa.Integer(), nullable=True),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['post_id'], ['strategy_posts.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['parent_id'], ['post_comments.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    if not inspect(bind).has_table('user_follows'):
        op.create_table(
            'user_follows',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('follower_id', sa.Integer(), nullable=False),
            sa.Column('following_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['follower_id'], ['users.id']),
            sa.ForeignKeyConstraint(['following_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('follower_id', 'following_id', name='uq_follow'),
        )

    if not inspect(bind).has_table('strategy_templates'):
        op.create_table(
            'strategy_templates',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('source_strategy_id', sa.Integer(), nullable=True),
            sa.Column('creator_user_id', sa.Integer(), nullable=True),
            sa.Column('title', sa.String(200), nullable=False),
            sa.Column('definition', JSON(), nullable=False),
            sa.Column('category', sa.String(80), nullable=True),
            sa.Column('difficulty', sa.String(40), nullable=True),
            sa.Column('template_type', sa.String(20), nullable=False, server_default='community'),
            sa.Column('status', sa.String(20), nullable=False, server_default='published'),
            sa.Column('clone_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('rating_sum', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('rating_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['source_strategy_id'], ['strategies.id']),
            sa.ForeignKeyConstraint(['creator_user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    if 'strategy_id' not in _column_names(bind, 'journal_entries'):
        with op.batch_alter_table('journal_entries', schema=None) as batch_op:
            batch_op.add_column(sa.Column('strategy_id', sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                'fk_journal_entries_strategy_id',
                'strategies',
                ['strategy_id'],
                ['id'],
            )

    # Seed one official template (empty definition shell — users clone and fill in UI)
    if inspect(bind).has_table('strategy_templates'):
        existing = bind.execute(
            sa.text(
                "SELECT 1 FROM strategy_templates WHERE title = 'Starter: Empty strategy' LIMIT 1"
            )
        ).scalar()
        if existing is None:
            seed_def = json.dumps({
                'instrument': 'stocks',
                'style': 'swing',
                'direction': 'both',
                'timeframe': 'daily',
                'conditions': [],
                'variables': [],
            })
            if dialect == 'postgresql':
                op.execute(
                    sa.text(
                        "INSERT INTO strategy_templates "
                        "(title, definition, template_type, status, clone_count, rating_sum, rating_count, creator_user_id, source_strategy_id, category, difficulty) "
                        "VALUES ('Starter: Empty strategy', CAST(:d AS jsonb), 'official', 'published', 0, 0, 0, NULL, NULL, 'general', 'beginner')"
                    ),
                    {'d': seed_def},
                )
            else:
                op.execute(
                    sa.text(
                        "INSERT INTO strategy_templates "
                        "(title, definition, template_type, status, clone_count, rating_sum, rating_count, creator_user_id, source_strategy_id, category, difficulty) "
                        "VALUES ('Starter: Empty strategy', :d, 'official', 'published', 0, 0, 0, NULL, NULL, 'general', 'beginner')"
                    ),
                    {'d': seed_def},
                )


def downgrade():
    with op.batch_alter_table('journal_entries', schema=None) as batch_op:
        batch_op.drop_constraint('fk_journal_entries_strategy_id', type_='foreignkey')
        batch_op.drop_column('strategy_id')

    op.drop_table('strategy_templates')
    op.drop_table('user_follows')
    op.drop_table('post_comments')
    op.drop_table('post_likes')
    op.drop_table('strategy_posts')
    op.drop_column('strategies', 'strategy_definition')
