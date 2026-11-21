# Contributor Guide

## Project Structure

```text
sidewalk/
├── apps/
│   ├── api/       # FastAPI backend (Python)
│   ├── web/       # Next.js web app
│   └── mobile/    # Expo / React Native app
├── packages/
│   ├── shared/    # Shared TS types/schemas/constants
│   └── stellar/   # Stellar integration scaffold/helpers
├── docs/          # Project documentation
└── .github/workflows/  # CI pipelines
```

### Backend modules (`apps/api/src/modules`)

The API is a modular FastAPI codebase organized by business domain. Each module typically owns its router, schemas, service, models, and related tests.

```text
apps/api/src/
  main.py              # FastAPI app entrypoint
  core/                # config, db, security, middleware, shared infra
  modules/
    auth/
      router.py
      schemas.py
      service.py
      models.py
      repository.py
    users/
    reports/
    ...
```

Add new backend functionality as a new module under `apps/api/src/modules/<name>/`, following the existing module patterns. Keep cross-cutting infrastructure in `src/core/`.

## Repo Bootstrap Path

### 1. Prerequisites

- Node.js 20+
- pnpm 10+ (`packageManager` is pinned in root `package.json`)
- Python 3.12+
- [uv](https://github.com/astral-sh/uv)
- Docker (optional, for local PostgreSQL via `apps/api/docker-compose.yml`)

### 2. Clone and install

```bash
git clone https://github.com/MixMatch-Inc/Sidewalk.git
cd Sidewalk
pnpm install
```

### 3. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

See [environment.md](environment.md) for variable details.

### 4. Set up and run the API (FastAPI)

From `apps/api`:

```bash
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn src.main:app --reload
```

API defaults to `http://localhost:8000` (health: `/api/health`, docs: `/docs`).

### 5. Start web/mobile apps

In separate terminals from the repo root:

```bash
pnpm dev:web
pnpm dev:mobile
```

`pnpm dev:api` is available as a root script if the API package scripts are configured in your workspace; otherwise run the API directly from `apps/api` as shown above.

### 6. Verify the setup

```bash
# JS/TS workspace checks
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# API checks
cd apps/api
uv run ruff check src tests
uv run ruff format --check src tests
uv run mypy src
uv run pytest --cov=src
```

## Adding a New Module

When adding a new backend domain (e.g. `reports`, `notifications`), follow the existing FastAPI module layout.

### 1. Create the module

Create files under `apps/api/src/modules/<name>/` as needed:

- `router.py` - FastAPI routes / request handling
- `schemas.py` - Pydantic request/response schemas
- `service.py` - business logic
- `models.py` - SQLAlchemy models (if persisted)
- `repository.py` - DB access helpers (if used by the module)

### 2. Register the router

Wire the module router in the API app/router composition (see `apps/api/src/main.py` and `apps/api/src/core/router.py` / module registration patterns used in the repo).

### 3. Add migrations when models change

If you add or modify SQLAlchemy models, create and apply Alembic migrations from `apps/api`:

```bash
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

### 4. Update shared contracts deliberately

If web/mobile need shared TS types, add them to `packages/shared` only when they are genuinely cross-app. API contracts should be documented by FastAPI/OpenAPI schemas.

### 5. Add tests

- API tests go in `apps/api/tests/unit` or `apps/api/tests/integration`.
- Use pytest/pytest-asyncio fixtures from `apps/api/tests/conftest.py`.
- Keep tests focused on behavior and regression coverage.

## Coding Standards

- TypeScript strict mode is enabled across JS/TS packages.
- ESLint (flat config) is used for JS/TS; run `pnpm lint`.
- Prettier is used for formatting; run `pnpm exec prettier --write .` when needed.
- Python API code uses Ruff, mypy, and pytest.
- Keep modules small and domain-focused; put cross-cutting concerns in `apps/api/src/core/` or appropriate shared packages.

## Contribution Expectations

- Every PR should pass relevant CI workflows in `.github/workflows/`.
- Include tests for behavior changes and bug fixes.
- Keep PRs scoped; document cross-cutting or contract changes clearly.
- Follow existing module boundaries; do not reintroduce legacy Express/Prisma patterns.
