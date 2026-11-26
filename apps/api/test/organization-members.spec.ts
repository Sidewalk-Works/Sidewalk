import { createHash } from "node:crypto";
import request from "supertest";
import {
  Client,
  createApp,
  createUser,
  deliverEmail,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";
import { addMember, createOrg, verifiedOrg } from "./org-helpers";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

describe("Organization invitations and membership", () => {
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

  /** Invites an address as an organization administrator would, delivers the email and returns the token from it. */
  async function invite(admin: Client, slug: string, email: string, role = "REPRESENTATIVE") {
    const res = await admin.post(`/organizations/${slug}/invitations`, { email, role });
    expect(res.status).toBe(201);
    await deliverEmail(t.app);
    return {
      invitation: res.body as { id: string },
      token: t.email.tokenFor(email.toLowerCase()) as string
    };
  }
  const login = async (email: string) => {
    const c = new Client(t.app);
    expect((await c.login(email)).status).toBe(200);
    return c;
  };

  describe("who may invite", () => {
    it("lets an administrator of a verified, active organization invite; nobody else", async () => {
      const { org, admin, rep } = await verifiedOrg(t);
      const stranger = await signedIn(t.app, t.prisma);
      const unconfirmed = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });
      const member = await signedIn(t.app, t.prisma);
      await addMember(t.prisma, org.id, member.user.id, "MEMBER");
      const body = { email: "colleague@example.test", role: "REPRESENTATIVE" };
      expect((await admin.client.post(`/organizations/${org.slug}/invitations`, body)).status).toBe(
        201
      );
      for (const who of [rep, member, stranger, unconfirmed])
        expect((await who.client.post(`/organizations/${org.slug}/invitations`, body)).status).toBe(
          403
        );
      expect(
        (await anon().post(`/api/v1/organizations/${org.slug}/invitations`).send(body)).status
      ).toBe(401);
    });

    it("does not let an administrator of an unverified, suspended or revoked organization invite anyone", async () => {
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      for (const seed of [
        { verified: false },
        { verified: true, suspended: true },
        { revoked: true }
      ]) {
        const org = await createOrg(t.prisma, { ...seed, createdById: staff.user.id });
        const admin = await signedIn(t.app, t.prisma);
        await addMember(t.prisma, org.id, admin.user.id, "ADMIN");
        const res = await admin.client.post(`/organizations/${org.slug}/invitations`, {
          email: "x@example.test",
          role: "MEMBER"
        });
        expect(res.status).toBe(409);
        expect(["ORGANIZATION_NOT_VERIFIED", "ORGANIZATION_SUSPENDED"]).toContain(res.body.code);
      }
    });

    it("lets a Sidewalk administrator invite for any organization, but not a moderator", async () => {
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      const moderator = await signedIn(t.app, t.prisma, "MODERATOR");
      const org = await createOrg(t.prisma, { createdById: staff.user.id });
      const body = { email: "intended@example.test", role: "ADMIN" };
      expect(
        (await moderator.client.post(`/organizations/${org.slug}/invitations`, body)).status
      ).toBe(403);
      expect((await staff.client.post(`/organizations/${org.slug}/invitations`, body)).status).toBe(
        201
      );
    });

    it("validates the address and role, refuses existing members, and caps invitations per day", async () => {
      const { org, admin, rep } = await verifiedOrg(t);
      const post = (body: object) =>
        admin.client.post(`/organizations/${org.slug}/invitations`, body);
      expect((await post({ email: "not-an-email", role: "MEMBER" })).status).toBe(400);
      expect((await post({ email: "a@example.test", role: "OWNER" })).status).toBe(400);
      expect((await post({ email: rep.user.email, role: "MEMBER" })).body.code).toBe(
        "ALREADY_MEMBER"
      );
      for (let i = 0; i < 20; i++)
        expect((await post({ email: `person${i}@example.test`, role: "MEMBER" })).status).toBe(201);
      const over = await post({ email: "one-too-many@example.test", role: "MEMBER" });
      expect(over.status).toBe(429);
      expect(over.headers["retry-after"]).toBeDefined();
    });
  });

  describe("the token", () => {
    it("is high-entropy, delivered by email from the configured origin, and stored only as a hash", async () => {
      const { org, admin } = await verifiedOrg(t);
      const { invitation, token } = await invite(admin.client, org.slug, "Newcomer@Example.Test");
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const row = await t.prisma.organizationInvitation.findUniqueOrThrow({
        where: { id: invitation.id }
      });
      expect(row.tokenHash).toBe(sha256(token));
      expect(JSON.stringify(row)).not.toContain(token);
      expect(row.email).toBe("newcomer@example.test");
      const mail = t.email.to("newcomer@example.test")[0]!;
      expect(mail.text).toContain(
        `http://localhost:3010/organizations/invitations/accept#token=${token}`
      );
      expect(mail.subject).toContain(org.name);
      expect(mail.text).toMatch(/does not verify the organization/i);
      // Sent mail holds no readable content in the queue, and no audit record names the address or the token.
      expect(
        await t.prisma.emailOutbox.count({ where: { payloadCiphertext: { not: null } } })
      ).toBe(0);
      const audit = JSON.stringify(await t.prisma.auditLog.findMany());
      expect(audit).not.toContain(token);
      expect(audit).not.toContain("newcomer@example.test");
    });

    it("is neutral about whether the address has an account", async () => {
      const { org, admin } = await verifiedOrg(t);
      const existing = await createUser(t.prisma, { email: "has-account@example.test" });
      const a = await admin.client.post(`/organizations/${org.slug}/invitations`, {
        email: existing.email,
        role: "MEMBER"
      });
      const b = await admin.client.post(`/organizations/${org.slug}/invitations`, {
        email: "no-account@example.test",
        role: "MEMBER"
      });
      expect(a.status).toBe(b.status);
      expect(Object.keys(a.body).sort()).toEqual(Object.keys(b.body).sort());
      await deliverEmail(t.app);
      expect(t.email.to("has-account@example.test")).toHaveLength(1);
      expect(t.email.to("no-account@example.test")).toHaveLength(1);
    });

    it("can be looked at without being used, and says nothing without the secret", async () => {
      const { org, admin } = await verifiedOrg(t);
      const { token } = await invite(admin.client, org.slug, "peek@example.test");
      const look = await anon().post("/api/v1/organization-invitations/check").send({ token });
      expect(look.body).toMatchObject({
        state: "valid",
        organization: { name: org.name, verified: true },
        roleLabel: "Representative",
        emailHint: "p***@example.test"
      });
      expect(JSON.stringify(look.body)).not.toContain("peek@example.test");
      expect(
        (await anon().post("/api/v1/organization-invitations/check").send({ token })).body.state
      ).toBe("valid"); // not consumed
      expect(
        (
          await anon()
            .post("/api/v1/organization-invitations/check")
            .send({ token: "x".repeat(43) })
        ).body
      ).toEqual({ state: "invalid" });
      expect(
        (await anon().post("/api/v1/organization-invitations/check").send({ token: "short" }))
          .status
      ).toBe(400);
    });
  });

  describe("accepting", () => {
    it("makes the invited, confirmed account a member with exactly the offered role, once", async () => {
      const { org, admin } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "invitee@example.test" });
      const { token, invitation } = await invite(
        admin.client,
        org.slug,
        invitee.email,
        "REPRESENTATIVE"
      );
      const client = await login(invitee.email);
      const res = await client.post("/organization-invitations/accept", { token });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        role: "REPRESENTATIVE",
        organization: { slug: org.slug, verified: true }
      });
      expect(
        await t.prisma.organizationMember.findFirstOrThrow({
          where: { userId: invitee.id, organizationId: org.id }
        })
      ).toMatchObject({ role: "REPRESENTATIVE", status: "ACTIVE" });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: invitee.id } })).role).toBe(
        "CITIZEN"
      );
      expect(
        await t.prisma.organizationInvitation.findUniqueOrThrow({ where: { id: invitation.id } })
      ).toMatchObject({ status: "ACCEPTED", acceptedById: invitee.id });
      // The link cannot be used again, by anyone.
      expect((await client.post("/organization-invitations/accept", { token })).body.code).toBe(
        "INVITATION_INVALID"
      );
      const another = await signedIn(t.app, t.prisma);
      expect(
        (await another.client.post("/organization-invitations/accept", { token })).body.code
      ).toBe("INVITATION_INVALID");
      // The person who invited is told; the person who accepted is not told about their own action.
      expect(
        await t.prisma.notification.count({
          where: { userId: admin.user.id, title: { contains: "joined" } }
        })
      ).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: invitee.id } })).toBe(0);
    });

    it("requires being signed in as the invited address: a different account is refused and the invitation survives", async () => {
      const { org, admin } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "rightful@example.test" });
      const { token } = await invite(admin.client, org.slug, invitee.email);
      const intruder = await signedIn(t.app, t.prisma);
      const refused = await intruder.client.post("/organization-invitations/accept", { token });
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe("INVITATION_ADDRESS_MISMATCH");
      expect(await t.prisma.organizationMember.count({ where: { userId: intruder.user.id } })).toBe(
        0
      );
      expect(
        (await intruder.client.post("/organization-invitations/decline", { token })).status
      ).toBe(403);
      expect(
        (await anon().post("/api/v1/organization-invitations/accept").send({ token })).status
      ).toBe(401);
      // The wrong account did not use it up: the right one still can.
      expect(
        (await (await login(invitee.email)).post("/organization-invitations/accept", { token }))
          .status
      ).toBe(200);
    });

    it("requires a confirmed address, even if the account has the invited address", async () => {
      const { org, admin } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, {
        email: "unconfirmed@example.test",
        verified: false
      });
      const { token } = await invite(admin.client, org.slug, invitee.email);
      const res = await (
        await login(invitee.email)
      ).post("/organization-invitations/accept", { token });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
      expect(await t.prisma.organizationInvitation.count({ where: { status: "PENDING" } })).toBe(1);
    });

    it("refuses an expired link, and reports it as expired", async () => {
      const { org, admin } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "late@example.test" });
      const { token, invitation } = await invite(admin.client, org.slug, invitee.email);
      await t.prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
      expect(
        (await anon().post("/api/v1/organization-invitations/check").send({ token })).body.state
      ).toBe("expired");
      const res = await (
        await login(invitee.email)
      ).post("/organization-invitations/accept", { token });
      expect(res.body.code).toBe("INVITATION_EXPIRED");
      expect(await t.prisma.organizationMember.count({ where: { userId: invitee.id } })).toBe(0);
      expect(
        (await admin.client.get(`/organizations/${org.slug}/invitations`)).body[0].status
      ).toBe("EXPIRED");
    });

    it("lets exactly one of several simultaneous acceptances win", async () => {
      const { org, admin } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "racer@example.test" });
      const { token } = await invite(admin.client, org.slug, invitee.email);
      const clients = await Promise.all([
        login(invitee.email),
        login(invitee.email),
        login(invitee.email)
      ]);
      const results = await Promise.all(
        clients.map((c) => c.post("/organization-invitations/accept", { token }))
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(
        await t.prisma.organizationMember.count({
          where: { userId: invitee.id, organizationId: org.id }
        })
      ).toBe(1);
    });

    it("is binding to the invited organization only, and a person may belong to several", async () => {
      const first = await verifiedOrg(t, "First Public Agency");
      const second = await verifiedOrg(t, "Second Public Agency");
      const person = await createUser(t.prisma, { email: "both@example.test" });
      const a = await invite(first.admin.client, first.org.slug, person.email, "MEMBER");
      const b = await invite(second.admin.client, second.org.slug, person.email, "REPRESENTATIVE");
      const client = await login(person.email);
      expect(
        (await client.post("/organization-invitations/accept", { token: a.token })).status
      ).toBe(200);
      // An invitation to one organization cannot be revoked through another organization's address.
      expect(
        (
          await first.admin.client.post(
            `/organizations/${first.org.slug}/invitations/${b.invitation.id}/revoke`,
            {}
          )
        ).status
      ).toBe(404);
      expect(
        (await client.post("/organization-invitations/accept", { token: b.token })).status
      ).toBe(200);
      const mine = await client.get("/organizations/mine");
      expect(
        mine.body.memberships
          .map(
            (m: { organization: { slug: string }; role: string }) =>
              `${m.organization.slug}:${m.role}`
          )
          .sort()
      ).toEqual([`${first.org.slug}:MEMBER`, `${second.org.slug}:REPRESENTATIVE`].sort());
      // Membership in one does not give rights in the other.
      expect(
        (
          await client.post(`/organizations/${first.org.slug}/invitations`, {
            email: "z@example.test",
            role: "MEMBER"
          })
        ).status
      ).toBe(403);
    });

    it("refuses someone who already belongs, without using up the invitation", async () => {
      const { org, admin, rep } = await verifiedOrg(t);
      const { token } = await invite(admin.client, org.slug, "somebody@example.test");
      await t.prisma.user.update({
        where: { id: rep.user.id },
        data: { email: "somebody@example.test" }
      });
      const res = await (
        await login("somebody@example.test")
      ).post("/organization-invitations/accept", { token });
      expect(res.body.code).toBe("ALREADY_MEMBER");
      expect(await t.prisma.organizationInvitation.count({ where: { status: "PENDING" } })).toBe(1);
    });

    it("can be declined by the invitee", async () => {
      const { org, admin } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "decliner@example.test" });
      const { token } = await invite(admin.client, org.slug, invitee.email);
      const client = await login(invitee.email);
      expect((await client.post("/organization-invitations/decline", { token })).status).toBe(204);
      expect((await client.post("/organization-invitations/accept", { token })).body.code).toBe(
        "INVITATION_INVALID"
      );
      expect(await t.prisma.organizationMember.count({ where: { userId: invitee.id } })).toBe(0);
    });
  });

  describe("edge cases around the invited address and the organization's standing", () => {
    const REASON = { reason: "Recorded by the test for an audit trail." };

    it("cannot be accepted while the organization is suspended, and works again once it is reinstated", async () => {
      const { org, admin, staff } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "pending@example.test" });
      const { token, invitation } = await invite(admin.client, org.slug, invitee.email);
      const client = await login(invitee.email);
      expect(
        (await staff.client.post(`/admin/organizations/${org.id}/suspend`, REASON)).status
      ).toBe(204);
      const refused = await client.post("/organization-invitations/accept", { token });
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("ORGANIZATION_SUSPENDED");
      // Nothing was consumed or granted, and the refusal does not repeat the secret.
      expect(JSON.stringify(refused.body)).not.toContain(token);
      expect(await t.prisma.organizationMember.count({ where: { userId: invitee.id } })).toBe(0);
      expect(
        (await t.prisma.organizationInvitation.findUniqueOrThrow({ where: { id: invitation.id } }))
          .status
      ).toBe("PENDING");
      expect(
        (await staff.client.post(`/admin/organizations/${org.id}/reinstate`, REASON)).status
      ).toBe(204);
      expect((await client.post("/organization-invitations/accept", { token })).status).toBe(200);
    });

    it("cannot be accepted after verification is revoked, and leaves the invitation and its history intact", async () => {
      const { org, admin, staff } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "late@example.test" });
      const { token, invitation } = await invite(admin.client, org.slug, invitee.email);
      expect(
        (await staff.client.post(`/admin/organizations/${org.id}/revoke-verification`, REASON))
          .status
      ).toBe(204);
      const refused = await (
        await login(invitee.email)
      ).post("/organization-invitations/accept", {
        token
      });
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("ORGANIZATION_NOT_VERIFIED");
      expect(await t.prisma.organizationMember.count({ where: { userId: invitee.id } })).toBe(0);
      expect(
        await t.prisma.organizationInvitation.count({
          where: { id: invitation.id, status: "PENDING" }
        })
      ).toBe(1);
      // The verification decision that caused it is still on the append-only record.
      expect(
        await t.prisma.verificationDecision.count({ where: { organizationId: org.id } })
      ).toBeGreaterThan(0);
    });

    it("is bound to the address, so an account that has since changed its address cannot use it, and one that gained the address can", async () => {
      const { org, admin } = await verifiedOrg(t);
      const original = await createUser(t.prisma, { email: "before@example.test" });
      const { token } = await invite(admin.client, org.slug, "after@example.test");
      // An account that held some other address is refused.
      const refused = await (
        await login(original.email)
      ).post("/organization-invitations/accept", {
        token
      });
      expect(refused.body.code).toBe("INVITATION_ADDRESS_MISMATCH");
      // The same account, once its confirmed address is the invited one (changed after the invitation was sent), is the
      // invitee. An unconfirmed address would not be enough (covered above).
      await t.prisma.user.update({
        where: { id: original.id },
        data: { email: "after@example.test" }
      });
      const accepted = await (
        await login("after@example.test")
      ).post("/organization-invitations/accept", { token });
      expect(accepted.status).toBe(200);
      // ...and having moved away from the invited address again, a leftover link grants nothing further.
      expect(
        (await t.prisma.organizationMember.findMany({ where: { userId: original.id } })).length
      ).toBe(1);
    });

    it("is never accepted twice: repeating the request neither duplicates the member nor the notification nor the audit entry", async () => {
      const { org, admin } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "repeat@example.test" });
      const { token } = await invite(admin.client, org.slug, invitee.email);
      const client = await login(invitee.email);
      for (let i = 0; i < 3; i++) await client.post("/organization-invitations/accept", { token });
      expect(await t.prisma.organizationMember.count({ where: { userId: invitee.id } })).toBe(1);
      expect(
        await t.prisma.notification.count({
          where: { userId: admin.user.id, title: { contains: "joined" } }
        })
      ).toBe(1);
      expect(
        await t.prisma.auditLog.count({ where: { action: "organization.invitation_accepted" } })
      ).toBe(1);
    });

    it("retries a failed invitation email without duplicating it, and never writes the token into the failure record", async () => {
      const { org, admin } = await verifiedOrg(t);
      const email = "flaky@example.test";
      const created = await admin.client.post(`/organizations/${org.slug}/invitations`, {
        email,
        role: "MEMBER"
      });
      expect(created.status).toBe(201);
      t.email.failNext(new Error("connect ECONNREFUSED 10.0.0.5:587"));
      await deliverEmail(t.app);
      const row = await t.prisma.emailOutbox.findFirstOrThrow({
        where: { kind: "ORGANIZATION_INVITATION" }
      });
      expect(row.status).toBe("FAILED");
      const token = t.email.tokenFor(email);
      expect(token).toBeUndefined();
      expect(JSON.stringify(row.lastError ?? "")).not.toMatch(/[A-Za-z0-9_-]{43}/);
      // Bring the retry due and deliver: exactly one message arrives, carrying a working link.
      await t.prisma.emailOutbox.update({
        where: { id: row.id },
        data: { nextAttemptAt: new Date(Date.now() - 1000) }
      });
      await deliverEmail(t.app);
      await deliverEmail(t.app);
      expect(t.email.to(email)).toHaveLength(1);
      const link = t.email.tokenFor(email) as string;
      expect(link).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // Repeating the same invitation within the cooldown does not queue a second message.
      const again = await admin.client.post(`/organizations/${org.slug}/invitations`, {
        email,
        role: "MEMBER"
      });
      expect(again.status).toBe(409);
      expect(await t.prisma.emailOutbox.count({ where: { kind: "ORGANIZATION_INVITATION" } })).toBe(
        1
      );
    });

    it("removes a member's powers on their very next request while the session stays signed in, and keeps who they were", async () => {
      const { org, admin, rep } = await verifiedOrg(t);
      const row = await t.prisma.organizationMember.findFirstOrThrow({
        where: { userId: rep.user.id, organizationId: org.id }
      });
      expect(
        (
          await admin.client.post(`/organizations/${org.slug}/members/${row.id}/revoke`, {
            reason: "Left the department"
          })
        ).status
      ).toBe(204);
      expect((await rep.client.get("/auth/me")).status).toBe(200);
      expect(
        (
          await rep.client.post(`/organizations/${org.slug}/invitations`, {
            email: "z@example.test",
            role: "MEMBER"
          })
        ).status
      ).toBe(403);
      expect(await t.prisma.organizationMember.count({ where: { id: row.id } })).toBe(1);
    });
  });

  describe("revoking and resending", () => {
    it("revokes an invitation so its link stops working, and never sends a revoked invitation that was still queued", async () => {
      const { org, admin } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "revoked@example.test" });
      const queued = await admin.client.post(`/organizations/${org.slug}/invitations`, {
        email: invitee.email,
        role: "MEMBER"
      });
      // Revoked before the worker got to it.
      expect(
        (
          await admin.client.post(
            `/organizations/${org.slug}/invitations/${queued.body.id}/revoke`,
            {}
          )
        ).status
      ).toBe(204);
      await deliverEmail(t.app);
      expect(t.email.to(invitee.email)).toHaveLength(0);
      expect(
        (
          await t.prisma.emailOutbox.findFirstOrThrow({
            where: { kind: "ORGANIZATION_INVITATION" }
          })
        ).status
      ).toBe("SKIPPED");

      const { token } = await invite(admin.client, org.slug, invitee.email);
      const second = (await admin.client.get(`/organizations/${org.slug}/invitations`)).body.find(
        (i: { status: string }) => i.status === "PENDING"
      );
      await admin.client.post(`/organizations/${org.slug}/invitations/${second.id}/revoke`, {});
      expect(
        (await (await login(invitee.email)).post("/organization-invitations/accept", { token }))
          .body.code
      ).toBe("INVITATION_INVALID");
      expect(
        (await admin.client.post(`/organizations/${org.slug}/invitations/${second.id}/revoke`, {}))
          .status
      ).toBe(404);
      expect(
        await t.prisma.auditLog.count({ where: { action: "organization.invitation_revoked" } })
      ).toBe(2);
    });

    it("replaces the link on a resend: the old link dies, the old email is never sent, and resends are paced", async () => {
      const { org, admin } = await verifiedOrg(t);
      const invitee = await createUser(t.prisma, { email: "resent@example.test" });
      const first = await admin.client.post(`/organizations/${org.slug}/invitations`, {
        email: invitee.email,
        role: "MEMBER"
      });
      const tooSoon = await admin.client.post(
        `/organizations/${org.slug}/invitations/${first.body.id}/resend`,
        {}
      );
      expect(tooSoon.status).toBe(409);
      expect(tooSoon.body.code).toBe("RESEND_TOO_SOON");
      await t.prisma.organizationInvitation.update({
        where: { id: first.body.id },
        data: { lastSentAt: new Date(Date.now() - 120_000) }
      });
      const again = await admin.client.post(
        `/organizations/${org.slug}/invitations/${first.body.id}/resend`,
        {}
      );
      expect(again.status).toBe(201);
      expect(again.body).toMatchObject({ id: first.body.id, sentCount: 2 });
      await deliverEmail(t.app);
      // Only the current link was ever sent; the first one, still queued when it was replaced, was skipped.
      expect(t.email.to(invitee.email)).toHaveLength(1);
      const token = t.email.tokenFor(invitee.email) as string;
      expect(sha256(token)).toBe(
        (await t.prisma.organizationInvitation.findUniqueOrThrow({ where: { id: first.body.id } }))
          .tokenHash
      );
      expect(
        (await (await login(invitee.email)).post("/organization-invitations/accept", { token }))
          .status
      ).toBe(200);
    });

    it("lets an invitation to a different address be issued if the first was lost, without affecting the first", async () => {
      const { org, admin } = await verifiedOrg(t);
      await invite(admin.client, org.slug, "old-address@example.test");
      const second = await invite(admin.client, org.slug, "new-address@example.test");
      const people = await createUser(t.prisma, { email: "new-address@example.test" });
      expect(
        (
          await (
            await login(people.email)
          ).post("/organization-invitations/accept", { token: second.token })
        ).status
      ).toBe(200);
      expect(await t.prisma.organizationInvitation.count({ where: { status: "PENDING" } })).toBe(1);
    });

    it("only lets organization managers list invitations", async () => {
      const { org, admin, rep } = await verifiedOrg(t);
      await invite(admin.client, org.slug, "listed@example.test");
      expect((await admin.client.get(`/organizations/${org.slug}/invitations`)).body).toHaveLength(
        1
      );
      expect((await rep.client.get(`/organizations/${org.slug}/invitations`)).status).toBe(403);
      expect((await anon().get(`/api/v1/organizations/${org.slug}/invitations`)).status).toBe(401);
    });
  });

  describe("membership", () => {
    it("shows the roster to members and staff, and to nobody else", async () => {
      const { org, admin, rep, staff } = await verifiedOrg(t);
      const stranger = await signedIn(t.app, t.prisma);
      expect((await rep.client.get(`/organizations/${org.slug}/members`)).body).toHaveLength(2);
      expect((await staff.client.get(`/organizations/${org.slug}/members`)).status).toBe(200);
      expect((await stranger.client.get(`/organizations/${org.slug}/members`)).status).toBe(404);
      expect((await anon().get(`/api/v1/organizations/${org.slug}/members`)).status).toBe(401);
      expect(
        JSON.stringify((await admin.client.get(`/organizations/${org.slug}/members`)).body)
      ).not.toContain("@");
    });

    it("lets an administrator change roles, but never leaves the organization without one", async () => {
      const { org, admin, rep } = await verifiedOrg(t);
      const roster = (await admin.client.get(`/organizations/${org.slug}/members`)).body as Array<{
        id: string;
        userId: string;
      }>;
      const repRow = roster.find((m) => m.userId === rep.user.id)!;
      const adminRow = roster.find((m) => m.userId === admin.user.id)!;
      expect(
        (
          await rep.client.patch(`/organizations/${org.slug}/members/${repRow.id}`, {
            role: "ADMIN"
          })
        ).status
      ).toBe(403);
      expect(
        (
          await admin.client.patch(`/organizations/${org.slug}/members/${repRow.id}`, {
            role: "MEMBER"
          })
        ).body.role
      ).toBe("MEMBER");
      expect(
        await t.prisma.notification.count({
          where: { userId: rep.user.id, title: { contains: "role" } }
        })
      ).toBe(1);
      const lastAdmin = await admin.client.patch(
        `/organizations/${org.slug}/members/${adminRow.id}`,
        { role: "REPRESENTATIVE" }
      );
      expect(lastAdmin.status).toBe(409);
      expect(lastAdmin.body.code).toBe("LAST_ADMIN");
      expect(
        (
          await admin.client.patch(`/organizations/${org.slug}/members/${adminRow.id}`, {
            role: "SUPERUSER"
          })
        ).status
      ).toBe(400);
    });

    it("removes a member for good but keeps the history, and the removal applies at once", async () => {
      const { org, admin, rep } = await verifiedOrg(t);
      const row = (await admin.client.get(`/organizations/${org.slug}/members`)).body.find(
        (m: { userId: string }) => m.userId === rep.user.id
      );
      expect(
        (await rep.client.post(`/organizations/${org.slug}/members/${row.id}/revoke`, {})).status
      ).toBe(403);
      expect(
        (
          await admin.client.post(`/organizations/${org.slug}/members/${row.id}/revoke`, {
            reason: "Left the department"
          })
        ).status
      ).toBe(204);
      expect(
        await t.prisma.organizationMember.findUniqueOrThrow({ where: { id: row.id } })
      ).toMatchObject({
        status: "REVOKED",
        revokedById: admin.user.id,
        revokeReason: "Left the department"
      });
      // The person's session is still valid, but they are no longer a member of anything.
      expect((await rep.client.get("/organizations/mine")).body.memberships).toEqual([]);
      expect((await rep.client.get(`/organizations/${org.slug}/members`)).status).toBe(404);
      expect(
        await t.prisma.notification.count({
          where: { userId: rep.user.id, title: { contains: "no longer belong" } }
        })
      ).toBe(1);
      // Re-joining makes a new row; the old one stays as history.
      const { token } = await invite(admin.client, org.slug, rep.user.email);
      expect((await rep.client.post("/organization-invitations/accept", { token })).status).toBe(
        200
      );
      expect(
        await t.prisma.organizationMember.count({
          where: { userId: rep.user.id, organizationId: org.id }
        })
      ).toBe(2);
    });

    it("lets anyone leave, except an organization's only administrator", async () => {
      const { org, admin, rep } = await verifiedOrg(t);
      expect((await admin.client.post(`/organizations/${org.slug}/leave`, {})).body.code).toBe(
        "LAST_ADMIN"
      );
      expect((await rep.client.post(`/organizations/${org.slug}/leave`, {})).status).toBe(204);
      expect((await rep.client.post(`/organizations/${org.slug}/leave`, {})).status).toBe(404);
    });

    it("lets a Sidewalk administrator repair an organization, including removing its last administrator", async () => {
      const { org, admin, staff } = await verifiedOrg(t);
      const row = (await staff.client.get(`/organizations/${org.slug}/members`)).body.find(
        (m: { userId: string }) => m.userId === admin.user.id
      );
      expect(
        (
          await staff.client.post(`/organizations/${org.slug}/members/${row.id}/revoke`, {
            reason: "Account compromised"
          })
        ).status
      ).toBe(204);
      expect(
        await t.prisma.auditLog.count({
          where: { action: "organization.member_removed", entityId: row.id }
        })
      ).toBe(1);
    });
  });
});
