export type TopicCategory = 'neighborhood' | 'issue_type' | 'report';
export type SubscriptionFrequency = 'realtime' | 'daily_digest' | 'weekly_digest' | 'off';

export interface TopicSubscription {
  id: string;
  userId: string;
  topicId: string;
  category: TopicCategory;
  label: string;
  frequency: SubscriptionFrequency;
  createdAtIso: string;
}

export interface TopicSubscriptionPreference {
  userId: string;
  subscriptions: TopicSubscription[];
  defaultFrequency: SubscriptionFrequency;
}
