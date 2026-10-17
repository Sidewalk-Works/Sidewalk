export type FollowTriggerCondition =
  | 'case_created'
  | 'new_comment'
  | 'status_change'
  | 'assigned_to_me'
  | 'mentioned_in_comment';

export interface FollowNotificationConfig {
  onNewComment: boolean;
  onStatusChange: boolean;
  onAssignment: boolean;
  onMention: boolean;
}

export interface CaseFollowRule {
  ruleId: string;
  caseId: string;
  userId: string;
  triggerCondition: FollowTriggerCondition;
  notificationConfig: FollowNotificationConfig;
  isActive: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CaseFollowRulesState {
  rules: CaseFollowRule[];
  userId: string;
}
