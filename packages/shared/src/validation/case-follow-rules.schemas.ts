import { z } from 'zod';

export const followTriggerConditionSchema = z.enum([
  'case_created',
  'new_comment',
  'status_change',
  'assigned_to_me',
  'mentioned_in_comment',
]);

export const followNotificationConfigSchema = z.object({
  onNewComment: z.boolean().default(true),
  onStatusChange: z.boolean().default(true),
  onAssignment: z.boolean().default(true),
  onMention: z.boolean().default(true),
});

export const caseFollowRuleSchema = z.object({
  ruleId: z.string().min(1),
  caseId: z.string().min(1),
  userId: z.string().min(1),
  triggerCondition: followTriggerConditionSchema,
  notificationConfig: followNotificationConfigSchema,
  isActive: z.boolean().default(true),
  createdAtIso: z.string().min(1),
  updatedAtIso: z.string().min(1),
});

export const caseFollowRulesStateSchema = z.object({
  rules: z.array(caseFollowRuleSchema),
  userId: z.string().min(1),
});

export type FollowTriggerConditionInput = z.infer<typeof followTriggerConditionSchema>;
export type FollowNotificationConfigInput = z.infer<typeof followNotificationConfigSchema>;
export type CaseFollowRuleInput = z.infer<typeof caseFollowRuleSchema>;
export type CaseFollowRulesStateInput = z.infer<typeof caseFollowRulesStateSchema>;
