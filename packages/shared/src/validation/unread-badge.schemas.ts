import { z } from 'zod';

export const unreadBadgeStateSchema = z.object({
  totalUnread: z.number().int().min(0),
  caseUpdatesUnread: z.number().int().min(0),
  moderationUnread: z.number().int().min(0),
  directRepliesUnread: z.number().int().min(0),
  hasUrgentUnread: z.boolean().default(false),
});

export const notificationReadStateUpdateSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  readNotificationIds: z.array(z.string()).optional(),
  markAllAsRead: z.boolean().optional(),
  updatedAtIso: z.string().min(1),
});

export type UnreadBadgeStateInput = z.infer<typeof unreadBadgeStateSchema>;
export type NotificationReadStateUpdateInput = z.infer<typeof notificationReadStateUpdateSchema>;
