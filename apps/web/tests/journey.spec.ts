import { expect, test } from "@playwright/test";
import {
  MODERATOR,
  fileReport,
  fixture,
  newActor,
  registerViaApi,
  signInViaUi,
  uniqueUser
} from "./helpers";
import { linkIn, waitForMail } from "./mail";

/**
 * The core civic loop, driven through the real UI and API with three different people:
 * a citizen, a neighbour, and a moderator.
 */
test.describe.serial("citizen journey", () => {
  const citizen = uniqueUser("reporter");
  const neighbour = uniqueUser("neighbour");
  const title = `E2E pothole outside the school gate ${Date.now().toString(36)}`;
  let reference = "";

  test("1. a citizen registers, confirms their email, signs out and signs back in", async ({
    page
  }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill(citizen.name);
    await page.getByLabel("Email address").fill(citizen.email);
    await page.getByLabel("Password").fill(citizen.password);
    await page.getByRole("button", { name: "Create account" }).click();

    // Registration does not sign anyone in: it asks them to check their email.
    await expect(page).toHaveURL(/\/verify-email\?sent=1/);
    await expect(page.getByRole("heading", { name: "Check your email", level: 1 })).toBeVisible();
    expect(page.url()).not.toContain(citizen.email.split("@")[0]!); // no personal data in the address bar
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();

    // The email arrives through the real SMTP path, and its link confirms the address.
    const mail = await waitForMail(citizen.email, /Confirm your email/);
    await page.goto(linkIn(mail));
    await expect(
      page.getByRole("heading", { name: "Confirm your email address", level: 1 })
    ).toBeVisible();
    expect(page.url()).not.toContain("token"); // the one-time token is removed from the address bar at once
    await page.getByRole("button", { name: "Confirm my email address" }).click();
    await expect(page.getByText("Your email address is confirmed")).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).first().click();

    await page.getByLabel("Email address").fill(citizen.email);
    await page.getByLabel("Password").fill(citizen.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "My reports", level: 1 })).toBeVisible();
    await expect(page.getByText("You have not reported anything yet.")).toBeVisible();

    // Session cookies are HttpOnly: page scripts cannot read the tokens.
    const readable = await page.evaluate(() => document.cookie);
    expect(readable).not.toContain("sw_at");
    expect(readable).not.toContain("sw_rt");
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    ).not.toMatch(/token|jwt|eyJ/i);

    await page.getByRole("button", { name: new RegExp(citizen.name) }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);

    await page.getByLabel("Email address").fill(citizen.email);
    await page.getByLabel("Password").fill(citizen.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("2. the citizen submits a report with photographs", async ({ page }) => {
    await signInViaUi(page, citizen);
    await expect(page).toHaveURL(/\/dashboard$/);
    reference = await fileReport(page, {
      title,
      description:
        "A deep pothole has opened outside the school gate. Children step into the road to avoid it every morning.",
      latitude: "6.5244",
      longitude: "3.3792",
      address: "Outside the primary school gate",
      photos: [fixture("pothole-1.png"), fixture("pothole-2.png")]
    });
    expect(reference).toMatch(/^SW-[0-9A-Z]{6}$/);
    await expect(page.getByText("Your report is public.")).toBeVisible();
    await expect(page.getByText(/Its status is\s+Submitted/)).toBeVisible();
    await page.getByRole("link", { name: "View your report" }).click();
    await expect(page).toHaveURL(new RegExp(`/issues/${reference}$`));
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Reporter photograph" }).getByRole("listitem")
    ).toHaveCount(2);
    // The thumbnails really load from the evidence endpoint.
    const first = page.getByRole("list", { name: "Reporter photograph" }).locator("img").first();
    await expect(first).toBeVisible();
    // Visible is not yet loaded, so wait for the pixels.
    await expect
      .poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test("3. another visitor finds it in public discovery and opens it", async ({
    browser,
    baseURL
  }) => {
    const visitor = await newActor(browser, baseURL);
    const { page } = visitor;
    await page.goto("/issues");
    await page.getByLabel("Search", { exact: true }).fill(reference);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("1 report")).toBeVisible();
    await page.getByRole("link", { name: title }).click();
    await expect(page).toHaveURL(new RegExp(`/issues/${reference}$`));

    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(
      page.getByText("Reported by a resident who chose not to show their name.")
    ).toBeVisible();
    await expect(page.getByText(citizen.email)).toHaveCount(0);
    await expect(page.getByText(citizen.name)).toHaveCount(0);
    await expect(
      page.getByText("Filing a report is not an official acknowledgment.")
    ).toBeVisible();
    await expect(page.getByText("Sign in to join the discussion")).toBeVisible();
    // Visitors get no owner or staff tools.
    await expect(page.getByText("Staff tools")).toHaveCount(0);
    await expect(page.getByText("You filed this report")).toHaveCount(0);
    await visitor.context.close();
  });

  test("4. the owner sees it on their dashboard", async ({ page }) => {
    await signInViaUi(page, citizen);
    await expect(page).toHaveURL(/\/dashboard$/);
    const row = page.getByRole("article").filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByText("Submitted")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit report" })).toBeVisible();
  });

  test("5. a moderator acknowledges it and the owner can follow the update", async ({
    browser,
    baseURL,
    page
  }) => {
    const staff = await newActor(browser, baseURL);
    await signInViaUi(staff.page, MODERATOR);
    await expect(staff.page).toHaveURL(/\/dashboard$/);
    await staff.page.goto(`/issues/${reference}`);
    await expect(staff.page.getByRole("heading", { name: "Staff tools" })).toBeVisible();
    await staff.page.getByLabel("New status").selectOption({ label: "Acknowledged" });
    await staff.page
      .getByLabel("Public note")
      .fill("Checked the location with the ward office; the report is valid.");
    await staff.page.getByRole("button", { name: "Record status change" }).click();
    await expect(staff.page.getByText("Status changed to Acknowledged.")).toBeVisible();
    await expect(staff.page.getByText("Recorded by Sidewalk staff after review")).toBeVisible();
    await staff.context.close();

    await signInViaUi(page, citizen);
    await expect(page.getByText("Sidewalk staff", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/status changed to acknowledged/i)).toBeVisible();
    await page.goto(`/issues/${reference}`);
    await expect(page.getByText("Status changed from “Submitted” to “Acknowledged”")).toBeVisible();
    await expect(
      page.getByText("Checked the location with the ward office; the report is valid.")
    ).toBeVisible();
    // Once acknowledged, the substance of the report is locked for the owner.
    await expect(
      page.getByText(/The report text is locked once staff have acknowledged it/)
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit this report" })).toHaveCount(0);
  });

  test("6. a neighbour comments and flags; a moderator reviews, hides and restores", async ({
    browser,
    baseURL,
    page
  }) => {
    const other = await newActor(browser, baseURL);
    await registerViaApi(other.page, neighbour);
    await other.page.goto(`/issues/${reference}`);
    await other.page
      .getByLabel("Add a comment")
      .fill("I walk past here daily and can confirm it is getting worse.");
    await other.page.getByRole("button", { name: "Post comment" }).click();
    await expect(
      other.page.getByText("I walk past here daily and can confirm it is getting worse.")
    ).toBeVisible();

    await other.page.getByRole("button", { name: "Flag this report" }).click();
    await other.page
      .getByLabel("What is wrong with it?")
      .selectOption({ label: "Not a community issue" });
    await other.page.getByRole("button", { name: "Send flag" }).click();
    await expect(other.page.getByText("You flagged this for review")).toBeVisible();
    await other.context.close();

    const staff = await newActor(browser, baseURL);
    await signInViaUi(staff.page, MODERATOR);
    await staff.page.goto("/admin");
    const flag = staff.page.getByRole("listitem").filter({ hasText: title });
    await expect(flag).toBeVisible();
    await expect(flag.getByText("Not a community issue")).toBeVisible();
    await flag.getByRole("button", { name: "Review and decide" }).click();
    const dialog = staff.page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Moderate this report" })).toBeVisible();
    // A reason is mandatory.
    await expect(dialog.getByRole("button", { name: "Record decision" })).toBeDisabled();
    await dialog
      .getByLabel("Decision")
      .selectOption({ label: "Hide from the public (reversible by any moderator)" });
    await dialog.getByLabel("Policy").selectOption({ label: "Not a community issue" });
    await dialog
      .getByLabel("Reason")
      .fill("Reviewed: this is a genuine road defect, but hiding while the flag is investigated.");
    await dialog.getByRole("button", { name: "Record decision" }).click();
    await expect(flag).toHaveCount(0);

    // Hidden: invisible to the public, visible (with the reason) to its owner.
    const visitor = await newActor(browser, baseURL);
    await visitor.page.goto(`/issues/${reference}`);
    await expect(
      visitor.page.getByRole("heading", { name: /no public report with that reference/ })
    ).toBeVisible();
    await visitor.page.goto("/issues");
    await expect(visitor.page.getByRole("link", { name: title })).toHaveCount(0);
    await visitor.context.close();

    await signInViaUi(page, citizen);
    await page.goto("/dashboard");
    await expect(page.getByText(/Moderators have hidden this report/).first()).toBeVisible();
    await page.goto(`/issues/${reference}`);
    await expect(page.getByText("This report is hidden from the public")).toBeVisible();
    await expect(page.getByText(/hiding while the flag is investigated/)).toBeVisible();

    // History records the decision, then the moderator restores it.
    await staff.page.goto("/admin/history");
    await expect(
      staff.page
        .getByRole("row")
        .filter({ hasText: reference })
        .getByText(/hiding while the flag is investigated/)
    ).toBeVisible();
    await staff.page.goto(`/admin/reports?q=${reference}`);
    await staff.page.getByRole("button", { name: "Moderate" }).click();
    const restore = staff.page.getByRole("dialog");
    await expect(restore.getByLabel("Decision")).toHaveValue("RESTORE");
    await restore
      .getByLabel("Reason")
      .fill("Flag reviewed and not upheld; restoring to public view.");
    await restore.getByRole("button", { name: "Record decision" }).click();
    await expect(restore).toHaveCount(0);

    const again = await newActor(browser, baseURL);
    await again.page.goto(`/issues/${reference}`);
    await expect(again.page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await again.context.close();
    await staff.context.close();
  });

  test("7. the owner claims a fix with evidence; staff verify it; the claim and the proof stay distinct", async ({
    browser,
    baseURL,
    page
  }) => {
    await signInViaUi(page, citizen);
    await page.goto(`/issues/${reference}`);
    await page.getByRole("button", { name: "It has been fixed" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("What was fixed, and how do you know?")
      .fill("The council filled the pothole with asphalt on Monday morning.");
    await dialog.locator('input[type="file"]').setInputFiles(fixture("after-repair.png"));
    await dialog.getByRole("button", { name: "Submit resolution claim" }).click();
    await expect(page.getByText("Resolution claimed, not verified").first()).toBeVisible();
    // The note appears in the Resolution block and again on the timeline.
    await expect(
      page.getByText("The council filled the pothole with asphalt on Monday morning.")
    ).toHaveCount(2);

    // A visitor sees the claim labelled as unverified.
    const visitor = await newActor(browser, baseURL);
    await visitor.page.goto(`/issues/${reference}`);
    await expect(visitor.page.getByText("Resolution claimed, not verified").first()).toBeVisible();
    await expect(visitor.page.getByText("Resolution verified by Sidewalk staff")).toHaveCount(0);

    const staff = await newActor(browser, baseURL);
    await signInViaUi(staff.page, MODERATOR);
    await staff.page.goto(`/issues/${reference}`);
    await staff.page.getByRole("button", { name: "Verify this resolution" }).click();
    await expect(staff.page.getByText("Resolution marked as verified.")).toBeVisible();

    await visitor.page.reload();
    await expect(
      visitor.page.getByText("Resolution verified by Sidewalk staff").first()
    ).toBeVisible();
    await expect(
      visitor.page.getByRole("list", { name: "Resolution photograph" }).getByRole("listitem")
    ).toHaveCount(1);
    await visitor.context.close();
    await staff.context.close();

    // The home page statistics reflect it, from real data.
    await page.goto("/");
    await expect(page.getByText("Resolutions verified")).toBeVisible();
  });
});
