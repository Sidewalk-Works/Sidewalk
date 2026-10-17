export type ReminderFrequency = 'daily' | 'weekly' | 'monthly';

export interface StaleReportReminder {
  reminderId: string;
  reportId: string;
  recipientId: string;
  createdAtIso: string;
  lastSentAtIso: string | null;
  acknowledgedAtIso: string | null;
  snoozedUntilIso: string | null;
  frequency: ReminderFrequency;
  dismissed: boolean;
}

export interface ReminderConfig {
  enabled: boolean;
  defaultFrequency: ReminderFrequency;
  staleAfterDays: number;
  maxReminders: number;
  channels: ('email' | 'push' | 'in_app')[];
}
