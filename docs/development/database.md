# Database Migrations and Schema Management

This document outlines how database migrations and schema management work in the Sidewalk FastAPI backend.

## Overview

Sidewalk uses **SQLAlchemy 2.0** (with asyncpg for PostgreSQL and aiosqlite for SQLite) and **Alembic** for managing schema migrations.

All database schema changes must be versioned through Alembic migrations to prevent schema drift across environments (local development, testing, staging, and production).

---

## Migration Policy

> **Important:** All model changes must include a migration. Never update an SQLAlchemy model without generating and committing the corresponding Alembic migration.

CI enforces this invariant via `uv run alembic check` (or `alembic check`). If any SQLAlchemy model in `src/` has schema differences compared to the latest migration at `head`, the CI build will fail.

---

## Common Alembic Commands

Run all commands from the `apps/api` directory:

### 1. Generate a new migration

When you create or modify an SQLAlchemy model in `apps/api/src/modules/*/models.py`:

```bash
uv run alembic revision --autogenerate -m "describe schema change"
```

Review the newly generated file in `apps/api/alembic/versions/` to verify:
- Changes are accurate and migration-safe (e.g. nullable columns or defaults for existing tables).
- Both `upgrade()` and `downgrade()` functions are properly defined.

### 2. Apply migrations

To apply pending migrations up to the latest revision:

```bash
uv run alembic upgrade head
```

### 3. Revert migrations

To roll back one revision:

```bash
uv run alembic downgrade -1
```

Or revert to base:

```bash
uv run alembic downgrade base
```

### 4. Check for schema drift

To verify that the database schema and SQLAlchemy models are in sync:

```bash
uv run alembic check
```

If there are uncommitted model changes that have not been captured in an Alembic migration, `alembic check` exits with a non-zero exit code.

---

## CI Enforcement

In the GitHub Actions API workflow (`.github/workflows/api.yml`), the test pipeline:
1. Boots a real PostgreSQL 16 container.
2. Applies all migrations: `uv run alembic upgrade head`.
3. Runs `uv run alembic check` to verify no models have unmigrated schema changes.
4. Executes the test suite against the migrated database with `uv run pytest --cov=src --cov-fail-under=80`.
