import { Injectable } from "@nestjs/common";
import { LIMITS, type CommentDto, type Paginated } from "@sidewalk/contracts";
import { ActivityService } from "../activity/activity.service";
import { AppError } from "../common/app-error";
import { type AuthUser, assertVerifiedEmail, isStaff } from "../common/auth-types";
import { paginate } from "../common/utils/pagination";
import { cleanText, excerpt } from "../common/utils/text";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

type Row = {
  id: string;
  kind: "CITIZEN" | "STAFF" | "OFFICIAL";
  body: string;
  authorId: string;
  moderationState: "VISIBLE" | "HIDDEN" | "REMOVED";
  deletedByAuthorAt: Date | null;
  editedAt: Date | null;
  createdAt: Date;
  author: { displayName: string };
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService
  ) {}

  private async reportFor(reference: string, viewer: AuthUser | undefined) {
    const report = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true, reporterId: true, moderationState: true }
    });
    const allowed =
      report &&
      (report.moderationState === "VISIBLE" ||
        (viewer && (viewer.id === report.reporterId || isStaff(viewer))));
    if (!report || !allowed) throw AppError.notFound("We could not find that report.");
    return report;
  }

  async list(
    reference: string,
    viewer: AuthUser | undefined,
    page: number,
    pageSize: number
  ): Promise<Paginated<CommentDto>> {
    const report = await this.reportFor(reference, viewer);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.comment.count({ where: { reportId: report.id } }),
      this.prisma.comment.findMany({
        where: { reportId: report.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { author: { select: { displayName: true } } }
      })
    ]);
    return paginate(
      rows.map((r) => this.toDto(r, report.reporterId, viewer)),
      total,
      page,
      pageSize
    );
  }

  async create(
    user: AuthUser,
    reference: string,
    body: string,
    asStaff: boolean
  ): Promise<CommentDto> {
    assertVerifiedEmail(user);
    const report = await this.reportFor(reference, user);
    if (report.moderationState !== "VISIBLE")
      throw AppError.conflict(
        "REPORT_NOT_VISIBLE",
        "This report is hidden, so it cannot receive comments."
      );
    if (asStaff && !isStaff(user))
      throw AppError.forbidden("Only Sidewalk staff can post staff updates.");

    const text = cleanText(body);
    if (text.length < LIMITS.comment.min) {
      const message = `Write at least ${LIMITS.comment.min} characters.`;
      throw AppError.badRequest("VALIDATION_FAILED", message, [{ field: "body", message }]);
    }
    // Spam: the same words repeated on the same report within the hour are refused.
    const repeat = await this.prisma.comment.findFirst({
      where: {
        reportId: report.id,
        authorId: user.id,
        createdAt: { gte: new Date(Date.now() - 3_600_000) },
        body: { equals: text, mode: "insensitive" }
      },
      select: { id: true }
    });
    if (repeat)
      throw AppError.conflict(
        "DUPLICATE_COMMENT",
        "You already posted that on this report. Add something new instead."
      );
    const kind = asStaff ? "STAFF" : "CITIZEN";
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { reportId: report.id, authorId: user.id, kind, body: text },
        include: { author: { select: { displayName: true } } }
      });
      await tx.report.update({ where: { id: report.id }, data: { lastActivityAt: new Date() } });
      await this.activity.record(tx, {
        reportId: report.id,
        type: "COMMENT_ADDED",
        actorId: user.id,
        // Only staff updates join the public timeline; ordinary comments already appear in the discussion.
        isPublic: kind === "STAFF",
        payload: {
          commentId: created.id,
          actorRole: asStaff ? "STAFF" : "REPORTER",
          authorName: user.displayName
        }
      });
      // Commenting is a sign of interest: the commenter hears about what happens next.
      if (user.id !== report.reporterId) {
        await tx.reportFollow.upsert({
          where: { userId_reportId: { userId: user.id, reportId: report.id } },
          update: {},
          create: { userId: user.id, reportId: report.id }
        });
      }
      await this.notifications.notifyReport(tx, {
        reportId: report.id,
        actorId: user.id,
        type: kind === "STAFF" ? "STAFF_UPDATE" : "COMMENT",
        dedupeKey: `comment:${created.id}`,
        title:
          kind === "STAFF"
            ? `Sidewalk staff posted an update on ${reference}`
            : `New comment on ${reference}`,
        body: `${kind === "STAFF" ? "Sidewalk staff" : user.displayName}: ${excerpt(text, 140)}`
      });
      return created;
    });
    return this.toDto(row, report.reporterId, user);
  }

  async edit(user: AuthUser, commentId: string, body: string): Promise<CommentDto> {
    assertVerifiedEmail(user);
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        author: { select: { displayName: true } },
        report: { select: { reporterId: true } }
      }
    });
    if (!comment || comment.report === null)
      throw AppError.notFound("We could not find that comment.");
    if (comment.authorId !== user.id)
      throw AppError.forbidden("You can only edit your own comments.");
    if (comment.moderationState !== "VISIBLE" || comment.deletedByAuthorAt)
      throw AppError.conflict("COMMENT_LOCKED", "This comment can no longer be edited.");
    const ageMinutes = (Date.now() - comment.createdAt.getTime()) / 60_000;
    if (ageMinutes > LIMITS.commentEditWindowMinutes) {
      throw AppError.conflict(
        "EDIT_WINDOW_CLOSED",
        `Comments can only be edited for ${LIMITS.commentEditWindowMinutes} minutes after posting. Post a follow-up instead.`
      );
    }
    const text = cleanText(body);
    if (text.length < LIMITS.comment.min)
      throw AppError.badRequest(
        "VALIDATION_FAILED",
        `Write at least ${LIMITS.comment.min} characters.`,
        [{ field: "body", message: `Write at least ${LIMITS.comment.min} characters.` }]
      );
    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body: text, editedAt: new Date() },
      include: { author: { select: { displayName: true } } }
    });
    return this.toDto(updated, comment.report.reporterId, user);
  }

  async remove(user: AuthUser, commentId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw AppError.notFound("We could not find that comment.");
    if (comment.authorId !== user.id)
      throw AppError.forbidden(
        "You can only delete your own comments. To report a comment, flag it."
      );
    if (comment.deletedByAuthorAt) return;
    await this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedByAuthorAt: new Date() }
    });
  }

  private toDto(r: Row, reporterId: string, viewer: AuthUser | undefined): CommentDto {
    const authorDeleted = r.deletedByAuthorAt !== null;
    const moderated = r.moderationState !== "VISIBLE";
    const mine = !!viewer && viewer.id === r.authorId;
    const tombstone = authorDeleted ? "AUTHOR_DELETED" : moderated ? "MODERATED" : null;
    const withinWindow =
      (Date.now() - r.createdAt.getTime()) / 60_000 <= LIMITS.commentEditWindowMinutes;
    return {
      id: r.id,
      kind: r.kind,
      body: tombstone ? null : r.body,
      authorName: r.kind === "STAFF" ? "Sidewalk staff" : r.author.displayName,
      isReportOwner: r.authorId === reporterId,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      tombstone,
      mine,
      canEdit: mine && !tombstone && withinWindow,
      canDelete: mine && !authorDeleted
    };
  }
}
