.PHONY: reset-db seed

reset-db:
	uv run python scripts/reset_db.py

seed:
	uv run python scripts/seed.py
