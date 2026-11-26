import { expect, test, type Page } from "@playwright/test";
import { ageTokensFor, expireTokensFor, outboxCount } from "./db";
import { reportBody, registerViaApi, signInViaUi, uniqueUser } from "./helpers";
import { expectNoMail, linkIn, tokenIn, waitForMail } from "./mail";

const NEW_PASSWORD = "A-brand-new-passphrase-2026";

/** Following an emailed link is a fresh page load; a hash-only change inside one document is not. */
async function openEmailedLink(page: Page, url: string) {
  await page.goto("about:blank");
  await page.goto(url);
}

/** Every confirmation email sent to this address, newest first, as plain tokens. */
async function confirmationTokens(email: string): Promise<string[]> {
  const base = "http://127.0.0.1:8025/api/v1";
  const found = await (
    await fetch(
      `${base}/search?query=${encodeURIComponent(`to:"${email}" subject:"Confirm your email"`)}`
    )
  ).json();
  const tokens: string[] = [];
  for (const m of found.messages as { ID: string }[]) {
    const body = await (await fetch(`${base}/message/${m.ID}`)).json();
    const hit = /#token=([A-Za-z0-9_-]{43})/.exec(String(body.Text));
    if (hit) tokens.push(hit[1]!);
  }
  return tokens;
}

