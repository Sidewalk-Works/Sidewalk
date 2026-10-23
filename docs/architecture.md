# Sidewalk architecture

## Shape of the system

```
Browser ──► Next.js (web :3000)  ──proxy /api/v1──►  NestJS (api :4000) ──► PostgreSQL
              │  Server Components fetch the API              │
              │  directly with the visitor's cookies          └──► S3-compatible object store
              └─ proxy.ts renews the short-lived access cookie
```

A **modular monolith**: one NestJS process, modules by business responsibility, one database. No microservices.

| Module                                                   | Responsibility                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `auth`                                                   | register, login, refresh rotation, logout, password hashing                                  |
| `users`                                                  | profile, password change, device sessions, account deletion (anonymisation)                  |
| `reports`                                                | creation (idempotent), discovery, detail, edit rules, lifecycle transitions, verification    |
| `evidence`                                               | upload pipeline, image validation/re-encoding, storage abstraction, authorised file delivery |
| `comments`                                               | citizen comments and staff updates, edit window, tombstones                                  |
| `moderation`                                             | flags, moderator queues, hide/remove/restore decisions, internal notes                       |
| `admin`                                                  | user roles and suspension, categories, audit log                                             |
| `categories`, `locations`, `activity`, `audit`, `health` | supporting services                                                                          |

Shared lifecycle rules, limits and response types live in `packages/contracts`, so the API enforces and the web UI
displays exactly the same transition table.

## The trust model

A report moves through explicit, validated states. Illegal moves are rejected with `409 INVALID_TRANSITION`.

```
SUBMITTED ─► UNDER_REVIEW ─► ACKNOWLEDGED ─► IN_PROGRESS ─► RESOLVED ─► REOPENED ─┐
    │             │               │               │            ▲          │       │
    ├──────────── ┴───────────────┴───────────────┴────────────┘          └───────┘ (back into the queue)
    ├─► REJECTED ─► UNDER_REVIEW        (closed without a repair; staff can reopen)
    └─► DUPLICATE ─► UNDER_REVIEW
```

(The authoritative table is `STATUS_TRANSITIONS` in `packages/contracts/src/lifecycle.ts`.)

- **A citizen submission is not an official acknowledgment.** New reports are public as `SUBMITTED`; the UI states
  what that does and does not mean.
- **Who may act:** the reporter may only claim `RESOLVED` or `REOPENED`. Staff (moderator/admin) may use every legal
  transition. Nobody else can. Verified agencies do not exist yet, so nothing is ever labelled “official”.
- **Every transition** writes `ReportStatusHistory` (previous and new status, actor, **role at the time**, basis, public
  note, timestamp), a public `ActivityEvent`, and, for staff, an `AuditLog` row, in one transaction with a
  compare-and-set on the previous status (so two simultaneous changes cannot both win).
- **Notes are mandatory** for `RESOLVED`, `REOPENED`, `REJECTED` and `DUPLICATE`.
- **Claimed vs verified:** `RESOLVED` always starts as `verification=CLAIMED` (“Resolution claimed, not verified”).
  `VERIFIED` requires (1) staff, (2) at least one resolution photograph, and (3) a staff member who is **not** the one
  who recorded the resolution. Reopening resets it. History is append-only, so earlier claims remain visible.
- **Public vs private:** public responses are built from explicit allow-lists (`reports.mapper.ts`), never by
  spreading database rows. Internal notes live in their own table, are served only by `/moderation/*`, and previous
  values of edited fields go to a private `ActivityEvent` (`isPublic=false`). Tests assert none of it leaks.
- **Staff updates** appear as “Sidewalk staff” with an explicit note that this is not a government statement.
  `CommentKind.OFFICIAL` is reserved in the schema for future verified organisations; nothing can create one.

## Authentication and sessions

- **Access token:** HS256 JWT, 15 minutes, `HttpOnly; SameSite=Lax` cookie `sw_at` (Secure in production).
  It identifies the user and the login it belongs to (`fid`); the database decides whether they may still act, so
  **suspensions, role changes, logout, password changes and device revocation apply on the next request**.
- **Refresh token:** 256-bit opaque random value in `HttpOnly` cookie `sw_rt`; only its SHA-256 hash is stored in
  `Session`. Each refresh **rotates** it. Presenting an already-rotated token (outside a 10-second grace for parallel
  tabs) revokes the whole login family. Logout, password change, suspension and deletion revoke sessions server-side.
