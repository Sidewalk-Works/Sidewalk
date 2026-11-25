-- Verified organizations, official responses and organization-backed resolution claims.
-- Additive only: no existing table loses data, and existing rows stay valid (every new column is nullable or defaulted).
-- New values added to existing enums are not referenced below except through ::text, because PostgreSQL does not allow a
-- value to be used in the transaction that adds it.

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('AGENCY', 'DEPARTMENT', 'PUBLIC_SERVICE_BODY', 'OTHER_PUBLIC_INSTITUTION');

-- CreateEnum
CREATE TYPE "AdministrativeLevel" AS ENUM ('LOCAL', 'STATE', 'FEDERAL', 'MULTI_LEVEL');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrgVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('ADMIN', 'REPRESENTATIVE', 'MEMBER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ResponseType" AS ENUM ('ACKNOWLEDGEMENT', 'UPDATE', 'DELAY', 'OUT_OF_REMIT', 'RESOLUTION_CLAIM', 'CORRECTION', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "RelationBasis" AS ENUM ('REPORTER_SUGGESTED', 'STAFF_ASSIGNED', 'ORGANIZATION_ADDED');

-- CreateEnum
CREATE TYPE "RelationStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'OUTSIDE_REMIT', 'REMOVED');

-- CreateEnum
CREATE TYPE "VerificationAction" AS ENUM ('REVIEW_STARTED', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'REINSTATED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'OFFICIAL_RESPONSE';
ALTER TYPE "ActivityType" ADD VALUE 'ORGANIZATION_LINKED';

-- AlterEnum
ALTER TYPE "ContentTarget" ADD VALUE 'OFFICIAL_RESPONSE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'OFFICIAL_RESPONSE';
ALTER TYPE "NotificationType" ADD VALUE 'RESOLUTION_CLAIMED';
ALTER TYPE "NotificationType" ADD VALUE 'ORGANIZATION';

-- AlterEnum
ALTER TYPE "OutboxKind" ADD VALUE 'ORGANIZATION_INVITATION';

-- AlterEnum
ALTER TYPE "StatusBasis" ADD VALUE 'ORGANIZATION_STATEMENT';

-- AlterTable
ALTER TABLE "ContentFlag" ADD COLUMN     "responseId" UUID;

-- AlterTable
ALTER TABLE "ModerationAction" ADD COLUMN     "responseId" UUID;

-- AlterTable
ALTER TABLE "ReportEvidence" ADD COLUMN     "organizationId" UUID,
ADD COLUMN     "responseId" UUID;

-- AlterTable
ALTER TABLE "ReportStatusHistory" ADD COLUMN     "organizationId" UUID,
ADD COLUMN     "responseId" UUID;

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "type" "OrganizationType" NOT NULL,
    "level" "AdministrativeLevel" NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "serviceAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parentId" UUID,
    "description" TEXT,
    "website" TEXT,
    "publicEmail" TEXT,
    "publicPhone" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMP(3),
    "verificationStatus" "OrgVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "verificationRevokedAt" TIMESTAMP(3),
    "publicProfile" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationApplication" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicantId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "roleTitle" TEXT,
    "authorityStatement" TEXT,
    "officialReferences" JSONB NOT NULL DEFAULT '[]',
    "infoRequest" TEXT,
    "decisionReason" TEXT,
    "reviewerNotes" TEXT,
    "reviewerId" UUID,
    "decidedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationDocument" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MemberRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "addedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "revokeReason" TEXT,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationInvitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedById" UUID,
    "respondedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationDecision" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID,
    "action" "VerificationAction" NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" TEXT,
    "previous" JSONB,
    "next" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialResponse" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "type" "ResponseType" NOT NULL,
    "body" TEXT NOT NULL,
    "supersedesId" UUID,
    "organizationName" TEXT NOT NULL,
    "organizationSlug" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "verifiedAtPublication" TIMESTAMP(3) NOT NULL,
    "statusHistoryId" UUID,
    "moderationState" "ModerationState" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportOrganization" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "basis" "RelationBasis" NOT NULL,
    "status" "RelationStatus" NOT NULL,
    "addedById" UUID NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "outsideRemitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_publicProfile_verificationStatus_name_idx" ON "Organization"("publicProfile", "verificationStatus", "name");

-- CreateIndex
CREATE INDEX "Organization_type_level_idx" ON "Organization"("type", "level");

-- CreateIndex
CREATE INDEX "Organization_normalizedName_idx" ON "Organization"("normalizedName");

-- CreateIndex
CREATE INDEX "OrganizationApplication_status_submittedAt_idx" ON "OrganizationApplication"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "OrganizationApplication_applicantId_idx" ON "OrganizationApplication"("applicantId");

-- CreateIndex
CREATE INDEX "OrganizationApplication_organizationId_idx" ON "OrganizationApplication"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationDocument_storageKey_key" ON "OrganizationDocument"("storageKey");

-- CreateIndex
CREATE INDEX "OrganizationDocument_applicationId_idx" ON "OrganizationDocument"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationDocument_applicationId_sha256_key" ON "OrganizationDocument"("applicationId", "sha256");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_status_idx" ON "OrganizationMember"("userId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_status_idx" ON "OrganizationMember"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_status_idx" ON "OrganizationInvitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_email_status_idx" ON "OrganizationInvitation"("email", "status");

-- CreateIndex
CREATE INDEX "VerificationDecision_organizationId_createdAt_idx" ON "VerificationDecision"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OfficialResponse_reportId_createdAt_idx" ON "OfficialResponse"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "OfficialResponse_organizationId_createdAt_idx" ON "OfficialResponse"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportOrganization_organizationId_status_idx" ON "ReportOrganization"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReportOrganization_reportId_organizationId_key" ON "ReportOrganization"("reportId", "organizationId");

-- CreateIndex
CREATE INDEX "ReportEvidence_organizationId_idx" ON "ReportEvidence"("organizationId");

-- CreateIndex
CREATE INDEX "ReportEvidence_responseId_idx" ON "ReportEvidence"("responseId");

-- AddForeignKey
ALTER TABLE "ReportEvidence" ADD CONSTRAINT "ReportEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvidence" ADD CONSTRAINT "ReportEvidence_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "OfficialResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStatusHistory" ADD CONSTRAINT "ReportStatusHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentFlag" ADD CONSTRAINT "ContentFlag_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "OfficialResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "OfficialResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationApplication" ADD CONSTRAINT "OrganizationApplication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationApplication" ADD CONSTRAINT "OrganizationApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationApplication" ADD CONSTRAINT "OrganizationApplication_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDocument" ADD CONSTRAINT "OrganizationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "OrganizationApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDocument" ADD CONSTRAINT "OrganizationDocument_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDecision" ADD CONSTRAINT "VerificationDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDecision" ADD CONSTRAINT "VerificationDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialResponse" ADD CONSTRAINT "OfficialResponse_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialResponse" ADD CONSTRAINT "OfficialResponse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialResponse" ADD CONSTRAINT "OfficialResponse_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialResponse" ADD CONSTRAINT "OfficialResponse_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "OfficialResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportOrganization" ADD CONSTRAINT "ReportOrganization_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportOrganization" ADD CONSTRAINT "ReportOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportOrganization" ADD CONSTRAINT "ReportOrganization_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────────────────────── guarantees Prisma cannot express ─────────────────────────

-- One VERIFIED profile per normalised name: a lookalike cannot be verified beside the real institution. Unverified
-- profiles may share a name, so a genuine institution is never blocked by an impostor's earlier application.
CREATE UNIQUE INDEX "Organization_verified_name_unique" ON "Organization"("normalizedName") WHERE "verificationStatus" = 'VERIFIED';

-- At most one open application per organization, one active membership per person per organization, and one live
-- invitation per organization and address (a resend replaces the token on the same row).
CREATE UNIQUE INDEX "OrganizationApplication_one_open" ON "OrganizationApplication"("organizationId")
  WHERE "status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED');
CREATE UNIQUE INDEX "OrganizationMember_one_active" ON "OrganizationMember"("organizationId", "userId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "OrganizationInvitation_one_pending" ON "OrganizationInvitation"("organizationId", "email") WHERE "status" = 'PENDING';

-- Identity and lifecycle rules that must hold even if application code gets them wrong.
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_verified_has_timestamp"
  CHECK ("verificationStatus" <> 'VERIFIED' OR "verifiedAt" IS NOT NULL);
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_suspended_has_timestamp"
  CHECK ("status" <> 'SUSPENDED' OR "suspendedAt" IS NOT NULL);
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- Nobody reviews their own application, and a decision always records who made it and when.
ALTER TABLE "OrganizationApplication" ADD CONSTRAINT "OrganizationApplication_no_self_review"
  CHECK ("reviewerId" IS NULL OR "reviewerId" <> "applicantId");
ALTER TABLE "OrganizationApplication" ADD CONSTRAINT "OrganizationApplication_decision_recorded"
  CHECK ("status" NOT IN ('APPROVED', 'REJECTED') OR ("decidedAt" IS NOT NULL AND "reviewerId" IS NOT NULL));
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_email_normalised" CHECK ("email" = lower("email"));

-- A correction or withdrawal must name the statement it replaces; nothing supersedes itself.
ALTER TABLE "OfficialResponse" ADD CONSTRAINT "OfficialResponse_supersession"
  CHECK (("type"::text NOT IN ('CORRECTION', 'WITHDRAWAL') OR "supersedesId" IS NOT NULL) AND ("supersedesId" IS NULL OR "supersedesId" <> "id"));

-- A flag or moderation decision about an official response carries the response, and only those do.
ALTER TABLE "ContentFlag" ADD CONSTRAINT "ContentFlag_response_target"
  CHECK (("target"::text = 'OFFICIAL_RESPONSE') = ("responseId" IS NOT NULL));
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_response_target"
  CHECK (("target"::text = 'OFFICIAL_RESPONSE') = ("responseId" IS NOT NULL));

-- A status change made on an organization's behalf names the organization. Organization evidence is resolution evidence.
ALTER TABLE "ReportStatusHistory" ADD CONSTRAINT "ReportStatusHistory_organization_basis"
  CHECK (("basis"::text = 'ORGANIZATION_STATEMENT') = ("organizationId" IS NOT NULL));
ALTER TABLE "ReportEvidence" ADD CONSTRAINT "ReportEvidence_organization_is_resolution"
  CHECK ("organizationId" IS NULL OR "kind" = 'RESOLUTION');

-- The record cannot be rewritten. Verification decisions are append-only like the audit log; an official response can be
-- hidden by moderators (moderationState) but its content, author, organization and time can never change, and it is
-- never deleted.
CREATE TRIGGER "VerificationDecision_append_only"
  BEFORE UPDATE OR DELETE ON "VerificationDecision"
  FOR EACH ROW EXECUTE FUNCTION sidewalk_forbid_mutation();

CREATE OR REPLACE FUNCTION sidewalk_official_response_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'OfficialResponse is append-only: DELETE is not allowed' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) - 'moderationState') IS DISTINCT FROM (to_jsonb(OLD) - 'moderationState') THEN
    RAISE EXCEPTION 'OfficialResponse is append-only: only moderationState may change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OfficialResponse_guard"
  BEFORE UPDATE OR DELETE ON "OfficialResponse"
  FOR EACH ROW EXECUTE FUNCTION sidewalk_official_response_guard();
