# Reports Module

The reports module manages civic issue reporting, categorization, geolocation tracking, and attachments.

## Endpoints

| Method | Path | Auth Required | Description |
|---|---|---|---|
| `POST` | `/api/reports` | Bearer Token | Submit a new civic issue report |
| `GET` | `/api/reports` | Public | List reports with pagination and filtering |
| `GET` | `/api/reports/{id}` | Public | Retrieve a specific report by ID |
| `PATCH` | `/api/reports/{id}` | Owner or Admin | Update report fields |
| `DELETE` | `/api/reports/{id}` | Owner or Admin | Soft-delete a report |

## Query Parameters for `GET /api/reports`

- `skip` (int, default 0): Offset for pagination.
- `limit` (int, default 50, max 100): Page size.
- `category` (string, optional): Filter by `ReportCategory` (e.g., `road`, `waste`, `infrastructure`).
- `status` (string, optional): Filter by `ReportStatus` (e.g., `submitted`, `under_review`, `resolved`).
- `user_id` (UUID, optional): Filter by authoring user.

## Error Codes

- `401 Unauthorized`: Missing or invalid Bearer authentication token.
- `403 Forbidden`: Mutating a report authored by another user.
- `404 Not Found`: Report ID does not exist or has been deleted.
- `422 Unprocessable Entity`: Invalid category, invalid coordinate bounds, or invalid media URLs.
