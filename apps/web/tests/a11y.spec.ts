import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN,
  MODERATOR,
  fileReport,
  newActor,
  openReportForm,
  registerViaApi,
  signInViaUi,
  uniqueUser
} from "./helpers";
import { linkIn, tokenIn, waitForMail } from "./mail";

async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );
  const summary = serious.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} → ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`
  );
  expect(summary, `${label} has serious accessibility violations`).toEqual([]);
}

test.describe("accessibility (axe, WCAG 2.2 AA rules)", () => {
  for (const path of [
    "/",
    "/issues",
    "/issues/SW-SD0001",
    "/issues/SW-SD0006",
    "/login",
    "/register",
    "/how-it-works",
    "/accountability",
    "/guidelines",
    "/privacy",
    "/credits"
  ]) {
    test(`public page ${path}`, async ({ page }) => {
      await page.goto(path);
      await scan(page, path);
    });
  }

  test("the map view", async ({ page }) => {
    await page.goto("/issues?view=map");
    await expect(page.getByRole("heading", { name: "Reports shown on the map" })).toBeVisible();
    await scan(page, "/issues?view=map");
  });

  test("filtered, empty and error-prone states", async ({ page }) => {
    await page.goto("/issues?q=nothing-matches-this-at-all");
    await scan(page, "no results");
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your email address.")).toBeVisible();
    await scan(page, "register with errors");
    await page.goto("/nonexistent");
    await scan(page, "404");
  });

  test("signed-in pages", async ({ page }) => {
    await registerViaApi(page);
    for (const path of ["/dashboard", "/account"]) {
      await page.goto(path);
      await scan(page, path);
    }
    await openReportForm(page);
    await scan(page, "/report");
    await page.getByRole("radio", { name: /Roads and potholes/ }).check();
    await page.getByLabel("Title").fill("Accessibility scan report title");
    await page
      .getByLabel("Describe what you saw")
      .fill("Scanning each step of the form for accessibility violations with axe.");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Where is it?" })).toBeVisible();
    await scan(page, "report step 2 (location)");
    await page.getByLabel("Latitude").fill("6.5");
    await page.getByLabel("Longitude").fill("3.4");
    await page.getByRole("button", { name: /Continue/ }).click();
    await scan(page, "report step 3 (photos)");
    await page.getByRole("button", { name: /Continue/ }).click();
    await scan(page, "report step 4 (review)");
  });

  test("report detail with owner tools, and the moderation screens", async ({
    page,
    browser,
    baseURL
  }) => {
    await signInViaUi(page, MODERATOR);
    await expect(page).toHaveURL(/\/dashboard$/);
    for (const path of [
      "/issues/SW-SD0001",
      "/admin",
      "/admin/reports",
      "/admin/comments",
      "/admin/history"
    ]) {
      await page.goto(path);
      await scan(page, path);
    }
    await page.goto("/issues/SW-SD0001");
    await page.getByRole("button", { name: "Hide, remove or restore" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await scan(page, "moderation dialog");
    void browser;
    void baseURL;
  });
});

test.describe("accessibility of account recovery and notifications", () => {
  test("recovery pages in every state: asking, waiting, link problems, ready, and errors", async ({
    page
  }) => {
    for (const path of [
      "/verify-email",
      "/forgot-password",
      "/verify-email/confirm",
      "/reset-password"
    ]) {
      await page.goto(path);
      await scan(page, path);
    }

    // After asking: the neutral confirmation.
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill("someone@example.test");
    await page.getByRole("button", { name: "Send the link" }).click();
    await expect(
      page.getByText("If there is an account for that address, a link is on its way")
    ).toBeVisible();
    await scan(page, "/forgot-password (sent)");

    // A real, ready link: the explicit-click page, then the form with validation errors showing.
    const user = await registerViaApi(page, uniqueUser("a11y"), { confirm: false });
    const verify = await waitForMail(user.email, /Confirm your email/);
    await page.goto("about:blank");
    await page.goto(`/verify-email/confirm#token=${tokenIn(verify)}`);
    await expect(page.getByRole("button", { name: "Confirm my email address" })).toBeVisible();
    await scan(page, "/verify-email/confirm (ready)");
    await page.getByRole("button", { name: "Confirm my email address" }).click();
    await expect(page.getByText("Your email address is confirmed")).toBeVisible();
    await scan(page, "/verify-email/confirm (done)");

    await page.context().clearCookies();
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill(user.email);
    await page.getByRole("button", { name: "Send the link" }).click();
    const reset = await waitForMail(user.email, /Reset your Sidewalk password/);
    await page.goto("about:blank");
    await page.goto(linkIn(reset));
    await expect(
      page.getByRole("heading", { name: "Choose a new password", level: 1 })
    ).toBeVisible();
    await scan(page, "/reset-password (ready)");
    await page.getByLabel("New password").fill("one-password-here-2026");
    await page.getByLabel("Type it again").fill("a different one entirely");
    await page.getByRole("button", { name: "Change my password" }).click();
    await expect(page.getByText("The two passwords do not match.")).toBeVisible();
    await scan(page, "/reset-password (error)");
  });

  test("the unconfirmed-email banner and the pending screen", async ({ page }) => {
    await registerViaApi(page, uniqueUser("banner"), { confirm: false });
    await page.goto("/issues");
    await expect(page.getByRole("region", { name: "Email confirmation needed" })).toBeVisible();
    await scan(page, "/issues with banner");
    await page.goto("/verify-email");
    await scan(page, "/verify-email (signed in)");
  });

  test("notifications: empty, populated, unread filter, and email settings", async ({
    page,
    browser,
    baseURL
  }) => {
    await registerViaApi(page, uniqueUser("notified"));
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "No notifications yet." })).toBeVisible();
    await scan(page, "/notifications (empty)");

    const reference = await fileReport(page, {
      title: "Accessibility scan of notifications",
      description: "A report filed so that staff can act on it and produce a notification to scan."
    });
    const staff = await newActor(browser, baseURL);
    await signInViaUi(staff.page, MODERATOR);
    await staff.page.goto(`/issues/${reference}`);
    await staff.page.getByLabel("New status").selectOption({ label: "Acknowledged" });
    await staff.page.getByLabel("Public note").fill("Scanning; the note is public and short.");
    await staff.page.getByRole("button", { name: "Record status change" }).click();
    await expect(staff.page.getByText("Status changed to Acknowledged.")).toBeVisible();
    await staff.context.close();

    await page.goto("/notifications");
    await expect(page.getByRole("link", { name: new RegExp(`${reference} is now`) })).toBeVisible();
    await scan(page, "/notifications (unread item)");
    await page.goto("/notifications?filter=unread");
    await scan(page, "/notifications?filter=unread");
    await page.goto("/account");
    await scan(page, "/account (email settings)");
    await page.goto(`/issues/${reference}`);
    await scan(page, "report detail with the owner explanation");
  });

  test("email delivery admin page", async ({ page }) => {
    await signInViaUi(page, ADMIN);
    for (const path of ["/admin/email", "/admin/email?status=SENT"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Email delivery", level: 2 })).toBeVisible();
      await scan(page, path);
    }
  });
});
