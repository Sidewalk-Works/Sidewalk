import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import {
  OPEN_APPLICATION_STATUSES,
  ORGANIZATION_LIMITS as L,
  normalizeOrganizationName,
  slugifyOrganizationName,
  type ApplicationDocumentDto,
  type ApplicationDto,
  type OfficialReference
} from "@sidewalk/contracts";
import { AppError, type FieldIssue } from "../common/app-error";
import { type AuthUser, assertVerifiedEmail, isStaff } from "../common/auth-types";
import { cleanLine, cleanText } from "../common/utils/text";
import { AuditService } from "../audit/audit.service";
import { processImage } from "../evidence/image-processor";
import { STORAGE, type StorageProvider } from "../evidence/storage/storage.provider";
import type { Organization, OrganizationApplication, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ApplicationDetailsDto,
  CreateApplicationDto,
  OrganizationFieldsDto,
  UpdateApplicationDto
} from "./dto";
import { OrganizationAccessService } from "./organization-access.service";
import { OrganizationNotifier } from "./organization-notifier";
import { MAX_DOCUMENTS, cleanList, toDocumentDto } from "./organization.mapper";

const EDITABLE = ["DRAFT", "INFO_REQUESTED"] as const;
/** An applicant may have this many unfinished applications at once: a cap on drive-by impersonation attempts. */
const MAX_OPEN_PER_PERSON = 3;

type AppWithOrg = OrganizationApplication & {
  organization: Organization;
  documents: Array<{
    id: string;
    caption: string | null;
    createdAt: Date;
    width: number;
    height: number;
  }>;
};

export const applicationInclude = {
  organization: { include: { parent: { select: { slug: true } } } },
  documents: { orderBy: { createdAt: "asc" } }
} satisfies Prisma.OrganizationApplicationInclude;

export function toApplicationDto(
  a: AppWithOrg & { organization: { parent?: { slug: string } | null } }
): ApplicationDto {
  const editable = (EDITABLE as readonly string[]).includes(a.status);
  return {
    id: a.id,
    status: a.status,
    organization: {
      id: a.organization.id,
      slug: a.organization.slug,
      name: a.organization.name,
      aliases: a.organization.aliases,
      type: a.organization.type,
      level: a.organization.level,
      jurisdiction: a.organization.jurisdiction,
      serviceAreas: a.organization.serviceAreas,
      description: a.organization.description,
      website: a.organization.website,
      publicEmail: a.organization.publicEmail,
      publicPhone: a.organization.publicPhone,
      parentSlug: a.organization.parent?.slug ?? null,
      verificationStatus: a.organization.verificationStatus
    },
    roleTitle: a.roleTitle,
    authorityStatement: a.authorityStatement,
    officialReferences: (a.officialReferences as unknown as OfficialReference[]) ?? [],
    infoRequest: a.infoRequest,
    decisionReason: a.decisionReason,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    decidedAt: a.decidedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    documents: a.documents.map(toDocumentDto),
    can: {
      edit: editable,
      submit: editable,
      withdraw: (OPEN_APPLICATION_STATUSES as readonly string[]).includes(a.status),
      addDocuments: editable && a.documents.length < MAX_DOCUMENTS
    }
  };
}

