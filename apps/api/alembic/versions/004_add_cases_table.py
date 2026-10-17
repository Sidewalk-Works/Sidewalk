"""add cases and case_follows tables

Revision ID: 004_add_cases_table
Revises: 003_add_reports_table
Create Date: 2026-09-01 00:03:00.000000

"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = '004_add_cases_table'
down_revision: str | None = '003_add_reports_table'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'cases',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('report_id', sa.Uuid(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='opened'),
        sa.Column('assigned_to_id', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['assigned_to_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['report_id'], ['reports.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cases_assigned_to_id'), 'cases', ['assigned_to_id'], unique=False)
    op.create_index(op.f('ix_cases_report_id'), 'cases', ['report_id'], unique=True)
    op.create_index(op.f('ix_cases_status'), 'cases', ['status'], unique=False)

    op.create_table(
        'case_follows',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('case_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('case_id', 'user_id', name='uq_case_user_follow')
    )
    op.create_index(op.f('ix_case_follows_case_id'), 'case_follows', ['case_id'], unique=False)
    op.create_index(op.f('ix_case_follows_user_id'), 'case_follows', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_table('case_follows')
    op.drop_table('cases')
