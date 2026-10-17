export type DigestFrequency = 'daily' | 'weekly' | 'immediate';

export interface QuietHoursSchedule {
  isEnabled: boolean;
  startTimeWindow: string; // e.g. "22:00"
  endTimeWindow: string;   // e.g. "07:00"
  userTimezone: string;
}

export interface NotificationQuietRule {
  userId: string;
  schedule: QuietHoursSchedule;
  digestFrequency: DigestFrequency;
}
