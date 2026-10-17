import { z } from 'zod';

export const moderationEventChannelsSchema = z.object({
  email: z.boolean().default(true),
  push: z.boolean().default(true),
  inApp: z.boolean().default(true),
});

export const notificationCategoryPreferencesSchema = z.object({
  reportStatusChanges: moderationEventChannelsSchema,
  moderationActions: moderationEventChannelsSchema,
  communityReplies: moderationEventChannelsSchema,
  neighborhoodAlerts: moderationEventChannelsSchema,
});

export const preferenceUpdatePayloadSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  preferences: notificationCategoryPreferencesSchema,
  updatedAtIso: z.string().min(1),
});

export type NotificationCategoryPreferencesInput = z.infer<typeof notificationCategoryPreferencesSchema>;
export type PreferenceUpdatePayloadInput = z.infer<typeof preferenceUpdatePayloadSchema>;
