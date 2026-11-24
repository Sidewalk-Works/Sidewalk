import type { PushRegistrationState } from './pushRegistrationService';
import {
  clearRegistration,
  getOptOutState,
  getStoredRegistration,
  saveRegistration,
  setOptOutState,
} from './pushRegistrationService';

export interface PushNotificationManagerConfig {
  onPermissionDenied?: () => void;
  onTokenRefreshed?: (newToken: string) => void;
  onOptOutChanged?: (optedOut: boolean) => void;
}

export class PushNotificationManager {
  constructor(private readonly config: PushNotificationManagerConfig = {}) {}

  getState(): PushRegistrationState | null {
    return getStoredRegistration();
  }

  isOptedOut(): boolean {
    return getOptOutState();
  }

  hasPermission(): boolean {
    if (typeof Notification === 'undefined') return false;
    return Notification.permission === 'granted';
  }

  refreshState(): PushRegistrationState | null {
    const state = getStoredRegistration();
    if (!state) return null;

    const permissionState = this.hasPermission() ? 'granted' : 'denied';
    if (permissionState === 'denied') {
      this.config.onPermissionDenied?.();
    }

    const updated: PushRegistrationState = {
      ...state,
      permissionState,
      optOut: getOptOutState(),
    };
    saveRegistration(updated);
    return updated;
  }

  setOptedOut(optedOut: boolean): void {
    setOptOutState(optedOut);
    const state = getStoredRegistration();
    if (state) {
      saveRegistration({ ...state, optOut: optedOut });
    }
    if (optedOut) {
      clearRegistration();
    }
    this.config.onOptOutChanged?.(optedOut);
  }

  handleTokenRefreshed(newToken: string): void {
    const state = getStoredRegistration();
    if (state) {
      saveRegistration({ ...state, deviceToken: newToken });
    }
    this.config.onTokenRefreshed?.(newToken);
  }
}