- **Where cookies go:** the browser only talks to the web origin; a Next route handler (`app/api/v1/[...path]`)
  forwards `/api/v1/*` to the API and tells it the visitor's real address (authenticated with a shared secret), so
  cookies are first-party and rate limits are per visitor. Tokens are never in `localStorage`/`sessionStorage` and not readable by scripts (tested).
- **Renewal:** `apps/web/src/proxy.ts` renews the access cookie before a page renders and sends signed-out visitors to
  `/login?next=…`. The API remains the authority for every decision. `client-api.ts` retries once after a transparent
  refresh.
- **CSRF:** `SameSite=Lax` plus (a) an `Origin` allow-list check on every unsafe request and (b) a double-submit token
  (`sw_csrf` cookie echoed in `X-CSRF-Token`) whenever session cookies are present.
- **Passwords:** Argon2id (19 MiB, 2 iterations). Unknown emails are verified against a dummy hash so timing does not
  reveal accounts, and login errors are identical. Per-IP/user rate limits plus a per-account failure brake apply.
- **Account lifecycle:** see the next section. Registration, email confirmation and password reset are neutral
  (they never reveal whether an address has an account) and none of them signs anyone in.

## Account lifecycle and email

```
 HTTP request ──► service ──► one DB transaction ──► commit ──► (later) outbox worker ──► SMTP provider
                              ├─ the change itself          ▲
                              ├─ Notification rows          │ claims rows FOR UPDATE SKIP LOCKED
                              └─ EmailOutbox rows ──────────┘ sends, then marks SENT
```

**Why an outbox.** An email must never go out for something that did not happen, and must not be lost because the
process died between commit and send. So the request path only inserts `EmailOutbox` rows _inside the same transaction_
as the change; a worker sends after commit. Delivery is **at least once** (a crash after the provider accepts but
before the row is marked leaves the row retryable); every message carries a stable `Message-ID` (`<outboxId@host>`) and
a `dedupeKey`, so enqueueing the same event twice creates one row and providers/clients can recognise a re-send.
No Redis is involved: Postgres is the queue.

**Outbox row states:** `PENDING → SENDING → SENT`; on failure `FAILED` (retry later) and finally `DEAD`.
`SKIPPED` means the message was intentionally not sent (for example the account was deleted). Properties:

- Claiming uses `FOR UPDATE SKIP LOCKED`, so any number of workers can run; a row stuck in `SENDING` for more than five
  minutes (a crashed worker) is claimable again.
- Up to **6 attempts**, with delays of 1 min, 5 min, 30 min, 2 h and 6 h. Permanent provider errors (for example a
  rejected recipient) go straight to `DEAD`. `DEAD` and `FAILED` rows are visible at `/admin/email` with a sanitised
  reason (credentials and addresses are stripped) and can be retried by an administrator while their content still exists.
- A message counts as sent only after the provider **accepts** it. The payload is encrypted at rest (AES-256-GCM, key
  derived from the server secret) because it may contain a one-time link, and is **erased as soon as the message is
  sent**. Sent/skipped rows are deleted after 30 days, dead ones after 90.
- Counts, states, kind and a masked address (`a***@example.org`) are visible to administrators. Message content never is.

**Worker lifecycle.** `OutboxProcessor` is a polling loop (`OUTBOX_POLL_MS`, default 2 s; it runs again immediately while
there is work). By default the API embeds it. `pnpm worker` runs the identical processor in its own process (set
`OUTBOX_WORKER_ENABLED=false` on the API when you do). On `SIGTERM`/`SIGINT` it stops claiming and finishes the message in
flight. If the worker is down nothing is lost: rows wait in `PENDING` and `/admin/email` shows the backlog.

**One-time links (`AuthToken`).** Email verification (24 h) and password reset (30 min) use 32 random bytes
(base64url); only the SHA-256 hash is stored. Using a token is a single conditional `UPDATE … WHERE usedAt IS NULL AND
revokedAt IS NULL AND expiresAt > now()` in the **same transaction** as its effect, so two simultaneous uses cannot both
succeed. Issuing a new link revokes older ones; changing or resetting a password revokes outstanding reset links. The
token travels in the URL **fragment** (`#token=…`), which browsers never send to any server or in a Referer header; the
page asks for an explicit click before spending it (so link scanners that fetch URLs cannot consume it), strips the
fragment from the address bar at once, and sends `Referrer-Policy: no-referrer`. Links are built only from the configured
`WEB_ORIGIN`, never from a `Host` header, and neither full links nor tokens are logged.

