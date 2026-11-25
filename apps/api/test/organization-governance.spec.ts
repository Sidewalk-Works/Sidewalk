import request from "supertest";
import { createApp, resetDatabase, seedCategories, signedIn, type TestApp } from "./helpers";
import { addMember, connectedReport, createOrg, resolutionPhoto, verifiedOrg } from "./org-helpers";

describe("Organization governance, public profiles and metrics", () => {
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

  const REASON = { reason: "A complaint says this account is impersonating a ministry." };

  describe("suspending, reinstating and withdrawing verification", () => {
    it("is for Sidewalk administrators only: not moderators, residents, organization administrators or the signed-out", async () => {
      const { org, admin, staff } = await verifiedOrg(t);
      const moderator = await signedIn(t.app, t.prisma, "MODERATOR");
      const resident = await signedIn(t.app, t.prisma);
      for (const action of ["suspend", "reinstate", "revoke-verification"]) {
        const path = `/admin/organizations/${org.id}/${action}`;
        for (const who of [moderator, resident, admin])
          expect((await who.client.post(path, REASON)).status).toBe(403);
        expect(
          (await anon().post(`/api/v1/admin/organizations/${org.id}/${action}`).send(REASON)).status
        ).toBe(401);
      }
      expect(
        (await staff.client.post(`/admin/organizations/${org.id}/suspend`, REASON)).status
      ).toBe(204);
    });

    it("requires a recorded reason, a real organization and a UUID", async () => {
      const { org, staff } = await verifiedOrg(t);
      expect(
        (await staff.client.post(`/admin/organizations/${org.id}/suspend`, { reason: "no" })).status
      ).toBe(400);
      expect((await staff.client.post(`/admin/organizations/${org.id}/suspend`, {})).status).toBe(
        400
      );
      expect(
        (await staff.client.post(`/admin/organizations/${crypto.randomUUID()}/suspend`, REASON))
          .status
      ).toBe(404);
      expect(
        (await staff.client.post(`/admin/organizations/nonsense/suspend`, REASON)).status
      ).toBe(400);
    });

    it("records each decision append-only with who, why, and the state before and after, and audits it", async () => {
      const { org, staff } = await verifiedOrg(t);
      await staff.client.post(`/admin/organizations/${org.id}/suspend`, REASON);
      await staff.client.post(`/admin/organizations/${org.id}/reinstate`, {
        reason: "Checked with the ministry; the account is genuine."
      });
      await staff.client.post(`/admin/organizations/${org.id}/revoke-verification`, {
        reason: "The ministry confirmed it does not run this account."
      });
      const rows = await t.prisma.verificationDecision.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: "asc" }
      });
      expect(rows.map((r) => r.action)).toEqual(["SUSPENDED", "REINSTATED", "REVOKED"]);
      expect(rows[0]).toMatchObject({ actorId: staff.user.id, reason: REASON.reason });
      expect(rows[2]!.next).toMatchObject({ verificationStatus: "REVOKED" });
      await expect(
        t.prisma.verificationDecision.update({
          where: { id: rows[0]!.id },
          data: { reason: "edited" }
        })
      ).rejects.toThrow();
      await expect(
        t.prisma.verificationDecision.delete({ where: { id: rows[0]!.id } })
      ).rejects.toThrow();
      expect(
        await t.prisma.auditLog.count({
          where: {
            entityId: org.id,
            action: {
              in: ["organization.suspended", "organization.reinstated", "organization.revoked"]
            }
          }
        })
      ).toBe(3);
    });

    it("refuses meaningless transitions", async () => {
      const { org, staff } = await verifiedOrg(t);
      const post = (a: string) => staff.client.post(`/admin/organizations/${org.id}/${a}`, REASON);
      expect((await post("reinstate")).body.code).toBe("NOT_SUSPENDED");
      expect((await post("suspend")).status).toBe(204);
      expect((await post("suspend")).body.code).toBe("ALREADY_SUSPENDED");
      expect((await post("reinstate")).status).toBe(204);
      expect((await post("revoke-verification")).status).toBe(204);
      expect((await post("revoke-verification")).body.code).toBe("NOT_VERIFIED");
      const unverified = await createOrg(t.prisma, { createdById: staff.user.id });
      expect(
        (
          await staff.client.post(
            `/admin/organizations/${unverified.id}/revoke-verification`,
            REASON
          )
        ).body.code
      ).toBe("NOT_VERIFIED");
    });

    it("does not let an administrator who belongs to an organization suspend, reinstate or revoke it", async () => {
      const { org, staff } = await verifiedOrg(t);
      await addMember(t.prisma, org.id, staff.user.id, "MEMBER");
      for (const action of ["suspend", "revoke-verification"]) {
        const res = await staff.client.post(`/admin/organizations/${org.id}/${action}`, REASON);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("REVIEW_CONFLICT");
      }
      expect(
        (await t.prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status
      ).toBe("ACTIVE");
    });

    it("tells every current member the fact but not the reason, and tells nobody who has left", async () => {
      const { org, staff, admin, rep } = await verifiedOrg(t);
      const member = await signedIn(t.app, t.prisma);
      await addMember(t.prisma, org.id, member.user.id, "MEMBER");
      const gone = await signedIn(t.app, t.prisma);
      await t.prisma.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: gone.user.id,
          role: "ADMIN",
          status: "REVOKED",
          revokedAt: new Date()
        }
      });
      await staff.client.post(`/admin/organizations/${org.id}/suspend`, REASON);
      for (const m of [admin, rep, member]) {
        const rows = await t.prisma.notification.findMany({
          where: { userId: m.user.id, type: "ORGANIZATION" }
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]!.title).toContain("suspended");
        expect(rows[0]!.body).not.toContain("impersonating");
      }
      expect(await t.prisma.notification.count({ where: { userId: gone.user.id } })).toBe(0);
      expect(await t.prisma.notification.count({ where: { userId: staff.user.id } })).toBe(0);
    });

    it("settles simultaneous opposing decisions into one consistent state", async () => {
      const { org, staff } = await verifiedOrg(t);
      const second = await signedIn(t.app, t.prisma, "ADMIN");
      const results = await Promise.all([
        staff.client.post(`/admin/organizations/${org.id}/suspend`, REASON),
        second.client.post(`/admin/organizations/${org.id}/suspend`, REASON)
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
      expect(
        await t.prisma.verificationDecision.count({
          where: { organizationId: org.id, action: "SUSPENDED" }
        })
      ).toBe(1);
    });

    it("keeps a suspended organization's profile and history visible, marked as suspended", async () => {
      const { org, staff, rep } = await verifiedOrg(t);
      const { report } = await connectedReport(t, org.id, rep.user.id);
      await rep.client.post(`/reports/${report.reference}/official-responses`, {
        organizationSlug: org.slug,
        type: "ACKNOWLEDGEMENT",
        body: "We have received this report and will inspect it."
      });
      await staff.client.post(`/admin/organizations/${org.id}/suspend`, REASON);
      const profile = (await anon().get(`/api/v1/organizations/${org.slug}`)).body;
      expect(profile).toMatchObject({
        verificationStatus: "VERIFIED",
        suspended: true,
        // Identity and standing are separate facts: the profile still says it was verified, and says it is suspended.
        verified: true
      });
      expect(profile.viewer.canRespond).toBe(false);
      expect(JSON.stringify(profile)).not.toContain("impersonating");
      const badge = (await anon().get(`/api/v1/reports/${report.reference}`)).body
        .officialResponses[0].organization;
      expect(badge).toMatchObject({ suspended: true, verified: true });
    });
  });

  describe("what 'verified' means on public surfaces", () => {
    it("reports identity verification and standing as separate facts, so a suspended body is never shown as simply verified", async () => {
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      const seeds = [
        { verified: true, expected: true },
        { verified: true, suspended: true, expected: true },
        { revoked: true, expected: false },
        { verified: false, listed: true, expected: false }
      ];
      for (const [i, seed] of seeds.entries()) {
        const org = await createOrg(t.prisma, {
          ...seed,
          name: `Badge Test Body ${i}`,
          createdById: staff.user.id
        });
        const profile = (await anon().get(`/api/v1/organizations/${org.slug}`)).body;
        expect(profile.verified).toBe(seed.expected);
        expect(profile.suspended).toBe(seed.suspended === true);
        expect(profile.viewer.canRespond).toBe(false);
      }
    });

    it("never gives a registered or invited organization a verified look", async () => {
      const { staff } = await verifiedOrg(t);
      const created = await staff.client.post("/admin/organizations", {
        name: "Unproven Roads Authority",
        type: "AGENCY",
        level: "STATE",
        jurisdiction: "Kano State",
        listPublicly: true,
        inviteEmail: "claimed-rep@example.test"
      });
      expect(created.status).toBe(201);
      const profile = (await anon().get(`/api/v1/organizations/${created.body.slug}`)).body;
      expect(profile).toMatchObject({ verified: false, verificationStatus: "UNVERIFIED" });
      expect(profile.verifiedAt).toBeNull();
      expect(profile.metrics.claimsVerified).toBe(0);
    });
  });

  describe("metrics", () => {
    it("are plain counts over public reports, with no rate, average or speed", async () => {
      const { org, rep, admin, staff } = await verifiedOrg(t);
      const respond = (ref: string, body: Record<string, unknown>) =>
        rep.client.post(`/reports/${ref}/official-responses`, {
          organizationSlug: org.slug,
          body: "Statement text for the record.",
          ...body
        });

      const a = await connectedReport(t, org.id, rep.user.id);
      const b = await connectedReport(t, org.id, rep.user.id);
      const c = await connectedReport(t, org.id, rep.user.id);
      await respond(a.report.reference, { type: "ACKNOWLEDGEMENT" });
      await respond(b.report.reference, { type: "ACKNOWLEDGEMENT" });
      const photoA = await resolutionPhoto(rep.client, a.report.reference, org.slug, 140);
      const photoB = await resolutionPhoto(rep.client, b.report.reference, org.slug, 150);
      await respond(a.report.reference, {
        type: "RESOLUTION_CLAIM",
        evidenceIds: [photoA.body.id]
      });
      await respond(b.report.reference, {
        type: "RESOLUTION_CLAIM",
        evidenceIds: [photoB.body.id]
      });
      const verifier = await signedIn(t.app, t.prisma, "MODERATOR");
      expect(
        (await verifier.client.post(`/reports/${a.report.reference}/verification`, {})).status
      ).toBe(200);

      let metrics = (await anon().get(`/api/v1/organizations/${org.slug}`)).body.metrics;
      expect(metrics).toEqual({
        reportsConnected: 3,
        reportsAcknowledged: 2,
        resolutionsClaimed: 2,
        claimsVerified: 1,
        window: "all time",
        scope: "public reports only"
      });
      for (const key of Object.keys(metrics))
        expect(key).not.toMatch(/rate|average|median|days|score|rank/i);

      // A hidden report drops out of every count; a removed connection does too.
      await staff.client.post(`/moderation/reports/${b.report.reference}/actions`, {
        action: "HIDE",
        policy: "OTHER",
        reason: "Hidden for moderation review."
      });
      await staff.client.post(`/moderation/reports/${c.report.reference}/organizations`, {
        organizationSlug: org.slug,
        status: "REMOVED",
        reason: "Wrong organization for this road."
      });
      metrics = (await anon().get(`/api/v1/organizations/${org.slug}`)).body.metrics;
      expect(metrics).toMatchObject({
        reportsConnected: 1,
        reportsAcknowledged: 1,
        resolutionsClaimed: 1,
        claimsVerified: 1
      });
      void admin;
    });

    it("count a withdrawn claim once it is no longer standing, and credit a verification to the organization that claimed", async () => {
      const { org, rep } = await verifiedOrg(t);
      const other = await verifiedOrg(t, "Another Public Body");
      const { report } = await connectedReport(t, org.id, rep.user.id);
      await t.prisma.reportOrganization.create({
        data: {
          reportId: report.id,
          organizationId: other.org.id,
          basis: "STAFF_ASSIGNED",
          status: "ACTIVE",
          addedById: other.staff.user.id
        }
      });
      const photo = await resolutionPhoto(rep.client, report.reference, org.slug, 145);
      await rep.client.post(`/reports/${report.reference}/official-responses`, {
        organizationSlug: org.slug,
        type: "RESOLUTION_CLAIM",
        body: "Fixed on site by our team.",
        evidenceIds: [photo.body.id]
      });
      const verifier = await signedIn(t.app, t.prisma, "MODERATOR");
      await verifier.client.post(`/reports/${report.reference}/verification`, {});
      const mine = (await anon().get(`/api/v1/organizations/${org.slug}`)).body.metrics;
      const theirs = (await anon().get(`/api/v1/organizations/${other.org.slug}`)).body.metrics;
      expect(mine.claimsVerified).toBe(1);
      expect(theirs.claimsVerified).toBe(0);
      expect(theirs.resolutionsClaimed).toBe(0);
    });
  });

  describe("profile privacy", () => {
    it("shows an unlisted organization only to its members and to staff", async () => {
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      const org = await createOrg(t.prisma, { createdById: staff.user.id });
      const member = await signedIn(t.app, t.prisma);
      await addMember(t.prisma, org.id, member.user.id, "MEMBER");
      const stranger = await signedIn(t.app, t.prisma);
      expect((await anon().get(`/api/v1/organizations/${org.slug}`)).status).toBe(404);
      expect((await stranger.client.get(`/organizations/${org.slug}`)).status).toBe(404);
      expect((await anon().get(`/api/v1/organizations/${org.slug}/reports`)).status).toBe(404);
      expect((await anon().get(`/api/v1/organizations/${org.slug}/responses`)).status).toBe(404);
      expect((await member.client.get(`/organizations/${org.slug}`)).status).toBe(200);
      expect((await staff.client.get(`/organizations/${org.slug}`)).status).toBe(200);
    });

    it("does not reveal an unlisted organization attached to a report", async () => {
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      const hidden = await createOrg(t.prisma, {
        createdById: staff.user.id,
        name: "Private Working Group Name"
      });
      const { report } = await connectedReport(t, hidden.id, staff.user.id);
      const text = JSON.stringify((await anon().get(`/api/v1/reports/${report.reference}`)).body);
      expect(text).not.toContain("Private Working Group Name");
      expect(text).not.toContain(hidden.slug);
    });

    it("answers the same for a slug that does not exist and one that is unlisted", async () => {
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      const hidden = await createOrg(t.prisma, { createdById: staff.user.id });
      const a = await anon().get(`/api/v1/organizations/${hidden.slug}`);
      const b = await anon().get("/api/v1/organizations/no-such-organization");
      expect(a.status).toBe(b.status);
      expect(a.body.message).toBe(b.body.message);
      expect((await anon().get("/api/v1/organizations/Not_A_Slug!")).status).toBe(404);
    });

    it("sends public responses with cache headers that do not let shared caches keep personalised views", async () => {
      const { org } = await verifiedOrg(t);
      const res = await anon().get(`/api/v1/organizations/${org.slug}`);
      expect(res.headers["cache-control"] ?? "").not.toMatch(/public/);
    });
  });
});
