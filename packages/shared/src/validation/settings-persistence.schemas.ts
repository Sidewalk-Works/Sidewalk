import { z } from 'zod';

export const deviceNotificationConfigSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required.'),
  deviceOs: z.enum(['ios', 'android', 'web']),
  pushToken: z.string().optional(),
  isPushEnabled: z.boolean().default(true),
});

export const persistentUserSettingsSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  emailDigestEnabled: z.boolean().default(true),
  pushAlertsEnabled: z.boolean().default(true),
  devices: z.array(deviceNotificationConfigSchema).default([]),
  lastSyncedAtIso: z.string().min(1),
});

export type PersistentUserSettingsInput = z.infer<typeof persistentUserSettingsSchema>;
