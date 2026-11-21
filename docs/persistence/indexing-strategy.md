# Persistence Indexing Strategy

This document describes indexing currently present in the codebase and the practical approach for adding new indexes.

## Current report indexes

### Defined in Alembic migration `003_add_reports_table.py`

- `ix_reports_category` on `reports.category`
- `ix_reports_status` on `reports.status`
- `ix_reports_user_id` on `reports.user_id`

### Defined in `apps/api/src/modules/reports/models.py`

The `Report` model declares composite indexes for list queries that filter by soft-delete state and order by creation time:

- `ix_reports_deleted_status_created` on (`is_deleted`, `status`, `created_at`)
- `ix_reports_deleted_category_created` on (`is_deleted`, `category`, `created_at`)

These align with list patterns that filter `is_deleted = false` and optionally filter by `status` or `category`, then order by `created_at DESC`.

## When adding indexes

1. Add/adjust SQLAlchemy model index declarations where appropriate.
2. Generate an Alembic migration:
   ```bash
   cd apps/api
   uv run alembic revision --autogenerate -m "describe index change"
   ```
3. Review the generated migration carefully (autogenerate may miss or mis-detect some index changes).
4. Apply and verify:
   ```bash
   uv run alembic upgrade head
   uv run alembic check
   ```
5. Run relevant tests.

## Guidelines

- Index columns used by frequent filters, joins, and sort paths.
- Prefer evidence from actual query patterns over speculative indexes.
- Keep write overhead in mind; avoid duplicate or unused indexes.
- For PostgreSQL production deployments, consider concurrent index creation for large tables when operationally necessary (Alembic may require manual SQL for `CONCURRENTLY`).
