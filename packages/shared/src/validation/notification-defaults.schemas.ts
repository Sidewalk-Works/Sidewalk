import { z } from 'zod';

export const notificationDefaultsSchema = z.object({
  email: z.boolean().default(false),
  push: z.boolean().default(false),
  inApp: z.boolean().default(true),
});

export const defaultPreferenceProfileSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  defaults: notificationDefaultsSchema,
  isOptInModel: z.boolean().default(true),
  appliedAtIso: z.string().min(1),
});

export const anonymousVisitorDefaultsSchema = z.object({
  defaults: notificationDefaultsSchema,
  sessionId: z.string().min(1, 'Session ID is required.'),
  assignedAtIso: z.string().min(1),
});

export type NotificationDefaultsInput = z.infer<typeof notificationDefaultsSchema>;
export type DefaultPreferenceProfileInput = z.infer<typeof defaultPreferenceProfileSchema>;
export type AnonymousVisitorDefaultsInput = z.infer<typeof anonymousVisitorDefaultsSchema>;
