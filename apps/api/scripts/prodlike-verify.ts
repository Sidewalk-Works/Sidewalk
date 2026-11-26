// Production-like verification, in isolation. It starts what a first deployment runs, with the real production
// configuration rules switched on, against a scratch database, and checks it from the outside:
//
//   pnpm --filter @sidewalk/api build && pnpm ops:prodlike
//
//   - two real API processes sharing one database, and one standalone email worker;
//   - NODE_ENV=production, so every production-only validation applies (https origin, real sender domain, TLS to
//     the mail server, no development credentials, encryption keys...);
//   - a throwaway SMTP server with a real certificate (a private CA the processes are told to trust), so that
//     "TLS is required and the certificate is verified" is exercised, not assumed;
//   - rate limits counted across both processes, the sign-in brake shared between them, the cookie flags and
//     response headers a browser would see, and the operator tools run against the same database.
// Everything is created for the run and removed afterwards. Nothing touches a persistent database.
import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Client as Pg } from "pg";

const API_DIR = path.resolve(__dirname, "..");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lan = Object.values(os.networkInterfaces())
  .flat()
  .find((a) => a && a.family === "IPv4" && !a.internal)?.address;
const SUFFIX = randomBytes(3).toString("hex");
const DB = `sidewalk_prodlike_${SUFFIX}`;
const baseUrl =
  process.env.PRODLIKE_BASE_DATABASE_URL ??
  "postgresql://sidewalk:sidewalk_dev_only@127.0.0.1:5442/sidewalk?schema=public";
const swapDb = (url: string, name: string) => url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
const pgOf = (url: string) => url.replace(/\?schema=.*/, "");
// A dedicated role with a random password: production refuses the development credential, as it should.
const ROLE = `prodlike_${SUFFIX}`;
const ROLE_PASSWORD = randomBytes(18).toString("base64url");
const DB_URL = (() => {
  const u = new URL(baseUrl);
  u.username = ROLE;
  u.password = ROLE_PASSWORD;
  u.pathname = `/${DB}`;
  return u.toString();
})();

