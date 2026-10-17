import { z } from 'zod';

export const notificationDeliveryChannelSchema = z.enum(['email', 'push', 'in_app', 'sms']);
export const dispatchStatusSchema = z.enum(['sent', 'failed', 'suppressed_quiet_hours']);

export const notificationAuditLogItemSchema = z.object({
  auditId: z.string().min(1, 'Audit ID is required.'),
  recipientId: z.string().min(1, 'Recipient ID is required.'),
  channel: notificationDeliveryChannelSchema,
  title: z.string().min(1),
  bodySnippet: z.string().max(300),
  status: dispatchStatusSchema,
  sentAtIso: z.string().min(1),
});

export type NotificationAuditLogItemInput = z.infer<typeof notificationAuditLogItemSchema>;
