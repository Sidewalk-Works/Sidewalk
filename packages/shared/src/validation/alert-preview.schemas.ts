import { z } from 'zod';

export const triggerReasonCodeSchema = z.enum([
  'subscribed_topic',
  'followed_case',
  'mentioned',
  'nearby_alert',
  'staff_assignment',
]);

export const explanationContextSchema = z.object({
  reasonCode: triggerReasonCodeSchema,
  topicName: z.string().optional(),
  caseTitle: z.string().optional(),
  distanceMiles: z.number().optional(),
});

export const alertPreviewPayloadSchema = z.object({
  notificationId: z.string().min(1),
  headline: z.string().min(1),
  previewBody: z.string().min(1),
  explanationCopy: z.string().min(1),
  context: explanationContextSchema,
});

export type AlertPreviewPayloadInput = z.infer<typeof alertPreviewPayloadSchema>;
