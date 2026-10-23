# Sidewalk

A civic accountability platform for Nigerian communities (built to adapt elsewhere). Residents report public
problems such as potholes, flooding, uncollected waste and broken streetlights, follow what happens next, and keep a
public record of what was **claimed** versus what was **verified**.

- **Web:** Next.js (App Router), Tailwind CSS, MapLibre GL, React Hook Form + Zod
- **API:** NestJS modular monolith, REST under `/api/v1`, Swagger at `/api/docs`
- **Data:** PostgreSQL via Prisma (committed migrations), S3-compatible evidence storage
- **Accounts and email:** email verification, password recovery and in-app + email notifications, delivered through a
  transactional outbox and any SMTP provider (Mailpit captures everything locally)
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

These accounts are created with their email already confirmed. Accounts created through the registration form are
not: they must confirm through Mailpit. Their password is `SEED_PASSWORD` from your `.env`. If that is blank, the seed generates a random one and prints it
**once**. No default password exists in the code. Every seeded report ends with “[Synthetic seed data … Not a real
report.]” and carries no invented photographs.

## Commands

| Command                                              | What it does                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                                           | API (watch mode, with the email worker) and web (Turbopack)    |
| `pnpm worker`                                        | Standalone email-delivery worker (see above)                   |
| `pnpm build`                                         | Production build of contracts, API and web                     |
| `pnpm start`                                         | Run the production builds                                      |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | Static checks                                                  |
| `pnpm test`                                          | Contracts + API unit/integration tests (needs `pnpm infra:up`) |
| `pnpm test:e2e`                                      | Playwright against a real production build, API and database   |
| `pnpm db:migrate:dev`                                | Create a new migration after editing `schema.prisma`           |
| `pnpm db:seed` / `pnpm db:reset`                     | Seed / rebuild the development database                        |
| `pnpm infra:up` / `pnpm infra:down`                  | Start / stop Docker services                                   |

## Testing

```bash
pnpm infra:up
pnpm test                              # API: runs migrations on sidewalk_test, then Jest + Supertest
pnpm test:e2e                          # builds and boots the full stack against sidewalk_e2e, then Playwright
SCREENSHOTS=1 pnpm test:e2e -- screenshots.spec.ts   # refresh docs/visual-review
```

- API tests use the real application, real HTTP and a real Postgres database (`sidewalk_test`). Nothing is mocked.
- E2E uses its own ports (API 4020, web 3020) and database (`sidewalk_e2e`), so it can run beside `pnpm dev`.
- `.env.test` and `.env.e2e` contain only non-secret values for throwaway databases and are committed on purpose.

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
docs/             architecture.md, visual-review/
docker-compose.yml, .env.example, .env.test, .env.e2e, .github/workflows/ci.yml
```

Read [docs/architecture.md](docs/architecture.md) for the trust model, authentication design, data model and
decisions.

## Configuration

Everything is configured through one root `.env` (see [.env.example](.env.example), every variable is documented).
The API validates it at startup and refuses to boot with a readable list of problems.

Required: `DATABASE_URL`, `JWT_ACCESS_SECRET` (32+ characters). Everything else has a development default.

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
- **Upgrading an existing deployment:** apply the new migration (`pnpm db:migrate` / `prisma migrate deploy`). Accounts
  that existed before this milestone have no confirmed email, so their owners can still sign in and read but must
  confirm before they can file, comment or follow; they can request the link from the banner or `/verify-email`.
  To grandfather accounts you have already vetted, set `"emailVerifiedAt"` for them in SQL deliberately; nothing does
  it automatically.
- Rate limiting is in memory, which is correct for one API instance. Use a shared store (for example Redis) if you scale
  out. `GET /api/v1/health` is a liveness probe, `GET /api/v1/health/ready` checks the database and storage.

## Security summary

Full details, policies and verification status: [docs/security.md](docs/security.md).

Argon2id password hashing · 15-minute access cookie tied to a live login (logout, password change and device
revocation cut access immediately) + rotating refresh token with reuse detection · HttpOnly,
SameSite=Lax cookies (never in `localStorage`) · double-submit CSRF token plus origin checks · per-route rate limits and
a per-account login brake · strict DTO validation (unknown fields rejected) · uploads re-encoded server-side, validated by
content, metadata (EXIF/GPS) stripped, served only through visibility-checked endpoints · roles enforced in guards **and**
service methods · append-only audit log · secrets and tokens redacted from logs · single-use hashed email links carried
in the URL fragment, with every session ended after a password reset (no automatic sign-in) · email sent only after
the database commit, through an encrypted outbox with bounded retries.

## Known limitations

See the end of [docs/architecture.md](docs/architecture.md#known-limitations-and-next-milestone).

## Licence of included media

Editorial photographs are openly licensed images from Wikimedia Commons, credited on the site at `/credits`.
