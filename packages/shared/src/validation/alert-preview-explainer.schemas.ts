import { z } from 'zod';

export const triggerReasonCategorySchema = z.enum([
  'report_author',
  'subscribed_category',
  'neighborhood_proximity',
  'community_mention',
]);

export const alertPreviewPayloadSchema = z.object({
  previewId: z.string().min(1, 'Preview ID is required.'),
  headline: z.string().min(1),
  bodySnippet: z.string().min(1),
  explainerCopy: z.string().min(1),
  category: triggerReasonCategorySchema,
  generatedAtIso: z.string().min(1),
});

export type AlertPreviewPayloadInput = z.infer<typeof alertPreviewPayloadSchema>;
