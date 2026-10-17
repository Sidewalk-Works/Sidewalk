export interface ModerationEventChannels {
  email: boolean;
  push: boolean;
  inApp: boolean;
}

export interface NotificationCategoryPreferences {
  reportStatusChanges: ModerationEventChannels;
  moderationActions: ModerationEventChannels;
  communityReplies: ModerationEventChannels;
  neighborhoodAlerts: ModerationEventChannels;
}

export interface PreferenceUpdatePayload {
  userId: string;
  preferences: NotificationCategoryPreferences;
  updatedAtIso: string;
}
