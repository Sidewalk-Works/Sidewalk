# Report Media Metadata (Current Implementation)

This document describes how report media is currently represented in the codebase.

## Current schema

The `Report` model (`apps/api/src/modules/reports/models.py`) stores media as:

- `media_urls: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)`

The Alembic reports migration (`003_add_reports_table.py`) creates `media_urls` as a non-null JSON column.

## Current behavior

- Reports can store an ordered list of media URL strings in `media_urls`.
- The field is present in the report API/schema layer as a list of strings.
- No separate `report_media` table or per-media metadata records (mime type, size, storage key, moderation metadata) are implemented in the current backend.

## Extending media metadata

If per-media metadata is added in the future, prefer an additive migration strategy:

1. Add a new table (for example `report_media`) with a foreign key to `reports.id`.
2. Keep `media_urls` backward-compatible during migration/rollout if clients still depend on it.
3. Add Alembic migration(s), update SQLAlchemy models/schemas/services, and cover with tests.
4. Document the new source of truth and deprecation plan for `media_urls`.

This keeps the current schema factual while leaving a clear path for richer attachment metadata.
