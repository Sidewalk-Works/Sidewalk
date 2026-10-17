import { z } from 'zod';

export const deduplicationRuleOptionsSchema = z.object({
  groupingWindowMinutes: z.number().int().positive().default(60),
  maxEventsPerGroup: z.number().int().positive().default(50),
});

export const groupedCaseNotificationSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required.'),
  caseId: z.string().min(1, 'Case ID is required.'),
  caseTitle: z.string().min(1),
  updateCount: z.number().int().positive(),
  latestMessage: z.string().min(1),
  participantCount: z.number().int().min(1),
  firstEventAtIso: z.string().min(1),
  lastEventAtIso: z.string().min(1),
});

export type DeduplicationRuleOptionsInput = z.infer<typeof deduplicationRuleOptionsSchema>;
export type GroupedCaseNotificationInput = z.infer<typeof groupedCaseNotificationSchema>;
