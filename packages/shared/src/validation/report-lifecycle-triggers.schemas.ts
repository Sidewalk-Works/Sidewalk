import { z } from 'zod';

export const reportLifecycleStageSchema = z.enum([
  'submitted',
  'under_investigation',
  'work_scheduled',
  'resolved',
  'archived',
]);

export const triggerRuleConditionSchema = z.object({
  stage: reportLifecycleStageSchema,
  notifyAuthor: z.boolean().default(true),
  notifySubscribers: z.boolean().default(true),
  requiresUrgentAlert: z.boolean().default(false),
});

export const lifecycleTriggerEvaluationPayloadSchema = z.object({
  reportId: z.string().min(1, 'Report ID is required.'),
  previousStage: reportLifecycleStageSchema,
  newStage: reportLifecycleStageSchema,
  ruleApplied: triggerRuleConditionSchema,
  evaluatedAtIso: z.string().min(1),
});

export type TriggerRuleConditionInput = z.infer<typeof triggerRuleConditionSchema>;
export type LifecycleTriggerEvaluationPayloadInput = z.infer<typeof lifecycleTriggerEvaluationPayloadSchema>;
