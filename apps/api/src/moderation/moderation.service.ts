import { Injectable } from "@nestjs/common";
import {
  MODERATION_POLICY_LABELS,
  type FlagDto,
  type ModerationActionDto as ModerationActionResult,
  type Paginated
} from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { type AuthUser, assertStaff, assertVerifiedEmail, isStaff } from "../common/auth-types";
import { paginate } from "../common/utils/pagination";
import { cleanLine, cleanText, excerpt, likeEscape } from "../common/utils/text";
import { AuditService } from "../audit/audit.service";
import type { ModerationState, Prisma } from "../generated/prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { OrganizationAccessService } from "../organizations/organization-access.service";
import { PrismaService } from "../prisma/prisma.service";
import type { ContentListQuery, CreateFlagDto, FlagListQuery, ModerationActionDto } from "./dto";

type Action = ModerationActionDto["action"];

/** What each action may do. REMOVED content can only be brought back by an administrator. */
function resolveTarget(
  action: Action,
  current: ModerationState,
  role: AuthUser["role"]
): ModerationState {
  switch (action) {
    case "HIDE":
      if (current !== "VISIBLE")
        throw AppError.conflict("INVALID_MODERATION", "Only visible content can be hidden.");
      return "HIDDEN";
    case "REMOVE":
      if (current === "REMOVED")
        throw AppError.conflict("INVALID_MODERATION", "This content is already removed.");
      return "REMOVED";
    case "RESTORE":
      if (current === "VISIBLE")
        throw AppError.conflict("INVALID_MODERATION", "This content is already visible.");
      if (current === "REMOVED" && role !== "ADMIN")
        throw AppError.forbidden("Removed content can only be restored by an administrator.");
      return "VISIBLE";
  }
}

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly organizations: OrganizationAccessService
  ) {}

  // ───────────────────────────── citizen flagging ─────────────────────────────

  async flagReport(user: AuthUser, reference: string, dto: CreateFlagDto): Promise<void> {
    assertVerifiedEmail(user);
    const report = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true, reporterId: true, moderationState: true }
    });
    if (!report || report.moderationState !== "VISIBLE")
      throw AppError.notFound("We could not find that report.");
    if (report.reporterId === user.id)
      throw AppError.badRequest("OWN_CONTENT", "You cannot flag your own report. Edit it instead.");
    await this.createFlag({ user, target: "REPORT", reportId: report.id, commentId: null, dto });
  }

  async flagComment(user: AuthUser, commentId: string, dto: CreateFlagDto): Promise<void> {
    assertVerifiedEmail(user);
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { report: { select: { moderationState: true } } }
    });
    if (
      !comment ||
      comment.moderationState !== "VISIBLE" ||
      comment.deletedByAuthorAt ||
      comment.report.moderationState !== "VISIBLE"
    ) {
      throw AppError.notFound("We could not find that comment.");
    }
    if (comment.authorId === user.id)
      throw AppError.badRequest(
        "OWN_CONTENT",
        "You cannot flag your own comment. Delete it instead."
      );
    await this.createFlag({
      user,
      target: "COMMENT",
      reportId: comment.reportId,
      commentId: comment.id,
      dto
    });
  }

  /**
   * Anyone signed in with a confirmed address may challenge an official response (a misleading claim, a resolution
   * that did not happen). The organization's own members may not flag its statements.
   */
  async flagResponse(user: AuthUser, responseId: string, dto: CreateFlagDto): Promise<void> {
    assertVerifiedEmail(user);
    const response = await this.prisma.officialResponse.findUnique({
      where: { id: responseId },
      include: { report: { select: { moderationState: true } } }
    });
    if (
      !response ||
      response.moderationState !== "VISIBLE" ||
      response.report.moderationState !== "VISIBLE"
    )
      throw AppError.notFound("We could not find that statement.");
    if (await this.organizations.isMember(user.id, response.organizationId))
      throw AppError.badRequest(
        "OWN_CONTENT",
        "You belong to the organization that published this statement. Correct or withdraw it instead."
      );
    await this.createFlag({
      user,
      target: "OFFICIAL_RESPONSE",
      reportId: response.reportId,
      commentId: null,
      responseId: response.id,
      dto
    });
  }

  private async createFlag(p: {
    user: AuthUser;
    target: "REPORT" | "COMMENT" | "OFFICIAL_RESPONSE";
    reportId: string;
    commentId: string | null;
    responseId?: string | null;
    dto: CreateFlagDto;
  }): Promise<void> {
    const targetKey =
      p.target === "REPORT"
        ? `report:${p.reportId}`
        : p.target === "COMMENT"
          ? `comment:${p.commentId}`
          : `response:${p.responseId}`;
    try {
      await this.prisma.contentFlag.create({
        data: {
          target: p.target,
          reportId: p.reportId,
          commentId: p.commentId,
          responseId: p.responseId ?? null,
          targetKey,
          reporterId: p.user.id,
          reason: p.dto.reason,
          details: p.dto.details ? cleanText(p.dto.details) || null : null
        }
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002")
        throw AppError.conflict(
          "ALREADY_FLAGGED",
          "You have already flagged this. A moderator will review it."
        );
      throw e;
    }
  }

  // ───────────────────────────── moderator queues ─────────────────────────────

  async listFlags(user: AuthUser, query: FlagListQuery): Promise<Paginated<FlagDto>> {
    assertStaff(user);
    const where: Prisma.ContentFlagWhereInput =
      query.status === "ALL" ? {} : { status: query.status };
    // Two plain reads rather than one batch transaction: this query joins four relations, and Prisma runs those
    // concurrently on the batch's single connection.
    const [total, rows] = await Promise.all([
      this.prisma.contentFlag.count({ where }),
      this.prisma.contentFlag.findMany({
        where,
        orderBy: { createdAt: query.status === "OPEN" ? "asc" : "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          reporter: { select: { displayName: true } },
          report: { select: { reference: true, title: true, moderationState: true } },
          comment: {
            select: {
              id: true,
              body: true,
              moderationState: true,
              author: { select: { displayName: true } }
            }
          },
          response: {
            select: {
              id: true,
              body: true,
              type: true,
              moderationState: true,
              organizationName: true,
              authorName: true
            }
          }
        }
      })
    ]);
    const items: FlagDto[] = rows.map((f) => ({
      id: f.id,
      target: f.target,
      reason: f.reason,
      details: f.details,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
      reporterName: f.reporter.displayName,
      report: f.report,
      comment: f.comment
        ? {
            id: f.comment.id,
            body: f.comment.body,
            moderationState: f.comment.moderationState,
            authorName: f.comment.author.displayName
          }
        : null,
      response: f.response
        ? {
            id: f.response.id,
            body: f.response.body,
            type: f.response.type,
            moderationState: f.response.moderationState,
            organizationName: f.response.organizationName,
            authorName: f.response.authorName
          }
        : null
    }));
    return paginate(items, total, query.page, query.pageSize);
  }

  async listReports(user: AuthUser, query: ContentListQuery) {
    assertStaff(user);
    const where: Prisma.ReportWhereInput = {
      ...(query.state !== "ALL" ? { moderationState: query.state } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { title: { contains: likeEscape(query.q.trim()), mode: "insensitive" } },
              { reference: { equals: query.q.trim().toUpperCase() } }
            ]
          }
        : {})
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          reference: true,
          title: true,
          status: true,
          moderationState: true,
          createdAt: true,
          reporter: { select: { displayName: true } },
          _count: { select: { flags: { where: { status: "OPEN" } } } }
        }
      })
    ]);
    return paginate(
      rows.map((r) => ({
        reference: r.reference,
        title: r.title,
        status: r.status,
        moderationState: r.moderationState,
        createdAt: r.createdAt.toISOString(),
        reporterName: r.reporter.displayName,
        openFlags: r._count.flags
      })),
      total,
      query.page,
      query.pageSize
    );
  }

  async listComments(user: AuthUser, query: ContentListQuery) {
    assertStaff(user);
    const where: Prisma.CommentWhereInput = {
      ...(query.state !== "ALL" ? { moderationState: query.state } : {}),
      ...(query.q?.trim()
        ? { body: { contains: likeEscape(query.q.trim()), mode: "insensitive" } }
        : {})
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          body: true,
          kind: true,
          moderationState: true,
          createdAt: true,
          author: { select: { displayName: true } },
          report: { select: { reference: true, title: true } }
        }
      })
    ]);
    return paginate(
      rows.map((c) => ({
        id: c.id,
        excerpt: excerpt(c.body, 220),
        kind: c.kind,
        moderationState: c.moderationState,
        createdAt: c.createdAt.toISOString(),
        authorName: c.author.displayName,
        report: c.report
      })),
      total,
      query.page,
      query.pageSize
    );
  }

  async history(
    user: AuthUser,
    page: number,
    pageSize: number
  ): Promise<Paginated<ModerationActionResult>> {
    assertStaff(user);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.moderationAction.count(),
      this.prisma.moderationAction.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          moderator: { select: { displayName: true } },
          report: { select: { reference: true } }
        }
      })
    ]);
    return paginate(
      rows.map((a) => ({
        id: a.id,
        action: a.action,
        policy: a.policy,
        reason: a.reason,
        target: a.target,
        previousState: a.previousState,
        newState: a.newState,
        moderatorName: a.moderator.displayName,
        reportReference: a.report.reference,
        createdAt: a.createdAt.toISOString()
      })),
      total,
      page,
      pageSize
    );
  }

  // ───────────────────────────── decisions ─────────────────────────────

  async actOnReport(
    user: AuthUser,
    reference: string,
    dto: ModerationActionDto
  ): Promise<{ moderationState: ModerationState }> {
    assertStaff(user);
    const report = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true, moderationState: true }
    });
    if (!report) throw AppError.notFound("We could not find that report.");
    const next = resolveTarget(dto.action, report.moderationState, user.role);
    const reason = this.cleanReason(dto.reason);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.report.updateMany({
        where: { id: report.id, moderationState: report.moderationState },
        data: { moderationState: next }
      });
      if (claimed.count === 0)
        throw AppError.conflict(
          "STALE_STATE",
          "This content changed while you were reviewing it. Reload and try again."
        );
      await this.recordAction(tx, {
        user,
        target: "REPORT",
        reportId: report.id,
        commentId: null,
        action: dto.action,
        policy: dto.policy,
        reason,
        previous: report.moderationState,
        next
      });
    });
    return { moderationState: next };
  }

  async actOnComment(
    user: AuthUser,
    commentId: string,
    dto: ModerationActionDto
  ): Promise<{ moderationState: ModerationState }> {
    assertStaff(user);
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, reportId: true, moderationState: true }
    });
    if (!comment) throw AppError.notFound("We could not find that comment.");
    const next = resolveTarget(dto.action, comment.moderationState, user.role);
    const reason = this.cleanReason(dto.reason);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.comment.updateMany({
        where: { id: comment.id, moderationState: comment.moderationState },
        data: { moderationState: next }
      });
      if (claimed.count === 0)
        throw AppError.conflict(
          "STALE_STATE",
          "This content changed while you were reviewing it. Reload and try again."
        );
      await this.recordAction(tx, {
        user,
        target: "COMMENT",
        reportId: comment.reportId,
        commentId: comment.id,
        action: dto.action,
        policy: dto.policy,
        reason,
        previous: comment.moderationState,
        next
      });
    });
    return { moderationState: next };
  }

  /**
   * Hides, removes or restores an official response. Only its visibility changes: the text, author and time stay in the
   * database and in the audit trail. Staff who belong to the responding organization cannot decide on its statements.
   */
  async actOnResponse(
    user: AuthUser,
    responseId: string,
    dto: ModerationActionDto
  ): Promise<{ moderationState: ModerationState }> {
    assertStaff(user);
    const response = await this.prisma.officialResponse.findUnique({
      where: { id: responseId },
      select: { id: true, reportId: true, organizationId: true, moderationState: true }
    });
    if (!response) throw AppError.notFound("We could not find that statement.");
    if (await this.organizations.isMember(user.id, response.organizationId))
      throw AppError.conflict(
        "REVIEW_CONFLICT",
        "You belong to the organization that published this statement, so you cannot moderate it."
      );
    const next = resolveTarget(dto.action, response.moderationState, user.role);
    const reason = this.cleanReason(dto.reason);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.officialResponse.updateMany({
        where: { id: response.id, moderationState: response.moderationState },
        data: { moderationState: next }
      });
      if (claimed.count === 0)
        throw AppError.conflict(
          "STALE_STATE",
          "This content changed while you were reviewing it. Reload and try again."
        );
      // Notifications (and the emails built from them when sent) carry an excerpt of the statement. Once it is
      // withheld, the excerpt must not live on in anyone's inbox: keep the fact and the caveats, drop the words.
      // Restoring does not bring the excerpt back; the statement itself is visible again on the report.
      if (next !== "VISIBLE") {
        const where = { dedupeKey: `response:${response.id}` };
        const withheld = "The text of this statement is currently withheld from public view.";
        await tx.notification.updateMany({
          where: { ...where, type: "RESOLUTION_CLAIMED" },
          data: {
            body: `This is the organization's claim. It has not been independently verified. ${withheld}`
          }
        });
        await tx.notification.updateMany({
          where: { ...where, type: "OFFICIAL_RESPONSE" },
          data: { body: withheld }
        });
      }
      await this.recordAction(tx, {
        user,
        target: "OFFICIAL_RESPONSE",
        reportId: response.reportId,
        commentId: null,
        responseId: response.id,
        action: dto.action,
        policy: dto.policy,
        reason,
        previous: response.moderationState,
        next
      });
    });
    return { moderationState: next };
  }

  async dismissFlag(user: AuthUser, flagId: string, reason: string): Promise<void> {
    assertStaff(user);
    const flag = await this.prisma.contentFlag.findUnique({
      where: { id: flagId },
      include: {
        report: { select: { moderationState: true } },
        comment: { select: { moderationState: true } },
        response: { select: { moderationState: true } }
      }
    });
    if (!flag) throw AppError.notFound("We could not find that flag.");
    if (flag.status !== "OPEN")
      throw AppError.conflict("FLAG_HANDLED", "This flag has already been handled.");
    const current = (flag.response?.moderationState ??
      flag.comment?.moderationState ??
      flag.report.moderationState) as ModerationState;
    await this.prisma.$transaction(async (tx) => {
      await tx.contentFlag.update({
        where: { id: flagId },
        data: { status: "DISMISSED", handledById: user.id, handledAt: new Date() }
      });
      await tx.moderationAction.create({
        data: {
          moderatorId: user.id,
          target: flag.target,
          reportId: flag.reportId,
          commentId: flag.commentId,
          responseId: flag.responseId,
          action: "DISMISS",
          policy: null,
          reason: this.cleanReason(reason),
          previousState: current,
          newState: current
        }
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: "moderation.flag_dismissed",
          entityType: "ContentFlag",
          entityId: flagId
        },
        tx
      );
    });
  }

  private async recordAction(
    tx: Prisma.TransactionClient,
    p: {
      user: AuthUser;
      target: "REPORT" | "COMMENT" | "OFFICIAL_RESPONSE";
      reportId: string;
      commentId: string | null;
      responseId?: string | null;
      action: Action;
      policy: ModerationActionDto["policy"];
      reason: string;
      previous: ModerationState;
      next: ModerationState;
    }
  ): Promise<void> {
    const decision = await tx.moderationAction.create({
      data: {
        moderatorId: p.user.id,
        target: p.target,
        reportId: p.reportId,
        commentId: p.commentId,
        responseId: p.responseId ?? null,
        action: p.action,
        policy: p.policy,
        reason: p.reason,
        previousState: p.previous,
        newState: p.next
      }
    });
    // Tell the author. The notification names the decision and the policy only: the written reason (which a
    // moderator may have phrased for staff eyes) stays on the page the author can open, and internal notes
    // are never part of any notification.
    const report = await tx.report.findUniqueOrThrow({
      where: { id: p.reportId },
      select: { reporterId: true, reference: true }
    });
    const author =
      p.target === "REPORT"
        ? report.reporterId
        : p.target === "OFFICIAL_RESPONSE"
          ? (
              await tx.officialResponse.findUniqueOrThrow({
                where: { id: p.responseId as string },
                select: { authorId: true }
              })
            ).authorId
          : (
              await tx.comment.findUniqueOrThrow({
                where: { id: p.commentId as string },
                select: { authorId: true }
              })
            ).authorId;
    const what =
      p.target === "REPORT"
        ? `your report ${report.reference}`
        : p.target === "OFFICIAL_RESPONSE"
          ? `your organization's statement on ${report.reference}`
          : `your comment on ${report.reference}`;
    const did = p.action === "HIDE" ? "hid" : p.action === "REMOVE" ? "removed" : "restored";
    await this.notifications.notifyUser(tx, {
      userId: author,
      actorId: p.user.id,
      reportId: p.reportId,
      type: "MODERATION",
      dedupeKey: `moderation:${decision.id}`,
      title: `Moderators ${did} ${what}`,
      body:
        p.action === "RESTORE"
          ? "It is visible to everyone again."
          : `This was decided under the policy “${p.policy ? MODERATION_POLICY_LABELS[p.policy] : "other"}”. Open it to read the reason.`,
      url: `/issues/${report.reference}`
    });
    if (p.action !== "RESTORE") {
      // A decision settles every open flag on the same item.
      await tx.contentFlag.updateMany({
        where: {
          status: "OPEN",
          targetKey:
            p.target === "REPORT"
              ? `report:${p.reportId}`
              : p.target === "COMMENT"
                ? `comment:${p.commentId}`
                : `response:${p.responseId}`
        },
        data: { status: "ACTIONED", handledById: p.user.id, handledAt: new Date() }
      });
    }
    await this.audit.record(
      {
        actorId: p.user.id,
        action: `moderation.${p.action.toLowerCase()}`,
        entityType:
          p.target === "REPORT"
            ? "Report"
            : p.target === "COMMENT"
              ? "Comment"
              : "OfficialResponse",
        entityId:
          p.target === "REPORT" ? p.reportId : p.target === "COMMENT" ? p.commentId : p.responseId,
        metadata: { policy: p.policy, from: p.previous, to: p.next }
      },
      tx
    );
  }

  private cleanReason(reason: string): string {
    return cleanText(reason);
  }

  // ───────────────────────────── internal notes & context ─────────────────────────────

  async notes(user: AuthUser, reference: string) {
    assertStaff(user);
    const report = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true }
    });
    if (!report) throw AppError.notFound("We could not find that report.");
    const rows = await this.prisma.internalNote.findMany({
      where: { reportId: report.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { displayName: true } } }
    });
    return rows.map((n) => ({
      id: n.id,
      body: n.body,
      authorName: n.author.displayName,
      createdAt: n.createdAt.toISOString()
    }));
  }

  async addNote(user: AuthUser, reference: string, body: string) {
    assertStaff(user);
    const report = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true }
    });
    if (!report) throw AppError.notFound("We could not find that report.");
    const note = await this.prisma.internalNote.create({
      data: { reportId: report.id, authorId: user.id, body: cleanText(body) },
      include: { author: { select: { displayName: true } } }
    });
    return {
      id: note.id,
      body: note.body,
      authorName: note.author.displayName,
      createdAt: note.createdAt.toISOString()
    };
  }

  /** Staff-only context for one report: moderation history, open flags and the previous values of edited fields. */
  async context(user: AuthUser, reference: string) {
    assertStaff(user);
    const report = await this.prisma.report.findUnique({
      where: { reference },
      select: {
        id: true,
        moderationState: true,
        reporter: { select: { displayName: true, status: true } },
        moderation: {
          orderBy: { createdAt: "desc" },
          include: { moderator: { select: { displayName: true } } }
        },
        flags: {
          orderBy: { createdAt: "desc" },
          include: { reporter: { select: { displayName: true } } }
        },
        activity: {
          where: { isPublic: false, type: "EDITED" },
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    });
    if (!report) throw AppError.notFound("We could not find that report.");
    return {
      moderationState: report.moderationState,
      reporter: { displayName: report.reporter.displayName, accountStatus: report.reporter.status },
      moderation: report.moderation.map((m) => ({
        id: m.id,
        action: m.action,
        policy: m.policy,
        reason: m.reason,
        target: m.target,
        moderatorName: m.moderator.displayName,
        createdAt: m.createdAt.toISOString()
      })),
      flags: report.flags.map((f) => ({
        id: f.id,
        target: f.target,
        reason: f.reason,
        details: f.details,
        status: f.status,
        reporterName: f.reporter.displayName,
        createdAt: f.createdAt.toISOString()
      })),
      edits: report.activity.map((e) => ({
        id: e.id,
        createdAt: e.createdAt.toISOString(),
        payload: e.payload
      }))
    };
  }
}

export { cleanLine, isStaff };
