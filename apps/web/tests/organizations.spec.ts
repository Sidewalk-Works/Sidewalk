import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN,
  MODERATOR,
  apiPost,
  fileReport,
  fixture,
  newActor,
  registerViaApi,
  signInViaUi,
  uniqueUser
} from "./helpers";
import { linkIn, pathOf, waitForMail } from "./mail";

/**
 * Verified organizations, end to end, in a real browser against the real API, database and mail sink. One organization
 * is taken from application to verification to responding to reports, and then suspended, so each step builds on the
 * last the way it would in life. Nothing is mocked and no step skips a rule the product enforces.
 */
test.describe.configure({ mode: "serial" });

const run = Date.now()
  .toString(36)
  .replace(/[0-9]/g, (d) => "abcdefghij".charAt(Number(d)));
const ORG_NAME = `Ogun Roads Authority ${run}`;

const applicant = uniqueUser("applicant");
const colleague = uniqueUser("colleague");
const stranger = uniqueUser("stranger");
const reporterA = uniqueUser("reporter");
const reporterB = uniqueUser("reporterb");

let orgSlug = "";
let orgId = "";
let applicationId = "";
let reportA = "";
let reportB = "";

const textOf = async (page: Page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");

test.describe("verified organizations", () => {
  test("1. a visitor can find organizations, and an unverified profile is never dressed as official", async ({
    page
  }) => {
    await page.goto("/organizations");
    await expect(
      page.getByRole("heading", { name: "Who is answering for what", level: 1 })
    ).toBeVisible();
    // The seed's synthetic verified agency is listed, with its status in words.
    const row = page
      .getByRole("listitem")
      .filter({ hasText: "Sample State Roads Agency (synthetic)" });
    await expect(row.getByText("Verified organization")).toBeVisible();
    // An organization with only an application is not listed at all.
    await expect(page.getByText("Sample Ward Drainage Office")).toHaveCount(0);

    await page.getByLabel("Name").fill("roads");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=roads/);
    await expect(page.getByText("1 organization match")).toBeVisible();

    await page.getByRole("link", { name: "Sample State Roads Agency (synthetic)" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /Sample State Roads Agency/ })
    ).toBeVisible();
    await expect(page.getByText(/does not make its statements about reports true/)).toBeVisible();
    // Metrics come with definitions, and Sidewalk says it shows no rates.
    await expect(page.getByText("Claims independently verified")).toBeVisible();
    await expect(page.getByText(/shows no rates, averages or response times/)).toBeVisible();
    await expect(page.getByText("Connected does not mean responsible.")).toBeVisible();
    // The seeded acknowledgement carries its caveat and who published it.
    const card = page.getByRole("article", {
      name: /Acknowledgement from Sample State Roads Agency/
    });
    await expect(card).toBeVisible();
    await expect(card.getByText(/not an acceptance of responsibility/)).toBeVisible();
    await expect(card.getByText(/Published by Seed Organization Representative/)).toBeVisible();

    // Unknown and unlisted addresses are the same "not found".
    const missing = await page.request.get("/api/v1/organizations/does-not-exist");
    const unlisted = await page.request.get("/api/v1/organizations/sample-ward-drainage-office");
    expect([missing.status(), unlisted.status()]).toEqual([404, 404]);
  });

  test("2. a resident applies for a new organization; sending is not being verified", async ({
    browser,
    baseURL,
    page
  }) => {
    await page.goto("/organizations/apply");
    await expect(page).toHaveURL(/\/login\?next=/);

    await registerViaApi(page, applicant);
    await page.goto("/organizations/apply");
    await expect(
      page.getByRole("heading", { name: "Apply to represent an organization", level: 1 })
    ).toBeVisible();
    await expect(page.getByText(/Applying does not make an organization verified/)).toBeVisible();

    await page.getByLabel("Official name").fill(ORG_NAME);
    await page.getByLabel("Where it has authority").fill("Ogun State");
    await page.getByLabel("What it does").fill("Maintains state roads and bridges.");
    await page.getByLabel("Your role there").fill("Director of Communications");
    await page
      .getByLabel("Why you may speak for it")
      .fill("I am the named information officer on the ministry web page.");
    await page.getByLabel("Kind", { exact: true }).first().fill("Official website");
    await page.getByLabel("Label").first().fill("Staff page");
    await page.getByLabel("Citation or link").first().fill("https://roads.ogun.example/staff");
    await page.getByRole("button", { name: "Start application" }).click();

    await expect(page).toHaveURL(/\/organizations\/applications\/[0-9a-f-]{36}$/);
    applicationId = page.url().split("/").pop() as string;
    await expect(page.getByRole("heading", { level: 1, name: ORG_NAME })).toBeVisible();
    await expect(
      page.getByText("Saved, not yet sent. Nobody at Sidewalk has seen it.")
    ).toBeVisible();

    // A private document: attached, shown to the applicant, never public.
    await page.locator('input[type="file"]').setInputFiles(fixture("pothole-1.png"));
    await page.getByLabel("What it shows").fill("Appointment letter");
    await page.getByRole("button", { name: "Attach document" }).click();
    await expect(page.getByRole("img", { name: "Appointment letter" })).toBeVisible();
    const docUrl = await page.getByRole("img", { name: "Appointment letter" }).getAttribute("src");
    expect((await page.request.get(docUrl!)).status()).toBe(200);

    await page.getByRole("button", { name: "Send to Sidewalk staff" }).click();
    await expect(
      page.getByText("Sent to Sidewalk staff. It is waiting for someone to start reviewing it.")
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you sent" })).toBeVisible();

    // The organization exists as a record but has no public face.
    const profile = await page.request.get(
      `/api/v1/organizations?q=${encodeURIComponent(ORG_NAME)}`
    );
    expect((await profile.json()).total).toBe(0);
    // And the document is private to the applicant and staff.
    const anonymous = await newActor(browser, baseURL);
    expect((await anonymous.page.request.get(docUrl!)).status()).toBe(401);
    await anonymous.context.close();
  });

  test("3. staff review: a moderator can ask but not decide; only an administrator's approval verifies", async ({
    browser,
    baseURL,
    page
  }) => {
    await signInViaUi(page, applicant);

    const mod = await newActor(browser, baseURL);
    await signInViaUi(mod.page, MODERATOR);
    await mod.page.goto("/admin/organizations");
    await expect(mod.page.getByRole("link", { name: ORG_NAME })).toBeVisible();
    await mod.page.getByRole("link", { name: ORG_NAME }).click();
    await expect(mod.page.getByRole("heading", { level: 3, name: ORG_NAME })).toBeVisible();
    await expect(
      mod.page.getByText(/Check these yourself, in an independent source/)
    ).toBeVisible();
    await expect(mod.page.getByRole("img", { name: "Appointment letter" })).toBeVisible();
    // A moderator cannot approve: the buttons are not there, and the page says why.
    await expect(mod.page.getByRole("button", { name: "Approve and verify" })).toHaveCount(0);
    await expect(mod.page.getByText("Only an administrator can approve or reject.")).toBeVisible();

    await mod.page.getByRole("button", { name: "Start review" }).click();
    await mod.page.getByRole("button", { name: "Ask the applicant a question" }).click();
    await mod.page.getByLabel("Your question").fill("Which gazette notice created the ministry?");
    await mod.page.getByRole("button", { name: "Send question" }).click();
    await expect(mod.page.getByText("More information needed")).toBeVisible();

    // The applicant sees the question, answers by editing, and sends again.
    await page.goto(`/organizations/applications/${applicationId}`);
    await expect(page.getByText("Sidewalk staff asked you a question")).toBeVisible();
    await expect(page.getByText("Which gazette notice created the ministry?")).toBeVisible();
    await page
      .getByLabel("Why you may speak for it")
      .fill(
        "I am the named information officer. The ministry was created by Gazette notice 12 of 2019."
      );
    await page.getByRole("button", { name: "Send to Sidewalk staff" }).click();
    await expect(
      page.getByText("Sent to Sidewalk staff. It is waiting for someone to start reviewing it.")
    ).toBeVisible();

    // An administrator decides.
    const admin = await newActor(browser, baseURL);
    await signInViaUi(admin.page, ADMIN);
    await admin.page.goto(`/admin/organizations/applications/${applicationId}`);
    await admin.page.getByRole("button", { name: "Start review" }).click();
    await admin.page.getByRole("button", { name: "Approve and verify" }).click();
    const dialog = admin.page.getByRole("dialog");
    await expect(dialog.getByText(/You are saying you checked its identity/)).toBeVisible();
    await dialog
      .getByLabel("Reason")
      .fill("Gazette notice and the ministry web page both confirm the office and the applicant.");
    await dialog.getByRole("button", { name: "Verify organization" }).click();
    await expect(admin.page.getByText("Application · Approved")).toBeVisible();

    // Verification has every documented effect, and none before the decision.
    await page.goto("/organizations");
    const row = page.getByRole("listitem").filter({ hasText: ORG_NAME });
    await expect(row.getByText("Verified organization")).toBeVisible();
    orgSlug = (await row.getByRole("link").first().getAttribute("href"))!.split("/").pop()!;
    await page.goto("/notifications");
    await expect(
      page.getByRole("link", { name: `${ORG_NAME} is now verified on Sidewalk` })
    ).toBeVisible();
    await page.goto("/organizations/mine");
    await expect(page.getByText("Administrator.")).toBeVisible();

    await admin.page.goto("/admin/organizations/list");
    await admin.page.getByRole("link", { name: ORG_NAME }).click();
    await admin.page.waitForURL(/\/admin\/organizations\/[0-9a-f-]{36}$/);
    orgId = admin.page.url().split("/").pop()!;
    await expect(admin.page.getByText("Verified organization").first()).toBeVisible();
    await expect(admin.page.getByText("Gazette notice and the ministry web page")).toBeVisible();
    await mod.context.close();
    await admin.context.close();
  });

  test("4. an invitation is single-use, bound to one address, and carries no authority by itself", async ({
    browser,
    baseURL,
    page
  }) => {
    await signInViaUi(page, applicant);
    const invitee = await newActor(browser, baseURL);
    await registerViaApi(invitee.page, colleague);
    const outsider = await newActor(browser, baseURL);
    await registerViaApi(outsider.page, stranger);

    await page.goto(`/organizations/${orgSlug}/team`);
    await expect(page.getByRole("heading", { name: "Invite someone" })).toBeVisible();
    await page.getByLabel("Email address").fill(colleague.email);
    await page.getByLabel("Role", { exact: true }).selectOption({ label: "Representative" });
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText(`an invitation is on its way to ${colleague.email}`)).toBeVisible();

    const mail = await waitForMail(colleague.email, new RegExp(ORG_NAME));
    expect(mail.text).toMatch(/does not verify/i);
    const link = linkIn(mail);
    expect(link).toContain("/organizations/invitations/accept#token=");

    // Someone else, signed in, opens the link: told plainly it is not theirs, and nothing is used up.
    await outsider.page.goto(pathOf(link));
    await expect(outsider.page.getByText(`You are invited to join ${ORG_NAME}`)).toBeVisible();
    // The secret is gone from the address bar as soon as it is read.
    await expect(outsider.page).toHaveURL(/\/organizations\/invitations\/accept$/);
    await outsider.page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(outsider.page.getByText(/sent to a different email address/)).toBeVisible();

    // The invited person accepts.
    await invitee.page.goto(pathOf(link));
    await invitee.page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(invitee.page.getByText("You have joined")).toBeVisible();

    // The link cannot be used again.
    await invitee.page.goto("/organizations/mine");
    await invitee.page.goto(pathOf(link));
    await expect(invitee.page.getByText(/not valid, or has already been used/)).toBeVisible();

    await page.goto(`/organizations/${orgSlug}/team`);
    await expect(page.getByLabel(`Role of ${colleague.name}`)).toHaveValue("REPRESENTATIVE");
    await invitee.context.close();
    await outsider.context.close();
  });

  test("5. a representative connects the organization to a report and acknowledges it; everyone can see who said what", async ({
    browser,
    baseURL
  }) => {
    const reporter = await newActor(browser, baseURL);
    await registerViaApi(reporter.page, reporterA);
    reportA = await fileReport(reporter.page, {
      title: `Collapsed culvert on Abeokuta road ${run}`,
      description:
        "The culvert has collapsed and the carriageway is undermined. Vehicles have to queue to pass.",
      address: "Abeokuta road, near the market"
    });

    const rep = await newActor(browser, baseURL);
    await signInViaUi(rep.page, colleague);
    await rep.page.goto(`/issues/${reportA}`);
    const panel = rep.page.getByRole("region", { name: "Respond as an organization" });
    await expect(panel.getByText("Your role: Representative")).toBeVisible();
    await panel.getByRole("button", { name: `Add ${ORG_NAME} to this report` }).click();
    await expect(
      rep.page.getByRole("heading", { name: "Organizations connected to this report" })
    ).toBeVisible();
    await expect(
      rep.page
        .getByRole("listitem")
        .filter({ hasText: ORG_NAME })
        .getByText(/Added by the organization itself/)
    ).toBeVisible();
    await expect(rep.page.getByText(/has not acknowledged it/)).toBeVisible();

    await panel.getByRole("button", { name: "Write a response" }).click();
    const dialog = rep.page.getByRole("dialog");
    await expect(dialog.getByText(/not an acceptance of responsibility/)).toBeVisible();
    await dialog
      .getByLabel("Your statement")
      .fill("We have received this report. An engineer will inspect the culvert this week.");
    await dialog.getByRole("button", { name: "Publish response" }).click();
    await expect(dialog).toBeHidden();

    // The public page, seen by a visitor.
    const visitor = await newActor(browser, baseURL);
    await visitor.page.goto(`/issues/${reportA}`);
    const card = visitor.page.getByRole("article", {
      name: new RegExp(`Acknowledgement from ${ORG_NAME}`)
    });
    await expect(card).toBeVisible();
    await expect(card.getByText("Verified organization")).toBeVisible();
    await expect(card.getByText(`Published by ${colleague.name} for ${ORG_NAME}`)).toBeVisible();
    await expect(
      card.getByText(/An acknowledgement is not an acceptance of responsibility/)
    ).toBeVisible();
    await expect(
      visitor.page.getByText(/Stated by .*, not independently verified/).first()
    ).toBeVisible();
    // The status moved forward, and says it is the organization's statement.
    await expect(visitor.page.getByText("Acknowledged", { exact: true }).first()).toBeVisible();
    // The person who filed the report is told once.
    await reporter.page.goto("/notifications");
    await expect(
      reporter.page.getByRole("link", { name: new RegExp(`${ORG_NAME} acknowledged this report`) })
    ).toHaveCount(1);
    // The author is not notified about their own action.
    await rep.page.goto("/notifications");
    await expect(rep.page.getByRole("link", { name: /acknowledged this report/ })).toHaveCount(0);
    for (const a of [reporter, rep, visitor]) await a.context.close();
  });

  test("6. the reporter suggests an organization; 'outside our remit' is a statement, not a finding", async ({
    browser,
    baseURL
  }) => {
    const reporter = await newActor(browser, baseURL);
    await registerViaApi(reporter.page, reporterB);
    reportB = await fileReport(reporter.page, {
      title: `Blocked drain near the clinic ${run}`,
      description:
        "The drain beside the clinic is blocked and floods the entrance after every rain shower.",
      address: "Beside the clinic"
    });
    await reporter.page.goto(`/issues/${reportB}`);
    await reporter.page.getByRole("button", { name: "Suggest an organization" }).click();
    const dialog = reporter.page.getByRole("dialog");
    await dialog.getByLabel("Find an organization by name or area").fill("Ogun Roads");
    await dialog.getByRole("button", { name: "Search" }).click();
    await dialog.getByRole("button", { name: `Suggest ${ORG_NAME}` }).click();
    await expect(
      reporter.page
        .getByRole("listitem")
        .filter({ hasText: ORG_NAME })
        .getByText(/Suggested by the person who filed the report/)
    ).toBeVisible();

    const rep = await newActor(browser, baseURL);
    await signInViaUi(rep.page, colleague);
    await rep.page.goto("/notifications");
    await expect(
      rep.page.getByRole("link", {
        name: new RegExp(`A resident suggested ${ORG_NAME} on ${reportB}`)
      })
    ).toBeVisible();
    await expect(rep.page.getByText(/not accepting responsibility/)).toBeVisible();
    await rep.page.goto(`/issues/${reportB}`);
    await rep.page.getByRole("button", { name: "Write a response" }).click();
    const form = rep.page.getByRole("dialog");
    await form
      .getByLabel("What kind of response is this?")
      .selectOption({ label: "Outside our remit" });
    await form
      .getByLabel("Your statement")
      .fill(
        "Drainage in this district is run by the local government waste unit, not by our authority."
      );
    await form.getByRole("button", { name: "Publish response" }).click();
    await expect(form).toBeHidden();

    await reporter.page.reload();
    const card = reporter.page.getByRole("article", { name: /Outside our remit from/ });
    await expect(card.getByText(/Sidewalk has not checked it/)).toBeVisible();
    await expect(reporter.page.getByText("Says it is outside its remit").first()).toBeVisible();
    // The report is not closed or rejected by this.
    await expect(reporter.page.getByText("Submitted", { exact: true }).first()).toBeVisible();

    // Staff see it in their queue, to decide for themselves who is responsible.
    const mod = await newActor(browser, baseURL);
    await signInViaUi(mod.page, MODERATOR);
    await mod.page.goto("/admin/organizations/relations");
    await expect(
      mod.page.getByRole("link", { name: new RegExp(`Blocked drain near the clinic ${run}`) })
    ).toBeVisible();
    for (const a of [reporter, rep, mod]) await a.context.close();
  });

  test("7. a resolution claim needs the organization's own photograph and stays a claim until staff verify it", async ({
    browser,
    baseURL
  }) => {
    const rep = await newActor(browser, baseURL);
    await signInViaUi(rep.page, colleague);
    await rep.page.goto(`/issues/${reportA}`);
    await rep.page.getByRole("button", { name: "Write a response" }).click();
    let dialog = rep.page.getByRole("dialog");
    await dialog
      .getByLabel("What kind of response is this?")
      .selectOption({ label: "Progress update" });
    await dialog
      .getByLabel("Your statement")
      .fill("Repair has started: the culvert is being rebuilt with new pipes.");
    await dialog.getByLabel("Also record the report as in progress").check();
    await dialog.getByRole("button", { name: "Publish response" }).click();
    await expect(dialog).toBeHidden();
    await expect(rep.page.getByText("Status recorded as “In progress”")).toBeVisible();

    await rep.page.getByRole("button", { name: "Write a response" }).click();
    dialog = rep.page.getByRole("dialog");
    await dialog
      .getByLabel("What kind of response is this?")
      .selectOption({ label: "Resolution claim" });
    await dialog
      .getByLabel("Your statement")
      .fill("The culvert has been rebuilt and the carriageway resurfaced.");
    // It cannot be sent without a photograph and an acknowledgement that it is only a claim.
    const publish = dialog.getByRole("button", { name: "Publish response" });
    await expect(publish).toBeDisabled();
    await dialog.locator('input[type="file"]').setInputFiles(fixture("after-repair.png"));
    await expect(publish).toBeDisabled();
    await dialog.getByLabel("I understand this is published as our organization’s claim").check();
    await expect(dialog.getByText("This is a claim, not a verified outcome")).toBeVisible();
    await publish.click();
    await expect(dialog).toBeHidden();

    const visitor = await newActor(browser, baseURL);
    await visitor.page.goto(`/issues/${reportA}`);
    await expect(visitor.page.getByText("Resolution claimed, not verified").first()).toBeVisible();
    await expect(visitor.page.getByText("Resolution verified by Sidewalk staff")).toHaveCount(0);
    const claim = visitor.page.getByRole("article", { name: /Resolution claim from/ });
    await expect(claim.getByText(/not independently verified/)).toBeVisible();
    await expect(
      claim.getByRole("list", { name: "Organization photograph" }).getByRole("listitem")
    ).toHaveCount(1);

    // The organization cannot verify its own claim: the staff tool is not offered, and the API refuses.
    await expect(rep.page.getByRole("button", { name: "Verify this resolution" })).toHaveCount(0);
    expect((await apiPost(rep.page, `/reports/${reportA}/verification`)).status()).toBe(403);

    // Independent staff verify it, using the organization's own photograph.
    const mod = await newActor(browser, baseURL);
    await signInViaUi(mod.page, MODERATOR);
    await mod.page.goto(`/issues/${reportA}`);
    await mod.page.getByRole("button", { name: "Verify this resolution" }).click();
    await expect(mod.page.getByText("Resolution marked as verified.")).toBeVisible();
    await visitor.page.reload();
    await expect(
      visitor.page.getByText("Resolution verified by Sidewalk staff").first()
    ).toBeVisible();

    // The organization's page counts a claim and an independently verified claim as different things.
    await visitor.page.goto(`/organizations/${orgSlug}`);
    const metrics = await textOf(visitor.page);
    expect(metrics).toMatch(/Resolutions claimed\s*1/);
    expect(metrics).toMatch(/Claims independently verified\s*1/);
    for (const a of [rep, visitor, mod]) await a.context.close();
  });

  test("8. a correction adds to the record; the original is shown as replaced, not erased", async ({
    browser,
    baseURL
  }) => {
    const rep = await newActor(browser, baseURL);
    await signInViaUi(rep.page, colleague);
    await rep.page.goto(`/issues/${reportB}`);
    await rep.page.getByRole("button", { name: "Write a response" }).click();
    const dialog = rep.page.getByRole("dialog");
    await dialog.getByLabel("What kind of response is this?").selectOption({ label: "Correction" });
    await dialog
      .getByLabel("What is being corrected or withdrawn, and why")
      .fill("Correction: after checking, this drain is on our road reserve and we will clear it.");
    await dialog.getByRole("button", { name: "Publish response" }).click();
    await expect(dialog).toBeHidden();

    const first = rep.page.getByRole("article", { name: /Outside our remit from/ });
    await expect(first.getByText("Replaced by a later statement.")).toBeVisible();
    await expect(
      first.getByText(/maintained|run by the local government waste unit/)
    ).toBeVisible();
    const second = rep.page.getByRole("article", { name: /Correction from/ });
    await expect(second.getByText(/corrects\s+an earlier statement/)).toBeVisible();
    await expect(second.getByText("The earlier text stays on the record.")).toBeVisible();
    await first.getByRole("link", { name: "See the newer statement" }).click();
    await rep.context.close();
  });

  test("9. suspension takes effect at once, even for someone who is signed in; reinstatement restores it", async ({
    browser,
    baseURL
  }) => {
    const rep = await newActor(browser, baseURL);
    await signInViaUi(rep.page, colleague);
    const admin = await newActor(browser, baseURL);
    await signInViaUi(admin.page, ADMIN);

    await admin.page.goto(`/admin/organizations/${orgId}`);
    await admin.page.getByRole("button", { name: "Suspend", exact: true }).click();
    const dialog = admin.page.getByRole("dialog");
    await expect(dialog.getByText(/effective immediately/)).toBeVisible();
    await dialog.getByLabel("Reason").fill("A complaint says someone else is using this account.");
    await dialog.getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(admin.page.getByRole("button", { name: "Reinstate" })).toBeVisible();

    await rep.page.goto(`/issues/${reportB}`);
    const panel = rep.page.getByRole("region", { name: "Respond as an organization" });
    await expect(panel.getByText(/suspended by Sidewalk staff/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Write a response" })).toHaveCount(0);
    expect(
      (
        await apiPost(rep.page, `/reports/${reportB}/official-responses`, {
          organizationSlug: orgSlug,
          type: "UPDATE",
          body: "Trying anyway to say something."
        })
      ).status()
    ).toBe(409);
    await rep.page.goto(`/organizations/${orgSlug}`);
    await expect(rep.page.getByText("This organization is suspended")).toBeVisible();
    await expect(rep.page.getByText("Suspended", { exact: true }).first()).toBeVisible();
    // It stays visible as history.
    await expect(rep.page.getByRole("article").first()).toBeVisible();
    // The reason is kept for staff; the member was told it happened, not why.
    await rep.page.goto("/notifications");
    await expect(
      rep.page.getByRole("link", { name: `${ORG_NAME} was suspended on Sidewalk` })
    ).toBeVisible();
    await expect(rep.page.getByText(/someone else is using this account/)).toHaveCount(0);

    await admin.page.getByRole("button", { name: "Reinstate" }).click();
    await admin.page
      .getByRole("dialog")
      .getByLabel("Reason")
      .fill("Checked with the ministry: the account is genuine.");
    await admin.page.getByRole("dialog").getByRole("button", { name: "Reinstate" }).click();
    await expect(admin.page.getByRole("button", { name: "Suspend", exact: true })).toBeVisible();
    await rep.page.goto(`/issues/${reportB}`);
    await expect(
      rep.page
        .getByRole("region", { name: "Respond as an organization" })
        .getByRole("button", { name: "Write a response" })
    ).toBeVisible();
    await rep.context.close();
    await admin.context.close();
  });

  test("10. removing a member ends their access immediately", async ({
    browser,
    baseURL,
    page
  }) => {
    await signInViaUi(page, applicant);
    const rep = await newActor(browser, baseURL);
    await signInViaUi(rep.page, colleague);
    await rep.page.goto(`/issues/${reportB}`);
    await expect(
      rep.page.getByRole("region", { name: "Respond as an organization" })
    ).toBeVisible();

    await page.goto(`/organizations/${orgSlug}/team`);
    await page.getByRole("button", { name: `Remove ${colleague.name}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason").fill("Moved to another department.");
    await dialog.getByRole("button", { name: "Remove from organization" }).click();
    await expect(page.getByText(`Former members (1)`)).toBeVisible();

    await rep.page.reload();
    await expect(rep.page.getByRole("region", { name: "Respond as an organization" })).toHaveCount(
      0
    );
    expect(
      (
        await apiPost(rep.page, `/reports/${reportB}/official-responses`, {
          organizationSlug: orgSlug,
          type: "UPDATE",
          body: "I should not be able to say this."
        })
      ).status()
    ).toBe(403);
    await rep.page.goto("/organizations/mine");
    await expect(rep.page.getByText("You do not belong to any organization")).toBeVisible();
    await rep.context.close();
  });

  test("11. a resident can flag a statement; a moderator hides it; the public no longer sees it, the organization still does", async ({
    browser,
    baseURL
  }) => {
    const reporter = await newActor(browser, baseURL);
    await signInViaUi(reporter.page, reporterA);
    await reporter.page.goto(`/issues/${reportA}`);
    const card = reporter.page.getByRole("article", { name: /Progress update from/ });
    await card.getByRole("button", { name: "Flag" }).click();
    const dialog = reporter.page.getByRole("dialog");
    await dialog
      .getByLabel("What is wrong with it?")
      .selectOption({ label: "Deliberately misleading" });
    await dialog.getByRole("button", { name: "Send flag" }).click();
    await expect(card.getByText("Flagged")).toBeVisible();

    const mod = await newActor(browser, baseURL);
    await signInViaUi(mod.page, MODERATOR);
    await mod.page.goto("/admin");
    const item = mod.page.getByRole("listitem").filter({ hasText: "Official response" }).first();
    await expect(item.getByText(/Repair has started/)).toBeVisible();
    await item.getByRole("button", { name: "Review and decide" }).click();
    const decide = mod.page.getByRole("dialog");
    await decide
      .getByLabel("Decision")
      .selectOption({ label: "Hide from the public (reversible by any moderator)" });
    await decide.getByLabel("Policy").selectOption({ label: "Deliberately misleading" });
    await decide
      .getByLabel("Reason")
      .fill("The statement says work started before the date of the report.");
    await decide.getByRole("button", { name: "Record decision" }).click();

    const visitor = await newActor(browser, baseURL);
    await visitor.page.goto(`/issues/${reportA}`);
    await expect(visitor.page.getByText(/Repair has started/)).toHaveCount(0);
    // Staff still see it, labelled as hidden.
    await mod.page.goto(`/issues/${reportA}`);
    await expect(
      mod.page.getByText("Hidden from the public by Sidewalk moderators.")
    ).toBeVisible();
    for (const a of [reporter, mod, visitor]) await a.context.close();
  });

  test("12. the organization pages have no horizontal scroll and raise no console errors", async ({
    page
  }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await signInViaUi(page, applicant);
    for (const path of [
      "/organizations",
      `/organizations/${orgSlug}`,
      `/organizations/${orgSlug}/team`,
      "/organizations/mine",
      `/organizations/applications/${applicationId}`,
      `/issues/${reportA}`
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0);
    }
    await page.goto("/organizations/mine");
    await expect(page.getByRole("heading", { name: "My organizations", level: 1 })).toBeVisible();
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });
});
