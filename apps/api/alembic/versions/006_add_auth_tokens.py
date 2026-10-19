"""add token versioning, email verification and auth tokens

Revision ID: 006_add_auth_tokens
Revises: 005_add_notifications_table
Create Date: 2026-09-02 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '006_add_auth_tokens'
down_revision: str | None = '005_add_notifications_table'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('token_version', sa.Integer(), server_default='0', nullable=False))
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('users', sa.Column('pending_email', sa.String(length=255), nullable=True))
    op.create_table(
        'auth_tokens',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('extra', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_auth_tokens_user_id'), 'auth_tokens', ['user_id'], unique=False)
    op.create_index(op.f('ix_auth_tokens_token_hash'), 'auth_tokens', ['token_hash'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_auth_tokens_token_hash'), table_name='auth_tokens')
    op.drop_index(op.f('ix_auth_tokens_user_id'), table_name='auth_tokens')
    op.drop_table('auth_tokens')
    op.drop_column('users', 'pending_email')
    op.drop_column('users', 'email_verified')
    op.drop_column('users', 'token_version')
