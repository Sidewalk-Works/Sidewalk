import type { OwnerReportDto, ReportStatus, ReportSummaryDto } from "@sidewalk/contracts";
import { OWNER_EDITABLE_STATUSES } from "@sidewalk/contracts";
import type { Prisma } from "../generated/prisma/client";
import { excerpt } from "../common/utils/text";
import { evidenceUrls } from "../evidence/evidence.service";

/**
 * Public data is built from an explicit allow-list, never by spreading a database row.
 * Anything not named here (reporter id, email, internal notes, client request id) cannot leak.
 */
export const summaryInclude = {
  category: { select: { slug: true, name: true } },
  reporter: { select: { displayName: true } },
  evidence: {
    where: { kind: "REPORT" },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { id: true }
  },
  _count: {
    select: {
      evidence: true,
      comments: { where: { moderationState: "VISIBLE", deletedByAuthorAt: null } }
    }
  }
} satisfies Prisma.ReportInclude;

export type SummaryRow = Prisma.ReportGetPayload<{ include: typeof summaryInclude }>;

export function toSummary(r: SummaryRow, distanceKm?: number): ReportSummaryDto {
  const cover = r.evidence[0];
  return {
    id: r.id,
    reference: r.reference,
    title: r.title,
    excerpt: excerpt(r.description),
    status: r.status,
    category: r.category,
    latitude: r.latitude,
    longitude: r.longitude,
    addressText: r.addressText,
    areaName: r.areaName,
    createdAt: r.createdAt.toISOString(),
    lastActivityAt: r.lastActivityAt.toISOString(),
    evidenceCount: r._count.evidence,
    commentCount: r._count.comments,
    coverThumbUrl: cover ? evidenceUrls(cover.id).thumbUrl : null,
    reporterName: r.showReporterName ? r.reporter.displayName : null,
    ...(distanceKm !== undefined ? { distanceKm: Math.round(distanceKm * 100) / 100 } : {})
  };
}

export type OwnerRow = SummaryRow & {
  statusHistory: Array<{ toStatus: ReportStatus; actorId: string }>;
};

export function actionNeeded(r: OwnerRow): OwnerReportDto["actionNeeded"] {
  if (r.moderationState === "HIDDEN") {
    return {
      code: "HIDDEN",
      message:
        "Moderators have hidden this report from the public. Read the notice and edit it if needed."
    };
  }
  if (r.moderationState === "REMOVED") {
    return {
      code: "REMOVED",
      message: "Moderators removed this report. Read the notice for the reason."
    };
  }
  const last = r.statusHistory[0];
  if (
    r.status === "RESOLVED" &&
    r.verification !== "VERIFIED" &&
    last &&
    last.actorId !== r.reporterId
  ) {
    return {
      code: "CONFIRM_RESOLUTION",
      message:
        "A resolution was recorded for this report. Check the spot, then reopen it if the problem is still there."
    };
  }
  if (r.status === "REJECTED" || r.status === "DUPLICATE") {
    return {
      code: "READ_REASON",
      message: "This report was closed without a repair. Read the reason on the report page."
    };
  }
  return null;
}

export function toOwnerReport(r: OwnerRow): OwnerReportDto {
  return {
    ...toSummary(r),
    moderationState: r.moderationState,
    verification: r.verification,
    actionNeeded: actionNeeded(r),
    canEdit:
      r.moderationState !== "REMOVED" &&
      (OWNER_EDITABLE_STATUSES as readonly string[]).includes(r.status)
  };
}
