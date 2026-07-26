export type SubscriptionTarget = 'report' | 'category' | 'location';
export type SubscriptionPriority = 'all' | 'important' | 'none';

export interface SubscriptionRule {
  id: string;
  userId: string;
  target: SubscriptionTarget;
  targetId: string;
  priority: SubscriptionPriority;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionRuleInput {
  target: SubscriptionTarget;
  targetId: string;
  priority?: SubscriptionPriority;
}
