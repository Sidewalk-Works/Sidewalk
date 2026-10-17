export interface ChannelOverrides {
  email?: boolean;
  push?: boolean;
  inApp?: boolean;
}

export interface DeliveryChannelPreferences {
  userId: string;
  defaultChannels: ChannelOverrides;
  urgentChannels: ChannelOverrides;
  digestFrequency: 'daily' | 'weekly' | 'none';
}

export interface AlertDeliveryPayload {
  alertId: string;
  recipientId: string;
  targetChannels: string[];
  payloadTimestamp: string;
}
