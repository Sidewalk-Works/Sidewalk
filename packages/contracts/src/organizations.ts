/**
 * Verified organizations. The vocabulary, the meaning of each state, and the shapes the API and the web app share.
 *
 * Principles that this file's wording protects:
 *  - a registered profile is not a verified institution;
 *  - an invitation is not proof of institutional identity;
 *  - an acknowledgement is not acceptance of responsibility;
 *  - a resolution claim is not an independently verified outcome.
 */
import type { ReportStatus } from "./lifecycle";
import type { EvidenceDto } from "./types";

// ───────────────────────────── identity ─────────────────────────────

export const ORGANIZATION_TYPES = [
  "AGENCY",
  "DEPARTMENT",
  "PUBLIC_SERVICE_BODY",
  "OTHER_PUBLIC_INSTITUTION"
] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ADMINISTRATIVE_LEVELS = ["LOCAL", "STATE", "FEDERAL", "MULTI_LEVEL"] as const;
export type AdministrativeLevel = (typeof ADMINISTRATIVE_LEVELS)[number];

export const ORGANIZATION_TYPE_INFO: Record<
  OrganizationType,
  { label: string; meaning: string; referenceHints: string[] }
> = {
  AGENCY: {
    label: "Government agency",
    meaning: "A body set up by law or executive instrument to carry out a public function.",
    referenceHints: [
      "The act, decree or instrument that established it",
      "A government directory or gazette entry that lists it",
      "Its official website page naming this representative or office"
    ]
  },
  DEPARTMENT: {
    label: "Department or ministry",
    meaning: "A department, ministry or directorate within a government.",
    referenceHints: [
      "The parent government's published structure listing the department",
      "An official letter or circular on its letterhead",
      "Its official website page naming this representative or office"
    ]
  },
  PUBLIC_SERVICE_BODY: {
    label: "Public service body",
    meaning: "A utility, transport authority, board or similar body delivering a public service.",
    referenceHints: [
      "Its licence, charter or enabling legislation",
      "The regulator's register entry",
      "Its official website page naming this representative or office"
    ]
  },
  OTHER_PUBLIC_INSTITUTION: {
    label: "Other public institution",
    meaning:
      "A public institution that is not one of the above, such as a local council office or a public authority.",
    referenceHints: [
      "Whatever establishes it as a public institution (statute, charter, resolution)",
      "A published listing of it by a government or regulator",
      "Its official website page naming this representative or office"
    ]
  }
};

export const ADMINISTRATIVE_LEVEL_INFO: Record<AdministrativeLevel, { label: string }> = {
  LOCAL: { label: "Local" },
  STATE: { label: "State or regional" },
  FEDERAL: { label: "Federal or national" },
  MULTI_LEVEL: { label: "Serves more than one level" }
};

/** Operational state: may the organization act? Separate from whether its identity is verified. */
export const ORGANIZATION_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

/** Identity verification: a decision by Sidewalk staff, never inferred. */
export const ORG_VERIFICATION_STATUSES = ["UNVERIFIED", "VERIFIED", "REVOKED"] as const;
export type OrgVerificationStatus = (typeof ORG_VERIFICATION_STATUSES)[number];

export const ORG_VERIFICATION_INFO: Record<
  OrgVerificationStatus,
  { label: string; meaning: string }
> = {
  UNVERIFIED: {
    label: "Not verified",
    meaning:
      "This profile exists on Sidewalk, but Sidewalk has not checked that it belongs to the institution it names. Do not treat its statements as official."
  },
  VERIFIED: {
    label: "Verified organization",
    meaning:
      "Sidewalk staff reviewed evidence that this is the institution it says it is, and that its representatives may speak for it. That does not make its statements about reports true: its claims are still separate from independent verification."
  },
  REVOKED: {
    label: "Verification withdrawn",
    meaning:
      "Sidewalk staff withdrew this organization's verification. Statements it published while verified remain on record, marked as made then."
  }
};

// ───────────────────────────── applications ─────────────────────────────

export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INFO_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN"
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const OPEN_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INFO_REQUESTED"
];

export const APPLICATION_STATUS_INFO: Record<
  ApplicationStatus,
  { label: string; meaning: string }
