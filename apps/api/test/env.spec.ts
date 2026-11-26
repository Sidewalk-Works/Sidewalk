import { loadEnv } from "../src/config/env";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_ACCESS_SECRET: "k8fj2h3g4k5j6h7g8f9d0s1a2q3w4e5r6t7y8u9i",
  STORAGE_DRIVER: "local",
  GEOCODER_PROVIDER: "none"
};

describe("environment validation", () => {
  it("accepts a valid development configuration with safe defaults", () => {
    const env = loadEnv({ ...base, NODE_ENV: "development" });
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.RATE_LIMIT_ENABLED).toBe(true);
  });

  it("lists every problem at once, and names the variable", () => {
    expect(() => loadEnv({ NODE_ENV: "development" })).toThrow(
      /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/
    );
    expect(() => loadEnv({ ...base, NODE_ENV: "development", STORAGE_DRIVER: "s3" })).toThrow(
      /S3_ACCESS_KEY_ID[\s\S]*S3_SECRET_ACCESS_KEY/
    );
  });

  it("rejects short secrets", () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: "too-short" })).toThrow(
      /at least 32 characters/
    );
  });

  describe("RATE_LIMIT_STORE_TIMEOUT_MS", () => {
    it("defaults to 750 ms and accepts values from 50 to 10000", () => {
      expect(loadEnv({ ...base }).RATE_LIMIT_STORE_TIMEOUT_MS).toBe(750);
      expect(
        loadEnv({ ...base, RATE_LIMIT_STORE_TIMEOUT_MS: "50" }).RATE_LIMIT_STORE_TIMEOUT_MS
      ).toBe(50);
      expect(
        loadEnv({ ...base, RATE_LIMIT_STORE_TIMEOUT_MS: "10000" }).RATE_LIMIT_STORE_TIMEOUT_MS
      ).toBe(10000);
    });

    it("rejects values that are too small, too large, fractional or not numbers, naming the variable", () => {
      for (const bad of ["49", "0", "-5", "10001", "1.5", "fast", ""]) {
        expect(() => loadEnv({ ...base, RATE_LIMIT_STORE_TIMEOUT_MS: bad })).toThrow(
          /RATE_LIMIT_STORE_TIMEOUT_MS/
        );
      }
    });
  });

  describe("in production", () => {
    const prod = {
      ...base,
      NODE_ENV: "production",
      INTERNAL_PROXY_SECRET: "internal-proxy-secret-0123456789abcdef-xyz",
      WEB_ORIGIN: "https://sidewalk.example.org",
      SMTP_HOST: "smtp.mail-provider.example.net",
      EMAIL_FROM: "Sidewalk <no-reply@mail.sidewalk.org>",
      OUTBOX_ENCRYPTION_KEYS: "k1:Qk1tZUJhM2o5V0Y0cEx6eDJkNUhnS3ZZczhOcjFVdDc="
    };

    it("turns on secure cookies and turns off API docs by default", () => {
      const env = loadEnv(prod);
      expect(env.COOKIE_SECURE).toBe(true);
      expect(env.SWAGGER_ENABLED).toBe(false);
    });

    it("refuses the development database password and storage keys that ship with the repository", () => {
      expect(() =>
        loadEnv({
          ...prod,
          DATABASE_URL: "postgresql://sidewalk:sidewalk_dev_only@db:5432/sidewalk"
        })
      ).toThrow(/DATABASE_URL[\s\S]*development credential/);
      expect(() =>
        loadEnv({
          ...prod,
          STORAGE_DRIVER: "s3",
          S3_ACCESS_KEY_ID: "sidewalk-dev",
          S3_SECRET_ACCESS_KEY: "sidewalk-dev-secret"
        })
      ).toThrow(/S3_ACCESS_KEY_ID[\s\S]*S3_SECRET_ACCESS_KEY/);
      // Development keeps working with them.
      expect(() =>
        loadEnv({
          ...base,
          DATABASE_URL: "postgresql://sidewalk:sidewalk_dev_only@127.0.0.1:5442/sidewalk"
        })
      ).not.toThrow();
    });

    it("refuses placeholder secrets", () => {
      expect(() =>
        loadEnv({ ...prod, JWT_ACCESS_SECRET: "replace-me-run-pnpm-env-init-aaaaaaaaaaaaaaaaaaaa" })
      ).toThrow(/placeholder/);
    });

    it("needs a way to tell visitors apart, or every visitor shares one rate-limit bucket", () => {
      const { INTERNAL_PROXY_SECRET: _omit, ...withoutSecret } = prod;
      expect(() => loadEnv(withoutSecret)).toThrow(/INTERNAL_PROXY_SECRET/);
      expect(() => loadEnv({ ...withoutSecret, TRUST_PROXY: "1" })).not.toThrow();
    });

    it("refuses email settings that would send links to nowhere or from nowhere", () => {
      expect(() => loadEnv({ ...prod, WEB_ORIGIN: "http://sidewalk.example.org" })).toThrow(
        /WEB_ORIGIN must be an https/
      );
      expect(() => loadEnv({ ...prod, SMTP_HOST: "127.0.0.1" })).toThrow(
        /SMTP_HOST points at this machine/
      );
      expect(() => loadEnv({ ...prod, SMTP_HOST: "localhost" })).toThrow(/SMTP_HOST/);
      expect(() => loadEnv({ ...prod, EMAIL_FROM: "Sidewalk <no-reply@sidewalk.test>" })).toThrow(
        /EMAIL_FROM must use a real sending domain/
      );
    });

    it("refuses to run without rate limiting", () => {
      expect(() => loadEnv({ ...prod, RATE_LIMIT_ENABLED: "false" })).toThrow(
        /Rate limiting must stay enabled/
      );
      expect(() => loadEnv({ ...prod, RATE_LIMIT_MULTIPLIER: "100" })).toThrow(
        /Rate limiting must stay enabled/
      );
    });

    it("refuses insecure cookies", () => {
      expect(() => loadEnv({ ...prod, COOKIE_SECURE: "false" })).toThrow(/Secure/);
    });

    it("refuses the public Nominatim server", () => {
      expect(() =>
        loadEnv({
          ...prod,
          GEOCODER_PROVIDER: "nominatim",
          GEOCODER_BASE_URL: "https://nominatim.openstreetmap.org"
        })
      ).toThrow(/must not be used in production/);
      expect(() =>
        loadEnv({
          ...prod,
          GEOCODER_PROVIDER: "nominatim",
          GEOCODER_BASE_URL: "https://geocode.example.org"
        })
      ).not.toThrow();
    });
  });
});
