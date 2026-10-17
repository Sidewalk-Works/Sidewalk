import { z } from 'zod';

export const digestScheduleFrequencySchema = z.enum(['daily', 'weekly', 'none']);

export const notificationSummaryItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string().min(1),
  type: z.string().min(1),
});

export const digestPayloadSchema = z.object({
  recipientId: z.string().min(1),
  frequency: digestScheduleFrequencySchema,
  items: z.array(notificationSummaryItemSchema),
  generatedAtIso: z.string().min(1),
  totalUnreadCount: z.number().int().min(0),
});

export type DigestPayloadInput = z.infer<typeof digestPayloadSchema>;
