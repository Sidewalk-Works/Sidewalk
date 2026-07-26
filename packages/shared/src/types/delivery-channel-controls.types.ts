export type DeliveryChannel = 'email' | 'push' | 'on_site';
export type ChannelEnabled = boolean;

export interface DeliveryChannelConfig {
  userId: string;
  email: ChannelEnabled;
  push: ChannelEnabled;
  onSite: ChannelEnabled;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  digestFrequency?: 'daily' | 'weekly' | 'never';
}

export interface UpdateDeliveryChannelInput {
  email?: ChannelEnabled;
  push?: ChannelEnabled;
  onSite?: ChannelEnabled;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  digestFrequency?: 'daily' | 'weekly' | 'never';
}
