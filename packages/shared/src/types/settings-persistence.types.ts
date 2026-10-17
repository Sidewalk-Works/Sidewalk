export interface DeviceNotificationConfig {
  deviceId: string;
  deviceOs: 'ios' | 'android' | 'web';
  pushToken?: string;
  isPushEnabled: boolean;
}

export interface PersistentUserSettings {
  userId: string;
  emailDigestEnabled: boolean;
  pushAlertsEnabled: boolean;
  devices: DeviceNotificationConfig[];
  lastSyncedAtIso: string;
}

export interface SyncSettingsPayload {
  userId: string;
  settings: PersistentUserSettings;
}