> = {
  DRAFT: { label: "Draft", meaning: "Saved, not yet sent. Nobody at Sidewalk has seen it." },
  SUBMITTED: {
    label: "Submitted",
    meaning: "Sent to Sidewalk staff. It is waiting for someone to start reviewing it."
  },
  UNDER_REVIEW: { label: "Under review", meaning: "A member of Sidewalk staff is reviewing it." },
  INFO_REQUESTED: {
    label: "More information needed",
    meaning: "Staff asked a question. Answer it and send the application again."
  },
  APPROVED: {
    label: "Approved",
    meaning: "Sidewalk staff verified the organization. Its representatives can now respond."
  },
  REJECTED: {
    label: "Not approved",
    meaning: "Sidewalk staff could not verify the organization. The reason is shown."
  },
  WITHDRAWN: { label: "Withdrawn", meaning: "The applicant withdrew this application." }
};

export interface OfficialReference {
  /** What kind of evidence this is, in the applicant's words ("Enabling act", "Gazette notice"). */
  kind: string;
  label: string;
  /** A citation, a reference number, or a link. */
  value: string;
}

// ───────────────────────────── membership ─────────────────────────────

export const MEMBER_ROLES = ["ADMIN", "REPRESENTATIVE", "MEMBER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_ROLE_INFO: Record<
  MemberRole,
  { label: string; meaning: string; canRespond: boolean; canManage: boolean }
> = {
  ADMIN: {
    label: "Administrator",
    meaning:
      "Manages who belongs to the organization and may publish responses for it. Has no Sidewalk staff powers.",
    canRespond: true,
    canManage: true
  },
  REPRESENTATIVE: {
    label: "Representative",
    meaning: "May publish responses for the organization. Cannot manage members.",
    canRespond: true,
    canManage: false
  },
  MEMBER: {
    label: "Member",
    meaning: "Belongs to the organization but cannot publish responses or manage members.",
    canRespond: false,
    canManage: false
  }
};

// ───────────────────────────── official responses ─────────────────────────────

export const RESPONSE_TYPES = [
  "ACKNOWLEDGEMENT",
  "UPDATE",
  "DELAY",
  "OUT_OF_REMIT",
  "RESOLUTION_CLAIM",
  "CORRECTION",
  "WITHDRAWAL"
] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];

export const RESPONSE_TYPE_INFO: Record<
  ResponseType,
  { label: string; verb: string; meaning: string }
> = {
  ACKNOWLEDGEMENT: {
    label: "Acknowledgement",
    verb: "acknowledged this report",
    meaning:
      "The organization has seen the report. This is not an acceptance of responsibility or a promise to act."
  },
  UPDATE: {
    label: "Progress update",
    verb: "posted a progress update",
    meaning: "What the organization says it has done or will do next."
  },
  DELAY: {
    label: "Delay or constraint",
    verb: "explained a delay",
    meaning: "Why work has not happened or is taking longer than expected."
  },
  OUT_OF_REMIT: {
    label: "Outside our remit",
    verb: "said this is outside its remit",
    meaning:
      "The organization says this is not its responsibility. That is its statement, not a finding: Sidewalk has not checked."
  },
  RESOLUTION_CLAIM: {
    label: "Resolution claim",
    verb: "claimed this is resolved",
    meaning:
      "The organization says the issue is fixed. This is a claim, not an independently verified outcome."
  },
  CORRECTION: {
    label: "Correction",
    verb: "corrected an earlier statement",
    meaning: "Replaces an earlier statement. The earlier text stays on the record."
  },
  WITHDRAWAL: {
    label: "Withdrawal",
    verb: "withdrew an earlier statement",
    meaning: "The organization withdrew an earlier statement. The earlier text stays on the record."
  }
};

/** Responses that must say which earlier statement they replace. */
export const SUPERSEDING_RESPONSE_TYPES: readonly ResponseType[] = ["CORRECTION", "WITHDRAWAL"];

// ───────────────────────────── relationship to reports ─────────────────────────────

export const RELATION_BASES = [
  "REPORTER_SUGGESTED",
  "STAFF_ASSIGNED",
  "ORGANIZATION_ADDED"
] as const;
export type RelationBasis = (typeof RELATION_BASES)[number];
export const RELATION_STATUSES = ["PROPOSED", "ACTIVE", "OUTSIDE_REMIT", "REMOVED"] as const;
export type RelationStatus = (typeof RELATION_STATUSES)[number];

export const RELATION_BASIS_INFO: Record<RelationBasis, { label: string }> = {
  REPORTER_SUGGESTED: { label: "Suggested by the person who filed the report" },
  STAFF_ASSIGNED: { label: "Assigned by Sidewalk staff" },
  ORGANIZATION_ADDED: { label: "Added by the organization itself" }
};

