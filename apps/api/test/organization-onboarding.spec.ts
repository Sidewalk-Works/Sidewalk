import request from "supertest";
import {
  Client,
  createApp,
  createUser,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";
import {
  APPLICATION,
  ORG_FIELDS,
  createOrg,
  pngImage,
  staffClient,
  submitApplication
} from "./org-helpers";

describe("Organization onboarding and verification", () => {
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

  const create = (
    c: Awaited<ReturnType<typeof signedIn>>["client"],
    body: Record<string, unknown> = { organization: ORG_FIELDS }
  ) => c.post("/organization-applications", body);

  describe("applying (path A)", () => {
    it("needs a confirmed email address", async () => {
      const unconfirmed = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });
      const res = await create(unconfirmed.client);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
      expect((await anon().post("/api/v1/organization-applications").send({})).status).toBe(401);
    });

    it("creates a private, unverified record, not a public profile", async () => {
      const { client } = await signedIn(t.app, t.prisma);
      const res = await create(client);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: "DRAFT",
        organization: { verificationStatus: "UNVERIFIED", name: ORG_FIELDS.name },
        can: { edit: true, submit: true, withdraw: true }
      });
      const slug = res.body.organization.slug;
      // Not listed, not searchable, not viewable: applying does not make a profile.
      expect((await anon().get("/api/v1/organizations").query({ q: "Ogun" })).body.total).toBe(0);
      expect((await anon().get(`/api/v1/organizations/${slug}`)).status).toBe(404);
      expect((await client.get(`/organizations/${slug}`)).status).toBe(404); // not even for the applicant: they are not a member
    });

    it("never gives an organization an address that is one of the site's own pages", async () => {
      const { client } = await signedIn(t.app, t.prisma);
      const res = await create(client, { organization: { ...ORG_FIELDS, name: "Mine" } });
      expect(res.status).toBe(201);
      expect(res.body.organization.slug).toBe("mine-organization");
    });

    it("rejects an incomplete or malformed institution", async () => {
      const { client } = await signedIn(t.app, t.prisma);
      expect((await create(client, {})).status).toBe(400);
      expect((await create(client, { organization: { ...ORG_FIELDS, name: "ab" } })).status).toBe(
        400
      );
      expect(
        (await create(client, { organization: { ...ORG_FIELDS, type: "COMPANY" } })).status
      ).toBe(400);
      expect(
        (await create(client, { organization: { ...ORG_FIELDS, website: "javascript:alert(1)" } }))
          .status
      ).toBe(400);
      expect(
        (await create(client, { organization: { ...ORG_FIELDS, publicEmail: "not-an-email" } }))
          .status
      ).toBe(400);
      expect(
        (await create(client, { organization: { ...ORG_FIELDS, unknownField: true } })).status
      ).toBe(400);
    });

    it("saves a draft, requires the essentials before sending, then locks it once sent", async () => {
      const { client, user } = await signedIn(t.app, t.prisma);
      const draft = await create(client);
      const id = draft.body.id;
      const early = await client.post(`/organization-applications/${id}/submit`, {});
      expect(early.status).toBe(400);
      expect(early.body.code).toBe("APPLICATION_INCOMPLETE");
      expect(early.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        "authorityStatement",
        "officialReferences",
        "roleTitle"
      ]);

      const saved = await client.patch(`/organization-applications/${id}`, {
        roleTitle: APPLICATION.roleTitle,
        authorityStatement: APPLICATION.authorityStatement,
        officialReferences: APPLICATION.officialReferences
      });
      expect(saved.status).toBe(200);
      expect((await client.get(`/organization-applications/${id}`)).body.roleTitle).toBe(
        APPLICATION.roleTitle
      );

      const sent = await client.post(`/organization-applications/${id}/submit`, {});
      expect(sent.status).toBe(200);
      expect(sent.body).toMatchObject({
        status: "SUBMITTED",
        can: { edit: false, submit: false, withdraw: true }
      });
      expect(
        (await client.patch(`/organization-applications/${id}`, { roleTitle: "Changed" })).body.code
      ).toBe("NOT_EDITABLE");
      expect((await client.post(`/organization-applications/${id}/submit`, {})).status).toBe(409);

      // A neutral confirmation: received, and explicitly not verification.
      const note = await t.prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
      expect(note.type).toBe("ORGANIZATION");
      expect(note.body).toMatch(/not verification/i);
    });

    it("can be withdrawn, after which it cannot be sent", async () => {
      const { applicant, application } = await submitApplication(t);
      const res = await applicant.client.post(
        `/organization-applications/${application.id}/withdraw`,
        {}
      );
      expect(res.body.status).toBe("WITHDRAWN");
      expect(
        (await applicant.client.post(`/organization-applications/${application.id}/submit`, {}))
          .status
      ).toBe(409);
      expect(
        (await applicant.client.post(`/organization-applications/${application.id}/withdraw`, {}))
          .status
      ).toBe(409);
    });

    it("is private to the applicant and to staff", async () => {
      const { application } = await submitApplication(t);
      const stranger = await signedIn(t.app, t.prisma);
      for (const res of [
        await stranger.client.get(`/organization-applications/${application.id}`),
        await stranger.client.patch(`/organization-applications/${application.id}`, {
          roleTitle: "x"
        }),
        await stranger.client.post(`/organization-applications/${application.id}/submit`, {}),
        await stranger.client.post(`/organization-applications/${application.id}/withdraw`, {})
      ])
        expect(res.status).toBe(404);
      expect(
        (await stranger.client.get(`/moderation/organization-applications/${application.id}`))
          .status
      ).toBe(403);
      expect((await anon().get(`/api/v1/organization-applications/${application.id}`)).status).toBe(
        401
      );
      const moderator = await staffClient(t, "MODERATOR");
      expect(
        (await moderator.client.get(`/moderation/organization-applications/${application.id}`))
          .status
      ).toBe(200);
    });
  });

  describe("duplicates and impersonation", () => {
    it("stops the same person starting the same institution twice, and caps unfinished applications", async () => {
      const { client } = await signedIn(t.app, t.prisma);
      expect((await create(client)).status).toBe(201);
      const again = await create(client, {
        organization: { ...ORG_FIELDS, name: "OGUN STATE MINISTRY, OF ROADS!" }
      });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("DUPLICATE_APPLICATION");
      expect(
        (await create(client, { organization: { ...ORG_FIELDS, name: "First Different Body" } }))
          .status
      ).toBe(201);
      expect(
        (await create(client, { organization: { ...ORG_FIELDS, name: "Second Different Body" } }))
          .status
      ).toBe(201);
      const fourth = await create(client, {
        organization: { ...ORG_FIELDS, name: "Third Different Body" }
      });
      expect(fourth.body.code).toBe("TOO_MANY_APPLICATIONS");
    });

    it("refuses a lookalike of an already verified institution, whatever its punctuation", async () => {
      const admin = await staffClient(t);
      await createOrg(t.prisma, {
        name: ORG_FIELDS.name,
        verified: true,
        createdById: admin.user.id
      });
      const impostor = await signedIn(t.app, t.prisma);
      for (const name of [
        ORG_FIELDS.name,
        "ogun state ministry of roads",
        "Ogun State Ministry of Roads!!",
        "OGUN-STATE MINISTRY OF ROADS"
      ]) {
        const res = await create(impostor.client, { organization: { ...ORG_FIELDS, name } });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("ORGANIZATION_ALREADY_VERIFIED");
      }
    });

    it("lets two people apply under one name, shows staff the overlap, and lets only one be verified", async () => {
      const first = await submitApplication(t);
      const second = await submitApplication(t);
      expect(first.application.organization.id).not.toBe(second.application.organization.id);
      const admin = await staffClient(t);
      const queue = await admin.client.get("/moderation/organization-applications");
      expect(queue.body.items).toHaveLength(2);
      expect(queue.body.items.every((i: { similarCount: number }) => i.similarCount === 1)).toBe(
        true
      );
      const detail = await admin.client.get(
        `/moderation/organization-applications/${second.application.id}`
      );
      expect(detail.body.similar.map((s: { slug: string }) => s.slug)).toContain(
        first.application.organization.slug
      );

      const approve = (id: string) =>
        admin.client.post(`/admin/organizations/applications/${id}/decision`, {
          decision: "APPROVE",
          reason: "Checked the ministry's official staff page."
        });
      expect((await approve(first.application.id)).status).toBe(204);
      const clash = await approve(second.application.id);
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe("NAME_ALREADY_VERIFIED");
      expect(await t.prisma.organization.count({ where: { verificationStatus: "VERIFIED" } })).toBe(
        1
      );
    });

    it("keeps the one-verified-per-name rule even when two decisions race", async () => {
      const first = await submitApplication(t);
      const second = await submitApplication(t);
      const a = await staffClient(t);
      const b = await staffClient(t);
      const decide = (c: typeof a, id: string) =>
        c.client.post(`/admin/organizations/applications/${id}/decision`, {
          decision: "APPROVE",
          reason: "Checked the ministry's official staff page."
        });
      const results = await Promise.all([
        decide(a, first.application.id),
        decide(b, second.application.id)
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
      expect(await t.prisma.organization.count({ where: { verificationStatus: "VERIFIED" } })).toBe(
        1
      );
    });
  });

  describe("private documents", () => {
    it("accepts an image, refuses anything else, and shows it only to the applicant and staff", async () => {
      const { client } = await signedIn(t.app, t.prisma);
      const id = (await create(client)).body.id;
      const letter = await pngImage(140, 100);
      const ok = await client.upload(
        `/organization-applications/${id}/documents`,
        letter,
        "letter.png",
        { caption: "Appointment letter" }
      );
      expect(ok.status).toBe(201);
      expect(ok.body.url).toBe(`/api/v1/organization-documents/${ok.body.id}/file`);
      expect(JSON.stringify(ok.body)).not.toMatch(/storageKey|org-documents/);
      expect(
        (
          await client.upload(
            `/organization-applications/${id}/documents`,
            Buffer.from("%PDF-1.4 not an image"),
            "letter.pdf"
          )
        ).body.code
      ).toBe("UNSUPPORTED_FILE_TYPE");
      expect(
        (await client.upload(`/organization-applications/${id}/documents`, letter, "again.png"))
          .body.code
      ).toBe("DUPLICATE_DOCUMENT");

      const file = await client.get(`/organization-documents/${ok.body.id}/file`);
      expect(file.status).toBe(200);
      expect(file.headers["cache-control"]).toBe("private, no-store");
      expect(file.headers["content-type"]).toBe("image/webp");

      const stranger = await signedIn(t.app, t.prisma);
      expect((await stranger.client.get(`/organization-documents/${ok.body.id}/file`)).status).toBe(
        404
      );
      expect((await anon().get(`/api/v1/organization-documents/${ok.body.id}/file`)).status).toBe(
        401
      );
      const moderator = await staffClient(t, "MODERATOR");
      expect(
        (await moderator.client.get(`/organization-documents/${ok.body.id}/file`)).status
      ).toBe(200);
      // It never appears on any public surface.
      expect((await anon().get("/api/v1/organizations")).body.total).toBe(0);
    });

    it("can be added and removed only while the application is a draft or staff asked for more", async () => {
      const { applicant, application } = await submitApplication(t);
      const late = await applicant.client.upload(
        `/organization-applications/${application.id}/documents`,
        await pngImage(150, 100),
        "late.png"
      );
      expect(late.status).toBe(409);
      const staff = await staffClient(t, "MODERATOR");
      await staff.client.post(
        `/moderation/organization-applications/${application.id}/request-info`,
        { message: "Please add a scan of the appointment letter." }
      );
      const added = await applicant.client.upload(
        `/organization-applications/${application.id}/documents`,
        await pngImage(150, 100),
        "letter.png"
      );
      expect(added.status).toBe(201);
      expect(
        (
          await applicant.client.del(
            `/organization-applications/${application.id}/documents/${added.body.id}`
          )
        ).status
      ).toBe(204);
    });

    it("limits how many documents one application can hold", async () => {
      const { client } = await signedIn(t.app, t.prisma);
      const id = (await create(client)).body.id;
      for (let i = 0; i < 6; i++)
        expect(
          (
            await client.upload(
              `/organization-applications/${id}/documents`,
              await pngImage(100 + i * 7, 100),
              `d${i}.png`
            )
          ).status
        ).toBe(201);
      expect(
        (
          await client.upload(
            `/organization-applications/${id}/documents`,
            await pngImage(300, 100),
            "seventh.png"
          )
        ).body.code
      ).toBe("DOCUMENT_LIMIT");
    });
  });

  describe("staff review and decisions", () => {
    it("lets a moderator read the queue, start a review, ask a question and keep private notes, but not decide", async () => {
      const { applicant, application } = await submitApplication(t);
      const moderator = await staffClient(t, "MODERATOR");
      const queue = await moderator.client.get("/moderation/organization-applications");
      expect(queue.body.items[0]).toMatchObject({ id: application.id, status: "SUBMITTED" });

      expect(
        (
          await moderator.client.post(
            `/moderation/organization-applications/${application.id}/start-review`,
            {}
          )
        ).status
      ).toBe(204);
      expect(
        (await moderator.client.get(`/moderation/organization-applications/${application.id}`)).body
          .status
      ).toBe("UNDER_REVIEW");
      expect(
        (
          await moderator.client.post(
            `/moderation/organization-applications/${application.id}/notes`,
            { notes: "Official page lists this person. Phone to confirm." }
          )
        ).status
      ).toBe(204);

      // Only administrators decide: the guard and the service both say so.
      const decide = await moderator.client.post(
        `/admin/organizations/applications/${application.id}/decision`,
        { decision: "APPROVE", reason: "Looks right to me, honestly." }
      );
      expect(decide.status).toBe(403);
      expect(await t.prisma.organization.count({ where: { verificationStatus: "VERIFIED" } })).toBe(
        0
      );

      // The applicant never sees the notes, in any representation.
      const mine = await applicant.client.get(`/organization-applications/${application.id}`);
      expect(JSON.stringify(mine.body)).not.toContain("Phone to confirm");
      expect(mine.body).not.toHaveProperty("reviewerNotes");
    });

    it("keeps residents and the signed-out away from every staff endpoint", async () => {
      const { application } = await submitApplication(t);
      const resident = await signedIn(t.app, t.prisma);
      for (const [method, path] of [
        ["get", "/moderation/organization-applications"],
        ["get", "/moderation/organizations"],
        ["get", "/moderation/organization-relations"],
        ["get", "/moderation/official-responses"],
        ["post", `/moderation/organization-applications/${application.id}/start-review`],
        ["post", "/admin/organizations"],
        ["post", `/admin/organizations/applications/${application.id}/decision`]
      ] as const) {
        const res =
          method === "get" ? await resident.client.get(path) : await resident.client.post(path, {});
        expect([403, 400]).toContain(res.status);
        expect(res.status).toBe(403);
        expect((await anon()[method](`/api/v1${path}`).send({})).status).toBe(401);
      }
    });

    it("asks the applicant for more information, who can then edit and send again", async () => {
      const { applicant, application } = await submitApplication(t);
      const moderator = await staffClient(t, "MODERATOR");
      expect(
        (
          await moderator.client.post(
            `/moderation/organization-applications/${application.id}/request-info`,
            { message: "short" }
          )
        ).status
      ).toBe(400);
      expect(
        (
          await moderator.client.post(
            `/moderation/organization-applications/${application.id}/request-info`,
            { message: "Please add the gazette notice that established the ministry." }
          )
        ).status
      ).toBe(204);
      const seen = await applicant.client.get(`/organization-applications/${application.id}`);
      expect(seen.body).toMatchObject({
        status: "INFO_REQUESTED",
        infoRequest: "Please add the gazette notice that established the ministry.",
        can: { edit: true, submit: true }
      });
      const note = await t.prisma.notification.findFirst({
        where: {
          userId: (
            await t.prisma.user.findFirstOrThrow({
              where: { email: { contains: "user-" }, id: { not: moderator.user.id } },
              orderBy: { createdAt: "asc" }
            })
          ).id,
          title: { contains: "more information" }
        }
      });
      expect(note?.body).toContain("gazette notice");
      const resent = await applicant.client.patch(`/organization-applications/${application.id}`, {
        officialReferences: [
          ...APPLICATION.officialReferences,
          { kind: "Gazette", label: "Establishing notice", value: "Gazette No. 12 of 1999" }
        ]
      });
      expect(resent.status).toBe(200);
      expect(
        (await applicant.client.post(`/organization-applications/${application.id}/submit`, {}))
          .body.status
      ).toBe("SUBMITTED");
    });

    it("verifies only on an administrator's approval, and the approval has every documented effect", async () => {
      const { applicant, application } = await submitApplication(t);
      const admin = await staffClient(t);
      const res = await admin.client.post(
        `/admin/organizations/applications/${application.id}/decision`,
        {
          decision: "APPROVE",
          reason: "Verified against the ministry's published staff directory."
        }
      );
      expect(res.status).toBe(204);

      const org = await t.prisma.organization.findUniqueOrThrow({
        where: { id: application.organization.id }
      });
      expect(org).toMatchObject({
        verificationStatus: "VERIFIED",
        status: "ACTIVE",
        publicProfile: true
      });
      expect(org.verifiedAt).not.toBeNull();
      const member = await t.prisma.organizationMember.findFirstOrThrow({
        where: { organizationId: org.id }
      });
      expect(member).toMatchObject({
        userId: applicant.user.id,
        role: "ADMIN",
        status: "ACTIVE",
        addedById: admin.user.id
      });
      expect(
        await t.prisma.organizationApplication.findUniqueOrThrow({ where: { id: application.id } })
      ).toMatchObject({
        status: "APPROVED",
        reviewerId: admin.user.id,
        decisionReason: "Verified against the ministry's published staff directory."
      });
      expect(
        await t.prisma.verificationDecision.findMany({ where: { organizationId: org.id } })
      ).toEqual([expect.objectContaining({ action: "APPROVED", actorId: admin.user.id })]);
      expect(
        await t.prisma.auditLog.count({
          where: { action: "organization.verified", entityId: org.id }
        })
      ).toBe(1);

      // The profile is now public, says verified, and shows no applicant or reviewer detail.
      const profile = await anon().get(`/api/v1/organizations/${org.slug}`);
      expect(profile.status).toBe(200);
      expect(profile.body).toMatchObject({ verified: true, verificationStatus: "VERIFIED" });
      expect(JSON.stringify(profile.body)).not.toMatch(
        /applicant|reviewer|authorityStatement|officialReferences|createdBy/i
      );

      const note = await t.prisma.notification.findFirstOrThrow({
        where: { userId: applicant.user.id, title: { contains: "now verified" } }
      });
      expect(note.type).toBe("ORGANIZATION");
      // Account-management news is always emailed (to a confirmed address), whatever the preferences say.
      expect(
        await t.prisma.emailOutbox.count({
          where: { userId: applicant.user.id, kind: "NOTIFICATION" }
        })
      ).toBeGreaterThan(0);
    });

    it("can approve without appointing the applicant, and the applicant then holds no powers", async () => {
      const { applicant, application } = await submitApplication(t);
      const admin = await staffClient(t);
      await admin.client.post(`/admin/organizations/applications/${application.id}/decision`, {
        decision: "APPROVE",
        reason: "Verified, but appoint someone else.",
        appointApplicant: false
      });
      expect(await t.prisma.organizationMember.count()).toBe(0);
      expect(
        (
          await applicant.client.post(
            `/organizations/${application.organization.slug}/invitations`,
            { email: "x@example.test", role: "MEMBER" }
          )
        ).status
      ).toBe(403);
    });

    it("rejects with a reason the applicant can read, leaves the organization unverified and unlisted, and is final", async () => {
      const { applicant, application } = await submitApplication(t);
      const admin = await staffClient(t);
      expect(
        (
          await admin.client.post(`/admin/organizations/applications/${application.id}/decision`, {
            decision: "REJECT",
            reason: "no"
          })
        ).status
      ).toBe(400);
      expect(
        (
          await admin.client.post(`/admin/organizations/applications/${application.id}/decision`, {
            decision: "REJECT",
            reason: "We could not match the references to any public listing."
          })
        ).status
      ).toBe(204);
      const org = await t.prisma.organization.findUniqueOrThrow({
        where: { id: application.organization.id }
      });
      expect(org).toMatchObject({ verificationStatus: "UNVERIFIED", publicProfile: false });
      const mine = await applicant.client.get(`/organization-applications/${application.id}`);
      expect(mine.body).toMatchObject({
        status: "REJECTED",
        decisionReason: "We could not match the references to any public listing."
      });
      expect((await anon().get(`/api/v1/organizations/${org.slug}`)).status).toBe(404);
      expect(
        (
          await admin.client.post(`/admin/organizations/applications/${application.id}/decision`, {
            decision: "APPROVE",
            reason: "Changed my mind about this one."
          })
        ).body.code
      ).toBe("NOT_REVIEWABLE");
      expect(
        (await applicant.client.post(`/organization-applications/${application.id}/submit`, {}))
          .status
      ).toBe(409);
    });

    it("settles a decision once, even when two administrators decide at the same moment", async () => {
      const { application } = await submitApplication(t);
      const a = await staffClient(t);
      const b = await staffClient(t);
      const results = await Promise.all([
        a.client.post(`/admin/organizations/applications/${application.id}/decision`, {
          decision: "APPROVE",
          reason: "Verified against the published directory."
        }),
        b.client.post(`/admin/organizations/applications/${application.id}/decision`, {
          decision: "REJECT",
          reason: "Could not verify the references given."
        })
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
      expect(
        await t.prisma.verificationDecision.count({
          where: { action: { in: ["APPROVED", "REJECTED"] } }
        })
      ).toBe(1);
      expect(await t.prisma.organizationMember.count()).toBeLessThanOrEqual(1);
    });
  });

  describe("conflicts of interest", () => {
    it("never lets someone review or decide their own application, even if they are staff", async () => {
      const staff = await staffClient(t);
      const created = await create(staff.client, APPLICATION);
      await staff.client.post(`/organization-applications/${created.body.id}/submit`, {});
      const attempts = [
        await staff.client.post(
          `/moderation/organization-applications/${created.body.id}/start-review`,
          {}
        ),
        await staff.client.post(
          `/moderation/organization-applications/${created.body.id}/request-info`,
          { message: "Please send more details." }
        ),
        await staff.client.post(`/moderation/organization-applications/${created.body.id}/notes`, {
          notes: "I vouch for myself."
        }),
        await staff.client.post(`/admin/organizations/applications/${created.body.id}/decision`, {
          decision: "APPROVE",
          reason: "I am obviously legitimate."
        })
      ];
      for (const res of attempts) {
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("REVIEW_CONFLICT");
      }
      expect(await t.prisma.organization.count({ where: { verificationStatus: "VERIFIED" } })).toBe(
        0
      );
      // And the database refuses it independently of the application code.
      await expect(
        t.prisma.organizationApplication.update({
          where: { id: created.body.id },
          data: { reviewerId: staff.user.id }
        })
      ).rejects.toThrow();
    });

    it("never lets a staff member who belongs to an organization decide about it", async () => {
      const staff = await staffClient(t);
      const { application } = await submitApplication(t);
      await t.prisma.organizationMember.create({
        data: { organizationId: application.organization.id, userId: staff.user.id, role: "MEMBER" }
      });
      const res = await staff.client.post(
        `/admin/organizations/applications/${application.id}/decision`,
        { decision: "APPROVE", reason: "It is my own organization." }
      );
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("REVIEW_CONFLICT");
    });

    it("does not make a member a Sidewalk staff member, or the reverse", async () => {
      const { application } = await submitApplication(t);
      const admin = await staffClient(t);
      await admin.client.post(`/admin/organizations/applications/${application.id}/decision`, {
        decision: "APPROVE",
        reason: "Verified against the published directory."
      });
      const member = await t.prisma.organizationMember.findFirstOrThrow({
        where: { organizationId: application.organization.id }
      });
      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: member.userId } });
      expect(user.role).toBe("CITIZEN");
      const client = new Client(t.app);
      expect((await client.login(user.email)).status).toBe(200);
      expect((await client.get("/moderation/organization-applications")).status).toBe(403);
      expect((await client.get("/admin/email-outbox")).status).toBe(403);
    });
  });

  describe("the record cannot be rewritten", () => {
    it("keeps verification decisions append-only, even against direct SQL", async () => {
      const { application } = await submitApplication(t);
      const admin = await staffClient(t);
      await admin.client.post(`/admin/organizations/applications/${application.id}/decision`, {
        decision: "APPROVE",
        reason: "Verified against the published directory."
      });
      const row = await t.prisma.verificationDecision.findFirstOrThrow();
      await expect(
        t.prisma
          .$executeRaw`UPDATE "VerificationDecision" SET "reason" = 'rewritten' WHERE id = ${row.id}::uuid`
      ).rejects.toThrow(/append-only/);
      await expect(
        t.prisma.$executeRaw`DELETE FROM "VerificationDecision" WHERE id = ${row.id}::uuid`
      ).rejects.toThrow(/append-only/);
    });

    it("refuses to mark an organization verified without a verification time, or suspended without one", async () => {
      const staff = await signedIn(t.app, t.prisma, "ADMIN");
      const org = await createOrg(t.prisma, { createdById: staff.user.id });
      await expect(
        t.prisma
          .$executeRaw`UPDATE "Organization" SET "verificationStatus" = 'VERIFIED' WHERE id = ${org.id}::uuid`
      ).rejects.toThrow();
      await expect(
        t.prisma
          .$executeRaw`UPDATE "Organization" SET "status" = 'SUSPENDED' WHERE id = ${org.id}::uuid`
      ).rejects.toThrow();
    });
  });

  describe("staff-created onboarding (path B)", () => {
    it("creates an unverified, unlisted record, optionally inviting the representative, and verifies nothing", async () => {
      const admin = await staffClient(t);
      const moderator = await staffClient(t, "MODERATOR");
      expect((await moderator.client.post("/admin/organizations", { ...ORG_FIELDS })).status).toBe(
        403
      );
      const res = await admin.client.post("/admin/organizations", {
        ...ORG_FIELDS,
        inviteEmail: "Director@Roads.Example.Test"
      });
      expect(res.status).toBe(201);
      const org = await t.prisma.organization.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(org).toMatchObject({
        verificationStatus: "UNVERIFIED",
        publicProfile: false,
        status: "ACTIVE"
      });
      expect((await anon().get(`/api/v1/organizations/${org.slug}`)).status).toBe(404);
      const invitation = await t.prisma.organizationInvitation.findFirstOrThrow({
        where: { organizationId: org.id }
      });
      expect(invitation).toMatchObject({
        email: "director@roads.example.test",
        role: "ADMIN",
        status: "PENDING"
      });
      expect(
        await t.prisma.auditLog.count({ where: { action: "organization.created_by_staff" } })
      ).toBe(1);
    });

    it("can list the record publicly, labelled as not verified, only when staff choose to", async () => {
      const admin = await staffClient(t);
      const res = await admin.client.post("/admin/organizations", {
        ...ORG_FIELDS,
        listPublicly: true
      });
      const profile = await anon().get(
        `/api/v1/organizations/${(await t.prisma.organization.findUniqueOrThrow({ where: { id: res.body.id } })).slug}`
      );
      expect(profile.status).toBe(200);
      expect(profile.body).toMatchObject({ verified: false, verificationStatus: "UNVERIFIED" });
    });

    it("refuses to create a second verified-looking record under a verified name", async () => {
      const admin = await staffClient(t);
      await createOrg(t.prisma, {
        name: ORG_FIELDS.name,
        verified: true,
        createdById: admin.user.id
      });
      const res = await admin.client.post("/admin/organizations", { ...ORG_FIELDS });
      expect(res.body.code).toBe("ORGANIZATION_ALREADY_VERIFIED");
    });
  });

  describe("discovery", () => {
    it("lists only listed profiles, and says plainly which are verified", async () => {
      const admin = await staffClient(t);
      await createOrg(t.prisma, {
        name: "Verified Roads Agency",
        verified: true,
        createdById: admin.user.id
      });
      await createOrg(t.prisma, {
        name: "Listed But Unverified Board",
        listed: true,
        createdById: admin.user.id,
        type: "PUBLIC_SERVICE_BODY",
        level: "LOCAL"
      });
      await createOrg(t.prisma, { name: "Hidden Applicant Body", createdById: admin.user.id });
      const all = await anon().get("/api/v1/organizations");
      expect(all.body.total).toBe(2);
      const byName = Object.fromEntries(all.body.items.map((o: { name: string }) => [o.name, o]));
      expect(byName["Verified Roads Agency"]).toMatchObject({
        verified: true,
        verificationStatus: "VERIFIED"
      });
      expect(byName["Listed But Unverified Board"]).toMatchObject({
        verified: false,
        verificationStatus: "UNVERIFIED"
      });
      expect(JSON.stringify(all.body)).not.toContain("Hidden Applicant Body");
      expect(
        (await anon().get("/api/v1/organizations").query({ verified: "true" })).body.total
      ).toBe(1);
      expect(
        (await anon().get("/api/v1/organizations").query({ type: "PUBLIC_SERVICE_BODY" })).body
          .items[0].name
      ).toBe("Listed But Unverified Board");
      expect((await anon().get("/api/v1/organizations").query({ level: "LOCAL" })).body.total).toBe(
        1
      );
    });

    it("searches by name, alias and jurisdiction, treats % and _ literally, and paginates on the server", async () => {
      const admin = await staffClient(t);
      const lagos = await createOrg(t.prisma, {
        name: "Lagos Drainage Authority",
        verified: true,
        jurisdiction: "Lagos State",
        createdById: admin.user.id
      });
      await t.prisma.organization.update({
        where: { id: lagos.id },
        data: { aliases: ["LASDRA"], serviceAreas: ["Ikeja"] }
      });
      for (let i = 0; i < 5; i++)
        await createOrg(t.prisma, {
          name: `Kano Water Board ${i}`,
          verified: true,
          jurisdiction: "Kano State",
          createdById: admin.user.id
        });
      const q = (params: Record<string, string>) =>
        anon().get("/api/v1/organizations").query(params);
      expect((await q({ q: "drainage" })).body.total).toBe(1);
      expect((await q({ q: "LASDRA" })).body.total).toBe(1);
      expect((await q({ q: "Ikeja" })).body.total).toBe(1);
      expect((await q({ jurisdiction: "kano" })).body.total).toBe(5);
      expect((await q({ q: "%" })).body.total).toBe(0);
      expect((await q({ q: "_" })).body.total).toBe(0);
      const page2 = await q({ jurisdiction: "kano", page: "2", pageSize: "2" });
      expect(page2.body).toMatchObject({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
      expect(page2.body.items).toHaveLength(2);
      expect((await q({ pageSize: "500" })).status).toBe(400);
    });

    it("never exposes private fields, unlisted parents or other organizations' members", async () => {
      const admin = await staffClient(t);
      const hidden = await createOrg(t.prisma, {
        name: "Unlisted Parent Ministry",
        createdById: admin.user.id
      });
      const child = await createOrg(t.prisma, {
        name: "Public Child Agency",
        verified: true,
        createdById: admin.user.id
      });
      await t.prisma.organization.update({
        where: { id: child.id },
        data: { parentId: hidden.id }
      });
      const profile = await anon().get(`/api/v1/organizations/${child.slug}`);
      expect(profile.body.parent).toBeNull();
      expect(JSON.stringify(profile.body)).not.toContain("Unlisted Parent Ministry");
      const member = await createUser(t.prisma);
      await t.prisma.organizationMember.create({
        data: { organizationId: child.id, userId: member.id, role: "ADMIN" }
      });
      expect(
        JSON.stringify((await anon().get(`/api/v1/organizations/${child.slug}`)).body)
      ).not.toContain(member.email);
      expect((await anon().get(`/api/v1/organizations/${child.slug}/members`)).status).toBe(401);
      expect((await anon().get("/api/v1/organizations/Not_A_Slug")).status).toBe(404);
    });
  });
});
