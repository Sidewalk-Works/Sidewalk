import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, type Browser, type Page } from "@playwright/test";
import { ADMIN, MODERATOR, SEED_PASSWORD, apiPost, fixture, signInViaUi } from "./helpers";

/**
 * Captures the organization screens for the visual review. Run with SCREENSHOTS=1.
 * Output goes to docs/visual-review/{desktop,mobile}, numbered from 31.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture the visual review");

const out = path.resolve(__dirname, "../../../docs/visual-review");
const SLUG = "sample-roads-agency";
const ORG_ADMIN = { email: "org-admin@seed.sidewalk.test", password: SEED_PASSWORD };
const ORG_REP = { email: "org-rep@seed.sidewalk.test", password: SEED_PASSWORD };
const RESIDENT = { email: "resident1@seed.sidewalk.test", password: SEED_PASSWORD };

async function shot(page: Page, size: "desktop" | "mobile", name: string, fullPage = true) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);
  mkdirSync(path.join(out, size), { recursive: true });
  await page.screenshot({ path: path.join(out, size, `${name}.png`), fullPage });
}

async function actor(
  browser: Browser,
  baseURL: string | undefined,
  size: "desktop" | "mobile",
  viewport: { width: number; height: number },
  creds: { email: string; password: string }
) {
  const context = await browser.newContext({
    baseURL,
    viewport,
    deviceScaleFactor: 1,
    isMobile: size === "mobile",
    hasTouch: size === "mobile",
    locale: "en-NG"
  });
  const page = await context.newPage();
  await signInViaUi(page, creds);
  return { context, page };
}

for (const [size, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }]
] as const) {
  test(`capture organizations ${size}`, async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const visitor = await browser.newContext({
      baseURL,
      viewport,
      deviceScaleFactor: 1,
      isMobile: size === "mobile",
      hasTouch: size === "mobile",
      locale: "en-NG"
    });
    const v = await visitor.newPage();
    await v.goto("/organizations");
    await shot(v, size, "31-organizations-directory");
    await v.goto(`/organizations/${SLUG}`);
    await shot(v, size, "32-organization-profile");
    const responses = (await (
      await v.request.get(`/api/v1/organizations/${SLUG}/responses`)
    ).json()) as Array<{
      report: { reference: string };
    }>;
    const reference = responses[0]!.report.reference;
    await v.goto(`/issues/${reference}`);
    await shot(v, size, "33-report-official-response");
    await v.goto("/organizations/invitations/accept");
    await v.getByText(/not valid, or has already been used/).waitFor();
    await shot(v, size, "34-invitation-invalid");

    const resident = await actor(browser, baseURL, size, viewport, RESIDENT);
    await resident.page.goto("/organizations/apply");
    await shot(resident.page, size, "35-apply");
    const mine = await (await resident.page.request.get("/api/v1/organizations/mine")).json();
    await resident.page.goto(`/organizations/applications/${mine.applications[0].id}`);
    await shot(resident.page, size, "36-application-submitted");
    await resident.context.close();

    const orgAdmin = await actor(browser, baseURL, size, viewport, ORG_ADMIN);
    await orgAdmin.page.goto(`/organizations/${SLUG}`);
    await shot(orgAdmin.page, size, "37-profile-as-member");
    await orgAdmin.page.goto(`/organizations/${SLUG}/team`);
    await shot(orgAdmin.page, size, "38-team");
    await orgAdmin.context.close();

    const rep = await actor(browser, baseURL, size, viewport, ORG_REP);
    await rep.page.goto(`/issues/${reference}`);
    await shot(rep.page, size, "39-report-as-representative");
    await rep.page.getByRole("button", { name: "Write a response" }).click();
    await rep.page
      .getByLabel("What kind of response is this?")
      .selectOption({ label: "Resolution claim" });
    await rep.page.locator('input[type="file"]').setInputFiles(fixture("after-repair.png"));
    await rep.page.waitForTimeout(600);
    await shot(rep.page, size, "40-respond-claim-dialog", false);
    await rep.page.keyboard.press("Escape");

    // A claim, then the same page after independent staff verify it.
    const upload = await rep.page.request.post(`/api/v1/reports/${reference}/evidence`, {
      multipart: {
        file: {
          name: "fix.png",
          mimeType: "image/png",
          buffer: readFileSync(fixture("after-repair.png"))
        },
        kind: "RESOLUTION",
        organization: SLUG
      },
      headers: {
        "x-csrf-token": (await rep.context.cookies()).find((c) => c.name === "sw_csrf")?.value ?? ""
      }
    });
    const photo = (await upload.json()) as { id: string };
    await apiPost(rep.page, `/reports/${reference}/official-responses`, {
      organizationSlug: SLUG,
      type: "RESOLUTION_CLAIM",
      body: "The drain was cleared and the road surface relaid.",
      evidenceIds: [photo.id]
    });
    await rep.page.goto(`/issues/${reference}`);
    await shot(rep.page, size, "41-report-claim-unverified");
    const mod = await actor(browser, baseURL, size, viewport, MODERATOR);
    await apiPost(mod.page, `/reports/${reference}/verification`);
    await mod.page.goto(`/issues/${reference}`);
    await shot(mod.page, size, "42-report-claim-verified-staff");
    await mod.context.close();
    await rep.context.close();

    const admin = await actor(browser, baseURL, size, viewport, ADMIN);
    await admin.page.goto("/admin/organizations");
    await shot(admin.page, size, "43-admin-applications");
    const queue = await (
      await admin.page.request.get("/api/v1/moderation/organization-applications")
    ).json();
    await admin.page.goto(`/admin/organizations/applications/${queue.items[0].id}`);
    await shot(admin.page, size, "44-admin-application-review");
    const orgs = await (
      await admin.page.request.get("/api/v1/moderation/organizations?state=VERIFIED")
    ).json();
    const id = orgs.items[0].id as string;
    await admin.page.goto(`/admin/organizations/${id}`);
    await shot(admin.page, size, "45-admin-organization");
    await admin.page.goto("/admin/organizations/responses");
    await shot(admin.page, size, "46-admin-responses");
    // Suspended, as the public sees it; then reinstated so later captures are unaffected.
    await apiPost(admin.page, `/admin/organizations/${id}/suspend`, {
      reason: "Screenshot of the suspended state."
    });
    await v.goto(`/organizations/${SLUG}`);
    await shot(v, size, "47-organization-suspended");
    await apiPost(admin.page, `/admin/organizations/${id}/reinstate`, {
      reason: "Screenshot finished; reinstating."
    });
    await admin.context.close();
    await visitor.close();
  });
}
