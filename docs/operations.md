# Operations runbook

Everything here refers to tools in this repository that have been run. Commands are from the repository root. Design and
guarantees live in [architecture.md](architecture.md) and [security.md](security.md); this file is what to do.

## What is automated, and what is yours

| Automated by the system                                                                                                          | Needs an operator or an outside provider                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Email queue, retries with back-off, held messages, recovery of messages from a dead worker, exactly-once-per-claim sending       | Running the worker (embedded, or `pnpm worker` under a supervisor such as systemd) and restarting it if it stops     |
| Rate-limit counting, expiry and cleanup, fallback to per-process limits when the database is slow                                | Watching `pnpm ops:check` (cron or a timer) and acting on a failure                                                  |
| Refusing unsafe production configuration at startup                                                                              | Choosing and storing secrets, **including the outbox keys, in a secret manager apart from database backups**         |
| Audit records for admin actions, role changes, retries and operator confirmations                                                | Scheduling backups, keeping them offsite and encrypted, and restoring from them                                      |
| Detecting, in `ops:check` and `/admin/email`, a stalled worker, held messages, dead letters, a degraded limiter, no usable admin | SPF, DKIM and DMARC for the sender domain, and a real SMTP provider account                                          |
| Single-use links, session invalidation, neutral responses                                                                        | Evidence-object backup (bucket versioning or replication) and acting on `storage:reconcile` findings                 |
| Retention clean-up (sent mail, tokens, sessions, rate-limit rows)                                                                | Deciding who may be an administrator; confirming existing staff when upgrading; a bounce/complaint process           |
| Immediate effect of suspension, revocation and member removal; append-only decision log; one-verified-per-name guard             | **Verifying organizations**: reading applications, checking independent sources, deciding. Nothing here automates it |

## Monitoring

`pnpm ops:check [--storage] [--strict] [--json]` is the one health command. Exit 0 healthy, 1 failed (`--strict`: a warning
fails too). It checks: the database and its time zone (warns if not UTC), that every committed migration is applied, the
email queue (a worker that stopped, messages held for a missing key, dead and retrying messages), the rate-limit store, and
that at least one administrator can use the admin tools. It reads counts only.

- `GET /api/v1/health` is liveness (no dependencies, exempt from limits). `GET /api/v1/health/ready` checks the database and
  storage and answers 503 when either is down; point load balancers at it.
- `/admin/email` shows the same health to administrators: queue counts, banners for a stalled worker, held messages and a
  degraded rate-limit store, which key encrypts and which keys queued messages still need, and one row (phones: one card) per
  message with a masked address and a plain-words detail. **Retry** appears for failed and dead messages, names the message
  it affects, and is audited.
- Logs are structured JSON with a request id (`x-request-id`, created by the web gateway and echoed by the API). They carry
  no query strings, credentials, addresses, tokens, ciphertext or message content. Alert on repeated `api_unreachable`
  lines from the web server and on `Rate-limit store unavailable` from the API.

## Dead letters and retry

A message that cannot be sent ends `DEAD` and keeps its content for 90 days. Administrators see it at `/admin/email`
(masked address, failure code, attempts) and press **Retry**, which gives it a fresh set of attempts; moderators and
residents cannot, and the request needs the CSRF token. Each retry is recorded in the audit log in the same transaction,
with the message's earlier state and failure code (never the address or content), at `/admin/audit`. Only failed or dead
messages that still hold their content can be retried. Causes and responses: a rejected recipient is permanent (leave it);
a provider outage clears by itself or after Retry; **held** messages mean a key is missing (restore it).

## Outbox encryption keys

`OUTBOX_ENCRYPTION_KEYS` is `id:base64key,…`: the first key encrypts, the rest only decrypt. It is independent of
`JWT_ACCESS_SECRET` and required in production.

1. **Create:** `pnpm outbox:keys generate` prints a new `id:key` entry (keep it out of shell history and logs).
2. **Rotate:** prepend it to `OUTBOX_ENCRYPTION_KEYS`, keeping every earlier entry after it. Restart the workers, then the
   APIs. A process still on the old list holds, but does not lose, anything written under the new key.
