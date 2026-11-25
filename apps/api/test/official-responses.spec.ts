import request from "supertest";
import {
  createApp,
  deliverEmail,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";
import {
  addMember,
  connectedReport,
  createOrg,
  plainReport,
  resolutionPhoto,
  verifiedOrg
} from "./org-helpers";

type Rep = Awaited<ReturnType<typeof verifiedOrg>>;

describe("Official responses", () => {
  let t: TestApp;
  const anon = () => request(t.app.getHttpServer());
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
    t.email.reset();
  });
  afterAll(() => t.close());

  const BODY = "We have received this report and a crew has been assigned to inspect the site.";
  const respond = (
    who: { client: { post: (u: string, b?: object) => request.Test } },
    reference: string,
    org: { slug: string },
    extra: Record<string, unknown> = {}
  ) =>
    who.client.post(`/reports/${reference}/official-responses`, {
      organizationSlug: org.slug,
      type: "ACKNOWLEDGEMENT",
      body: BODY,
      ...extra
    });
  const status = async (id: string) =>
    t.prisma.report.findUniqueOrThrow({
      where: { id },
      select: { status: true, verification: true }
    });

  /** A claim-ready setup: a connected report the representative has acknowledged and fixed, with a photograph. */
  async function claimable(world: Rep) {
    const { reporter, report } = await connectedReport(t, world.org.id, world.rep.user.id);
    const photo = await resolutionPhoto(world.rep.client, report.reference, world.org.slug);
    expect(photo.status).toBe(201);
    return { reporter, report, photoId: photo.body.id as string };
  }
  const claim = (
    world: Rep,
    reference: string,
    evidenceIds: string[],
    body = "The pothole was filled and the surface resealed on Tuesday."
  ) => respond(world.rep, reference, world.org, { type: "RESOLUTION_CLAIM", body, evidenceIds });

  describe("who may speak for an organization", () => {
    it("allows only an active administrator or representative of a verified, active organization with a confirmed address", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const member = await signedIn(t.app, t.prisma);
      await addMember(t.prisma, world.org.id, member.user.id, "MEMBER");
      const stranger = await signedIn(t.app, t.prisma);
      const moderator = await signedIn(t.app, t.prisma, "MODERATOR");
      const unconfirmed = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });
      await addMember(t.prisma, world.org.id, unconfirmed.user.id, "REPRESENTATIVE");

      expect(
        (await anon().post(`/api/v1/reports/${report.reference}/official-responses`).send({}))
          .status
      ).toBe(401);
      expect((await respond(stranger, report.reference, world.org)).body.code).toBe(
        "NOT_ORGANIZATION_MEMBER"
      );
      expect((await respond(moderator, report.reference, world.org)).body.code).toBe(
        "NOT_ORGANIZATION_MEMBER"
      );
      expect((await respond(member, report.reference, world.org)).body.code).toBe(
        "ROLE_CANNOT_RESPOND"
      );
      expect((await respond(unconfirmed, report.reference, world.org)).status).toBe(403);
      expect((await respond(world.rep, report.reference, world.org)).status).toBe(201);
      expect(
        (await respond(world.admin, report.reference, world.org, { type: "UPDATE" })).status
      ).toBe(201);
    });

    it("does not let membership of one organization speak for another", async () => {
      const a = await verifiedOrg(t, "Alpha Roads Authority");
      const b = await verifiedOrg(t, "Bravo Water Board");
      const { report } = await connectedReport(t, b.org.id, b.rep.user.id);
      const res = await respond(a.rep, report.reference, b.org);
      expect(res.status).toBe(403);
      expect(await t.prisma.officialResponse.count()).toBe(0);
    });

    it("stops a representative the moment their membership is removed, without signing them out", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      expect((await respond(world.rep, report.reference, world.org)).status).toBe(201);
      await t.prisma.organizationMember.updateMany({
        where: { userId: world.rep.user.id },
        data: { status: "REVOKED", revokedAt: new Date() }
      });
      expect((await world.rep.client.get("/auth/me")).status).toBe(200);
      expect(
        (await respond(world.rep, report.reference, world.org, { type: "UPDATE" })).body.code
      ).toBe("NOT_ORGANIZATION_MEMBER");
    });

    it("stops everyone in an organization the moment it is suspended, and resumes on reinstatement", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const reason = { reason: "Investigating a complaint about impersonation." };
      expect(
        (await world.staff.client.post(`/admin/organizations/${world.org.id}/suspend`, reason))
          .status
      ).toBe(204);
      const blocked = await respond(world.rep, report.reference, world.org);
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe("ORGANIZATION_SUSPENDED");
      expect(
        (await world.staff.client.post(`/admin/organizations/${world.org.id}/reinstate`, reason))
          .status
      ).toBe(204);
      expect((await respond(world.rep, report.reference, world.org)).status).toBe(201);
    });

    it("stops everyone the moment verification is revoked, but leaves earlier statements on the record", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      expect((await respond(world.rep, report.reference, world.org)).status).toBe(201);
      const revoke = await world.staff.client.post(
        `/admin/organizations/${world.org.id}/revoke-verification`,
        {
          reason: "The organization could not show it exists as described."
        }
      );
      expect(revoke.status).toBe(204);
      const after = await respond(world.rep, report.reference, world.org, { type: "UPDATE" });
      expect(after.status).toBe(409);
      expect(after.body.code).toBe("ORGANIZATION_NOT_VERIFIED");
      // The earlier statement is still there, and now carries the current (revoked) state on its badge.
      const detail = (await anon().get(`/api/v1/reports/${report.reference}`)).body;
      expect(detail.officialResponses).toHaveLength(1);
      expect(detail.officialResponses[0].organization.verified).toBe(false);
      expect(detail.officialResponses[0].organization.verificationStatus).toBe("REVOKED");
    });

    it("never lets an unverified organization respond, whatever its members' roles", async () => {
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      const org = await createOrg(t.prisma, { createdById: staff.user.id });
      const admin = await signedIn(t.app, t.prisma);
      await addMember(t.prisma, org.id, admin.user.id, "ADMIN");
      const { report } = await plainReport(t);
      const res = await respond(admin, report.reference, org);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ORGANIZATION_NOT_VERIFIED");
    });
  });

  describe("connecting an organization to a report", () => {
    it("requires a connection before an organization responds", async () => {
      const world = await verifiedOrg(t);
      const { report } = await plainReport(t);
      expect((await respond(world.rep, report.reference, world.org)).body.code).toBe(
        "NOT_CONNECTED"
      );
    });

    it("lets a representative add their own organization, labelled as self-added and not as an assignment", async () => {
      const world = await verifiedOrg(t);
      const { report } = await plainReport(t);
      const added = await world.rep.client.post(`/reports/${report.reference}/organizations`, {
        organizationSlug: world.org.slug
      });
      expect(added.status).toBe(204);
      const relation = await t.prisma.reportOrganization.findFirstOrThrow({
        where: { reportId: report.id }
      });
      expect(relation).toMatchObject({
        basis: "ORGANIZATION_ADDED",
        status: "ACTIVE",
        acknowledgedAt: null
      });
      const detail = (await anon().get(`/api/v1/reports/${report.reference}`)).body;
      expect(detail.organizations[0]).toMatchObject({
        basis: "ORGANIZATION_ADDED",
        status: "ACTIVE",
        acknowledgedAt: null
      });
      expect(detail.timeline.at(-1)).toMatchObject({
        type: "ORGANIZATION_LINKED",
        actorRole: "ORGANIZATION"
      });
      expect(
        (
          await world.rep.client.post(`/reports/${report.reference}/organizations`, {
            organizationSlug: world.org.slug
          })
        ).body.code
      ).toBe("ALREADY_CONNECTED");
    });

    it("lets the reporter suggest a listed organization, which is only a suggestion until the organization acts", async () => {
      const world = await verifiedOrg(t);
      const { reporter, report } = await plainReport(t);
      expect(
        (
          await reporter.client.post(`/reports/${report.reference}/organizations`, {
            organizationSlug: world.org.slug
          })
        ).status
      ).toBe(204);
      expect(
        await t.prisma.reportOrganization.findFirstOrThrow({ where: { reportId: report.id } })
      ).toMatchObject({ basis: "REPORTER_SUGGESTED", status: "PROPOSED" });
      // The organization is told, in terms that do not imply responsibility.
      const told = await t.prisma.notification.findMany({
        where: { userId: world.admin.user.id, type: "ORGANIZATION" }
      });
      expect(told).toHaveLength(1);
      expect(told[0]!.body).toMatch(/not accepting responsibility/i);
      // The reporter, who made the suggestion, is not told about it.
      expect(await t.prisma.notification.count({ where: { userId: reporter.user.id } })).toBe(0);
      // The organization may now respond; a claim also confirms the connection.
      expect((await respond(world.rep, report.reference, world.org)).status).toBe(201);
    });

    it("refuses suggestions from other residents, and for unlisted or unknown organizations", async () => {
      const world = await verifiedOrg(t);
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      const hidden = await createOrg(t.prisma, { createdById: staff.user.id });
      const { reporter, report } = await plainReport(t);
      const other = await signedIn(t.app, t.prisma);
      expect(
        (
          await other.client.post(`/reports/${report.reference}/organizations`, {
            organizationSlug: world.org.slug
          })
        ).status
      ).toBe(403);
      expect(
        (
          await reporter.client.post(`/reports/${report.reference}/organizations`, {
            organizationSlug: hidden.slug
          })
        ).status
      ).toBe(404);
      expect(
        (
          await reporter.client.post(`/reports/${report.reference}/organizations`, {
            organizationSlug: "no-such-org"
          })
        ).status
      ).toBe(404);
      expect(
        (
          await anon()
            .post(`/api/v1/reports/${report.reference}/organizations`)
            .send({ organizationSlug: world.org.slug })
        ).status
      ).toBe(401);
    });

    it("lets a plain member neither add the organization nor respond", async () => {
      const world = await verifiedOrg(t);
      const member = await signedIn(t.app, t.prisma);
      await addMember(t.prisma, world.org.id, member.user.id, "MEMBER");
      const { report } = await plainReport(t);
      expect(
        (
          await member.client.post(`/reports/${report.reference}/organizations`, {
            organizationSlug: world.org.slug
          })
        ).status
      ).toBe(403);
    });

    it("caps how many organizations one report can have suggested", async () => {
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      const { reporter, report } = await plainReport(t);
      const results: number[] = [];
      for (let i = 0; i < 6; i++) {
        const org = await createOrg(t.prisma, { verified: true, createdById: staff.user.id });
        results.push(
          (
            await reporter.client.post(`/reports/${report.reference}/organizations`, {
              organizationSlug: org.slug
            })
          ).status
        );
      }
      expect(results.filter((s) => s === 204).length).toBeLessThan(6);
      expect(results.at(-1)).toBe(409);
    });

    it("lets staff assign and remove, and a removed organization stays out until staff restore it", async () => {
      const world = await verifiedOrg(t);
      const { report } = await plainReport(t);
      const base = `/moderation/reports/${report.reference}/organizations`;
      expect(
        (
          await world.staff.client.post(`/reports/${report.reference}/organizations`, {
            organizationSlug: world.org.slug
          })
        ).status
      ).toBe(204);
      expect(
        await t.prisma.reportOrganization.findFirstOrThrow({ where: { reportId: report.id } })
      ).toMatchObject({ basis: "STAFF_ASSIGNED", status: "ACTIVE" });
      expect((await respond(world.rep, report.reference, world.org)).status).toBe(201);
      expect(
        (
          await world.staff.client.post(base, {
            organizationSlug: world.org.slug,
            status: "REMOVED",
            reason: "Wrong jurisdiction entirely."
          })
        ).status
      ).toBe(204);
      expect(
        (await respond(world.rep, report.reference, world.org, { type: "UPDATE" })).body.code
      ).toBe("ORGANIZATION_REMOVED");
      expect(
        (
          await world.rep.client.post(`/reports/${report.reference}/organizations`, {
            organizationSlug: world.org.slug
          })
        ).status
      ).toBe(403);
      expect(
        (
          await world.staff.client.post(base, {
            organizationSlug: world.org.slug,
            status: "ACTIVE",
            reason: "Restored after review."
          })
        ).status
      ).toBe(204);
      expect(
        (await respond(world.rep, report.reference, world.org, { type: "UPDATE" })).status
      ).toBe(201);
      // The reason is in the audit trail and not on the public timeline.
      const detail = JSON.stringify((await anon().get(`/api/v1/reports/${report.reference}`)).body);
      expect(detail).not.toContain("Wrong jurisdiction entirely.");
      expect(
        await t.prisma.auditLog.count({
          where: { action: "organization.report_connection_changed" }
        })
      ).toBe(2);
      // Moderators may; ordinary residents may not.
      const resident = await signedIn(t.app, t.prisma);
      expect(
        (
          await resident.client.post(base, {
            organizationSlug: world.org.slug,
            status: "REMOVED",
            reason: "Because I want to."
          })
        ).status
      ).toBe(403);
    });
  });

  describe("what each kind of response may do", () => {
    it("acknowledges: moves a new report to Acknowledged, labelled as the organization's statement", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const res = await respond(world.rep, report.reference, world.org);
      expect(res.status).toBe(201);
      expect(await status(report.id)).toEqual({ status: "ACKNOWLEDGED", verification: "NONE" });
      const history = await t.prisma.reportStatusHistory.findFirstOrThrow({
        where: { reportId: report.id, toStatus: "ACKNOWLEDGED" }
      });
      expect(history).toMatchObject({
        basis: "ORGANIZATION_STATEMENT",
        organizationId: world.org.id,
        responseId: res.body.id,
        actorId: world.rep.user.id
      });
      expect(
        (await t.prisma.reportOrganization.findFirstOrThrow({ where: { reportId: report.id } }))
          .acknowledgedAt
      ).not.toBeNull();
      const detail = (await anon().get(`/api/v1/reports/${report.reference}`)).body;
      expect(detail.officialResponses[0]).toMatchObject({
        type: "ACKNOWLEDGEMENT",
        statusChange: { from: "SUBMITTED", to: "ACKNOWLEDGED" },
        organization: { verified: true },
        authorName: world.rep.user.displayName
      });
      const label = detail.timeline.find(
        (e: { type: string; actorRole: string }) =>
          e.type === "STATUS_CHANGED" && e.actorRole === "ORGANIZATION"
      );
      expect(label).toMatchObject({ actorLabel: world.org.name, basis: "ORGANIZATION_STATEMENT" });
    });

    it("acknowledging again changes nothing about the status and does not duplicate the change", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      await respond(world.rep, report.reference, world.org);
      expect((await respond(world.rep, report.reference, world.org)).status).toBe(201);
      expect(
        await t.prisma.reportStatusHistory.count({
          where: { reportId: report.id, basis: "ORGANIZATION_STATEMENT" }
        })
      ).toBe(1);
    });

    it("records progress only after an acknowledgement; a delay or plain update never changes the status", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const early = await respond(world.rep, report.reference, world.org, {
        type: "UPDATE",
        markInProgress: true
      });
      expect(early.status).toBe(409);
      expect(early.body.code).toBe("INVALID_TRANSITION");
      expect(
        (
          await respond(world.rep, report.reference, world.org, {
            type: "DELAY",
            body: "Materials are delayed by two weeks owing to supply problems."
          })
        ).status
      ).toBe(201);
      expect(
        (
          await respond(world.rep, report.reference, world.org, {
            type: "UPDATE",
            body: "Surveying the site this week before repair."
          })
        ).status
      ).toBe(201);
      expect((await status(report.id)).status).toBe("SUBMITTED");
      await respond(world.rep, report.reference, world.org);
      expect(
        (
          await respond(world.rep, report.reference, world.org, {
            type: "UPDATE",
            markInProgress: true,
            body: "Repair work has begun on the carriageway."
          })
        ).status
      ).toBe(201);
      expect((await status(report.id)).status).toBe("IN_PROGRESS");
    });

    it("states 'outside our remit' as a statement, without closing or rejecting the report", async () => {
      const world = await verifiedOrg(t);
      const { report, reporter } = await connectedReport(t, world.org.id, world.rep.user.id);
      const photo = await resolutionPhoto(world.rep.client, report.reference, world.org.slug);
      const res = await respond(world.rep, report.reference, world.org, {
        type: "OUT_OF_REMIT",
        body: "This stretch of road is maintained by the federal highway authority."
      });
      expect(res.status).toBe(201);
      expect((await status(report.id)).status).toBe("SUBMITTED");
      const relation = await t.prisma.reportOrganization.findFirstOrThrow({
        where: { reportId: report.id }
      });
      expect(relation.status).toBe("OUTSIDE_REMIT");
      expect(relation.outsideRemitAt).not.toBeNull();
      const note = await t.prisma.notification.findFirstOrThrow({
        where: { userId: reporter.user.id, type: "OFFICIAL_RESPONSE" }
      });
      expect(note.body).toMatch(/organization's statement, not a finding/i);
      // It then shows in the staff queue so a person can decide who is responsible.
      const queue = await world.staff.client.get(
        "/moderation/organization-relations?status=OUTSIDE_REMIT"
      );
      expect(queue.status).toBe(200);
      expect(queue.body.items).toHaveLength(1);
      // The organization cannot then claim a fix without taking the report back.
      expect((await claim(world, report.reference, [photo.body.id])).body.code).toBe(
        "OUTSIDE_REMIT"
      );
      // And it can no longer add photographs until the connection is active again.
      expect(
        (await resolutionPhoto(world.rep.client, report.reference, world.org.slug, 180)).body.code
      ).toBe("NOT_CONNECTED");
      expect((await respond(world.rep, report.reference, world.org)).status).toBe(201);
      expect(
        (await t.prisma.reportOrganization.findFirstOrThrow({ where: { reportId: report.id } }))
          .status
      ).toBe("ACTIVE");
    });

    it("validates the body and the type", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      expect((await respond(world.rep, report.reference, world.org, { body: "ok" })).status).toBe(
        400
      );
      expect(
        (await respond(world.rep, report.reference, world.org, { body: "x".repeat(3000) })).status
      ).toBe(400);
      expect(
        (await respond(world.rep, report.reference, world.org, { type: "ENDORSEMENT" })).status
      ).toBe(400);
      expect(
        (
          await respond(world.rep, report.reference, world.org, {
            body: "          \n\n        ....  "
          })
        ).status
      ).toBe(400);
      expect(
        (await respond(world.rep, report.reference, world.org, { supersedesId: "not-a-uuid" }))
          .status
      ).toBe(400);
      expect(
        (
          await respond(world.rep, report.reference, world.org, {
            type: "UPDATE",
            supersedesId: "6f4b1d6a-2a0f-4b52-9d88-2d6fb2c1d111"
          })
        ).body.code
      ).toBe("SUPERSEDES_NOT_ALLOWED");
      expect((await respond(world.rep, "not-a-reference", world.org)).status).toBe(404);
      expect((await respond(world.rep, "SW-ZZZZ-9999", world.org)).status).toBe(404);
    });

    it("stores text as text: markup is kept inert and control characters are removed", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const hostile =
        "<img src=x onerror=alert(1)> Crew assigned.\u0000 to inspect the damaged road surface";
      const res = await respond(world.rep, report.reference, world.org, { body: hostile });
      expect(res.status).toBe(201);
      const stored = (
        await t.prisma.officialResponse.findUniqueOrThrow({ where: { id: res.body.id } })
      ).body;
      expect(stored).not.toContain("\u0000");
      const served = (await anon().get(`/api/v1/reports/${report.reference}`)).body
        .officialResponses[0].body as string;
      expect(served).toBe(stored);
    });

    it("refuses to respond on a hidden or rejected report, except to correct what was said before", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const first = await respond(world.rep, report.reference, world.org);
      await world.staff.client.post(`/reports/${report.reference}/status`, {
        status: "REJECTED",
        note: "This is not a municipal matter at all."
      });
      const closed = await respond(world.rep, report.reference, world.org, { type: "UPDATE" });
      expect(closed.status).toBe(409);
      expect(closed.body.code).toBe("REPORT_CLOSED");
      expect(
        (
          await respond(world.rep, report.reference, world.org, {
            type: "CORRECTION",
            supersedesId: first.body.id,
            body: "Correction: we acknowledged this by mistake."
          })
        ).status
      ).toBe(201);
      await world.staff.client.post(`/moderation/reports/${report.reference}/actions`, {
        action: "HIDE",
        policy: "SPAM",
        reason: "Hidden for a moderation review."
      });
      expect(
        (await respond(world.rep, report.reference, world.org, { type: "UPDATE" })).status
      ).toBe(404);
    });
  });

  describe("corrections and withdrawals", () => {
    it("adds a new entry that points at the old one, and never edits or deletes the old one", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const first = await respond(world.rep, report.reference, world.org, {
        body: "Work will be completed by the end of March this year."
      });
      const before = await t.prisma.officialResponse.findUniqueOrThrow({
        where: { id: first.body.id }
      });
      const fix = await respond(world.rep, report.reference, world.org, {
        type: "CORRECTION",
        supersedesId: first.body.id,
        body: "Correction: work will be completed by the end of May."
      });
      expect(fix.status).toBe(201);
      expect(
        await t.prisma.officialResponse.findUniqueOrThrow({ where: { id: first.body.id } })
      ).toEqual(before);
      const detail = (await anon().get(`/api/v1/reports/${report.reference}`)).body;
      expect(detail.officialResponses.map((r: { type: string }) => r.type)).toEqual([
        "ACKNOWLEDGEMENT",
        "CORRECTION"
      ]);
      expect(detail.officialResponses[0].supersededById).toBe(fix.body.id);
      expect(detail.officialResponses[1].supersedesId).toBe(first.body.id);
      expect(detail.officialResponses[0].body).toBe(before.body);
    });

    it("insists on naming what is replaced, which must be the organization's own newest statement on that report", async () => {
      const world = await verifiedOrg(t);
      const other = await verifiedOrg(t, "Other Works Agency");
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      await t.prisma.reportOrganization.create({
        data: {
          reportId: report.id,
          organizationId: other.org.id,
          basis: "ORGANIZATION_ADDED",
          status: "ACTIVE",
          addedById: other.rep.user.id
        }
      });
      const mine = await respond(world.rep, report.reference, world.org);
      const theirs = await respond(other.rep, report.reference, other.org);
      const withdraw = (who: Rep, id?: string) =>
        respond(who.rep, report.reference, who.org, {
          type: "WITHDRAWAL",
          body: "Withdrawn: this statement was issued in error.",
          ...(id ? { supersedesId: id } : {})
        });
      expect((await withdraw(world)).body.code).toBe("SUPERSEDES_REQUIRED");
      expect((await withdraw(world, theirs.body.id)).status).toBe(404);
      const { report: elsewhere } = await connectedReport(t, world.org.id, world.rep.user.id);
      expect(
        (
          await respond(world.rep, elsewhere.reference, world.org, {
            type: "WITHDRAWAL",
            body: "Withdrawn: this statement was issued in error.",
            supersedesId: mine.body.id
          })
        ).status
      ).toBe(404);
      expect((await withdraw(world, mine.body.id)).status).toBe(201);
      expect((await withdraw(world, mine.body.id)).body.code).toBe("ALREADY_SUPERSEDED");
    });

    it("lets exactly one of two simultaneous corrections of the same statement win", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const first = await respond(world.rep, report.reference, world.org);
      const attempt = (who: typeof world.rep, n: number) =>
        respond(who, report.reference, world.org, {
          type: "CORRECTION",
          supersedesId: first.body.id,
          body: `Correction number ${n}: details were wrong earlier.`
        });
      const results = await Promise.all([attempt(world.rep, 1), attempt(world.admin, 2)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await t.prisma.officialResponse.count({ where: { supersedesId: first.body.id } })
      ).toBe(1);
    });

    it("withdrawing a standing resolution claim reopens the report rather than leaving a false 'resolved'", async () => {
      const world = await verifiedOrg(t);
      const { report, photoId } = await claimable(world);
      const made = await claim(world, report.reference, [photoId]);
      expect(made.status).toBe(201);
      const retract = await respond(world.rep, report.reference, world.org, {
        type: "WITHDRAWAL",
        supersedesId: made.body.id,
        body: "Withdrawn: the repair failed inspection and the hole has reopened."
      });
      expect(retract.status).toBe(201);
      expect(await status(report.id)).toEqual({ status: "REOPENED", verification: "NONE" });
      const history = await t.prisma.reportStatusHistory.findFirstOrThrow({
        where: { reportId: report.id, toStatus: "REOPENED" }
      });
      expect(history).toMatchObject({
        basis: "ORGANIZATION_STATEMENT",
        organizationId: world.org.id
      });
    });

    it("does not let an organization withdraw a resolution that Sidewalk staff have verified", async () => {
      const world = await verifiedOrg(t);
      const { report, photoId } = await claimable(world);
      const made = await claim(world, report.reference, [photoId]);
      const verifier = await signedIn(t.app, t.prisma, "MODERATOR");
      expect(
        (await verifier.client.post(`/reports/${report.reference}/verification`, {})).status
      ).toBe(200);
      const retract = await respond(world.rep, report.reference, world.org, {
        type: "WITHDRAWAL",
        supersedesId: made.body.id,
        body: "Withdrawn: we no longer wish to stand behind this claim."
      });
      expect(retract.status).toBe(409);
      expect(retract.body.code).toBe("CLAIM_VERIFIED");
      expect(await status(report.id)).toEqual({ status: "RESOLVED", verification: "VERIFIED" });
    });
  });

  describe("resolution claims versus independent verification", () => {
    it("requires the organization's own photograph, from the same organization, not yet used", async () => {
      const world = await verifiedOrg(t);
      const rival = await verifiedOrg(t, "Rival Public Works");
      const { report, reporter, photoId } = await claimable(world);
      expect((await claim(world, report.reference, [])).body.code).toBe("EVIDENCE_REQUIRED");
      expect((await claim(world, report.reference, [])).status).toBe(400);
      // Evidence of the reporter's (kind REPORT) or of another organization is not available to this claim.
      const reporterPhoto = await reporter.client.upload(
        `/reports/${report.reference}/evidence`,
        await (await import("./helpers")).pngImage(140, 100),
        "mine.png",
        { kind: "REPORT" }
      );
      expect((await claim(world, report.reference, [reporterPhoto.body.id])).body.code).toBe(
        "EVIDENCE_NOT_AVAILABLE"
      );
      await t.prisma.reportOrganization.create({
        data: {
          reportId: report.id,
          organizationId: rival.org.id,
          basis: "STAFF_ASSIGNED",
          status: "ACTIVE",
          addedById: rival.staff.user.id
        }
      });
      const rivalPhoto = await resolutionPhoto(
        rival.rep.client,
        report.reference,
        rival.org.slug,
        150
      );
      expect((await claim(world, report.reference, [rivalPhoto.body.id])).body.code).toBe(
        "EVIDENCE_NOT_AVAILABLE"
      );
      expect(
        (await claim(world, report.reference, [photoId, "6f4b1d6a-2a0f-4b52-9d88-2d6fb2c1d111"]))
          .body.code
      ).toBe("EVIDENCE_NOT_AVAILABLE");
      expect((await claim(world, report.reference, [photoId])).status).toBe(201);
    });

    it("marks the report Resolved but only 'claimed', says whose claim it is, and attaches the photographs to the claim", async () => {
      const world = await verifiedOrg(t);
      const { report, photoId } = await claimable(world);
      const made = await claim(world, report.reference, [photoId]);
      expect(made.status).toBe(201);
      expect(await status(report.id)).toEqual({ status: "RESOLVED", verification: "CLAIMED" });
      const row = await t.prisma.reportEvidence.findUniqueOrThrow({ where: { id: photoId } });
      expect(row).toMatchObject({
        responseId: made.body.id,
        organizationId: world.org.id,
        kind: "RESOLUTION"
      });
      const detail = (await anon().get(`/api/v1/reports/${report.reference}`)).body;
      expect(detail).toMatchObject({ status: "RESOLVED", verification: "CLAIMED" });
      expect(detail.officialResponses[0]).toMatchObject({
        type: "RESOLUTION_CLAIM",
        statusChange: { to: "RESOLVED" }
      });
      expect(detail.officialResponses[0].evidence[0]).toMatchObject({
        id: photoId,
        organization: { slug: world.org.slug }
      });
      expect(detail.resolutionEvidence.map((e: { id: string }) => e.id)).toContain(photoId);
      // A photograph that is part of a claim cannot be reused for another.
      const again = await claim(world, report.reference, [photoId]);
      expect(again.status).toBe(409);
    });

    it("lets a claim be made straight from Submitted and from In Progress, but not twice", async () => {
      const world = await verifiedOrg(t);
      const { report, photoId } = await claimable(world);
      await respond(world.rep, report.reference, world.org);
      await respond(world.rep, report.reference, world.org, {
        type: "UPDATE",
        markInProgress: true,
        body: "Repair work began on the carriageway."
      });
      expect((await claim(world, report.reference, [photoId])).status).toBe(201);
      const second = await resolutionPhoto(world.rep.client, report.reference, world.org.slug, 160);
      expect((await claim(world, report.reference, [second.body.id])).body.code).toBe(
        "INVALID_TRANSITION"
      );
    });

    it("lets exactly one of two simultaneous claims win", async () => {
      const world = await verifiedOrg(t);
      const { report, photoId } = await claimable(world);
      const other = await resolutionPhoto(
        world.admin.client,
        report.reference,
        world.org.slug,
        170
      );
      const results = await Promise.all([
        respond(world.rep, report.reference, world.org, {
          type: "RESOLUTION_CLAIM",
          body: "Resolved by the east district road crew.",
          evidenceIds: [photoId]
        }),
        respond(world.admin, report.reference, world.org, {
          type: "RESOLUTION_CLAIM",
          body: "Resolved by the west district road crew.",
          evidenceIds: [other.body.id]
        })
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await t.prisma.officialResponse.count({ where: { type: "RESOLUTION_CLAIM" } })).toBe(
        1
      );
      expect(
        await t.prisma.reportStatusHistory.count({
          where: { reportId: report.id, toStatus: "RESOLVED" }
        })
      ).toBe(1);
    });

    it("is not verification: an organization cannot verify, close, reject, reopen or change status through the ordinary routes", async () => {
      const world = await verifiedOrg(t);
      const { report, photoId } = await claimable(world);
      await claim(world, report.reference, [photoId]);
      expect(
        (await world.rep.client.post(`/reports/${report.reference}/verification`, {})).status
      ).toBe(403);
      expect(
        (await world.admin.client.post(`/reports/${report.reference}/verification`, {})).status
      ).toBe(403);
      expect(
        (
          await world.rep.client.post(`/reports/${report.reference}/status`, {
            status: "REOPENED",
            note: "Trying something unusual here."
          })
        ).status
      ).toBe(403);
      expect(
        (
          await world.rep.client.post(`/reports/${report.reference}/status`, {
            status: "RESOLVED",
            note: "Making the same claim twice over."
          })
        ).status
      ).toBe(403);
      expect(await status(report.id)).toEqual({ status: "RESOLVED", verification: "CLAIMED" });
    });

    it("does not let the organization's own claim be verified by the reporter or by whoever recorded it", async () => {
      const world = await verifiedOrg(t);
      const { report, photoId } = await claimable(world);
      await claim(world, report.reference, [photoId]);
      const independent = await signedIn(t.app, t.prisma, "MODERATOR");
      expect(
        (await independent.client.post(`/reports/${report.reference}/verification`, {})).status
      ).toBe(200);
      expect(await status(report.id)).toEqual({ status: "RESOLVED", verification: "VERIFIED" });
      // The claim's own photograph is what the verifier relied on, and it was uploaded by someone else.
      const event = await t.prisma.activityEvent.findFirstOrThrow({
        where: { reportId: report.id, type: "RESOLUTION_VERIFIED" }
      });
      expect(event.actorId).toBe(independent.user.id);
    });

    it("refuses verification by staff who belong to the claiming organization, now or since the claim", async () => {
      const world = await verifiedOrg(t);
      const { report, photoId } = await claimable(world);
      await claim(world, report.reference, [photoId]);

      const insider = await signedIn(t.app, t.prisma, "MODERATOR");
      await addMember(t.prisma, world.org.id, insider.user.id, "MEMBER");
      const refused = await insider.client.post(`/reports/${report.reference}/verification`, {});
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("ORGANIZATION_CONFLICT");

      // Leaving after the claim does not clear the conflict.
      const leaver = await signedIn(t.app, t.prisma, "ADMIN");
      await addMember(t.prisma, world.org.id, leaver.user.id, "MEMBER");
      await leaver.client.post(`/organizations/${world.org.slug}/leave`, {});
      expect(
        (await leaver.client.post(`/reports/${report.reference}/verification`, {})).body.code
      ).toBe("ORGANIZATION_CONFLICT");

      // A member of a different organization connected to the same report is conflicted too.
      const other = await verifiedOrg(t, "Co-responsible Utilities");
      await t.prisma.reportOrganization.create({
        data: {
          reportId: report.id,
          organizationId: other.org.id,
          basis: "STAFF_ASSIGNED",
          status: "ACTIVE",
          addedById: other.staff.user.id
        }
      });
      const colleague = await signedIn(t.app, t.prisma, "MODERATOR");
      await addMember(t.prisma, other.org.id, colleague.user.id, "MEMBER");
      expect(
        (await colleague.client.post(`/reports/${report.reference}/verification`, {})).body.code
      ).toBe("ORGANIZATION_CONFLICT");

      // Someone unrelated still can.
      expect(
        (await world.staff.client.post(`/reports/${report.reference}/verification`, {})).status
      ).toBe(200);
      expect(await status(report.id)).toEqual({ status: "RESOLVED", verification: "VERIFIED" });
    });

    it("tells the organization when its claim is disputed or verified, and tells the person who acted nothing", async () => {
      const world = await verifiedOrg(t);
      const { reporter, report, photoId } = await claimable(world);
      await claim(world, report.reference, [photoId]);
      expect(
        (
          await reporter.client.post(`/reports/${report.reference}/status`, {
            status: "REOPENED",
            note: "The hole is still there and has got bigger."
          })
        ).status
      ).toBe(200);
      for (const m of [world.admin, world.rep])
        expect(
          await t.prisma.notification.count({
            where: { userId: m.user.id, reportId: report.id, title: { contains: "reopen" } }
          })
        ).toBe(1);
      expect(
        await t.prisma.notification.count({
          where: {
            userId: reporter.user.id,
            reportId: report.id,
            type: "STATUS_CHANGED",
            title: { contains: "reopen" }
          }
        })
      ).toBe(0);
    });
  });

  describe("who hears about it", () => {
    it("notifies the reporter and followers once each, never the author, and never twice for one response", async () => {
      const world = await verifiedOrg(t);
      const { reporter, report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const follower = await signedIn(t.app, t.prisma);
      await follower.client.put(`/reports/${report.reference}/follow`, {});
      const res = await respond(world.rep, report.reference, world.org);
      expect(res.status).toBe(201);
      for (const u of [reporter, follower]) {
        const rows = await t.prisma.notification.findMany({
          where: { userId: u.user.id, dedupeKey: `response:${res.body.id}` }
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]!.type).toBe("OFFICIAL_RESPONSE");
        expect(rows[0]!.title).toContain(world.org.name);
      }
      expect(await t.prisma.notification.count({ where: { userId: world.rep.user.id } })).toBe(0);
      // The status change an acknowledgement carried is described in that one message, not announced separately.
      expect(
        await t.prisma.notification.count({
          where: { userId: reporter.user.id, reportId: report.id }
        })
      ).toBe(1);
    });

    it("labels a claim as a claim in what it sends", async () => {
      const world = await verifiedOrg(t);
      const { reporter, report, photoId } = await claimable(world);
      await claim(world, report.reference, [photoId]);
      const note = await t.prisma.notification.findFirstOrThrow({
        where: { userId: reporter.user.id, type: "RESOLUTION_CLAIMED" }
      });
      expect(note.title).toMatch(/says .* is resolved/);
      expect(note.body).toMatch(/not been independently verified/i);
    });
  });

  describe("the record cannot be rewritten", () => {
    it("is enforced by the database even for code with direct access", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const res = await respond(world.rep, report.reference, world.org);
      await expect(
        t.prisma.officialResponse.update({
          where: { id: res.body.id },
          data: { body: "Rewritten history, never said." }
        })
      ).rejects.toThrow();
      await expect(
        t.prisma.officialResponse.update({
          where: { id: res.body.id },
          data: { organizationName: "Someone Else" }
        })
      ).rejects.toThrow();
      await expect(
        t.prisma.officialResponse.delete({ where: { id: res.body.id } })
      ).rejects.toThrow();
      // Only the moderation state moves.
      await expect(
        t.prisma.officialResponse.update({
          where: { id: res.body.id },
          data: { moderationState: "HIDDEN" }
        })
      ).resolves.toBeDefined();
    });

    it("keeps who said what when the organization is later renamed", async () => {
      const world = await verifiedOrg(t, "Original Works Department");
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      await respond(world.rep, report.reference, world.org);
      await t.prisma.organization.update({
        where: { id: world.org.id },
        data: { name: "Renamed Works Department" }
      });
      const shown = (await anon().get(`/api/v1/reports/${report.reference}`)).body
        .officialResponses[0];
      expect(shown.organization.name).toBe("Original Works Department");
    });
  });

  describe("visibility, leakage and moderation", () => {
    it("exposes nothing about the author or organization beyond the allow-list", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      await respond(world.rep, report.reference, world.org);
      const text = JSON.stringify((await anon().get(`/api/v1/reports/${report.reference}`)).body);
      for (const secret of [
        world.rep.user.email,
        world.rep.user.id,
        world.admin.user.email,
        world.admin.user.id,
        world.staff.user.email,
        "passwordHash",
        "tokenHash",
        "authorId",
        "createdById",
        "reviewerNotes"
      ])
        expect(text).not.toContain(secret);
    });

    it("lets residents flag a statement, once; members of the organization correct it instead", async () => {
      const world = await verifiedOrg(t);
      const { report, reporter } = await connectedReport(t, world.org.id, world.rep.user.id);
      const res = await respond(world.rep, report.reference, world.org);
      const flag = (who: { client: { post: (u: string, b?: object) => request.Test } }) =>
        who.client.post(`/official-responses/${res.body.id}/flags`, {
          reason: "MISLEADING",
          details: "No crew came here at all."
        });
      expect((await flag(reporter)).status).toBe(204);
      expect((await flag(reporter)).body.code).toBe("ALREADY_FLAGGED");
      expect((await flag(world.admin)).body.code).toBe("OWN_CONTENT");
      expect(
        (
          await anon()
            .post(`/api/v1/official-responses/${res.body.id}/flags`)
            .send({ reason: "SPAM" })
        ).status
      ).toBe(401);
      expect((await world.staff.client.get("/moderation/flags")).body.items[0]).toMatchObject({
        target: "OFFICIAL_RESPONSE"
      });
    });

    it("lets staff hide a statement: it disappears for the public but stays for staff and the organization, with an audit record", async () => {
      const world = await verifiedOrg(t);
      const { report, reporter } = await connectedReport(t, world.org.id, world.rep.user.id);
      const res = await respond(world.rep, report.reference, world.org, {
        body: "Contact our director on his personal mobile number now."
      });
      const act = {
        action: "HIDE",
        policy: "PRIVACY_EXPOSURE",
        reason: "It publishes a private phone number."
      };
      const mod = await signedIn(t.app, t.prisma, "MODERATOR");
      expect(
        (await reporter.client.post(`/moderation/official-responses/${res.body.id}/actions`, act))
          .status
      ).toBe(403);
      expect(
        (await mod.client.post(`/moderation/official-responses/${res.body.id}/actions`, act)).body
      ).toEqual({ moderationState: "HIDDEN" });

      expect(
        (await anon().get(`/api/v1/reports/${report.reference}`)).body.officialResponses
      ).toHaveLength(0);
      expect(
        (await reporter.client.get(`/reports/${report.reference}`)).body.officialResponses
      ).toHaveLength(0);
      expect(
        (await world.rep.client.get(`/reports/${report.reference}`)).body.officialResponses[0]
      ).toMatchObject({ id: res.body.id, moderationState: "HIDDEN" });
      expect(
        (await mod.client.get(`/reports/${report.reference}`)).body.officialResponses[0]
          .moderationState
      ).toBe("HIDDEN");
      expect(
        (await anon().get(`/api/v1/organizations/${world.org.slug}/responses`)).body
      ).toHaveLength(0);
      expect((await anon().post(`/api/v1/official-responses/${res.body.id}/flags`)).status).toBe(
        401
      );
      expect(
        await t.prisma.moderationAction.count({
          where: { responseId: res.body.id, target: "OFFICIAL_RESPONSE" }
        })
      ).toBe(1);

      expect(
        (
          await mod.client.post(`/moderation/official-responses/${res.body.id}/actions`, {
            ...act,
            action: "RESTORE",
            reason: "Reviewed: the number was removed."
          })
        ).body
      ).toEqual({ moderationState: "VISIBLE" });
      expect(
        (await anon().get(`/api/v1/reports/${report.reference}`)).body.officialResponses
      ).toHaveLength(1);
      expect(await t.prisma.moderationAction.count({ where: { responseId: res.body.id } })).toBe(2);
    });

    it("withholds a hidden claim everywhere its words appear: timeline, resolution note, photographs and counts", async () => {
      const world = await verifiedOrg(t);
      const { report, reporter, photoId } = await claimable(world);
      await respond(world.rep, report.reference, world.org);
      const secret = "Fixed using bitumen from the depot behind 12 Palm Avenue.";
      const made = await claim(world, report.reference, [photoId], secret);
      expect(made.status).toBe(201);
      const mod = await signedIn(t.app, t.prisma, "MODERATOR");
      const hide = await mod.client.post(`/moderation/official-responses/${made.body.id}/actions`, {
        action: "HIDE",
        policy: "PRIVACY_EXPOSURE",
        reason: "It publishes where an employee lives."
      });
      expect(hide.status).toBe(200);

      const publicView = (await anon().get(`/api/v1/reports/${report.reference}`)).body;
      expect(JSON.stringify(publicView)).not.toContain("12 Palm Avenue");
      expect(publicView.resolutionNote).toBeNull();
      expect(publicView.resolutionEvidence).toHaveLength(0);
      // The fact that the status changed to Resolved (as claimed) stays on the record, without the words.
      const resolved = publicView.timeline.find(
        (e: { type: string; toStatus?: string }) =>
          e.type === "STATUS_CHANGED" && e.toStatus === "RESOLVED"
      );
      expect(resolved).toMatchObject({ basis: "ORGANIZATION_STATEMENT", note: null });
      const photo = (path: string, who: { get: (u: string) => request.Test } | null) =>
        who ? who.get(path) : anon().get(`/api${path}`);
      expect((await photo(`/evidence/${photoId}/file`, null)).status).toBe(404);
      expect((await photo(`/evidence/${photoId}/file?variant=thumb`, null)).status).toBe(404);

      // The organization and staff still see all of it, and the photograph is no longer cacheable by anyone.
      for (const who of [world.rep, mod]) {
        const detail = (await who.client.get(`/reports/${report.reference}`)).body;
        expect(detail.resolutionNote).toBe(secret);
        expect(detail.resolutionEvidence).toHaveLength(1);
        const file = await who.client.get(`/evidence/${photoId}/file`);
        expect(file.status).toBe(200);
        expect(file.headers["cache-control"]).toBe("private, no-store");
      }
      // The reporter is neither staff nor the organization: they see what the public sees.
      const reporterView = (await reporter.client.get(`/reports/${report.reference}`)).body;
      expect(reporterView.resolutionNote).toBeNull();
      expect(JSON.stringify(reporterView)).not.toContain("12 Palm Avenue");
      expect((await reporter.client.get(`/evidence/${photoId}/file`)).status).toBe(404);

      // Restoring brings it back.
      await mod.client.post(`/moderation/official-responses/${made.body.id}/actions`, {
        action: "RESTORE",
        policy: "OTHER",
        reason: "The address was removed from the text."
      });
      expect((await anon().get(`/api/v1/reports/${report.reference}`)).body.resolutionNote).toBe(
        secret
      );
      expect((await anon().get(`/api/v1/evidence/${photoId}/file`)).status).toBe(200);
    });

    it("withholds a hidden statement's words from notifications and from emails not yet sent, but keeps the claim caveat", async () => {
      const world = await verifiedOrg(t);
      const { report, reporter, photoId } = await claimable(world);
      const ack = await respond(world.rep, report.reference, world.org, {
        body: "Call our director on 555-0199 about this."
      });
      const secret = "Fixed with materials stored at 12 Palm Avenue.";
      const made = await claim(world, report.reference, [photoId], secret);
      expect(made.status).toBe(201);
      const mod = await signedIn(t.app, t.prisma, "MODERATOR");
      // Before moderation the excerpts are what the reporter was told.
      expect(
        (await t.prisma.notification.findMany({ where: { userId: reporter.user.id } }))
          .map((n) => n.body)
          .join(" ")
      ).toContain("555-0199");
      for (const id of [ack.body.id, made.body.id]) {
        expect(
          (
            await mod.client.post(`/moderation/official-responses/${id}/actions`, {
              action: "HIDE",
              policy: "PRIVACY_EXPOSURE",
              reason: "It publishes private details."
            })
          ).status
        ).toBe(200);
      }
      const inbox = (await reporter.client.get("/notifications")).body;
      const text = JSON.stringify(inbox);
      expect(text).not.toContain("555-0199");
      expect(text).not.toContain("Palm Avenue");
      const claimNote = inbox.items.find((n: { type: string }) => n.type === "RESOLUTION_CLAIMED");
      expect(claimNote.body).toMatch(/not been independently verified/i);
      // The emails were queued before the hiding and delivered after it: they are rendered from the notification.
      t.email.reset();
      await deliverEmail(t.app);
      const mails = t.email.to(reporter.user.email);
      expect(mails.length).toBeGreaterThan(0);
      for (const m of mails) {
        expect(m.text + (m.html ?? "")).not.toMatch(/555-0199|Palm Avenue/);
      }
    });

    it("counts only statements that are still visible", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const ack = await respond(world.rep, report.reference, world.org);
      const mod = await signedIn(t.app, t.prisma, "MODERATOR");
      const metrics = async () =>
        (await anon().get(`/api/v1/organizations/${world.org.slug}`)).body.metrics
          .reportsAcknowledged;
      expect(await metrics()).toBe(1);
      await mod.client.post(`/moderation/official-responses/${ack.body.id}/actions`, {
        action: "HIDE",
        policy: "MISLEADING",
        reason: "It was posted on the wrong report."
      });
      expect(await metrics()).toBe(0);
    });

    it("does not let staff who belong to the organization moderate its statements", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const res = await respond(world.rep, report.reference, world.org);
      const insider = await signedIn(t.app, t.prisma, "MODERATOR");
      await addMember(t.prisma, world.org.id, insider.user.id, "MEMBER");
      const out = await insider.client.post(
        `/moderation/official-responses/${res.body.id}/actions`,
        { action: "HIDE", policy: "SPAM", reason: "I would like it not to be seen." }
      );
      expect(out.status).toBe(409);
      expect(out.body.code).toBe("REVIEW_CONFLICT");
    });

    it("hides everything an organization said from a report that is itself hidden, and from the organization's profile", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      await respond(world.rep, report.reference, world.org);
      expect(
        (await anon().get(`/api/v1/organizations/${world.org.slug}/responses`)).body
      ).toHaveLength(1);
      await world.staff.client.post(`/moderation/reports/${report.reference}/actions`, {
        action: "HIDE",
        policy: "SPAM",
        reason: "Hidden for moderation review."
      });
      expect(
        (await anon().get(`/api/v1/organizations/${world.org.slug}/responses`)).body
      ).toHaveLength(0);
      expect(
        (await anon().get(`/api/v1/organizations/${world.org.slug}/reports`)).body.items
      ).toHaveLength(0);
      expect((await anon().get(`/api/v1/reports/${report.reference}`)).status).toBe(404);
    });
  });

  describe("request integrity", () => {
    it("needs the CSRF token and a same-site origin like every other write", async () => {
      const world = await verifiedOrg(t);
      const { report } = await connectedReport(t, world.org.id, world.rep.user.id);
      const body = { organizationSlug: world.org.slug, type: "ACKNOWLEDGEMENT", body: BODY };
      const url = `/api/v1/reports/${report.reference}/official-responses`;
      expect(
        (await world.rep.client.agent.post(url).set("Origin", "http://localhost:3010").send(body))
          .status
      ).toBe(403);
      expect(
        (
          await world.rep.client.agent
            .post(url)
            .set("Origin", "https://evil.example")
            .set("X-CSRF-Token", world.rep.client.csrf ?? "")
            .send(body)
        ).status
      ).toBe(403);
      expect(await t.prisma.officialResponse.count()).toBe(0);
    });
  });
});
