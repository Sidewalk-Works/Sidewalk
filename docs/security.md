# Security, data handling and operations

This document records what the system guarantees, the policies behind those guarantees, and what an operator must
provide. Every statement here is backed by a test unless it says otherwise. Run `pnpm test` and `pnpm test:e2e`.

## Deployment topology the guarantees assume

```
Internet ─► TLS-terminating reverse proxy / CDN ─► Next.js web server ─► NestJS API ─► Postgres, object storage
            (sets X-Forwarded-For)                  (public)             (private network only)
```

- **The API must not be reachable from the internet.** Bind it to loopback or a private interface (`API_HOST`).
  Browsers only ever talk to the web server, which forwards `/api/v1/*` through `src/app/api/v1/[...path]/route.ts`.
- **Visitor address and rate limits.** The API rate-limits per signed-in user, otherwise per client address. The API
  only sees the web server, so the web server passes the visitor's address in `X-Sidewalk-Client-IP`, authenticated by
  `INTERNAL_PROXY_SECRET`. The API ignores that header without the secret, and **never trusts a client-supplied
  `X-Forwarded-For`** unless `TRUST_PROXY` is set for a layout where a proxy sits directly in front of the API. The web
  server takes the `X-Forwarded-For` entry appended by the nearest trusted proxy (`WEB_TRUSTED_PROXY_HOPS`, default 1).
  If the web server is exposed directly to the internet, set `WEB_TRUSTED_PROXY_HOPS=0` (limits then fall back to a
  shared bucket) or, better, put a proxy in front.
- The server-rendered pages call the API with the same identity, so page views are limited per visitor, not as one.
- **Production refuses to start** without `INTERNAL_PROXY_SECRET` (or `TRUST_PROXY`) or `OUTBOX_ENCRYPTION_KEYS`, with
  placeholder secrets, the development database password or storage keys that ship in `docker-compose.yml`, insecure
  cookies, rate limiting disabled or weakened, a non-https `WEB_ORIGIN`, a loopback SMTP host, a test sender domain, or
  the public OSM geocoder. The mail connection must upgrade to TLS and its certificate is verified.

## Authentication and session design (verified)

| Property             | Mechanism                                                                                                                                                                                                            | Test                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Passwords            | Argon2id (19 MiB, t=2); never logged or returned                                                                                                                                                                     | `auth.spec`, `logging.spec`         |
| Access token         | HS256 JWT, 15 min, HttpOnly `SameSite=Lax` cookie, bound to a login _family_ (`fid`)                                                                                                                                 | `hardening.spec`                    |
| Immediate revocation | Token honoured only while its family has a live session: logout, password change, device revoke, suspension, deletion and token-reuse detection cut access at once                                                   | `hardening.spec` (4 tests)          |
| Refresh token        | 256-bit opaque, hashed at rest, rotated on every use, reuse outside a 10 s grace revokes the family                                                                                                                  | `auth.spec`                         |
| CSRF                 | `Origin` allow-list + double-submit token whenever cookies are present, on every unsafe method                                                                                                                       | `auth.spec`, `hardening.spec`       |
| Role/privilege       | Role read from the database per request; admin endpoints guarded _and_ re-checked in services; self-promotion and self-demotion impossible; role changes serialised under an advisory lock and re-validated under it | `moderation.spec`, `hardening.spec` |
| Login brute force    | Shared (PostgreSQL) per-route limits plus a sign-in brake keyed per account-and-address and per address; it paces, and never locks, an account                                                                       | `auth.spec`, `hardening.spec`       |
| Secrets in URLs      | Forms declare `method="post"` and stay disabled until the page is interactive                                                                                                                                        | E2E `validation`, `journey`         |
| Email confirmation   | Single-use hashed link (24 h), required for every write action; see “Account recovery and email” below                                                                                                               | `account-lifecycle.spec`, E2E       |
| Password reset       | Single-use hashed link (30 min); ends every session; never signs in; emails a notice                                                                                                                                 | `account-lifecycle.spec`, E2E       |

