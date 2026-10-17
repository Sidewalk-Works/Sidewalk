# syntax=docker/dockerfile:1

# ---- Stage 1: builder ----
FROM python:3.12-slim AS builder

# Install uv (official static binary)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Install dependencies (no dev group) into an isolated virtualenv.
# Copied first so the layer is cached until dependencies change.
COPY pyproject.toml README.md ./
RUN uv sync --no-dev --no-install-project

# ---- Stage 2: runtime ----
FROM python:3.12-slim AS runtime

# Create an unprivileged user to run the app
RUN groupadd --system appuser \
    && useradd --system --gid appuser --create-home appuser

WORKDIR /app

# Bring in the pre-built virtualenv and application code
COPY --from=builder /app/.venv /app/.venv
COPY src/ ./src/
COPY alembic/ ./alembic/
COPY alembic.ini ./alembic.ini

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER appuser

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
