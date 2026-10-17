export type DigestScheduleFrequency = 'daily' | 'weekly' | 'none';

export interface NotificationSummaryItem {
  id: string;
  title: string;
  snippet: string;
  type: string;
}

export interface DigestPayload {
  recipientId: string;
  frequency: DigestScheduleFrequency;
  items: NotificationSummaryItem[];
  generatedAtIso: string;
  totalUnreadCount: number;
}
