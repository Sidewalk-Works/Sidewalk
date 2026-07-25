export type ActivitySignalType = 'photo_added' | 'status_updated' | 'comment_posted' | 'city_response';

export interface PublicProgressEvent {
  eventId: string;
  caseId: string;
  caseTitle: string;
  signalType: ActivitySignalType;
  description: string;
  timestampIso: string;
}

export interface SignalFeedSummary {
  regionId: string;
  recentEvents: PublicProgressEvent[];
  lastUpdatedIso: string;
}
