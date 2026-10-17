export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface ToastNotificationMessage {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  autoDismissMs?: number;
}

export interface BannerNotificationType {
  bannerId: string;
  level: NotificationLevel;
  heading: string;
  body: string;
  actionText?: string;
  actionUrl?: string;
}

export interface RealtimeStatusPayload {
  caseId: string;
  newStatus: string;
  updatedAtIso: string;
  toast: ToastNotificationMessage;
}
