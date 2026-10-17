export interface PushRegistrationData {
  deviceToken: string;
  platform: 'ios' | 'android' | 'web';
  optIn: boolean;
  registeredAtIso: string;
}
