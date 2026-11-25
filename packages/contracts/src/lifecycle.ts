/**
 * The report lifecycle is the trust model of Sidewalk, so it lives in one shared place.
 * The API enforces it; the web app reads it to decide which actions to offer.
 */

export const REPORT_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "REOPENED",
  "REJECTED",
  "DUPLICATE"
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const ROLES = ["CITIZEN", "MODERATOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Who is attempting a transition. Staff means a MODERATOR or ADMIN of Sidewalk. ORGANIZATION is an authorized
 * representative of a verified, active organization: it can say work has begun or that it considers the issue fixed,
 * but it cannot reject, close as a duplicate, reopen, or verify anything.
 */
export type TransitionActor = "OWNER" | "STAFF" | "ORGANIZATION";

/** Why a transition happened; shown publicly so claims stay distinguishable from verification. */
export const STATUS_BASES = ["REPORTER_CLAIM", "STAFF_REVIEW", "ORGANIZATION_STATEMENT"] as const;
export type StatusBasis = (typeof STATUS_BASES)[number];

export const RESOLUTION_VERIFICATIONS = ["NONE", "CLAIMED", "VERIFIED"] as const;
export type ResolutionVerification = (typeof RESOLUTION_VERIFICATIONS)[number];

/** Every legal move. Anything not listed is rejected by the API. */
export const STATUS_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "ACKNOWLEDGED", "RESOLVED", "REJECTED", "DUPLICATE"],
  UNDER_REVIEW: ["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "REJECTED", "DUPLICATE"],
  ACKNOWLEDGED: ["IN_PROGRESS", "RESOLVED", "REJECTED", "DUPLICATE"],
  IN_PROGRESS: ["RESOLVED", "REJECTED"],
  RESOLVED: ["REOPENED"],
  REOPENED: ["UNDER_REVIEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"],
  REJECTED: ["UNDER_REVIEW"],
  DUPLICATE: ["UNDER_REVIEW"]
};

/** Targets each kind of actor may choose. Owners can only make claims about the outcome. */
const OWNER_TARGETS: readonly ReportStatus[] = ["RESOLVED", "REOPENED"];

/** Targets a verified organization's representative may choose. A resolution is only ever its claim. */
const ORGANIZATION_TARGETS: readonly ReportStatus[] = ["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"];

/** Targets that must carry a public explanation. */
const NOTE_REQUIRED: readonly ReportStatus[] = ["RESOLVED", "REOPENED", "REJECTED", "DUPLICATE"];

export function allowedTransitions(from: ReportStatus, actor: TransitionActor): ReportStatus[] {
  const legal = STATUS_TRANSITIONS[from];
  if (actor === "STAFF") return [...legal];
  const targets = actor === "ORGANIZATION" ? ORGANIZATION_TARGETS : OWNER_TARGETS;
  return legal.filter((s) => targets.includes(s));
}

export function canTransition(
  from: ReportStatus,
  to: ReportStatus,
  actor: TransitionActor
): boolean {
  return allowedTransitions(from, actor).includes(to);
}

export function transitionRequiresNote(to: ReportStatus): boolean {
  return NOTE_REQUIRED.includes(to);
}

/** Statuses in which the owner may still edit the substance of the report. */
export const OWNER_EDITABLE_STATUSES: readonly ReportStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "REOPENED"
];

/** Statuses that represent a closed outcome rather than active work. */
export const CLOSED_STATUSES: readonly ReportStatus[] = ["RESOLVED", "REJECTED", "DUPLICATE"];

export interface StatusInfo {
  label: string;
  /** Plain-language meaning, shown next to the status so nobody has to guess. */
  meaning: string;
}

export const STATUS_INFO: Record<ReportStatus, StatusInfo> = {
  SUBMITTED: {
    label: "Submitted",
    meaning:
      "A resident filed this report. It has not been reviewed, and nobody has acknowledged it officially."
  },
  UNDER_REVIEW: {
    label: "Under review",
    meaning: "Sidewalk staff are checking the details, location and evidence."
  },
  ACKNOWLEDGED: {
    label: "Acknowledged",
    meaning:
      "Sidewalk staff or a verified organization have recorded the report as an open issue. Acknowledging a report is not accepting responsibility for it."
  },
  IN_PROGRESS: {
    label: "In progress",
    meaning: "Work to address the issue has been recorded as under way."
  },
  RESOLVED: {
    label: "Resolved",
    meaning:
      "Someone has stated the issue is fixed. Check whether the resolution is marked as verified."
  },
  REOPENED: {
    label: "Reopened",
    meaning: "The issue was reported fixed, but evidence or a resident says it is still a problem."
  },
  REJECTED: {
    label: "Closed, not actionable",
    meaning:
      "Closed without a repair, for example because it is out of scope. See the stated reason."
  },
  DUPLICATE: {
    label: "Closed, duplicate",
    meaning: "Closed because the same issue is already tracked in another report."
  }
};

export const VERIFICATION_INFO: Record<ResolutionVerification, { label: string; meaning: string }> =
  {
    NONE: { label: "No resolution claimed", meaning: "Nobody has claimed this issue is resolved." },
    CLAIMED: {
      label: "Resolution claimed, not verified",
      meaning:
        "The resolution below is a statement, not a confirmed fact. It has not been independently checked."
    },
    VERIFIED: {
      label: "Resolution verified by Sidewalk staff",
      meaning:
        "A Sidewalk staff member reviewed the supporting evidence before marking the resolution as verified."
    }
  };
