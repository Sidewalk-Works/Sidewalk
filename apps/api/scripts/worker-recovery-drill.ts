// Rehearses what happens to queued email when the worker dies, the mail server is down, and both recover. It uses
// real processes (the built `dist/worker.js`), a real PostgreSQL scratch database and the local Mailpit inbox.
//
//   pnpm --filter @sidewalk/api build && pnpm ops:drill
//
// What it proves, in order:
//   1. a mail outage leaves messages FAILED with a retry scheduled, never lost and never dead;
//   2. a worker killed with SIGKILL while a message is in flight leaves it claimed (SENDING), not lost;
//   3. a new worker recovers that message and every other, and each is delivered EXACTLY ONCE;
//   4. an idle worker stops promptly on SIGTERM, and one told to stop mid-send waits for that send to end and
//      records the outcome, so nothing is left claimed (unlike SIGKILL, in 2).
// The only simulated element is time: "five minutes later" is created by moving the dead worker's claim back, since
// waiting five real minutes would prove nothing extra. Everything runs in a scratch database that is dropped.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { parse } from "dotenv";
import { Client as Pg } from "pg";
import { buildOutboxKeyring } from "../src/email/outbox-crypto";
import { loadEnv } from "../src/config/env";

const API_DIR = path.resolve(__dirname, "..");
const ENV_FILE = process.env.DRILL_ENV_FILE ?? path.resolve(API_DIR, "../../.env.e2e");
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const base = parse(readFileSync(ENV_FILE));
const baseUrl = String(base.DATABASE_URL);
const swapDb = (url: string, name: string) => url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
const name = `sidewalk_drill_${randomBytes(4).toString("hex")}`;
const scratchUrl = swapDb(baseUrl, name);
const pgOf = (url: string) => url.replace(/\?schema=.*/, "");

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ""): void {
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}
async function until<T>(
  what: string,
  fn: () => Promise<T | false | undefined>,
  ms = 20_000
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}`);
    await sleep(150);
  }
}

/** A mail server that accepts connections and never answers: a message sent to it stays in flight. */
function tarpit(): Promise<{ port: number; close(): void }> {
  return new Promise((resolve) => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((s) => {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: (server.address() as net.AddressInfo).port,
        close: () => {
          for (const s of sockets) s.destroy();
          server.close();
        }
      })
    );
  });
}
/** A port nothing listens on: connections are refused at once (a mail server that is down). */
function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

function startWorker(smtpPort: number, label: string): ChildProcess {
  const child = spawn("node", ["dist/worker.js"], {
    cwd: API_DIR,
    env: {
      ...process.env,
      ...base,
      DATABASE_URL: scratchUrl,
      STORAGE_DRIVER: "local",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(smtpPort),
      OUTBOX_POLL_MS: "300",
      LOG_LEVEL: "warn"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stderr?.on(
    "data",
    (d: Buffer) => process.env.DRILL_VERBOSE && process.stderr.write(`[${label}] ${d}`)
  );
  return child;
}
const exited = (child: ChildProcess) =>
  new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal }))
  );

async function mailTo(address: string): Promise<Array<{ ID: string; MessageID: string }>> {
  const res = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`
  );
  const body = (await res.json()) as { messages: Array<{ ID: string; MessageID: string }> };
  return body.messages;
}

