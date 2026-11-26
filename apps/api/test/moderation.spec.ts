import request from "supertest";
import {
  createApp,
  createUser,
  makeReport,
  resetDatabase,
  seedCategories,
  signedIn,
  Client,
  type TestApp
} from "./helpers";

describe("Moderation, administration and permission boundaries", () => {
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
  const hide = {
    action: "HIDE",
    policy: "SPAM",
    reason: "This is advertising rather than a community issue."
  };

  it("keeps every staff endpoint closed to citizens and visitors", async () => {
    const citizen = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(citizen.client);
    const staffEndpoints: Array<[string, string]> = [
      ["get", "/moderation/flags"],
      ["get", "/moderation/reports"],
      ["get", "/moderation/comments"],
      ["get", "/moderation/actions"],
      ["get", `/moderation/reports/${reference}/context`],
      ["get", `/moderation/reports/${reference}/notes`],
      ["get", "/admin/users"],
      ["get", "/admin/audit"],
      ["get", "/admin/categories"]
    ];
    for (const [, path] of staffEndpoints) {
      expect((await citizen.client.get(path)).status).toBe(403);
      expect((await anon().get(`/api/v1${path}`)).status).toBe(401);
    }
    expect(
      (await citizen.client.post(`/moderation/reports/${reference}/actions`, hide)).status
    ).toBe(403);
    expect(
      (await citizen.client.post(`/moderation/reports/${reference}/notes`, { body: "A note" }))
        .status
    ).toBe(403);
    expect(
      (
        await citizen.client.post("/admin/categories", {
          name: "Hijacked",
          description: "Not allowed to add this."
        })
      ).status
    ).toBe(403);
    expect(
      (await citizen.client.patch(`/admin/users/${citizen.user.id}/role`, { role: "ADMIN" })).status
    ).toBe(403);
    expect((await t.prisma.report.findFirstOrThrow()).moderationState).toBe("VISIBLE");
  });

  it("keeps administrator operations closed to moderators", async () => {
    const mod = await signedIn(t.app, t.prisma, "MODERATOR");
    const target = await createUser(t.prisma);
    expect((await mod.client.get("/admin/users")).status).toBe(403);
    expect(
      (await mod.client.patch(`/admin/users/${target.id}/role`, { role: "MODERATOR" })).status
    ).toBe(403);
    expect(
      (
        await mod.client.patch(`/admin/users/${target.id}/status`, {
          status: "SUSPENDED",
          reason: "Because I feel like it."
        })
      ).status
    ).toBe(403);
    expect((await mod.client.get("/admin/audit")).status).toBe(403);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe(
      "CITIZEN"
    );
  });

  it("lets citizens flag content once, but not their own", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const flagger = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(owner.client);

    expect(
      (await anon().post(`/api/v1/reports/${reference}/flags`).send({ reason: "SPAM" })).status
    ).toBe(401);
    expect(
      (await owner.client.post(`/reports/${reference}/flags`, { reason: "SPAM" })).status
    ).toBe(400);
    expect(
      (await flagger.client.post(`/reports/${reference}/flags`, { reason: "NOT_A_REASON" })).status
    ).toBe(400);
    expect(
      (
        await flagger.client.post(`/reports/${reference}/flags`, {
          reason: "SPAM",
          details: "Looks like an advert."
        })
      ).status
    ).toBe(204);
    const again = await flagger.client.post(`/reports/${reference}/flags`, { reason: "SPAM" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_FLAGGED");
    expect((await flagger.client.get(`/reports/${reference}`)).body.viewer.hasFlagged).toBe(true);
  });

  it("walks a flagged report through review: hide, history, restore", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const flagger = await signedIn(t.app, t.prisma);
    const mod = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(owner.client);
    await flagger.client.post(`/reports/${reference}/flags`, { reason: "SPAM" });

    const queue = await mod.client.get("/moderation/flags");
    expect(queue.body.total).toBe(1);
    expect(queue.body.items[0]).toMatchObject({
      target: "REPORT",
      reason: "SPAM",
      status: "OPEN",
      report: { reference }
    });

    // A reason is mandatory, and the policy must be one we define.
    expect(
      (
        await mod.client.post(`/moderation/reports/${reference}/actions`, {
          action: "HIDE",
          policy: "SPAM",
          reason: "no"
        })
      ).status
    ).toBe(400);
    expect(
      (
        await mod.client.post(`/moderation/reports/${reference}/actions`, {
          action: "HIDE",
          policy: "BECAUSE",
          reason: "A long enough reason here."
        })
      ).status
    ).toBe(400);

    const done = await mod.client.post(`/moderation/reports/${reference}/actions`, hide);
    expect(done.status).toBe(200);
    expect(done.body.moderationState).toBe("HIDDEN");
    expect((await anon().get(`/api/v1/reports/${reference}`)).status).toBe(404);
    expect((await mod.client.get("/moderation/flags")).body.total).toBe(0);
    expect((await mod.client.get("/moderation/flags?status=ACTIONED")).body.total).toBe(1);

    const history = await mod.client.get("/moderation/actions");
    expect(history.body.items[0]).toMatchObject({
      action: "HIDE",
      policy: "SPAM",
      reason: hide.reason,
      previousState: "VISIBLE",
      newState: "HIDDEN",
      reportReference: reference
    });

    expect((await mod.client.post(`/moderation/reports/${reference}/actions`, hide)).status).toBe(
      409
    );
    const restored = await mod.client.post(`/moderation/reports/${reference}/actions`, {
      action: "RESTORE",
      policy: "OTHER",
      reason: "Reviewed again: this is a genuine report."
    });
    expect(restored.body.moderationState).toBe("VISIBLE");
    expect((await anon().get(`/api/v1/reports/${reference}`)).status).toBe(200);
    expect(await t.prisma.moderationAction.count()).toBe(2);
    expect(
      await t.prisma.auditLog.count({ where: { action: { startsWith: "moderation." } } })
    ).toBe(2);
  });

  it("lets only administrators restore removed content", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const mod = await signedIn(t.app, t.prisma, "MODERATOR");
    const admin = await signedIn(t.app, t.prisma, "ADMIN");
    const { reference } = await makeReport(owner.client);
    const removed = await mod.client.post(`/moderation/reports/${reference}/actions`, {
      action: "REMOVE",
      policy: "ILLEGAL",
      reason: "Contains content we are required to remove."
    });
    expect(removed.body.moderationState).toBe("REMOVED");

    const restoreByMod = await mod.client.post(`/moderation/reports/${reference}/actions`, {
      action: "RESTORE",
      policy: "OTHER",
      reason: "Trying to bring this back again."
    });
    expect(restoreByMod.status).toBe(403);
    expect(
      (
        await admin.client.post(`/moderation/reports/${reference}/actions`, {
          action: "RESTORE",
          policy: "OTHER",
          reason: "Removed in error; restoring after review."
        })
      ).status
    ).toBe(200);
  });

  it("moderates comments and shows a tombstone publicly", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const spammer = await signedIn(t.app, t.prisma);
    const flagger = await signedIn(t.app, t.prisma);
    const mod = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(owner.client);
    const comment = await spammer.client.post(`/reports/${reference}/comments`, {
      body: "Buy cheap followers at my website now!"
    });
    expect(
      (await flagger.client.post(`/comments/${comment.body.id}/flags`, { reason: "SPAM" })).status
    ).toBe(204);

    const queue = await mod.client.get("/moderation/flags");
    expect(queue.body.items[0].comment.body).toContain("cheap followers");

    expect(
      (
        await mod.client.post(`/moderation/comments/${comment.body.id}/actions`, {
          action: "HIDE",
          policy: "SPAM",
          reason: "Advertising unrelated to the report."
        })
      ).status
    ).toBe(200);
    const list = await anon().get(`/api/v1/reports/${reference}/comments`);
    expect(list.body.items[0]).toMatchObject({ body: null, tombstone: "MODERATED" });
    expect(list.text).not.toContain("cheap followers");
    expect((await anon().get(`/api/v1/reports/${reference}`)).body.commentCount).toBe(0);
  });

  it("dismisses a flag with a recorded reason", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const flagger = await signedIn(t.app, t.prisma);
    const mod = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(owner.client);
    await flagger.client.post(`/reports/${reference}/flags`, { reason: "MISLEADING" });
    const flagId = (await mod.client.get("/moderation/flags")).body.items[0].id as string;
    expect(
      (await mod.client.post(`/moderation/flags/${flagId}/dismiss`, { reason: "short" })).status
    ).toBe(400);
    expect(
      (
        await mod.client.post(`/moderation/flags/${flagId}/dismiss`, {
          reason: "Checked the location; the report is accurate."
        })
      ).status
    ).toBe(204);
    expect(
      (
        await mod.client.post(`/moderation/flags/${flagId}/dismiss`, {
          reason: "Dismissing a second time over."
        })
      ).status
    ).toBe(409);
    expect((await anon().get(`/api/v1/reports/${reference}`)).status).toBe(200);
    expect((await mod.client.get("/moderation/actions")).body.items[0]).toMatchObject({
      action: "DISMISS",
      policy: null
    });
  });

  it("never exposes internal notes or moderation context through public endpoints", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const mod = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(owner.client);
    const note = "Reporter is a known contact of the ward chairman. Handle carefully.";
    expect(
      (await mod.client.post(`/moderation/reports/${reference}/notes`, { body: note })).status
    ).toBe(201);
    expect(
      (await mod.client.get(`/moderation/reports/${reference}/notes`)).body.items[0].body
    ).toBe(note);

    for (const client of [
      new Client(t.app),
      owner.client,
      (await signedIn(t.app, t.prisma)).client
    ]) {
      for (const path of [
        `/reports/${reference}`,
        `/reports/${reference}/comments`,
        "/reports",
        "/reports/mine",
        "/reports/map"
      ]) {
        const res = await client.get(path);
        expect(res.text).not.toContain("ward chairman");
      }
    }
  });

  it("lets an administrator change roles, and audits it", async () => {
    const admin = await signedIn(t.app, t.prisma, "ADMIN");
    const target = await createUser(t.prisma);
    const res = await admin.client.patch(`/admin/users/${target.id}/role`, { role: "MODERATOR" });
    expect(res.status).toBe(200);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe(
      "MODERATOR"
    );

    // The new moderator can use staff endpoints on their very next request.
    const promoted = new Client(t.app);
    await promoted.login(target.email);
    expect((await promoted.get("/moderation/flags")).status).toBe(200);

    const audit = await admin.client.get("/admin/audit?entityType=User");
    expect(audit.body.items[0]).toMatchObject({
      action: "user.role_changed",
      metadata: { from: "CITIZEN", to: "MODERATOR" }
    });

    expect(
      (await admin.client.patch(`/admin/users/${admin.user.id}/role`, { role: "CITIZEN" })).status
    ).toBe(409);
    expect(
      (await admin.client.patch(`/admin/users/${target.id}/role`, { role: "SUPERUSER" })).status
    ).toBe(400);
  });

  it("suspends a user and ends their sessions immediately", async () => {
    const admin = await signedIn(t.app, t.prisma, "ADMIN");
    const victim = await signedIn(t.app, t.prisma);
    expect(
      (
        await admin.client.patch(`/admin/users/${victim.user.id}/status`, {
          status: "SUSPENDED",
          reason: "Repeated abusive comments."
        })
      ).status
    ).toBe(200);
    expect((await victim.client.get("/auth/me")).status).toBe(401);
    expect((await victim.client.refresh()).status).toBe(401);
    expect(
      (
        await admin.client.patch(`/admin/users/${admin.user.id}/status`, {
          status: "SUSPENDED",
          reason: "Suspending myself, oops."
        })
      ).status
    ).toBe(409);
    expect(await t.prisma.auditLog.count({ where: { action: "user.suspended" } })).toBe(1);
  });

  it("manages categories, and keeps slugs stable and one category active", async () => {
    const admin = await signedIn(t.app, t.prisma, "ADMIN");
    const created = await admin.client.post("/admin/categories", {
      name: "Street trading & markets",
      description: "Obstructed pavements and market hygiene."
    });
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe("street-trading-and-markets");
    expect(
      (
        await admin.client.post("/admin/categories", {
          name: "street trading & MARKETS",
          description: "Duplicate name differing in case."
        })
      ).status
    ).toBe(409);

    const renamed = await admin.client.patch(`/admin/categories/${created.body.id}`, {
      name: "Street trading"
    });
    expect(renamed.body).toMatchObject({
      name: "Street trading",
      slug: "street-trading-and-markets"
    });

    expect(
      (await anon().get("/api/v1/categories")).body.items.map((c: { slug: string }) => c.slug)
    ).toContain("street-trading-and-markets");
    await admin.client.patch(`/admin/categories/${created.body.id}`, { isActive: false });
    expect(
      (await anon().get("/api/v1/categories")).body.items.map((c: { slug: string }) => c.slug)
    ).not.toContain("street-trading-and-markets");

    const all = await t.prisma.category.findMany({ where: { isActive: true } });
    for (const c of all.slice(1))
      await admin.client.patch(`/admin/categories/${c.id}`, { isActive: false });
    const last = await admin.client.patch(`/admin/categories/${all[0]!.id}`, { isActive: false });
    expect(last.status).toBe(409);
    expect(last.body.code).toBe("LAST_CATEGORY");
  });
});
