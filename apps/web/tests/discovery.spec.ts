import { expect, test } from "@playwright/test";

test.describe("public discovery", () => {
  test("search, filters, sorting and pagination work against real data", async ({ page }) => {
    await page.goto("/issues");
    await expect(page.getByText(/\d+ reports? · page 1 of/)).toBeVisible();
    const firstPageTitles = await page.getByRole("heading", { level: 3 }).allInnerTexts();
    expect(firstPageTitles.length).toBe(12);

    await page.getByRole("link", { name: "Next", exact: false }).first().click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("heading", { level: 3 }).first()).not.toHaveText(
      firstPageTitles[0]!
    );

    await page.goto("/issues");
    await page.getByLabel("Category").selectOption({ label: "Water supply" });
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/category=water-supply/);
    for (const badge of await page.getByRole("article").all())
      await expect(badge).toContainText("Water supply");
    await page.getByRole("link", { name: /Water supply Remove filter/ }).click();
    await expect(page).not.toHaveURL(/category=/);
    await expect(page.getByRole("article")).toHaveCount(12);

    await page.getByLabel("Status").selectOption({ label: "Closed, duplicate" });
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("article")).toHaveCount(1);

    await page.goto("/issues?q=zzzz-nothing-matches-this");
    await expect(page.getByText("No reports match those filters.")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByText(/reports · page 1/)).toBeVisible();

    await page.goto("/issues?sort=oldest");
    const oldest = await page.getByRole("article").first().innerText();
    await page.goto("/issues?sort=newest");
    expect(await page.getByRole("article").first().innerText()).not.toBe(oldest);
  });

  test("the map shows real report coordinates and an equivalent list", async ({ page }) => {
    await page.goto("/issues?view=map");
    await expect(page.getByRole("region", { name: /Map of public reports/ })).toBeVisible();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reports shown on the map" })).toBeVisible();
    const list = page
      .getByRole("list")
      .filter({ has: page.getByRole("link", { name: /Ogunlana Drive/ }) });
    await expect(list).toBeVisible();
    // The map data is the real API response.
    const res = await page.request.get("/api/v1/reports/map");
    const body = await res.json();
    expect(body.items.length).toBeGreaterThan(5);
    expect(
      body.items.every(
        (p: { latitude: number; longitude: number }) =>
          Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180
      )
    ).toBe(true);
    await expect(page.getByText(new RegExp(`${body.items.length}.*reports`)).first()).toBeVisible();

    // Switching back keeps the filters.
    await page.goto("/issues?view=map&category=roads-and-potholes");
    await page.getByRole("link", { name: "List" }).click();
    await expect(page).toHaveURL(/category=roads-and-potholes/);
  });

  test("a report page is server-rendered, shareable and carries useful metadata", async ({
    page
  }) => {
    const res = await page.request.get("/issues/SW-SD0006");
    const html = await res.text();
    expect(html).toContain("Collapsed culvert cuts off the footpath to the school");
    expect(html).toMatch(/<meta name="description"[^>]*Resolved/);
    await page.goto("/issues/SW-SD0006");
    await expect(page.getByText("Resolution claimed, not verified").first()).toBeVisible();
    await expect(page.getByText("No photographs of the fix have been provided.")).toBeVisible();
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  });

  test("the homepage shows genuine statistics and recent reports", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Report it.");
    await expect(
      page.getByRole("heading", { name: "What has been reported so far" })
    ).toBeVisible();
    const stats = await (await page.request.get("/api/v1/reports/stats")).json();
    await expect(page.getByText("Reports filed")).toBeVisible();
    await expect(page.getByText(String(stats.totalReports), { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent reports" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Report an issue" }).first()).toBeVisible();
  });
});