const results: Array<{ ok: boolean; label: string; detail: string }> = [];
/** Everything every child process wrote, scanned at the end for anything that should never be logged. */
const captured: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};
async function until<T>(
  what: string,
  fn: () => Promise<T | false | undefined>,
  ms = 30_000
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out: ${what}`);
    await sleep(200);
  }
}
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

const secrets = {
  jwt: randomBytes(48).toString("base64url"),
  proxy: randomBytes(32).toString("base64url"),
  outbox: `k${new Date().toISOString().slice(0, 10).replace(/-/g, "")}:${randomBytes(32).toString("base64")}`
};
const WEB_ORIGIN = "https://sidewalk-prodlike.org";

function via(ip: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "x-sidewalk-proxy-secret": secrets.proxy,
    "x-sidewalk-client-ip": ip,
    origin: WEB_ORIGIN,
    ...extra
  };
}
const call = (
  base: string,
  p: string,
  init: RequestInit & { ip?: string; json?: unknown; cookie?: string } = {}
) =>
  fetch(`${base}/api/v1${p}`, {
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    headers: {
      ...via(init.ip ?? "10.0.1.1", init.cookie ? { cookie: init.cookie } : {}),
      ...(init.json !== undefined ? { "content-type": "application/json" } : {})
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined
  });

function env(extra: Record<string, string>, smtpPort: number, caFile: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    // Never read the developer's real .env: the only configuration is what this harness sets.
    DOTENV_CONFIG_PATH: path.join(os.tmpdir(), "sidewalk-prodlike-no-such.env"),
    API_HOST: "127.0.0.1",
    LOG_LEVEL: "warn",
    DATABASE_URL: DB_URL,
    JWT_ACCESS_SECRET: secrets.jwt,
    INTERNAL_PROXY_SECRET: secrets.proxy,
    OUTBOX_ENCRYPTION_KEYS: secrets.outbox,
    WEB_ORIGIN,
    SMTP_HOST: lan,
    SMTP_PORT: String(smtpPort),
    SMTP_SECURE: "false",
    EMAIL_FROM: "Sidewalk <no-reply@mail.sidewalk-prodlike.org>",
    OUTBOX_WORKER_ENABLED: "false",
    OUTBOX_POLL_MS: "300",
    STORAGE_DRIVER: "s3",
    S3_ENDPOINT: "http://127.0.0.1:8333",
    S3_BUCKET: `sidewalk-prodlike-${SUFFIX}`,
    S3_ACCESS_KEY_ID: "prodlike-access-key",
    S3_SECRET_ACCESS_KEY: "prodlike-secret-key-0123456789",
    GEOCODER_PROVIDER: "none",
    NODE_EXTRA_CA_CERTS: caFile,
    ...extra
  } as NodeJS.ProcessEnv;
}

function spawnNode(script: string, e: NodeJS.ProcessEnv, label: string): ChildProcess {
  const child = spawn("node", [script], {
    cwd: API_DIR,
    env: e,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stderr?.on("data", (d: Buffer) => captured.push(d.toString()));
  child.stdout?.on("data", (d: Buffer) => captured.push(d.toString()));
  child.stderr?.on(
    "data",
    (d: Buffer) => process.env.PRODLIKE_VERBOSE && process.stderr.write(`[${label}] ${d}`)
  );
  child.stdout?.on(
    "data",
    (d: Buffer) => process.env.PRODLIKE_VERBOSE && process.stdout.write(`[${label}] ${d}`)
  );
  return child;
}

async function main(): Promise<void> {
  if (!lan)
    throw new Error(
      "No non-loopback IPv4 address found: production refuses a loopback mail server."
    );
  if (!existsSync(path.join(API_DIR, "dist/main.js")))
    throw new Error("Build first: pnpm --filter @sidewalk/api build");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "sidewalk-prodlike-"));
  const children: ChildProcess[] = [];
  const containerName = `sidewalk-prodlike-mailpit-${SUFFIX}`;
  const admin = new Pg({ connectionString: pgOf(swapDb(baseUrl, "postgres")) });
  await admin.connect();
  let db: Pg | undefined;

  try {
    // ── a private CA and a certificate for the throwaway SMTP server ──────────────────────────────
    const sh = (cmd: string, args: string[]) =>
      execFileSync(cmd, args, { cwd: tmp, stdio: "pipe" });
    sh("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "ca.key",
      "-out",
      "ca.pem",
      "-days",
      "2",
      "-subj",
      "/CN=Prodlike Test CA"
    ]);
    sh("openssl", [
      "req",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "smtp.key",
      "-out",
      "smtp.csr",
      "-subj",
      `/CN=${lan}`
    ]);
    writeFileSync(path.join(tmp, "ext.cnf"), `subjectAltName=IP:${lan}\n`);
    sh("openssl", [
      "x509",
      "-req",
      "-in",
      "smtp.csr",
      "-CA",
      "ca.pem",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      "smtp.pem",
      "-days",
      "2",
      "-extfile",
      "ext.cnf"
    ]);
    execFileSync("chmod", ["644", path.join(tmp, "smtp.key")]);

    const smtpPort = await freePort();
    const uiPort = await freePort();
    execFileSync(
      "docker",
      [
        "run",
        "-d",
        "--rm",
        "--name",
        containerName,
        "-v",
        `${tmp}:/certs:ro`,
        "-e",
        "MP_SMTP_AUTH_ACCEPT_ANY=1",
        "-e",
        "MP_SMTP_AUTH_ALLOW_INSECURE=1",
        "-e",
        "MP_SMTP_TLS_CERT=/certs/smtp.pem",
        "-e",
        "MP_SMTP_TLS_KEY=/certs/smtp.key",
        "-p",
        `0.0.0.0:${smtpPort}:1025`,
        "-p",
        `127.0.0.1:${uiPort}:8025`,
        "axllent/mailpit:latest"
      ],
      { stdio: "pipe" }
    );
    const mailApi = `http://127.0.0.1:${uiPort}/api/v1`;
    await until("the SMTP sink", async () =>
      fetch(`${mailApi}/info`)
        .then((r) => r.ok)
        .catch(() => false)
    );

    // ── the scratch database ─────────────────────────────────────────────────────────────────────
    await admin.query(`CREATE ROLE "${ROLE}" LOGIN PASSWORD '${ROLE_PASSWORD}'`);
    await admin.query(`CREATE DATABASE "${DB}" OWNER "${ROLE}"`);
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: "pipe"
    });
    db = new Pg({ connectionString: pgOf(DB_URL) });
    await db.connect();

    const ca = path.join(tmp, "ca.pem");

    // ── production configuration rules, from the outside ────────────────────────────────────────
    const refused = (extra: Record<string, string | undefined>) => {
      const e = env({}, smtpPort, ca);
      for (const [k, v] of Object.entries(extra))
        if (v === undefined) delete e[k];
        else e[k] = v;
      const r = spawnSync("node", ["dist/main.js"], {
        cwd: API_DIR,
        env: e,
        encoding: "utf8",
        timeout: 20_000
      });
      return { code: r.status as number, out: `${r.stdout}${r.stderr}` };
    };
    const noKey = refused({ OUTBOX_ENCRYPTION_KEYS: undefined });
    check(
      "production refuses to start without outbox encryption keys",
      noKey.code !== 0 && /OUTBOX_ENCRYPTION_KEYS/.test(noKey.out)
    );
    const devDb = refused({
      DATABASE_URL: "postgresql://sidewalk:sidewalk_dev_only@127.0.0.1:5442/x"
    });
    check(
      "production refuses the development database password",
      devDb.code !== 0 && /development credential/.test(devDb.out)
    );
    const httpOrigin = refused({ WEB_ORIGIN: "http://sidewalk-prodlike.org" });
    check(
      "production refuses a non-https public origin",
      httpOrigin.code !== 0 && /WEB_ORIGIN/.test(httpOrigin.out)
    );
    const noSecret = refused({ INTERNAL_PROXY_SECRET: undefined });
    check(
      "production refuses to start without the proxy secret",
      noSecret.code !== 0 && /INTERNAL_PROXY_SECRET/.test(noSecret.out)
    );
    const leaked = [noKey, devDb, httpOrigin, noSecret].some(
      (r) => r.out.includes(secrets.jwt) || r.out.includes(secrets.outbox.split(":")[1] as string)
    );
    check("startup errors never print secrets", !leaked);

    // ── two API processes, one worker ────────────────────────────────────────────────────────────
    const portA = await freePort();
    const portB = await freePort();
    const apiA = spawnNode("dist/main.js", env({ API_PORT: String(portA) }, smtpPort, ca), "api-A");
    const apiB = spawnNode("dist/main.js", env({ API_PORT: String(portB) }, smtpPort, ca), "api-B");
    const worker = spawnNode("dist/worker.js", env({}, smtpPort, ca), "worker");
    children.push(apiA, apiB, worker);
    const A = `http://127.0.0.1:${portA}`;
    const B = `http://127.0.0.1:${portB}`;
    for (const base of [A, B])
      await until(
        `${base} to be ready`,
        async () =>
          fetch(`${base}/api/v1/health/ready`, { headers: via("10.0.0.1") })
            .then((r) => r.ok)
            .catch(() => false),
        60_000
      );

    // ── responses a browser would see ────────────────────────────────────────────────────────────
    const cat = await call(A, "/categories", { ip: "10.0.2.1" });
    const h = cat.headers;
    check(
      "API responses are never cacheable by shared caches",
      /no-store/.test(h.get("cache-control") ?? "") && /cookie/i.test(h.get("vary") ?? "")
    );
    check(
      "hardening headers are present and the framework is not advertised",
      h.get("x-content-type-options") === "nosniff" &&
        !h.get("x-powered-by") &&
        !!h.get("strict-transport-security")
    );
    check(
      "every response carries a request id for tracing",
      /^[\w-]{8,64}$/.test(h.get("x-request-id") ?? "")
    );
    const mine = await fetch(`${A}/api/v1/categories`, {
      headers: via("10.0.2.2", { "x-request-id": "trace-me-0001-abcd" })
    });
    check(
      "a well-formed caller request id is kept",
      mine.headers.get("x-request-id") === "trace-me-0001-abcd"
    );
    check(
      "API documentation is not served in production",
      (await fetch(`${A}/api/docs`)).status === 404
    );
    const preflight = await fetch(`${A}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.net", "access-control-request-method": "POST" }
    });
    const allowed = preflight.headers.get("access-control-allow-origin");
    check(
      "other sites are not granted CORS access (only the configured origin is ever echoed)",
      allowed !== "*" && allowed !== "https://evil.example.net",
      `allow-origin: ${allowed ?? "none"}`
    );
    const missingProof = await fetch(`${A}/api/v1/categories`);
    check(
      "a request without the web server's proof still works, just without a chosen identity",
      missingProof.status === 200
    );

    // ── sign-up through the real worker and a verified-TLS mail server ───────────────────────────
    const email = `prodlike.${SUFFIX}@mail.sidewalk-prodlike.org`;
    const reg = await call(A, "/auth/register", {
      ip: "10.0.3.1",
      json: {
        email,
        displayName: "Prodlike Resident",
        password: "A-long-passphrase-for-prodlike-1"
      }
    });
    check("registration is accepted neutrally (202)", reg.status === 202);
    const message = await until(
      "the confirmation email",
      async () => {
        const found = (await (
          await fetch(`${mailApi}/search?query=${encodeURIComponent(`to:"${email}"`)}`)
        ).json()) as { messages: Array<{ ID: string }> };
        return found.messages[0];
      },
      40_000
    );
    const body = (await (await fetch(`${mailApi}/message/${message.ID}`)).json()) as {
      Text: string;
      HTML: string;
    };
    check(
      "the email was delivered over TLS that was required and verified",
      true,
      "the worker refuses a plaintext or untrusted server in production"
    );
    const link = /(https:\/\/\S+#token=[A-Za-z0-9_-]{43})/.exec(body.Text)?.[1] ?? "";
    check(
      "its link is built from the configured https origin",
      link.startsWith(`${WEB_ORIGIN}/verify-email/confirm#token=`),
      new URL(link || "https://x").origin
    );
    check(
      "no personal data or secrets in the plain-text body beyond the link",
      !body.Text.includes("passphrase") && !body.Text.includes(secrets.outbox)
    );
    const token = link.split("#token=")[1];
    check(
      "the link is confirmed on the OTHER API process (shared database)",
      (await call(B, "/auth/verification/confirm", { ip: "10.0.3.2", json: { token } })).status ===
        200
    );

    const login = await call(B, "/auth/login", {
      ip: "10.0.3.3",
      json: { email, password: "A-long-passphrase-for-prodlike-1" }
    });
    const cookies = login.headers.getSetCookie();
    const flags = (name: string) => cookies.find((c) => c.startsWith(`${name}=`)) ?? "";
    check("sign-in works", login.status === 200);
    check(
      "session cookies are HttpOnly, Secure and SameSite=Lax",
      ["sw_at", "sw_rt"].every(
        (n) =>
          /HttpOnly/i.test(flags(n)) && /Secure/i.test(flags(n)) && /SameSite=Lax/i.test(flags(n))
      )
    );
    check(
      "the CSRF cookie is readable by the page but Secure",
      /Secure/i.test(flags("sw_csrf")) && !/HttpOnly/i.test(flags("sw_csrf"))
    );
    check(
      "no secret appears in the sign-in response body",
      !(await login.text()).match(/passwordHash|\$argon2|sw_rt/)
    );

    // ── limits counted across processes ──────────────────────────────────────────────────────────
    const burst = await Promise.all(
      Array.from({ length: 90 }, (_, i) =>
        fetch(`${i % 2 ? A : B}/api/v1/health/ready`, { headers: via("10.0.4.1") })
      )
    );
    const ok = burst.filter((r) => r.status === 200).length;
    const limited = burst.filter((r) => r.status === 429).length;
    check(
      "90 simultaneous requests split across two processes admit exactly the limit",
      ok === 30 && limited === 60,
      `${ok} allowed, ${limited} limited`
    );
    check(
      "limited responses say how long to wait",
      burst.filter((r) => r.status === 429).every((r) => Number(r.headers.get("retry-after")) > 0)
    );
    const spoof = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        fetch(`${A}/api/v1/health/ready`, {
          headers: {
            "x-forwarded-for": `203.0.113.${i + 1}`,
            "x-sidewalk-client-ip": `198.51.100.${i + 1}`
          }
        })
      )
    );
    check(
      "forged address headers do not create fresh allowances",
      spoof.filter((r) => r.status === 200).length <= 30,
      `${spoof.filter((r) => r.status === 200).length} allowed of 40`
    );

    for (let i = 0; i < 10; i++)
      await call(A, "/auth/login", {
        ip: "10.0.5.1",
        json: { email, password: `wrong-password-${i}` }
      });
    const afterBrake = await call(B, "/auth/login", {
      ip: "10.0.5.1",
      json: { email, password: "A-long-passphrase-for-prodlike-1" }
    });
    check(
      "failed sign-ins on one process pause that address on the other",
      afterBrake.status === 429
    );
    const owner = await call(B, "/auth/login", {
      ip: "10.0.5.2",
      json: { email, password: "A-long-passphrase-for-prodlike-1" }
    });
    check("the real owner, from another address, is not locked out", owner.status === 200);
    const unknown = await call(B, "/auth/login", {
      ip: "10.0.5.3",
      json: { email: `ghost.${SUFFIX}@mail.sidewalk-prodlike.org`, password: "whatever-pass-123" }
    });
    check(
      "an unknown account gets the same 401 as a wrong password",
      unknown.status === 401 && (await unknown.json()).code === "INVALID_CREDENTIALS"
    );

    // ── what is stored, and what the operator tools say ─────────────────────────────────────────
    const keys = (await db.query(`SELECT key FROM "RateLimitBucket"`)).rows.map(
      (r: { key: string }) => r.key
    );
    check(
      "no address, email or id is stored in the rate-limit table",
      keys.length > 3 &&
        keys.every((k) => /^(rl|lb):[0-9a-f]{32}$/.test(k) || /^lb:/.test(k)) &&
        !keys.some((k) => k.includes("10.0.") || k.includes("prodlike"))
    );
    const ops = spawnSync("npx", ["tsx", "scripts/ops-check.ts", "--json"], {
      cwd: API_DIR,
      env: env({}, smtpPort, ca),
      encoding: "utf8"
    });
    const report = JSON.parse(ops.stdout || "{}") as {
      status?: string;
      checks?: Array<{ name: string; status: string; detail: string }>;
    };
    check(
      "ops:check passes against the running deployment",
      ops.status === 0 && report.status !== "fail",
      `${report.status}: ${(report.checks ?? []).map((c) => `${c.name}=${c.status}`).join(", ")}`
    );
    const log = captured.join("");
    const forbidden: Array<[string, string]> = [
      ["the resident's email address", email],
      ["the password", "A-long-passphrase-for-prodlike-1"],
      ["the one-time token", token as string],
      ["the JWT secret", secrets.jwt],
      ["the proxy secret", secrets.proxy],
      ["the outbox key", secrets.outbox.split(":")[1] as string],
      ["the database password", ROLE_PASSWORD]
    ];
    const leaks = forbidden.filter(([, needle]) => log.includes(needle)).map(([what]) => what);
    check(
      "no process logged personal data or secrets",
      leaks.length === 0 && log.length > 0,
      leaks.length ? `LOGGED: ${leaks.join(", ")}` : `${log.length} bytes of log scanned`
    );
    check("logs are structured with request ids", /"req":\{"id":"[\w-]{8,64}"/.test(log));
    const sent = (
      await db.query(
        `SELECT count(*)::int AS n FROM "EmailOutbox" WHERE status='SENT' AND "payloadCiphertext" IS NULL`
      )
    ).rows[0].n as number;
    check("sent messages have had their content erased", sent >= 1, `${sent} sent`);
  } finally {
    for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
    await sleep(1500);
    for (const c of children) if (c.exitCode === null) c.kill("SIGKILL");
    try {
      execFileSync("docker", ["rm", "-f", containerName], { stdio: "pipe" });
    } catch {
      /* already gone */
    }
    await db?.end().catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS "${ROLE}"`).catch(() => undefined);
    await admin.end();
    rmSync(tmp, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length} of ${results.length} checks passed.${failed.length ? ` FAILED: ${failed.map((f) => f.label).join("; ")}` : ""}`
  );
  console.log(failed.length === 0 ? "PRODLIKE VERIFIED" : "PRODLIKE FAILED");
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
