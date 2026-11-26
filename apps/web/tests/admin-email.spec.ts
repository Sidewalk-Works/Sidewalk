import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deleteOutboxByPrefix, holdLock, insertOutbox, withDb } from "./db";
import { ADMIN, MODERATOR, registerViaApi, signInViaUi, uniqueUser } from "./helpers";
import { waitForMail } from "./mail";

/**
 * The email-delivery screen in the states an operator actually meets it in. The states are real: a queue that
 * nothing is draining (a locked row), a message whose key is missing, dead and retrying messages, and a rate-limit
 * store that cannot be reached (its table locked). Nothing is mocked.
 */
const TAG = "admin-email-e2e";
const out = path.resolve(__dirname, "../../../docs/visual-review");

async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id}: ${v.help} → ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`
    );
  expect(serious, `${label} has serious accessibility violations`).toEqual([]);
}

async function shot(page: Page, name: string) {
  if (!process.env.SCREENSHOTS) return;
  const size = (page.viewportSize()?.width ?? 1280) > 700 ? "desktop" : "mobile";
  mkdirSync(path.join(out, size), { recursive: true });
  await page.screenshot({ path: path.join(out, size, `${name}.png`), fullPage: true });
}

test.describe("who may use the email delivery tools", () => {
  test("signed-out visitors go to sign-in; residents and moderators are refused by the page and the API", async ({
    page,
    browser,
    baseURL
  }) => {
    await page.goto("/admin/email");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Femail/);
    expect((await page.request.get("/api/v1/admin/email-outbox")).status()).toBe(401);

    await registerViaApi(page, uniqueUser("resident"));
    expect((await page.request.get("/api/v1/admin/email-outbox")).status()).toBe(403);
    const refused = await page.goto("/admin/email");
    expect([403, 404]).toContain(refused?.status() ?? 0);

    const staff = await browser.newContext({ baseURL });
    const sp = await staff.newPage();
    await signInViaUi(sp, MODERATOR);
    expect((await sp.request.get("/api/v1/admin/email-outbox")).status()).toBe(403);
    const csrf = (await staff.cookies()).find((c) => c.name === "sw_csrf")!.value;
    const id = "00000000-0000-4000-8000-000000000001";
    expect(
      (
        await sp.request.post(`/api/v1/admin/email-outbox/${id}/retry`, {
          data: {},
          headers: { "x-csrf-token": csrf }
        })
      ).status()
    ).toBe(403);
    await staff.close();
  });

  test("an administrator's retry needs the CSRF token", async ({ page }) => {
    await signInViaUi(page, ADMIN);
    const id = "00000000-0000-4000-8000-000000000002";
    const res = await page.request.post(`/api/v1/admin/email-outbox/${id}/retry`, { data: {} });
    expect(res.status()).toBe(403);
  });
});

test.describe("moderation screens on a small phone", () => {
  test("every moderation screen fits 360px: visually hidden table text must not widen the page", async ({
    page
  }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await signInViaUi(page, ADMIN);
    const wide: string[] = [];
    for (const path of [
      "/admin",
      "/admin/reports",
      "/admin/comments",
      "/admin/history",
      "/admin/categories",
      "/admin/users",
      "/admin/email",
      "/admin/audit"
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      if (width > 360) wide.push(`${path} is ${width}px wide`);
    }
    expect(wide).toEqual([]);
  });
});

test.describe.serial("the screen in each state", () => {
  test.afterAll(async () => {
    await deleteOutboxByPrefix(TAG);
  });

  test("healthy: no warnings, counts and the key in use", async ({ page }) => {
    await deleteOutboxByPrefix(TAG);
    await signInViaUi(page, ADMIN);
    await page.goto("/admin/email");
    await expect(page.getByRole("heading", { name: "Email delivery", level: 2 })).toBeVisible();
    for (const s of ["pending", "sending", "sent", "failed", "dead", "skipped"])
      await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/may have stopped/)).toHaveCount(0);
    await expect(page.getByText(/being held/)).toHaveCount(0);
    await expect(page.getByText(/rate-limit store has been unreachable/)).toHaveCount(0);
    await expect(page.getByText(/Queued messages are encrypted with key “te2e”/)).toBeVisible();
    await shot(page, "29-admin-email-healthy");
    await scan(page, "/admin/email healthy");
  });

  test("unhealthy: dead, retrying, held for a missing key, stalled, and a degraded rate-limit store", async ({
    page,
    browser,
    baseURL
  }) => {
    const resident = await registerViaApi(page, uniqueUser("deadletter"));
    const userId = (
      await withDb((c) => c.query(`SELECT id FROM "User" WHERE email = $1`, [resident.email]))
    ).rows[0].id as string;
    const secretish = "550 5.1.1 mailbox unavailable";

    const dead = await insertOutbox({
      status: "DEAD",
      userId,
      toEmail: resident.email,
      attempts: 6,
      ciphertext: "valid",
      dedupeKey: `${TAG}-dead`,
      lastError: `recipient_rejected: ${secretish}`,
      createdMinutesAgo: 30
    });
    await insertOutbox({
      status: "FAILED",
      toEmail: "retrying.person@example.test",
      attempts: 2,
      ciphertext: "valid",
      dedupeKey: `${TAG}-retry`,
      lastError: "ESOCKET: The mail server did not accept the message.",
      nextAttemptInMinutes: 45,
      createdMinutesAgo: 20
    });
    await insertOutbox({
      status: "FAILED",
      toEmail:
        "a.very.long.local.part.indeed.for.layout.testing@a-quite-long-domain-name-for-layout.example.test",
      attempts: 0,
      ciphertext: "v1.ghostkey.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      dedupeKey: `${TAG}-held`,
      lastError: 'key_unavailable: key "ghostkey" is not configured',
      nextAttemptInMinutes: 10,
      createdMinutesAgo: 5
    });
    // A message that is due, with nothing draining it: its row is locked, so the worker skips it.
    const stalledId = await insertOutbox({
      status: "PENDING",
      toEmail: "stalled@example.test",
      ciphertext: "valid",
      dedupeKey: `${TAG}-stalled`,
      nextAttemptInMinutes: -20,
      createdMinutesAgo: 20
    });
    const releaseRow = await holdLock(`SELECT id FROM "EmailOutbox" WHERE id = $1 FOR UPDATE`, [
      stalledId
    ]);
    // The rate-limit store cannot be reached: its table is locked.
    const releaseLimiter = await holdLock(`LOCK TABLE "RateLimitBucket" IN ACCESS EXCLUSIVE MODE`);

    try {
      await page.context().clearCookies(); // the resident created above is signed in on this page
      await signInViaUi(page, ADMIN);
      await page.goto("/admin/email");

      // Every warning is shown, in words.
      await expect(page.getByText(/The oldest message has been due for \d+ minutes/)).toBeVisible();
      await expect(
        page.getByText(
          /1 message is being held because the encryption key it needs is not configured/
        )
      ).toBeVisible();
      await expect(
        page.getByText(/The shared rate-limit store has been unreachable/)
      ).toBeVisible();
      const attention = await page
        .getByText(/\d+ messages? failed or gave up/)
        .first()
        .innerText();
      expect(Number(/(\d+)/.exec(attention)?.[1])).toBeGreaterThanOrEqual(3); // dead + retrying + held, at least
      await expect(page.getByText(/still queued under “ghostkey”/)).toBeVisible();

      // The table shows state in words, masks every address, and hides anything secret.
      const body = await page.locator("main").innerText();
      expect(body).not.toContain(resident.email);
      expect(body).not.toContain("retrying.person@example.test");
      expect(body).not.toContain("a.very.long.local.part");
      expect(body).toMatch(/\w\*\*\*@/);
      expect(body).not.toMatch(/v1\.\w+\.[A-Za-z0-9_-]{20,}/); // no ciphertext
      expect(body).not.toMatch(/#token=|payload|ciphertext|JWT_|SECRET/i);
      await expect(page.getByRole("row", { name: /dead/ }).first()).toBeVisible();

      // Narrow screen: nothing spills out of the page, and the table scrolls inside a region keyboards can reach.
      await page.setViewportSize({ width: 360, height: 760 });
      await page.reload();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360
      );
      // The action an operator needs is on screen, not beyond the edge of a scrolling table.
      const buttons = page.getByRole("button", { name: /^Retry / });
      expect(await buttons.count()).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < (await buttons.count()); i++) {
        const box = await buttons.nth(i).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(360);
        expect(box!.height).toBeGreaterThanOrEqual(36);
      }
      // Internal codes are translated into words.
      const small = await page.locator("main").innerText();
      expect(small).toContain("Held: the encryption key “ghostkey” is not configured");
      expect(small).not.toContain("key_unavailable");
      await shot(page, "30-admin-email-unhealthy");
      await scan(page, "/admin/email unhealthy at 360px");
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.reload();
      await shot(page, "30-admin-email-unhealthy");
      await scan(page, "/admin/email unhealthy");

      // Retry: reachable by keyboard, says which message it is for, and the action is audited.
      // The button names its message, so the right one can be found (and a screen-reader user hears which one).
      const masked = `${resident.email.slice(0, 1)}***@${resident.email.split("@")[1]}`;
      const retry = page.getByRole("button", {
        name: `Retry password_changed email to ${masked}`
      });
      await expect(retry).toBeVisible();
      await retry.focus();
      await expect(retry).toBeFocused();
      await page.keyboard.press("Enter");
      const mail = await waitForMail(resident.email, /password was changed/i, 20_000);
      expect(mail.text).not.toContain("#token=");

      const audit = await page.request.get(
        "/api/v1/admin/audit?entityType=EmailOutbox&page=1&pageSize=20"
      );
      const entries = (await audit.json()).items as Array<{
        action: string;
        entityId: string;
        actorName?: string;
        metadata?: unknown;
      }>;
      expect(entries.some((e) => e.action === "email.retry_requested" && e.entityId === dead)).toBe(
        true
      );
      await page.goto("/admin/audit");
      await expect(page.getByText("email.retry_requested").first()).toBeVisible();

      // A moderator cannot do it, whatever the page shows.
      const staff = await browser.newContext({ baseURL });
      const sp = await staff.newPage();
      await signInViaUi(sp, MODERATOR);
      expect((await sp.request.get("/api/v1/admin/email-outbox")).status()).toBe(403);
      await staff.close();
    } finally {
      await releaseLimiter();
      await releaseRow();
    }

    // The store recovers by itself once the lock is gone (the breaker closes after a few seconds).
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/v1/admin/email-outbox")).json()).health.rateLimit
            .store,
        { timeout: 20_000, intervals: [1000] }
      )
      .toBe("ok");
    await page.goto("/admin/email");
    await expect(page.getByText(/rate-limit store has been unreachable/)).toHaveCount(0);
  });
});
