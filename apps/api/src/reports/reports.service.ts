import { Injectable } from "@nestjs/common";
import {
  CLOSED_STATUSES,
  LIMITS,
  OWNER_EDITABLE_STATUSES,
  REPORT_STATUSES,
  STATUS_INFO,
  allowedTransitions,
  canTransition,
  transitionRequiresNote,
  type MapPointDto,
  type OwnerReportDto,
  type Paginated,
  type PlatformStatsDto,
  type ReportDetailDto,
  type ReportStatus,
  type ReportSummaryDto
} from "@sidewalk/contracts";
import { ActivityService } from "../activity/activity.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/app-error";
import { type AuthUser, assertVerifiedEmail, isStaff } from "../common/auth-types";
import { paginate } from "../common/utils/pagination";
import { generateReference } from "../common/utils/reference";
import { cleanLine, cleanText, excerpt, likeEscape } from "../common/utils/text";
import { toEvidenceDto } from "../evidence/evidence.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OfficialResponsesReader } from "../organizations/official-responses.reader";
import { OrganizationNotifier } from "../organizations/organization-notifier";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateReportDto,
  MyReportsQuery,
  ReportFilterQuery,
  TransitionDto,
  UpdateReportDto
} from "./dto";
import { summaryInclude, toOwnerReport, toSummary } from "./reports.mapper";

