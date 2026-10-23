import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { parse } from "dotenv";
import { tokenIn, waitForMail } from "./mail";

const env = parse(readFileSync(path.resolve(__dirname, "../../../.env.e2e")));
export const SEED_PASSWORD = env.SEED_PASSWORD as string;
export const MODERATOR = { email: "moderator@sidewalk.test", password: SEED_PASSWORD };
export const ADMIN = { email: "admin@sidewalk.test", password: SEED_PASSWORD };
export const fixture = (name: string) => path.resolve(__dirname, "fixtures", name);

let counter = 0;
export function uniqueUser(label = "citizen") {
  counter += 1;
  const id = `${Date.now().toString(36)}${counter}`;
  return {
    name: `E2E ${label} ${id}`,
    email: `${label}.${id}@e2e.sidewalk.test`,
    password: `Journey-pass-${id}-Zq9`
  };
}

/**
 * Creates an account the way a person does: sign up, open the emailed link, confirm, sign in. It uses the real
 * API and the real mail sink, and leaves the page signed in with a confirmed address.
 */
export async function registerViaApi(
  page: Page,
  user = uniqueUser(),
  options: { confirm?: boolean } = {}
) {
  const res = await page.request.post("/api/v1/auth/register", {
    data: { email: user.email, displayName: user.name, password: user.password }
  });
  expect(res.status(), await res.text()).toBe(202);
  if (options.confirm !== false) {
    const mail = await waitForMail(user.email, /Confirm your email/);
    const confirm = await page.request.post("/api/v1/auth/verification/confirm", {
      data: { token: tokenIn(mail) }
    });
    expect(confirm.status(), await confirm.text()).toBe(200);
  }
  const login = await page.request.post("/api/v1/auth/login", {
    data: { email: user.email, password: user.password }
  });
  expect(login.status(), await login.text()).toBe(200);
  return user;
}

export async function signInViaUi(
  page: Page,
  creds: { email: string; password: string },
  next?: string
) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email address").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Signing in is a full page navigation: wait for it to land before the test does anything else.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** A complete, valid report-creation body for hitting the API directly. */
export function reportBody() {
  return {
    title: "Large pothole outside the primary school",
    description:
      "The pothole is about a metre wide and fills with water after rain. Motorcycles swerve around it.",
    categorySlug: "roads-and-potholes",
    latitude: 6.5244,
    longitude: 3.3792,
    addressText: "Outside the primary school gate",
    areaName: "Yaba, Lagos",
    clientRequestId: crypto.randomUUID()
  };
}

export async function signOutViaApi(page: Page) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === "sw_csrf")?.value ?? "";
  await page.request.post("/api/v1/auth/logout", { data: {}, headers: { "x-csrf-token": csrf } });
  await page.context().clearCookies();
}

/** Opens the report form and waits until React has taken over (the Continue button is disabled until then). */
export async function openReportForm(page: Page) {
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "What is the problem?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue/ })).toBeEnabled();
}

export interface ReportInput {
  title: string;
  description: string;
  category?: string;
  latitude?: string;
  longitude?: string;
  address?: string;
  photos?: string[];
  showName?: boolean;
}

/** Walks the guided report form with typed coordinates (the keyboard-accessible path) and returns the reference. */
export async function fileReport(page: Page, input: ReportInput): Promise<string> {
  await openReportForm(page);
  await page
    .getByRole("radio", { name: new RegExp(input.category ?? "Roads and potholes") })
    .check();
  await page.getByLabel("Title").fill(input.title);
  await page.getByLabel("Describe what you saw").fill(input.description);
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByRole("heading", { name: "Where is it?" })).toBeFocused();
  await page.getByLabel("Latitude").fill(input.latitude ?? "6.5244");
  await page.getByLabel("Longitude").fill(input.longitude ?? "3.3792");
  if (input.address) await page.getByLabel("Street, landmark or directions").fill(input.address);
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByRole("heading", { name: "Add photographs" })).toBeFocused();
  if (input.photos?.length) {
    await page.locator('input[type="file"]').setInputFiles(input.photos);
    await expect(
      page.getByRole("list", { name: "Selected photographs" }).getByRole("listitem")
    ).toHaveCount(input.photos.length);
  }
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByRole("heading", { name: "Check it, then send it" })).toBeFocused();
  if (input.showName) await page.getByLabel("Show my name on this report").check();
  await page.getByRole("button", { name: "Send report" }).click();

  const ref = page.getByTestId("reference");
  await expect(ref).toBeVisible({ timeout: 30_000 });
  return (await ref.textContent())!.trim();
}

import type { Browser, BrowserContext } from "@playwright/test";

/** A second, independent browser session (a different person) sharing nothing with the first. */
export async function newActor(
  browser: Browser,
  baseURL: string | undefined
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    locale: "en-NG",
    timezoneId: "Africa/Lagos",
    viewport: { width: 1280, height: 860 }
  });
  return { context, page: await context.newPage() };
}
