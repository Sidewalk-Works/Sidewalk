# Environment Setup

Each app has its own `.env.example` file. Copy it to the appropriate local env file before running locally.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

## API (`apps/api`)

The API is a FastAPI service. Source-of-truth variables are defined in `apps/api/src/core/config.py` and documented in `apps/api/.env.example`.

| Variable | Description | Default / example |
| --- | --- | --- |
| `DATABASE_URL` | Async SQLAlchemy database URL. PostgreSQL for normal dev; SQLite also supported. | `postgresql+asyncpg://sidewalk:sidewalk@localhost:5432/sidewalk_dev` |
| `DB_POOL_SIZE` | PostgreSQL pool base size (ignored by SQLite). | `10` |
| `DB_MAX_OVERFLOW` | Extra PostgreSQL connections allowed during spikes. | `20` |
| `DB_POOL_TIMEOUT` | Seconds to wait for a DB connection. | `30` |
| `DB_POOL_RECYCLE_SECONDS` | Seconds before PostgreSQL connections are recycled. | `1800` |
| `SECRET_KEY` | JWT signing secret. Must be long/random in production (>= 32 chars). | `default-dev-secret-key-change-in-production-min-32-chars` |
| `JWT_ALGORITHM` | JWT signing algorithm. | `HS256` |
| `JWT_EXPIRES_MINUTES` | Access token lifetime in minutes. | `15` |
| `LOGIN_MAX_ATTEMPTS` | Failed login attempts before lockout. | `5` |
| `LOGIN_LOCKOUT_MINUTES` | Account lockout duration in minutes. | `15` |
| `ENVIRONMENT` | Runtime environment: `development`, `staging`, or `production`. | `development` |
| `API_VERSION` | API version string returned by metadata/OpenAPI. | `0.1.0` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated list or JSON array). | `["http://localhost:3000","http://localhost:8081"]` |
| `MEDIA_ALLOWED_HOSTS` | Comma-separated https hosts allowed for report media URLs; empty allows any https host. | empty |
| `LOG_LEVEL` | Structured log level. | `INFO` |
| `RATE_LIMIT_DEFAULT` | Default slowapi rate limit per IP. | `200/minute` |
| `RATE_LIMIT_LOGIN` | Stricter rate limit for auth/login endpoints. | `10/minute` |
| `RATE_LIMIT_STORAGE_URI` | Shared rate-limit store URI (e.g. Redis). Empty uses in-memory per-process storage. | empty |
| `TRUSTED_PROXY_IPS` | Comma-separated trusted proxy IPs for `X-Forwarded-For`. | empty |

Notes:
- Run the API locally with `uv run uvicorn src.main:app --reload` from `apps/api` (default: `http://localhost:8000`).
- Use `DATABASE_URL=sqlite+aiosqlite:///./sidewalk.db` for simple local SQLite development/testing when appropriate.
- `.env` files are local-only; do not commit secrets. Keep `.env.example` updated when config changes.

## Web (`apps/web`)

| Variable | Description | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the API used by the Next.js app. | `http://localhost:4000` |

For local FastAPI development on the default port, set `NEXT_PUBLIC_API_URL=http://localhost:8000` if needed.

## Mobile (`apps/mobile`)

| Variable | Description | Default |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | Base URL of the API used by the Expo app. | `http://localhost:4000` |

For local FastAPI development on the default port, set `EXPO_PUBLIC_API_URL=http://localhost:8000` (Android emulator typically uses `http://10.0.2.2:8000`).

## Secrets Handling

- Never commit `.env` files; only `.env.example` files should be tracked.
- `SECRET_KEY` must be a long random value in deployed environments.
- Use managed PostgreSQL and managed secrets in staging/production.
