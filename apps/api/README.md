# Sidewalk API

FastAPI backend for Sidewalk civic engagement platform.

## Getting Started

```bash
cd apps/api
cp .env.example .env
pytest
```

# apps/api/README.md (Database & Alembic Migration Section)

## Database Migrations (Alembic)

`apps/api` uses Alembic configured with an async engine (`create_async_engine`) connected to Pydantic settings.

### Migration Commands
* **Run pending migrations:**
  ```bash
  uv run alembic upgrade head