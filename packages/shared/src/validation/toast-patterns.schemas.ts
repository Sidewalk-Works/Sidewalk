import { z } from 'zod';

export const statusChangeContextSchema = z.object({
  caseId: z.string().min(1),
  oldStatus: z.string().min(1),
  newStatus: z.string().min(1),
  updatedBy: z.string().min(1),
});

export const toastNotificationSchema = z.object({
  toastId: z.string().min(1),
  type: z.enum(['info', 'success', 'warning', 'error']),
  title: z.string().min(1),
  message: z.string().min(1),
  context: statusChangeContextSchema.optional(),
  durationMs: z.number().int().min(1000).default(5000),
});

export const bannerAlertSchema = z.object({
  bannerId: z.string().min(1),
  isDismissible: z.boolean().default(true),
  content: z.string().min(1),
  actionUrl: z.string().url().optional(),
});

export type ToastNotificationInput = z.infer<typeof toastNotificationSchema>;
export type BannerAlertInput = z.infer<typeof bannerAlertSchema>;
