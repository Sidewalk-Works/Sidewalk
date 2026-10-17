import { z } from 'zod';

export const subscriptionTargetSchema = z.enum(['reports', 'categories', 'locations']);
export const subscriptionScopeSchema = z.enum(['global', 'following', 'muted']);

export const subscriptionRuleSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  target: subscriptionTargetSchema,
  targetRef: z.string().min(1),
  scope: subscriptionScopeSchema,
  createdAtIso: z.string().min(1),
  updatedAtIso: z.string().min(1),
});

export const subscriptionRulePayloadSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  target: subscriptionTargetSchema,
  targetRef: z.string().min(1, 'Target reference is required.'),
  scope: subscriptionScopeSchema,
});

export type SubscriptionRuleInput = z.infer<typeof subscriptionRuleSchema>;
export type SubscriptionRulePayloadInput = z.infer<typeof subscriptionRulePayloadSchema>;
