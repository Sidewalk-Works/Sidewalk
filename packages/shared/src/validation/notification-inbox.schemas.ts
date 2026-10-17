import { z } from 'zod';

export const inAppNotificationItemSchema = z.object({
  id: z.string().min(1, 'Notification ID is required.'),
  recipientUserId: z.string().min(1, 'Recipient user ID is required.'),
  category: z.enum(['status_change', 'comment_reply', 'moderation', 'system']),
  title: z.string().min(1),
  body: z.string().min(1),
  actionUrl: z.string().optional(),
  isRead: z.boolean().default(false),
  createdAtIso: z.string().min(1),
});

export type InAppNotificationItemInput = z.infer<typeof inAppNotificationItemSchema>;