Known trade-offs: the brake cannot be used to lock someone else out (see “Rate limiting”), at the price that
guessing spread over many addresses is slowed to a few hundred tries per account per 15 minutes instead of being
stopped. Registration, resend and password-reset requests answer
identically whether or not an address has an account (see below), so the account-existence oracle that registration
used to be is closed; login is still timing-equalised against a dummy hash.

## Account recovery and email (verified)

**Tokens.** Confirmation and reset links carry 32 random bytes (base64url, 43 characters). Only the SHA-256 hash is
stored, so a database read cannot be turned into working links. A token is spent by one conditional `UPDATE` (still
unused, unrevoked and unexpired) inside the same transaction as its effect; of two simultaneous uses exactly one wins
(`account-lifecycle.spec` runs them concurrently). A newer link revokes older ones; any password change revokes pending
reset links; expired tokens are purged a week later.

**Where the token lives.** In the URL **fragment** (`/reset-password#token=…`), which a browser never sends to a server
or in `Referer`. The page requires an explicit click before the token is used (an email scanner or link previewer that
only fetches the URL cannot spend it), removes the fragment from the address bar immediately, is `noindex` and sends
`Referrer-Policy: no-referrer`. A real-browser test records every request and asserts the token appears in none of
them except the intended request body. Links are built from `WEB_ORIGIN` only; a forged `Host` or
`X-Forwarded-Host` cannot redirect them (tested). Production refuses a non-https `WEB_ORIGIN`.

**Never logged.** Full links, tokens and email bodies are not logged; logs carry the outbox id, kind and a masked
address. Outbox failure reasons are sanitised (credentials, tokens and addresses stripped) before they are stored.
Passwords and session credentials never appear in logs (`logging.spec`, `email-outbox.spec`) or in email (the
security-email test asserts neither a password nor a hash is present).

**Neutral responses and their limits.** `POST /auth/register`, `/auth/verification/resend` and `/auth/password/forgot`
return the same status and body for known and unknown addresses. The information goes to the inbox instead: an existing
owner is told “someone tried to register with your address” (it links only to the ordinary sign-in and forgot-password
pages, never to a token), an unknown address gets nothing. Residual leaks, accepted and documented: (1) **timing**: the known-address branch does extra
database work, so a patient attacker with many IPs and precise timing could distinguish them; (2) **rate-limit side
effects**: a per-account cooldown is applied silently and does not change the response; (3) **a signed-in person asking
about their own account** is told when they hit the cooldown. Mitigations: per-IP limits (5/hour on each of the three
endpoints) and per-account caps (60 s cooldown, 3 per hour).

**After a reset or password change.** Every session is revoked in the same transaction (so already-issued 15-minute
access tokens die at once), the person is **not** signed in automatically, and a “your password was changed” email goes
to the address on file, containing no password and no link that grants access. A reset cannot be replayed. Completing a
reset proves control of the mailbox, so it also confirms a still-unconfirmed address.

**Unconfirmed accounts.** Allowed: sign in, read, manage own profile/password/sessions, read notifications and
preferences, delete the account. Refused with `403 EMAIL_NOT_VERIFIED`: creating or editing reports, commenting,
flagging, following, uploading or removing evidence, changing status, and all staff/admin tools. The check lives in the
service layer; a sweep test calls every mutating route as an unconfirmed user (all refused) and checks that the same
account gets its full abilities the moment the address is confirmed. The
migration deliberately does **not** back-fill existing accounts (see the README upgrade note).

**Security email versus notifications.** Confirmation, reset, password-changed and account-exists messages are
security email: always sent, never subject to the notification switches, and sent even to unconfirmed addresses (that is
their purpose). Optional notification email respects the user's three preferences and goes only to confirmed addresses.
Notifications contain no moderator reasons or internal notes, only the decision and the policy label.

