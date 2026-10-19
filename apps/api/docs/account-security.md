# Account security

## Tokens

- **Access token**: a JWT valid for `JWT_EXPIRES_MINUTES` (default 15). It carries a `jti` and the
  user's `tv` (token version). Send it as `Authorization: Bearer <token>`.
- **Refresh token**: an opaque, single-use secret valid for `REFRESH_TOKEN_EXPIRES_DAYS` (default 30),
  stored only as a SHA-256 hash. `POST /api/auth/refresh` exchanges it for a new access *and* refresh
  token (rotation). Presenting an already-rotated refresh token means it leaked, so every session of
  that user is revoked.
- **Revocation**: `POST /api/auth/logout`, changing the password and resetting it bump the user's
  token version, which invalidates all of their outstanding access tokens, and retire their refresh
  tokens.

## Failure modes

Authentication failures are `401` with `WWW-Authenticate: Bearer` and a `code`:

| `code` | Meaning | Client action |
| --- | --- | --- |
| `token_expired` | The access token's lifetime ended | Call `/auth/refresh` |
| `token_invalid` | Malformed, forged, revoked or unknown token | Sign in again |

The underlying reason (signature mismatch, revoked version, ...) is logged server-side as
`token_rejected` and never returned.

## Password change and recovery

- `POST /api/users/me/password` `{current_password, new_password}`: revokes all other sessions and
  returns a fresh token pair for the caller.
- `POST /api/auth/forgot-password` `{email}` always answers `202` with the same body. If the account
  exists, a reset link is mailed.
- `POST /api/auth/reset-password` `{token, new_password}`: reset tokens are single-use, expire after
  `RESET_TOKEN_EXPIRES_MINUTES` (default 30) and are stored hashed. A successful reset revokes every
  session.

## Email verification and changes

- Registration mails a verification link (`EMAIL_TOKEN_EXPIRES_HOURS`, default 48);
  `POST /api/auth/verify-email` `{token}` marks the address verified. `email_verified` is part of the
  user payload.
- **Policy for unverified accounts**: they can sign in and use the API as before, except that with
  `REQUIRE_VERIFIED_EMAIL=true` they cannot create reports. The default is `false`.
- `PATCH /api/users/me` with a new `email` requires `current_password`. The address is held in
  `pending_email` and only replaces `email` once its owner posts the mailed token to
  `POST /api/auth/confirm-email-change`.

## Mail

`MAIL_BACKEND=console` (default) logs outgoing messages; links point at `APP_BASE_URL`. Add a backend
by implementing `MailBackend.send` in `src/core/mail.py`.