**Enumeration resistance.** Registering with an existing address, resending confirmation and asking for a reset all return
the same neutral answer; the person with the address gets the real information by email (“you already have an account”,
“someone tried to register”). Per-account caps (60 s cooldown, 3 per hour) are applied silently on top of per-IP rate
limits. A signed-in person asking about their _own_ account is told about the cooldown; nobody else learns anything.

**Passwords and sessions.** A reset or password change revokes **every** session (the live-family check also kills
already-issued access tokens at once) and emails a “your password was changed” notice. A reset does **not** sign the
person in. Changing a password while signed in keeps only the current device.

**Unconfirmed accounts.** An account can sign in, read everything, manage its own profile, password and sessions, read its
notifications and preferences, and delete itself. It cannot create or edit reports, comment, flag, follow, upload or
remove evidence, change a status or use staff/admin tools. This is enforced in the **service layer** (`assertVerifiedEmail`)
so it cannot be bypassed by a new route forgetting a guard, and staff/admin checks require a confirmed address too.

## Notifications

`Notification` rows are written in the same transaction as the event that causes them (status change, reopen,
verification of a resolution, comment, staff update, moderation decision), so there is no window where the event exists
but the notice does not. `(userId, dedupeKey)` is unique, which makes re-processing harmless.

- **Audience:** the report's owner plus its followers (`ReportFollow`), minus whoever acted. Followers are only
  notified while the report is publicly visible, so hiding a report cannot leak updates about it.
- **In-app is always on; email is a preference.** Three optional switches (status updates, comments/staff updates,
  moderation) control only email. **Security email (confirmation, reset, password-changed, account-exists) is a separate
  category that cannot be switched off.** Optional email goes only to confirmed addresses.
- **Privacy:** moderation notices state the decision and the policy label only, never a moderator's reason or internal
  notes. Deleting an account deletes its notifications and follows and blanks any queued mail.
- **UI:** the header bell announces the unread count in its accessible name and updates immediately when notices are
  read; `/notifications` has All/Unread filters, per-item read/unread and “mark all as read”; opening a notice marks it
  read. There is no live push: a new notice appears on the next page load.

## Data model

Entities (`apps/api/prisma/schema.prisma`, migrations `…_init`, `…_integrity_guards`, `…_account_lifecycle_notifications`):

`User`, `Session`, `Category`, `Report`, `ReportEvidence`, `ReportStatusHistory`, `Comment`, `ActivityEvent`,
`ContentFlag`, `ModerationAction`, `InternalNote`, `AuditLog`, `AuthToken`, `ReportFollow`, `Notification`, `EmailOutbox`.

- Roles are an enum on `User` (CITIZEN, MODERATOR, ADMIN). A separate role table would add joins with no benefit
  until organisation memberships exist; the schema is ready to gain an `Organization` and membership later.
- `Report.reference` (`SW-` + 6 Crockford base32 characters, no ambiguous letters) and `User.email` are unique.
  `(reporterId, clientRequestId)` is unique, which makes submission idempotent. `(reportId, sha256)` stops the same
  photograph being attached twice. `(reporterId, targetKey)` stops duplicate flags.
- Indexes cover discovery (`moderationState, status, lastActivityAt`), ownership (`reporterId, lastActivityAt`),
  categories, timeline lookups and geography (`latitude, longitude`).
- **Geography:** WGS84 `double precision` latitude/longitude with a composite index. Bounding-box filters use the
  index; “near me” narrows by bounding box and then applies an exact haversine in SQL. At large scale, move to PostGIS
  (`geography(Point)` + GiST) behind the same API; no contract changes.
- **Search:** keyword search is `ILIKE` over title, description, address, area and exact reference. Fine for the MVP;
  add `pg_trgm` or full-text search when volume demands.
- **Deletion and retention:** deleting an account **anonymises** it (email, name and password wiped, sessions revoked);
  reports and comments remain, shown as “a resident”, so public history is not rewritten. Expired/revoked sessions are
  purged 30 days later. Evidence is deleted from storage when removed. Audit and moderation records are retained.
- **Personal data minimised:** email and name only; no IP addresses stored; photo metadata (including GPS) stripped.

## Evidence pipeline

