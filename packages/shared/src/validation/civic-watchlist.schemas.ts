import { z } from 'zod';

export const caseFollowUpStatusSchema = z.enum([
  'active_review',
  'pending_city_response',
  'resolved',
  'stale',
]);

export const priorityLevelSchema = z.enum(['high', 'medium', 'low']);

export const civicWatchlistItemSchema = z.object({
  caseId: z.string().min(1, 'Case ID is required.'),
  title: z.string().min(1, 'Case title is required.'),
  neighborhood: z.string().min(1),
  category: z.string().min(1),
  followUpStatus: caseFollowUpStatusSchema,
  priority: priorityLevelSchema.default('medium'),
  lastActivityAtIso: z.string().min(1),
  addedAtIso: z.string().min(1),
});

export const watchlistSummarySchema = z.object({
  userId: z.string().min(1),
  totalCasesWatched: z.number().int().min(0),
  activeFollowUpsCount: z.number().int().min(0),
  items: z.array(civicWatchlistItemSchema),
});

export type CivicWatchlistItemInput = z.infer<typeof civicWatchlistItemSchema>;
export type WatchlistSummaryInput = z.infer<typeof watchlistSummarySchema>;
