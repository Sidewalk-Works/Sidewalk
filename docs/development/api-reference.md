# API Reference

This page provides a short endpoint index by module. For full request/response schemas, run the API and use the interactive OpenAPI docs at `http://localhost:8000/docs`.

## Auth (`/api/auth`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Log in and receive auth tokens |
| GET | `/api/auth/me` | Get the current authenticated user |
| POST | `/api/auth/refresh` | Rotate refresh/access tokens |
| POST | `/api/auth/logout` | Revoke caller tokens |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/verify-email` | Verify email with token |
| POST | `/api/auth/confirm-email-change` | Confirm email change with token |

## Users (`/api/users`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/users/me` | Get current user profile |
| PATCH | `/api/users/me` | Update current user profile |
| POST | `/api/users/me/password` | Change password |

## Reports (`/api/reports`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/reports` | Create a report |
| GET | `/api/reports` | List reports (returns a list response) |
| GET | `/api/reports/{report_id}` | Get report by ID |
| PATCH | `/api/reports/{report_id}` | Update report |
| DELETE | `/api/reports/{report_id}` | Delete report |

## Cases (`/api/cases`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/cases` | List cases (paginated) |
| GET | `/api/cases/{case_id}` | Get case details |
| POST | `/api/cases/{case_id}/follow` | Follow a case |
| DELETE | `/api/cases/{case_id}/follow` | Unfollow a case |

## Moderation (`/api/moderation`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/moderation/reports/{report_id}/flag` | Flag a report |
| PATCH | `/api/moderation/reports/{report_id}/status` | Update report moderation status |

## Notifications (`/api/notifications`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/notifications` | List notifications (paginated) |
| PATCH | `/api/notifications/read-all` | Mark all notifications as read |
| PATCH | `/api/notifications/{notification_id}/read` | Mark a notification as read |

## Status transitions and pagination

- Report status transitions are enforced by API business rules; see the reports module code/tests and OpenAPI schema for current allowed transitions.
- Pagination shapes vary by endpoint: some list endpoints return paginated objects, while `GET /api/reports` currently returns a bare list.
