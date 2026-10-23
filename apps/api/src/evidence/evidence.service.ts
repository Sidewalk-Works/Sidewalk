import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  LIMITS,
  OWNER_EDITABLE_STATUSES,
  type EvidenceDto,
  type EvidenceKind
} from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { type AuthUser, assertVerifiedEmail, isStaff } from "../common/auth-types";
import { cleanLine } from "../common/utils/text";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { processImage } from "./image-processor";
import { STORAGE, type StorageProvider } from "./storage/storage.provider";

export const evidenceUrls = (id: string) => ({
  thumbUrl: `/api/v1/evidence/${id}/file?variant=thumb`,
  fullUrl: `/api/v1/evidence/${id}/file?variant=full`
});

export function toEvidenceDto(e: {
  id: string;
  kind: EvidenceKind;
  caption: string | null;
  width: number;
  height: number;
  mimeType: string;
  createdAt: Date;
}): EvidenceDto {
  return {
    id: e.id,
    kind: e.kind,
    caption: e.caption,
    width: e.width,
    height: e.height,
    mimeType: e.mimeType,
    createdAt: e.createdAt.toISOString(),
    ...evidenceUrls(e.id)
  };
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService
  ) {}

  async upload(params: {
    reference: string;
    user: AuthUser;
    file: Express.Multer.File | undefined;
    kind: EvidenceKind;
    caption?: string;
  }): Promise<EvidenceDto> {
    const { reference, user, file, kind } = params;
    assertVerifiedEmail(user);
    if (!file)
      throw AppError.badRequest("FILE_REQUIRED", "Choose a photograph to upload.", [
        { field: "file", message: "Choose a photograph to upload." }
      ]);

    const report = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true, reporterId: true, status: true, moderationState: true }
    });
    if (
      !report ||
      (report.moderationState !== "VISIBLE" && report.reporterId !== user.id && !isStaff(user))
    ) {
      throw AppError.notFound("We could not find that report.");
    }
    const owner = report.reporterId === user.id;
    if (report.moderationState !== "VISIBLE")
      throw AppError.forbidden(
        "This report is hidden, so evidence cannot be added to it.",
        "REPORT_NOT_VISIBLE"
      );
    if (!owner && !(isStaff(user) && kind === "RESOLUTION")) {
      throw AppError.forbidden("Only the person who filed this report can add evidence to it.");
    }
    if (kind === "REPORT" && (report.status === "REJECTED" || report.status === "DUPLICATE")) {
      throw AppError.conflict(
        "REPORT_CLOSED",
        "This report is closed, so new evidence cannot be added."
      );
    }

    const existing = await this.prisma.reportEvidence.count({
      where: { reportId: report.id, kind }
    });
    if (existing >= LIMITS.evidence.maxPerReport) {
      throw AppError.conflict(
        "EVIDENCE_LIMIT",
        `A report can hold at most ${LIMITS.evidence.maxPerReport} photographs of this kind.`
      );
    }

    const processed = await processImage(file.buffer);
    const duplicate = await this.prisma.reportEvidence.findUnique({
      where: { reportId_sha256: { reportId: report.id, sha256: processed.sha256 } },
      select: { id: true }
    });
    if (duplicate)
      throw AppError.conflict(
        "DUPLICATE_EVIDENCE",
        "That photograph is already attached to this report."
      );

    const stem = `evidence/${report.id}/${randomUUID()}`;
    const storageKey = `${stem}.webp`;
    const thumbKey = `${stem}-thumb.webp`;
    try {
      await this.storage.put(storageKey, processed.full, "image/webp");
      await this.storage.put(thumbKey, processed.thumb, "image/webp");
    } catch (e) {
      // Storage is down or refusing writes: undo whatever half-landed, leave the report untouched,
      // and tell the client it can simply try again.
      await Promise.allSettled([this.storage.delete(storageKey), this.storage.delete(thumbKey)]);
      this.logger.error(`Evidence storage write failed: ${(e as Error).name}`);
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Photographs cannot be saved right now. Your report is safe. Please try the upload again in a moment."
      );
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.reportEvidence.create({
          data: {
            reportId: report.id,
            uploaderId: user.id,
            kind,
            storageKey,
            thumbKey,
            mimeType: "image/webp",
            sizeBytes: processed.full.length,
            width: processed.width,
            height: processed.height,
            sha256: processed.sha256,
            caption: params.caption ? cleanLine(params.caption).slice(0, LIMITS.caption.max) : null
          }
        });
        await tx.activityEvent.create({
          data: {
            reportId: report.id,
            type: "EVIDENCE_ADDED",
            actorId: user.id,
            isPublic: true,
            payload: { kind, evidenceId: row.id, actorRole: owner ? "REPORTER" : "STAFF" }
          }
        });
        await tx.report.update({ where: { id: report.id }, data: { lastActivityAt: new Date() } });
        // Evidence from staff (the reporter already knows about their own uploads) is news worth sending.
        if (!owner) {
          await this.notifications.notifyReport(tx, {
            reportId: report.id,
            actorId: user.id,
            type: "REPORT_UPDATE",
            dedupeKey: `evidence:${row.id}`,
            title: `New evidence added to ${reference}`,
            body: "Sidewalk staff added a photograph to this report."
          });
        }
        return row;
      });
      return toEvidenceDto(created);
    } catch (e) {
      await Promise.allSettled([this.storage.delete(storageKey), this.storage.delete(thumbKey)]);
      throw e;
    }
  }

  async remove(reference: string, evidenceId: string, user: AuthUser): Promise<void> {
    assertVerifiedEmail(user);
    const evidence = await this.prisma.reportEvidence.findUnique({
      where: { id: evidenceId },
      include: { report: true }
    });
    if (!evidence || evidence.report.reference !== reference)
      throw AppError.notFound("We could not find that photograph.");

    // Evidence behind a verified resolution is part of the proof. Nobody removes it (staff included)
    // until the report is reopened, which clears the verification first.
    if (evidence.kind === "RESOLUTION" && evidence.report.verification === "VERIFIED") {
      throw AppError.conflict(
        "EVIDENCE_LOCKED",
        "This photograph supports a verified resolution. Reopen the report before removing it."
      );
    }

    const staff = isStaff(user);
    const uploader = evidence.uploaderId === user.id;
    if (!uploader && !staff)
      throw AppError.forbidden("You can only remove photographs you uploaded.");
    if (!staff) {
      const editable =
        evidence.kind === "RESOLUTION"
          ? evidence.report.verification !== "VERIFIED"
          : (OWNER_EDITABLE_STATUSES as readonly string[]).includes(evidence.report.status);
      if (!editable)
        throw AppError.conflict(
          "EVIDENCE_LOCKED",
          "This photograph is part of the report's record and can no longer be removed."
        );
    }

    await this.prisma.$transaction(async (tx) => {
      // Same row lock as verification, so evidence cannot be removed while a verification is in flight.
      await tx.$queryRaw`SELECT id FROM "Report" WHERE id = ${evidence.reportId}::uuid FOR UPDATE`;
      const current = await tx.report.findUniqueOrThrow({
        where: { id: evidence.reportId },
        select: { verification: true }
      });
      if (evidence.kind === "RESOLUTION" && current.verification === "VERIFIED") {
        throw AppError.conflict(
          "EVIDENCE_LOCKED",
          "This photograph supports a verified resolution. Reopen the report before removing it."
        );
      }
      await tx.reportEvidence.delete({ where: { id: evidenceId } });
      if (staff && !uploader) {
        await this.audit.record(
          {
            actorId: user.id,
            action: "evidence.removed",
            entityType: "Report",
            entityId: evidence.reportId,
            metadata: { evidenceId, kind: evidence.kind }
          },
          tx
        );
      }
    });
    await Promise.allSettled([
      this.storage.delete(evidence.storageKey),
      this.storage.delete(evidence.thumbKey)
    ]).then((results) => {
      for (const r of results)
        if (r.status === "rejected")
          this.logger.warn("Could not delete an evidence object; it is orphaned but unreachable.");
    });
  }

  /** Returns image bytes only if the viewer may see the owning report. Hidden content is visible to its owner and staff only. */
  async read(evidenceId: string, variant: "thumb" | "full", viewer: AuthUser | undefined) {
    const evidence = await this.prisma.reportEvidence.findUnique({
      where: { id: evidenceId },
      select: {
        storageKey: true,
        thumbKey: true,
        sha256: true,
        report: { select: { moderationState: true, reporterId: true } }
      }
    });
    if (!evidence) throw AppError.notFound("We could not find that photograph.");
    const isPublic = evidence.report.moderationState === "VISIBLE";
    if (!isPublic && !(viewer && (isStaff(viewer) || viewer.id === evidence.report.reporterId))) {
      throw AppError.notFound("We could not find that photograph.");
    }
    let object;
    try {
      object = await this.storage.get(
        variant === "thumb" ? evidence.thumbKey : evidence.storageKey
      );
    } catch {
      throw new AppError(503, "STORAGE_UNAVAILABLE", "Photographs are temporarily unavailable.");
    }
    if (!object) throw AppError.notFound("We could not find that photograph.");
    return { ...object, isPublic, etag: `"${evidence.sha256.slice(0, 32)}-${variant}"` };
  }
}
