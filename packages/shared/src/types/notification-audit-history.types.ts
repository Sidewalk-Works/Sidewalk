export type NotificationDeliveryChannel = 'email' | 'push' | 'in_app' | 'sms';
export type DispatchStatus = 'sent' | 'failed' | 'suppressed_quiet_hours';

export interface NotificationAuditLogItem {
  auditId: string;
  recipientId: string;
  channel: NotificationDeliveryChannel;
  title: string;
  bodySnippet: string;
  status: DispatchStatus;
  sentAtIso: string;
}

export interface AuditHistoryQueryOptions {
  recipientId: string;
  channel?: NotificationDeliveryChannel;
  limit?: number;
}
