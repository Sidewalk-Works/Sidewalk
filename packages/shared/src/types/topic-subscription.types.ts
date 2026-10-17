export type TopicType = 'neighborhood' | 'category' | 'report';
export type SubscriptionFrequency = 'instant' | 'daily' | 'weekly' | 'never';

export interface TopicSubscription {
  id: string;
  userId: string;
  topicType: TopicType;
  topicId: string;
  frequency: SubscriptionFrequency;
  createdAt: Date;
}

export interface TopicSubscriptionPreference {
  defaultFrequency: SubscriptionFrequency;
  overrides: TopicSubscription[];
}
