# /auth/me and /users/me Contract Consolidation (prismn-1413)

Standalone contract helper for issue #1413: two overlapping current-user
endpoints with duplicate schemas (`UserOut` at `/api/auth/me`, `UserProfileResponse`
at `/api/users/me`) that are field-for-field identical.

## Canonical endpoint
- **Canonical:** `GET /api/users/me` returning `UserProfileResponse`.
- **Deprecated alias:** `GET /api/auth/me` should remain temporarily for
  compatibility but be marked `deprecated=true` in OpenAPI and documented as an
  alias of `/api/users/me`.

## Schema consolidation
- Keep one response model (prefer `UserProfileResponse` or a shared `CurrentUserResponse`).
- Remove duplicate field-for-field model definitions; if both routes must exist,
  have `/auth/me` reuse the same schema and deprecation metadata.
- Web client already uses `/api/users/me`; mobile/shared clients should import the
  same canonical type.

## Acceptance checklist
- [ ] One response model for current-user profile.
- [ ] `/auth/me` marked deprecated in OpenAPI with pointer to `/users/me`.
- [ ] Shared/client types align with canonical schema.
