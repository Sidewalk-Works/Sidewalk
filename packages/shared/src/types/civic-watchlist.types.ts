export type CaseFollowUpStatus = 'active_review' | 'pending_city_response' | 'resolved' | 'stale';
export type PriorityLevel = 'high' | 'medium' | 'low';

export interface CivicWatchlistItem {
  caseId: string;
  title: string;
  neighborhood: string;
  category: string;
  followUpStatus: CaseFollowUpStatus;
  priority: PriorityLevel;
  lastActivityAtIso: string;
  addedAtIso: string;
}

export interface WatchlistSummary {
  userId: string;
  totalCasesWatched: number;
  activeFollowUpsCount: number;
  items: CivicWatchlistItem[];
}
