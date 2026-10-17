export type TriggerReasonCategory = 'report_author' | 'subscribed_category' | 'neighborhood_proximity' | 'community_mention';

export interface ExplainerCopyOptions {
  category: TriggerReasonCategory;
  caseTitle: string;
  locationName?: string;
}

export interface AlertPreviewPayload {
  previewId: string;
  headline: string;
  bodySnippet: string;
  explainerCopy: string;
  category: TriggerReasonCategory;
  generatedAtIso: string;
}