**The outbox.** Email is queued inside the transaction that causes it and sent only after commit, so a rolled-back
change never emails anyone (tested by forcing a rollback). Bounded retries (6 attempts, 1 min → 6 h backoff), then
`DEAD`, visible to administrators at `/admin/email`. Delivery is at-least-once; the stable `Message-ID` and a
`dedupeKey` per event prevent avoidable duplicates, and a worker re-asserts its claim on a message immediately before
sending it, so a slow batch cannot send a message another worker has since taken over.

**Outbox encryption.** Queued content (it can hold a one-time link) is encrypted at rest and erased once sent. The keys
are independent of every other secret:

- `OUTBOX_ENCRYPTION_KEYS` is `id:base64key[,id:base64key…]` (32 random bytes each). The **first** key encrypts; the rest
  only decrypt, so rotating never strands a queued message. It is required in production (a placeholder or malformed
  key is refused at startup, and error messages never echo key material). In development a key derived from the JWT
  secret is used when none is set.
- Each message is stored as `v1.<keyId>.<base64url(iv ‖ tag ‖ ciphertext)>`: AES-256-GCM, a fresh random IV, and the
  key id and the **outbox row id** as authenticated data. A ciphertext copied onto another row, re-labelled with another
  key id, or altered anywhere fails authentication.
- **A missing key is not a dead message.** If the key a message needs is not configured, the message is _held_: kept,
  no attempt consumed, rechecked every 10 minutes, shown at `/admin/email` and by `pnpm ops:check` as a failure. After a
  week it becomes `DEAD` with its content retained, so an administrator can still retry it once the key is back. If a
  configured key id is present but its material is wrong (or the content was altered) the message is `DEAD` at once,
  also with its content retained, and can be retried after the configuration is fixed.
- **Legacy rows.** Before keys were independent, content was encrypted with a key derived from `JWT_ACCESS_SECRET`
  and has no envelope. While `OUTBOX_LEGACY_JWT_DECRYPT=true` (the default) and the JWT secret is unchanged those rows
  still decrypt. `pnpm outbox:keys rewrap` re-encrypts them under the active key; afterwards set the flag to `false`.
  **Limitation:** if the JWT secret was already rotated while legacy rows were queued, those rows cannot be decrypted
  and nothing can recover them. They are held and then `DEAD`; the affected people request a new link. There is no
  key history to restore from.
- Tools: `pnpm outbox:keys generate | status | rewrap [--dry-run]`. `status` reports which key each queued message needs
  and whether it can be read; `rewrap` rewrites a row only if it still holds the ciphertext that was read (a worker
  sending it at that moment is never overwritten), and leaves unreadable rows untouched. Retire a key only when `status`
  shows no rows under it. **Back the keys up in a secret manager, separately from database backups**: a restored
  database without them has queued messages that cannot be read. Rotation and recovery steps: docs/operations.md.

**Worker lifecycle and scaling.** One embedded worker per API process is the default and is correct for a single
instance. With several instances either run exactly one dedicated `pnpm worker` (and set `OUTBOX_WORKER_ENABLED=false`
on the APIs) or leave several enabled: rows are claimed with `FOR UPDATE SKIP LOCKED`, so a message is processed by one
worker, and a worker that dies mid-send is recovered after five minutes. Stop workers with `SIGTERM`; they finish the
message in flight (and one killed outright, which cannot, leaves its messages claimed until the five minutes pass).
Alert on `failed + dead > 0`, held messages and a growing oldest-due age: `pnpm ops:check` and `/admin/email` show all
three. Rate limits are shared between instances through the database (see “Rate limiting”).

## Report lifecycle integrity (verified)

- Illegal transitions → `409`. Status change + history row + public event + audit row commit in **one transaction**
  with a compare-and-set on the previous status. Six simultaneous conflicting changes leave a gap-free history chain
  (`hardening.spec`: concurrency tests).
- **Verification** needs: staff; the report to be `RESOLVED` and `CLAIMED`; the verifier is not the person who recorded
  the resolution, is not the reporter, and did not upload every piece of resolution evidence. It runs under a row lock;
  evidence removal takes the same lock, and evidence behind a verified resolution cannot be deleted by anyone until the
  report is reopened.
