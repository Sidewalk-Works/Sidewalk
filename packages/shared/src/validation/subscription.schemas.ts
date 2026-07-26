import { z } from 'zod';

export const subscriptionTargetSchema = z.enum(['report', 'category', 'location']);
export const subscriptionPrioritySchema = z.enum(['all', 'important', 'none']);

export const subscriptionRuleSchema = z.object({
  id: z.string().min(1, 'Rule ID is required.'),
  userId: z.string().min(1, 'User ID is required.'),
  target: subscriptionTargetSchema,
  targetId: z.string().min(1, 'Target ID is required.'),
  priority: subscriptionPrioritySchema.default('all'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createSubscriptionRuleInputSchema = z.object({
  target: subscriptionTargetSchema,
  targetId: z.string().min(1, 'Target ID is required.'),
  priority: subscriptionPrioritySchema.default('all'),
});

export type SubscriptionRuleInput = z.infer<typeof subscriptionRuleSchema>;
export type CreateSubscriptionRuleInputType = z.infer<typeof createSubscriptionRuleInputSchema>;
