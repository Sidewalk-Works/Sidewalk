export type SubscriptionTarget = 'reports' | 'categories' | 'locations';
export type SubscriptionScope = 'global' | 'following' | 'muted';

export interface SubscriptionRule {
  id: string;
  userId: string;
  target: SubscriptionTarget;
  targetRef: string;
  scope: SubscriptionScope;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SubscriptionRulePayload {
  userId: string;
  target: SubscriptionTarget;
  targetRef: string;
  scope: SubscriptionScope;
}