3. **Check:** `pnpm outbox:keys status` lists, per key id, how many queued messages need it and whether this configuration
   can read them (it exits 2 if any cannot).
4. **Re-encrypt:** `pnpm outbox:keys rewrap --dry-run`, then `pnpm outbox:keys rewrap`. Only rows that still hold the
   ciphertext that was read are rewritten; unreadable rows are left alone and counted.
5. **Retire:** remove an old key only when `status` shows no rows under it. Archive its material in the secret manager for
   as long as any backup that could hold messages encrypted with it exists.
6. **Recover:** a missing key holds messages (kept, nothing consumed, rechecked every 10 minutes; `DEAD` with content kept after
   a week). Restore the key and they send; if they went dead, Retry them. Wrong material under a known id marks messages dead
   with content kept; fix the configuration, then Retry.
7. **Back up** the keys in a secret manager, **separately from database backups**.

**Messages queued before keys were independent** (encrypted with a key derived from the JWT secret) are readable while
`OUTBOX_LEGACY_JWT_DECRYPT=true` and the JWT secret is unchanged. Run `rewrap`, confirm `status` shows no `legacy` rows, then
set the flag to `false`. If the JWT secret was already changed while such rows were queued they **cannot be recovered**; they
are held and then marked dead, and the people affected request a new link. There is no key history to restore.

## Rate limiting in operation

