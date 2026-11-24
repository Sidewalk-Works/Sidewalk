# Migration Safety (Alembic / SQLAlchemy)

This document describes safe schema migration practices for the current FastAPI + SQLAlchemy + Alembic backend.

## Current workflow

The API uses Alembic migrations in `apps/api/alembic/` with model metadata from `src.core.models.Base`.

Typical local workflow:

```bash
cd apps/api
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
uv run alembic check
```

## Safety guidelines

- **Prefer additive, backward-compatible changes** when possible (add nullable columns, add tables/indexes, add new enum-like string values only when application code handles them).
- **Avoid destructive changes in one step** on production data (dropping columns/tables, tightening nullability without backfill). Use staged migrations where needed.
- **Review autogenerate output** before committing. Alembic autogenerate does not catch every schema difference and can produce unsafe operations if not reviewed.
- **Keep models and migrations in sync.** CI runs `alembic upgrade head` and `alembic check` against PostgreSQL.
- **Test migrations against a real database** when changing constraints, indexes, or data shape.

## CI checks

The API workflow (`.github/workflows/api.yml`) validates migrations by:

1. Starting PostgreSQL 16 service.
2. Installing dependencies with `uv sync --frozen --extra dev`.
3. Running `uv run alembic upgrade head`.
4. Running `uv run alembic check`.
5. Running `uv run pytest --cov=src --cov-fail-under=80`.

Note: `apps/api/tests/conftest.py` currently uses in-memory SQLite with `Base.metadata.create_all` for test isolation; Alembic migration validity is still checked in CI against PostgreSQL.
