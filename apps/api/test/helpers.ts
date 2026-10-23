import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { configureApp } from "../src/bootstrap";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  EMAIL_PROVIDER,
  type EmailProvider,
  type OutgoingEmail
} from "../src/email/email.provider";
import { OutboxProcessor } from "../src/email/outbox.processor";
import { STORAGE, type StorageProvider } from "../src/evidence/storage/storage.provider";

export const PASSWORD = "Correct-horse-battery-9";
export const ORIGIN = "http://localhost:3010";

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  /** Everything the application tried to email, and a way to make delivery fail. */
  email: FakeEmailProvider;
  close: () => Promise<void>;
}

/** Captures outgoing email in memory. It can be told to fail, to exercise retries without a real mail server. */
export class FakeEmailProvider implements EmailProvider {
  readonly sent: OutgoingEmail[] = [];
  /** Errors to throw on the next sends, in order (null = succeed). */
  private script: Array<Error | null> = [];
  attempts = 0;

  failNext(...errors: Array<Error | null>): void {
    this.script.push(...errors);
  }
  reset(): void {
    this.sent.length = 0;
    this.script = [];
    this.attempts = 0;
  }
  async send(message: OutgoingEmail): Promise<{ providerMessageId: string }> {
    this.attempts += 1;
    const next = this.script.shift();
    if (next) throw next;
    this.sent.push(message);
    return { providerMessageId: message.messageId };
  }
  to(address: string): OutgoingEmail[] {
    return this.sent.filter((m) => m.to === address);
  }
  /** The one-time token in the last message to an address, or undefined. */
  tokenFor(address: string): string | undefined {
    // Messages can be delivered in any order, so look for the latest one that actually carries a link.
    for (const mail of [...this.to(address)].reverse()) {
      const token = mail.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
      if (token) return token;
    }
    return undefined;
  }
}

/** Runs the delivery worker until nothing is due, the way the real worker would over a few polls. */
export async function deliverEmail(app: INestApplication): Promise<number> {
  const processor = app.get(OutboxProcessor);
  let total = 0;
  for (let i = 0; i < 20; i++) {
    const n = await processor.runOnce();
    total += n;
    if (n === 0) break;
  }
  return total;
}

/** Boots the real application (same configuration as production) against the test database. */
export async function createApp(
  options: {
    rateLimitMultiplier?: number;
    storage?: StorageProvider;
    env?: Record<string, string>;
  } = {}
): Promise<TestApp> {
  process.env.RATE_LIMIT_MULTIPLIER = String(options.rateLimitMultiplier ?? 1000);
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(options.env ?? {})) {
    previous[k] = process.env[k];
    process.env[k] = v;
  }
  const email = new FakeEmailProvider();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EMAIL_PROVIDER)
    .useValue(email);
  if (options.storage) builder = builder.overrideProvider(STORAGE).useValue(options.storage);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  // The environment is read while the module initialises; restore it so other suites are unaffected.
  for (const [k, v] of Object.entries(previous)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return { app, prisma, email, close: () => app.close() };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = [
    "RateLimitBucket",
    "EmailOutbox",
    "Notification",
    "ReportFollow",
    "AuthToken",
    "AuditLog",
    "ModerationAction",
    "ContentFlag",
    "InternalNote",
    "ActivityEvent",
    "Comment",
    "ReportStatusHistory",
    "ReportEvidence",
    "Report",
    "Session",
    "User",
    "Category"
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
}

export const CATEGORY_SLUGS = [
  "roads-and-potholes",
  "flooding-and-drainage",
  "waste-and-sanitation"
] as const;

export async function seedCategories(prisma: PrismaService): Promise<void> {
  await prisma.category.createMany({
    data: [
      {
        slug: "roads-and-potholes",
        name: "Roads and potholes",
        description: "Potholes and damaged roads.",
        sortOrder: 10
      },
      {
        slug: "flooding-and-drainage",
        name: "Flooding and drainage",
        description: "Blocked drains and flooding.",
        sortOrder: 20
      },
      {
        slug: "waste-and-sanitation",
        name: "Waste and sanitation",
        description: "Refuse and sanitation.",
        sortOrder: 30
      }
    ]
  });
}

const fastHash = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 1024, timeCost: 1, parallelism: 1 });

