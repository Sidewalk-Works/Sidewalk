# Sidewalk

A civic accountability platform for Nigerian communities (built to adapt elsewhere). Residents report public
problems such as potholes, flooding, uncollected waste and broken streetlights, follow what happens next, and keep a
public record of what was **claimed** versus what was **verified**.

- **Web:** Next.js (App Router), Tailwind CSS, MapLibre GL, React Hook Form + Zod
- **API:** NestJS modular monolith, REST under `/api/v1`, Swagger at `/api/docs`
- **Data:** PostgreSQL via Prisma (committed migrations), S3-compatible evidence storage
- **Accounts and email:** email verification, password recovery and in-app + email notifications, delivered through a
  transactional outbox and any SMTP provider (Mailpit captures everything locally)
- **Verified organizations:** public institutions can apply to be verified by Sidewalk staff, then answer reports with
  attributable, append-only official responses. An organization’s claim that a problem is fixed stays separate from
  independent verification by staff. See [Organizations](#verified-organizations-and-official-responses) below.
- **Tests:** Jest + Supertest (API), Playwright + axe (browser, accessibility)

## Prerequisites

| Tool          | Version                     | Notes                                           |
| ------------- | --------------------------- | ----------------------------------------------- |
| Node.js       | 20.19+ (22 LTS recommended) | CI uses 22; developed on 24                     |
| pnpm          | 11                          | `corepack enable` picks the pinned version      |
| Docker        | any recent                  | runs Postgres, the S3-compatible store, Mailpit |
| Google Chrome | any recent                  | for Playwright locally (CI installs Chromium)   |

## Start from a fresh checkout

```bash
pnpm setup      # creates .env with fresh secrets, installs, starts Docker services, migrates, seeds
pnpm dev        # API on :4000, web on :3000
```

Open <http://localhost:3000>. API docs: <http://localhost:4000/api/docs>. Every email the app sends in development
lands in **Mailpit** at <http://localhost:8025>; nothing is ever delivered to a real inbox.

`pnpm setup` is just these steps, which you can run individually:

```bash
pnpm env:init                 # copy .env.example to .env with a generated JWT secret (never overwrites)
pnpm install
pnpm infra:up                 # docker compose: postgres on 127.0.0.1:5442, S3-compatible store on :8333,
                              # Mailpit (SMTP 127.0.0.1:1025, inbox UI :8025)
pnpm --filter @sidewalk/contracts build
pnpm db:migrate               # apply committed migrations
pnpm db:seed                  # synthetic development data (refuses to run in production)
```

> Ports: Postgres uses **5442** (not 5432) so it never collides with a Postgres you already run. Mailpit uses
> **1025** (SMTP) and **8025** (inbox); override with `MAILPIT_SMTP_PORT` / `MAILPIT_UI_PORT` if they are taken.

### Accounts, email and notifications in development

1. Register at <http://localhost:3000/register>. You are **not** signed in: a confirmation link is emailed.
2. Open <http://localhost:8025>, open the message, and use the button or link. The link opens a page that waits for
   your click (so a mail scanner that merely fetches the link cannot use it up), then confirms the address.
3. Sign in. Until the address is confirmed an account can read everything and manage its own account, but cannot
   file reports, comment, flag, follow or upload evidence.
4. “Forgot your password?” on the sign-in page sends a reset link to Mailpit the same way. After a reset every device
   is signed out and you sign in again with the new password.
5. Report owners and people who follow a report get an in-app notification (bell in the header, `/notifications`) and,
   if their email-notification settings allow, an email. Staff decisions, status changes and comments produce them.

Email is delivered by a **worker** that drains a database outbox. `pnpm dev` runs it inside the API process
(`OUTBOX_WORKER_ENABLED=true`). To run it separately, set `OUTBOX_WORKER_ENABLED=false` for the API and start
`pnpm worker` in another terminal; it can run alongside the API safely and any number of workers may run at once.
Administrators can see delivery health, retry failed messages and read the failure reasons at `/admin/email`.

### Development accounts

`pnpm db:seed` creates clearly synthetic accounts, all `@sidewalk.test` / `@seed.sidewalk.test` addresses:

| Role          | Email                                                           |
| ------------- | --------------------------------------------------------------- |
| Administrator | `admin@sidewalk.test`                                           |
| Moderator     | `moderator@sidewalk.test`                                       |
| Residents     | `resident1@seed.sidewalk.test` … `resident3@seed.sidewalk.test` |
| Org admin     | `org-admin@seed.sidewalk.test` (Sample State Roads Agency)      |
| Org rep       | `org-rep@seed.sidewalk.test` (same organization)                |

The seed also creates two **invented** organizations, labelled “(synthetic)”: a verified “Sample State Roads Agency”
with one acknowledgement on a seeded report, and a “Sample Ward Drainage Office” whose application is waiting for review
(resident 1 is its applicant), so the staff queue is not empty. Neither is a real institution and neither verification
is real; the seed never runs in production.

These accounts are created with their email already confirmed. Accounts created through the registration form are
not: they must confirm through Mailpit. Their password is `SEED_PASSWORD` from your `.env`. If that is blank, the seed generates a random one and prints it
**once**. No default password exists in the code. Every seeded report ends with “[Synthetic seed data … Not a real
report.]” and carries no invented photographs.

## Commands

| Command                                                 | What it does                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                                              | API (watch mode, with the email worker) and web (Turbopack)    |
| `pnpm worker`                                           | Standalone email-delivery worker (see above)                   |
| `pnpm build`                                            | Production build of contracts, API and web                     |
| `pnpm start`                                            | Run the production builds                                      |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check`    | Static checks                                                  |
| `pnpm test`                                             | Contracts + API unit/integration tests (needs `pnpm infra:up`) |
| `pnpm test:e2e`                                         | Playwright against a real production build, API and database   |
| `pnpm db:migrate:dev`                                   | Create a new migration after editing `schema.prisma`           |
| `pnpm db:seed` / `pnpm db:reset`                        | Seed / rebuild the development database                        |
| `pnpm infra:up` / `pnpm infra:down`                     | Start / stop Docker services                                   |
| `pnpm ops:check [--storage] [--strict] [--json]`        | Deployment health: exit 0 healthy, 1 failed (for cron)         |
| `pnpm outbox:keys generate\|status\|rewrap`             | Create, inspect and rotate the email-encryption keys           |
| `pnpm account:upgrade preflight\|verify\|confirm-email` | Upgrade a deployment that already has accounts                 |
| `pnpm ops:restore-check [database]`                     | Real backup, restore into a scratch DB, compare every table    |
| `pnpm ops:drill` / `pnpm ops:prodlike`                  | Kill-the-worker and production-mode rehearsals (disposable DB) |

Operator procedures for all of these are in [docs/operations.md](docs/operations.md). Evidence reconciliation and the
first administrator use `pnpm --filter @sidewalk/api storage:reconcile -- --check` and `… admin:promote`.

## Testing

```bash
pnpm infra:up
pnpm test                              # API: runs migrations on sidewalk_test, then Jest + Supertest
pnpm test:e2e                          # builds and boots the full stack against sidewalk_e2e, then Playwright
SCREENSHOTS=1 pnpm test:e2e -- screenshots.spec.ts   # refresh docs/visual-review
SCREENSHOTS=1 pnpm test:e2e -- organizations-screenshots.spec.ts --grep "organizations desktop"   # then run again with "organizations mobile"
```

- API tests use the real application, real HTTP and a real Postgres database (`sidewalk_test`). Nothing is mocked.
- E2E uses its own ports (API 4020, web 3020) and database (`sidewalk_e2e`), so it can run beside `pnpm dev`.
- `.env.test` and `.env.e2e` contain only non-secret values for throwaway databases and are committed on purpose.
- The API suite also rehearses the **upgrade of an existing deployment** (a database built at the old schema, real
  migration, real sessions and operator commands), the outbox under three database time zones, the encryption-key
  lifecycle, rate limiting across two application instances (including a locked limiter table), and an inventory that
  fails if any route becomes public, unthrottled or loses its role. Process-level rehearsals need Docker and a fresh
  build: `pnpm ops:drill` (worker killed mid-send, mail outage, exactly-once recovery) and `pnpm ops:prodlike` (two API
  processes plus a worker in `NODE_ENV=production`, TLS mail, shared limits).

## Repository layout

```
apps/
  api/            NestJS API
    prisma/       schema.prisma, migrations/, seed.ts
    scripts/      truncate-test-db.ts, promote-admin.ts
    src/          auth (sessions, tokens, account lifecycle), users, reports, evidence, comments, moderation,
                  admin, categories, locations, activity, audit, notifications, email (provider, outbox,
                  templates, worker), health, common (guards, filters, validation), config
    test/         Jest + Supertest suites
  web/            Next.js app (src/app routes, src/components, src/lib), Playwright tests in tests/
packages/
  contracts/      Shared lifecycle rules (status transitions), limits and API types
docs/             architecture.md, security.md, operations.md, visual-review/
scripts/ops/      backup-restore-check.sh
docker-compose.yml, .env.example, .env.test, .env.e2e, .github/workflows/ci.yml
```

Read [docs/architecture.md](docs/architecture.md) for the trust model, authentication design, data model and
decisions.

## Configuration

Everything is configured through one root `.env` (see [.env.example](.env.example), every variable is documented).
The API validates it at startup and refuses to boot with a readable list of problems.

Required: `DATABASE_URL`, `JWT_ACCESS_SECRET` (32+ characters). In production also `OUTBOX_ENCRYPTION_KEYS`,
`INTERNAL_PROXY_SECRET`, a real SMTP host, an https `WEB_ORIGIN` and non-development database and storage credentials; the
API refuses to start otherwise, listing every problem. Everything else has a development default.

Email encryption and rate limiting: `OUTBOX_ENCRYPTION_KEYS` (`id:base64key,…`; the first key encrypts, the rest only
decrypt; independent of the JWT secret; `pnpm env:init` creates one for a new `.env`), `OUTBOX_LEGACY_JWT_DECRYPT` (read
rows queued before the keyring existed; turn off after `pnpm outbox:keys rewrap`), `RATE_LIMIT_ENABLED`,
`RATE_LIMIT_MULTIPLIER` (tests only) and `RATE_LIMIT_STORE_TIMEOUT_MS` (default 750; how long a rate-limit check may wait
for PostgreSQL before that request is counted in memory instead; 50–10000).

Email (verification, recovery, notifications): `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`/`SMTP_PASSWORD`,
`EMAIL_FROM`, `OUTBOX_WORKER_ENABLED`, `OUTBOX_POLL_MS`. The development defaults point at Mailpit. Links inside emails
are built from `WEB_ORIGIN`, never from a request header. In production the API refuses to start without a real SMTP
host, an `https://` `WEB_ORIGIN` and an `EMAIL_FROM` on a real domain.

Optional integrations:

- **Evidence storage:** `STORAGE_DRIVER=s3` (AWS S3, Cloudflare R2, Backblaze B2, MinIO, SeaweedFS…) or `local`.
- **Place search:** `GEOCODER_PROVIDER=nominatim` (OpenStreetMap) or `none`. With `none`, residents use the map pin or
  type coordinates, and nothing else breaks.
- **Map tiles:** `NEXT_PUBLIC_MAP_TILE_URL`. The default is OpenStreetMap’s public tile server, fine for development only.

## Production notes

- Serve the web app over HTTPS behind a reverse proxy that sets `X-Forwarded-For`, and keep the **API on a private
  interface** (`API_HOST`), reachable only from the web server. Set `NODE_ENV=production`. That makes cookies
  `Secure`, hides Swagger, and **rejects** placeholder secrets, insecure cookies, disabled or weakened rate limiting,
  a missing `INTERNAL_PROXY_SECRET` and the public Nominatim server at startup.
- Set `WEB_ORIGIN`/`NEXT_PUBLIC_SITE_URL` to the public URL and `WEB_TRUSTED_PROXY_HOPS` to the number of proxies in
  front of the web app. The web app passes each visitor's address to the API, authenticated with
  `INTERNAL_PROXY_SECRET` (the same value on both), which is what makes per-visitor rate limits work. See
  [docs/security.md](docs/security.md#deployment-topology-the-guarantees-assume).
- **Create the first administrator** without any default account: register normally, then, with database access, run
  `pnpm --filter @sidewalk/api admin:promote -- --email you@example.org`. It is written to the audit log.
  Administrators need a confirmed email address to use the admin tools; if mail is not set up yet, add
  `--confirm-email` to confirm it from the command line (also audited).
- Provision the S3 bucket and a least-privilege key yourself. Run your own tile server or a commercial provider, and
  your own Nominatim or a commercial geocoder, rather than the public OpenStreetMap services.
- **Email:** point `SMTP_*` at a transactional provider and set `EMAIL_FROM` to an address on a domain you control.
  Publish **SPF, DKIM and DMARC** for that domain before launch or verification and reset links will land in spam;
  the exact records and a rollout plan are in [docs/security.md](docs/security.md#email-authentication-spf-dkim-dmarc).
  Run exactly one delivery path per deployment style: the embedded worker for a single API instance, or
  `OUTBOX_WORKER_ENABLED=false` on the API plus one or more `pnpm worker` processes when you scale out.
- **Upgrading an existing deployment:** the migrations only add tables and columns, and existing addresses are **not**
  marked confirmed (nobody has proved control of them). Existing sessions stay valid; residents can read and sign in but
  must confirm before filing, commenting or following, and unconfirmed moderators and administrators cannot use staff
  tools. Follow the procedure in [docs/operations.md](docs/operations.md#upgrading-an-existing-deployment): take a
  backup, `pnpm account:upgrade preflight --check-smtp`, `pnpm db:migrate`, `pnpm account:upgrade verify`, and then staff
  confirm by emailed link or an operator runs `pnpm account:upgrade confirm-email --staff --reason "…"` (a dry run until
  `--apply`; every change is audited with the reason). Nothing marks an address confirmed automatically.
- **Rate limiting** is counted in PostgreSQL and is exact across API instances; no Redis is required. If the database
  is slow or unavailable the limiter falls back to per-process counters (limits still apply, per instance) and says so
  on `/admin/email` and in `pnpm ops:check`. The counters are emptied by a database crash and windows are fixed (a burst
  of up to twice a limit across a boundary is possible): see [docs/security.md](docs/security.md#rate-limiting).
- **Monitoring and recovery:** `GET /api/v1/health` is liveness, `GET /api/v1/health/ready` checks the database and
  storage, `pnpm ops:check` (cron or a systemd timer) covers migrations, the email queue, held messages, the limiter and
  administrator access, and `/admin/email` shows the same to administrators with an audited retry. Run
  `pnpm ops:restore-check` against a copy of real data on a schedule. Backups, key rotation, incident steps and what is
  automated versus yours: [docs/operations.md](docs/operations.md).

## Verified organizations and official responses

Where to look: `/organizations` (directory and profiles), `/organizations/apply`, `/organizations/mine`,
`/organizations/<slug>/team`, `/admin/organizations` (staff). The report page gains “Organizations connected” and “What
organizations have said”, and a response composer for people who act for an organization.

How it works, in one paragraph: anyone with a confirmed address can apply for an organization with references staff can
check and private document photographs; a moderator reads and asks questions; **only an administrator’s approval makes it
verified**. A verified organization’s ADMIN or REPRESENTATIVE can then connect it to a report and publish acknowledgements,
updates, delays, “outside our remit”, corrections, withdrawals and resolution claims, each under the organization’s name
and theirs. A claim needs the organization’s own photograph and is shown as “claimed, not verified” until independent
staff (not members of that organization) verify it. Suspension, withdrawal and member removal apply on the next request.

Staff-created records and invitations carry no trust: an invitation is single-use, bound to one confirmed address and
carries no authority. What verified means, the permission matrix, how invitations and claims work, and the limits are in
[docs/architecture.md](docs/architecture.md#verified-organizations-and-official-responses) and
[docs/security.md](docs/security.md#verified-organizations-identity-authority-and-abuse-verified-by-tests); the manual
review process and incident steps are in [docs/operations.md](docs/operations.md#verifying-an-organization).

**Metric definitions** (profile page): reports connected (not removed); reports with a published acknowledgement; reports
with a published resolution claim (each once); reports whose current resolution this organization last claimed and staff
verified. All public reports, all time. No rates, averages, rankings or response times are shown or computed, because none
could be stated honestly without a denominator and a window.

**Limits you should know:** verification is a human review against sources, with no government-register integration;
there is no re-verification schedule; an organization can connect itself to any public report (labelled, removable by
staff); notifications and emails already sent are not recalled when a statement is later hidden.

## Security summary

Full details, policies and verification status: [docs/security.md](docs/security.md).

Argon2id password hashing · 15-minute access cookie tied to a live login (logout, password change and device
revocation cut access immediately) + rotating refresh token with reuse detection · HttpOnly,
SameSite=Lax cookies (never in `localStorage`) · double-submit CSRF token plus origin checks · per-route rate limits and
a sign-in brake that slows guessing without letting anyone lock out another person (shared across instances through
PostgreSQL) · strict DTO validation (unknown fields rejected) · uploads re-encoded server-side, validated by
content, metadata (EXIF/GPS) stripped, served only through visibility-checked endpoints · roles enforced in guards **and**
service methods · append-only audit log · secrets and tokens redacted from logs · single-use hashed email links carried
in the URL fragment, with every session ended after a password reset (no automatic sign-in) · email sent only after
the database commit, through an outbox encrypted with a versioned, rotatable keyring and sent with bounded retries,
claim-checked workers and operator-visible dead letters.

## Known limitations

See the end of [docs/architecture.md](docs/architecture.md#known-limitations-and-next-milestone).

## Licence of included media

Editorial photographs are openly licensed images from Wikimedia Commons, credited on the site at `/credits`.