const EARTH_RADIUS_KM = 6371;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly organizations: OfficialResponsesReader,
    private readonly orgNotifier: OrganizationNotifier
  ) {}

  // ───────────────────────────── discovery ─────────────────────────────

  async list(query: ReportFilterQuery): Promise<Paginated<ReportSummaryDto>> {
    const { where, distances } = await this.buildWhere(query);
    const orderBy: Prisma.ReportOrderByWithRelationInput =
      query.sort === "newest"
        ? { createdAt: "desc" }
        : query.sort === "oldest"
          ? { createdAt: "asc" }
          : { lastActivityAt: "desc" };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: [orderBy, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: summaryInclude
      })
    ]);
    return paginate(
      rows.map((r) => toSummary(r, distances?.get(r.id))),
      total,
      query.page,
      query.pageSize
    );
  }

  /** Lightweight points for the map. Bounded so a busy city cannot produce an enormous response. */
  async mapPoints(
    query: ReportFilterQuery
  ): Promise<{ items: MapPointDto[]; total: number; truncated: boolean }> {
    const { where } = await this.buildWhere(query);
    const limit = 500;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: { lastActivityAt: "desc" },
        take: limit,
        select: {
          reference: true,
          title: true,
          status: true,
          latitude: true,
          longitude: true,
          category: { select: { slug: true } }
        }
      })
    ]);
    return {
      items: rows.map((r) => ({
        reference: r.reference,
        title: r.title,
        status: r.status,
        categorySlug: r.category.slug,
        latitude: r.latitude,
        longitude: r.longitude
      })),
      total,
      truncated: total > limit
    };
  }

  async stats(): Promise<PlatformStatsDto> {
    const visible: Prisma.ReportWhereInput = { moderationState: "VISIBLE" };
    const [
      totalReports,
      resolvedReports,
      closedOther,
      verifiedResolutions,
      reportsWithEvidence,
      categories
    ] = await Promise.all([
      this.prisma.report.count({ where: visible }),
      this.prisma.report.count({ where: { ...visible, status: "RESOLVED" } }),
      this.prisma.report.count({
        where: { ...visible, status: { in: ["REJECTED", "DUPLICATE"] } }
      }),
      this.prisma.report.count({
        where: { ...visible, status: "RESOLVED", verification: "VERIFIED" }
      }),
      this.prisma.report.count({ where: { ...visible, evidence: { some: {} } } }),
      this.prisma.report.groupBy({ by: ["categoryId"], where: visible })
    ]);
    return {
      totalReports,
      openReports: totalReports - resolvedReports - closedOther,
      resolvedReports,
      verifiedResolutions,
      reportsWithEvidence,
      categoriesInUse: categories.length,
      generatedAt: new Date().toISOString()
    };
  }

  private async buildWhere(
    query: ReportFilterQuery
  ): Promise<{ where: Prisma.ReportWhereInput; distances?: Map<string, number> }> {
    const and: Prisma.ReportWhereInput[] = [{ moderationState: "VISIBLE" }];

    if (query.q?.trim()) {
      const q = query.q.trim();
      and.push({
        OR: [
          { title: { contains: likeEscape(q), mode: "insensitive" } },
          { description: { contains: likeEscape(q), mode: "insensitive" } },
          { addressText: { contains: likeEscape(q), mode: "insensitive" } },
          { areaName: { contains: likeEscape(q), mode: "insensitive" } },
          { reference: { equals: q.toUpperCase() } }
        ]
      });
    }
    if (query.category) and.push({ category: { slug: { in: query.category.split(",") } } });
    if (query.status) {
      const statuses = query.status.split(",");
      const bad = statuses.find((s) => !(REPORT_STATUSES as readonly string[]).includes(s));
      if (bad)
        throw AppError.badRequest("VALIDATION_FAILED", `"${bad}" is not a valid status.`, [
          { field: "status", message: `"${bad}" is not a valid status.` }
        ]);
      and.push({ status: { in: statuses as ReportStatus[] } });
    }

    if (query.bbox) {
      const [minLng, minLat, maxLng, maxLat] = query.bbox.split(",").map(Number) as [
        number,
        number,
        number,
        number
      ];
      if (
        minLat > maxLat ||
        minLng > maxLng ||
        [minLat, maxLat].some((v) => Math.abs(v) > 90) ||
        [minLng, maxLng].some((v) => Math.abs(v) > 180)
      ) {
        throw AppError.badRequest("VALIDATION_FAILED", "bbox is out of range.", [
          { field: "bbox", message: "bbox is out of range." }
        ]);
      }
      and.push({ latitude: { gte: minLat, lte: maxLat }, longitude: { gte: minLng, lte: maxLng } });
    }

    let distances: Map<string, number> | undefined;
    if (query.near) {
      const [lat, lng] = query.near.split(",").map(Number) as [number, number];
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw AppError.badRequest("VALIDATION_FAILED", "near is out of range.", [
          { field: "near", message: "near is out of range." }
        ]);
      }
      const radius = query.radiusKm ?? 5;
      distances = await this.idsWithin(lat, lng, radius);
      and.push({ id: { in: [...distances.keys()] } });
    }
    return { where: { AND: and }, distances };
  }

  /** Bounding box narrows candidates through the lat/lng index; haversine then makes the circle exact. */
  private async idsWithin(
    lat: number,
    lng: number,
    radiusKm: number
  ): Promise<Map<string, number>> {
    const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
    const dLng = dLat / Math.max(0.01, Math.cos((lat * Math.PI) / 180));
    const rows = await this.prisma.$queryRaw<Array<{ id: string; d: number }>>`
      SELECT id, ${EARTH_RADIUS_KM} * acos(least(1.0, greatest(-1.0,
               cos(radians(${lat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lng}))
             + sin(radians(${lat})) * sin(radians(latitude))))) AS d
      FROM "Report"
      WHERE "moderationState" = 'VISIBLE'
        AND latitude BETWEEN ${lat - dLat} AND ${lat + dLat}
        AND longitude BETWEEN ${lng - dLng} AND ${lng + dLng}
      LIMIT 2000`;
    return new Map(rows.filter((r) => r.d <= radiusKm).map((r) => [r.id, Number(r.d)]));
  }

  // ───────────────────────────── detail ─────────────────────────────

  async getDetail(reference: string, viewer: AuthUser | undefined): Promise<ReportDetailDto> {
    const report = await this.prisma.report.findUnique({
      where: { reference },
      include: {
        ...summaryInclude,
        evidence: {
          orderBy: { createdAt: "asc" },
          include: { organization: { select: { slug: true, name: true } } }
        },
        activity: { where: { isPublic: true }, orderBy: { createdAt: "asc" } },
        moderation: {
          orderBy: { createdAt: "desc" },
          take: 1,
          where: { target: "REPORT", action: { in: ["HIDE", "REMOVE"] } }
        }
      }
    });
    const owner = !!viewer && report?.reporterId === viewer.id;
    const staff = isStaff(viewer);
    // Hidden content is indistinguishable from missing content for everyone but its owner and staff.
    if (!report || (report.moderationState !== "VISIBLE" && !owner && !staff))
      throw AppError.notFound("We could not find that report.");

    const reporterName = report.showReporterName ? report.reporter.displayName : null;
    const hasFlagged = viewer
      ? (await this.prisma.contentFlag.count({
          where: { reporterId: viewer.id, targetKey: `report:${report.id}` }
        })) > 0
      : false;
    const following =
      !!viewer &&
      (owner ||
        (await this.prisma.reportFollow.count({
          where: { userId: viewer.id, reportId: report.id }
        })) > 0);
    const visible = report.moderationState === "VISIBLE";
    const actors = [
      ...(staff ? (["STAFF"] as const) : []),
      ...(owner && !staff ? (["OWNER"] as const) : [])
    ];
    const transitions =
      visible && actors.length
        ? allowedTransitions(report.status, actors[0] as "STAFF" | "OWNER")
        : [];
    const lastMod = report.moderation[0];

    const summary = toSummary({
      ...report,
      evidence: report.evidence.filter((e) => e.kind === "REPORT").slice(0, 1)
    });
    // What organizations have said and how they are connected, as this viewer is allowed to see it. The timeline's
    // organization badges are then given their current verification state.
    const [org, viewerOrganizations] = await Promise.all([
      this.organizations.forReport(report.id, viewer),
      this.organizations.viewerOrganizations(report.id, viewer)
    ]);
    const badges = new Map<string, (typeof org.organizations)[number]["organization"]>();
    for (const o of org.organizations) badges.set(o.organization.slug, o.organization);
    for (const r of org.responses) badges.set(r.organization.slug, r.organization);
    // A statement that moderators hid is hidden everywhere its words appear: the timeline excerpt, the resolution note a
    // claim copied onto the report, and the photographs attached to it. The status change itself stays on the record.
    const withheld = org.withheldResponseIds;
    const timeline = this.activity
      .toTimeline(report.activity, reporterName)
      .map((e) => (e.responseId && withheld.has(e.responseId) ? { ...e, note: null } : e))
      .map((e) =>
        e.organization
          ? { ...e, organization: badges.get(e.organization.slug) ?? e.organization }
          : e
      );
    let resolutionNote = report.resolutionNote;
    if (resolutionNote && withheld.size > 0) {
      const claim = await this.prisma.reportStatusHistory.findFirst({
        where: { reportId: report.id, toStatus: "RESOLVED" },
        orderBy: { createdAt: "desc" },
        select: { responseId: true }
      });
      if (claim?.responseId && withheld.has(claim.responseId)) resolutionNote = null;
    }
    return {
      ...summary,
      evidenceCount: report.evidence.filter((e) => e.kind === "REPORT").length,
      description: report.description,
      verification: report.verification,
      resolutionNote,
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      updatedAt: report.updatedAt.toISOString(),
      evidence: report.evidence.filter((e) => e.kind === "REPORT").map(toEvidenceDto),
      resolutionEvidence: report.evidence
        .filter((e) => e.kind === "RESOLUTION" && !(e.responseId && withheld.has(e.responseId)))
        .map((e) => ({
          ...toEvidenceDto(e),
          organization: e.organization,
          responseId: e.responseId
        })),
      timeline,
      organizations: org.organizations,
      officialResponses: org.responses,
      viewer: {
        organizations: viewerOrganizations,
        isOwner: owner,
        isStaff: staff,
        canEdit:
          owner &&
          report.moderationState !== "REMOVED" &&
          (OWNER_EDITABLE_STATUSES as readonly string[]).includes(report.status),
        canComment: !!viewer && visible,
        allowedTransitions: transitions,
        hasFlagged,
        following
      },
      ...(owner || staff
        ? {
            moderationState: report.moderationState,
            moderationNotice:
              !visible && lastMod
                ? {
                    policy: lastMod.policy ?? "OTHER",
                    reason: lastMod.reason,
                    at: lastMod.createdAt.toISOString()
                  }
                : null
          }
        : {})
    };
  }

  // ───────────────────────────── citizen dashboard ─────────────────────────────

  async mine(
    user: AuthUser,
    query: MyReportsQuery
  ): Promise<Paginated<OwnerReportDto> & { counts: Record<string, number> }> {
    const base: Prisma.ReportWhereInput = { reporterId: user.id };
    const where: Prisma.ReportWhereInput = { ...base };
    if (query.status === "OPEN") where.status = { notIn: [...CLOSED_STATUSES] };
    else if (query.status === "CLOSED") where.status = { in: [...CLOSED_STATUSES] };
    else if (query.status !== "ALL") where.status = query.status;

    const [total, rows, grouped] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: { lastActivityAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          ...summaryInclude,
          statusHistory: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { toStatus: true, actorId: true }
          }
        }
      }),
      this.prisma.report.groupBy({ by: ["status"], where: base, _count: { _all: true } })
    ]);
    const counts: Record<string, number> = { ALL: 0, OPEN: 0, CLOSED: 0 };
    for (const g of grouped) {
      counts[g.status] = g._count._all;
      counts.ALL = (counts.ALL ?? 0) + g._count._all;
      const key = (CLOSED_STATUSES as readonly string[]).includes(g.status) ? "CLOSED" : "OPEN";
      counts[key] = (counts[key] ?? 0) + g._count._all;
    }
    return { ...paginate(rows.map(toOwnerReport), total, query.page, query.pageSize), counts };
  }

  // ───────────────────────────── create / edit ─────────────────────────────

  async create(
    user: AuthUser,
    dto: CreateReportDto
  ): Promise<{ detail: ReportDetailDto; created: boolean }> {
    assertVerifiedEmail(user);
    const existing = await this.prisma.report.findUnique({
      where: {
        reporterId_clientRequestId: { reporterId: user.id, clientRequestId: dto.clientRequestId }
      },
      select: { reference: true }
    });
    if (existing) return { detail: await this.getDetail(existing.reference, user), created: false };

    // Report flooding: the per-hour rate limit slows bursts, this caps a sustained day-long campaign.
    const today = await this.prisma.report.count({
      where: { reporterId: user.id, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } }
    });
    if (today >= LIMITS.reportsPerDay)
      throw new AppError(
        429,
        "DAILY_LIMIT",
        `You have filed ${LIMITS.reportsPerDay} reports in the last 24 hours, which is the daily limit. Please try again tomorrow.`
      );

    const category = await this.prisma.category.findFirst({
      where: { slug: dto.categorySlug, isActive: true },
      select: { id: true }
    });
    if (!category)
      throw AppError.badRequest("INVALID_CATEGORY", "Choose one of the available categories.", [
        { field: "categorySlug", message: "Choose one of the available categories." }
      ]);

    const title = cleanLine(dto.title);
    const description = cleanText(dto.description);
    if (title.length < LIMITS.title.min)
      throw AppError.badRequest(
        "VALIDATION_FAILED",
        `The title must be at least ${LIMITS.title.min} characters.`,
        [{ field: "title", message: `The title must be at least ${LIMITS.title.min} characters.` }]
      );
    if (description.length < LIMITS.description.min)
      throw AppError.badRequest(
        "VALIDATION_FAILED",
        `The description must be at least ${LIMITS.description.min} characters.`,
        [
          {
            field: "description",
            message: `The description must be at least ${LIMITS.description.min} characters.`
          }
        ]
      );

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const report = await this.prisma.$transaction(async (tx) => {
          const created = await tx.report.create({
            data: {
              reference: generateReference(),
              title,
              description,
              categoryId: category.id,
              latitude: dto.latitude,
              longitude: dto.longitude,
              addressText: dto.addressText ? cleanLine(dto.addressText) || null : null,
              areaName: dto.areaName ? cleanLine(dto.areaName) || null : null,
              reporterId: user.id,
              showReporterName: dto.showReporterName ?? false,
              clientRequestId: dto.clientRequestId
            }
          });
          await tx.reportStatusHistory.create({
            data: {
              reportId: created.id,
              fromStatus: null,
              toStatus: "SUBMITTED",
              actorId: user.id,
              actorRole: user.role,
              basis: "REPORTER_CLAIM"
            }
          });
          await this.activity.record(tx, {
            reportId: created.id,
            type: "SUBMITTED",
            actorId: user.id,
            isPublic: true,
            payload: { actorRole: "REPORTER", to: "SUBMITTED" }
          });
          return created;
        });
        return { detail: await this.getDetail(report.reference, user), created: true };
      } catch (e) {
        const err = e as Prisma.PrismaClientKnownRequestError;
        const target = JSON.stringify(err.meta ?? {});
        if (err.code === "P2002" && target.includes("reference")) continue;
        if (err.code === "P2002") {
          // Lost a race with a parallel submission of the same request id.
          const raced = await this.prisma.report.findUnique({
            where: {
              reporterId_clientRequestId: {
                reporterId: user.id,
                clientRequestId: dto.clientRequestId
              }
            },
            select: { reference: true }
          });
          if (raced) return { detail: await this.getDetail(raced.reference, user), created: false };
        }
        throw e;
      }
    }
    throw new AppError(
      500,
      "REFERENCE_EXHAUSTED",
      "Could not allocate a reference number. Please try again."
    );
  }

  async update(user: AuthUser, reference: string, dto: UpdateReportDto): Promise<ReportDetailDto> {
    assertVerifiedEmail(user);
    const report = await this.requireOwned(user, reference);
    const onlyPrivacy = Object.entries(dto)
      .filter(([, v]) => v !== undefined)
      .every(([k]) => k === "showReporterName");
    if (report.moderationState === "REMOVED")
      throw AppError.forbidden(
        "This report was removed by moderators and cannot be edited.",
        "REPORT_REMOVED"
      );
    if (!onlyPrivacy && !(OWNER_EDITABLE_STATUSES as readonly string[]).includes(report.status)) {
      throw AppError.conflict(
        "REPORT_LOCKED",
        `Reports can only be edited while they are submitted, under review or reopened. Yours is "${STATUS_INFO[report.status].label}". Add a comment instead.`
      );
    }
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw AppError.badRequest("VALIDATION_FAILED", "Send latitude and longitude together.", [
        { field: "latitude", message: "Send latitude and longitude together." }
      ]);
    }

    const data: Prisma.ReportUpdateInput = {};
    const previous: Record<string, unknown> = {};
    const changed: string[] = [];
    const set = <K extends keyof Prisma.ReportUpdateInput>(
      field: string,
      key: K,
      value: Prisma.ReportUpdateInput[K],
      before: unknown,
      after: unknown
    ) => {
      if (before === after) return;
      data[key] = value;
      previous[field] = before;
      changed.push(field);
    };

    if (dto.title !== undefined)
      set("title", "title", cleanLine(dto.title), report.title, cleanLine(dto.title));
    if (dto.description !== undefined)
      set(
        "description",
        "description",
        cleanText(dto.description),
        report.description,
        cleanText(dto.description)
      );
    if (dto.addressText !== undefined)
      set(
        "addressText",
        "addressText",
        cleanLine(dto.addressText) || null,
        report.addressText,
        cleanLine(dto.addressText) || null
      );
    if (dto.areaName !== undefined)
      set(
        "areaName",
        "areaName",
        cleanLine(dto.areaName) || null,
        report.areaName,
        cleanLine(dto.areaName) || null
      );
    if (dto.showReporterName !== undefined)
      set(
        "showReporterName",
        "showReporterName",
        dto.showReporterName,
        report.showReporterName,
        dto.showReporterName
      );
    if (
      dto.latitude !== undefined &&
      dto.longitude !== undefined &&
      (dto.latitude !== report.latitude || dto.longitude !== report.longitude)
    ) {
      data.latitude = dto.latitude;
      data.longitude = dto.longitude;
      previous.location = { latitude: report.latitude, longitude: report.longitude };
      changed.push("location");
    }
    if (dto.categorySlug !== undefined) {
      const category = await this.prisma.category.findFirst({
        where: { slug: dto.categorySlug, isActive: true },
        select: { id: true }
      });
      if (!category)
        throw AppError.badRequest("INVALID_CATEGORY", "Choose one of the available categories.", [
          { field: "categorySlug", message: "Choose one of the available categories." }
        ]);
      if (category.id !== report.categoryId) {
        data.category = { connect: { id: category.id } };
        previous.categoryId = report.categoryId;
        changed.push("category");
      }
    }
    if (
      (data.title as string | undefined) !== undefined &&
      (data.title as string).length < LIMITS.title.min
    )
      throw AppError.badRequest(
        "VALIDATION_FAILED",
        `The title must be at least ${LIMITS.title.min} characters.`,
        [{ field: "title", message: `The title must be at least ${LIMITS.title.min} characters.` }]
      );
    if (
      (data.description as string | undefined) !== undefined &&
      (data.description as string).length < LIMITS.description.min
    )
      throw AppError.badRequest(
        "VALIDATION_FAILED",
        `The description must be at least ${LIMITS.description.min} characters.`,
        [
          {
            field: "description",
            message: `The description must be at least ${LIMITS.description.min} characters.`
          }
        ]
      );

    if (changed.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.report.update({
          where: { id: report.id },
          data: { ...data, lastActivityAt: new Date() }
        });
        const substantive = changed.filter((f) => f !== "showReporterName");
        if (substantive.length > 0) {
          await this.activity.record(tx, {
            reportId: report.id,
            type: "EDITED",
            actorId: user.id,
            isPublic: true,
            payload: { actorRole: "REPORTER", fields: substantive }
          });
          // Previous values go to a private event so staff can review edits without them becoming public.
          await this.activity.record(tx, {
            reportId: report.id,
            type: "EDITED",
            actorId: user.id,
            isPublic: false,
            payload: { actorRole: "REPORTER", fields: substantive, previous }
          });
        }
      });
    }
    return this.getDetail(reference, user);
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  async transition(
    user: AuthUser,
    reference: string,
    dto: TransitionDto
  ): Promise<ReportDetailDto> {
    assertVerifiedEmail(user);
    const report = await this.prisma.report.findUnique({ where: { reference } });
    const owner = report?.reporterId === user.id;
    const staff = isStaff(user);
    if (!report || (report.moderationState !== "VISIBLE" && !owner && !staff))
      throw AppError.notFound("We could not find that report.");
    if (!owner && !staff)
      throw AppError.forbidden("Only the reporter or Sidewalk staff can change a report's status.");
    if (report.moderationState !== "VISIBLE")
      throw AppError.conflict(
        "REPORT_NOT_VISIBLE",
        "This report is hidden. A moderator must restore it before its status can change."
      );

    const actor = staff ? "STAFF" : "OWNER";
    if (!canTransition(report.status, dto.status, actor)) {
      const allowed = allowedTransitions(report.status, actor).map((s) => STATUS_INFO[s].label);
      throw AppError.conflict(
        "INVALID_TRANSITION",
        `A report that is "${STATUS_INFO[report.status].label}" cannot move to "${STATUS_INFO[dto.status].label}". ${allowed.length ? `Allowed: ${allowed.join(", ")}.` : "No further changes are possible."}`
      );
    }

    const note = dto.note ? cleanText(dto.note) : "";
    if (transitionRequiresNote(dto.status) && note.length < LIMITS.statusNote.min) {
      const message = `Explain this change in at least ${LIMITS.statusNote.min} characters. Everyone who views the report will see it.`;
      throw AppError.badRequest("NOTE_REQUIRED", message, [{ field: "note", message }]);
    }

    const resolving = dto.status === "RESOLVED";
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Compare-and-set on the old status so two simultaneous changes cannot both win.
      const claimed = await tx.report.updateMany({
        where: { id: report.id, status: report.status },
        data: {
          status: dto.status,
          lastActivityAt: now,
          verification: resolving ? "CLAIMED" : "NONE",
          resolutionNote: resolving ? note : null,
          resolvedAt: resolving ? now : null
        }
      });
      if (claimed.count === 0)
        throw AppError.conflict(
          "STALE_STATUS",
          "This report changed while you were editing. Reload and try again."
        );

      const basis = staff ? "STAFF_REVIEW" : "REPORTER_CLAIM";
      const history = await tx.reportStatusHistory.create({
        data: {
          reportId: report.id,
          fromStatus: report.status,
          toStatus: dto.status,
          actorId: user.id,
          actorRole: user.role,
          basis,
          publicNote: note || null
        }
      });
      await this.activity.record(tx, {
        reportId: report.id,
        type: "STATUS_CHANGED",
        actorId: user.id,
        isPublic: true,
        payload: {
          actorRole: staff ? "STAFF" : "REPORTER",
          from: report.status,
          to: dto.status,
          basis,
          note: note || null
        }
      });
      const from = STATUS_INFO[report.status].label;
      const to = STATUS_INFO[dto.status].label;
      await this.notifications.notifyReport(tx, {
        reportId: report.id,
        actorId: user.id,
        type: dto.status === "REOPENED" ? "REOPENED" : "STATUS_CHANGED",
        dedupeKey: `status:${history.id}`,
        title:
          dto.status === "REOPENED" ? `${reference} was reopened` : `${reference} is now “${to}”`,
        body: [
          `Status changed from “${from}” to “${to}”.`,
          resolving ? "A resolution is only a claim until Sidewalk staff verify it." : "",
          note ? excerpt(note, 160) : ""
        ]
          .filter(Boolean)
          .join(" ")
      });
      if (dto.status === "REOPENED") {
        // The organization that claimed the fix (and any connected to the report) learns it is being disputed.
        const claim = await tx.reportStatusHistory.findFirst({
          where: { reportId: report.id, toStatus: "RESOLVED" },
          orderBy: { createdAt: "desc" },
          select: { organizationId: true }
        });
        await this.orgNotifier.tellReportOrganizations(
          tx,
          report.id,
          user.id,
          {
            type: "REOPENED",
            title: `${reference} was reopened`,
            body: note ? excerpt(note, 160) : "The resolution is being disputed.",
            url: `/issues/${reference}`,
            dedupeKey: `reopened-org:${history.id}`
          },
          claim?.organizationId ? [claim.organizationId] : []
        );
      }
      if (staff) {
        await this.audit.record(
          {
            actorId: user.id,
            action: "report.status_changed",
            entityType: "Report",
            entityId: report.id,
            metadata: { reference, from: report.status, to: dto.status }
          },
          tx
        );
      }
    });
    return this.getDetail(reference, user);
  }

  /**
   * Marks a claimed resolution as verified. Requires staff, evidence of the fix, and a second pair of eyes:
   * the verifier cannot be the person who recorded the resolution.
   */
  async verifyResolution(user: AuthUser, reference: string): Promise<ReportDetailDto> {
    if (!isStaff(user)) throw AppError.forbidden("Only Sidewalk staff can verify a resolution.");
    assertVerifiedEmail(user);
    const found = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true }
    });
    if (!found) throw AppError.notFound("We could not find that report.");

    await this.prisma.$transaction(async (tx) => {
      // Lock the report row so the evidence, the claim and the verification are judged as one consistent
      // snapshot: evidence removal takes the same lock, so proof cannot vanish while we are verifying.
      await tx.$queryRaw`SELECT id FROM "Report" WHERE id = ${found.id}::uuid FOR UPDATE`;
      const report = await tx.report.findUniqueOrThrow({
        where: { id: found.id },
        include: {
          statusHistory: {
            where: { toStatus: "RESOLVED" },
            orderBy: { createdAt: "desc" },
            take: 1
          },
          evidence: { where: { kind: "RESOLUTION" }, select: { uploaderId: true } }
        }
      });
      if (report.moderationState !== "VISIBLE")
        throw AppError.conflict("REPORT_NOT_VISIBLE", "This report is hidden.");
      if (report.status !== "RESOLVED")
        throw AppError.conflict(
          "NOT_RESOLVED",
          "Only a report marked as resolved can have its resolution verified."
        );
      if (report.verification === "VERIFIED")
        throw AppError.conflict("ALREADY_VERIFIED", "This resolution is already verified.");
      // Independence: nobody verifies a fix to their own report, a claim they recorded,
      // or evidence they are the only source of.
      if (report.reporterId === user.id)
        throw AppError.conflict(
          "OWN_REPORT",
          "You cannot verify the resolution of a report you filed."
        );
      if (report.statusHistory[0]?.actorId === user.id)
        throw AppError.conflict(
          "SELF_VERIFICATION",
          "A resolution you recorded must be verified by a different staff member."
        );
      // Independence extends to organizations: a staff member who belongs to the organization that claimed the fix (now,
      // or at any time since the claim), or to one connected to this report, cannot be the second pair of eyes.
      const claim = report.statusHistory[0];
      const connected = await tx.reportOrganization.findMany({
        where: { reportId: report.id, status: { not: "REMOVED" } },
        select: { organizationId: true }
      });
      const involved = [
        ...new Set([
          ...connected.map((c) => c.organizationId),
          ...(claim?.organizationId ? [claim.organizationId] : [])
        ])
      ];
      if (involved.length > 0) {
        const conflict = await tx.organizationMember.findFirst({
          where: {
            userId: user.id,
            organizationId: { in: involved },
            OR: [
              { status: "ACTIVE" },
              ...(claim?.organizationId
                ? [{ organizationId: claim.organizationId, revokedAt: { gte: claim.createdAt } }]
                : [])
            ]
          },
          select: { id: true }
        });
        if (conflict)
          throw AppError.conflict(
            "ORGANIZATION_CONFLICT",
            "You belong to an organization connected to this report, or to the one that claimed its resolution, so you cannot verify it."
          );
      }
      if (!report.evidence.some((e) => e.uploaderId !== user.id))
        throw AppError.conflict(
          "EVIDENCE_REQUIRED",
          "Verification needs at least one photograph of the fix that someone other than you uploaded."
        );

      const claimed = await tx.report.updateMany({
        where: { id: report.id, status: "RESOLVED", verification: "CLAIMED" },
        data: { verification: "VERIFIED", lastActivityAt: new Date() }
      });
      if (claimed.count === 0)
        throw AppError.conflict("STALE_STATUS", "This report changed. Reload and try again.");
      const verifiedEvent = await this.activity.record(tx, {
        reportId: report.id,
        type: "RESOLUTION_VERIFIED",
        actorId: user.id,
        isPublic: true,
        payload: { actorRole: "STAFF" }
      });
      await this.notifications.notifyReport(tx, {
        reportId: report.id,
        actorId: user.id,
        type: "RESOLUTION_VERIFIED",
        dedupeKey: `verified:${verifiedEvent.id}`,
        title: `The fix on ${reference} was verified`,
        body: "A Sidewalk staff member checked the photographs of the repair and marked the resolution as verified."
      });
      await this.orgNotifier.tellReportOrganizations(
        tx,
        report.id,
        user.id,
        {
          type: "RESOLUTION_VERIFIED",
          title: `The resolution of ${reference} was verified`,
          body: "Sidewalk staff independently checked the evidence and marked the resolution as verified.",
          url: `/issues/${reference}`,
          dedupeKey: `verified-org:${verifiedEvent.id}`
        },
        claim?.organizationId ? [claim.organizationId] : []
      );
      await this.audit.record(
        {
          actorId: user.id,
          action: "report.resolution_verified",
          entityType: "Report",
          entityId: report.id,
          metadata: { reference }
        },
        tx
      );
    });
    return this.getDetail(reference, user);
  }

  /** Asks to hear about a public report. The reporter is always notified and does not need to follow. */
  async follow(user: AuthUser, reference: string, on: boolean): Promise<{ following: boolean }> {
    assertVerifiedEmail(user);
    const report = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true, reporterId: true, moderationState: true }
    });
    if (!report || report.moderationState !== "VISIBLE")
      throw AppError.notFound("We could not find that report.");
    if (report.reporterId === user.id) return { following: true };
    if (on) {
      await this.prisma.reportFollow.upsert({
        where: { userId_reportId: { userId: user.id, reportId: report.id } },
        update: {},
        create: { userId: user.id, reportId: report.id }
      });
    } else {
      await this.prisma.reportFollow.deleteMany({
        where: { userId: user.id, reportId: report.id }
      });
    }
    return { following: on };
  }

  private async requireOwned(user: AuthUser, reference: string) {
    const report = await this.prisma.report.findUnique({ where: { reference } });
    if (!report || report.reporterId !== user.id) {
      // Someone else's report is reported as missing unless it is public, in which case it is simply not theirs to edit.
      if (report && report.moderationState === "VISIBLE")
        throw AppError.forbidden("You can only edit reports you filed.");
      throw AppError.notFound("We could not find that report.");
    }
    return report;
  }
}
