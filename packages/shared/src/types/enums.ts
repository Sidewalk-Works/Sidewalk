export const ReportStatus = {
  SUBMITTED: "submitted",
  UNDER_REVIEW: "under_review",
  VERIFIED: "verified",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;

export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const ReportCategory = {
  POTHOLE: "pothole",
  STREETLIGHT: "streetlight",
  DRAINAGE: "drainage",
  WASTE: "waste",
  VANDALISM: "vandalism",
  OTHER: "other",
} as const;

export type ReportCategory = (typeof ReportCategory)[keyof typeof ReportCategory];

export const Visibility = {
  PUBLIC: "public",
  PRIVATE: "private",
  MODERATORS_ONLY: "moderators_only",
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const ModerationOutcome = {
  APPROVED: "approved",
  REJECTED: "rejected",
  FLAGGED: "flagged",
  ESCALATED: "escalated",
} as const;

export type ModerationOutcome = (typeof ModerationOutcome)[keyof typeof ModerationOutcome];

export const ModerationAction = {
  APPROVE: "approve",
  REJECT: "reject",
  FLAG: "flag",
  ESCALATE: "escalate",
  DISMISS: "dismiss",
} as const;

export type ModerationAction = (typeof ModerationAction)[keyof typeof ModerationAction];
