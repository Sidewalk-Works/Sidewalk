import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  JWT_SECRET: z.string().min(8).default("replace-me-with-a-long-random-string"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  // #861: ALLOWED_ORIGIN must be a valid URL. A wildcard ("*") is rejected
  // because the cors() call passes this value as the origin whitelist;
  // an accidental wildcard string would not match any request origin and
  // would silently block all cross-origin requests rather than opening them.
  ALLOWED_ORIGIN: z.string().url().default("http://localhost:3000")
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  const config = parsed.data;
  // #861: Refuse to start in production if ALLOWED_ORIGIN was not explicitly
  // overridden from the localhost default — that would mean cross-origin
  // requests from the real frontend are silently blocked.
  if (
    config.APP_ENV === "production" &&
    config.ALLOWED_ORIGIN === "http://localhost:3000"
  ) {
    throw new Error(
      "ALLOWED_ORIGIN must be explicitly set in production (got the localhost default)."
    );
  }
  return config;
}

export const env: Env = loadEnv();
