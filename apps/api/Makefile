# apps/api/Makefile
.PHONY: install dev test lint typecheck migrate

install:
	uv sync --extra dev

dev:
	uv run uvicorn src.main:app --reload

test:
	uv run pytest

lint:
	uv run ruff check .

typecheck:
	uv run mypy src

migrate:
	uv run alembic upgrade head