import { z } from 'zod';

export const signalThemeSchema = z.enum(['default', 'highlight', 'urgent']);

export const refinedProgressEventSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  theme: signalThemeSchema.default('default'),
  publishedAtIso: z.string().min(1),
});

export const activityFeedStateSchema = z.object({
  events: z.array(refinedProgressEventSchema),
  lastPolledIso: z.string().min(1),
  isLive: z.boolean().default(true),
});

export type RefinedProgressEventInput = z.infer<typeof refinedProgressEventSchema>;
export type ActivityFeedStateInput = z.infer<typeof activityFeedStateSchema>;