`RATE_LIMIT_STORE_TIMEOUT_MS` (default 750, 50–10000) is how long a check may wait for PostgreSQL. Past it, or on an error,
that request is counted in the process's own memory and still limited; after three failures the store is skipped for five
seconds. `ops:check` and `/admin/email` report a degraded store, and it recovers by itself once the database does. The
counters live in an unlogged table that PostgreSQL empties after a crash, and windows are fixed (a burst up to twice a
limit across a boundary is possible). Behind a proxy keep `INTERNAL_PROXY_SECRET` identical on the web and API servers and
`WEB_TRUSTED_PROXY_HOPS` equal to the proxies in front of the web server; without them every visitor shares one bucket.
Details: [security.md](security.md#rate-limiting).

## Upgrading an existing deployment

The migrations add tables and columns only. Existing addresses are **not** marked confirmed, because nobody has proved
control of them. Existing sessions and refresh tokens keep working; people can read, sign in and manage their account, but
residents cannot file, comment or follow until they confirm, and unconfirmed moderators and administrators cannot use staff or
admin tools. The upgrade was rehearsed on a database built at the old schema, with representative residents, moderators, an
administrator and a suspended account.

1. **Prepare.** Set up SMTP (and DNS records, see security.md) and `OUTBOX_ENCRYPTION_KEYS`. Keep `OUTBOX_LEGACY_JWT_DECRYPT=true`
   and do not change `JWT_ACCESS_SECRET`. Take a backup (below).
2. **Preflight:** `pnpm account:upgrade preflight --check-smtp`. Read-only, works on the old schema. It validates the production
   configuration, lists pending migrations, counts affected residents, moderators and administrators and live sessions, tests
   the SMTP login without sending anything, and exits 2 if SMTP fails.
3. **Migrate:** `pnpm db:migrate`, then restart the API and the worker.
4. **Verify:** `pnpm account:upgrade verify`. It runs the health checks with the strict rule that an administrator must be
   confirmed (exit 2 otherwise) and lists unconfirmed staff and any unreadable queued message.
5. **Confirm staff.** Either they sign in and use the banner or `/verify-email` (needs working email), or, if you know them out of
   band: `pnpm account:upgrade confirm-email --staff --reason "<why you can vouch for them>"` is a **dry run** listing exactly who
   would be confirmed (active moderators and administrators only; never residents, suspended or deleted accounts); add `--apply`
   to do it. `--email <address>` (repeatable) names individuals, including residents. A reason of at least 12 characters is
   required, each change writes an audit row with it, and an address the owner confirms meanwhile is never overwritten.
   `pnpm --filter @sidewalk/api admin:promote -- --email <address> [--confirm-email]` creates the first administrator the same way.
6. **Verify again** until it exits 0, then `pnpm outbox:keys status`.

**Rollback.** The reliable rollback is restoring the pre-upgrade backup. Do not drop the new tables by hand. Before running older
application code against a database that has queued new-format messages, stop every worker: older code cannot read the new
envelope and would mark those messages dead. Operator confirmations and the audit trail are not undone by restoring code.

## Verifying an organization

Verification is a human decision and the only thing standing between a convincing impersonator and an official-looking
badge. Moderators read, ask and take notes; **only an administrator approves**. Use `/admin/organizations`.

**What to check.** For each application, confirm three things from sources you reach yourself, not from a link, number or
address the applicant supplied:

1. **The institution exists as described**: its enabling act, gazette notice, charter, licence, or an entry in a published
   government or regulator listing. The application shows reference hints suited to the kind of institution.
2. **The applicant may speak for it**: the institution’s own official website or directory names them or their office, or
   you reach the institution through contact details you found independently and it confirms.
3. **It is not a lookalike**: read the “other organizations with a similar name” panel, the jurisdiction and level, and
   search for a parent or a differently named predecessor. Two bodies with one name are not one body.

A confirmed email address proves control of a mailbox, not authority over an institution. A work-domain address helps but
proves nothing alone. A private document photograph supports the case; it is not proof by itself.

**Process.** Start review (assigns you) → ask questions (the applicant is emailed and edits and re-sends) → approve or
reject with a reason of at least a sentence. The reason is recorded permanently and shown to the applicant; keep private
observations in the reviewer notes, which only staff see. Approval lists the organization, makes the applicant its
administrator (untick if you want nobody appointed yet) and notifies them. Rejection is final for that application; the
person may apply again.

**Conflicts.** You cannot decide an application you made, or about an organization you belong to; the page says so and the
server refuses. If a colleague belongs to the organization, ask another administrator.

**Afterwards.** Suspend (reversible, immediate, members told the fact and not the reason) when an account is in doubt
and you are investigating; withdraw verification when you have concluded it should not hold. Both need a reason, are
recorded in the verification history and the audit log, and apply to the very next request. What an organization said
while verified stays on the record, marked as said then. Review “Connections to review” for organizations that said a
report is outside their remit and for suggestions nobody answered: who is responsible is a judgement for a person.

**Staff-created records.** An administrator can create an unverified record and invite its representative. It carries no
trust until an application is approved. There is no seeded or imported list of agencies, and the development seed’s
organizations are invented, labelled “(synthetic)”, and never created in production (the seed refuses
`NODE_ENV=production`).

## Upgrading to verified organizations

Migration `20261024120000_verified_organizations` is additive: new enums, tables, columns (nullable) and guards. Nothing
is backfilled, no existing row changes meaning, and no existing user gains any right. Rehearsed on a database built at the
previous schema with representative data (`upgrade.spec`: migrations applied, existing reports, evidence, flags, comments,
staff and a queued message intact, new tables empty, append-only triggers present). Steps: back up, `pnpm db:migrate`,
restart the API and worker, `pnpm account:upgrade verify`, `pnpm ops:check`. Roll back by restoring the backup; do not drop the new
tables by hand. Evidence storage now also holds `org-documents/`: include that prefix in object-store backup or
versioning, and `pnpm --filter @sidewalk/api storage:reconcile -- --check` covers it. No new service, queue, cache, key or
environment variable is required. Organization invitation emails use the existing outbox and keyring.

## Backup and restore

```bash
pg_dump --format=custom --compress=6 --no-owner --no-acl "$DATABASE" > sidewalk.dump
pg_restore --no-owner --no-acl --exit-on-error -d "$SCRATCH_DATABASE" sidewalk.dump
```

`pnpm ops:restore-check [database]` (`scripts/ops/backup-restore-check.sh`, using the Postgres container from
`docker-compose.yml`; `APP_ENV_FILE=<.env file>` adds the application checks) takes a real `pg_dump`, restores it into
`<database>_restore_check` (a name it will not use for anything else; the source is only read) and then:

- compares **every table** by row count and a content hash (it refuses to pass if it compared fewer tables than exist; the
  disposable rate-limit table is excluded);
- compares indexes, constraints, triggers, functions and enums, and shows the append-only audit trigger still rejects an
  update in the copy;
- with `APP_ENV_FILE`, runs `prisma migrate status` and `ops:check` against the restored copy;
- prints `RESTORE VERIFIED` only if all of that holds, and drops the scratch database.

It proves that this dump restores completely and identically, that the schema and its integrity guards survive, and that the
application accepts the copy. It does **not** prove: evidence objects, the outbox keys (they are not in the database), that
backups are scheduled, offsite or encrypted, point-in-time recovery, restore time at production size, or compatibility with a
different PostgreSQL version. Run it against a copy of production data regularly; it is also a CI step on the end-to-end
database. Evidence objects need their own backup (bucket versioning or replication);
`pnpm --filter @sidewalk/api storage:reconcile -- --check` exits 1 if a report's file is missing or an object is orphaned.

## Rehearsals

- `pnpm ops:drill`: against a scratch database and real worker processes, a mail outage (messages fail, none die), a worker
  killed with SIGKILL mid-send (its messages stay claimed), recovery by a new worker (all delivered exactly once), and `SIGTERM`
  while a send is in flight (the worker finishes it and records the outcome). The only simulated element is the passage of the
  five-minute claim window.
- `pnpm ops:prodlike`: two API processes and a worker in `NODE_ENV=production` against a scratch database and a private mail
  server with a real certificate: refused unsafe configuration, verified-TLS delivery, cookie flags, headers, limits counted
  across both processes, the brake shared between them, no personal data or secrets in any log line, `ops:check`.

Both create and remove their own databases, roles and containers.

## Responding to a suspected impersonation

1. Suspend the organization (`/admin/organizations/<id>` → Suspend, with a reason). It stops all responding at once and keeps
   the profile and history visible, marked suspended. 2. Read its verification history, application, documents and members;
   the audit log shows who invited whom. 3. If the verification was wrong, withdraw it; remove members you do not trust
   (`/organizations/<slug>/team` as an administrator). 4. Hide any statement that misleads (moderation queue → official
   responses; reasons are recorded). Statements are never deleted, so the record of what was said stays. 5. Tell the real
   institution through contact details you found independently. 6. If a staff account was involved, sign it out (suspend
   the user) and review the audit log.

## Incident checklist

1. `pnpm ops:check` and `/admin/email`. 2. Mail not flowing: is a worker running, is SMTP reachable and credentialed, are
   messages held for a key, did a retry window just pass? 3. Suspected leak: rotate the affected secret. Rotating the JWT secret
   signs everyone out and resets rate-limit counters; do it after `rewrap` if legacy rows are queued. Rotate outbox keys as above.
2. Abuse: limits and the brake act automatically; look at the audit log and moderation history before changing anything.
3. Bad deploy: stop workers, restore the pre-upgrade backup, redeploy the previous build. 6. Record what happened; the audit log
   holds admin actions, retries and operator confirmations.

## Deployment prerequisites

- Set `NEXT_PUBLIC_SITE_URL` (https) **when building** the web app: HSTS is decided at build time.
- Run PostgreSQL with its session time zone set to UTC (`ops:check` warns otherwise; the outbox is safe regardless).
- Keep the API on a private interface; the web server forwards to it with `INTERNAL_PROXY_SECRET`.
- Provide SPF, DKIM and DMARC for the sender domain ([security.md](security.md#email-authentication-spf-dkim-dmarc)).
- There are no container images or service unit files in this repository: run `pnpm build`, then the API, the web app and
  (optionally) `pnpm worker` under your own supervisor.
