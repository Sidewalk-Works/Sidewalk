export type ActivitySignalType = 'report_created' | 'report_updated' | 'moderation_action' | 'status_change' | 'comment_added';

export interface ActivitySignal {
  id: string;
  type: ActivitySignalType;
  actorName: string;
  caseId: string;
  caseTitle: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ActivitySignalFeed {
  signals: ActivitySignal[];
  hasMore: boolean;
  cursor?: string;
}
