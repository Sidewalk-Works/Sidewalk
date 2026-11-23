"""Empty baseline anchoring the original migration history.

Revision ID: 001_baseline
Revises: 
Create Date: 2026-09-01 00:00:00.000000

This no-op revision is intentionally retained because the initial schema revision
depends on it. It is the stable root of the migration history, not an applied schema.
"""
from collections.abc import Sequence

revision: str = '001_baseline'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
