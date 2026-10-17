export interface NotificationDefaults {
  email: boolean;
  push: boolean;
  inApp: boolean;
}

export interface DefaultPreferenceProfile {
  userId: string;
  defaults: NotificationDefaults;
  isOptInModel: boolean;
  appliedAtIso: string;
}

export interface AnonymousVisitorDefaults {
  defaults: NotificationDefaults;
  sessionId: string;
  assignedAtIso: string;
}
