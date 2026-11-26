import { expect, test, type Page } from "@playwright/test";
import { ADMIN, SEED_PASSWORD, registerViaApi, signInViaUi, uniqueUser } from "./helpers";

const ORG_REP = { email: "org-rep@seed.sidewalk.test", password: SEED_PASSWORD };
const ORG_ADMIN = { email: "org-admin@seed.sidewalk.test", password: SEED_PASSWORD };
const SLUG = "sample-roads-agency";

/** Compared with the device width, not innerWidth: a phone widens its layout viewport to fit overflowing content. */
async function expectFits(page: Page, label: string, width: number) {
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scroll, `${label} is ${scroll}px wide on a ${width}px screen`).toBeLessThanOrEqual(width);
}

async function seededReference(page: Page): Promise<string> {
  const body = (await (
    await page.request.get(`/api/v1/organizations/${SLUG}/responses`)
  ).json()) as Array<{
    report?: { reference: string };
  }>;
  return body[0]!.report!.reference;
}

for (const width of [412, 360]) {
  test.describe(`organizations on a ${width}px phone`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
    });

    test("public pages fit, and their controls can be tapped", async ({ page }) => {
      for (const path of [
        "/organizations",
        "/organizations?q=roads",
        `/organizations/${SLUG}`,
        "/organizations/invitations/accept"
      ]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectFits(page, path, width);
      }
      await page.goto("/organizations");
      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            "main button, main input:not([type=hidden]):not([type=checkbox]), main select"
          )
        ]
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({
            name: el.textContent?.trim().slice(0, 20) || el.getAttribute("name"),
            h: el.getBoundingClientRect().height
          }))
          .filter((e) => e.h > 0 && e.h < 36)
      );
      expect(small).toEqual([]);
      await page.goto(`/issues/${await seededReference(page)}`);
      await expectFits(page, "report with an official response", width);
      // The menu offers the new page.
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(
        page.getByRole("dialog").getByRole("link", { name: "Organizations" })
      ).toBeVisible();
    });

    test("a resident can apply on a phone", async ({ page }) => {
      await registerViaApi(page, uniqueUser("phoneorg"));
      await page.goto("/organizations/apply");
      await expectFits(page, "apply", width);
      const name = `Phone Test Water Board ${Date.now().toString(36).replace(/[0-9]/g, "x")}`;
      await page.getByLabel("Official name").fill(name);
      await page.getByLabel("Where it has authority").fill("Kwara State");
      await page.getByLabel("Your role there").fill("Press officer");
      await page
        .getByLabel("Why you may speak for it")
        .fill("I am the named press officer on the board's official web page.");
      await page.getByLabel("Kind", { exact: true }).first().fill("Official website");
      await page.getByLabel("Label").first().fill("Board page");
      await page.getByLabel("Citation or link").first().fill("https://board.kwara.example/about");
      await page.getByRole("button", { name: "Start application" }).click();
      await expect(page).toHaveURL(/\/organizations\/applications\//);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expectFits(page, "application", width);
      await page.getByRole("button", { name: "Send to Sidewalk staff" }).click();
      await expect(page.getByText(/waiting for someone to start reviewing/)).toBeVisible();
      await expectFits(page, "submitted application", width);
    });

    test("a representative can respond to a report on a phone", async ({ page }) => {
      await signInViaUi(page, ORG_REP);
      await page.goto(`/issues/${await seededReference(page)}`);
      await page.getByRole("button", { name: "Write a response" }).click();
      const dialog = page.getByRole("dialog");
      await expectFits(page, "response dialog", width);
      await dialog
        .getByLabel("What kind of response is this?")
        .selectOption({ label: "Progress update" });
      await dialog
        .getByLabel("Your statement")
        .fill(`Phone update at ${width}px: crew booked for Thursday.`);
      const box = await dialog.getByRole("button", { name: "Publish response" }).boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await dialog.getByRole("button", { name: "Publish response" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`Phone update at ${width}px`).first()).toBeVisible();
      await expectFits(page, "report after responding", width);
    });

    test("the team page and staff screens fit", async ({ browser, baseURL, page }) => {
      await signInViaUi(page, ORG_ADMIN);
      for (const path of ["/organizations/mine", `/organizations/${SLUG}/team`]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectFits(page, path, width);
      }
      const context = await browser.newContext({
        baseURL,
        viewport: { width, height: 800 },
        isMobile: true,
        hasTouch: true
      });
      const staff = await context.newPage();
      await signInViaUi(staff, ADMIN);
      for (const path of [
        "/admin/organizations",
        "/admin/organizations/list",
        "/admin/organizations/relations",
        "/admin/organizations/responses"
      ]) {
        await staff.goto(path);
        await staff.waitForLoadState("networkidle");
        await expectFits(staff, path, width);
      }
      const queue = await (
        await staff.request.get("/api/v1/moderation/organization-applications")
      ).json();
      await staff.goto(`/admin/organizations/applications/${queue.items[0].id}`);
      await expectFits(staff, "application review", width);
      await context.close();
    });
  });
}
