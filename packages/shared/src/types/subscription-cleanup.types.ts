export type CleanupTrigger = 'report_closed' | 'report_merged' | 'report_archived' | 'manual';
export type CleanupAction = 'remove_subscription' | 'notify_subscriber' | 'log_only';

export interface SubscriptionCleanupRule {
  ruleId: string;
  trigger: CleanupTrigger;
  action: CleanupAction;
  enabled: boolean;
  description: string;
  createdAtIso: string;
  lastRunAtIso: string | null;
  runCount: number;
}

export interface SubscriptionCleanupResult {
  ruleId: string;
  trigger: CleanupTrigger;
  removedCount: number;
  notifiedCount: number;
  executedAtIso: string;
}
