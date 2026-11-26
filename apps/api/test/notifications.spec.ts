import request from "supertest";
import {
  Client,
  ORIGIN,
  PASSWORD,
  createApp,
  createUser,
  deliverEmail,
  makeReport,
  pngImage,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";
import { NotificationsService } from "../src/notifications/notifications.service";

describe("Notifications", () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
    t.email.reset();
  });
  afterAll(() => t.close());

  /** A report with an owner, one follower, a moderator and an unrelated citizen. */
  async function scene() {
    const owner = await signedIn(t.app, t.prisma, "CITIZEN", { displayName: "Report Owner" });
    const follower = await signedIn(t.app, t.prisma, "CITIZEN", { displayName: "A Follower" });
    const staff = await signedIn(t.app, t.prisma, "MODERATOR", { displayName: "Moderator Mo" });
    const stranger = await signedIn(t.app, t.prisma, "CITIZEN", { displayName: "A Stranger" });
    const { reference, id } = await makeReport(owner.client);
    const put = await follower.client.agent
      .put(`/api/v1/reports/${reference}/follow`)
      .set("Origin", ORIGIN)
      .set("X-CSRF-Token", follower.client.csrf!);
    expect(put.status).toBe(200);
    return { owner, follower, staff, stranger, reference, id };
  }
  const notificationsOf = (userId: string) =>
    t.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

  describe("who is told what", () => {
    it("a status change reaches the reporter and followers, not the person who made it, not strangers", async () => {
      const s = await scene();
      expect(
        (
          await s.staff.client.post(`/reports/${s.reference}/status`, {
            status: "ACKNOWLEDGED",
            note: "Confirmed with the ward office."
          })
        ).status
      ).toBe(200);
      const mine = await notificationsOf(s.owner.user.id);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        type: "STATUS_CHANGED",
        url: `/issues/${s.reference}`,
        readAt: null
      });
      expect(mine[0]!.title).toContain(s.reference);
      expect(mine[0]!.title).toContain("Acknowledged");
      expect(mine[0]!.body).toContain("Confirmed with the ward office.");
      expect(await notificationsOf(s.follower.user.id)).toHaveLength(1);
      expect(await notificationsOf(s.staff.user.id)).toHaveLength(0); // their own action
      expect(await notificationsOf(s.stranger.user.id)).toHaveLength(0);
    });

    it("does not tell people about their own actions", async () => {
      const s = await scene();
      await s.owner.client.post(`/reports/${s.reference}/status`, {
        status: "RESOLVED",
        note: "The council filled it in yesterday."
      });
      expect(await notificationsOf(s.owner.user.id)).toHaveLength(0);
      const f = await notificationsOf(s.follower.user.id);
      expect(f).toHaveLength(1);
      expect(f[0]!.body).toContain("only a claim until Sidewalk staff verify it");
      await s.owner.client.post(`/reports/${s.reference}/comments`, {
        body: "A comment from the owner themselves."
      });
      expect(await notificationsOf(s.owner.user.id)).toHaveLength(0);
    });

    it("reopening, comments, staff updates and verification each produce their own kind of notification", async () => {
      const s = await scene();
      await s.staff.client.post(`/reports/${s.reference}/status`, {
        status: "RESOLVED",
        note: "Filled with asphalt by the ward team."
      });
      await s.owner.client.upload(`/reports/${s.reference}/evidence`, await pngImage(), "fix.png", {
        kind: "RESOLUTION"
      });
      const admin = await signedIn(t.app, t.prisma, "ADMIN");
      await admin.client.post(`/reports/${s.reference}/verification`, {});
      await s.staff.client.post(`/reports/${s.reference}/status`, {
        status: "REOPENED",
        note: "A resident says the repair has already failed."
      });
      await s.stranger.client.post(`/reports/${s.reference}/comments`, {
        body: "I saw the same thing on my way past today."
      });
      await s.staff.client.post(`/reports/${s.reference}/comments`, {
        body: "We have asked the council for a date.",
        asStaff: true
      });
      const types = (await notificationsOf(s.owner.user.id)).map((n) => n.type);
      expect(types).toEqual([
        "STATUS_CHANGED",
        "RESOLUTION_VERIFIED",
        "REOPENED",
        "COMMENT",
        "STAFF_UPDATE"
      ]);
    });

    it("a commenter starts following and hears about what happens next", async () => {
      const s = await scene();
      await s.stranger.client.post(`/reports/${s.reference}/comments`, {
        body: "Following this one, it affects my street."
      });
      expect(await t.prisma.reportFollow.count({ where: { userId: s.stranger.user.id } })).toBe(1);
      await s.staff.client.post(`/reports/${s.reference}/status`, { status: "ACKNOWLEDGED" });
      expect(await notificationsOf(s.stranger.user.id)).toHaveLength(1);
    });

    it("staff evidence is news, the reporter's own uploads are not", async () => {
      const s = await scene();
      await s.owner.client.upload(`/reports/${s.reference}/evidence`, await pngImage(), "mine.png");
      expect(await notificationsOf(s.owner.user.id)).toHaveLength(0);
      await s.staff.client.upload(
        `/reports/${s.reference}/evidence`,
        await pngImage(),
        "staff.png",
        { kind: "RESOLUTION" }
      );
      const n = await notificationsOf(s.owner.user.id);
      expect(n).toHaveLength(1);
      expect(n[0]!.type).toBe("REPORT_UPDATE");
    });

    it("never notifies suspended or deleted people", async () => {
      const s = await scene();
      await t.prisma.user.update({
        where: { id: s.follower.user.id },
        data: { status: "SUSPENDED" }
      });
      await s.staff.client.post(`/reports/${s.reference}/status`, { status: "ACKNOWLEDGED" });
      expect(await notificationsOf(s.follower.user.id)).toHaveLength(0);
      expect(await notificationsOf(s.owner.user.id)).toHaveLength(1);
    });

    it("followers hear nothing about a report that is hidden from the public", async () => {
      const s = await scene();
      const service = t.app.get(NotificationsService);
      await t.prisma.report.update({ where: { id: s.id }, data: { moderationState: "HIDDEN" } });
      await t.prisma.$transaction((tx) =>
        service.notifyReport(tx, {
          reportId: s.id,
          actorId: null,
          type: "REPORT_UPDATE",
          dedupeKey: "hidden-test",
          title: "x",
          body: "y"
        })
      );
      expect(await notificationsOf(s.follower.user.id)).toHaveLength(0);
      expect(await notificationsOf(s.owner.user.id)).toHaveLength(1);
    });
  });

  describe("moderation decisions", () => {
    it("tell the author what was decided and under which policy, never the reason or the notes", async () => {
      const s = await scene();
      const reasonText = "Confidential: the reporter has a history with the ward chairman.";
      const noteText = "Internal note: likely retaliation, escalate to the lead.";
      await s.staff.client.post(`/moderation/reports/${s.reference}/notes`, { body: noteText });
      await s.staff.client.post(`/moderation/reports/${s.reference}/actions`, {
        action: "HIDE",
        policy: "MISLEADING",
        reason: reasonText
      });
      const mine = await notificationsOf(s.owner.user.id);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ type: "MODERATION" });
      expect(mine[0]!.title).toMatch(/hid your report/);
      expect(mine[0]!.body).toContain("Deliberately misleading");
      await deliverEmail(t.app);
      const everything =
        JSON.stringify(await t.prisma.notification.findMany()) + JSON.stringify(t.email.sent);
      expect(everything).not.toContain("ward chairman");
      expect(everything).not.toContain("retaliation");
      expect(everything).not.toContain(reasonText);
      expect(everything).not.toContain(noteText);
      // The follower is not told about a hidden report.
      expect(await notificationsOf(s.follower.user.id)).toHaveLength(0);
    });

    it("moderating a comment tells the comment's author; restoring says so", async () => {
      const s = await scene();
      const c = await s.stranger.client.post(`/reports/${s.reference}/comments`, {
        body: "Buy cheap followers at my website now."
      });
      await s.staff.client.post(`/moderation/comments/${c.body.id}/actions`, {
        action: "HIDE",
        policy: "SPAM",
        reason: "Advertising unrelated to the report."
      });
      await s.staff.client.post(`/moderation/comments/${c.body.id}/actions`, {
        action: "RESTORE",
        policy: "OTHER",
        reason: "Reviewed again and it is fine."
      });
      const n = await notificationsOf(s.stranger.user.id);
      expect(n.filter((x) => x.type === "MODERATION").map((x) => x.title)).toEqual([
        `Moderators hid your comment on ${s.reference}`,
        `Moderators restored your comment on ${s.reference}`
      ]);
      expect(await notificationsOf(s.staff.user.id)).toHaveLength(0);
    });

    it("a moderator moderating their own content is not told about it", async () => {
      const staffOwner = await signedIn(t.app, t.prisma, "MODERATOR");
      const { reference } = await makeReport(staffOwner.client);
      await staffOwner.client.post(`/moderation/reports/${reference}/actions`, {
        action: "HIDE",
        policy: "OTHER",
        reason: "Hiding my own report for testing."
      });
      expect(await notificationsOf(staffOwner.user.id)).toHaveLength(0);
    });
  });

  describe("email", () => {
    it("is sent after commit, once, to confirmed addresses of people who want it, with a link to the report", async () => {
      const s = await scene();
      await s.staff.client.post(`/reports/${s.reference}/status`, {
        status: "ACKNOWLEDGED",
        note: "Confirmed with the ward office."
      });
      await deliverEmail(t.app);
      const mail = t.email.to(s.owner.user.email);
      expect(mail).toHaveLength(1);
      expect(mail[0]!.subject).toContain(s.reference);
      expect(mail[0]!.text).toContain(`http://localhost:3010/issues/${s.reference}`);
      expect(mail[0]!.text).toContain("/account#notifications");
      expect(t.email.to(s.follower.user.email)).toHaveLength(1);
      expect(t.email.to(s.staff.user.email)).toHaveLength(0);
      await deliverEmail(t.app);
      expect(t.email.to(s.owner.user.email)).toHaveLength(1); // not again
    });

    it("never goes to an unconfirmed address, though the in-app notification is still kept", async () => {
      const s = await scene();
      const lurker = await createUser(t.prisma, { email: "lurker@example.test", verified: false });
      await t.prisma.reportFollow.create({ data: { userId: lurker.id, reportId: s.id } });
      await s.staff.client.post(`/reports/${s.reference}/status`, { status: "ACKNOWLEDGED" });
      await deliverEmail(t.app);
      expect(await notificationsOf(lurker.id)).toHaveLength(1);
      expect(t.email.to("lurker@example.test")).toHaveLength(0);
      expect(await t.prisma.emailOutbox.count({ where: { userId: lurker.id } })).toBe(0);
    });

    it("honours email preferences per kind, while in-app notifications and security email carry on", async () => {
      const s = await scene();
      const patch = await s.owner.client.patch("/users/me/notification-preferences", {
        reportUpdates: false
      });
      expect(patch.body).toEqual({ reportUpdates: false, comments: true, moderation: true });
      await s.staff.client.post(`/reports/${s.reference}/status`, { status: "ACKNOWLEDGED" }); // updates: off
      await s.stranger.client.post(`/reports/${s.reference}/comments`, {
        body: "A comment the owner still wants to hear about."
      }); // comments: on
      await deliverEmail(t.app);
      expect((await notificationsOf(s.owner.user.id)).map((n) => n.type)).toEqual([
        "STATUS_CHANGED",
        "COMMENT"
      ]); // both in-app
      expect(
        t.email
          .to(s.owner.user.email)
          .map((m) => m.subject)
          .join("|")
      ).toMatch(/New comment/);
      expect(
        t.email
          .to(s.owner.user.email)
          .map((m) => m.subject)
          .join("|")
      ).not.toMatch(/Acknowledged/);

      // Security mail is not governed by these settings, even with everything off.
      await s.owner.client.patch("/users/me/notification-preferences", {
        reportUpdates: false,
        comments: false,
        moderation: false
      });
      await s.owner.client.post("/users/me/password", {
        currentPassword: PASSWORD,
        newPassword: "A-new-passphrase-after-prefs-7"
      });
      await deliverEmail(t.app);
      expect(t.email.to(s.owner.user.email).at(-1)!.subject).toMatch(/password was changed/i);
    });

    it("a preference turned off after queueing still wins when the worker runs", async () => {
      const s = await scene();
      await s.staff.client.post(`/reports/${s.reference}/status`, { status: "ACKNOWLEDGED" });
      await s.owner.client.patch("/users/me/notification-preferences", { reportUpdates: false });
      await deliverEmail(t.app);
      expect(t.email.to(s.owner.user.email)).toHaveLength(0);
    });

    it("validates the preference payload", async () => {
      const { client } = await signedIn(t.app, t.prisma);
      expect(
        (await client.patch("/users/me/notification-preferences", { reportUpdates: "yes" })).status
      ).toBe(400);
      expect(
        (await client.patch("/users/me/notification-preferences", { admin: true })).status
      ).toBe(400);
      expect((await client.get("/users/me/notification-preferences")).body).toEqual({
        reportUpdates: true,
        comments: true,
        moderation: true
      });
    });
  });

  describe("duplicates and lost events", () => {
    it("delivering the same event again creates no second notification or email", async () => {
      const s = await scene();
      const service = t.app.get(NotificationsService);
      const event = {
        reportId: s.id,
        actorId: s.staff.user.id,
        type: "STATUS_CHANGED" as const,
        dedupeKey: "status:fixed-id",
        title: "t",
        body: "b"
      };
      for (let i = 0; i < 3; i++)
        await t.prisma.$transaction((tx) => service.notifyReport(tx, event));
      expect(await t.prisma.notification.count({ where: { dedupeKey: "status:fixed-id" } })).toBe(
        2
      ); // owner + follower, once each
      await deliverEmail(t.app);
      expect(t.email.to(s.owner.user.email)).toHaveLength(1);
    });

    it("simultaneous duplicates also collapse", async () => {
      const s = await scene();
      const service = t.app.get(NotificationsService);
      const event = {
        reportId: s.id,
        actorId: s.staff.user.id,
        type: "STATUS_CHANGED" as const,
        dedupeKey: "status:race-id",
        title: "t",
        body: "b"
      };
      await Promise.all(
        Array.from({ length: 5 }, () =>
          t.prisma.$transaction((tx) => service.notifyReport(tx, event)).catch(() => undefined)
        )
      );
      expect(
        await t.prisma.notification.count({
          where: { dedupeKey: "status:race-id", userId: s.owner.user.id }
        })
      ).toBe(1);
      expect(
        await t.prisma.emailOutbox.count({
          where: { userId: s.owner.user.id, kind: "NOTIFICATION" }
        })
      ).toBe(1);
    });

    it("an event that fails to commit leaves no notification and no email", async () => {
      const s = await scene();
      // The second of two simultaneous identical changes loses the race and rolls back as a whole.
      const [a, b] = await Promise.all([
        s.staff.client.post(`/reports/${s.reference}/status`, { status: "ACKNOWLEDGED" }),
        (await signedIn(t.app, t.prisma, "MODERATOR")).client.post(
          `/reports/${s.reference}/status`,
          { status: "ACKNOWLEDGED" }
        )
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      await deliverEmail(t.app);
      expect(
        (await notificationsOf(s.owner.user.id)).filter((n) => n.type === "STATUS_CHANGED")
      ).toHaveLength(1);
      expect(t.email.to(s.owner.user.email)).toHaveLength(1);
    });

    it("an event that was committed is still delivered after a worker crash and restart", async () => {
      const s = await scene();
      await s.staff.client.post(`/reports/${s.reference}/status`, { status: "ACKNOWLEDGED" });
      // The worker claimed the messages and died before sending: no one saw them, and the row is stuck in SENDING.
      await t.prisma.emailOutbox.updateMany({
        data: { status: "SENDING", lockedAt: new Date(Date.now() - 20 * 60_000), attempts: 1 }
      });
      expect(t.email.sent).toHaveLength(0);
      await deliverEmail(t.app);
      expect(t.email.to(s.owner.user.email)).toHaveLength(1);
    });
  });

  describe("the notification centre API", () => {
    async function threeNotifications() {
      const s = await scene();
      for (const status of ["UNDER_REVIEW", "ACKNOWLEDGED", "IN_PROGRESS"] as const)
        await s.staff.client.post(`/reports/${s.reference}/status`, { status });
      return s;
    }

    it("lists, counts, paginates and filters unread, newest first", async () => {
      const s = await threeNotifications();
      const all = await s.owner.client.get("/notifications?pageSize=2");
      expect(all.body).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2, unread: 3 });
      expect(all.body.items).toHaveLength(2);
      expect(all.body.items[0].title).toContain("In progress");
      expect(all.body.items[0]).toMatchObject({ read: false, url: `/issues/${s.reference}` });
      expect(
        (await s.owner.client.get("/notifications?pageSize=2&page=2")).body.items
      ).toHaveLength(1);
      expect((await s.owner.client.get("/notifications/unread-count")).body).toEqual({ unread: 3 });
      expect((await s.owner.client.get("/auth/me")).body.unreadNotifications).toBe(3);
      expect((await s.owner.client.get("/notifications?pageSize=500")).status).toBe(400);
      expect((await s.owner.client.get("/notifications?unread=maybe")).status).toBe(400);
    });

    it("marks one read and unread, and all read", async () => {
      const s = await threeNotifications();
      const items = (await s.owner.client.get("/notifications")).body.items as Array<{
        id: string;
      }>;
      expect((await s.owner.client.post(`/notifications/${items[0]!.id}/read`, {})).status).toBe(
        204
      );
      expect((await s.owner.client.get("/notifications/unread-count")).body.unread).toBe(2);
      expect((await s.owner.client.get("/notifications?unread=true")).body.total).toBe(2);
      expect((await s.owner.client.post(`/notifications/${items[0]!.id}/unread`, {})).status).toBe(
        204
      );
      expect((await s.owner.client.get("/notifications/unread-count")).body.unread).toBe(3);
      expect((await s.owner.client.post("/notifications/read-all", {})).body).toEqual({
        marked: 3
      });
      expect((await s.owner.client.get("/notifications/unread-count")).body.unread).toBe(0);
    });

    it("one user cannot read, count, mark or even confirm the existence of another user's notifications", async () => {
      const s = await threeNotifications();
      const theirs = (
        await t.prisma.notification.findFirstOrThrow({ where: { userId: s.owner.user.id } })
      ).id;
      expect((await s.stranger.client.get("/notifications")).body.total).toBe(0);
      expect(JSON.stringify((await s.stranger.client.get("/notifications")).body)).not.toContain(
        s.reference
      );
      expect((await s.stranger.client.get("/notifications/unread-count")).body.unread).toBe(0);
      const read = await s.stranger.client.post(`/notifications/${theirs}/read`, {});
      const unread = await s.stranger.client.post(`/notifications/${theirs}/unread`, {});
      const missing = await s.stranger.client.post(
        "/notifications/00000000-0000-4000-8000-000000000000/read",
        {}
      );
      expect([read.status, unread.status, missing.status]).toEqual([404, 404, 404]);
      expect(read.body.message).toBe(missing.body.message); // indistinguishable from "does not exist"
      expect((await s.stranger.client.post("/notifications/read-all", {})).body).toEqual({
        marked: 0
      });
      // Nothing of the owner's changed.
      expect((await s.owner.client.get("/notifications/unread-count")).body.unread).toBe(3);
    });

    it("requires sign-in, a valid id, and a CSRF token for changes", async () => {
      const s = await threeNotifications();
      expect((await api().get("/api/v1/notifications")).status).toBe(401);
      expect((await api().post("/api/v1/notifications/read-all").send({})).status).toBe(401);
      expect((await s.owner.client.post("/notifications/not-a-uuid/read", {})).status).toBe(400);
      const id = (
        await t.prisma.notification.findFirstOrThrow({ where: { userId: s.owner.user.id } })
      ).id;
      const noCsrf = await s.owner.client.agent
        .post(`/api/v1/notifications/${id}/read`)
        .set("Origin", ORIGIN)
        .send({});
      expect(noCsrf.status).toBe(403);
      expect(noCsrf.body.code).toBe("CSRF_FAILED");
      expect((await s.owner.client.get("/notifications/unread-count")).body.unread).toBe(3);
    });

    it("an unconfirmed account can still read its own notifications", async () => {
      const { client, user } = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });
      await t.prisma.notification.create({
        data: {
          userId: user.id,
          type: "REPORT_UPDATE",
          title: "t",
          body: "b",
          url: "/issues/SW-AAAAAA",
          dedupeKey: "x"
        }
      });
      expect((await client.get("/notifications")).body.total).toBe(1);
    });
  });

  describe("following", () => {
    it("needs a confirmed account and a public report; owners follow automatically", async () => {
      const s = await scene();
      const put = (c: Client, ref = s.reference) =>
        c.agent
          .put(`/api/v1/reports/${ref}/follow`)
          .set("Origin", ORIGIN)
          .set("X-CSRF-Token", c.csrf!);
      const del = (c: Client) =>
        c.agent
          .delete(`/api/v1/reports/${s.reference}/follow`)
          .set("Origin", ORIGIN)
          .set("X-CSRF-Token", c.csrf!);
      const unconfirmed = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });
      expect((await put(unconfirmed.client)).status).toBe(403);
      expect((await put(s.owner.client)).body).toEqual({ following: true });
      expect(await t.prisma.reportFollow.count({ where: { userId: s.owner.user.id } })).toBe(0);
      expect((await s.owner.client.get(`/reports/${s.reference}`)).body.viewer.following).toBe(
        true
      );
      expect((await s.follower.client.get(`/reports/${s.reference}`)).body.viewer.following).toBe(
        true
      );
      expect((await s.stranger.client.get(`/reports/${s.reference}`)).body.viewer.following).toBe(
        false
      );
      expect((await del(s.follower.client)).body).toEqual({ following: false });
      expect((await s.follower.client.get(`/reports/${s.reference}`)).body.viewer.following).toBe(
        false
      );
      await t.prisma.report.update({ where: { id: s.id }, data: { moderationState: "HIDDEN" } });
      expect((await put(s.stranger.client)).status).toBe(404);
      expect((await put(s.stranger.client, "SW-AAAAAA")).status).toBe(404);
    });
  });

  describe("account deletion", () => {
    it("removes the person's notifications, follows, pending links and queued email addresses", async () => {
      const s = await scene();
      await s.staff.client.post(`/reports/${s.reference}/status`, { status: "ACKNOWLEDGED" });
      await api().post("/api/v1/auth/password/forgot").send({ email: s.follower.user.email });
      expect((await s.follower.client.del("/users/me", { password: PASSWORD })).status).toBe(204);
      expect(await t.prisma.notification.count({ where: { userId: s.follower.user.id } })).toBe(0);
      expect(await t.prisma.reportFollow.count({ where: { userId: s.follower.user.id } })).toBe(0);
      expect(await t.prisma.authToken.count({ where: { userId: s.follower.user.id } })).toBe(0);
      const rows = await t.prisma.emailOutbox.findMany({ where: { userId: s.follower.user.id } });
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.toEmail).toBe("deleted@deleted.invalid");
        expect(r.payloadCiphertext).toBeNull();
        expect(r.status).not.toBe("PENDING");
      }
      await deliverEmail(t.app);
      expect(t.email.to(s.follower.user.email)).toHaveLength(0);
      // The owner is unaffected.
      expect(await notificationsOf(s.owner.user.id)).toHaveLength(1);
    });
  });
});
