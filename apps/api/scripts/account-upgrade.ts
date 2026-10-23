// Upgrade path for deployments that already have accounts, from before email confirmation existed.
//
//   pnpm account:upgrade preflight [--check-smtp]      BEFORE migrating: read-only; what will change, what to fix first
//   pnpm db:migrate                                    apply the migrations
//   pnpm account:upgrade verify                        AFTER migrating: confirm the system is in the expected state
//   pnpm account:upgrade confirm-email --staff --reason "..."            dry run: who would be confirmed
//   pnpm account:upgrade confirm-email --staff --reason "..." --apply    do it (audited)
//   pnpm account:upgrade confirm-email --email a@b.org --reason "..." --apply
//
// The migration does NOT mark existing addresses confirmed: nobody has ever proved control of them. Full
// procedure, rollback considerations and verification: docs/operations.md#upgrading-an-existing-deployment
import path from "node:path";
import { config } from "dotenv";
import nodemailer from "nodemailer";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnv } from "../src/config/env";
import { buildOutboxKeyring } from "../src/email/outbox-crypto";
import { keyStatus } from "../src/email/outbox-maintenance";
import { PrismaClient } from "../src/generated/prisma/client";
import { accountsAffected, confirmEmails } from "../src/ops/account-upgrade";
import {
  DEFAULT_MIGRATIONS_DIR,
  expectedMigrations,
  formatChecks,
  runOpsChecks,
  worst
} from "../src/ops/checks";

config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../../.env"),
  quiet: true
});

const [command, ...rest] = process.argv.slice(2).filter((a) => a !== "--");
const flag = (name: string) => rest.indexOf(name);
const values = (name: string) =>
  rest.flatMap((a, i) => (a === name && rest[i + 1] ? [rest[i + 1] as string] : []));

type Level = "BLOCKER" | "ACTION" | "WARNING" | "NOTE";
const findings: Array<[Level, string]> = [];
const note = (level: Level, text: string) => findings.push([level, text]);
const show = () => {
  for (const level of ["BLOCKER", "ACTION", "WARNING", "NOTE"] as const)
    for (const [l, t] of findings) if (l === level) console.log(`${l.padEnd(8)} ${t}`);
};

async function preflight(prisma: PrismaClient): Promise<void> {
  const env = loadEnv(); // throws a readable list of every configuration problem
  console.log(`Environment: ${env.NODE_ENV}; configuration is valid.`);
  const expected = expectedMigrations(DEFAULT_MIGRATIONS_DIR);
  const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  const done = new Set(applied.map((a) => a.migration_name));
  const pending = expected.filter((m) => !done.has(m));
  console.log(
    `Migrations: ${done.size} applied, ${pending.length} pending${pending.length ? ` (${pending.join(", ")})` : ""}.`
  );

  // Plain SQL, because on a pre-upgrade database the new columns do not exist yet.
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'emailVerifiedAt'`;
  if (columns.length) {
    console.log("The email-confirmation migration is already applied. Run `verify` instead.");
    return;
  }
  const roles = await prisma.$queryRaw<Array<{ role: string; n: bigint }>>`
    SELECT role::text AS role, count(*) AS n FROM "User" WHERE status = 'ACTIVE' GROUP BY role`;
  const count = (r: string) => Number(roles.find((x) => x.role === r)?.n ?? 0);
  const [{ n: sessions }] = (await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM "Session" s JOIN "User" u ON u.id = s."userId"
    WHERE s."revokedAt" IS NULL AND s."expiresAt" > now() AND u.status = 'ACTIVE'`) as [
    { n: bigint }
  ];
  console.log(`\nActive accounts that will need to confirm their email after the upgrade:`);
  console.log(
    `  residents ${count("CITIZEN")}, moderators ${count("MODERATOR")}, administrators ${count("ADMIN")}; live sessions ${Number(sessions)} (they stay signed in)`
  );

  if (count("ADMIN") === 0)
    note(
      "WARNING",
      "There is no active administrator. Create one with admin:promote (add --confirm-email if mail is not working yet)."
    );
  else
    note(
      "ACTION",
      `All ${count("ADMIN")} administrator(s) will be unconfirmed right after migrating and cannot use the admin tools. Plan how they will confirm: (a) email is configured and they use the link on first sign-in, or (b) you run \`confirm-email --staff\` straight after migrating.`
    );
  if (count("MODERATOR") > 0)
    note(
      "WARNING",
      `${count("MODERATOR")} moderator(s) cannot use moderation tools until they confirm.`
    );
  if (count("CITIZEN") > 0)
    note(
      "NOTE",
      `${count("CITIZEN")} resident(s) keep reading and signing in; they must confirm before filing, commenting or following (a banner explains it).`
    );

  const smtp = env.SMTP_HOST;
  note("NOTE", `Email will be sent through ${smtp}:${env.SMTP_PORT} as ${env.EMAIL_FROM}.`);
  if (flag("--check-smtp") >= 0) {
    try {
      await nodemailer
        .createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
          connectionTimeout: 8000
        })
        .verify();
      note("NOTE", "SMTP: connected and authenticated (no message was sent).");
    } catch (e) {
      note(
        "BLOCKER",
        `SMTP: could not connect or authenticate (${(e as Error).name}). Confirmation emails would not be delivered.`
      );
    }
  } else
    note("NOTE", "SMTP was not tested; add --check-smtp to open a connection (nothing is sent).");

  const keyring = buildOutboxKeyring(env);
  const legacy = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM "EmailOutbox" WHERE "payloadCiphertext" IS NOT NULL`.catch(
    () => null
  );
  if (legacy === null)
    note("NOTE", "The email outbox does not exist yet; nothing queued to migrate.");
  else {
    const queued = Number(legacy[0]?.n ?? 0);
    if (queued > 0)
      note(
        "WARNING",
        `${queued} queued message(s) hold content. Keep OUTBOX_LEGACY_JWT_DECRYPT=true and JWT_ACCESS_SECRET unchanged until \`outbox:keys status\` shows no legacy rows.`
      );
  }
  console.log(
    `Outbox keys: active "${keyring.activeKeyId}", configured ${keyring.keyIds.join(", ")}.`
  );
  note(
    "NOTE",
    "Take a database backup now (docs/operations.md#backup-and-restore). The new migrations only add tables and columns, but a backup is the rollback plan."
  );
  console.log("");
  show();
  process.exitCode = findings.some(([l]) => l === "BLOCKER") ? 2 : 0;
}

