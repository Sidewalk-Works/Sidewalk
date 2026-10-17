import { z } from 'zod';

export const channelOverridesSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  inApp: z.boolean().optional(),
});

export const deliveryChannelPreferencesSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  defaultChannels: channelOverridesSchema.default({ email: true, push: true, inApp: true }),
  urgentChannels: channelOverridesSchema.default({ email: true, push: true, inApp: true }),
  digestFrequency: z.enum(['daily', 'weekly', 'none']).default('none'),
});

export const alertDeliveryPayloadSchema = z.object({
  alertId: z.string().min(1),
  recipientId: z.string().min(1),
  targetChannels: z.array(z.string()),
  payloadTimestamp: z.string().min(1),
});

export type ChannelOverridesInput = z.infer<typeof channelOverridesSchema>;
export type DeliveryChannelPreferencesInput = z.infer<typeof deliveryChannelPreferencesSchema>;
