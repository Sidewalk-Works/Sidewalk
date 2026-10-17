import { z } from 'zod';

export const digestFrequencySchema = z.enum(['daily', 'weekly', 'immediate']);

export const quietHoursScheduleSchema = z.object({
  isEnabled: z.boolean().default(true),
  startTimeWindow: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid start time format (HH:mm)'),
  endTimeWindow: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid end time format (HH:mm)'),
  userTimezone: z.string().default('UTC'),
});

export const notificationQuietRuleSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  schedule: quietHoursScheduleSchema,
  digestFrequency: digestFrequencySchema.default('daily'),
});

export type QuietHoursScheduleInput = z.infer<typeof quietHoursScheduleSchema>;
export type NotificationQuietRuleInput = z.infer<typeof notificationQuietRuleSchema>;
