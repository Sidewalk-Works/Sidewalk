import { Injectable } from "@nestjs/common";
import type { OwnerUpdateDto, ReportStatus, TimelineEventDto } from "@sidewalk/contracts";
import { STATUS_INFO } from "@sidewalk/contracts";
import type { ActivityType, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface ActivityInput {
  reportId: string;
  type: ActivityType;
  actorId: string | null;
  /** Public events appear on the shareable timeline, so their payload must be safe for anyone to read. */
  isPublic: boolean;
  payload?: Record<string, unknown>;
}

type Payload = {
  actorRole?: "REPORTER" | "STAFF" | "SYSTEM";
  from?: ReportStatus;
  to?: ReportStatus;
  basis?: "REPORTER_CLAIM" | "STAFF_REVIEW";
  note?: string | null;
  fields?: string[];
  kind?: string;
  authorName?: string;
};

const roleLabel = (role: Payload["actorRole"], reporterName: string | null): string =>
  role === "STAFF"
    ? "Sidewalk staff"
    : role === "REPORTER"
      ? (reporterName ?? "The reporter")
      : "Sidewalk";

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  record(tx: Prisma.TransactionClient, input: ActivityInput) {
    return tx.activityEvent.create({
      data: {
        reportId: input.reportId,
        type: input.type,
        actorId: input.actorId,
        isPublic: input.isPublic,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue
      }
    });
  }

  toTimeline(
    events: Array<{ id: string; type: ActivityType; createdAt: Date; payload: Prisma.JsonValue }>,
    reporterName: string | null
  ): TimelineEventDto[] {
    return events.map((e) => {
      const p = (e.payload ?? {}) as Payload;
      return {
        id: e.id,
        type: e.type,
        createdAt: e.createdAt.toISOString(),
        actorRole: p.actorRole ?? "SYSTEM",
        actorLabel: roleLabel(p.actorRole, reporterName),
        ...(e.type === "STATUS_CHANGED"
          ? { fromStatus: p.from, toStatus: p.to, basis: p.basis }
          : {}),
        note:
          e.type === "EDITED" && p.fields?.length
            ? `Changed: ${p.fields.join(", ")}`
            : (p.note ?? null)
      };
    });
  }

  /** Changes other people made to a citizen's reports, for the dashboard "recent updates" panel. */
  async recentForOwner(userId: string, take = 12): Promise<OwnerUpdateDto[]> {
    const rows = await this.prisma.activityEvent.findMany({
      where: {
        report: { reporterId: userId },
        OR: [{ actorId: { not: userId } }, { actorId: null }],
        AND: [{ OR: [{ isPublic: true }, { type: "COMMENT_ADDED" }] }]
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        type: true,
        createdAt: true,
        payload: true,
        report: { select: { reference: true, title: true } }
      }
    });
    return rows.map((e) => {
      const p = (e.payload ?? {}) as Payload;
      const actorLabel =
        p.actorRole === "STAFF" ? "Sidewalk staff" : (p.authorName ?? "A resident");
      let summary: string;
      switch (e.type) {
        case "STATUS_CHANGED":
          summary = `Status changed to ${p.to ? STATUS_INFO[p.to].label : "a new status"}`;
          break;
        case "COMMENT_ADDED":
          summary = p.actorRole === "STAFF" ? "Posted an update" : "Commented on your report";
          break;
        case "EVIDENCE_ADDED":
          summary = "Added evidence";
          break;
        case "RESOLUTION_VERIFIED":
          summary = "Verified the resolution";
          break;
        default:
          summary = "Updated the report";
      }
      return {
        id: e.id,
        type: e.type,
        createdAt: e.createdAt.toISOString(),
        actorLabel,
        summary,
        report: e.report
      };
    });
  }
}