export const RELATION_STATUS_INFO: Record<RelationStatus, { label: string; meaning: string }> = {
  PROPOSED: {
    label: "Suggested",
    meaning: "Suggested as relevant. The organization has not responded."
  },
  ACTIVE: { label: "Connected", meaning: "Connected to this report. Not necessarily accepted." },
  OUTSIDE_REMIT: {
    label: "Says it is outside its remit",
    meaning:
      "The organization says this is not its responsibility. That is its statement, not a finding."
  },
  REMOVED: { label: "Removed", meaning: "Sidewalk staff removed this connection." }
};

// ───────────────────────────── helpers ─────────────────────────────

/**
 * A comparison key for names: lower case, no accents, no punctuation, "&" as "and". Used to notice duplicates and
 * lookalikes. Two organizations with the same key are NOT the same institution, and a matching key proves nothing.
 */
export function normalizeOrganizationName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Addresses that are pages, not organizations (`/organizations/mine`, `/organizations/apply`, …). A name that would
 * slugify to one of them gets a suffix, so no organization can shadow or be shadowed by a built-in route.
 */
export const RESERVED_ORGANIZATION_SLUGS: readonly string[] = [
  "mine",
  "apply",
  "applications",
  "invitations",
  "new",
  "team",
  "admin",
  "list"
];

export function slugifyOrganizationName(name: string): string {
  const slug = normalizeOrganizationName(name).replace(/ /g, "-").slice(0, 60).replace(/-+$/, "");
  return RESERVED_ORGANIZATION_SLUGS.includes(slug) ? `${slug}-organization` : slug;
}

// ───────────────────────────── DTOs ─────────────────────────────

/** Just enough to show who an organization is, everywhere an organization is named. */
export interface OrganizationBadgeDto {
  slug: string;
  name: string;
  /** Currently verified (and not revoked). Whether it was verified when it said something is on the statement itself. */
  verified: boolean;
  verificationStatus: OrgVerificationStatus;
  suspended: boolean;
}

export interface OrganizationSummaryDto extends OrganizationBadgeDto {
  type: OrganizationType;
  level: AdministrativeLevel;
  jurisdiction: string;
  excerpt: string | null;
}

/**
 * Plain counts of public activity, with their definitions stated in the API, the page and the documentation.
 * There are deliberately no rates, averages or response times: they would need denominators and windows that
 * could mislead.
 */
export interface OrganizationMetricsDto {
  /** Public reports connected to the organization and not removed. */
  reportsConnected: number;
  /** Public reports on which the organization has published an acknowledgement. */
  reportsAcknowledged: number;
  /** Public reports on which the organization has published a resolution claim (each report counted once). */
  resolutionsClaimed: number;
  /** Of those, reports whose current resolution was independently verified by Sidewalk staff and was claimed by this organization. */
  claimsVerified: number;
  window: "all time";
  scope: "public reports only";
}

export interface OfficialResponseDto {
  id: string;
  type: ResponseType;
  body: string;
  createdAt: string;
  organization: OrganizationBadgeDto;
  /** Was the organization verified when this was published? A later revocation does not change this. */
  verifiedWhenPublished: boolean;
  authorName: string;
  supersedesId: string | null;
  /** The newest statement that replaces this one, if any. */
  supersededById: string | null;
  evidence: EvidenceDto[];
  /** Only the response's organization, its reporter and staff ever see anything but VISIBLE. */
  moderationState?: "VISIBLE" | "HIDDEN" | "REMOVED";
  /** True when the viewer has already flagged it. */
  hasFlagged?: boolean;
  /** Set when the status of the report changed with this statement. */
  statusChange?: { from: ReportStatus; to: ReportStatus } | null;
  report?: { reference: string; title: string };
}

export interface ReportOrganizationDto {
  organization: OrganizationBadgeDto;
  basis: RelationBasis;
  status: RelationStatus;
  acknowledgedAt: string | null;
  outsideRemitAt: string | null;
  createdAt: string;
}

/** What the viewer may do on a report on behalf of an organization they belong to. */
export interface ViewerOrganizationDto {
  slug: string;
  name: string;
  role: MemberRole;
  /** May publish responses right now: verified, active, and a role that allows it. */
  canRespond: boolean;
  /** Why not, in words, when canRespond is false. */
  reason: string | null;
  /** The organization's current connection to this report, if any. */
  relation: RelationStatus | null;
  canAddItself: boolean;
}

