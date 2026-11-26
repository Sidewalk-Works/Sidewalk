import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { parseOutboxKeys } from "../email/outbox-crypto";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const PLACEHOLDER_SECRETS = ["change-me", "changeme", "replace-me", "secret"];

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    /** Interface the API listens on. Loopback by default; set 0.0.0.0 only inside a private network or container. */
    API_HOST: z.string().default("127.0.0.1"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    /** Public origin of the web app. Used for CORS and for the cross-site request origin check. */
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    TRUST_PROXY: z.string().default("false"),

    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    /**
     * Shared with the web server so it can tell the API who the visitor really is (for rate limits).
     * Required in production; without it every visitor would share the web server's address.
     */
    INTERNAL_PROXY_SECRET: z
      .string()
      .min(32, "INTERNAL_PROXY_SECRET must be at least 32 characters")
      .optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    COOKIE_SECURE: bool.optional(),
    COOKIE_DOMAIN: z.string().optional(),

    RATE_LIMIT_ENABLED: bool.default(true),
    /** Scales every rate limit. Automated tests raise it; production leaves it at 1. */
    RATE_LIMIT_MULTIPLIER: z.coerce.number().min(0.1).max(10000).default(1),
    /**
     * How long a rate-limit check may wait for the shared store before the request falls back to this process's
     * own counter. Short, because it sits on every request.
     */
    RATE_LIMIT_STORE_TIMEOUT_MS: z.coerce.number().int().min(50).max(10_000).default(750),

    SWAGGER_ENABLED: bool.optional(),

    STORAGE_DRIVER: z.enum(["s3", "local"]).default("s3"),
    LOCAL_STORAGE_DIR: z.string().default(".local-storage"),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().default("sidewalk-evidence"),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(true),

    /** SMTP server for outgoing email. In development this is the Mailpit sink from docker-compose. */
    SMTP_HOST: z.string().default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    /** true = implicit TLS (port 465). false = plain, or STARTTLS when the server offers it. */
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    /** The visible sender. Its domain must have SPF, DKIM and DMARC set up (see docs/security.md). */
    EMAIL_FROM: z.string().default("Sidewalk <no-reply@sidewalk.test>"),
    /** Runs the email/notification worker inside the API process. Set false when you run `pnpm worker` separately. */
    OUTBOX_WORKER_ENABLED: bool.default(true),
    OUTBOX_POLL_MS: z.coerce.number().int().min(200).max(60_000).default(2000),
    /**
     * Keys that encrypt queued email content: comma-separated `id:base64` (32 random bytes each). The FIRST key
     * encrypts new messages; the others only decrypt, so rotation never strands a queued message. Independent of
     * JWT_ACCESS_SECRET. Required in production. Generate with `pnpm outbox:keys generate`.
     */
    OUTBOX_ENCRYPTION_KEYS: z.string().optional(),
    /**
     * Whether messages queued before keys were independent (encrypted with a key derived from JWT_ACCESS_SECRET)
     * can still be read. Turn it off once `pnpm outbox:keys status` reports no legacy rows.
     */
    OUTBOX_LEGACY_JWT_DECRYPT: bool.default(true),

    GEOCODER_PROVIDER: z.enum(["nominatim", "none"]).default("nominatim"),
    GEOCODER_BASE_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
    GEOCODER_CONTACT: z.string().default("set-GEOCODER_CONTACT@example.invalid"),
    GEOCODER_COUNTRY_CODES: z.string().default("ng")
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      const lowered = env.JWT_ACCESS_SECRET.toLowerCase();
      if (PLACEHOLDER_SECRETS.some((p) => lowered.includes(p))) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_ACCESS_SECRET"],
          message: "Replace the placeholder secret in production"
        });
      }
      // The credentials docker-compose.yml and .env.example ship with are public knowledge.
      const devCredentials = [
        ["DATABASE_URL", env.DATABASE_URL, "sidewalk_dev_only"],
        ["S3_ACCESS_KEY_ID", env.S3_ACCESS_KEY_ID ?? "", "sidewalk-dev"],
        ["S3_SECRET_ACCESS_KEY", env.S3_SECRET_ACCESS_KEY ?? "", "sidewalk-dev-secret"]
      ] as const;
      for (const [name, value, known] of devCredentials) {
        if (value.includes(known)) {
          ctx.addIssue({
            code: "custom",
            path: [name],
            message:
              "This is the development credential from docker-compose; set a real one for production"
          });
        }
      }
      if (!env.WEB_ORIGIN.startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          path: ["WEB_ORIGIN"],
          message:
            "WEB_ORIGIN must be an https:// URL in production: emailed links are built from it"
        });
      }
      if (/^(127\.|localhost$|::1$|0\.0\.0\.0$)/.test(env.SMTP_HOST)) {
        ctx.addIssue({
          code: "custom",
          path: ["SMTP_HOST"],
          message:
            "SMTP_HOST points at this machine. Configure a real SMTP or transactional-email service"
        });
      }
      if (/@[^>]*\.(test|invalid|example|localhost)\b/i.test(env.EMAIL_FROM)) {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_FROM"],
          message: "EMAIL_FROM must use a real sending domain (with SPF, DKIM and DMARC)"
        });
      }
      if (!env.INTERNAL_PROXY_SECRET && env.TRUST_PROXY === "false") {
        ctx.addIssue({
          code: "custom",
          path: ["INTERNAL_PROXY_SECRET"],
          message:
            "Set INTERNAL_PROXY_SECRET (shared with the web server) or TRUST_PROXY, otherwise every visitor shares one rate-limit bucket"
        });
      }
      if (!env.RATE_LIMIT_ENABLED || env.RATE_LIMIT_MULTIPLIER > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["RATE_LIMIT_ENABLED"],
          message: "Rate limiting must stay enabled at its default strength in production"
        });
      }
      if (env.COOKIE_SECURE === false) {
        ctx.addIssue({
          code: "custom",
          path: ["COOKIE_SECURE"],
          message: "Cookies must be Secure in production"
        });
      }
      if (
        env.GEOCODER_PROVIDER === "nominatim" &&
        env.GEOCODER_BASE_URL.includes("nominatim.openstreetmap.org")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["GEOCODER_PROVIDER"],
          message:
            "The public OpenStreetMap Nominatim server must not be used in production. Point GEOCODER_BASE_URL at your own instance or a commercial provider, or set GEOCODER_PROVIDER=none."
        });
      }
    }
    const { keys, problems } = parseOutboxKeys(env.OUTBOX_ENCRYPTION_KEYS);
    for (const message of problems)
      ctx.addIssue({ code: "custom", path: ["OUTBOX_ENCRYPTION_KEYS"], message });
    if (env.NODE_ENV === "production" && keys.length === 0 && problems.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["OUTBOX_ENCRYPTION_KEYS"],
        message:
          "Required in production: generate one with `pnpm outbox:keys generate` and keep it in your secret manager, separate from database backups"
      });
    }
    if (env.STORAGE_DRIVER === "s3" && !env.S3_ACCESS_KEY_ID) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_ACCESS_KEY_ID"],
        message: "Required when STORAGE_DRIVER=s3"
      });
    }
    if (env.STORAGE_DRIVER === "s3" && !env.S3_SECRET_ACCESS_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_SECRET_ACCESS_KEY"],
        message: "Required when STORAGE_DRIVER=s3"
      });
    }
  });

export type AppEnv = Omit<z.infer<typeof schema>, "COOKIE_SECURE" | "SWAGGER_ENABLED"> & {
  COOKIE_SECURE: boolean;
  SWAGGER_ENABLED: boolean;
  isProduction: boolean;
};

export const APP_ENV = Symbol("APP_ENV");

/** Parses and validates the environment at startup. Throws with a readable list of every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`
    );
    throw new Error(
      `Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example for every variable.`
    );
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === "production";
  return {
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? isProduction,
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? !isProduction,
    isProduction
  };
}

/** Loads the repo-root .env (or DOTENV_CONFIG_PATH) without overriding real environment variables. */
export function loadDotenvFile(): void {
  const file = process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../../../.env");
  loadDotenv({ path: file, quiet: true });
}
