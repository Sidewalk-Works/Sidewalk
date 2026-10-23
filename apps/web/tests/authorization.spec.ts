import { expect, test } from "@playwright/test";
import {
  ADMIN,
  MODERATOR,
  fileReport,
  registerViaApi,
  signInViaUi,
  signOutViaApi,
  uniqueUser
} from "./helpers";

const csrfOf = async (page: import("@playwright/test").Page) =>
  (await page.context().cookies()).find((c) => c.name === "sw_csrf")?.value ?? "";

test.describe("restricted areas stay restricted", () => {
  test("signed-out visitors are sent to sign in, then returned", async ({ page }) => {
    for (const path of ["/admin", "/dashboard", "/account", "/report"]) {
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/%/g, "%")}`)
      );
    }
    const user = uniqueUser("return");
    await registerViaApi(page, user);
    await signOutViaApi(page);
    await page.goto("/report");
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/report$/);
    await expect(page.getByRole("heading", { name: "What is the problem?" })).toBeVisible();
  });

  test("a citizen cannot reach moderation or administration", async ({ page }) => {
    await registerViaApi(page);
    for (const path of [
      "/admin",
      "/admin/reports",
      "/admin/users",
      "/admin/categories",
      "/admin/audit"
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "We could not find that page." }),
        path
      ).toBeVisible();
    }
    // The menu offers no moderation link either.
    await page.goto("/");
    await page.getByRole("button", { name: /E2E/ }).click();
    await expect(page.getByRole("menuitem", { name: "Moderation" })).toHaveCount(0);

    // The API enforces it independently of the UI.
    const csrf = await csrfOf(page);
    expect((await page.request.get("/api/v1/moderation/flags")).status()).toBe(403);
    expect((await page.request.get("/api/v1/admin/users")).status()).toBe(403);
    const hide = await page.request.post("/api/v1/moderation/reports/SW-SD0001/actions", {
      data: { action: "HIDE", policy: "SPAM", reason: "A citizen should not be able to do this." },
      headers: { "x-csrf-token": csrf }
    });
    expect(hide.status()).toBe(403);
    const promote = await page.request.patch(
      "/api/v1/admin/users/00000000-0000-4000-8000-000000000000/role",
      { data: { role: "ADMIN" }, headers: { "x-csrf-token": csrf } }
    );
    expect(promote.status()).toBe(403);
    // Public report is unharmed.
    expect((await page.request.get("/api/v1/reports/SW-SD0001")).status()).toBe(200);
  });

  test("a moderator can moderate but not administer", async ({ page }) => {
    await signInViaUi(page, MODERATOR);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Moderation", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Flag queue" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "We could not find that page." })).toBeVisible();
    expect((await page.request.get("/api/v1/admin/users")).status()).toBe(403);
    expect((await page.request.get("/api/v1/moderation/flags")).status()).toBe(200);
  });

  test("an administrator manages categories and roles, and it is audited", async ({ page }) => {
    await signInViaUi(page, ADMIN);
    await page.goto("/admin/categories");
    await page.getByLabel("Name", { exact: true }).fill("Street trading and markets");
    await page
      .getByLabel("Description")
      .first()
      .fill("Obstructed pavements and unhygienic market spaces.");
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByText("Street trading and markets").first()).toBeVisible();
    await page.goto("/report");
    await expect(page.getByRole("radio", { name: /Street trading and markets/ })).toBeVisible();

    await page.goto("/admin/audit");
    await expect(page.getByRole("cell", { name: "category.created" }).first()).toBeVisible();

    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "People and roles" })).toBeVisible();
    const self = page.getByRole("row").filter({ hasText: "(you)" });
    await expect(self.getByRole("combobox")).toBeDisabled();
  });

  test("a citizen cannot edit or change the status of someone else's report", async ({
    browser,
    baseURL,
    page
  }) => {
    await registerViaApi(page, uniqueUser("owner"));
    const ref = await fileReport(page, {
      title: "Owner-only report for permission checks",
      description: "This report exists so that another citizen can try, and fail, to change it."
    });
    const other = await browser.newContext({ baseURL });
    const op = await other.newPage();
    await registerViaApi(op, uniqueUser("intruder"));
    const csrf = await csrfOf(op);
    const edit = await op.request.patch(`/api/v1/reports/${ref}`, {
      data: { title: "Hijacked by another citizen" },
      headers: { "x-csrf-token": csrf }
    });
    expect(edit.status()).toBe(403);
    const status = await op.request.post(`/api/v1/reports/${ref}/status`, {
      data: { status: "RESOLVED", note: "I am not the reporter of this." },
      headers: { "x-csrf-token": csrf }
    });
    expect(status.status()).toBe(403);
    await op.goto(`/dashboard/reports/${ref}/edit`);
    await expect(op.getByRole("heading", { name: "We could not find that page." })).toBeVisible();
    await other.close();
  });
});
