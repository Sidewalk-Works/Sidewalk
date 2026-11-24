export type NotificationType =
  | "report_status_changed"
  | "case_assigned"
  | "case_escalated"
  | "system";

/** Matches the API notification response shape. */
export interface InAppNotificationItem {
  id: string;
  user_id: string;
  type: NotificationType | string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
  updated_at: string;
  /** Legacy client-only fields kept for compatibility. */
  recipientUserId?: string;
  category?: "status_change" | "comment_reply" | "moderation" | "system";
  title?: string;
  body?: string;
  actionUrl?: string;
  isRead?: boolean;
  createdAtIso?: string;
}

export interface NotificationInboxFilter {
  category?: string;
  onlyUnread?: boolean;
  limit?: number;
}
