import { expect, test, type Page } from "@playwright/test";
import {
  uniqueUser,
  fixture,
  openReportForm,
  registerViaApi,
  signInViaUi,
  MODERATOR,
  fileReport
} from "./helpers";
import { linkIn, waitForMail, tokenIn } from "./mail";

/** Browser-level checks of the security posture: headers, CSP enforcement and caching. */

function watchForCspProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    const text = m.text();
    if (/content security policy|refused to (load|execute|connect|apply|create)/i.test(text))
      problems.push(text);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

test.describe("security headers and policy", () => {
  test("every page carries a fresh nonce-based Content-Security-Policy and the standard hardening headers", async ({
    request
  }) => {
    const first = await request.get("/");
    const second = await request.get("/");
    const csp1 = first.headers()["content-security-policy"] ?? "";
    const csp2 = second.headers()["content-security-policy"] ?? "";
    expect(csp1).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp1).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp1).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp1).toContain("object-src 'none'");
    expect(csp1).toContain("frame-ancestors 'none'");
    expect(csp1).toContain("base-uri 'self'");
    expect(csp1.match(/nonce-([^']+)/)?.[1]).not.toBe(csp2.match(/nonce-([^']+)/)?.[1]);
    const h = first.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
    // Next stamps the nonce onto its own scripts.
    const nonce = csp1.match(/nonce-([^']+)/)![1];
    expect(await first.text()).toContain(`nonce="${nonce}"`);
  });

  test("the policy blocks nothing the application needs (no violations on key screens, maps included)", async ({
    page
  }) => {
    const problems = watchForCspProblems(page);
    for (const path of [
      "/",
      "/issues",
      "/issues?view=map",
      "/issues/SW-SD0001",
      "/login",
      "/how-it-works"
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    await page.goto("/issues?view=map");
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    await page.waitForTimeout(1500);

    await registerViaApi(page);
    await openReportForm(page);
    await page.getByRole("radio", { name: /Roads and potholes/ }).check();
    await page.getByLabel("Title").fill("Policy check report title here");
    await page
      .getByLabel("Describe what you saw")
      .fill("Walking through the form to be sure nothing is blocked by the policy.");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Where is it?" })).toBeVisible();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    await page.getByLabel("Latitude").fill("6.5");
    await page.getByLabel("Longitude").fill("3.4");
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.locator('input[type="file"]').setInputFiles(fixture("pothole-1.png"));
    await expect(page.getByRole("list", { name: "Selected photographs" })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("injected markup cannot run script (inline handlers and javascript: links are blocked)", async ({
    page
  }) => {
    const problems = watchForCspProblems(page);
    await page.goto("/login");
    const ran = await page.evaluate(async () => {
      const w = window as unknown as { __xss?: boolean };
      w.__xss = false;
      const box = document.createElement("div");
      // What a stored-XSS bug would produce: attacker-controlled HTML reaching the DOM.
      box.innerHTML =
        '<img src="x" onerror="window.__xss = true"><a id="evil" href="javascript:window.__xss = true">x</a>';
      document.body.appendChild(box);
      (document.getElementById("evil") as HTMLAnchorElement).click();
      await new Promise((r) => setTimeout(r, 400));
      return w.__xss;
    });
    expect(ran).toBe(false);
    // The browser reported the blocks, which proves the policy (not luck) stopped them.
    expect(problems.some((p) => /content security policy/i.test(p))).toBe(true);
  });

  test("private pages are not indexable, and robots.txt keeps crawlers out of them", async ({
    page,
    request
  }) => {
    const robots = await (await request.get("/robots.txt")).text();
    for (const path of ["/admin", "/dashboard", "/account", "/report", "/api/"])
      expect(robots).toContain(`Disallow: ${path}`);
    await registerViaApi(page);
    for (const path of ["/dashboard", "/account", "/report", "/login"]) {
      await page.goto(path);
      const robotsMeta = await page.locator('meta[name="robots"]').getAttribute("content");
      expect(robotsMeta, path).toContain("noindex");
    }
    await page.goto("/issues/SW-SD0001");
    const publicMeta = await page.locator('meta[name="robots"]').count();
    expect(publicMeta).toBe(0);
  });

  test("responses that depend on who is asking are never cacheable", async ({ page }) => {
    await registerViaApi(page);
    for (const path of ["/api/v1/auth/me", "/api/v1/reports/mine", "/api/v1/reports/SW-SD0001"]) {
      const res = await page.request.get(path);
      expect(res.headers()["cache-control"], path).toMatch(/no-store/);
    }
    for (const path of ["/dashboard", "/account", "/issues/SW-SD0001"]) {
      const res = await page.request.get(path);
      expect(res.headers()["cache-control"], path).toMatch(/no-store|private|no-cache/);
    }
  });

  test("storage credentials and internal URLs never reach the browser", async ({ page }) => {
    await registerViaApi(page);
    const ref = await fileReport(page, {
      title: "Leak check report for evidence urls",
      description: "Checking that no storage details are exposed anywhere in the pages or API.",
      photos: [fixture("pothole-1.png")]
    });
    const html = await (await page.request.get(`/issues/${ref}`)).text();
    const api = await (await page.request.get(`/api/v1/reports/${ref}`)).text();
    const home = await (await page.request.get("/")).text();
    for (const body of [html, api, home]) {
      expect(body).not.toMatch(
        /sidewalk-dev-secret|S3_SECRET|X-Amz-|127\.0\.0\.1:8333|localhost:8333|sidewalk-e2e|storageKey|thumbKey/i
      );
    }
    // The photo is only reachable through the API's visibility-checked endpoint.
    const src = await page
      .goto(`/issues/${ref}`)
      .then(() => page.locator("img[src*='/api/v1/evidence/']").first().getAttribute("src"));
    expect(src).toMatch(/^\/api\/v1\/evidence\/[0-9a-f-]{36}\/file\?variant=thumb$/);
  });

  test("a stolen access cookie stops working after sign-out", async ({
    page,
    browser,
    baseURL
  }) => {
    await signInViaUi(page, MODERATOR);
    const cookies = await page.context().cookies();
    const access = cookies.find((c) => c.name === "sw_at")!;
    await page.getByRole("button", { name: /Local Dev Moderator/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    const thief = await browser.newContext({ baseURL });
    await thief.addCookies([{ name: "sw_at", value: access.value, url: baseURL! }]);
    const res = await thief.request.get("/api/v1/auth/me");
    expect(res.status()).toBe(401);
    await thief.close();
  });
});

test.describe("one-time links", () => {
  test("a reset link keeps its token out of the URL, the address bar history, every request and the Referer", async ({
    page,
    browser,
    baseURL
  }) => {
    const user = await registerViaApi(page, uniqueUser("linksafe"));
    const visitor = await browser.newContext({ baseURL });
    const vp = await visitor.newPage();
    await vp.goto("/forgot-password");
    await vp.getByLabel("Email address").fill(user.email);
    await vp.getByRole("button", { name: "Send the link" }).click();
    const mail = await waitForMail(user.email, /Reset your Sidewalk password/);
    const link = linkIn(mail);
    const token = tokenIn(mail);
    expect(token).toHaveLength(43);

    const seen: string[] = [];
    const problems = watchForCspProblems(vp);
    vp.on("request", (r) => {
      seen.push(r.url());
      const referer = r.headers()["referer"];
      if (referer) seen.push(referer);
    });
    await vp.goto("about:blank");
    await vp.goto(link);
    await expect(
      vp.getByRole("heading", { name: "Choose a new password", level: 1 })
    ).toBeVisible();

    // The page told browsers not to send a Referer at all, and the fragment was removed from the address bar.
    await expect(vp.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    expect(vp.url()).not.toContain(token);
    expect(await vp.evaluate(() => window.location.hash)).toBe("");
    await expect(vp.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    // Using it: the token travels in the request body only.
    await vp.getByLabel("New password").fill("A-new-and-unrelated-passphrase-31");
    await vp.getByLabel("Type it again").fill("A-new-and-unrelated-passphrase-31");
    await vp.getByRole("button", { name: "Change my password" }).click();
    await expect(vp.getByText("Your password has been changed")).toBeVisible();

    expect(seen.filter((u) => u.includes(token))).toEqual([]);
    expect(problems).toEqual([]);
    await visitor.close();
  });

  test("the new pages are not indexable and obey the content security policy", async ({ page }) => {
    const problems = watchForCspProblems(page);
    for (const path of [
      "/verify-email",
      "/verify-email/confirm",
      "/forgot-password",
      "/reset-password"
    ]) {
      const res = await page.goto(path);
      expect(res?.headers()["content-security-policy"], path).toContain("script-src");
      expect(await page.locator('meta[name="robots"]').getAttribute("content"), path).toContain(
        "noindex"
      );
      await page.waitForLoadState("networkidle");
    }
    await registerViaApi(page, uniqueUser("cspnew"));
    for (const path of ["/notifications", "/account", "/verify-email"]) {
      await page.goto(path);
      expect(await page.locator('meta[name="robots"]').getAttribute("content"), path).toContain(
        "noindex"
      );
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });

  test("notification and outbox endpoints are never cacheable and need a session", async ({
    page,
    request
  }) => {
    for (const path of [
      "/api/v1/notifications",
      "/api/v1/users/me/notification-preferences",
      "/api/v1/admin/email-outbox"
    ]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
    await registerViaApi(page, uniqueUser("nocache"));
    for (const path of [
      "/api/v1/notifications",
      "/api/v1/users/me/notification-preferences",
      "/notifications"
    ]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["cache-control"], path).toMatch(/no-store|private|no-cache/);
    }
  });
});
