import { expect, test, type Page } from "@playwright/test";
import {
  MODERATOR,
  fileReport,
  fixture,
  newActor,
  openReportForm,
  registerViaApi,
  signInViaUi,
  uniqueUser
} from "./helpers";
import { linkIn, waitForMail } from "./mail";

/** Runs on a phone-sized viewport with touch input. */
async function expectNoHorizontalScroll(page: Page, label: string) {
  // Compare with the device width, not window.innerWidth: a phone browser widens its layout viewport to fit
  // overflowing content, which would make innerWidth grow with the problem and hide it.
  const device = page.viewportSize()!.width;
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${label} is ${width}px wide on a ${device}px screen`).toBeLessThanOrEqual(device);
}

test.describe("essential workflows on a phone", () => {
  test("navigation menu opens, is keyboard-closable and reaches pages", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page, "home");
    await page.getByRole("button", { name: "Menu" }).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("link", { name: "Explore issues" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Report an issue" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Explore issues" }).click();
    await expect(page).toHaveURL(/\/issues$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("public pages do not overflow and controls are comfortably sized", async ({ page }) => {
    for (const path of [
      "/",
      "/issues",
      "/issues?view=map",
      "/issues/SW-SD0001",
      "/how-it-works",
      "/accountability",
      "/login",
      "/register"
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page, path);
    }
    await page.goto("/issues");
    const tooSmall = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "main button, main input:not([type=hidden]), main select, header a[href]"
        )
      ]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({
          name: el.textContent?.trim().slice(0, 20) || el.getAttribute("name"),
          h: el.getBoundingClientRect().height
        }))
        .filter((e) => e.h > 0 && e.h < 36)
    );
    expect(tooSmall).toEqual([]);
  });

  test("a citizen can register, report with a photograph, and follow it on a phone", async ({
    page
  }) => {
    await page.goto("/register");
    const user = uniqueUser("phone");
    await page.getByLabel("Your name").fill(user.name);
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/verify-email\?sent=1/);
    await expectNoHorizontalScroll(page, "check your email");

    // Confirm from the emailed link, on the phone, then sign in.
    const mail = await waitForMail(user.email, /Confirm your email/);
    await page.goto(linkIn(mail));
    await expectNoHorizontalScroll(page, "confirm email");
    await page.getByRole("button", { name: "Confirm my email address" }).click();
    await expect(page.getByText("Your email address is confirmed")).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).first().click();
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/report$/);
    await page.goto("/dashboard");
    await expectNoHorizontalScroll(page, "dashboard (empty)");

    const title = `Phone report: broken streetlight ${Date.now().toString(36)}`;
    await openReportForm(page);
    await expectNoHorizontalScroll(page, "report step 1");
    const ref = await fileReport(page, {
      title,
      description:
        "The streetlight at the junction has been dark for two weeks and the crossing is unsafe at night.",
      category: "Streetlights and power",
      latitude: "9.0765",
      longitude: "7.4721",
      photos: [fixture("pothole-1.png")]
    });
    await expectNoHorizontalScroll(page, "report confirmation");
    await page.getByRole("link", { name: "View your report" }).click();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page, "report detail");

    await page.goto("/dashboard");
    await expect(page.getByRole("article").filter({ hasText: title })).toBeVisible();
    await expectNoHorizontalScroll(page, "dashboard");

    await page.goto(`/issues?q=${ref}`);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  test("the guided form stays usable with the on-screen keyboard open", async ({ page }) => {
    await registerViaApi(page);
    await openReportForm(page);
    await page.getByRole("radio", { name: /Water supply/ }).check();
    // Fields scroll into view rather than hiding under the sticky area.
    await page.getByLabel("Title").tap();
    await page.getByLabel("Title").fill("No water for two weeks in our street");
    await expect(page.getByLabel("Title")).toBeInViewport();
    await expectNoHorizontalScroll(page, "report form with focus");
  });
  test("a forgotten password can be reset from a phone, and the new pages fit the screen", async ({
    page,
    browser,
    baseURL
  }) => {
    const user = await registerViaApi(page, uniqueUser("phone-reset"));
    await page.context().clearCookies();

    for (const path of [
      "/forgot-password",
      "/verify-email",
      "/verify-email/confirm",
      "/reset-password"
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page, path);
    }

    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot your password?" }).tap();
    // The sign-in form has an email field too, so wait for the new page before typing.
    await expect(
      page.getByRole("heading", { name: "Forgot your password?", level: 1 })
    ).toBeVisible();
    await page.getByLabel("Email address").fill(user.email);
    await expect(page.getByLabel("Email address")).toBeInViewport();
    await page.getByRole("button", { name: "Send the link" }).tap();
    await expect(
      page.getByText("If there is an account for that address, a link is on its way")
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "forgot password (sent)");

    const mail = await waitForMail(user.email, /Reset your Sidewalk password/);
    await page.goto("about:blank");
    await page.goto(linkIn(mail));
    await expect(
      page.getByRole("heading", { name: "Choose a new password", level: 1 })
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "reset form");

    // Every control on the form is a comfortable touch target.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main button, main input:not([type=hidden])")]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({
          name: el.getAttribute("name") ?? el.textContent?.trim().slice(0, 20),
          h: el.getBoundingClientRect().height
        }))
        .filter((e) => e.h > 0 && e.h < 40)
    );
    expect(small).toEqual([]);

    const fresh = "A-phone-sized-passphrase-77";
    await page.getByLabel("New password").fill(fresh);
    await page.getByLabel("Type it again").fill(fresh);
    await page.getByRole("button", { name: "Change my password" }).tap();
    await expect(page.getByText("Your password has been changed")).toBeVisible();
    await waitForMail(user.email, /password was changed/i);

    await page.goto("/login");
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password").fill(fresh);
    await page.getByRole("button", { name: "Sign in" }).tap();
    await expect(page).toHaveURL(/\/dashboard$/);
    void browser;
    void baseURL;
  });

  test("the notification centre works on a phone: bell, list, mark read, preferences", async ({
    page,
    browser,
    baseURL
  }) => {
    await registerViaApi(page, uniqueUser("phone-notified"));
    const reference = await fileReport(page, {
      title: "Cracked paving slab at the clinic gate",
      description:
        "A paving slab at the clinic gate has cracked and tilts under foot, a hazard for patients on crutches."
    });
    const staff = await newActor(browser, baseURL);
    await signInViaUi(staff.page, MODERATOR);
    await staff.page.goto(`/issues/${reference}`);
    await staff.page.getByLabel("New status").selectOption({ label: "Acknowledged" });
    await staff.page
      .getByLabel("Public note")
      .fill("Inspected; repair scheduled with the works team.");
    await staff.page.getByRole("button", { name: "Record status change" }).click();
    await expect(staff.page.getByText("Status changed to Acknowledged.")).toBeVisible();
    await staff.context.close();

    await page.goto("/dashboard");
    const bell = page.getByRole("banner").getByRole("link", { name: /^Notifications/ });
    await expect(bell).toHaveAccessibleName("Notifications, 1 unread");
    const box = await bell.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);

    await bell.tap();
    await expect(page).toHaveURL(/\/notifications$/);
    await expectNoHorizontalScroll(page, "notifications");
    const item = page.getByRole("listitem").filter({ hasText: `${reference} is now` });
    await expect(item.getByText("Unread", { exact: true })).toBeVisible();
    await item.getByRole("button", { name: /Mark as read/ }).tap();
    await expect(page.getByText("You are all caught up.")).toBeVisible();
    await expect(bell).toHaveAccessibleName("Notifications");

    await page.getByRole("link", { name: "Email settings" }).tap();
    await expect(page).toHaveURL(/\/account/);
    await expectNoHorizontalScroll(page, "account email settings");
    const box2 = page
      .locator("section[aria-labelledby=notifications]")
      .getByLabel("A report I filed or follow changes status");
    await box2.scrollIntoViewIfNeeded();
    await expect(box2).toBeVisible();
  });

  test("an unconfirmed account sees the banner on a phone without layout overflow", async ({
    page
  }) => {
    await registerViaApi(page, uniqueUser("phone-pending"), { confirm: false });
    for (const path of ["/", "/issues", "/verify-email"]) {
      await page.goto(path);
      await expect(page.getByRole("region", { name: "Email confirmation needed" })).toBeVisible();
      await expectNoHorizontalScroll(page, `${path} with banner`);
    }
  });
  test("the header and every new page fit a 360px screen, signed out and signed in", async ({
    page
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of [
      "/",
      "/issues",
      "/login",
      "/register",
      "/forgot-password",
      "/verify-email",
      "/reset-password"
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page, `${path} (signed out)`);
    }
    await registerViaApi(page, uniqueUser("narrow"), { confirm: false });
    for (const path of [
      "/",
      "/issues",
      "/dashboard",
      "/notifications",
      "/account",
      "/verify-email"
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page, `${path} (signed in)`);
    }
    const header = page.getByRole("banner");
    await expect(header.getByRole("button", { name: "Menu" })).toBeInViewport({ ratio: 1 });
    await expect(header.getByRole("link", { name: /^Notifications/ })).toBeInViewport({ ratio: 1 });
  });
});
