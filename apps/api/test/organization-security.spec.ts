import request from "supertest";
import {
  createApp,
  resetDatabase,
  seedCategories,
  signedIn,
  ORIGIN,
  type TestApp
} from "./helpers";
import { ORG_FIELDS, connectedReport, submitApplication, verifiedOrg } from "./org-helpers";

describe("Organization routes: CSRF, origin, cache and rate limits", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp({ rateLimitMultiplier: 1 });
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
    t.email.reset();
  });
  afterAll(async () => {
    await t.close();
    process.env.RATE_LIMIT_MULTIPLIER = "1000";
  });

  it("refuses every organization write that lacks the CSRF token or comes from another origin", async () => {
    const world = await verifiedOrg(t);
    const { applicant, application } = await submitApplication(t);
    const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
    const writes: Array<[string, string, object, typeof world.admin.client]> = [
      ["post", "/organization-applications", { organization: ORG_FIELDS }, applicant.client],
      ["post", `/organization-applications/${application.id}/withdraw`, {}, applicant.client],
      [
        "post",
        `/organizations/${world.org.slug}/invitations`,
        { email: "a@example.test", role: "MEMBER" },
        world.admin.client
      ],
      [
        "post",
        `/reports/${report.reference}/official-responses`,
        {
          organizationSlug: world.org.slug,
          type: "UPDATE",
          body: "A statement that should not land."
        },
        world.rep.client
      ],
      [
        "post",
        `/admin/organizations/${world.org.id}/suspend`,
        { reason: "A reason that is long enough." },
        world.staff.client
      ],
      [
        "post",
        `/admin/organizations/applications/${application.id}/decision`,
        { decision: "APPROVE", reason: "A reason that is long enough." },
        world.staff.client
      ],
      ["post", `/organizations/${world.org.slug}/leave`, {}, world.rep.client]
    ];
    for (const [method, url, body, who] of writes) {
      const noToken = await who.agent[method as "post"](`/api/v1${url}`)
        .set("Origin", ORIGIN)
        .send(body);
      expect([method, url, noToken.status]).toEqual([method, url, 403]);
      const wrongOrigin = await who.agent[method as "post"](`/api/v1${url}`)
        .set("Origin", "https://evil.example")
        .set("X-CSRF-Token", who.csrf ?? "")
        .send(body);
      expect([method, url, wrongOrigin.status]).toEqual([method, url, 403]);
    }
    // Nothing changed.
    expect(await t.prisma.officialResponse.count()).toBe(0);
    expect(await t.prisma.organizationInvitation.count()).toBe(0);
    expect(
      (await t.prisma.organization.findUniqueOrThrow({ where: { id: world.org.id } })).status
    ).toBe("ACTIVE");
    expect(
      (await t.prisma.organizationApplication.findUniqueOrThrow({ where: { id: application.id } }))
        .status
    ).toBe("SUBMITTED");
  });

  it("never lets a shared cache keep private organization data, and sends the usual security headers", async () => {
    const world = await verifiedOrg(t);
    const { applicant, application } = await submitApplication(t);
    for (const [who, url] of [
      [applicant.client, `/organization-applications/${application.id}`],
      [world.admin.client, `/organizations/${world.org.slug}/members`],
      [world.admin.client, `/organizations/${world.org.slug}/invitations`],
      [world.staff.client, `/moderation/organization-applications/${application.id}`],
      [world.rep.client, "/organizations/mine"]
    ] as const) {
      const res = await who.get(url);
      expect([url, res.status]).toEqual([url, 200]);
      expect(res.headers["cache-control"] ?? "").not.toMatch(/public/);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    }
    const doc = await request(t.app.getHttpServer()).get("/api/v1/organizations");
    expect(doc.headers["x-content-type-options"]).toBe("nosniff");
    expect(doc.headers["x-powered-by"]).toBeUndefined();
  });

  it("limits how fast an invitation link can be probed", async () => {
    const guesses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await request(t.app.getHttpServer())
        .post("/api/v1/organization-invitations/check")
        .send({ token: "x".repeat(43) });
      guesses.push(res.status);
    }
    expect(guesses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(guesses[30]).toBe(429);
  });

  it("limits unauthenticated and authenticated writes separately per person", async () => {
    const a = await signedIn(t.app, t.prisma);
    const b = await signedIn(t.app, t.prisma);
    const apply = (c: typeof a.client, n: number) =>
      c.post("/organization-applications", {
        organization: {
          ...ORG_FIELDS,
          name: `Limit Test Body ${n} ${Math.random().toString(36).slice(2)}`
        }
      });
    const results: number[] = [];
    for (let i = 0; i < 12; i++) results.push((await apply(a.client, i)).status);
    expect(results).toContain(429);
    // Someone else is not slowed by it.
    expect((await apply(b.client, 99)).status).toBe(201);
  });
});
