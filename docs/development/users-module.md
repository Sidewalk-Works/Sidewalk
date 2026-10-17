# Users Module

The users module manages user profiles and account metadata.

## Endpoints

| Method | Path | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/users/me` | Bearer Token | Get the authenticated user's profile |
| `PATCH` | `/api/users/me` | Bearer Token | Update the authenticated user's profile |

## Schemas

### UserProfileResponse
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "is_active": true,
  "is_admin": false,
  "created_at": "2026-09-26T00:00:00Z",
  "updated_at": "2026-09-26T00:00:00Z"
}
```

### UpdateProfileRequest
```json
{
  "email": "new_email@example.com"
}
```

## Error Codes

- `401 Unauthorized`: Missing or invalid Bearer authentication token.
- `404 Not Found`: Authenticated user not found in database.
- `409 Conflict`: Specified email address is already in use by another account (`field: "email"`).
- `422 Unprocessable Entity`: Invalid request payload or empty update body.
