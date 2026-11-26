import request from "supertest";
import {
  createApp,
  makeReport,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";

describe("Comments and activity", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  const anon = () => request(t.app.getHttpServer());

  it("lets signed-in citizens comment, and everyone read", async () => {
    const owner = await signedIn(t.app, t.prisma, "CITIZEN", { displayName: "Report Owner" });
    const neighbour = await signedIn(t.app, t.prisma, "CITIZEN", { displayName: "A Neighbour" });
    const { reference } = await makeReport(owner.client);

    expect(
      (await anon().post(`/api/v1/reports/${reference}/comments`).send({ body: "Seen it too." }))
        .status
    ).toBe(401);
    const created = await neighbour.client.post(`/reports/${reference}/comments`, {
      body: "I walk past this every day; it is getting worse."
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      kind: "CITIZEN",
      authorName: "A Neighbour",
      isReportOwner: false,
      mine: true
    });

    const list = await anon().get(`/api/v1/reports/${reference}/comments`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].mine).toBe(false);
    expect(list.text).not.toContain(neighbour.user.email);
    expect((await anon().get(`/api/v1/reports/${reference}`)).body.commentCount).toBe(1);
  });

  it("validates comment content", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    expect((await client.post(`/reports/${reference}/comments`, { body: "x" })).status).toBe(400);
    expect(
      (await client.post(`/reports/${reference}/comments`, { body: "a".repeat(1600) })).status
    ).toBe(400);
    expect(
      (await client.post(`/reports/${reference}/comments`, { body: "valid comment", sneaky: true }))
        .status
    ).toBe(400);
  });

  it("allows edits only by the author and only inside the edit window", async () => {
    const author = await signedIn(t.app, t.prisma);
    const other = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(author.client);
    const c = await author.client.post(`/reports/${reference}/comments`, {
      body: "First version of my comment."
    });

    expect(
      (
        await other.client.patch(`/comments/${c.body.id}`, {
          body: "Attempted overwrite by someone else."
        })
      ).status
    ).toBe(403);
    const edited = await author.client.patch(`/comments/${c.body.id}`, {
      body: "Edited version of my comment."
    });
    expect(edited.status).toBe(200);
    expect(edited.body.editedAt).not.toBeNull();

    await t.prisma.comment.update({
      where: { id: c.body.id },
      data: { createdAt: new Date(Date.now() - 20 * 60_000) }
    });
    const late = await author.client.patch(`/comments/${c.body.id}`, {
      body: "Too late to edit this comment."
    });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("EDIT_WINDOW_CLOSED");
  });

  it("turns an author-deleted comment into a tombstone", async () => {
    const author = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(author.client);
    const c = await author.client.post(`/reports/${reference}/comments`, {
      body: "I would like to delete this."
    });
    expect((await author.client.del(`/comments/${c.body.id}`)).status).toBe(204);
    const list = await anon().get(`/api/v1/reports/${reference}/comments`);
    expect(list.body.items[0]).toMatchObject({ body: null, tombstone: "AUTHOR_DELETED" });
    expect(list.text).not.toContain("I would like to delete this");
  });

  it("labels staff updates distinctly and stops citizens posting them", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const staff = await signedIn(t.app, t.prisma, "MODERATOR", { displayName: "Ngozi (staff)" });
    const { reference } = await makeReport(owner.client);

    const fake = await owner.client.post(`/reports/${reference}/comments`, {
      body: "Official update: this is fixed.",
      asStaff: true
    });
    expect(fake.status).toBe(403);

    const official = await staff.client.post(`/reports/${reference}/comments`, {
      body: "We have contacted the area council.",
      asStaff: true
    });
    expect(official.body).toMatchObject({ kind: "STAFF", authorName: "Sidewalk staff" });
    expect(JSON.stringify(official.body)).not.toContain("Ngozi");
    const detail = await anon().get(`/api/v1/reports/${reference}`);
    expect(
      detail.body.timeline.some(
        (e: { type: string; actorLabel: string }) =>
          e.type === "COMMENT_ADDED" && e.actorLabel === "Sidewalk staff"
      )
    ).toBe(true);
    // Ordinary citizen comments do not clutter the public timeline.
    await owner.client.post(`/reports/${reference}/comments`, {
      body: "Thank you for the update."
    });
    const after = await anon().get(`/api/v1/reports/${reference}`);
    expect(
      after.body.timeline.filter((e: { type: string }) => e.type === "COMMENT_ADDED")
    ).toHaveLength(1);
  });

  it("stops comments on hidden reports and hides the discussion with them", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const staff = await signedIn(t.app, t.prisma, "MODERATOR");
    const stranger = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(owner.client);
    await staff.client.post(`/moderation/reports/${reference}/actions`, {
      action: "HIDE",
      policy: "OFF_TOPIC",
      reason: "Not a community infrastructure issue."
    });
    expect(
      (
        await stranger.client.post(`/reports/${reference}/comments`, {
          body: "Can anyone see this?"
        })
      ).status
    ).toBe(404);
    expect((await anon().get(`/api/v1/reports/${reference}/comments`)).status).toBe(404);
    expect(
      (await owner.client.post(`/reports/${reference}/comments`, { body: "Why was it hidden?" }))
        .status
    ).toBe(409);
  });

  it("surfaces other people's activity to the owner but not their own", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const neighbour = await signedIn(t.app, t.prisma, "CITIZEN", { displayName: "A Neighbour" });
    const { reference } = await makeReport(owner.client);
    await owner.client.post(`/reports/${reference}/comments`, {
      body: "My own comment on my own report."
    });
    await neighbour.client.post(`/reports/${reference}/comments`, {
      body: "Confirming what the reporter says."
    });
    const updates = (await owner.client.get("/reports/mine/updates")).body.items as Array<{
      actorLabel: string;
      summary: string;
    }>;
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      actorLabel: "A Neighbour",
      summary: "Commented on your report"
    });
  });
});
