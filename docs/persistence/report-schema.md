# Report Persistence Schema

This document describes the current report persistence model as implemented in the FastAPI backend.

## Source of truth

- SQLAlchemy model: `apps/api/src/modules/reports/models.py` (`Report`)
- Alembic migration: `apps/api/alembic/versions/003_add_reports_table.py`
- Enums: `apps/api/src/core/enums.py` (`ReportStatus`, `ReportCategory`)

## `reports` table

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key (`UUIDPKMixin`) |
| `title` | `String(255)` | Required |
| `description` | `Text` | Required |
| `category` | `String(50)` | Indexed; values from `ReportCategory` |
| `status` | `String(50)` | Indexed; default `submitted`; values from `ReportStatus` |
| `user_id` | UUID FK (`users.id`) | Indexed; report author |
| `latitude` | `Float` | Optional |
| `longitude` | `Float` | Optional |
| `address` | `String(500)` | Optional |
| `media_urls` | `JSON` | Required; defaults to empty list |
| `is_deleted` | `Boolean` | Default `false` (soft-delete flag) |
| `flagged` | `Boolean` | Default `false` |
| `flag_reason` | `String(255)` | Optional |
| `created_at` | `DateTime(tz)` | Server default `now()` |
| `updated_at` | `DateTime(tz)` | Server default `now()`, updated on change |

## Status values

Defined in `ReportStatus` (`src/core/enums.py`):

- `submitted`
- `under_review`
- `verified`
- `assigned`
- `in_progress`
- `resolved`
- `closed`

Transitions are enforced by `REPORT_STATUS_TRANSITIONS` in `src/core/enums.py`.

## Category values

Defined in `ReportCategory` (`src/core/enums.py`):

- `road`
- `waste`
- `infrastructure`
- `environment`
- `utility`

## Indexes

- Migration `003_add_reports_table.py` creates indexes on `category`, `status`, and `user_id`.
- The SQLAlchemy model also declares composite indexes for common list queries:
  - `ix_reports_deleted_status_created` (`is_deleted`, `status`, `created_at`)
  - `ix_reports_deleted_category_created` (`is_deleted`, `category`, `created_at`)
