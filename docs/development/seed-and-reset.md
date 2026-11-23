# Seed and Reset Workflow

This document describes the current local database seed and reset workflow for the FastAPI backend.

## Scripts and commands

| Command | What it does |
| --- | --- |
| `make seed` | Runs `uv run python scripts/seed.py` from the repo root (see `Makefile`) |
| `make reset-db` | Runs `uv run python scripts/reset_db.py` from the repo root |
| `uv run python scripts/seed.py` | Creates tables if needed and inserts sample data if not already seeded |
| `uv run python scripts/reset_db.py [--confirm]` | Drops tables, runs `alembic upgrade head`, then seeds |

## Prerequisites

- Python 3.12+ with project dependencies installed (`cd apps/api && uv sync --extra dev`)
- A configured `DATABASE_URL` in `apps/api/.env` (or environment variables)
- For PostgreSQL workflows, a reachable database (for example `apps/api/docker-compose.yml`)

## Seed the database

From the repository root:

```bash
make seed
```

Or directly:

```bash
uv run python scripts/seed.py
```

### What `scripts/seed.py` does

- Creates an async engine from `src.core.config.get_settings().DATABASE_URL`.
- Runs `Base.metadata.create_all` to ensure tables exist.
- Skips seeding when `admin@sidewalk.local` already exists.
- Inserts sample data:
  - 3 users (1 admin, 2 regular) with password `password123`
  - 10 reports across categories/statuses
  - 3 cases linked to selected reports

## Reset the database

From the repository root:

```bash
make reset-db
```

Or directly:

```bash
uv run python scripts/reset_db.py
```

### What `scripts/reset_db.py` does

- Refuses to reset non-development environments unless `--confirm` is passed.
- Drops all tables via SQLAlchemy metadata (`Base.metadata.drop_all`).
- Runs Alembic migrations to head: `alembic upgrade head` (executed from `apps/api`).
- Runs `seed()` to repopulate sample data.

For a non-development environment (only when intentional):

```bash
uv run python scripts/reset_db.py --confirm
```

## Notes

- `make reset-db` and `make seed` are defined in the repository `Makefile`.
- The scripts are Python-based (`scripts/seed.py`, `scripts/reset_db.py`); there is no Prisma/Node seed workflow in the current FastAPI backend.
- After schema changes, generate/apply Alembic migrations as needed before relying on reset behavior in migration-based environments.
