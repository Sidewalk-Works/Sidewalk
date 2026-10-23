import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  createApp,
  makeReport,
  reportPayload,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";

describe("Reports: creation, ownership, discovery and privacy", () => {
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

  it("creates a report with a human-readable reference and an initial history entry", async () => {
    const { client, user } = await signedIn(t.app, t.prisma);
    const res = await client.post("/reports", reportPayload());
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^SW-[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(res.body.status).toBe("SUBMITTED");
    expect(res.body.viewer).toMatchObject({ isOwner: true, canEdit: true });
    expect(res.body.timeline).toHaveLength(1);

    const history = await t.prisma.reportStatusHistory.findMany({
      where: { report: { reference: res.body.reference } }
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: "SUBMITTED", actorId: user.id });
  });

  it("is idempotent: the same clientRequestId never creates a second report", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const payload = reportPayload();
    const [a, b] = await Promise.all([
      client.post("/reports", payload),
      client.post("/reports", payload)
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.reference).toBe(b.body.reference);
    expect(await t.prisma.report.count()).toBe(1);
  });

  it("requires sign-in to report", async () => {
    const res = await anon().post("/api/v1/reports").send(reportPayload());
    expect(res.status).toBe(401);
  });

  it("validates input on the server", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const bad = await client.post("/reports", {
      title: "x",
      description: "short",
      categorySlug: "roads-and-potholes",
      latitude: 123,
      longitude: 3,
      clientRequestId: randomUUID()
    });
    expect(bad.status).toBe(400);
    const fields = (bad.body.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["title", "description", "latitude"]));

    expect(
      (await client.post("/reports", reportPayload({ categorySlug: "no-such-category" }))).body.code
    ).toBe("INVALID_CATEGORY");
    expect(
      (await client.post("/reports", reportPayload({ title: "   ", extra: true }))).status
    ).toBe(400);
    expect((await client.post("/reports", reportPayload({ title: "          " }))).status).toBe(
      400
    );
    expect(await t.prisma.report.count()).toBe(0);
  });

  it("does not leak private data on the public detail or list endpoints", async () => {
    const { client, user } = await signedIn(t.app, t.prisma, "CITIZEN", {
      email: "private.person@example.test",
      displayName: "Chidi Okafor"
    });
    const created = await makeReport(client);
    const detail = await anon().get(`/api/v1/reports/${created.reference}`);
    const list = await anon().get("/api/v1/reports");
    for (const body of [detail.text, list.text]) {
      expect(body).not.toContain("private.person@example.test");
      expect(body).not.toContain(user.id);
      expect(body).not.toContain("Chidi");
      expect(body).not.toMatch(/clientRequestId|passwordHash|reporterId|internal/i);
    }
    expect(detail.body.reporterName).toBeNull();
  });

  it("shows the reporter's name only when they chose to", async () => {
    const { client } = await signedIn(t.app, t.prisma, "CITIZEN", { displayName: "Chidi Okafor" });
    const created = await makeReport(client, { showReporterName: true });
    expect((await anon().get(`/api/v1/reports/${created.reference}`)).body.reporterName).toBe(
      "Chidi Okafor"
    );
    await client.patch(`/reports/${created.reference}`, { showReporterName: false });
    expect((await anon().get(`/api/v1/reports/${created.reference}`)).body.reporterName).toBeNull();
  });

  it("lets the owner edit while the report is editable, records the edit, and blocks others", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const other = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);

    const edit = await client.patch(`/reports/${reference}`, {
      title: "Pothole now twice as large outside school"
    });
    expect(edit.status).toBe(200);
    expect(edit.body.title).toBe("Pothole now twice as large outside school");
    expect(edit.body.timeline.map((e: { type: string }) => e.type)).toContain("EDITED");

    const forbidden = await other.client.patch(`/reports/${reference}`, {
      title: "Hijacked title for this report"
    });
    expect(forbidden.status).toBe(403);

    // Previous values are kept privately for staff, not on the public timeline.
    const privateEdit = await t.prisma.activityEvent.findFirst({
      where: { type: "EDITED", isPublic: false }
    });
    expect(JSON.stringify(privateEdit?.payload)).toContain(
      "Large pothole outside the primary school"
    );
    expect(JSON.stringify((await anon().get(`/api/v1/reports/${reference}`)).body)).not.toContain(
      "Large pothole outside the primary school"
    );
  });

  it("locks substantive edits once staff acknowledge the report", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const staff = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(client);
    expect(
      (await staff.client.post(`/reports/${reference}/status`, { status: "ACKNOWLEDGED" })).status
    ).toBe(200);
    const res = await client.patch(`/reports/${reference}`, {
      title: "Changing the title after acknowledgement"
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REPORT_LOCKED");
    // Privacy choices stay adjustable at any time.
    expect((await client.patch(`/reports/${reference}`, { showReporterName: true })).status).toBe(
      200
    );
  });

  it("supports keyword search, filters, sorting and pagination", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    await makeReport(client, {
      title: "Blocked drain floods Allen Avenue",
      categorySlug: "flooding-and-drainage",
      latitude: 6.6,
      longitude: 3.35
    });
    await makeReport(client, {
      title: "Refuse heap near Wuse market",
      categorySlug: "waste-and-sanitation",
      latitude: 9.07,
      longitude: 7.47
    });
    const pothole = await makeReport(client, {
      title: "Pothole on Ahmadu Bello Way",
      categorySlug: "roads-and-potholes",
      latitude: 6.43,
      longitude: 3.42
    });

    expect((await anon().get("/api/v1/reports?q=drain")).body.total).toBe(1);
    expect(
      (await anon().get(`/api/v1/reports?q=${pothole.reference.toLowerCase()}`)).body.total
    ).toBe(1);
    expect(
      (await anon().get("/api/v1/reports?category=waste-and-sanitation,roads-and-potholes")).body
        .total
    ).toBe(2);
    expect((await anon().get("/api/v1/reports?status=ACKNOWLEDGED")).body.total).toBe(0);
    expect((await anon().get("/api/v1/reports?status=BOGUS")).status).toBe(400);

    const newest = await anon().get("/api/v1/reports?sort=newest&pageSize=2&page=1");
    expect(newest.body.items.map((r: { title: string }) => r.title)).toEqual([
      "Pothole on Ahmadu Bello Way",
      "Refuse heap near Wuse market"
    ]);
    expect(newest.body).toMatchObject({ total: 3, totalPages: 2, page: 1, pageSize: 2 });
    const second = await anon().get("/api/v1/reports?sort=newest&pageSize=2&page=2");
    expect(second.body.items).toHaveLength(1);
  });

  it("bounds query parameters", async () => {
    expect((await anon().get("/api/v1/reports?pageSize=1000")).status).toBe(400);
    expect((await anon().get("/api/v1/reports?page=0")).status).toBe(400);
    expect((await anon().get("/api/v1/reports?sort=drop-table")).status).toBe(400);
    expect((await anon().get("/api/v1/reports?q=" + "a".repeat(101))).status).toBe(400);
    expect((await anon().get("/api/v1/reports?bbox=1,2,3")).status).toBe(400);
    expect((await anon().get("/api/v1/reports?bbox=5,5,1,1")).status).toBe(400);
    expect((await anon().get("/api/v1/reports?near=6.5,3.3&radiusKm=500")).status).toBe(400);
  });

  it("treats search input as data, not as a query", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    await makeReport(client);
    const res = await anon().get(
      `/api/v1/reports?q=${encodeURIComponent('\'; DROP TABLE "Report"; --')}`
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(await t.prisma.report.count()).toBe(1);
  });

  it("filters geographically by bounding box and by radius", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    await makeReport(client, {
      title: "Report in Yaba Lagos",
      latitude: 6.5095,
      longitude: 3.3711
    });
    await makeReport(client, {
      title: "Report in Ikeja Lagos",
      latitude: 6.6018,
      longitude: 3.3515
    });
    await makeReport(client, { title: "Report in Kano city", latitude: 12.0022, longitude: 8.516 });

    const lagosBox = await anon().get("/api/v1/reports?bbox=3.0,6.3,3.8,6.8");
    expect(lagosBox.body.total).toBe(2);

    const near = await anon().get("/api/v1/reports?near=6.5095,3.3711&radiusKm=3");
    expect(near.body.items.map((r: { title: string }) => r.title)).toEqual([
      "Report in Yaba Lagos"
    ]);
    expect(near.body.items[0].distanceKm).toBeLessThan(0.1);
    const wider = await anon().get("/api/v1/reports?near=6.5095,3.3711&radiusKm=20");
    expect(wider.body.total).toBe(2);
  });

  it("returns bounded map points with real coordinates", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    await makeReport(client, { latitude: 6.5, longitude: 3.3 });
    const res = await anon().get("/api/v1/reports/map");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, truncated: false });
    expect(res.body.items[0]).toMatchObject({ latitude: 6.5, longitude: 3.3, status: "SUBMITTED" });
    expect(Object.keys(res.body.items[0]).sort()).toEqual([
      "categorySlug",
      "latitude",
      "longitude",
      "reference",
      "status",
      "title"
    ]);
  });

  it("computes statistics from real data only", async () => {
    expect((await anon().get("/api/v1/reports/stats")).body).toMatchObject({
      totalReports: 0,
      openReports: 0,
      resolvedReports: 0
    });
    const { client } = await signedIn(t.app, t.prisma);
    const staff = await signedIn(t.app, t.prisma, "MODERATOR");
    const a = await makeReport(client);
    await makeReport(client, { categorySlug: "waste-and-sanitation" });
    await staff.client.post(`/reports/${a.reference}/status`, {
      status: "RESOLVED",
      note: "The pothole was filled with asphalt."
    });
    const stats = (await anon().get("/api/v1/reports/stats")).body;
    expect(stats).toMatchObject({
      totalReports: 2,
      openReports: 1,
      resolvedReports: 1,
      verifiedResolutions: 0,
      categoriesInUse: 2,
      reportsWithEvidence: 0
    });
  });

  it("hides non-public reports from everyone except the owner and staff", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const staff = await signedIn(t.app, t.prisma, "MODERATOR");
    const stranger = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    await staff.client.post(`/moderation/reports/${reference}/actions`, {
      action: "HIDE",
      policy: "SPAM",
      reason: "Looks like advertising rather than a report."
    });

    expect((await anon().get(`/api/v1/reports/${reference}`)).status).toBe(404);
    expect((await stranger.client.get(`/reports/${reference}`)).status).toBe(404);
    expect((await anon().get("/api/v1/reports")).body.total).toBe(0);
    expect((await anon().get("/api/v1/reports/map")).body.total).toBe(0);
    expect((await anon().get("/api/v1/reports/stats")).body.totalReports).toBe(0);

    const owner = await client.get(`/reports/${reference}`);
    expect(owner.status).toBe(200);
    expect(owner.body.moderationState).toBe("HIDDEN");
    expect(owner.body.moderationNotice.reason).toContain("advertising");
    expect((await staff.client.get(`/reports/${reference}`)).status).toBe(200);
  });

  it("returns the owner's reports with the action they need to take", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const staff = await signedIn(t.app, t.prisma, "MODERATOR");
    const a = await makeReport(client);
    await makeReport(client, { title: "Second report, still open and waiting" });
    await staff.client.post(`/reports/${a.reference}/status`, {
      status: "RESOLVED",
      note: "Filled with asphalt on Monday."
    });

    const mine = await client.get("/reports/mine");
    expect(mine.status).toBe(200);
    expect(mine.body.counts).toMatchObject({
      ALL: 2,
      OPEN: 1,
      CLOSED: 1,
      RESOLVED: 1,
      SUBMITTED: 1
    });
    const resolved = mine.body.items.find(
      (r: { reference: string }) => r.reference === a.reference
    );
    expect(resolved.actionNeeded.code).toBe("CONFIRM_RESOLUTION");

    expect((await client.get("/reports/mine?status=OPEN")).body.items).toHaveLength(1);
    const updates = await client.get("/reports/mine/updates");
    expect(updates.body.items[0]).toMatchObject({
      actorLabel: "Sidewalk staff",
      report: { reference: a.reference }
    });

    // Another citizen's dashboard never includes it.
    const other = await signedIn(t.app, t.prisma);
    expect((await other.client.get("/reports/mine")).body.total).toBe(0);
  });

  it("returns a uniform error body for unknown routes and malformed references", async () => {
    const unknown = await anon().get("/api/v1/reports/not-a-reference");
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      path: "/api/v1/reports/not-a-reference"
    });
    expect(typeof unknown.body.requestId).toBe("string");
    expect((await anon().get("/api/v1/nothing-here")).status).toBe(404);
    expect((await anon().get("/api/v1/reports/SW-AAAAAA")).status).toBe(404);
  });
});
