import { expect, test } from "@playwright/test";
import { fixture, openReportForm, registerViaApi, uniqueUser } from "./helpers";
import { waitForMail } from "./mail";

test.describe("forms report problems clearly", () => {
  test("registration validates on the client and the server", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Your name must be at least 2 characters.")).toBeVisible();
    await expect(page.getByText("Enter your email address.")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();

    await page.getByLabel("Your name").fill("Ada Obi");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
    // Errors are linked to their fields for screen readers.
    await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Email address").fill(uniqueUser("weak").email);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(
      page.getByText("That password is too common. Choose something harder to guess.")
    ).toBeVisible();
  });

  test("an existing email gets the same sign-up answer as a new one, and login errors never say which part was wrong", async ({
    page,
    browser,
    baseURL
  }) => {
    const user = uniqueUser("dupe");
    const first = await browser.newContext({ baseURL });
    await registerViaApi(await first.newPage(), user);
    await first.close();

    await page.goto("/register");
    await page.getByLabel("Your name").fill(user.name);
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();
    // Same screen as for a brand-new address: the form cannot be used to find out who has an account.
    await expect(page).toHaveURL(/\/verify-email\?sent=1/);
    await expect(page.getByRole("heading", { name: "Check your email", level: 1 })).toBeVisible();
    // The real owner of the address is told, instead.
    const notice = await waitForMail(user.email, /Someone tried to create a Sidewalk account/);
    expect(notice.text).toContain("You already have a Sidewalk account");
    expect(notice.text).not.toContain(user.password);

    await page.goto("/login");
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password").fill("Wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    const failure = page.getByRole("alert").filter({ hasText: "Email or password is incorrect." });
    await expect(failure).toBeVisible();
    await page.getByLabel("Email address").fill("nobody.here@e2e.sidewalk.test");
    await page.getByRole("button", { name: "Sign in" }).click();
    // The same message appears for an account that does not exist, so nobody can probe for registered emails.
    await expect(failure).toBeVisible();
    await expect(failure).toHaveText(/^Email or password is incorrect\.$/);
  });

  test("the report form blocks empty steps and explains what to fix", async ({ page }) => {
    await registerViaApi(page);
    await openReportForm(page);
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText("Choose the category that fits best.")).toBeVisible();
    await expect(page.getByText(/Give the report a short, specific title/)).toBeVisible();
    await expect(page.getByText(/Describe what is wrong in at least 20 characters/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "What is the problem?" })).toBeVisible();

    await page.getByRole("radio", { name: /Flooding and drainage/ }).check();
    await page.getByLabel("Title").fill("Blocked drain floods the road");
    await page
      .getByLabel("Describe what you saw")
      .fill("The drain is blocked with silt and plastic, so water covers the road.");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Where is it?" })).toBeVisible();

    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /Place the pin on the map/ })
    ).toBeVisible();
    await page.getByLabel("Latitude").fill("99");
    await page.getByLabel("Longitude").fill("3.3");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /Place the pin on the map/ })
    ).toBeVisible();
    await page.getByLabel("Latitude").fill("6.45");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Add photographs" })).toBeVisible();
    // Continuing past the photographs step must go to the review step and must NOT send the report.
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Check it, then send it" })).toBeVisible();
    await page.waitForTimeout(600);
    expect(
      await page.request
        .get("/api/v1/reports?q=Blocked+drain+floods+the+road")
        .then((r) => r.json())
        .then((j) => j.total)
    ).toBe(0);
  });

  test("unsupported and oversized photographs are refused before upload", async ({ page }) => {
    await registerViaApi(page);
    await openReportForm(page);
    await page.getByRole("radio", { name: /Roads and potholes/ }).check();
    await page.getByLabel("Title").fill("Photo validation check report");
    await page
      .getByLabel("Describe what you saw")
      .fill("Checking that files are validated on the device before any upload happens.");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Latitude").fill("6.5");
    await page.getByLabel("Longitude").fill("3.4");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Add photographs" })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(fixture("notes.txt"));
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "only JPEG, PNG or WebP photographs can be uploaded" })
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Selected photographs" })).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles({
      name: "huge.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(9 * 1024 * 1024, 1)
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "over the 8.0 MB limit" })
    ).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(fixture("pothole-1.png"));
    await expect(
      page.getByRole("list", { name: "Selected photographs" }).getByRole("listitem")
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Remove pothole-1.png" }).click();
    await expect(page.getByRole("list", { name: "Selected photographs" })).toHaveCount(0);
  });

  test("a failing server or network never loses the report, and retrying never duplicates it", async ({
    page
  }) => {
    await registerViaApi(page);
    await openReportForm(page);
    await page.getByRole("radio", { name: /Waste and sanitation/ }).check();
    await page.getByLabel("Title").fill("Refuse heap beside the market gate");
    await page
      .getByLabel("Describe what you saw")
      .fill("Refuse has not been collected for three weeks and now blocks half the footpath.");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Latitude").fill("9.0792");
    await page.getByLabel("Longitude").fill("7.4745");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Add photographs" })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Check it, then send it" })).toBeVisible();

    let mode: "server" | "offline" | "ok" = "server";
    await page.route("**/api/v1/reports", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      if (mode === "server") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 500,
            code: "INTERNAL_ERROR",
            message: "Something went wrong on our side. Please try again.",
            timestamp: new Date().toISOString(),
            path: "/api/v1/reports"
          })
        });
      }
      if (mode === "offline") return route.abort("connectionrefused");
      return route.continue();
    });

    await page.getByRole("button", { name: "Send report" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Something went wrong on our side." })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Check it, then send it" })).toBeVisible();

    mode = "offline";
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /offline, or Sidewalk is unreachable/ })
    ).toBeVisible();

    mode = "ok";
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByTestId("reference")).toBeVisible();
    const ref = (await page.getByTestId("reference").textContent())!.trim();

    // Submit-twice protection: replaying the same form request id returns the same report.
    const search = await page.request.get(`/api/v1/reports?q=${ref}`);
    expect((await search.json()).total).toBe(1);
  });

  test("a missing page and an unknown reference show helpful not-found pages", async ({ page }) => {
    const res = await page.goto("/issues/SW-AAAAAA");
    expect(res?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: /no public report with that reference/ })
    ).toBeVisible();
    const missing = await page.goto("/no/such/page");
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Explore public reports" })).toBeVisible();
  });
});
