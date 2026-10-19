# Sidewalk API

FastAPI backend for the Sidewalk civic engagement platform. Interactive API docs are served at
`/docs` (Swagger UI) and `/redoc` once the server is running.

## Quick start

### With Docker

```bash
cd apps/api
docker compose up --build
```

This starts PostgreSQL, Redis and the API on <http://localhost:8000>. The API container runs
`alembic upgrade head` before it starts serving, runs as a non-root user and has a healthcheck.

### Locally

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd apps/api
cp .env.example .env            # then adjust DATABASE_URL and SECRET_KEY
make install                    # uv sync --extra dev
make migrate                    # uv run alembic upgrade head
make dev                        # uv run uvicorn src.main:app --reload
```

For a quick start without PostgreSQL, set `DATABASE_URL=sqlite+aiosqlite:///./sidewalk.db`.

## Configuration

Settings are read from the environment (or `.env`) and validated at startup. See
`.env.example` for every variable with comments.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Async SQLAlchemy URL (`postgresql+asyncpg://...` or `sqlite+aiosqlite://...`) |
| `SECRET_KEY` | yes | Signs JWT access tokens; use 32+ random characters in production |
| `ENVIRONMENT` | no | `development` (default), `staging`, `production`; production enables HSTS |
| `CORS_ORIGINS` | no | Allowed origins, as a JSON array or a comma-separated list |
| `JWT_EXPIRES_MINUTES` | no | Access-token lifetime (default 1440) |
| `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_LOGIN` | no | slowapi limits, e.g. `200/minute` |
| `MEDIA_ALLOWED_HOSTS` | no | Comma-separated hosts report `media_urls` may use (https only) |
| `LOG_LEVEL` | no | `DEBUG` ... `CRITICAL` (default `INFO`) |

## Endpoints

All routes are under `/api`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Service and database status |
| POST | `/auth/register` | Create an account; returns a token and the user |
| POST | `/auth/login` | Exchange credentials for a bearer token |
| GET | `/auth/me` | The authenticated user |
| GET, PATCH | `/users/me` | Read or update the caller's profile |
| POST, GET | `/reports` | Create a report, list reports |
| GET, PATCH, DELETE | `/reports/{id}` | Read, update or soft-delete a report |
| GET | `/cases` | List cases |
| POST, DELETE | `/cases/{id}/follow` | Follow or unfollow a case |
| GET | `/notifications` | List the caller's notifications |
| PATCH | `/notifications/read-all`, `/notifications/{id}/read` | Mark notifications read |
| POST | `/moderation/reports/{id}/flag` | Flag a report (admin) |
| PATCH | `/moderation/reports/{id}/status` | Change a report's status (admin) |

Authenticated routes expect `Authorization: Bearer <token>`. Errors share one shape:
`{"message": "...", "field": "..."}` for conflicts and `{"message": "Validation error", "errors": [...]}`
for invalid input.

## Database migrations

Alembic is configured with an async engine and reads `DATABASE_URL` from the settings.

```bash
uv run alembic upgrade head                              # apply pending migrations
uv run alembic revision --autogenerate -m "describe it"  # create a migration after changing models
uv run alembic downgrade -1                              # roll back one revision
```

## Creating the first admin

Admin rights are a flag on the user. Register normally, then promote the account:

```bash
curl -X POST localhost:8000/api/auth/register -H 'content-type: application/json' \
  -d '{"email": "admin@example.com", "password": "a-strong-password"}'

# PostgreSQL (docker compose)
docker compose exec postgres psql -U sidewalk_user -d sidewalk_dev \
  -c "UPDATE users SET is_admin = true WHERE email = 'admin@example.com';"
```

## Tests and checks

```bash
make test         # uv run pytest (in-memory SQLite, no services needed)
make lint         # uv run ruff check .
make typecheck    # uv run mypy src
```

## Project layout

```text
src/
  main.py             # app factory: middleware, exception handlers, routers
  core/               # config, database, security, middleware, errors, shared schemas
  modules/<name>/     # one folder per feature
tests/
  unit/               # services and schemas
  integration/        # HTTP routes through the ASGI app
  factories.py        # model factories
alembic/versions/     # migrations
```

### Module convention

Each module under `src/modules/<name>/` has `models.py` (SQLAlchemy), `schemas.py` (Pydantic),
`repository.py` (queries), `service.py` (business rules) and `router.py` (HTTP). Routers call
services, services call repositories, and only the router layer knows about HTTP. Register a
new router in `src/main.py` and import its models in `src/models.py` so Alembic sees them.
