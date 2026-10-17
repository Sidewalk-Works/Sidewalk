export type ReportLifecycleStage = 'submitted' | 'under_investigation' | 'work_scheduled' | 'resolved' | 'archived';

export interface TriggerRuleCondition {
  stage: ReportLifecycleStage;
  notifyAuthor: boolean;
  notifySubscribers: boolean;
  requiresUrgentAlert: boolean;
}

export interface LifecycleTriggerEvaluationPayload {
  reportId: string;
  previousStage: ReportLifecycleStage;
  newStage: ReportLifecycleStage;
  ruleApplied: TriggerRuleCondition;
  evaluatedAtIso: string;
}