- **Database guards** (migration `…_integrity_guards`): `AuditLog`, `ModerationAction` and `ReportStatusHistory` reject
  `UPDATE` and `DELETE` even from direct SQL; coordinates are range-checked; `VERIFIED` is impossible unless
  `RESOLVED`; `RESOLVED` always has a timestamp. (`TRUNCATE` is deliberately not blocked so disposable test databases
  can be emptied; it needs table-owner rights.)

## Verified organizations: identity, authority and abuse (verified by tests)

The threat is not a stranger reading data; it is someone **speaking in an institution’s name** (to excuse an agency, to
discredit one, or to mislead residents), and the quieter failures: stale authority, rewritten history, and a claim of a
fix mistaken for a fix. Controls, and where each is tested (`apps/api/test/organization-*.spec.ts`,
`official-responses.spec.ts`, and `apps/web/tests/organizations.spec.ts` in a real browser):

- **No inferred verification.** Only an administrator’s approval of a submitted application sets `VERIFIED`. Registering,
  being invited, owning a work email address, or being named by a resident does not. One verified organization per
  normalized name is enforced by a unique index, so two simultaneous approvals cannot both win, and a lookalike of a
  verified name is refused. Applications for similar names are shown to staff with the overlap listed; a match is a reason
  to look closer, never proof.
- **Authority is read from the database on every request**, never from the session or token. Removing a member,
  suspending the organization or withdrawing verification stops that person’s next request even though their sign-in is
  still valid (tested through the API and in the browser). Publishing re-checks authority **inside the transaction, under a
  lock on the report**, so a revocation that lands mid-request still wins.
- **Separation of duties.** Nobody reviews or decides their own application (a check constraint plus a service check).
  Staff who belong to an organization cannot decide, suspend, moderate or verify the work of it. A staff member who belonged to
  the claiming organization at any time since the claim, or who belongs to any organization connected to the report,
  cannot verify the resolution. The organization that claims a fix can never verify it.
- **Append-only records.** `VerificationDecision` and `OfficialResponse` reject UPDATE and DELETE from direct SQL (the
  only column that may change on a response is `moderationState`). Corrections and withdrawals are new rows. Names are
  snapshotted so a rename cannot rewrite who said what.
- **Invitations.** 256-bit token, SHA-256 at rest, in the URL **fragment** only (never in a path, query, log or
  Referer; the accept page sends `no-referrer` and removes it from the address bar). Bound to one confirmed address: a
  different account is refused without consuming it. Expiry, revocation, rotation on resend (the old link dies and its
  queued email is skipped), a per-day cap and a resend cooldown. Responses to “is there an account for this address” are
  identical. The token never appears in an audit row or notification.
- **Private applicant documents.** Same sniffing and re-encoding as evidence (images only, metadata stripped), stored under
  a separate prefix, served only by an authorization-aware route to the applicant and staff with `Cache-Control: private,
no-store`; the object-store address never leaves the API. `storage:reconcile` covers the prefix.
- **Evidence for claims.** Organization photographs are uploaded for one organization, kind `RESOLUTION`, attached to one
  response, cannot be reused for another claim, and are locked once staff verify. A claim without its own photograph is
  refused.
- **Leakage.** Public responses and profiles are built from explicit allow-lists (no author ids or emails, no reviewer
  notes, no unlisted parents or members); an unlisted organization and a nonexistent one return the same 404; hidden
  statements are visible only to staff and the organization that wrote them; hidden reports take their statements, metrics
  and profile entries with them.
- **Abuse limits.** Route limits on application creation, submission, documents, invitations, publishing, flagging,
  connecting and governance (see the route inventory test, which fails if a new write route has none). Per-report cap on
  suggested organizations; per-person cap on open applications; per-day cap on invitations. All writes need the CSRF token
  and a same-site origin like every other route.
