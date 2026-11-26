import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { parse } from "dotenv";

/**
 * End-to-end tests run the real stack: a production build of the web app, the compiled NestJS API,
 * the Postgres database `sidewalk_e2e` and the S3-compatible store. Nothing is mocked.
 * Prerequisite: `pnpm infra:up` (Docker). Chrome is used from the machine; CI installs Chromium.
 */
const root = path.resolve(__dirname, "../..");
const envFile = path.join(root, ".env.e2e");
const e2eEnv = parse(readFileSync(envFile));
const apiPort = e2eEnv.API_PORT ?? "4020";
const webPort = new URL(e2eEnv.WEB_ORIGIN ?? "http://localhost:3020").port;

const sharedEnv = {
  ...(process.env as Record<string, string>),
  ...e2eEnv,
  DOTENV_CONFIG_PATH: envFile
};

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? e2eEnv.WEB_ORIGIN ?? "http://localhost:3020",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-NG",
    timezoneId: "Africa/Lagos",
    ...(process.env.CI ? {} : { channel: "chrome" })
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 860 },
        ...(process.env.CI ? {} : { channel: "chrome" })
      }
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"], ...(process.env.CI ? {} : { channel: "chrome" }) }
    }
  ],
  // Set E2E_BASE_URL to point the tests at servers you already run (for example `pnpm dev`) and skip the build.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command:
            "pnpm --filter @sidewalk/contracts build && pnpm --filter @sidewalk/api build:e2e && pnpm --filter @sidewalk/api db:migrate && pnpm --filter @sidewalk/api db:truncate-test && pnpm --filter @sidewalk/api db:seed && pnpm --filter @sidewalk/api start:e2e",
          cwd: root,
          url: `http://127.0.0.1:${apiPort}/api/v1/health/ready`,
          env: sharedEnv,
          timeout: 240_000,
          reuseExistingServer: false,
          stdout: "pipe",
          stderr: "pipe"
        },
        {
          command: `pnpm --filter @sidewalk/web exec next build && pnpm --filter @sidewalk/web exec next start --port ${webPort}`,
          cwd: root,
          url: `http://127.0.0.1:${webPort}/`,
          env: { ...sharedEnv, NODE_ENV: "production", NEXT_DIST_DIR: ".next-e2e" },
          timeout: 360_000,
          reuseExistingServer: false,
          stdout: "pipe",
          stderr: "pipe"
        }
      ]
});
