import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, type Browser, type Page } from "@playwright/test";
import {
  ADMIN,
  MODERATOR,
  fileReport,
  fixture,
  openReportForm,
  registerViaApi,
  signInViaUi,
  uniqueUser
} from "./helpers";
import { linkIn, waitForMail } from "./mail";

/**
 * Captures the running application for the visual review. Run with SCREENSHOTS=1.
 * Output goes to docs/visual-review/{desktop,mobile}.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture the visual review");

const out = path.resolve(__dirname, "../../../docs/visual-review");

async function shot(page: Page, size: "desktop" | "mobile", name: string, fullPage = true) {
  await page.waitForLoadState("networkidle");
  // Scroll through the page so lazy-loaded images and maps are painted before the capture.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
  mkdirSync(path.join(out, size), { recursive: true });
  await page.screenshot({ path: path.join(out, size, `${name}.png`), fullPage });
}

/** The account-lifecycle and notification screens, in the states a person actually meets them. */
async function captureLifecycle(
  browser: Browser,
  baseURL: string | undefined,
  size: "desktop" | "mobile",
  viewport: { width: number; height: number }
) {
  const open = async () => {
    const context = await browser.newContext({
      baseURL,
      viewport,
      deviceScaleFactor: 1,
      isMobile: size === "mobile",
      hasTouch: size === "mobile",
      locale: "en-NG"
    });
    return { context, page: await context.newPage() };
  };

  const a = await open();
  const pending = await registerViaApi(a.page, uniqueUser("review"), { confirm: false });
  await a.page.goto("/verify-email");
  await shot(a.page, size, "19-verify-email-pending");
  const confirmation = await waitForMail(pending.email, /Confirm your email/);
  await a.page.goto("about:blank");
  await a.page.goto(linkIn(confirmation));
  await a.page.getByRole("button", { name: "Confirm my email address" }).waitFor();
  await shot(a.page, size, "20-verify-email-ready");
  await a.page.getByRole("button", { name: "Confirm my email address" }).click();
  await a.page.getByText("Your email address is confirmed").waitFor();
  await shot(a.page, size, "21-verify-email-done");

  await a.page.context().clearCookies();
  await a.page.goto("/forgot-password");
  await shot(a.page, size, "22-forgot-password");
  await a.page.getByLabel("Email address").fill(pending.email);
  await a.page.getByRole("button", { name: "Send the link" }).click();
  await a.page.getByText("If there is an account for that address, a link is on its way").waitFor();
  await shot(a.page, size, "23-forgot-password-sent");
  const reset = await waitForMail(pending.email, /Reset your Sidewalk password/);
  await a.page.goto("about:blank");
  await a.page.goto(linkIn(reset));
  await a.page.getByRole("heading", { name: "Choose a new password", level: 1 }).waitFor();
  await shot(a.page, size, "24-reset-password");
  await a.page.goto("about:blank");
  await a.page.goto("/reset-password");
  await a.page.getByText("This link is incomplete").waitFor();
  await shot(a.page, size, "25-reset-password-bad-link");
  await a.context.close();

  const owner = await open();
  await registerViaApi(owner.page, uniqueUser("notified"));
  const reference = await fileReport(owner.page, {
    title: "Broken water standpipe on Ojo Road",
    description:
      "The standpipe has been leaking for a week and the nearest working tap is a long walk away."
  });
  const staff = await open();
  await signInViaUi(staff.page, MODERATOR);
  await staff.page.goto(`/issues/${reference}`);
  await staff.page.getByLabel("New status").selectOption({ label: "Acknowledged" });
  await staff.page
    .getByLabel("Public note")
    .fill("Confirmed with the water board; a crew is assigned.");
  await staff.page.getByRole("button", { name: "Record status change" }).click();
  await staff.page.getByText("Status changed to Acknowledged.").waitFor();
  await staff.context.close();
  await owner.page.goto("/notifications");
  await owner.page.getByRole("link", { name: new RegExp(`${reference} is now`) }).waitFor();
  await shot(owner.page, size, "26-notifications");
  await owner.page.goto("/account#notifications");
  await shot(owner.page, size, "27-account-email-settings");
  await owner.context.close();

  const admin = await open();
  await signInViaUi(admin.page, ADMIN);
  await admin.page.goto("/admin/email");
  await shot(admin.page, size, "28-admin-email-delivery");
  await admin.context.close();
}

for (const [size, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }]
] as const) {
  test(`capture ${size}`, async ({ browser, baseURL }) => {
    test.setTimeout(240_000); // a full walk through the product, scrolling every page
    const context = await browser.newContext({
      baseURL,
      viewport,
      deviceScaleFactor: 1,
      isMobile: size === "mobile",
      hasTouch: size === "mobile",
      locale: "en-NG"
    });
    const page = await context.newPage();

    await page.goto("/");
    await shot(page, size, "01-home");
    await page.goto("/issues");
    await shot(page, size, "02-explore-list");
    await page.goto("/issues?view=map");
    await shot(page, size, "03-explore-map");
    await page.goto("/issues/SW-SD0001");
    await shot(page, size, "04-issue-detail");
    await page.goto("/issues/SW-SD0006");
    await shot(page, size, "05-issue-resolved");
    await page.goto("/how-it-works");
    await shot(page, size, "06-how-it-works");
    await page.goto("/accountability");
    await shot(page, size, "07-accountability");
    await page.goto("/register");
    await shot(page, size, "08-register");

    await registerViaApi(page);
    await openReportForm(page);
    await shot(page, size, "09-report-step1");
    await page.getByRole("radio", { name: /Roads and potholes/ }).check();
    await page.getByLabel("Title").fill("Deep pothole at the junction near the market");
    await page
      .getByLabel("Describe what you saw")
      .fill("The pothole has grown over three weeks and now takes up half of the lane.");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Latitude").fill("6.5244");
    await page.getByLabel("Longitude").fill("3.3792");
    await page.waitForTimeout(1200);
    await shot(page, size, "10-report-step2-location");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles([fixture("pothole-1.png"), fixture("pothole-2.png")]);
    await shot(page, size, "11-report-step3-photos");
    await page.getByRole("button", { name: /Continue/ }).click();
    await shot(page, size, "12-report-step4-review");
    await page.getByRole("button", { name: "Send report" }).click();
    await page.getByTestId("reference").waitFor();
    await shot(page, size, "13-report-confirmation");
    await page.goto("/dashboard");
    await shot(page, size, "14-dashboard");
    await page.goto("/account");
    await shot(page, size, "15-account");
    await context.close();

    const staff = await browser.newContext({
      baseURL,
      viewport,
      deviceScaleFactor: 1,
      isMobile: size === "mobile",
      hasTouch: size === "mobile",
      locale: "en-NG"
    });
    const sp = await staff.newPage();
    await signInViaUi(sp, MODERATOR);
    await sp.waitForURL(/dashboard/);
    await sp.goto("/admin");
    await shot(sp, size, "16-moderation-queue");
    await sp.goto("/admin/reports");
    await shot(sp, size, "17-moderation-reports");
    await sp.goto("/issues/SW-SD0001");
    await shot(sp, size, "18-issue-detail-staff");
    await staff.close();

    await captureLifecycle(browser, baseURL, size, viewport);
  });
}