/**
 * The applicant's side of verification. An application records what a person claims and shows; it never verifies
 * anything. Only a decision by Sidewalk staff (see GovernanceService) makes an organization verified.
 */
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly audit: AuditService,
    private readonly notifier: OrganizationNotifier,
    @Inject(STORAGE) private readonly storage: StorageProvider
  ) {}

  // ───────────────────────────── helpers ─────────────────────────────

  private async uniqueSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
    const base = slugifyOrganizationName(name) || "organization";
    for (let i = 0; i < 6; i++) {
      const candidate = i === 0 ? base : `${base.slice(0, 52)}-${randomBytes(2).toString("hex")}`;
      if (!(await tx.organization.findUnique({ where: { slug: candidate }, select: { id: true } })))
        return candidate;
    }
    return `${base.slice(0, 40)}-${randomUUID().slice(0, 8)}`;
  }

  /** Parents must be listed profiles: an unlisted organization's existence is not public, so it cannot be named. */
  private async resolveParent(
    tx: Prisma.TransactionClient,
    slug: string | undefined
  ): Promise<string | null> {
    if (!slug) return null;
    const parent = await tx.organization.findFirst({
      where: { slug, publicProfile: true },
      select: { id: true }
    });
    if (!parent)
      throw AppError.badRequest("UNKNOWN_PARENT", "We could not find that parent organization.", [
        {
          field: "organization.parentSlug",
          message: "Choose a listed organization, or leave this empty."
        }
      ]);
    return parent.id;
  }

  private fieldData(f: OrganizationFieldsDto) {
    return {
      name: cleanLine(f.name),
      normalizedName: normalizeOrganizationName(f.name),
      aliases: cleanList(f.aliases, L.alias.max, L.alias.maxCount),
      type: f.type,
      level: f.level,
      jurisdiction: cleanLine(f.jurisdiction),
      serviceAreas: cleanList(f.serviceAreas, L.serviceArea.max, L.serviceArea.maxCount),
      description: f.description
        ? cleanText(f.description).slice(0, L.description.max) || null
        : null,
      website: f.website ? f.website.trim() : null,
      publicEmail: f.publicEmail ? f.publicEmail.trim().toLowerCase() : null,
      publicPhone: f.publicPhone ? cleanLine(f.publicPhone) : null
    };
  }

  /** A verified institution with the same normalised name already exists: a lookalike cannot be verified beside it. */
  private async assertNameFree(
    tx: Prisma.TransactionClient,
    normalizedName: string,
    exceptId?: string
  ) {
    const clash = await tx.organization.findFirst({
      where: {
        normalizedName,
        verificationStatus: "VERIFIED",
        ...(exceptId ? { id: { not: exceptId } } : {})
      },
      select: { slug: true }
    });
    if (clash)
      throw AppError.conflict(
        "ORGANIZATION_ALREADY_VERIFIED",
        "An organization with this name is already verified on Sidewalk. Ask its administrators to invite you, or contact Sidewalk staff if you believe it is being impersonated."
      );
  }

  private detailsData(d: ApplicationDetailsDto) {
    return {
      ...(d.roleTitle !== undefined ? { roleTitle: cleanLine(d.roleTitle) || null } : {}),
      ...(d.authorityStatement !== undefined
        ? { authorityStatement: cleanText(d.authorityStatement) || null }
        : {}),
      ...(d.officialReferences !== undefined
        ? {
            officialReferences: d.officialReferences.map((r) => ({
              kind: cleanLine(r.kind),
              label: cleanLine(r.label),
              value: cleanLine(r.value)
            })) as unknown as Prisma.InputJsonValue
          }
        : {})
    };
  }

  private async mineOrNotFound(
    user: AuthUser,
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma
  ) {
    const app = await db.organizationApplication.findFirst({
      where: { id, applicantId: user.id },
      include: applicationInclude
    });
    if (!app) throw AppError.notFound("We could not find that application.");
    return app;
  }

  // ───────────────────────────── applicant actions ─────────────────────────────

  async create(user: AuthUser, dto: CreateApplicationDto): Promise<ApplicationDto> {
    assertVerifiedEmail(user);
    if (!dto.organizationSlug && !dto.organization)
      throw AppError.badRequest(
        "ORGANIZATION_REQUIRED",
        "Describe the institution you are applying for.",
        [{ field: "organization.name", message: "Enter the institution's official name." }]
      );
    const open = await this.prisma.organizationApplication.count({
      where: { applicantId: user.id, status: { in: [...OPEN_APPLICATION_STATUSES] } }
    });
    if (open >= MAX_OPEN_PER_PERSON)
      throw AppError.conflict(
        "TOO_MANY_APPLICATIONS",
        `You already have ${MAX_OPEN_PER_PERSON} unfinished applications. Finish or withdraw one first.`
      );

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        let org: Organization;
        if (dto.organizationSlug) {
          // An existing, unverified profile (typically one staff created and invited you to): only its administrators may apply.
          const existing = await this.access.find(dto.organizationSlug, tx);
          const member = existing ? await this.access.membership(user.id, existing.id, tx) : null;
          if (!existing || member?.role !== "ADMIN")
            throw AppError.forbidden(
              "Only an administrator of that organization can apply for its verification.",
              "NOT_ORGANIZATION_ADMIN"
            );
          if (existing.verificationStatus === "VERIFIED")
            throw AppError.conflict("ALREADY_VERIFIED", "This organization is already verified.");
          org = existing;
          if (dto.organization) {
            const data = this.fieldData(dto.organization);
            await this.assertNameFree(tx, data.normalizedName, org.id);
            org = await tx.organization.update({
              where: { id: org.id },
              data: { ...data, parentId: await this.resolveParent(tx, dto.organization.parentSlug) }
            });
          }
        } else {
          const data = this.fieldData(dto.organization as OrganizationFieldsDto);
          await this.assertNameFree(tx, data.normalizedName);
          // The same person starting the same institution twice is a mistake, not a second application.
          const duplicate = await tx.organizationApplication.findFirst({
            where: {
              applicantId: user.id,
              status: { in: [...OPEN_APPLICATION_STATUSES] },
              organization: { normalizedName: data.normalizedName }
            },
            select: { id: true }
          });
          if (duplicate)
            throw AppError.conflict(
              "DUPLICATE_APPLICATION",
              "You already have an open application for an organization with this name. Continue that one instead."
            );
          org = await tx.organization.create({
            data: {
              ...data,
              slug: await this.uniqueSlug(tx, data.name),
              parentId: await this.resolveParent(
                tx,
                (dto.organization as OrganizationFieldsDto).parentSlug
              ),
              createdById: user.id
              // Unlisted and unverified until staff decide: applying creates a record, not a public profile.
            }
          });
        }
        const app = await tx.organizationApplication.create({
          data: { organizationId: org.id, applicantId: user.id, ...this.detailsData(dto) }
        });
        await this.audit.record(
          {
            actorId: user.id,
            action: "organization.application_created",
            entityType: "OrganizationApplication",
            entityId: app.id,
            metadata: { organizationId: org.id }
          },
          tx
        );
        return app.id;
      });
      return toApplicationDto(await this.mineOrNotFound(user, id));
    } catch (e) {
      if ((e as { code?: string }).code === "P2002")
        throw AppError.conflict(
          "APPLICATION_ALREADY_OPEN",
          "This organization already has an open application."
        );
      throw e;
    }
  }

  async get(user: AuthUser, id: string): Promise<ApplicationDto> {
    return toApplicationDto(await this.mineOrNotFound(user, id));
  }

  async update(user: AuthUser, id: string, dto: UpdateApplicationDto): Promise<ApplicationDto> {
    assertVerifiedEmail(user);
    await this.prisma.$transaction(async (tx) => {
      const app = await this.mineOrNotFound(user, id, tx);
      if (!(EDITABLE as readonly string[]).includes(app.status))
        throw AppError.conflict(
          "NOT_EDITABLE",
          "This application can no longer be edited. Staff have it, or it has been decided."
        );
      if (dto.organization) {
        const data = this.fieldData(dto.organization);
        await this.assertNameFree(tx, data.normalizedName, app.organizationId);
        await tx.organization.update({
          where: { id: app.organizationId },
          data: { ...data, parentId: await this.resolveParent(tx, dto.organization.parentSlug) }
        });
      }
      await tx.organizationApplication.update({ where: { id }, data: this.detailsData(dto) });
    });
    return this.get(user, id);
  }

  async submit(user: AuthUser, id: string): Promise<ApplicationDto> {
    assertVerifiedEmail(user);
    await this.prisma.$transaction(async (tx) => {
      const app = await this.mineOrNotFound(user, id, tx);
      if (!(EDITABLE as readonly string[]).includes(app.status))
        throw AppError.conflict("NOT_SUBMITTABLE", "This application has already been sent.");
      const issues = this.completenessIssues(app);
      if (issues.length)
        throw AppError.badRequest(
          "APPLICATION_INCOMPLETE",
          "Complete the highlighted details before sending.",
          issues
        );
      const sentAt = new Date();
      const sent = await tx.organizationApplication.updateMany({
        where: { id, status: app.status },
        data: { status: "SUBMITTED", submittedAt: sentAt }
      });
      if (sent.count === 0)
        throw AppError.conflict("STALE_STATE", "This application changed. Reload and try again.");
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.application_submitted",
          entityType: "OrganizationApplication",
          entityId: id,
          metadata: { organizationId: app.organizationId }
        },
        tx
      );
      // A neutral confirmation: it says it was received, never that it will be approved.
      await this.notifier.tell(tx, user.id, null, {
        title: `Sidewalk received your application for ${app.organization.name}`,
        body: "Sidewalk staff will review it. Receiving an application is not verification: the organization stays unverified until a decision is made.",
        url: `/organizations/applications/${id}`,
        dedupeKey: `org-application-submitted:${id}:${sentAt.getTime()}`
      });
    });
    return this.get(user, id);
  }

  async withdraw(user: AuthUser, id: string): Promise<ApplicationDto> {
    assertVerifiedEmail(user);
    await this.prisma.$transaction(async (tx) => {
      const app = await this.mineOrNotFound(user, id, tx);
      if (!(OPEN_APPLICATION_STATUSES as readonly string[]).includes(app.status))
        throw AppError.conflict("NOT_WITHDRAWABLE", "This application has already been decided.");
      const done = await tx.organizationApplication.updateMany({
        where: { id, status: app.status },
        data: { status: "WITHDRAWN" }
      });
      if (done.count === 0)
        throw AppError.conflict("STALE_STATE", "This application changed. Reload and try again.");
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.application_withdrawn",
          entityType: "OrganizationApplication",
          entityId: id,
          metadata: { from: app.status }
        },
        tx
      );
    });
    return this.get(user, id);
  }

  /** What must be present before an application may be sent. Institutions differ, so only the essentials are required. */
  private completenessIssues(a: AppWithOrg): FieldIssue[] {
    const issues: FieldIssue[] = [];
    if (!a.roleTitle) issues.push({ field: "roleTitle", message: "Say what your position is." });
    if (!a.authorityStatement || a.authorityStatement.length < L.authorityStatement.min)
      issues.push({
        field: "authorityStatement",
        message: `Explain why you may speak for this institution (at least ${L.authorityStatement.min} characters).`
      });
    const refs = (a.officialReferences as unknown as OfficialReference[]) ?? [];
    if (refs.length < L.reference.minCount)
      issues.push({
        field: "officialReferences",
        message:
          "Add at least one official reference staff can check (a citation, listing or link)."
      });
    return issues;
  }

  // ───────────────────────────── private documents ─────────────────────────────

  async addDocument(
    user: AuthUser,
    id: string,
    file: Express.Multer.File | undefined,
    caption?: string
  ): Promise<ApplicationDocumentDto> {
    assertVerifiedEmail(user);
    if (!file)
      throw AppError.badRequest("FILE_REQUIRED", "Choose a photograph or scan to upload.", [
        { field: "file", message: "Choose a photograph or scan to upload." }
      ]);
    const app = await this.mineOrNotFound(user, id);
    if (!(EDITABLE as readonly string[]).includes(app.status))
      throw AppError.conflict(
        "NOT_EDITABLE",
        "Documents can only be added while the application is a draft or staff have asked for more information."
      );
    if (app.documents.length >= MAX_DOCUMENTS)
      throw AppError.conflict(
        "DOCUMENT_LIMIT",
        `An application can hold at most ${MAX_DOCUMENTS} documents.`
      );

    const processed = await processImage(file.buffer);
    const duplicate = await this.prisma.organizationDocument.findUnique({
      where: { applicationId_sha256: { applicationId: id, sha256: processed.sha256 } },
      select: { id: true }
    });
    if (duplicate)
      throw AppError.conflict("DUPLICATE_DOCUMENT", "That document is already attached.");

    const key = `org-documents/${id}/${randomUUID()}.webp`;
    try {
      await this.storage.put(key, processed.full, "image/webp");
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      this.logger.error(`Document storage write failed: ${(e as Error).name}`);
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Documents cannot be saved right now. Please try again in a moment."
      );
    }
    try {
      const row = await this.prisma.organizationDocument.create({
        data: {
          applicationId: id,
          uploaderId: user.id,
          storageKey: key,
          mimeType: "image/webp",
          sizeBytes: processed.full.length,
          width: processed.width,
          height: processed.height,
          sha256: processed.sha256,
          caption: caption ? cleanLine(caption).slice(0, 160) : null
        }
      });
      return toDocumentDto(row);
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
  }

  async removeDocument(user: AuthUser, id: string, documentId: string): Promise<void> {
    assertVerifiedEmail(user);
    const app = await this.mineOrNotFound(user, id);
    if (!(EDITABLE as readonly string[]).includes(app.status))
      throw AppError.conflict(
        "NOT_EDITABLE",
        "Documents can no longer be removed from this application."
      );
    const doc = await this.prisma.organizationDocument.findFirst({
      where: { id: documentId, applicationId: id }
    });
    if (!doc) throw AppError.notFound("We could not find that document.");
    await this.prisma.organizationDocument.delete({ where: { id: documentId } });
    await this.storage
      .delete(doc.storageKey)
      .catch(() =>
        this.logger.warn(
          "Could not delete an application document object; it is orphaned but unreachable."
        )
      );
  }

  /** Only the applicant and Sidewalk staff can read a document. Anyone else is told it does not exist. */
  async readDocument(user: AuthUser, documentId: string) {
    const doc = await this.prisma.organizationDocument.findUnique({
      where: { id: documentId },
      select: { storageKey: true, sha256: true, application: { select: { applicantId: true } } }
    });
    const allowed =
      !!doc && (doc.application.applicantId === user.id || (isStaff(user) && user.emailVerified));
    if (!doc || !allowed) throw AppError.notFound("We could not find that document.");
    let object;
    try {
      object = await this.storage.get(doc.storageKey);
    } catch {
      throw new AppError(503, "STORAGE_UNAVAILABLE", "Documents are temporarily unavailable.");
    }
    if (!object) throw AppError.notFound("We could not find that document.");
    return { ...object, etag: `"${doc.sha256.slice(0, 32)}"` };
  }
}
