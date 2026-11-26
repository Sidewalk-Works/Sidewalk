import { Injectable } from "@nestjs/common";
import {
  MEMBER_ROLE_INFO,
  type MemberRole,
  type OfficialResponseDto,
  type ReportOrganizationDto,
  type ReportStatus,
  type ViewerOrganizationDto
} from "@sidewalk/contracts";
import { type AuthUser, assertStaff, isStaff } from "../common/auth-types";
import { paginate } from "../common/utils/pagination";
import type { ResponseListQuery } from "./dto";
import { toEvidenceDto } from "../evidence/evidence.service";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationAccessService } from "./organization-access.service";
import { toBadge } from "./organization.mapper";

const responseInclude = {
  organization: { select: { slug: true, name: true, verificationStatus: true, status: true } },
  evidence: {
    include: { organization: { select: { slug: true, name: true } } },
    orderBy: { createdAt: "asc" }
  },
  report: { select: { reference: true, title: true } }
} satisfies Prisma.OfficialResponseInclude;

type Row = Prisma.OfficialResponseGetPayload<{ include: typeof responseInclude }>;

/**
 * Read-side assembly of official responses and organization connections, shared by the report page and the organization
 * profile. Public data is built from an explicit allow-list. Hidden statements are shown only to staff and to the
 * organization that made them, and never to anyone else.
 */
