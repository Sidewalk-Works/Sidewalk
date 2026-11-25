export const MODERATION_STATES = ["VISIBLE", "HIDDEN", "REMOVED"] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

export const FLAG_REASONS = [
  "SPAM",
  "ABUSIVE",
  "PRIVACY",
  "MISLEADING",
  "OFF_TOPIC",
  "OTHER"
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  SPAM: "Spam or advertising",
  ABUSIVE: "Abusive or threatening",
  PRIVACY: "Exposes personal information",
  MISLEADING: "Deliberately misleading",
  OFF_TOPIC: "Not a community issue",
  OTHER: "Something else"
};

export const MODERATION_POLICIES = [
  "SPAM",
  "ABUSE",
  "PRIVACY_EXPOSURE",
  "MISLEADING",
  "OFF_TOPIC",
  "ILLEGAL",
  "OTHER"
] as const;
export type ModerationPolicy = (typeof MODERATION_POLICIES)[number];

export const MODERATION_POLICY_LABELS: Record<ModerationPolicy, string> = {
  SPAM: "Spam or advertising",
  ABUSE: "Abuse, harassment or threats",
  PRIVACY_EXPOSURE: "Exposes personal information",
  MISLEADING: "Deliberately misleading",
  OFF_TOPIC: "Not a community issue",
  ILLEGAL: "Illegal content",
  OTHER: "Other (explain in the reason)"
};

export const MODERATION_ACTIONS = ["HIDE", "REMOVE", "RESTORE", "DISMISS"] as const;
export type ModerationActionType = (typeof MODERATION_ACTIONS)[number];

export const CONTENT_TARGETS = ["REPORT", "COMMENT", "OFFICIAL_RESPONSE"] as const;
export type ContentTarget = (typeof CONTENT_TARGETS)[number];

export const COMMENT_KINDS = ["CITIZEN", "STAFF", "OFFICIAL"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

export const EVIDENCE_KINDS = ["REPORT", "RESOLUTION"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
