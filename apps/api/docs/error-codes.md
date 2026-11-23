# API error codes

Every error response has a stable `code` and a human-readable `message`:

```json
{ "code": "email_taken", "message": "A user with this email already exists", "field": "email" }
```

Clients should branch on `code`; `message` wording may change. Validation failures (422)
also carry `errors: [{ "field": ..., "message": ... }]`. Rate-limit responses (429) include a
`Retry-After` header with the number of seconds to wait.

| Code | Status | Meaning |
| --- | --- | --- |
| `bad_request` | 400 | The request could not be processed |
| `unauthorized` | 401 | Authentication is required or failed |
| `invalid_credentials` | 401 | Wrong email or password |
| `account_inactive` | 401 | The account has been deactivated |
| `invalid_token` | 401 | The bearer token is invalid or expired |
| `forbidden` | 403 | The caller may not perform this action |
| `not_found` | 404 | The resource does not exist |
| `user_not_found` | 404 | The user does not exist |
| `method_not_allowed` | 405 | The HTTP method is not supported on this route |
| `conflict` | 409 | The request conflicts with current state |
| `email_taken` | 409 | An account with this email already exists |
| `validation_error` | 422 | The request body or parameters are invalid |
| `invalid_transition` | 422 | The status change is not allowed from the current status |
| `rate_limited` | 429 | Too many requests; see `Retry-After` |
| `internal_error` | 500 | Unexpected server error; the details are in the server logs |
| `http_error` | any | An HTTP error without a more specific code |

New `AppError` subclasses must define a `code`; pass `code=` when raising to override it at
a specific call site.