test.describe("email verification", () => {
  test("an unconfirmed account is told what it cannot do, can resend the link, and is unlocked by the link", async ({
    page
  }) => {
    const user = uniqueUser("unconfirmed");
    await registerViaApi(page, user, { confirm: false });

    // Signed in but unconfirmed: a banner on every page explains the limit.
    await page.goto("/issues");
    const banner = page.getByRole("region", { name: "Email confirmation needed" });
    await expect(banner).toContainText("Confirm your email address");
    await expect(banner).toContainText("you can read everything");

    // The report form is not available; the visitor is sent to confirm first.
    await page.goto("/report");
    await expect(page).toHaveURL(/\/verify-email\?next=%2Freport/);
    await expect(page.getByRole("heading", { name: "Check your email", level: 1 })).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();

    // The API refuses too, whatever the UI does.
    const csrf = (await page.context().cookies()).find((c) => c.name === "sw_csrf")!.value;
    const blocked = await page.request.post("/api/v1/reports", {
      data: reportBody(),
      headers: { "x-csrf-token": csrf }
    });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe("EMAIL_NOT_VERIFIED");

    // Asking again straight away is refused kindly, with a visible countdown instead of a flood of email.
    await page.getByRole("button", { name: "Send me a new link" }).click();
    await expect(page.getByText("We sent a link a moment ago")).toBeVisible();
    await expect(page.getByRole("button", { name: /Send another link in \d+s/ })).toBeDisabled();
    expect(await confirmationTokens(user.email)).toHaveLength(1);

    // Once the cooldown has passed, a resend issues a new link that replaces the old one.
    await ageTokensFor(user.email, 5);
    await page.goto("/verify-email");
    await page.getByRole("button", { name: "Send me a new link" }).click();
    await expect(page.getByText("A new link is on its way")).toBeVisible();

    // The first link was replaced by the second; only the newest works.
    await expect
      .poll(async () => (await confirmationTokens(user.email)).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    const [newestToken, oldToken] = await confirmationTokens(user.email);
    expect(oldToken).not.toBe(newestToken);

    await openEmailedLink(page, `/verify-email/confirm#token=${oldToken}`);
    await page.getByRole("button", { name: "Confirm my email address" }).click();
    await expect(page.getByText("This link no longer works")).toBeVisible();

    await openEmailedLink(page, `/verify-email/confirm#token=${newestToken}`);
    await page.getByRole("button", { name: "Confirm my email address" }).click();
    await expect(page.getByText("Your email address is confirmed")).toBeVisible();

    // Unlocked immediately: the banner is gone and the report form opens.
    await page.goto("/report");
    await expect(page.getByRole("heading", { name: "What is the problem?" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Email confirmation needed" })).toHaveCount(0);
  });

  test("a used link, an expired link and a broken link each explain themselves", async ({
    page
  }) => {
    const user = uniqueUser("links");
    await registerViaApi(page, user, { confirm: false });
    const mail = await waitForMail(user.email, /Confirm your email/);
    const token = tokenIn(mail);

    // A broken link: no token at all.
    await page.goto("/verify-email/confirm");
    await expect(page.getByText("This link is incomplete")).toBeVisible();
    await expect(page.getByRole("link", { name: "Get a new link" })).toBeVisible();

    // An expired link.
    await expireTokensFor(user.email);
    await openEmailedLink(page, `/verify-email/confirm#token=${token}`);
    await page.getByRole("button", { name: "Confirm my email address" }).click();
    await expect(page.getByText("This link has expired")).toBeVisible();
    await expect(page.getByText("Confirmation links last 24 hours")).toBeVisible();

    // Ask for a new link from the expired page, then use it twice.
    await page.getByRole("link", { name: "Get a new link" }).click();
    await page.getByRole("button", { name: "Send me a new link" }).click();
    await expect(page.getByText("A new link is on its way")).toBeVisible();
    await expect
      .poll(async () => (await confirmationTokens(user.email)).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    const [fresh] = await confirmationTokens(user.email);
    await openEmailedLink(page, `/verify-email/confirm#token=${fresh}`);
    await page.getByRole("button", { name: "Confirm my email address" }).click();
    await expect(page.getByText("Your email address is confirmed")).toBeVisible();
    await openEmailedLink(page, `/verify-email/confirm#token=${fresh}`);
    await page.getByRole("button", { name: "Confirm my email address" }).click();
    await expect(page.getByText("This link no longer works")).toBeVisible();
  });

  test("the resend form gives the same answer for an address that has no account, and sends nothing", async ({
    page
  }) => {
    const stranger = `nobody.${Date.now().toString(36)}@e2e.sidewalk.test`;
    await page.goto("/verify-email");
    await page.getByLabel("Email address").fill(stranger);
    await page.getByRole("button", { name: "Send me a new link" }).click();
    await expect(
      page.getByText(/If that address has a Sidewalk account waiting to be confirmed/)
    ).toBeVisible();
    await expectNoMail(stranger);
  });
});

test.describe("password reset", () => {
  test("a forgotten password is recovered end to end, and every device is signed out", async ({
    page,
    browser,
    baseURL
  }) => {
    const user = uniqueUser("forgetful");
    await registerViaApi(page, user); // page is signed in on "this device"
    const otherDevice = await browser.newContext({ baseURL });
    const phone = await otherDevice.newPage();
    await signInViaUi(phone, user);
    await expect(phone).toHaveURL(/\/dashboard$/);

    // Request a link while signed out.
    const visitor = await browser.newContext({ baseURL });
    const vp = await visitor.newPage();
    await vp.goto("/login");
    await vp.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(
      vp.getByRole("heading", { name: "Forgot your password?", level: 1 })
    ).toBeVisible();
    await vp.getByLabel("Email address").fill(user.email);
    await vp.getByRole("button", { name: "Send the link" }).click();
    await expect(
      vp.getByText("If there is an account for that address, a link is on its way")
    ).toBeVisible();
    await expect(vp.getByText("expires in 30 minutes")).toBeVisible();

    const mail = await waitForMail(user.email, /Reset your Sidewalk password/);
    expect(mail.html).toContain('lang="en"');
    const link = linkIn(mail);
    expect(new URL(link).origin).toBe(baseURL);

    await vp.goto(link);
    await expect(
      vp.getByRole("heading", { name: "Choose a new password", level: 1 })
    ).toBeVisible();
    expect(vp.url()).not.toContain("token");

    // Mismatch and weak passwords are explained and do not use up the link.
    await vp.getByLabel("New password").fill(NEW_PASSWORD);
    await vp.getByLabel("Type it again").fill("something else entirely");
    await vp.getByRole("button", { name: "Change my password" }).click();
    await expect(vp.getByText("The two passwords do not match.")).toBeVisible();
    await vp.getByLabel("New password").fill("password123");
    await vp.getByLabel("Type it again").fill("password123");
    await vp.getByRole("button", { name: "Change my password" }).click();
    await expect(
      vp.getByText("That password is too common. Choose something harder to guess.")
    ).toBeVisible();

    await vp.getByLabel("New password").fill(NEW_PASSWORD);
    await vp.getByLabel("Type it again").fill(NEW_PASSWORD);
    await vp.getByRole("button", { name: "Change my password" }).click();
    await expect(vp.getByText("Your password has been changed")).toBeVisible();
    await expect(vp.getByText(/signed out on every device/)).toBeVisible();
    // Not signed in automatically.
    await expect(vp.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();

    // Confirmation email: says it happened, never says the password.
    const confirmation = await waitForMail(user.email, /password was changed/i);
    expect(confirmation.text + confirmation.html).not.toContain(NEW_PASSWORD);
    expect(confirmation.text).not.toContain("#token=");

    // The old password no longer works, the new one does.
    await vp.getByRole("link", { name: "Sign in" }).first().click();
    await expect(vp.getByText("Sign in with your new password.")).toBeVisible();
    await vp.getByLabel("Email address").fill(user.email);
    await vp.getByLabel("Password").fill(user.password);
    await vp.getByRole("button", { name: "Sign in" }).click();
    await expect(vp.getByText("Email or password is incorrect.")).toBeVisible();
    await vp.getByLabel("Password").fill(NEW_PASSWORD);
    await vp.getByRole("button", { name: "Sign in" }).click();
    await expect(vp).toHaveURL(/\/dashboard$/);

    // Both earlier devices were signed out at once, including their already-issued access tokens.
    for (const p of [page, phone]) {
      expect((await p.request.get("/api/v1/auth/me")).status()).toBe(401);
      await p.goto("/dashboard");
      await expect(p).toHaveURL(/\/login\?next=%2Fdashboard/);
    }

    // The link cannot be used a second time.
    await visitor.close();
    const again = await browser.newContext({ baseURL });
    const ap = await again.newPage();
    await ap.goto(link);
    await expect(ap.getByText("This link no longer works")).toBeVisible();
    await expect(ap.getByRole("link", { name: "Request a new link" })).toBeVisible();
    await again.close();
    await otherDevice.close();
  });

  test("a request for an unknown address looks identical and sends nothing; an expired link explains itself", async ({
    page
  }) => {
    const ghost = `ghost.${Date.now().toString(36)}@e2e.sidewalk.test`;
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill(ghost);
    await page.getByRole("button", { name: "Send the link" }).click();
    await expect(
      page.getByText("If there is an account for that address, a link is on its way")
    ).toBeVisible();
    await expectNoMail(ghost);
    expect(await outboxCount(ghost, "PASSWORD_RESET")).toBe(0);

    const user = uniqueUser("expiring");
    await registerViaApi(page, user);
    await page.context().clearCookies();
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill(user.email);
    await page.getByRole("button", { name: "Send the link" }).click();
    const mail = await waitForMail(user.email, /Reset your Sidewalk password/);
    await expireTokensFor(user.email);
    await page.goto(linkIn(mail));
    await expect(page.getByText("This link has expired")).toBeVisible();
    await expect(page.getByText("Reset links last 30 minutes")).toBeVisible();
    await expect(page.getByLabel("New password")).toHaveCount(0);
  });

  test("changing the password in settings signs out other devices and emails a notice", async ({
    page,
    browser,
    baseURL
  }) => {
    const user = uniqueUser("settings");
    await registerViaApi(page, user);
    const other = await browser.newContext({ baseURL });
    const op = await other.newPage();
    await signInViaUi(op, user);

    await page.goto("/account");
    await page.getByLabel("Current password").fill(user.password);
    await page.getByLabel("New password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(
      page.getByText(/Every other device was signed out, and we emailed you a confirmation/)
    ).toBeVisible();
    await waitForMail(user.email, /password was changed/i);
    expect((await op.request.get("/api/v1/auth/me")).status()).toBe(401);
    expect((await page.request.get("/api/v1/auth/me")).status()).toBe(200);
    await other.close();
  });
});
