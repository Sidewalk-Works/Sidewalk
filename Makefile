.PHONY: reset-db seed migrate test lint

API_DIR := apps/api
UV_RUN := uv run --project $(API_DIR)

reset-db:
	$(UV_RUN) python $(API_DIR)/scripts/reset_db.py

seed:
	$(UV_RUN) python $(API_DIR)/scripts/seed.py

migrate:
	$(UV_RUN) alembic -c $(API_DIR)/alembic.ini upgrade head

test:
	$(UV_RUN) pytest $(API_DIR)/tests

lint:
	$(UV_RUN) ruff check $(API_DIR)