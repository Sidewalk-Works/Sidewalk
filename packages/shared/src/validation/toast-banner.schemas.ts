import { z } from 'zod';

export const notificationLevelSchema = z.enum(['info', 'success', 'warning', 'error']);

export const toastNotificationMessageSchema = z.object({
  id: z.string().min(1, 'Notification ID is required.'),
  level: notificationLevelSchema,
  title: z.string().min(1, 'Title is required.'),
  message: z.string().min(1, 'Message is required.'),
  autoDismissMs: z.number().int().positive().optional(),
});

export const bannerNotificationTypeSchema = z.object({
  bannerId: z.string().min(1),
  level: notificationLevelSchema,
  heading: z.string().min(1),
  body: z.string().min(1),
  actionText: z.string().optional(),
  actionUrl: z.string().optional(),
});

export type ToastNotificationMessageInput = z.infer<typeof toastNotificationMessageSchema>;
export type BannerNotificationTypeInput = z.infer<typeof bannerNotificationTypeSchema>;
