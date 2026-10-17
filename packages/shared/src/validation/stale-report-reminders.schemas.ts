import { z } from 'zod';

export const reminderFrequencySchema = z.enum(['daily', 'weekly', 'monthly']);

export const staleReportReminderSchema = z.object({
  reminderId: z.string().min(1),
  reportId: z.string().min(1),
  recipientId: z.string().min(1),
  createdAtIso: z.string().min(1),
  lastSentAtIso: z.string().nullable().default(null),
  acknowledgedAtIso: z.string().nullable().default(null),
  snoozedUntilIso: z.string().nullable().default(null),
  frequency: reminderFrequencySchema,
  dismissed: z.boolean().default(false),
});

export const reminderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultFrequency: reminderFrequencySchema.default('weekly'),
  staleAfterDays: z.number().int().positive().default(7),
  maxReminders: z.number().int().positive().default(5),
  channels: z.array(z.enum(['email', 'push', 'in_app'])).default(['in_app']),
});

export type StaleReportReminderInput = z.infer<typeof staleReportReminderSchema>;
export type ReminderConfigInput = z.infer<typeof reminderConfigSchema>;
