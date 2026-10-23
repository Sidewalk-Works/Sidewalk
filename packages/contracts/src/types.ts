import type { ReportStatus, ResolutionVerification, Role, StatusBasis } from "./lifecycle";
import type {
  CommentKind,
  ContentTarget,
  EvidenceKind,
  FlagReason,
  ModerationActionType,
  ModerationPolicy,
  ModerationState
} from "./moderation";

/** The consistent error body returned by every failing API call. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
  requestId?: string;
  timestamp: string;
  path: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export interface EvidenceDto {
  id: string;
  kind: EvidenceKind;
  caption: string | null;
  width: number;
  height: number;
  mimeType: string;
  /** Relative API paths; always resolved through authorization-aware endpoints. */
  thumbUrl: string;
  fullUrl: string;
  createdAt: string;
  moderationState?: ModerationState;
}

export interface ReportSummaryDto {
  id: string;
  reference: string;
  title: string;
  excerpt: string;
  status: ReportStatus;
  category: { slug: string; name: string };
  latitude: number;
  longitude: number;
  addressText: string | null;
  areaName: string | null;
  createdAt: string;
  lastActivityAt: string;
  evidenceCount: number;
  commentCount: number;
  coverThumbUrl: string | null;
  reporterName: string | null;
  distanceKm?: number;
}

export interface TimelineEventDto {
  id: string;
  type:
    | "SUBMITTED"
    | "STATUS_CHANGED"
    | "EVIDENCE_ADDED"
    | "EDITED"
    | "COMMENT_ADDED"
    | "RESOLUTION_VERIFIED";
  createdAt: string;
  actorLabel: string;
  actorRole: "REPORTER" | "STAFF" | "SYSTEM";
  fromStatus?: ReportStatus;
  toStatus?: ReportStatus;
  basis?: StatusBasis;
  note?: string | null;
}

export interface CommentDto {
  id: string;
  kind: CommentKind;
  body: string | null;
  authorName: string;
  isReportOwner: boolean;
  createdAt: string;
  editedAt: string | null;
  /** True when the author deleted it or moderators removed it. The body is then null. */
  tombstone: "AUTHOR_DELETED" | "MODERATED" | null;
  canEdit?: boolean;
  canDelete?: boolean;
  mine?: boolean;
}

export interface ReportDetailDto extends ReportSummaryDto {
  description: string;
  verification: ResolutionVerification;
  resolutionNote: string | null;
  resolvedAt: string | null;
  updatedAt: string;
  evidence: EvidenceDto[];
  resolutionEvidence: EvidenceDto[];
  timeline: TimelineEventDto[];
  viewer: {
    isOwner: boolean;
    isStaff: boolean;
    canEdit: boolean;
    canComment: boolean;
    allowedTransitions: ReportStatus[];
    hasFlagged: boolean;
    /** Owners always count as following their own report. */
    following: boolean;
  };
  moderationState?: ModerationState;
  /** Shown only to the owner and staff when content has been hidden or removed. */
  moderationNotice?: { policy: ModerationPolicy; reason: string; at: string } | null;
}

export interface MapPointDto {
  reference: string;
  title: string;
  status: ReportStatus;
  categorySlug: string;
  latitude: number;
  longitude: number;
}

export interface OwnerReportDto extends ReportSummaryDto {
  moderationState: ModerationState;
  verification: ResolutionVerification;
  actionNeeded: { code: string; message: string } | null;
  canEdit: boolean;
}

export interface OwnerUpdateDto {
  id: string;
  type: TimelineEventDto["type"];
  createdAt: string;
  actorLabel: string;
  summary: string;
  report: { reference: string; title: string };
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  /** False until the owner proves control of the address. Unverified accounts are restricted. */
  emailVerified: boolean;
  createdAt: string;
}

export const NOTIFICATION_TYPES = [
  "STATUS_CHANGED",
  "REOPENED",
  "RESOLUTION_VERIFIED",
  "COMMENT",
  "STAFF_UPDATE",
  "MODERATION",
  "REPORT_UPDATE"
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Relative path on the web app. */
  url: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferencesDto {
  /** Email me when a report I filed or follow changes status. */
  reportUpdates: boolean;
  /** Email me about comments and staff updates on those reports. */
  comments: boolean;
  /** Email me when moderators act on my content. */
  moderation: boolean;
}

export interface PlatformStatsDto {
  totalReports: number;
  openReports: number;
  resolvedReports: number;
  verifiedResolutions: number;
  reportsWithEvidence: number;
  categoriesInUse: number;
  generatedAt: string;
}

export interface FlagDto {
  id: string;
  target: ContentTarget;
  reason: FlagReason;
  details: string | null;
  status: "OPEN" | "ACTIONED" | "DISMISSED";
  createdAt: string;
  reporterName: string;
  report: { reference: string; title: string; moderationState: ModerationState };
  comment?: {
    id: string;
    body: string;
    moderationState: ModerationState;
    authorName: string;
  } | null;
}

export interface ModerationActionDto {
  id: string;
  action: ModerationActionType;
  policy: ModerationPolicy | null;
  reason: string;
  target: ContentTarget;
  previousState: ModerationState;
  newState: ModerationState;
  moderatorName: string;
  reportReference: string;
  createdAt: string;
}
