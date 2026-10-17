export interface InAppNotificationItem {
  id: string;
  recipientUserId: string;
  category: 'status_change' | 'comment_reply' | 'moderation' | 'system';
  title: string;
  body: string;
  actionUrl?: string;
  isRead: boolean;
  createdAtIso: string;
}

export interface NotificationInboxFilter {
  category?: string;
  onlyUnread?: boolean;
  limit?: number;
}
