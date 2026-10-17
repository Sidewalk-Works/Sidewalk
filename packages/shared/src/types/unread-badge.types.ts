export interface UnreadBadgeState {
  totalUnread: number;
  caseUpdatesUnread: number;
  moderationUnread: number;
  directRepliesUnread: number;
  hasUrgentUnread: boolean;
}

export interface UnreadBadgeStateByCategory {
  totalUnread: number;
  byCategory: Record<string, number>;
  lastChecked: Date;
}

export interface UnreadBadgeUpdate {
  notificationId: string;
  read: boolean;
}

export interface NotificationReadStateUpdate {
  userId: string;
  readNotificationIds?: string[];
  markAllAsRead?: boolean;
  updatedAtIso: string;
}
