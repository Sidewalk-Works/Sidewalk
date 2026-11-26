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
  transition. A representative of a **verified** organization may record only `ACKNOWLEDGED`, `IN_PROGRESS` and a
  `RESOLVED` _claim_ (the `ORGANIZATION` actor), and only through the official-response route. Nobody else can. Nothing
  is labelled “official” unless a Sidewalk administrator verified the organization that said it.
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
  Official statements are a separate record (`OfficialResponse`, below), not a kind of comment. `CommentKind.OFFICIAL`
  remains unused and nothing can create one.

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
  reveal accounts, and login errors are identical. Per-route rate limits and the sign-in brake apply; both are counted in
  PostgreSQL and shared by every API process (see “Rate limits”).
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
- A message counts as sent only after the provider **accepts** it. The payload is encrypted at rest because it may
  contain a one-time link, and is **erased as soon as the message is sent**. Encryption uses a versioned keyring
  (`OUTBOX_ENCRYPTION_KEYS`, independent of the JWT secret): each message is `v1.<keyId>.<…>`, AES-256-GCM, bound to its
  key id and its row id. A message whose key is not configured is _held_, not killed (kept, no attempt used, rechecked every
  10 minutes, `DEAD` with content retained after a week); a message that fails authentication is `DEAD` at once, content
  retained, retryable once fixed. Keys are generated, rotated and retired with `pnpm outbox:keys`; legacy rows encrypted
  with the old JWT-derived key stay readable until rewrapped. Details and limits: [security.md](security.md#account-recovery-and-email-verified).
  Sent/skipped rows are deleted after 30 days, dead ones after 90.
- Before each send a worker re-asserts its claim on the message (same status and claim time) and renews it, and only the
  holder of that claim may finish it, so a worker that is slow, or whose claim went stale, cannot send a message another
  worker has taken over. A worker killed outright leaves its claimed messages until the five minutes pass; a worker told
  to stop (`SIGTERM`) finishes the message in flight and records the outcome.
- Timestamps are stored without a zone, as UTC, and the outbox SQL compares them in UTC explicitly, so a database whose
  time zone is not UTC neither delays mail nor ignores retry delays (regression-tested under three zones). `pnpm ops:check`
  still warns when the session zone is not UTC.
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

## Verified organizations and official responses

Principles the code and the wording protect: a registered profile is not a verified institution; an invitation is not
proof of identity; every response is attributable to an organization and to a named person; an acknowledgement is not
acceptance of responsibility; a resolution _claim_ is not independent verification; evidence is access-controlled;
every decision is auditable; and a suspension or revocation takes effect on the very next request.

### Model (migration `20261024120000_verified_organizations`, additive only)

| Table                     | Purpose                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Organization`            | Identity (`verificationStatus`: UNVERIFIED / VERIFIED / REVOKED) kept apart from standing (`status`: ACTIVE / SUSPENDED) and from `publicProfile` (listed or not). A normalized name; a partial unique index allows **one VERIFIED organization per normalized name**. |
| `OrganizationApplication` | DRAFT → SUBMITTED → UNDER_REVIEW ⇄ INFO_REQUESTED → APPROVED / REJECTED, or WITHDRAWN. One open application per person per organization. A check constraint forbids reviewing your own application.                                                                    |
| `OrganizationDocument`    | Private supporting images (`org-documents/…`), same re-encoding pipeline as evidence. Applicant and staff only.                                                                                                                                                        |
| `VerificationDecision`    | Append-only log of reviews, questions, approvals, rejections, suspensions, reinstatements and revocations, with actor, reason and before/after state (trigger rejects UPDATE/DELETE).                                                                                  |
| `OrganizationMember`      | ADMIN / REPRESENTATIVE / MEMBER. Rows are never deleted: removal is `status=REVOKED` with who and why. A partial unique index allows one ACTIVE row per person per organization.                                                                                       |
| `OrganizationInvitation`  | Only a SHA-256 of a 256-bit token is stored. Bound to one email address; one pending invitation per address and organization.                                                                                                                                          |
| `OfficialResponse`        | Append-only statement (a trigger lets only `moderationState` change). Snapshots the organization’s and author’s names and the verification time at publication. `supersedesId` links corrections and withdrawals.                                                      |
| `ReportOrganization`      | That an organization is connected to a report, on what `basis` (reporter suggested / staff assigned / organization added itself) and `status` (PROPOSED / ACTIVE / OUTSIDE_REMIT / REMOVED). Acknowledgement is a separate timestamp.                                  |
| existing tables           | `ReportEvidence` and `ReportStatusHistory` gain `organizationId` / `responseId`; `ContentFlag` and `ModerationAction` gain a response target.                                                                                                                          |

### Who may do what (enforced in guards **and** service methods; read from the database on every request)

| Action                                                                                            | Who                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| See a listed profile, its connected public reports and responses                                  | Anyone. Unlisted profiles: their members and staff; everyone else gets the same 404 as a missing one                                                                                                             |
| Apply; read or edit your own application; attach documents                                        | Any resident with a confirmed address (documents: applicant and staff only)                                                                                                                                      |
| Start review, ask a question, keep private notes                                                  | Moderators and administrators, never on their own application or an organization they belong to                                                                                                                  |
| **Approve or reject** (the only way an organization becomes verified)                             | Administrators only; same conflict rules; decision is final for that application                                                                                                                                 |
| Create an unverified record, optionally inviting someone                                          | Administrators                                                                                                                                                                                                   |
| Suspend, reinstate, withdraw verification                                                         | Administrators, with a recorded reason; not for an organization they belong to                                                                                                                                   |
| Invite, change roles, remove members                                                              | An organization ADMIN of a verified, active organization; any Sidewalk administrator                                                                                                                             |
| Leave an organization                                                                             | Any member except its last administrator                                                                                                                                                                         |
| Publish an official response; add the organization to a report; upload its resolution photographs | An ADMIN or REPRESENTATIVE of a **verified, active** organization, with a confirmed address, whose connection to the report is not removed                                                                       |
| Suggest an organization for a report                                                              | The person who filed it (the connection is PROPOSED)                                                                                                                                                             |
| Assign or remove a connection                                                                     | Moderators and administrators                                                                                                                                                                                    |
| Flag a statement                                                                                  | Any confirmed resident who does not belong to that organization                                                                                                                                                  |
| Hide / restore a statement                                                                        | Staff who do not belong to that organization (restoring removed content: administrators)                                                                                                                         |
| Verify a resolution                                                                               | Staff who are not the reporter or the recorder, did not upload all the evidence, and **do not belong to** (now, or since the claim) the organization that claimed it or any organization connected to the report |

A membership never grants Sidewalk staff powers and staff powers never create a membership.

### Verification is a human decision

Nothing registers, invites, emails or infers an organization into the verified state. The only code path that sets
`VERIFIED` is an administrator’s approval of a submitted application (`GovernanceService.decide`), inside a transaction
that locks the application, re-checks conflicts, and relies on the unique index as the last word if two decisions race.
The approval has these documented effects and no others: the organization becomes VERIFIED and listed, the applicant is
appointed its first administrator unless the administrator unticks that, a `VerificationDecision` and an audit row are
written, and the applicant is notified. What staff should check is in [operations.md](operations.md#verifying-an-organization).
Sidewalk does not integrate with any government directory; there is no automatic proof of identity.

### Official responses

`POST /reports/:reference/official-responses` re-checks authority **inside the transaction, under a lock on the report
row**, so a revocation, suspension or removal that lands mid-request still wins. Types and their effect on the report:

- `ACKNOWLEDGEMENT`: records `acknowledgedAt`; moves a SUBMITTED / UNDER_REVIEW / REOPENED report to ACKNOWLEDGED. It says
  the organization has seen the report. It does not accept responsibility.
- `UPDATE` / `DELAY`: text only; an update may also record IN_PROGRESS, but only after an acknowledgement.
- `OUT_OF_REMIT`: marks the connection OUTSIDE_REMIT. It changes no report status and is the organization’s statement,
  never a finding; it lands in a staff queue so a person can decide who is responsible.
- `RESOLUTION_CLAIM`: needs at least one photograph the organization itself uploaded and not yet used. The report
  becomes RESOLVED with `verification=CLAIMED` and status basis `ORGANIZATION_STATEMENT`. It can never produce VERIFIED.
  Only independent staff verify (rules above). A reporter can reopen it; the organization is told.
- `CORRECTION` / `WITHDRAWAL`: a new entry pointing at the one it replaces (only the newest, only your own). The old text
  stays visible, marked as replaced. Withdrawing a standing claim reopens the report; a claim staff have verified cannot
  be withdrawn by the organization.

A report that is closed as REJECTED or DUPLICATE accepts only corrections and withdrawals.

### Public pages and metrics

`/organizations` (search and filters), `/organizations/:slug` (profile), the report page’s “Organizations connected” and
“What organizations have said” sections. Public JSON is built from explicit allow-lists. The badge always uses words:
“Verified organization”, “Not verified”, “Verification withdrawn”, and “Suspended” alongside, never instead of, the
identity fact. Statements show the name the organization had when it spoke. A statement that moderators hide is withheld everywhere its words would otherwise appear: the timeline excerpt, the resolution note a claim copied onto the report, and its photographs (the photograph file route returns 404 to everyone but staff and the organization). The fact that the status changed stays on the record. Notifications and emails already sent are not recalled.

Metrics are four plain counts over **public** reports and **all time**, defined where they are shown: reports
connected (not removed); reports on which it published an acknowledgement; reports on which it published a resolution
claim (each report once); and, of the reports whose _current_ resolution it last claimed, those independently
verified. There are deliberately no rates, averages, response times or rankings: each needs a denominator and a window
that could mislead, and none is invented. Hidden reports and hidden statements are excluded.

### Notifications

Reuses the existing in-transaction notifications and encrypted outbox. New types: `OFFICIAL_RESPONSE`,
`RESOLUTION_CLAIMED`, `ORGANIZATION` (always emailed, like other account-affecting notices) and a new outbox kind
`ORGANIZATION_INVITATION`. Recipients: the reporter and followers hear about responses (never the author); members hear
about governance decisions (the fact, not the reason); the organization hears when it is named, when its claim is
reopened or verified; the inviter hears when someone joins. Dedupe keys come from stored ids and timestamps, so a retry
cannot notify twice. The invitation email is composed at send time and skips an invitation that was revoked,
replaced or has expired since it was queued.

### Invitations

A 256-bit random token, shown once in the email as a URL **fragment** (`/organizations/invitations/accept#token=…`) so
servers, proxies, referrers and link-scanners never see or consume it. Only its SHA-256 is stored. It is bound to one
confirmed email address: another signed-in account is refused and the invitation is **not** consumed. Acceptance claims
the row with a compare-and-set, so concurrent clicks admit exactly one. Resend rotates the token (the old link dies and
the old queued email is skipped) and is paced; invitations are capped per day.

### Stage-by-stage summary of what changed in existing code

`reports.service` (detail DTO, reopen and verify notifications, the organization conflict rule), `evidence.service`
(organization uploads and their lock), `moderation.service` (response flags and actions), `activity.service`,
`notifications.service`, `email/templates` and `outbox.service`, plus contracts (`organizations.ts`, the
`ORGANIZATION` transition actor, shared limits).

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
`ContentFlag`, `ModerationAction`, `InternalNote`, `AuditLog`, `AuthToken`, `ReportFollow`, `Notification`, `EmailOutbox`,
`Organization`, `OrganizationApplication`, `OrganizationDocument`, `VerificationDecision`, `OrganizationMember`,
`OrganizationInvitation`, `OfficialResponse`, `ReportOrganization` (see the section above).

- Roles are an enum on `User` (CITIZEN, MODERATOR, ADMIN). Organization roles are a different thing, stored on
  `OrganizationMember`, and deliberately not on the user or in the session: they are read from the database on every
  request so removal and suspension are immediate.
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

## Rate limits

Counted in PostgreSQL (`RateLimitBucket`, an unlogged table of hashed keys with one fixed window each), so limits are exact
across API processes. One route, one caller, one bucket: signed-in users are keyed by account, everyone else by client
address (IPv6 by /64); routes without an explicit limit get 300 per minute. If the shared store is slow or down, the limiter
falls back to a bounded in-process counter (its own 4-connection pool with server-side timeouts, so it cannot starve the
application of connections); `RATE_LIMIT_STORE_TIMEOUT_MS` sets how long a check may wait. Full behaviour, the sign-in
brake and the trade-offs (fixed-window bursts, reset after a database crash): [security.md](security.md#rate-limiting).

Register 5/hour · resend confirmation 5/hour · forgot password 5/hour · confirm email 20/hour · check/use reset link
30/10 per hour · login 10/minute · refresh 60/minute · report creation 10/hour · evidence upload 40/10 min · comments 20/10 min ·
flags 20/hour · password change 5/10 min · account deletion 3/10 min · email retry 60/10 min · geocoding 20/minute ·
readiness 30/minute · default 300/minute (liveness is exempt). Limits scale with `RATE_LIMIT_MULTIPLIER` (tests only;
production refuses anything but 1). The sign-in brake: 10 failures per account-and-address and 30 per address in 15
minutes pause that address; a high per-account total only paces attempts.

## Observability

Structured JSON logs (pino) with request ids, user ids, no query strings; passwords, cookies, auth headers, CSRF
tokens and token hashes are redacted. One error format everywhere: `{ statusCode, code, message, details[], requestId,
timestamp, path }`; unknown errors never leak internals. Swagger is generated from DTOs (disabled in production).

## Operations

Health: `GET /api/v1/health` (liveness, exempt from limits) and `/health/ready` (database and storage). `pnpm ops:check`
runs the shared checks (database and its time zone, migrations, email queue and held messages, rate-limit store,
administrator access, optionally storage) and exits non-zero on failure; the same figures appear on `/admin/email`
(stalled worker, held messages, degraded limiter, dead and retrying counts, with an audited retry whose button names the
message it affects). Rehearsals: `pnpm ops:restore-check`, `pnpm ops:drill`, `pnpm ops:prodlike`. Runbooks, upgrade, key
rotation, backup and incident steps: [operations.md](operations.md).

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
- **Staff statuses:** moderators/admins record progress as “Sidewalk staff”; an organization’s own statements are
  labelled with its name and the basis `ORGANIZATION_STATEMENT`, so the two are never confused.
- **Verification by people, not by signals:** the model has no “auto-verify” path; see above. Email domains, invitations and
  registration prove none of identity.
- **Reserved addresses:** a name that would slugify to `mine`, `apply`, `applications`, `invitations`, `new`, `team`,
  `admin` or `list` gets `-organization` appended, so no organization can shadow a built-in page.
- **Batch reads instead of array transactions** for queries that join three or more relations: Prisma runs those joins
  concurrently on the batch’s single connection, which the pg driver now warns about.
- **Hard navigation on sign-in/out** so the server-rendered header and caches always match the session.

## Known limitations and next milestone

- Email is delivered at least once, by one SMTP provider. There is no digest/batching yet (each event is one email),
  no bounce or complaint handling (a webhook from your provider would feed `EmailOutbox`/suppression), no unsubscribe
  header (all optional email can be switched off in account settings) and no live push for in-app notifications.
- Neutral responses hide _whether_ an account exists, but request timing for the “exists” and “does not exist” branches
  is not identical (the existing-account branch writes a row). A determined attacker with many IPs could measure it.
- Organization verification is a manual review. There is no integration with any government register, no cryptographic
  proof of institutional identity, no domain-based proof, and no re-verification schedule: an organization stays verified
  until an administrator withdraws it. Roles are fixed at three; there are no per-report assignments or delegations.
- An organization may be connected to any public report: Sidewalk does not infer responsibility from location or category,
  by design, so a representative can add their organization to a report that is not theirs (it is labelled as
  self-added, staff can remove it, and they can then never re-add it). Invitation emails are sent at most once per
  rotation and are not tracked for bounces.
- Official responses are plain text with up to six photographs on claims. There is no threading, no editing (a correction
  is a new entry), no attachments other than images, and no response-time or service-level reporting.
- Rate-limit windows are fixed (up to 2× a limit across a boundary) and the counters are emptied by a database crash; during
  a store outage each API process limits on its own. Search is `ILIKE`, geography uses plain doubles (see above).
- HEIC photographs are not accepted (many phones export JPEG when uploading from the browser).
- Place search depends on a geocoder; with it off, residents use the map pin or coordinates.
- Hosted tile and geocoder services must be replaced before production traffic (enforced for geocoding at startup).
- The editorial photographs come from Wikimedia Commons and are credited on `/credits`; swap in commissioned
  photography when available.

See also [security.md](security.md) for the security policies, retention rules and operating assumptions.
