import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN,
  MODERATOR,
  SEED_PASSWORD,
  registerViaApi,
  signInViaUi,
  uniqueUser
} from "./helpers";

const ORG_ADMIN = { email: "org-admin@seed.sidewalk.test", password: SEED_PASSWORD };
const ORG_REP = { email: "org-rep@seed.sidewalk.test", password: SEED_PASSWORD };
const RESIDENT = { email: "resident1@seed.sidewalk.test", password: SEED_PASSWORD };
const SLUG = "sample-roads-agency";

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

/** The reference of the seeded report the synthetic agency has acknowledged. */
async function seededReference(page: Page): Promise<string> {
  const res = await page.request.get(`/api/v1/organizations/${SLUG}/responses`);
  const body = (await res.json()) as Array<{ report?: { reference: string } }>;
  return body[0]!.report!.reference;
}

test.describe("accessibility of the organization screens (axe, WCAG 2.2 AA rules)", () => {
  test("public pages", async ({ page }) => {
    for (const path of [
      "/organizations",
      `/organizations?q=roads&verified=true`,
      `/organizations/${SLUG}`
    ]) {
      await page.goto(path);
      await scan(page, path);
    }
    await page.goto("/organizations?q=zzzz-nothing");
    await expect(page.getByText("No organization matches that search")).toBeVisible();
    await scan(page, "directory with no results");
    await page.goto(`/issues/${await seededReference(page)}`);
    await expect(page.getByRole("article", { name: /Acknowledgement from/ })).toBeVisible();
    await scan(page, "report with an official response");
    await page.goto("/organizations/invitations/accept");
    await expect(page.getByText(/not valid, or has already been used/)).toBeVisible();
    await scan(page, "invalid invitation link");
  });

  test("applying and the applicant's own pages", async ({ page }) => {
    await registerViaApi(page, uniqueUser("axe"));
    await page.goto("/organizations/apply");
    await expect(
      page.getByRole("heading", { name: "Apply to represent an organization" })
    ).toBeVisible();
    await scan(page, "/organizations/apply");
    await page.goto("/organizations/mine");
    await scan(page, "/organizations/mine (empty)");

    await page.context().clearCookies();
    await signInViaUi(page, RESIDENT);
    const mine = await (await page.request.get("/api/v1/organizations/mine")).json();
    const id = mine.applications[0].id as string;
    await page.goto(`/organizations/applications/${id}`);
    await expect(page.getByRole("heading", { name: "What you sent" })).toBeVisible();
    await scan(page, "a submitted application");
  });

  test("an organization administrator's team page, with its dialogs", async ({ page }) => {
    await signInViaUi(page, ORG_ADMIN);
    await page.goto("/organizations/mine");
    await expect(page.getByText("Administrator.")).toBeVisible();
    await scan(page, "/organizations/mine (member)");
    await page.goto(`/organizations/${SLUG}`);
    await expect(page.getByText("You belong to this organization")).toBeVisible();
    await scan(page, "profile as a member");
    await page.goto(`/organizations/${SLUG}/team`);
    await expect(page.getByRole("heading", { name: "Invite someone" })).toBeVisible();
    await scan(page, "team page");
    await page
      .getByRole("button", { name: /^Remove / })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await scan(page, "remove-member dialog");
  });

  test("a representative's response composer, with its dialog", async ({ page }) => {
    await signInViaUi(page, ORG_REP);
    await page.goto(`/issues/${await seededReference(page)}`);
    await expect(page.getByRole("region", { name: "Respond as an organization" })).toBeVisible();
    await scan(page, "report page for a representative");
    await page.getByRole("button", { name: "Write a response" }).click();
    await page
      .getByLabel("What kind of response is this?")
      .selectOption({ label: "Resolution claim" });
    await expect(page.getByText("This is a claim, not a verified outcome")).toBeVisible();
    await scan(page, "resolution claim dialog");
  });

  test("the staff screens", async ({ page }) => {
    await signInViaUi(page, ADMIN);
    for (const path of [
      "/admin/organizations",
      "/admin/organizations/list",
      "/admin/organizations/relations",
      "/admin/organizations/responses"
    ]) {
      await page.goto(path);
      await scan(page, path);
    }
    const queue = await (
      await page.request.get("/api/v1/moderation/organization-applications")
    ).json();
    await page.goto(`/admin/organizations/applications/${queue.items[0].id}`);
    await expect(page.getByRole("button", { name: "Approve and verify" })).toBeVisible();
    await scan(page, "application review");
    await page.getByRole("button", { name: "Approve and verify" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await scan(page, "approval dialog");
    await page.keyboard.press("Escape");

    const orgs = await (
      await page.request.get("/api/v1/moderation/organizations?state=VERIFIED")
    ).json();
    await page.goto(`/admin/organizations/${orgs.items[0].id}`);
    await expect(page.getByRole("button", { name: "Suspend", exact: true })).toBeVisible();
    await scan(page, "organization governance");
    await page.getByRole("button", { name: "Suspend", exact: true }).click();
    await scan(page, "suspend dialog");
  });

  test("a moderator sees the same screens without the administrator's controls", async ({
    page
  }) => {
    await signInViaUi(page, MODERATOR);
    const queue = await (
      await page.request.get("/api/v1/moderation/organization-applications")
    ).json();
    await page.goto(`/admin/organizations/applications/${queue.items[0].id}`);
    await expect(page.getByText("Only an administrator can approve or reject.")).toBeVisible();
    await scan(page, "application review as a moderator");
  });
});
