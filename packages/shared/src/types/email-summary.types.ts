export type DigestFrequency = 'daily' | 'weekly';

export interface EmailDigestConfig {
  userId: string;
  frequency: DigestFrequency;
  enabled: boolean;
  lastSentAt?: Date;
  timezone: string;
}

export interface DigestContent {
  subject: string;
  summary: string;
  reportUpdates: DigestReportUpdate[];
  topActivity: string[];
  generatedAt: Date;
}

export interface DigestReportUpdate {
  reportId: string;
  reportTitle: string;
  updateCount: number;
  latestUpdate: Date;
}
