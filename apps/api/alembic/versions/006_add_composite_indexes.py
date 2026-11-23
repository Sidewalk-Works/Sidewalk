"""add composite indexes for notification and report list queries

Revision ID: 006_add_composite_indexes
Revises: 005_add_notifications_table
Create Date: 2026-09-02 00:00:00.000000

Verify the planner uses them on PostgreSQL (see apps/api/docs/index-plan.md).
"""
from collections.abc import Sequence

from alembic import op

revision: str = '006_add_composite_indexes'
down_revision: str | None = '005_add_notifications_table'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        'ix_notifications_user_read_created', 'notifications', ['user_id', 'read', 'created_at']
    )
    op.create_index(
        'ix_reports_deleted_status_created', 'reports', ['is_deleted', 'status', 'created_at']
    )
    op.create_index(
        'ix_reports_deleted_category_created', 'reports', ['is_deleted', 'category', 'created_at']
    )


def downgrade() -> None:
    op.drop_index('ix_reports_deleted_category_created', table_name='reports')
    op.drop_index('ix_reports_deleted_status_created', table_name='reports')
    op.drop_index('ix_notifications_user_read_created', table_name='notifications')
