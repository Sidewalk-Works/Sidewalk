import { z } from 'zod';

export const topicCategorySchema = z.enum(['neighborhood', 'issue_type', 'report']);

export const subscriptionFrequencySchema = z.enum(['realtime', 'daily_digest', 'weekly_digest', 'off']);

export const topicSubscriptionSchema = z.object({
  id: z.string().min(1, 'Subscription ID is required.'),
  userId: z.string().min(1, 'User ID is required.'),
  topicId: z.string().min(1, 'Topic ID is required.'),
  category: topicCategorySchema,
  label: z.string().min(1, 'Label is required.'),
  frequency: subscriptionFrequencySchema.default('realtime'),
  createdAtIso: z.string().min(1),
});

export const topicSubscriptionPreferenceSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  subscriptions: z.array(topicSubscriptionSchema),
  defaultFrequency: subscriptionFrequencySchema.default('realtime'),
});

export type TopicSubscriptionInput = z.infer<typeof topicSubscriptionSchema>;
export type TopicSubscriptionPreferenceInput = z.infer<typeof topicSubscriptionPreferenceSchema>;
