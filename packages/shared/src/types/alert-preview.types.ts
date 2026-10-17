export type TriggerReasonCode = 'subscribed_topic' | 'followed_case' | 'mentioned' | 'nearby_alert' | 'staff_assignment';

export interface ExplanationContext {
  reasonCode: TriggerReasonCode;
  topicName?: string;
  caseTitle?: string;
  distanceMiles?: number;
}

export interface AlertPreviewPayload {
  notificationId: string;
  headline: string;
  previewBody: string;
  explanationCopy: string;
  context: ExplanationContext;
}
