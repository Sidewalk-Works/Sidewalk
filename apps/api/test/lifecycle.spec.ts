import request from "supertest";
import {
  createApp,
  makeReport,
  pngImage,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";

describe("Report lifecycle and trust model", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  async function setup() {
    const owner = await signedIn(t.app, t.prisma);
    const staff = await signedIn(t.app, t.prisma, "MODERATOR");
    const admin = await signedIn(t.app, t.prisma, "ADMIN");
    const { reference } = await makeReport(owner.client);
    return { owner, staff, admin, reference };
  }

  it("does not let a citizen acknowledge or progress their own report", async () => {
    const { owner, reference } = await setup();
    for (const status of ["UNDER_REVIEW", "ACKNOWLEDGED", "IN_PROGRESS", "REJECTED"]) {
      const res = await owner.client.post(`/reports/${reference}/status`, {
        status,
        note: "Trying to act as an official."
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_TRANSITION");
    }
    expect((await t.prisma.report.findFirstOrThrow()).status).toBe("SUBMITTED");
  });

  it("does not let an unrelated citizen or a visitor change status", async () => {
    const { reference } = await setup();
    const stranger = await signedIn(t.app, t.prisma);
    const res = await stranger.client.post(`/reports/${reference}/status`, {
      status: "RESOLVED",
      note: "I am not the reporter at all."
    });
    expect(res.status).toBe(403);
    const anon = await request(t.app.getHttpServer())
      .post(`/api/v1/reports/${reference}/status`)
      .send({ status: "ACKNOWLEDGED" });
    expect(anon.status).toBe(401);
  });

  it("records previous and new status, actor, role and timestamp for every transition", async () => {
    const { staff, reference } = await setup();
    await staff.client.post(`/reports/${reference}/status`, { status: "UNDER_REVIEW" });
    await staff.client.post(`/reports/${reference}/status`, {
      status: "ACKNOWLEDGED",
      note: "Confirmed with the ward office."
    });
    const history = await t.prisma.reportStatusHistory.findMany({ orderBy: { createdAt: "asc" } });
    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, "SUBMITTED"],
      ["SUBMITTED", "UNDER_REVIEW"],
      ["UNDER_REVIEW", "ACKNOWLEDGED"]
    ]);
    expect(history[2]).toMatchObject({
      actorId: staff.user.id,
      actorRole: "MODERATOR",
      basis: "STAFF_REVIEW",
      publicNote: "Confirmed with the ward office."
    });
    const audit = await t.prisma.auditLog.findMany({ where: { action: "report.status_changed" } });
    expect(audit).toHaveLength(2);
  });

  it("rejects transitions the lifecycle does not allow", async () => {
    const { staff, reference } = await setup();
    const res = await staff.client.post(`/reports/${reference}/status`, {
      status: "REOPENED",
      note: "Cannot reopen what was never resolved."
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Allowed:");
    expect(
      (await staff.client.post(`/reports/${reference}/status`, { status: "SUBMITTED" })).status
    ).toBe(409);
    expect(
      (await staff.client.post(`/reports/${reference}/status`, { status: "NONSENSE" })).status
    ).toBe(400);
  });

  it("requires a public explanation for outcome changes", async () => {
    const { staff, reference } = await setup();
    for (const status of ["RESOLVED", "REJECTED", "DUPLICATE"]) {
      const res = await staff.client.post(`/reports/${reference}/status`, { status });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("NOTE_REQUIRED");
    }
    const short = await staff.client.post(`/reports/${reference}/status`, {
      status: "RESOLVED",
      note: "fixed"
    });
    expect(short.status).toBe(400);
  });

  it("separates a resolution claim from a verified resolution", async () => {
    const { owner, staff, admin, reference } = await setup();
    const claimed = await staff.client.post(`/reports/${reference}/status`, {
      status: "RESOLVED",
      note: "Filled with asphalt by the ward team."
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body).toMatchObject({
      status: "RESOLVED",
      verification: "CLAIMED",
      resolutionNote: "Filled with asphalt by the ward team."
    });

    // No evidence yet: cannot verify.
    const noEvidence = await admin.client.post(`/reports/${reference}/verification`, {});
    expect(noEvidence.status).toBe(409);
    expect(noEvidence.body.code).toBe("EVIDENCE_REQUIRED");

    // Staff attach resolution evidence.
    const upload = await staff.client.upload(
      `/reports/${reference}/evidence`,
      await pngImage(),
      "after.png",
      { kind: "RESOLUTION" }
    );
    expect(upload.status).toBe(201);

    // The person who recorded the resolution cannot verify it.
    const self = await staff.client.post(`/reports/${reference}/verification`, {});
    expect(self.status).toBe(409);
    expect(self.body.code).toBe("SELF_VERIFICATION");

    // Citizens cannot verify.
    expect((await owner.client.post(`/reports/${reference}/verification`, {})).status).toBe(403);

    const verified = await admin.client.post(`/reports/${reference}/verification`, {});
    expect(verified.status).toBe(200);
    expect(verified.body.verification).toBe("VERIFIED");
    expect(verified.body.resolutionEvidence).toHaveLength(1);
    expect(verified.body.timeline.map((e: { type: string }) => e.type)).toContain(
      "RESOLUTION_VERIFIED"
    );
    expect(
      (await t.prisma.auditLog.findMany({ where: { action: "report.resolution_verified" } })).length
    ).toBe(1);
  });

  it("lets the owner claim a fix (as a claim, never as verification) and reopen it", async () => {
    const { owner, staff, reference } = await setup();
    const claim = await owner.client.post(`/reports/${reference}/status`, {
      status: "RESOLVED",
      note: "The council filled it in yesterday."
    });
    expect(claim.status).toBe(200);
    expect(claim.body.verification).toBe("CLAIMED");
    const row = await t.prisma.reportStatusHistory.findFirstOrThrow({
      where: { toStatus: "RESOLVED" }
    });
    expect(row.basis).toBe("REPORTER_CLAIM");

    const reopened = await staff.client.post(`/reports/${reference}/status`, {
      status: "REOPENED",
      note: "A resident says the repair has already failed."
    });
    expect(reopened.body).toMatchObject({
      status: "REOPENED",
      verification: "NONE",
      resolutionNote: null
    });
    // The earlier claim stays in history rather than being rewritten.
    expect(await t.prisma.reportStatusHistory.count({ where: { toStatus: "RESOLVED" } })).toBe(1);
    expect(
      reopened.body.timeline.filter((e: { type: string }) => e.type === "STATUS_CHANGED")
    ).toHaveLength(2);
  });

  it("refuses to change the status of a hidden report", async () => {
    const { staff, reference } = await setup();
    await staff.client.post(`/moderation/reports/${reference}/actions`, {
      action: "HIDE",
      policy: "SPAM",
      reason: "Hidden pending a closer review."
    });
    const res = await staff.client.post(`/reports/${reference}/status`, { status: "ACKNOWLEDGED" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REPORT_NOT_VISIBLE");
  });

  it("exposes only the transitions a viewer may take", async () => {
    const { owner, staff, reference } = await setup();
    expect(
      (await owner.client.get(`/reports/${reference}`)).body.viewer.allowedTransitions
    ).toEqual(["RESOLVED"]);
    expect(
      (await staff.client.get(`/reports/${reference}`)).body.viewer.allowedTransitions
    ).toEqual(["UNDER_REVIEW", "ACKNOWLEDGED", "RESOLVED", "REJECTED", "DUPLICATE"]);
    expect(
      (await request(t.app.getHttpServer()).get(`/api/v1/reports/${reference}`)).body.viewer
        .allowedTransitions
    ).toEqual([]);
  });

  it("keeps a public timeline free of private details", async () => {
    const { staff, reference } = await setup();
    await staff.client.post(`/moderation/reports/${reference}/notes`, {
      body: "Reporter has filed three similar reports; check for a pattern."
    });
    await staff.client.post(`/reports/${reference}/status`, {
      status: "ACKNOWLEDGED",
      note: "Valid and recorded."
    });
    const detail = await request(t.app.getHttpServer()).get(`/api/v1/reports/${reference}`);
    expect(detail.text).not.toContain("three similar reports");
    expect(detail.text).not.toContain(staff.user.email);
    expect(detail.text).not.toContain(staff.user.id);
    const timeline = detail.body.timeline as Array<{ actorLabel: string; type: string }>;
    expect(timeline.at(-1)).toMatchObject({ type: "STATUS_CHANGED", actorLabel: "Sidewalk staff" });
  });
});
