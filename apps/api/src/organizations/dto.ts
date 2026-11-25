import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateNested
} from "class-validator";
import {
  ADMINISTRATIVE_LEVELS,
  APPLICATION_STATUSES,
  MEMBER_ROLES,
  ORGANIZATION_LIMITS as L,
  ORGANIZATION_TYPES,
  RESPONSE_TYPES,
  type AdministrativeLevel,
  type ApplicationStatus,
  type MemberRole,
  type OrganizationType,
  type ResponseType
} from "@sidewalk/contracts";
import { PaginationQuery } from "../common/utils/pagination";

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** The public face of an organization. Everything here may be shown to anyone once the profile is listed. */
export class OrganizationFieldsDto {
  @IsString()
  @Length(L.name.min, L.name.max, {
    message: `Give the full official name (${L.name.min}-${L.name.max} characters).`
  })
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.alias.maxCount)
  @IsString({ each: true })
  @MaxLength(L.alias.max, { each: true })
  aliases?: string[];

  @IsIn(ORGANIZATION_TYPES, { message: "Choose what kind of institution this is." })
  type!: OrganizationType;

  @IsIn(ADMINISTRATIVE_LEVELS, { message: "Choose the level it operates at." })
  level!: AdministrativeLevel;

  @IsString()
  @Length(L.jurisdiction.min, L.jurisdiction.max, {
    message: "Say where it has authority or which area it serves."
  })
  jurisdiction!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.serviceArea.maxCount)
  @IsString({ each: true })
  @MaxLength(L.serviceArea.max, { each: true })
  serviceAreas?: string[];

  /** The slug of the institution this one is part of, when there is one. Optional: not every body has a parent. */
  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: "That is not a valid organization address." })
  parentSlug?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(L.description.max)
  description?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl(
    { protocols: ["http", "https"], require_protocol: true },
    { message: "Enter the full web address, starting with https://" }
  )
  @MaxLength(L.website.max)
  website?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEmail({}, { message: "Enter a valid public contact email." })
  @MaxLength(L.publicEmail.max)
  publicEmail?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(L.publicPhone.max)
  publicPhone?: string;
}

export class OfficialReferenceDto {
  @IsString()
  @Length(2, L.reference.kindMax)
  kind!: string;

  @IsString()
  @Length(2, L.reference.labelMax)
  label!: string;

  @IsString()
  @Length(2, L.reference.valueMax)
  value!: string;
}

export class ApplicationDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(L.roleTitle.max)
  roleTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(L.authorityStatement.max)
  authorityStatement?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.reference.maxCount)
  @ValidateNested({ each: true })
  @Type(() => OfficialReferenceDto)
  officialReferences?: OfficialReferenceDto[];
}

/** Start an application: either describe a new institution, or name an existing unverified one you administer. */
export class CreateApplicationDto extends ApplicationDetailsDto {
  @IsOptional()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  organizationSlug?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationFieldsDto)
  organization?: OrganizationFieldsDto;
}

export class UpdateApplicationDto extends ApplicationDetailsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationFieldsDto)
  organization?: OrganizationFieldsDto;
}

export class DocumentCaptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  caption?: string;
}

// ───────────────────────────── staff decisions ─────────────────────────────

export class InfoRequestDto {
  @IsString()
  @Length(L.infoRequest.min, L.infoRequest.max, {
    message: `Say what you need, in ${L.infoRequest.min}-${L.infoRequest.max} characters.`
  })
  message!: string;
}

export class ReviewerNotesDto {
  @IsString()
  @MaxLength(L.reviewerNotes.max)
  notes!: string;
}

export class DecisionDto {
  @IsIn(["APPROVE", "REJECT"], { message: "Choose approve or reject." })
  decision!: "APPROVE" | "REJECT";

  /** Recorded permanently. Shown to the applicant. */
  @IsString()
  @Length(L.decisionReason.min, L.decisionReason.max, {
    message: `Explain the decision in ${L.decisionReason.min}-${L.decisionReason.max} characters.`
  })
  reason!: string;

  /** On approval: make the applicant the organization's first administrator. Defaults to yes; staff can decline. */
  @IsOptional()
  @IsBoolean()
  appointApplicant?: boolean;
}

