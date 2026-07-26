import { z } from 'zod';

export const deliveryChannelSchema = z.enum(['email', 'push', 'on_site']);

export const deliveryChannelConfigSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  email: z.boolean().default(true),
  push: z.boolean().default(true),
  onSite: z.boolean().default(true),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:mm)').optional(),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:mm)').optional(),
  digestFrequency: z.enum(['daily', 'weekly', 'never']).optional(),
});

export const updateDeliveryChannelInputSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  onSite: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:mm)').optional(),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:mm)').optional(),
  digestFrequency: z.enum(['daily', 'weekly', 'never']).optional(),
});

export type DeliveryChannelConfigInput = z.infer<typeof deliveryChannelConfigSchema>;
export type UpdateDeliveryChannelInputType = z.infer<typeof updateDeliveryChannelInputSchema>;