- **Text.** Statements, notes and names are stored as text, control characters removed, rendered escaped by React. There
  is no markup, no link rendering in statements and no remote content.

What this does **not** give you: cryptographic or registry-backed proof that a body is who it says it is. The control is
a trained person checking independent sources (see [operations.md](operations.md#verifying-an-organization)). A determined
impersonator who can pass that review passes it; the audit record, the immediate suspension and the visible history are
the response.

## Evidence and uploads (verified)

- Pipeline: size cap before buffering (8 MB, one file, ≤4 short fields) → magic-byte check (JPEG/PNG/WebP only; the
  declared type and filename are ignored and never stored) → full decode and **re-encode** to WebP with a pixel limit
  (≤2 concurrent decodes) → SHA-256 duplicate check → storage → database row in a transaction.
- **Metadata policy:** all EXIF/XMP/IPTC is dropped, including GPS (re-encoding), so a reporter's home location is not
  published. Orientation is applied first.
- **Failure policy:** storage down → `503 STORAGE_UNAVAILABLE`, no row, no objects, report untouched, upload can be
  retried. Half-written objects (full image stored, thumbnail failed) are deleted. A crash between storing and
  committing can still orphan objects; `pnpm --filter @sidewalk/api storage:reconcile` lists them (and
  `-- --delete` removes those older than an hour) and also lists evidence rows whose files are missing.
- **Visibility policy for evidence:** files are served only by `GET /api/v1/evidence/:id/file`, never by object-store
  URL. Visible report → public, `Cache-Control: public, max-age=300` with an ETag. Hidden or removed report → owner and
  staff only, `private, no-store`; everyone else gets `404`. After a report is hidden, a copy already cached by a
  browser or CDN can remain for up to five minutes. Credentials for object storage exist only on the API server.

## Data retention and deletion policy

| Data                                                   | Policy                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account (email, name, password hash)                   | Deleting an account **erases** these immediately and ends every session.                                                                                                                                                                 |
| Reports, comments, evidence by that account            | **Retained, unattributed** (“a resident” / “Former resident”). They are public civic records and part of other people's discussions; removing them would rewrite history. Retention is documented on `/privacy` and in account settings. |
| Requests to remove content for safety or legal reasons | Moderators hide it; administrators can remove it. Removed content stays in the database for staff review and legal hold; physical purge is a manual operation (next milestone).                                                          |
| Rate-limit counters                                    | Keyed hashes only (no address, email or id), each living for its window (at most 15 minutes) and purged every minute; emptied by a database crash.                                                                                       |
| Sessions                                               | Revoked/expired sessions are deleted after 30 days.                                                                                                                                                                                      |
| Email links (`AuthToken`)                              | Only hashes are stored. Deleted one week after expiry, and immediately when the account is deleted.                                                                                                                                      |
| Email outbox                                           | Content is erased when a message is sent. Sent/skipped rows are deleted after 30 days, dead ones after 90. Deleting an account blanks queued mail and replaces stored addresses with a placeholder.                                      |
| Notifications and follows                              | Kept while the account exists; deleted with it. Notifications about a report are visible only to their recipient.                                                                                                                        |
| Internal notes, moderation history, audit log          | Retained indefinitely; append-only. They never contain passwords, tokens or message bodies.                                                                                                                                              |
| Logs                                                   | Structured, no query strings, no IP addresses, credentials redacted by key name and credential-shaped text removed from error messages. Database client errors log only their type and code, because they embed query data.              |
| Evidence objects                                       | Deleted from storage when evidence is removed; orphans found by `storage:reconcile`.                                                                                                                                                     |

## Rate limiting

Limits are counted in PostgreSQL, so they are exact across any number of API processes and survive restarts. Redis was
considered and not needed: measured on a laptop, the limiter adds about 2.6 ms at the median and the API still serves
roughly 3,500 requests/s (versus 4,600 without it) on the cheapest endpoint, far above this deployment's load.

**How it works.** One atomic `INSERT … ON CONFLICT DO UPDATE` per hit on a row in `RateLimitBucket`; the database clock
decides when a window ends. Each route has its own bucket per caller (signed-in users per account, everyone else per
client address); a route with no explicit limit gets 300 requests/minute. Keys are HMACs of the route and the caller,
so **no address, email or account id is stored**. Expired rows are deleted every minute in bounded batches by whichever
instance holds an advisory lock, so the table cannot grow without bound.

**Client identity and proxy trust.** The address is the web server's declared client, accepted only with the correct
`INTERNAL_PROXY_SECRET`, or the proxy hop an operator explicitly trusts with `TRUST_PROXY`; a client-supplied
`X-Forwarded-For` or `X-Sidewalk-Client-IP` is ignored (tested with rotating headers). IPv4-mapped IPv6 addresses are
the same client as their IPv4 form, and IPv6 is limited per **/64**, because one connection normally controls a whole
/64. An address that cannot be parsed shares one `unknown` bucket rather than getting a fresh one.

**The sign-in brake** counts failed sign-ins per _account and address_ (10 per 15 minutes), per _address_ across
accounts (30), and per _account_ from everywhere. The first two pause the guesser only: someone typing a victim's email
cannot stop the real owner signing in from elsewhere. The third, which catches guessing spread over many addresses,
never blocks: past 50 failures it allows one attempt per account every two seconds. Unknown emails are counted exactly
like known ones, so the brake reveals nothing about which accounts exist, and a success clears only that
account-and-address counter. Shared NAT is the one cost: many people behind one address share its 30-per-15-minutes.

**When PostgreSQL is slow or unavailable.** The limiter has its **own** small connection pool (4 connections) with
server-side `lock_timeout` equal to `RATE_LIMIT_STORE_TIMEOUT_MS` and `statement_timeout` of twice that, so a locked
or stuck table can neither starve the rest of the application of connections nor leave abandoned statements running
(regression-tested with a real table lock). `RATE_LIMIT_STORE_TIMEOUT_MS` (default 750, allowed 50–10000) is how long a
check may wait; beyond it, or on any store error, the request is counted in a bounded in-memory counter in that process
and its limit still applies. After three failures in a row the store is skipped for five seconds so a sick store does
not add latency to every request. The state is logged once per 30 seconds (type only, never keys), counted in
`fallbackHits`, and shown on `/admin/email` and by `pnpm ops:check`. A request that outlived the timeout may still be
recorded by the database when it finishes, so during a slow-store episode a few hits can be counted twice: harmless
for abuse protection, never lost. If the whole database is down the API cannot serve most requests anyway, and
liveness (`/health`, exempt from limits) keeps answering.

**Trade-offs, stated plainly.**

- Windows are fixed, not sliding: a client can send up to twice a limit across a window boundary.
- The table is `UNLOGGED` for cheap writes, which means PostgreSQL empties it after a **crash** (and it is not
  replicated to a standby): limits and the sign-in brake start from zero. This is standard PostgreSQL behaviour for
  unlogged tables; it was not exercised by crashing a server in testing.
- Rotating `JWT_ACCESS_SECRET` changes the HMAC key, which also just resets the counters.
- During a store outage each API process enforces limits on its own, so N instances allow up to N times the limit.

## Abuse controls in place

Per-route limits (see architecture doc) · 20 reports per account per rolling day (`DAILY_LIMIT`) · identical comment on
the same report refused within an hour · 10 flags/hour · one flag per person per item · moderators act with mandatory
reasons recorded to history and audit · health: `/health` unthrottled liveness (no dependency access), `/health/ready`
limited to 30/min and returns only `{status, checks:{database,storage}}`.

## Browser-side policy (verified in a real browser)

Per-request nonce `Content-Security-Policy` (`script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-inline` or
`unsafe-eval` for scripts, `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options`, `nosniff`,
`Referrer-Policy`, `COOP`, HSTS when the site URL is HTTPS. API responses are `Cache-Control: no-store` with
`Vary: Cookie`, except briefly cached public evidence. Private pages are `noindex` and disallowed in `robots.txt`.

## Email authentication (SPF, DKIM, DMARC)

Confirmation and reset links are only useful if they reach the inbox, and an unauthenticated sender that handles
account-recovery mail is also something attackers will spoof. Set this up **before** pointing production at a real
provider. The records below use `example.org` and a dedicated sending subdomain; substitute yours. Provider-specific
values (include hostnames, DKIM selectors and keys) come from your provider's dashboard: copy them exactly.

1. **Use a dedicated subdomain for transactional mail**, for example `mail.example.org`, and set
   `EMAIL_FROM="Sidewalk <no-reply@mail.example.org>"`. A separate subdomain keeps its sending reputation apart from your
   corporate mail and lets DMARC be strict without risk to anything else. The API refuses to start in production if
   `EMAIL_FROM` ends in `.test`, `.invalid`, `.example` or `.localhost`.
2. **SPF** authorises the servers that may send for the envelope-from (bounce) domain. Publish exactly **one** TXT record
   (a second one invalidates both) at the domain your provider uses for the return path, normally the sending domain:

   ```
   mail.example.org.  TXT  "v=spf1 include:<spf-host-from-your-provider> ~all"
   ```

   Start with `~all` (soft fail); move to `-all` once reports are clean. Stay under 10 DNS lookups in total.

3. **DKIM** signs each message. Your provider gives a selector and either a TXT public key or CNAME records:

   ```
   <selector>._domainkey.mail.example.org.  CNAME  <value from provider>
   ```

   Make sure messages are signed with **your** domain (`d=mail.example.org`), not the provider's shared domain, or
   DMARC alignment fails. Use 2048-bit keys and rotate them at least yearly (publish the new selector first).

4. **DMARC** tells receivers what to do with mail that fails both. Roll it out gradually:

   ```
   _dmarc.mail.example.org.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.org; adkim=s; aspf=s; fo=1"
   ```

   Week 0–3: `p=none` and read the aggregate (`rua`) reports; fix any legitimate source that fails. Then `p=quarantine; pct=25`,
   increase to 100, and finally `p=reject`. Strict alignment (`adkim=s; aspf=s`) is appropriate because only this
   subdomain sends through this system.

5. **Verify before launch.** Send a confirmation email to a Gmail and an Outlook mailbox and open “show original” / message
   source: the headers must read `spf=pass`, `dkim=pass` and `dmarc=pass`. Check the provider dashboard and Google
   Postmaster Tools for reputation, and test spam placement with a seed-list tool.
6. **Optional hardening:** MTA-STS and TLS-RPT for inbound mail on the domain, `reply-to` pointing at a monitored support
   mailbox (currently `no-reply@`), and a webhook from the provider for **bounces and complaints**. The latter is not
   built: today a hard bounce marks the message `DEAD` after one attempt, but the address is not suppressed from later mail.

The messages set `Auto-Submitted: auto-generated` and `X-Auto-Response-Suppress: All` so out-of-office replies do not loop
back, and never include tracking pixels or tracked links.

## Dependency hygiene

`pnpm audit` is clean (maplibre-gl upgraded to 6.15 for a sanitizer advisory; `js-yaml` pinned ≥ 5.4.1). Run it in CI
(`pnpm audit --audit-level high`) and review Dependabot or Renovate updates; native modules are limited to an explicit
allow-list in `pnpm-workspace.yaml`.

## Not covered yet (see the next-milestone plan)

Two-factor authentication for staff (the people who verify organizations are protected only by a password and a confirmed address), registry-backed organization identity checks, periodic re-verification, bounce/complaint suppression, digest emails, a way to change the account email
address (a verified change flow), account lockout recovery for staff without mail access beyond the operator CLI, a malware/NSFW scan of uploads, physical purge of
removed content, WAF/bot challenge on registration, and a CAPTCHA fallback if registration abuse appears.
