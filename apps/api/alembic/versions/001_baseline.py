"""baseline

Revision ID: 001_baseline
Revises: 
Create Date: 2026-09-01 00:00:00.000000

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
