import { z } from 'zod';

export const activitySignalTypeSchema = z.enum([
  'photo_added',
  'status_updated',
  'comment_posted',
  'city_response',
]);

export const publicProgressEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required.'),
  caseId: z.string().min(1, 'Case ID is required.'),
  caseTitle: z.string().min(1),
  signalType: activitySignalTypeSchema,
  description: z.string().min(1),
  timestampIso: z.string().min(1),
});

export const signalFeedSummarySchema = z.object({
  regionId: z.string().min(1),
  recentEvents: z.array(publicProgressEventSchema),
  lastUpdatedIso: z.string().min(1),
});

export type PublicProgressEventInput = z.infer<typeof publicProgressEventSchema>;
export type SignalFeedSummaryInput = z.infer<typeof signalFeedSummarySchema>;
