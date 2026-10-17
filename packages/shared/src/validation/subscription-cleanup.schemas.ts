import { z } from 'zod';

export const cleanupTriggerSchema = z.enum([
  'report_closed',
  'report_merged',
  'report_archived',
  'manual',
]);

export const cleanupActionSchema = z.enum([
  'remove_subscription',
  'notify_subscriber',
  'log_only',
]);

export const subscriptionCleanupRuleSchema = z.object({
  ruleId: z.string().min(1),
  trigger: cleanupTriggerSchema,
  action: cleanupActionSchema,
  enabled: z.boolean().default(true),
  description: z.string().min(1),
  createdAtIso: z.string().min(1),
  lastRunAtIso: z.string().nullable().default(null),
  runCount: z.number().int().nonnegative().default(0),
});

export const subscriptionCleanupResultSchema = z.object({
  ruleId: z.string().min(1),
  trigger: cleanupTriggerSchema,
  removedCount: z.number().int().nonnegative(),
  notifiedCount: z.number().int().nonnegative(),
  executedAtIso: z.string().min(1),
});

export type SubscriptionCleanupRuleInput = z.infer<typeof subscriptionCleanupRuleSchema>;
export type SubscriptionCleanupResultInput = z.infer<typeof subscriptionCleanupResultSchema>;