async function verify(prisma: PrismaClient): Promise<void> {
  const env = loadEnv();
  const keyring = buildOutboxKeyring(env);
  const checks = await runOpsChecks({ db: prisma, env, keyring, adminsMustBeConfirmed: true });
  console.log(formatChecks(checks));
  const accounts = await accountsAffected(prisma);
  console.log(
    `\nAccounts: residents ${accounts.residents.confirmed}/${accounts.residents.active} confirmed, moderators ${accounts.moderators.confirmed}/${accounts.moderators.active}, administrators ${accounts.administrators.confirmed}/${accounts.administrators.active}.`
  );
  console.log(
    `Live sessions of people who still need to confirm: ${accounts.liveSessionsOfUnconfirmed} (valid; they can read and manage their account).`
  );
  for (const s of accounts.unconfirmedStaff)
    console.log(`  unconfirmed ${s.role.toLowerCase()}: ${s.email}`);
  const status = await keyStatus(prisma, keyring);
  const unreadable = Object.values(status.byKey).reduce(
    (n, e) => n + e.keyMissing + e.failedIntegrity,
    0
  );
  console.log(
    `Queued messages holding content: ${status.total}; unreadable with this configuration: ${unreadable}.`
  );
  const level = worst(checks);
  console.log(`\nOverall: ${level.toUpperCase()}`);
  process.exitCode = level === "fail" || unreadable > 0 ? 2 : 0;
}

async function confirm(prisma: PrismaClient): Promise<void> {
  const reason = values("--reason")[0] ?? "";
  const apply = flag("--apply") >= 0;
  const result = await confirmEmails(
    prisma,
    { emails: values("--email"), staff: flag("--staff") >= 0 },
    reason,
    apply
  );
  console.log(
    `${apply ? "Confirmed" : "Would confirm"} ${apply ? result.applied : result.candidates.length} account(s):`
  );
  for (const c of result.candidates) console.log(`  ${c.role.toLowerCase().padEnd(10)} ${c.email}`);
  for (const s of result.skipped)
    console.log(`  skipped (not an active, unconfirmed account): ${s}`);
  if (!apply)
    console.log(
      "\nThis was a dry run. Add --apply to make the change. It is written to the audit log with your reason."
    );
}

async function main(): Promise<void> {
  if (command !== "preflight" && command !== "verify" && command !== "confirm-email") {
    console.error(
      'Usage: pnpm account:upgrade <preflight [--check-smtp] | verify | confirm-email (--staff | --email <a>)... --reason "..." [--apply]>'
    );
    process.exit(1);
  }
  const env = loadEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL })
  });
  try {
    if (command === "preflight") await preflight(prisma);
    else if (command === "verify") await verify(prisma);
    else await confirm(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
