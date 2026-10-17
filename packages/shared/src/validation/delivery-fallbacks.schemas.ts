import { z } from 'zod';

export const channelSchema = z.enum(['email', 'push', 'inApp']);

export const deliveryFallbackStrategySchema = z.object({
  primaryChannel: channelSchema,
  fallbackOrder: z.array(channelSchema),
  maxRetries: z.number().int().min(1).max(5).default(3),
  backoffBaseMs: z.number().int().min(100).default(1000),
});

export const fallbackAttemptSchema = z.object({
  attemptId: z.string().min(1, 'Attempt ID is required.'),
  notificationId: z.string().min(1, 'Notification ID is required.'),
  channel: channelSchema,
  status: z.enum(['pending', 'success', 'failed']),
  attemptedAtIso: z.string().min(1),
  error: z.string().optional(),
});

export const deliveryFailureLogSchema = z.object({
  logId: z.string().min(1, 'Log ID is required.'),
  notificationId: z.string().min(1, 'Notification ID is required.'),
  strategy: deliveryFallbackStrategySchema,
  attempts: z.array(fallbackAttemptSchema),
  finalStatus: z.enum(['delivered', 'failed_all']),
  completedAtIso: z.string().min(1),
});

export type DeliveryFallbackStrategyInput = z.infer<typeof deliveryFallbackStrategySchema>;
export type FallbackAttemptInput = z.infer<typeof fallbackAttemptSchema>;
export type DeliveryFailureLogInput = z.infer<typeof deliveryFailureLogSchema>;
