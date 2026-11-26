import { Injectable } from "@nestjs/common";
import {
  MEMBER_ROLE_INFO,
  type OfficialResponseDto,
  type MemberRole,
  type OrganizationMetricsDto,
  type OrganizationProfileDto,
  type OrganizationSummaryDto,
  type Paginated,
  type ReportSummaryDto
} from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { type AuthUser, isStaff } from "../common/auth-types";
import { likeEscape } from "../common/utils/text";
import { paginate } from "../common/utils/pagination";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { summaryInclude, toSummary } from "../reports/reports.mapper";
import { normalizeOrganizationName } from "@sidewalk/contracts";
import type { OrganizationListQuery } from "./dto";
import { OrganizationAccessService } from "./organization-access.service";
import { toBadge, toOrganizationSummary } from "./organization.mapper";
import { OfficialResponsesReader } from "./official-responses.reader";

/** Public discovery and profiles. Only listed profiles are visible, and only an allow-list of fields leaves the API. */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly responses: OfficialResponsesReader
  ) {}

  async list(query: OrganizationListQuery): Promise<Paginated<OrganizationSummaryDto>> {
    const and: Prisma.OrganizationWhereInput[] = [{ publicProfile: true }];
    const q = query.q?.trim();
    if (q) {
      const like = likeEscape(q);
      const normalized = normalizeOrganizationName(q);
      and.push({
        OR: [
          { name: { contains: like, mode: "insensitive" } },
          ...(normalized ? [{ normalizedName: { contains: normalized } }] : []),
          { jurisdiction: { contains: like, mode: "insensitive" } },
          { aliases: { has: q } },
          { serviceAreas: { has: q } }
        ]
      });
    }
    if (query.jurisdiction?.trim()) {
      const like = likeEscape(query.jurisdiction.trim());
      and.push({
        OR: [
          { jurisdiction: { contains: like, mode: "insensitive" } },
          { serviceAreas: { has: query.jurisdiction.trim() } }
        ]
      });
    }
    if (query.type) and.push({ type: query.type });
    if (query.level) and.push({ level: query.level });
    if (query.verified === "true") and.push({ verificationStatus: "VERIFIED" });
    const where: Prisma.OrganizationWhereInput = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);
    return paginate(rows.map(toOrganizationSummary), total, query.page, query.pageSize);
  }

  async profile(slug: string, viewer: AuthUser | undefined): Promise<OrganizationProfileDto> {
    const org = await this.access.requireVisible(slug, viewer);
    const parent = org.parentId
      ? await this.prisma.organization.findFirst({
          // A parent that is not itself listed is not named: its existence is not public.
          where: { id: org.parentId, publicProfile: true },
          select: { slug: true, name: true }
        })
      : null;
    const member = viewer ? await this.access.membership(viewer.id, org.id) : null;
    const role = (member?.role as MemberRole | undefined) ?? null;
    const blocker = this.access.orgBlocker(org);
    return {
      ...toOrganizationSummary(org),
      aliases: org.aliases,
      serviceAreas: org.serviceAreas,
      description: org.description,
      website: org.website,
      publicEmail: org.publicEmail,
      publicPhone: org.publicPhone,
      parent,
      verifiedAt: org.verifiedAt?.toISOString() ?? null,
      metrics: await this.metrics(org.id),
      viewer: {
        role,
        canManageMembers:
          !!viewer &&
          (viewer.role === "ADMIN" || (!!role && MEMBER_ROLE_INFO[role].canManage && !blocker)),
        canRespond:
          !!role && MEMBER_ROLE_INFO[role].canRespond && !blocker && !!viewer?.emailVerified,
        isStaff: isStaff(viewer)
      }
    };
  }

  /**
   * Plain counts over public reports, defined in contracts and the documentation. No rates, averages or times: each
   * would need a denominator and a window that could mislead, and none is invented here.
   */
  async metrics(organizationId: string): Promise<OrganizationMetricsDto> {
    const visibleReport = { moderationState: "VISIBLE" as const };
    const [connected, acknowledged, claimed, verified] = await Promise.all([
      this.prisma.reportOrganization.count({
        where: { organizationId, status: { not: "REMOVED" }, report: visibleReport }
      }),
      this.prisma.officialResponse
        .findMany({
          where: {
            organizationId,
            type: "ACKNOWLEDGEMENT",
            moderationState: "VISIBLE",
            report: {
              ...visibleReport,
              organizations: { some: { organizationId, status: { not: "REMOVED" } } }
            }
          },
          distinct: ["reportId"],
          select: { reportId: true }
        })
        .then((rows) => rows.length),
      this.prisma.officialResponse
        .findMany({
          where: {
            organizationId,
            type: "RESOLUTION_CLAIM",
            moderationState: "VISIBLE",
            report: visibleReport
          },
          distinct: ["reportId"],
          select: { reportId: true }
        })
        .then((rows) => rows.length),
      this.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM "Report" r
        WHERE r."moderationState" = 'VISIBLE' AND r."status" = 'RESOLVED' AND r."verification" = 'VERIFIED'
          AND (SELECT h."organizationId" FROM "ReportStatusHistory" h
               WHERE h."reportId" = r."id" AND h."toStatus" = 'RESOLVED'
               ORDER BY h."createdAt" DESC LIMIT 1) = ${organizationId}::uuid`
    ]);
    return {
      reportsConnected: connected,
      reportsAcknowledged: acknowledged,
      resolutionsClaimed: claimed,
      claimsVerified: Number(verified[0]?.n ?? 0),
      window: "all time",
      scope: "public reports only"
    };
  }

  /** Public reports connected to the organization (any basis except removed), newest activity first. */
  async reports(
    slug: string,
    viewer: AuthUser | undefined,
    page: number,
    pageSize: number
  ): Promise<Paginated<ReportSummaryDto>> {
    const org = await this.access.requireVisible(slug, viewer);
    const where: Prisma.ReportWhereInput = {
      moderationState: "VISIBLE",
      organizations: { some: { organizationId: org.id, status: { not: "REMOVED" } } }
    };
    const [total, rows] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return paginate(
      rows.map((r) => toSummary(r)),
      total,
      page,
      pageSize
    );
  }

  /** The organization's recent public statements, with the report each is about. */
  async recentResponses(
    slug: string,
    viewer: AuthUser | undefined,
    take = 10
  ): Promise<OfficialResponseDto[]> {
    const org = await this.access.requireVisible(slug, viewer);
    return this.responses.recentForOrganization(org.id, take);
  }

  /** What the signed-in person belongs to and has applied for. */
  async mine(user: AuthUser) {
    const [memberships, applications] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: { organization: true },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.organizationApplication.findMany({
        where: { applicantId: user.id },
        include: { organization: { select: { slug: true, name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 20
      })
    ]);
    return {
      memberships: memberships.map((m) => ({
        role: m.role as MemberRole,
        organization: toBadge(m.organization),
        blocker: this.access.orgBlocker(m.organization)
      })),
      applications: applications.map((a) => ({
        id: a.id,
        status: a.status,
        organization: a.organization,
        updatedAt: a.updatedAt.toISOString()
      }))
    };
  }

  /** For staff and for forms that need an organization by address: a visible organization or "not found". */
  async require(slug: string, viewer: AuthUser | undefined) {
    const org = await this.access.requireVisible(slug, viewer);
    if (!org) throw AppError.notFound("We could not find that organization.");
    return org;
  }
}