export async function createUser(
  prisma: PrismaService,
  overrides: Partial<{
    email: string;
    displayName: string;
    role: "CITIZEN" | "MODERATOR" | "ADMIN";
    status: "ACTIVE" | "SUSPENDED";
    verified: boolean;
  }> = {}
) {
  const id = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${id}@example.test`,
      displayName: overrides.displayName ?? `Test User ${id}`,
      role: overrides.role ?? "CITIZEN",
      status: overrides.status ?? "ACTIVE",
      // Most tests are about something other than email, so accounts start confirmed unless a test says otherwise.
      emailVerifiedAt: overrides.verified === false ? null : new Date(),
      passwordHash: await fastHash(PASSWORD)
    }
  });
}

/** A browser-like client: keeps cookies and echoes the CSRF cookie the way the web app does. */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  csrf: string | undefined;

  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  private capture(res: request.Response): request.Response {
    const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    const csrf = cookies.find((c) => c.startsWith("sw_csrf="));
    if (csrf) {
      const value = csrf.split(";")[0]?.slice("sw_csrf=".length);
      this.csrf = value ? value : undefined;
    }
    return res;
  }

  private unsafe(method: "post" | "put" | "patch" | "delete", url: string) {
    const req = this.agent[method](`/api/v1${url}`).set("Origin", ORIGIN);
    return this.csrf ? req.set("X-CSRF-Token", this.csrf) : req;
  }

  async login(email: string, password = PASSWORD): Promise<request.Response> {
    return this.capture(
      await this.agent.post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email, password })
    );
  }

  get(url: string) {
    return this.agent.get(`/api/v1${url}`);
  }
  post(url: string, body?: object) {
    return this.unsafe("post", url).send(body);
  }
  put(url: string, body?: object) {
    return this.unsafe("put", url).send(body);
  }
  patch(url: string, body?: object) {
    return this.unsafe("patch", url).send(body);
  }
  del(url: string, body?: object) {
    return this.unsafe("delete", url).send(body);
  }
  async upload(
    url: string,
    file: Buffer,
    filename: string,
    fields: Record<string, string> = {},
    contentType?: string
  ) {
    let req = this.unsafe("post", url);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach("file", file, { filename, contentType });
  }
  async refresh() {
    return this.capture(await this.unsafe("post", "/auth/refresh").send({}));
  }
}

export async function signedIn(
  app: INestApplication,
  prisma: PrismaService,
  role: "CITIZEN" | "MODERATOR" | "ADMIN" = "CITIZEN",
  overrides: Parameters<typeof createUser>[1] = {}
) {
  const user = await createUser(prisma, { role, ...overrides });
  const client = new Client(app);
  const res = await client.login(user.email);
  if (res.status !== 200)
    throw new Error(`Test login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { user, client };
}

export function reportPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Large pothole outside the primary school",
    description:
      "The pothole is about a metre wide and fills with water after rain. Motorcycles swerve around it.",
    categorySlug: "roads-and-potholes",
    latitude: 6.5244,
    longitude: 3.3792,
    addressText: "Outside the primary school gate",
    areaName: "Yaba, Lagos",
    clientRequestId: randomUUID(),
    ...overrides
  };
}

export async function makeReport(client: Client, overrides: Record<string, unknown> = {}) {
  const res = await client.post("/reports", reportPayload(overrides));
  if (res.status !== 201 && res.status !== 200)
    throw new Error(`Report creation failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { reference: string; id: string };
}

let colour = 10;
/** A real, distinct PNG each call (so the duplicate-photo check does not trip). */
export function pngImage(width = 120, height = 90): Promise<Buffer> {
  colour = (colour + 37) % 250;
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: colour, g: 200 - (colour % 100), b: (colour * 3) % 255 }
    }
  })
    .png()
    .toBuffer();
}

/** In-memory object store that can be told to fail, for testing storage outages without touching disk. */
export class FlakyStorage implements StorageProvider {
  readonly objects = new Map<string, Buffer>();
  puts = 0;
  /** Fail the Nth put (1-based). 0 means never. */
  failPutAt = 0;
  failAll = false;

  async put(key: string, body: Buffer): Promise<void> {
    this.puts += 1;
    if (this.failAll || this.puts === this.failPutAt) throw new Error("simulated storage outage");
    this.objects.set(key, body);
  }
  async get(key: string) {
    const body = this.objects.get(key);
    return body ? { body, contentType: "image/webp" } : null;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  async ping(): Promise<void> {
    if (this.failAll) throw new Error("down");
  }
  async list(prefix: string): Promise<Array<{ key: string; lastModified: Date }>> {
    return [...this.objects.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((key) => ({ key, lastModified: new Date(Date.now() - 2 * 3600_000) }));
  }
}