1. Client previews and pre-validates type and size. 2. Multer (memory, 8 MB cap). 3. Magic-byte sniffing (JPEG, PNG,
   WebP only; declared type ignored). 4. `sharp` decodes and **re-encodes** to WebP (full ≤1800px, thumbnail ≤640px),
   applying orientation and dropping all metadata. Corrupt or non-images are refused. 5. SHA-256 duplicate check, per-report
   limit. 6. Stored via the `StorageProvider` interface (S3 or local disk).

Files are only ever served by `GET /api/v1/evidence/:id/file`, which applies visibility rules (hidden reports’ evidence
404s for the public; owners and staff get `Cache-Control: private`). Object-store URLs are never exposed or logged.

## Rate limits (per minute unless noted)

Register 5/hour · resend confirmation 5/hour · forgot password 5/hour · confirm email 20/hour · check/use reset link
30/10 per hour · login 10 · refresh 60 · report creation 10/hour · evidence upload 40/10 min · comments 20/10 min ·
flags 20/hour · password change 5/10 min · account deletion 3/10 min · geocoding 20 · default 300. Limits key on the user
when signed in, otherwise on IP, and scale with `RATE_LIMIT_MULTIPLIER` (tests only).

## Observability

Structured JSON logs (pino) with request ids, user ids, no query strings; passwords, cookies, auth headers, CSRF
tokens and token hashes are redacted. One error format everywhere: `{ statusCode, code, message, details[], requestId,
timestamp, path }`; unknown errors never leak internals. Swagger is generated from DTOs (disabled in production).

## Design system

Direction: an editorial public-interest publication (informed by the typographic confidence and plain-language,
one-action-per-section pacing observed on America.gov), with its own identity: warm paper, deep green ink, **laterite**
(Nigerian red earth) as the single action colour, Newsreader for display and Hanken Grotesk for interface text.
Rules: strong type hierarchy over cards; ruled lists instead of identical card grids; status is always a word first
(colour only reinforces); one focus ring everywhere; real licensed photography labelled as illustrative; no fabricated
numbers, quotes or activity. Tokens live in `apps/web/src/app/globals.css`.

## Decisions and assumptions

- **NestJS 11, not 12:** NestJS 12 is ESM-only; 11 (still published as `legacy`, CommonJS) integrates cleanly with Jest,
  Prisma and ts-jest. Revisit when the ecosystem catches up.
- **Prisma 7.10 (client and CLI), TypeScript 5.9, ESLint 9:** latest stable of each that is compatible with the rest of
  the toolchain (Prisma CLI 8 is a release candidate; TypeScript 7 is outside ts-jest’s supported range).
- **SeaweedFS instead of MinIO in Docker Compose:** MinIO no longer publishes its community image to Docker Hub.
- **Postgres on port 5442:** the author’s machine already runs Postgres on 5432/5433.
- **Same-origin API gateway** (a route handler, not a plain rewrite, because rewrites do not carry the client address)
  keeps cookies first-party, avoids CORS in production and authenticates the visitor address to the API.
- **Reporter name is hidden by default** (privacy first); reporters opt in per report.
- **Staff statuses:** until verified organisations exist, moderators/admins record progress as “Sidewalk staff”.
- **Hard navigation on sign-in/out** so the server-rendered header and caches always match the session.

## Known limitations and next milestone

- Email is delivered at least once, by one SMTP provider. There is no digest/batching yet (each event is one email),
  no bounce or complaint handling (a webhook from your provider would feed `EmailOutbox`/suppression), no unsubscribe
  header (all optional email can be switched off in account settings) and no live push for in-app notifications.
- Neutral responses hide _whether_ an account exists, but request timing for the “exists” and “does not exist” branches
  is not identical (the existing-account branch writes a row). A determined attacker with many IPs could measure it.
- No verified organisations or official responses yet (schema is ready: `CommentKind.OFFICIAL`).
- In-memory rate limiting (single instance; the shared-store plan is in [security.md](security.md)). Search is `ILIKE`, geography uses plain doubles (see above).
- HEIC photographs are not accepted (many phones export JPEG when uploading from the browser).
- Place search depends on a geocoder; with it off, residents use the map pin or coordinates.
- Hosted tile and geocoder services must be replaced before production traffic (enforced for geocoding at startup).
- The editorial photographs come from Wikimedia Commons and are credited on `/credits`; swap in commissioned
  photography when available.

See also [security.md](security.md) for the security policies, retention rules and operating assumptions.
