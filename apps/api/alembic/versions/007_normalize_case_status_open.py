"""normalize case status values to single canonical `open`

Revision ID: 007_normalize_case_status_open
Revises: 006_add_composite_indexes
Create Date: 2026-10-20 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op


revision: str = "007_normalize_case_status_open"
down_revision: str | None = "006_add_composite_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE cases SET status = 'open' WHERE status IN ('opened', 'open')")
    op.execute("ALTER TABLE cases ALTER COLUMN status SET DEFAULT 'open'")


def downgrade() -> None:
    op.execute("UPDATE cases SET status = 'opened' WHERE status = 'open'")
    op.execute("ALTER TABLE cases ALTER COLUMN status SET DEFAULT 'opened'")
