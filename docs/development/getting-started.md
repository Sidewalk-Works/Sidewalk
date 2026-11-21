# Getting Started

This guide covers a local development bootstrap for the current Sidewalk monorepo (FastAPI API + Next.js web + Expo mobile).

## Prerequisites

- Node.js 20+
- pnpm 10+ (repo pins `pnpm@10.0.0`)
- Python 3.12+ with [uv](https://github.com/astral-sh/uv)
- Docker (optional, for local PostgreSQL via `apps/api/docker-compose.yml`)

## 1. Clone and install dependencies

```bash
git clone https://github.com/MixMatch-Inc/Sidewalk.git
cd Sidewalk
pnpm install
```

Install API dependencies:

```bash
cd apps/api
uv sync --extra dev
cd ../..
```

## 2. Configure environment files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

See [../environment.md](../environment.md) for variable details.

## 3. Start PostgreSQL (optional)

The API defaults can work with local PostgreSQL. From `apps/api`:

```bash
docker compose up -d
```

(Or from repo root: `docker compose -f apps/api/docker-compose.yml up -d`)

## 4. Run migrations (and optional seed)

From `apps/api`:

```bash
uv run alembic upgrade head
```

Optional seed data (from repo root):

```bash
make seed
```

## 5. Start the apps

Use separate terminals:

```bash
# Terminal 1 - API
cd apps/api
uv run uvicorn src.main:app --reload
```

```bash
# Terminal 2 - Web (repo root)
pnpm dev:web
```

```bash
# Terminal 3 - Mobile (repo root)
pnpm dev:mobile
```

## 6. Verify

- API health: `http://localhost:8000/api/health`
- API docs: `http://localhost:8000/docs`
- Web: `http://localhost:3000`

## Notes

- There is no root `pnpm dev` script; use `pnpm dev:web` and `pnpm dev:mobile`.
- For physical mobile devices/emulators, set `EXPO_PUBLIC_API_URL` appropriately (Android emulator uses `http://10.0.2.2:8000`).
- For module/package conventions, see `adding-modules.md` and `package-boundaries.md`.
