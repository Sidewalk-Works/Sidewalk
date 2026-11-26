import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  ADMIN,
  MODERATOR,
  fileReport,
  newActor,
  registerViaApi,
  signInViaUi,
  uniqueUser
} from "./helpers";
import { expectNoMail, urlsIn, waitForMail } from "./mail";

/** A moderator changes a report's status through the real staff tools, in their own browser session. */
async function staffSetsStatus(
  browser: Browser,
  baseURL: string | undefined,
  reference: string,
  label: string,
  note: string
) {
  const staff = await newActor(browser, baseURL);
  try {
    await signInViaUi(staff.page, MODERATOR);
    await staff.page.goto(`/issues/${reference}`);
    await staff.page.getByLabel("New status").selectOption({ label });
    await staff.page.getByLabel("Public note").fill(note);
    await staff.page.getByRole("button", { name: "Record status change" }).click();
    await expect(staff.page.getByText(`Status changed to ${label}.`)).toBeVisible();
  } finally {
    await staff.context.close();
  }
}

const bell = (page: Page) => page.getByRole("banner").getByRole("link", { name: /^Notifications/ });

test.describe("notifications", () => {
  test("an owner is told in the app and by email, and can read, unread and clear them", async ({
    page,
    browser,
    baseURL
  }) => {
    const owner = await registerViaApi(page, uniqueUser("owner"));
    const reference = await fileReport(page, {
      title: "Blocked drain floods the market road",
      description:
        "The drain beside the market has been blocked for a week and the road floods whenever it rains."
    });

    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "No notifications yet." })).toBeVisible();
    await expect(bell(page)).toHaveAccessibleName("Notifications");

    await staffSetsStatus(
      browser,
      baseURL,
      reference,
      "Acknowledged",
      "Confirmed with the ward office; the drain is on the clearing list."
    );

    // The bell announces the count in words, not only in colour.
    await page.goto("/dashboard");
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");

    await page.goto("/notifications");
    await expect(page.getByText("1 unread")).toBeVisible();
    const item = page
      .getByRole("listitem")
      .filter({ hasText: `${reference} is now “Acknowledged”` });
    await expect(item).toBeVisible();
    await expect(item.getByText("Unread", { exact: true })).toBeVisible();

    // The email arrived through the outbox, links to the report on the configured origin, and carries no secret.
    const mail = await waitForMail(owner.email, new RegExp(`${reference} is now`));
    const links = urlsIn(mail);
    expect(links.some((u) => u === `${baseURL}/issues/${reference}`)).toBe(true);
    expect(links.some((u) => u.includes("/account#notifications") || u.includes("/account"))).toBe(
      true
    );
    expect(mail.text + mail.html).not.toContain("#token=");
    expect(mail.html).toContain('lang="en"');

    // Mark as read and back, without leaving the page.
    await item.getByRole("button", { name: /Mark as read/ }).click();
    await expect(page.getByText("You are all caught up.")).toBeVisible();
    await expect(bell(page)).toHaveAccessibleName("Notifications");
    await item.getByRole("button", { name: /Mark as unread/ }).click();
    await expect(page.getByText("1 unread")).toBeVisible();

    // The unread filter, then clear everything at once.
    await page
      .getByRole("navigation", { name: "Filter notifications" })
      .getByRole("link", { name: /Unread/ })
      .click();
    await expect(page).toHaveURL(/filter=unread/);
    await expect(page.getByRole("listitem").filter({ hasText: reference })).toBeVisible();
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(page.getByRole("heading", { name: "Nothing unread." })).toBeVisible();
    await expect(bell(page)).toHaveAccessibleName("Notifications");
  });

  test("opening a notification takes you to the report and marks it read", async ({
    page,
    browser,
    baseURL
  }) => {
    await registerViaApi(page, uniqueUser("opener"));
    const reference = await fileReport(page, {
      title: "Streetlight out on the footbridge",
      description:
        "The two lights on the footbridge have been dark for ten days and people cross it in the dark."
    });
    await staffSetsStatus(
      browser,
      baseURL,
      reference,
      "Acknowledged",
      "Logged with the lighting team for this week."
    );

    await page.goto("/notifications");
    await page.getByRole("link", { name: `${reference} is now “Acknowledged”` }).click();
    await expect(page).toHaveURL(new RegExp(`/issues/${reference}$`));
    await expect(bell(page)).toHaveAccessibleName("Notifications");
  });

  test("a follower is told about changes until they stop following; an unconfirmed account cannot follow", async ({
    page,
    browser,
    baseURL
  }) => {
    const owner = await registerViaApi(page, uniqueUser("filer"));
    const reference = await fileReport(page, {
      title: "Collapsed culvert on Adeola Street",
      description:
        "Part of the culvert has collapsed into the channel and the road edge is starting to give way."
    });

    // A visitor is invited to sign in; an unconfirmed account is invited to confirm.
    const anon = await newActor(browser, baseURL);
    await anon.page.goto(`/issues/${reference}`);
    await expect(
      anon.page.getByText(/to follow this report and be told when it changes/)
    ).toBeVisible();
    await anon.context.close();

    const pending = await newActor(browser, baseURL);
    await registerViaApi(pending.page, uniqueUser("pending"), { confirm: false });
    await pending.page.goto(`/issues/${reference}`);
    await expect(
      pending.page.getByRole("link", { name: "Confirm your email" }).last()
    ).toBeVisible();
    await expect(pending.page.getByRole("button", { name: "Follow this report" })).toHaveCount(0);
    await pending.context.close();

    // The owner has no follow button, only the explanation.
    await page.goto(`/issues/${reference}`);
    await expect(
      page.getByText("You will always be notified about updates to your own report.")
    ).toBeVisible();

    const fan = await newActor(browser, baseURL);
    const follower = await registerViaApi(fan.page, uniqueUser("follower"));
    await fan.page.goto(`/issues/${reference}`);
    const follow = fan.page.getByRole("button", { name: "Follow this report" });
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    await follow.click();
    await expect(fan.page.getByRole("button", { name: "Stop following" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(
      fan.page.getByText("You will be told when its status changes or someone comments.")
    ).toBeVisible();
    await fan.page.reload();
    await expect(fan.page.getByRole("button", { name: "Stop following" })).toBeVisible();

    await staffSetsStatus(
      browser,
      baseURL,
      reference,
      "Acknowledged",
      "Seen by the works department."
    );
    await waitForMail(follower.email, new RegExp(`${reference} is now “Acknowledged”`));
    await waitForMail(owner.email, new RegExp(`${reference} is now “Acknowledged”`));
    await fan.page.goto("/notifications");
    await expect(
      fan.page.getByRole("link", { name: `${reference} is now “Acknowledged”` })
    ).toBeVisible();

    // After unfollowing, the next change reaches the owner but not the former follower.
    await fan.page.goto(`/issues/${reference}`);
    await fan.page.getByRole("button", { name: "Stop following" }).click();
    await expect(fan.page.getByRole("button", { name: "Follow this report" })).toBeVisible();
    await staffSetsStatus(
      browser,
      baseURL,
      reference,
      "In progress",
      "A crew is booked for Thursday."
    );
    await waitForMail(owner.email, new RegExp(`${reference} is now “In progress”`));
    await expectNoMail(follower.email, new RegExp(`${reference} is now “In progress”`));
    await fan.page.goto("/notifications");
    await expect(
      fan.page.getByRole("link", { name: `${reference} is now “In progress”` })
    ).toHaveCount(0);
    await fan.context.close();
  });

  test("turning off status emails keeps the in-app notice but sends no email; security email is unaffected", async ({
    page,
    browser,
    baseURL
  }) => {
    const owner = await registerViaApi(page, uniqueUser("quiet"));
    const reference = await fileReport(page, {
      title: "Open manhole near the bus stop",
      description:
        "The cover is missing from a manhole at the bus stop and children wait right beside it."
    });

    await page.goto("/account");
    const section = page.locator("section[aria-labelledby=notifications]");
    await expect(section.getByText(/Security emails are separate and always sent/)).toBeVisible();
    await section.getByLabel("A report I filed or follow changes status").uncheck();
    await section.getByRole("button", { name: "Save email settings" }).click();
    await expect(section.getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(
      page
        .locator("section[aria-labelledby=notifications]")
        .getByLabel("A report I filed or follow changes status")
    ).not.toBeChecked();

    await staffSetsStatus(
      browser,
      baseURL,
      reference,
      "Acknowledged",
      "Cover ordered; area coned off meanwhile."
    );
    await page.goto("/notifications");
    await expect(
      page.getByRole("link", { name: `${reference} is now “Acknowledged”` })
    ).toBeVisible();
    await expectNoMail(owner.email, new RegExp(`${reference} is now`));

    // The optional switch does not touch security email: a reset link still arrives.
    const visitor = await newActor(browser, baseURL);
    await visitor.page.goto("/forgot-password");
    await visitor.page.getByLabel("Email address").fill(owner.email);
    await visitor.page.getByRole("button", { name: "Send the link" }).click();
    await waitForMail(owner.email, /Reset your Sidewalk password/);
    await visitor.context.close();
  });

  test("an administrator can see email delivery health without seeing message content", async ({
    page
  }) => {
    await signInViaUi(page, ADMIN);
    await page.goto("/admin");
    await page
      .getByRole("navigation", { name: "Moderation sections" })
      .getByRole("link", { name: "Email delivery" })
      .click();
    await expect(page).toHaveURL(/\/admin\/email$/);
    await expect(page.getByRole("heading", { name: "Email delivery", level: 2 })).toBeVisible();
    for (const state of ["pending", "sending", "sent", "failed", "dead", "skipped"]) {
      await expect(page.getByText(state, { exact: true }).first()).toBeVisible();
    }
    await page
      .getByRole("navigation", { name: "Filter by delivery state" })
      .getByRole("link", { name: /sent/i })
      .click();
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    // Addresses are masked and no message body or link ever appears.
    const text = await table.innerText();
    expect(text).toMatch(/\w\*\*\*@/);
    expect(text).not.toMatch(/[\w.+-]{2,}@e2e\.sidewalk\.test/);
    expect(text).not.toContain("#token=");
  });

  test("a citizen cannot reach the email delivery page", async ({ page }) => {
    await registerViaApi(page, uniqueUser("curious"));
    const res = await page.goto("/admin/email");
    expect([403, 404]).toContain(res?.status() ?? 0);
    expect((await page.request.get("/api/v1/admin/email-outbox")).status()).toBe(403);
  });
});
