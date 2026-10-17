import type { PushRegistrationState } from './pushRegistrationService';
import {
  getStoredRegistration,
  saveRegistration,
  getOptOutState,
  setOptOutState,
  clearRegistration,
} from './pushRegistrationService';

export interface PushNotificationManagerConfig {
  apiBaseUrl?: string;
  onPermissionDenied?: () => void;
  onTokenRefreshed?: (newToken: string) => void;
  onOptOutChanged?: (optedOut: boolean) => void;
}

export interface PushNotificationManager {
  getState(): PushRegistrationState | null;
  isOptedOut(): boolean;
  hasPermission(): boolean;
  refreshState(): PushRegistrationState | null;
}

export function createPushNotificationManager(
  config: PushNotificationManagerConfig = {},
): PushNotificationManager {
  function getState(): PushRegistrationState | null {
    return getStoredRegistration();
  }

  function isOptedOut(): boolean {
    return getOptOutState();
  }

  function hasPermission(): boolean {
    if (typeof Notification === 'undefined') return false;
    return Notification.permission === 'granted';
  }

  function refreshState(): PushRegistrationState | null {
    const state = getStoredRegistration();
    if (!state) return null;

    const currentPermission = hasPermission() ? 'granted' : state.permissionState;
    const updated: PushRegistrationState = {
      ...state,
      permissionState: currentPermission,
      optOut: getOptOutState(),
    };

    saveRegistration(updated);
    return updated;
  }

  function handlePermissionDenied(): void {
    config.onPermissionDenied?.();
  }

  return {
    getState,
    isOptedOut,
    hasPermission,
    refreshState,
  };
}
