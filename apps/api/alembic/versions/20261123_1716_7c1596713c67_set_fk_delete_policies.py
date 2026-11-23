"""Set explicit delete behavior for report, case, follow, and notification foreign keys.

Revision ID: 7c1596713c67
Revises: 006_add_auth_tokens, 007_normalize_case_status_open
Create Date: 2026-11-23 17:16:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7c1596713c67"
down_revision: str | Sequence[str] | None = (
    "006_add_auth_tokens",
    "007_normalize_case_status_open",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK_NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
}


def _replace_foreign_key(
    table: str,
    column: str,
    referred_table: str,
    ondelete: str | None,
    existing_constraint_name: str,
    nullable: bool | None = None,
) -> None:
    constraint_name = f"fk_{table}_{column}_{referred_table}"
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table(table, naming_convention=FK_NAMING_CONVENTION) as batch:
            batch.drop_constraint(constraint_name, type_="foreignkey")
            batch.create_foreign_key(
                constraint_name,
                referred_table,
                [column],
                ["id"],
                ondelete=ondelete,
            )
            if nullable is not None:
                batch.alter_column(column, existing_type=sa.Uuid(), nullable=nullable)
        return

    op.drop_constraint(existing_constraint_name, table, type_="foreignkey")
    op.create_foreign_key(
        constraint_name,
        table,
        referred_table,
        [column],
        ["id"],
        ondelete=ondelete,
    )
    if nullable is not None:
        op.alter_column(table, column, existing_type=sa.Uuid(), nullable=nullable)


def upgrade() -> None:
    _replace_foreign_key(
        "reports", "user_id", "users", "SET NULL", "reports_user_id_fkey", nullable=True
    )
    _replace_foreign_key("cases", "report_id", "reports", "CASCADE", "cases_report_id_fkey")
    _replace_foreign_key(
        "cases", "assigned_to_id", "users", "SET NULL", "cases_assigned_to_id_fkey"
    )
    _replace_foreign_key(
        "case_follows", "case_id", "cases", "CASCADE", "case_follows_case_id_fkey"
    )
    _replace_foreign_key(
        "case_follows", "user_id", "users", "CASCADE", "case_follows_user_id_fkey"
    )
    _replace_foreign_key(
        "notifications", "user_id", "users", "CASCADE", "notifications_user_id_fkey"
    )


def downgrade() -> None:
    _replace_foreign_key(
        "notifications",
        "user_id",
        "users",
        None,
        "fk_notifications_user_id_users",
    )
    _replace_foreign_key(
        "case_follows", "user_id", "users", None, "fk_case_follows_user_id_users"
    )
    _replace_foreign_key(
        "case_follows", "case_id", "cases", None, "fk_case_follows_case_id_cases"
    )
    _replace_foreign_key("cases", "assigned_to_id", "users", None, "fk_cases_assigned_to_id_users")
    _replace_foreign_key("cases", "report_id", "reports", None, "fk_cases_report_id_reports")
    _replace_foreign_key(
        "reports", "user_id", "users", None, "fk_reports_user_id_users", nullable=False
    )
