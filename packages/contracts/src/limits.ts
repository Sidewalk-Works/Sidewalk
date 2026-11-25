export const LIMITS = {
  title: { min: 8, max: 120 },
  description: { min: 20, max: 4000 },
  address: { max: 200 },
  comment: { min: 2, max: 1500 },
  statusNote: { min: 10, max: 1000 },
  moderationReason: { min: 10, max: 600 },
  flagDetails: { max: 500 },
  displayName: { min: 2, max: 50 },
  password: { min: 10, max: 128 },
  caption: { max: 160 },
  evidence: {
    maxFileBytes: 8 * 1024 * 1024,
    maxPerReport: 10,
    maxPerSubmission: 5,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const
  },
  pageSize: { default: 12, max: 50 },
  commentEditWindowMinutes: 15,
  /** Reports one account may file in any rolling 24 hours. */
  reportsPerDay: 20
} as const;

/** How long one-time email links stay valid. Shown to users and enforced by the API. */
export const TOKEN_TTL = {
  emailVerificationHours: 24,
  passwordResetMinutes: 30
} as const;

export const DEFAULT_COUNTRY_CODE = "ng";
/** Geographic centre of Nigeria, used only as the initial map view. */
export const DEFAULT_MAP_CENTER = { latitude: 9.082, longitude: 8.6753, zoom: 5.4 } as const;

/** Limits for organizations, applications and official responses. Shared so the forms and the API agree. */
export const ORGANIZATION_LIMITS = {
  name: { min: 3, max: 120 },
  alias: { max: 120, maxCount: 6 },
  jurisdiction: { min: 2, max: 160 },
  serviceArea: { max: 80, maxCount: 12 },
  description: { max: 1500 },
  website: { max: 200 },
  publicEmail: { max: 160 },
  publicPhone: { max: 40 },
  roleTitle: { max: 100 },
  authorityStatement: { min: 20, max: 1000 },
  reference: { kindMax: 60, labelMax: 100, valueMax: 300, minCount: 1, maxCount: 8 },
  infoRequest: { min: 10, max: 1000 },
  decisionReason: { min: 10, max: 1000 },
  reviewerNotes: { max: 2000 },
  /** Why staff suspend, reinstate or revoke. Recorded permanently. */
  governanceReason: { min: 10, max: 1000 },
  responseBody: { min: 10, max: 2000 },
  documentsPerApplication: 6,
  /** How long an invitation link works. */
  invitationTtlDays: 7,
  /** People one organization administrator may invite in a day, to stop a compromised account mass-inviting. */
  invitationsPerDay: 20,
  /** Organizations a reporter may suggest for one report. */
  suggestionsPerReport: 3
} as const;
