# Testing Guide

## Running Tests

Run all workspace tests from the repo root:

```bash
pnpm test
```

Run package/app tests individually:

```bash
# API (FastAPI / pytest)
cd apps/api
uv run pytest

# Web (Vitest)
pnpm --filter @sidewalk/web test

# Mobile (Jest / jest-expo)
pnpm --filter @sidewalk/mobile test

# Shared package (Vitest)
pnpm --filter @sidewalk/shared test
```

## Test Structure

### `apps/api`

- Framework: [pytest](https://docs.pytest.org/) with `pytest-asyncio` (`asyncio_mode = "auto"`).
- Tests live in `apps/api/tests/`, organized into `unit/` and `integration/`.
- Shared fixtures live in `apps/api/tests/conftest.py`; factories/helpers live in `apps/api/tests/factories.py`.
- Default local test configuration uses in-memory SQLite (see `conftest.py`) unless `TEST_DATABASE_URL` is provided.
- Coverage is enforced by pytest-cov with a minimum threshold (`--cov-fail-under=80` in config/CI).

Run common API checks from `apps/api`:

```bash
uv sync --extra dev
uv run ruff check src tests
uv run ruff format --check src tests
uv run mypy src
uv run pytest --cov=src
```

### `apps/web`

- Framework: [Vitest](https://vitest.dev/) + React Testing Library.
- Tests live primarily in `apps/web/__tests__/`, with additional tests under `apps/web/src/**/__tests__` and `apps/web/src/tests/`.
- Coverage includes auth pages/components and a growing set of notification/UI behavior tests (do not assume only login/register coverage).

### `apps/mobile`

- Framework: Jest with `jest-expo`.
- Tests live in `apps/mobile/__tests__/` and `apps/mobile/src/**/__tests__/`.
- Coverage includes setup/smoke tests and feature tests (for example push notification registration/manager behavior).

### `packages/shared` and `packages/stellar`

- `packages/shared` includes Vitest tests (`src/__tests__`) and exposes a `test` script.
- `packages/stellar` currently has no runtime test suite; validate with lint/build/typecheck as applicable.

## CI Expectations

GitHub Actions workflows in `.github/workflows/` run on pull requests and pushes to `main`:

- **API (`api.yml`)**: lint (`ruff check`, `ruff format --check`), typecheck (`mypy src`), and test job with PostgreSQL service, Alembic migrations (`upgrade head`, `alembic check`), and `pytest --cov=src --cov-fail-under=80`.
- **Web (`web.yml`)**: install, lint, test, build.
- **Mobile (`mobile.yml`)**: install, lint, test.
- **Packages (`packages.yml`)**: matrix build/lint/test for shared packages (test uses `--if-present`).

A failing lint, test, typecheck, migration, or build step fails the workflow and blocks merging.
