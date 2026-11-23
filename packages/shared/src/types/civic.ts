import type { ModerationOutcome, ReportCategory, ReportStatus, Visibility } from "./enums.js";

export interface ReportProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface ReportSubmission {
  title: string;
  description: string;
  category: ReportCategory;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  media_urls?: string[];
  /** @deprecated The API does not accept visibility. */
  visibility?: Visibility;
  /** @deprecated Use address/latitude/longitude. */
  location?: string;
  /** @deprecated Use media_urls. */
  mediaUrls?: string[];
}

export interface Report {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: ReportCategory;
  status: ReportStatus;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  media_urls: string[];
  created_at: string;
  updated_at: string;
  /** @deprecated Use user_id. */
  authorId?: string;
  /** @deprecated The API does not return visibility. */
  visibility?: Visibility;
  /** @deprecated Use address/latitude/longitude. */
  location?: string;
  /** @deprecated Use media_urls. */
  mediaUrls?: string[];
  /** @deprecated Use created_at. */
  createdAt?: string;
  /** @deprecated Use updated_at. */
  updatedAt?: string;
}

export interface ReportSummary {
  id: string;
  title: string;
  status: ReportStatus;
  category?: ReportCategory;
  created_at?: string;
  user_id?: string;
  /** @deprecated Use created_at. */
  createdAt?: string;
  /** @deprecated The API does not return an author profile object. */
  author?: ReportProfile;
}

export interface UserSummary {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: string;
  reportCount?: number;
}

export interface ProfileUpdate {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
}

export interface StatusDetail {
  current: ReportStatus;
  previous?: ReportStatus;
  reason?: string;
  changedBy?: string;
  changedAt: string;
}

/** @deprecated The current API does not support report drafts. */
export interface ReportDraft {
  id: string;
  authorId: string;
  title: string;
  description: string;
  category?: ReportCategory;
  visibility?: Visibility;
  location?: string;
  mediaUrls: string[];
  status: "draft";
  createdAt: string;
  updatedAt: string;
}

export interface ModerationRecord {
  id: string;
  reportId: string;
  moderatorId: string;
  outcome: ModerationOutcome;
  reason?: string;
  createdAt: string;
}
