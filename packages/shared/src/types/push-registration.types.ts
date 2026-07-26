export type PushPlatform = 'ios' | 'android' | 'web';

export interface PushRegistration {
  id: string;
  userId: string;
  token: string;
  platform: PushPlatform;
  enabled: boolean;
  registeredAt: Date;
  lastActiveAt: Date;
}

export interface PushOptOutRequest {
  registrationId: string;
  reason?: string;
}