export class GovernanceReasonDto {
  @IsString()
  @Length(L.governanceReason.min, L.governanceReason.max, {
    message: `Explain the decision in ${L.governanceReason.min}-${L.governanceReason.max} characters.`
  })
  reason!: string;
}

export class CreateOrganizationDto extends OrganizationFieldsDto {
  /** Make the profile visible (as "not verified") straight away. Default: unlisted until verified. */
  @IsOptional()
  @IsBoolean()
  listPublicly?: boolean;

  /** Invite the intended representative at the same time. */
  @IsOptional()
  @IsEmail()
  inviteEmail?: string;
}

// ───────────────────────────── invitations & members ─────────────────────────────

export class InviteDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Enter the person's email address." })
  @MaxLength(254)
  email!: string;

  @IsIn(MEMBER_ROLES, { message: "Choose a role." })
  role!: MemberRole;
}

export class InvitationTokenDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: "This link is not valid." })
  token!: string;
}

export class SetMemberRoleDto {
  @IsIn(MEMBER_ROLES)
  role!: MemberRole;
}

export class RevokeMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(L.governanceReason.max)
  reason?: string;
}

// ───────────────────────────── official responses ─────────────────────────────

export class PublishResponseDto {
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  organizationSlug!: string;

  @IsIn(RESPONSE_TYPES, { message: "Choose what kind of response this is." })
  type!: ResponseType;

  @IsString()
  @Length(L.responseBody.min, L.responseBody.max, {
    message: `Write between ${L.responseBody.min} and ${L.responseBody.max} characters. Everyone who views the report will read it.`
  })
  body!: string;

  /** For a correction or withdrawal: the earlier statement this replaces. */
  @IsOptional()
  @IsUUID()
  supersedesId?: string;

  /** For a resolution claim: the photographs uploaded for this organization that support it. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUUID(undefined, { each: true })
  evidenceIds?: string[];

  /** For a progress update: also record the report as in progress (only legal after an acknowledgement). */
  @IsOptional()
  @IsBoolean()
  markInProgress?: boolean;
}

export class OrganizationSlugDto {
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  organizationSlug!: string;
}

export class StaffRelationDto extends OrganizationSlugDto {
  @IsIn(["ACTIVE", "REMOVED"], { message: "Choose connect or remove." })
  status!: "ACTIVE" | "REMOVED";

  @IsString()
  @Length(L.governanceReason.min, L.governanceReason.max)
  reason!: string;
}

// ───────────────────────────── queries ─────────────────────────────

export class OrganizationListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(ORGANIZATION_TYPES)
  type?: OrganizationType;

  @IsOptional()
  @IsIn(ADMINISTRATIVE_LEVELS)
  level?: AdministrativeLevel;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jurisdiction?: string;

  /** "true": only verified organizations. */
  @IsOptional()
  @IsIn(["true", "false"])
  verified?: "true" | "false";
}

export class StaffOrganizationListQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(["ALL", "UNVERIFIED", "VERIFIED", "REVOKED", "SUSPENDED"])
  state: "ALL" | "UNVERIFIED" | "VERIFIED" | "REVOKED" | "SUSPENDED" = "ALL";
}

export class ApplicationQueueQuery extends PaginationQuery {
  /** "OPEN" means everything waiting on staff or the applicant. */
  @IsOptional()
  @IsIn(["OPEN", "ALL", ...APPLICATION_STATUSES])
  status: "OPEN" | "ALL" | ApplicationStatus = "OPEN";
}

export class RelationQueueQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(["OUTSIDE_REMIT", "PROPOSED"])
  status: "OUTSIDE_REMIT" | "PROPOSED" = "OUTSIDE_REMIT";
}

export class ResponseListQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(RESPONSE_TYPES)
  type?: ResponseType;

  @IsOptional()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  organization?: string;

  @IsOptional()
  @IsIn(["ALL", "VISIBLE", "HIDDEN", "REMOVED"])
  state: "ALL" | "VISIBLE" | "HIDDEN" | "REMOVED" = "ALL";
}