export interface MemberDto {
  id: string;
  userId: string;
  name: string;
  role: MemberRole;
  status: "ACTIVE" | "REVOKED";
  addedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface InvitationDto {
  id: string;
  /** Masked for everyone except staff and the person who sent it. */
  email: string;
  role: MemberRole;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  sentCount: number;
  lastSentAt: string;
  createdAt: string;
}

export interface OrganizationProfileDto extends OrganizationSummaryDto {
  aliases: string[];
  serviceAreas: string[];
  description: string | null;
  website: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  parent: { slug: string; name: string } | null;
  verifiedAt: string | null;
  metrics: OrganizationMetricsDto;
  viewer: {
    role: MemberRole | null;
    canManageMembers: boolean;
    canRespond: boolean;
    isStaff: boolean;
  };
}

export interface ApplicationDocumentDto {
  id: string;
  caption: string | null;
  createdAt: string;
  width: number;
  height: number;
  /** Always an authorization-aware endpoint; never an object-store address. */
  url: string;
}

export interface ApplicationDto {
  id: string;
  status: ApplicationStatus;
  organization: {
    id: string;
    slug: string;
    name: string;
    aliases: string[];
    type: OrganizationType;
    level: AdministrativeLevel;
    jurisdiction: string;
    serviceAreas: string[];
    description: string | null;
    website: string | null;
    publicEmail: string | null;
    publicPhone: string | null;
    parentSlug: string | null;
    verificationStatus: OrgVerificationStatus;
  };
  roleTitle: string | null;
  authorityStatement: string | null;
  officialReferences: OfficialReference[];
  /** The latest question from staff, when information was requested. */
  infoRequest: string | null;
  /** Why it was decided as it was. */
  decisionReason: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documents: ApplicationDocumentDto[];
  /** What the applicant may do next. */
  can: { edit: boolean; submit: boolean; withdraw: boolean; addDocuments: boolean };
}

/** The staff view adds what only staff see. */
export interface StaffApplicationDto extends ApplicationDto {
  applicant: { id: string; name: string; email: string; emailVerified: boolean };
  reviewer: { id: string; name: string } | null;
  /** Private. Never included in the applicant's or the public's view. */
  reviewerNotes: string | null;
  /** Other organizations with the same or similar name. A match is a reason to look closer, never proof. */
  similar: Array<{
    slug: string;
    name: string;
    verificationStatus: OrgVerificationStatus;
    status: string;
    jurisdiction: string;
  }>;
  /** Why this reviewer can or cannot decide it. */
  reviewerConflict: string | null;
}

export interface VerificationDecisionDto {
  id: string;
  action:
    | "REVIEW_STARTED"
    | "INFO_REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "SUSPENDED"
    | "REINSTATED"
    | "REVOKED";
  actorName: string;
  reason: string | null;
  createdAt: string;
}

/** What staff see about an organization: everything the public sees, plus its governance record. */
export interface StaffOrganizationDto {
  id: string;
  slug: string;
  name: string;
  type: OrganizationType;
  level: AdministrativeLevel;
  jurisdiction: string;
  aliases: string[];
  serviceAreas: string[];
  description: string | null;
  website: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  status: OrganizationStatus;
  suspendedAt: string | null;
  verificationStatus: OrgVerificationStatus;
  verifiedAt: string | null;
  verificationRevokedAt: string | null;
  publicProfile: boolean;
  createdAt: string;
  createdByName: string;
  members: Array<MemberDto & { email: string }>;
  invitations: InvitationDto[];
  decisions: VerificationDecisionDto[];
  applications: Array<{
    id: string;
    status: ApplicationStatus;
    applicantName: string;
    submittedAt: string | null;
    decidedAt: string | null;
  }>;
  /** Why the viewer cannot make governance decisions about this organization, if they cannot (for example they belong to it). */
  conflict: string | null;
}

/** One entry in a staff queue of applications. */
export interface ApplicationQueueItemDto {
  id: string;
  status: ApplicationStatus;
  organizationName: string;
  organizationSlug: string;
  type: OrganizationType;
  jurisdiction: string;
  applicantName: string;
  submittedAt: string | null;
  updatedAt: string;
  reviewerName: string | null;
  documents: number;
  /** Other organizations with the same name: a reason to look closer. */
  similarCount: number;
}

export interface RelationQueueItemDto extends ReportOrganizationDto {
  id: string;
  report: { reference: string; title: string; status: ReportStatus };
}