async function main(): Promise<void> {
  if (!existsSync(path.join(API_DIR, "dist/worker.js")))
    throw new Error("Build first: pnpm --filter @sidewalk/api build");
  const mailpitUp = await fetch(`${MAILPIT}/api/v1/info`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!mailpitUp) throw new Error(`Mailpit is not reachable at ${MAILPIT}. Run pnpm infra:up.`);

  const admin = new Pg({ connectionString: pgOf(swapDb(baseUrl, "postgres")) });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: API_DIR,
    env: { ...process.env, ...base, DATABASE_URL: scratchUrl },
    stdio: "pipe"
  });
  const db = new Pg({ connectionString: pgOf(scratchUrl) });
  await db.connect();

  const children: ChildProcess[] = [];
  const pit = await tarpit();
  try {
    // Queue five messages for one resident, encrypted exactly as the application does.
    const keyring = buildOutboxKeyring(
      loadEnv({ ...process.env, ...base, DATABASE_URL: scratchUrl } as NodeJS.ProcessEnv)
    );
    const userId = randomUUID();
    const address = `drill.${randomBytes(3).toString("hex")}@drill.sidewalk.test`;
    await db.query(
      `INSERT INTO "User" (id, email, "passwordHash", "displayName", "updatedAt", "emailVerifiedAt") VALUES ($1,$2,'x','Drill', now(), now())`,
      [userId, address]
    );
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = randomUUID();
      ids.push(id);
      await db.query(
        `INSERT INTO "EmailOutbox" (id, kind, "userId", "toEmail", "payloadCiphertext", "dedupeKey") VALUES ($1,'PASSWORD_CHANGED',$2,$3,$4,$5)`,
        [id, userId, address, keyring.encrypt({}, id), `drill-${i}`]
      );
    }
    const states = async () =>
      (
        await db.query(`SELECT status, count(*)::int AS n FROM "EmailOutbox" GROUP BY status`)
      ).rows.reduce(
        (acc: Record<string, number>, r: { status: string; n: number }) => ({
          ...acc,
          [r.status]: r.n
        }),
        {}
      );

    // 1. The mail server is down.
    const down = await closedPort();
    const outage = startWorker(down, "outage");
    children.push(outage);
    await until("all five messages to fail once", async () => (await states()).FAILED === 5);
    const failed = (
      await db.query(
        `SELECT attempts, "nextAttemptAt" > (now() AT TIME ZONE 'UTC') AS later, "lastError", "payloadCiphertext" IS NOT NULL AS kept FROM "EmailOutbox"`
      )
    ).rows;
    check(
      "a mail outage leaves every message FAILED, none dead",
      (await states()).DEAD === undefined
    );
    check(
      "each has a retry scheduled in the future and keeps its content",
      failed.every((r) => r.later && r.kept)
    );
    check(
      "the recorded reason carries no address or link",
      failed.every((r) => !/@|https?:/.test(String(r.lastError))),
      String(failed[0]?.lastError)
    );
    outage.kill("SIGTERM");
    await exited(outage);

    // 2. A worker dies in the middle of sending.
    await db.query(
      `UPDATE "EmailOutbox" SET "nextAttemptAt" = (now() AT TIME ZONE 'UTC') - interval '1 second'`
    );
    const doomed = startWorker(pit.port, "doomed");
    children.push(doomed);
    await until("a message to be claimed and in flight", async () => (await states()).SENDING >= 1);
    doomed.kill("SIGKILL");
    const killed = await exited(doomed);
    const orphaned = (await states()).SENDING ?? 0;
    check("a worker killed mid-send dies abruptly (SIGKILL)", killed.signal === "SIGKILL");
    check(
      "its message is left claimed, not lost and not delivered",
      orphaned >= 1 && (await mailTo(address)).length === 0,
      `${orphaned} claimed`
    );

    // 3. Five minutes later: a healthy worker takes over.
    await db.query(
      `UPDATE "EmailOutbox" SET "lockedAt" = (now() AT TIME ZONE 'UTC') - interval '6 minutes' WHERE status = 'SENDING'`
    );
    await db.query(
      `UPDATE "EmailOutbox" SET "nextAttemptAt" = (now() AT TIME ZONE 'UTC') - interval '1 second' WHERE status = 'FAILED'`
    );
    const healthy = startWorker(1025, "healthy");
    children.push(healthy);
    await until("every message to be sent", async () => (await states()).SENT === 5, 30_000);
    await sleep(1500); // a duplicate, if there were going to be one, would arrive by now
    const inbox = await mailTo(address);
    check("every queued message is delivered", inbox.length === 5, `${inbox.length} of 5`);
    check(
      "each exactly once (no duplicate Message-ID)",
      new Set(inbox.map((m) => m.MessageID)).size === inbox.length
    );
    check(
      "delivered content is erased from the queue",
      (
        await db.query(
          `SELECT count(*)::int AS n FROM "EmailOutbox" WHERE "payloadCiphertext" IS NOT NULL`
        )
      ).rows[0].n === 0
    );
    const attempts = (await db.query(`SELECT max(attempts)::int AS m FROM "EmailOutbox"`)).rows[0]
      .m as number;
    check("no message ran out of attempts along the way", attempts < 6, `max ${attempts}`);

    // 4. Clean shutdown. (After its shutdown hooks finish, Nest re-raises the signal, so a clean stop is reported
    //    as "terminated by SIGTERM" rather than exit code 0.)
    const began = Date.now();
    healthy.kill("SIGTERM");
    const stopped = await exited(healthy);
    check(
      "an idle worker stops promptly on SIGTERM",
      (stopped.code === 0 || stopped.signal === "SIGTERM") && Date.now() - began < 5000,
      `${stopped.signal ?? `exit ${stopped.code}`}, ${Date.now() - began} ms`
    );

    // 5. SIGTERM while a message is in flight: the worker waits for it and records the outcome, instead of
    //    leaving it claimed the way SIGKILL did.
    const lateId = randomUUID();
    await db.query(
      `INSERT INTO "EmailOutbox" (id, kind, "userId", "toEmail", "payloadCiphertext", "dedupeKey") VALUES ($1,'PASSWORD_CHANGED',$2,$3,$4,'drill-late')`,
      [lateId, userId, address, keyring.encrypt({}, lateId)]
    );
    const graceful = startWorker(pit.port, "graceful");
    children.push(graceful);
    await until("the last message to be in flight", async () => (await states()).SENDING === 1);
    graceful.kill("SIGTERM");
    await sleep(1500);
    check(
      "a worker told to stop mid-send keeps running until that send ends",
      graceful.exitCode === null && graceful.signalCode === null
    );
    await exited(graceful);
    const late = (
      await db.query(`SELECT status, "lockedAt" FROM "EmailOutbox" WHERE id = $1`, [lateId])
    ).rows[0];
    check(
      "and then records the outcome (retry scheduled), leaving nothing claimed",
      late.status === "FAILED" && late.lockedAt === null,
      `status ${late.status}`
    );
  } finally {
    for (const c of children) if (c.exitCode === null) c.kill("SIGKILL");
    pit.close();
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
  console.log(
    `\n${results.join("\n")}\n\n${failures === 0 ? "DRILL PASSED" : `DRILL FAILED (${failures})`}`
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