@Injectable()
export class OfficialResponsesReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService
  ) {}

  private toDto(
    r: Row,
    extra: {
      supersededBy: Map<string, string>;
      changes: Map<string, { from: ReportStatus; to: ReportStatus }>;
      flagged: Set<string>;
      showState: boolean;
      withReport: boolean;
    }
  ): OfficialResponseDto {
    return {
      id: r.id,
      type: r.type,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      // The name at the time, so a later rename cannot rewrite who said what. Verification status is the current one.
      organization: toBadge({
        slug: r.organizationSlug,
        name: r.organizationName,
        verificationStatus: r.organization.verificationStatus,
        status: r.organization.status
      }),
      verifiedWhenPublished: true,
      authorName: r.authorName,
      supersedesId: r.supersedesId,
      supersededById: extra.supersededBy.get(r.id) ?? null,
      evidence: r.evidence.map((e) => ({
        ...toEvidenceDto(e),
        organization: e.organization,
        responseId: e.responseId
      })),
      statusChange: extra.changes.get(r.id) ?? null,
      ...(extra.showState ? { moderationState: r.moderationState } : {}),
      hasFlagged: extra.flagged.has(r.id),
      ...(extra.withReport ? { report: r.report } : {})
    };
  }

  /** Everything organizations have said on a report, oldest first, as this viewer is allowed to see it. */
  async forReport(
    reportId: string,
    viewer: AuthUser | undefined
  ): Promise<{
    responses: OfficialResponseDto[];
    organizations: ReportOrganizationDto[];
    /** Statements this viewer may not read. Anything derived from their text (timeline excerpts, notes, photographs) must be withheld too. */
    withheldResponseIds: Set<string>;
  }> {
    const staff = isStaff(viewer);
    const memberOf = viewer
      ? new Set(
          (
            await this.prisma.organizationMember.findMany({
              where: { userId: viewer.id, status: "ACTIVE" },
              select: { organizationId: true }
            })
          ).map((m) => m.organizationId)
        )
      : new Set<string>();
    const rows = await this.prisma.officialResponse.findMany({
      where: { reportId },
      include: responseInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const visible = rows.filter(
      (r) => r.moderationState === "VISIBLE" || staff || memberOf.has(r.organizationId)
    );
    const shown = new Set(visible.map((r) => r.id));
    const withheldResponseIds = new Set(rows.filter((r) => !shown.has(r.id)).map((r) => r.id));
    const supersededBy = new Map<string, string>();
    for (const r of visible) if (r.supersedesId) supersededBy.set(r.supersedesId, r.id);
    const history = await this.prisma.reportStatusHistory.findMany({
      where: { responseId: { in: visible.map((r) => r.id) } },
      select: { responseId: true, fromStatus: true, toStatus: true }
    });
    const changes = new Map<string, { from: ReportStatus; to: ReportStatus }>();
    for (const h of history)
      if (h.responseId && h.fromStatus)
        changes.set(h.responseId, { from: h.fromStatus, to: h.toStatus });
    const flagged = viewer
      ? new Set(
          (
            await this.prisma.contentFlag.findMany({
              where: { reporterId: viewer.id, responseId: { in: visible.map((r) => r.id) } },
              select: { responseId: true }
            })
          ).map((f) => f.responseId as string)
        )
      : new Set<string>();
    const responses = visible.map((r) =>
      this.toDto(r, {
        supersededBy,
        changes,
        flagged,
        showState: staff || memberOf.has(r.organizationId),
        withReport: false
      })
    );

    const relations = await this.prisma.reportOrganization.findMany({
      where: {
        reportId,
        status: { not: "REMOVED" },
        organization: { OR: [{ publicProfile: true }] }
      },
      include: { organization: true },
      orderBy: { createdAt: "asc" }
    });
    return {
      responses,
      withheldResponseIds,
      organizations: relations.map((r) => ({
        organization: toBadge(r.organization),
        basis: r.basis,
        status: r.status,
        acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        outsideRemitAt: r.outsideRemitAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString()
      }))
    };
  }

  async recentForOrganization(
    organizationId: string,
    take: number
  ): Promise<OfficialResponseDto[]> {
    const rows = await this.prisma.officialResponse.findMany({
      where: { organizationId, moderationState: "VISIBLE", report: { moderationState: "VISIBLE" } },
      include: responseInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take
    });
    const supersededBy = new Map<string, string>();
    const newer = await this.prisma.officialResponse.findMany({
      where: { supersedesId: { in: rows.map((r) => r.id) } },
      select: { id: true, supersedesId: true }
    });
    for (const n of newer) if (n.supersedesId) supersededBy.set(n.supersedesId, n.id);
    return rows.map((r) =>
      this.toDto(r, {
        supersededBy,
        changes: new Map(),
        flagged: new Set(),
        showState: false,
        withReport: true
      })
    );
  }

  /** For staff: every official response, filterable, with hidden ones marked. The audit record behind them is separate. */
  async listForStaff(user: AuthUser, query: ResponseListQuery) {
    assertStaff(user);
    const where: Prisma.OfficialResponseWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.organization ? { organizationSlug: query.organization } : {}),
      ...(query.state !== "ALL" ? { moderationState: query.state } : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.officialResponse.count({ where }),
      this.prisma.officialResponse.findMany({
        where,
        include: responseInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);
    const newer = await this.prisma.officialResponse.findMany({
      where: { supersedesId: { in: rows.map((r) => r.id) } },
      select: { id: true, supersedesId: true }
    });
    const supersededBy = new Map<string, string>();
    for (const n of newer) if (n.supersedesId) supersededBy.set(n.supersedesId, n.id);
    return paginate(
      rows.map((r) =>
        this.toDto(r, {
          supersededBy,
          changes: new Map(),
          flagged: new Set(),
          showState: true,
          withReport: true
        })
      ),
      total,
      query.page,
      query.pageSize
    );
  }

  /** What the viewer may do on this report for each organization they belong to. */
  async viewerOrganizations(
    reportId: string,
    viewer: AuthUser | undefined
  ): Promise<ViewerOrganizationDto[]> {
    if (!viewer) return [];
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: viewer.id, status: "ACTIVE" },
      include: { organization: true },
      orderBy: { createdAt: "asc" }
    });
    if (memberships.length === 0) return [];
    const relations = await this.prisma.reportOrganization.findMany({
      where: { reportId, organizationId: { in: memberships.map((m) => m.organizationId) } }
    });
    const byOrg = new Map(relations.map((r) => [r.organizationId, r]));
    return memberships.map((m) => {
      const role = m.role as MemberRole;
      const relation = byOrg.get(m.organizationId) ?? null;
      let reason: string | null = null;
      if (!viewer.emailVerified) reason = "Confirm your email address first.";
      else if (!MEMBER_ROLE_INFO[role].canRespond)
        reason = "Your role in this organization does not allow publishing responses.";
      else reason = this.access.orgBlocker(m.organization);
      if (!reason && relation?.status === "REMOVED")
        reason = "Sidewalk staff removed this organization's connection to the report.";
      const canRespond = reason === null;
      return {
        slug: m.organization.slug,
        name: m.organization.name,
        role,
        canRespond,
        reason,
        relation: relation?.status ?? null,
        canAddItself: canRespond && relation === null
      };
    });
  }
}
