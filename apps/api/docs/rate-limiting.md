# Rate limiting

Limits are enforced with slowapi and configured through environment variables:

| Variable | Purpose |
| --- | --- |
| `RATE_LIMIT_DEFAULT` | Limit applied to every route (default `200/minute`) |
| `RATE_LIMIT_LOGIN` | Stricter limit for `POST /api/auth/login` (default `10/minute`) |
| `RATE_LIMIT_STORAGE_URI` | Shared counter store, e.g. `redis://localhost:6379/0` |
| `TRUSTED_PROXY_IPS` | Comma-separated reverse-proxy addresses whose `X-Forwarded-For` is trusted |

## Client address behind a proxy

By default the limiter keys on the socket peer. Behind a load balancer that is the
balancer for every caller, so one noisy client would exhaust the limit for everyone.
List the balancer's address in `TRUSTED_PROXY_IPS`: for requests arriving from a
trusted proxy, the right-most `X-Forwarded-For` entry that is not itself a trusted
proxy is used as the client. The header is ignored for any other peer, so it cannot
be forged to dodge limits. Run uvicorn with `--proxy-headers` and the same
`--forwarded-allow-ips` so the rest of the stack agrees about the client address.

## Multiple workers

The default in-memory store is per process: with N workers each client effectively
gets N times the configured limit, and counters reset on restart. Set
`RATE_LIMIT_STORAGE_URI` to a Redis instance so every worker shares one counter.
