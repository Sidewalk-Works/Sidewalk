import type { PushRegistrationData } from '@sidewalk/shared';

export type PushPermissionStatus = 'granted' | 'denied' | 'default';

export interface PushRegistrationResult {
  success: boolean;
  deviceToken?: string;
  error?: string;
  permissionState: PushPermissionStatus;
}

export interface PushRegistrationState {
  isRegistered: boolean;
  deviceToken: string | null;
  platform: 'ios' | 'android' | 'web';
  permissionState: PushPermissionStatus;
  registeredAtIso: string | null;
  optOut: boolean;
}

const STORAGE_KEY = 'sidewalk_push_registration_v1';
const OPT_OUT_KEY = 'sidewalk_push_opt_out_v1';

export function getStoredRegistration(): PushRegistrationState | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PushRegistrationState;
  } catch {
    return null;
  }
}

export function saveRegistration(state: PushRegistrationState): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function clearRegistration(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(OPT_OUT_KEY);
  }
}

export function getOptOutState(): boolean {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(OPT_OUT_KEY) === 'true';
  }
  return false;
}

export function setOptOutState(optedOut: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(OPT_OUT_KEY, String(optedOut));
  }
}

function detectPlatform(): 'ios' | 'android' | 'web' {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'web';
}

export async function requestPushPermission(): Promise<PushPermissionStatus> {
  if (typeof Notification === 'undefined') return 'default';
  try {
    const result = await Notification.requestPermission();
    return result as PushPermissionStatus;
  } catch {
    return 'default';
  }
}

export function buildPushRegistrationData(
  deviceToken: string,
  platform: 'ios' | 'android' | 'web',
): PushRegistrationData {
  return {
    deviceToken,
    platform,
    optIn: true,
    registeredAtIso: new Date().toISOString(),
  };
}

export function buildInitialState(
  token: string,
  permissionState: PushPermissionStatus,
): PushRegistrationState {
  return {
    isRegistered: true,
    deviceToken: token,
    platform: detectPlatform(),
    permissionState,
    registeredAtIso: new Date().toISOString(),
    optOut: false,
  };
}

export async function registerDevice(
  deviceToken: string,
  apiRegisterFn?: (data: PushRegistrationData) => Promise<void>,
): Promise<PushRegistrationResult> {
  const permissionState = await requestPushPermission();
  const platform = detectPlatform();
  const data = buildPushRegistrationData(deviceToken, platform);

  try {
    if (apiRegisterFn) {
      await apiRegisterFn(data);
    }

    const state = buildInitialState(deviceToken, permissionState);
    saveRegistration(state);
    setOptOutState(false);

    return {
      success: true,
      deviceToken,
      permissionState,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    return {
      success: false,
      error: message,
      permissionState,
    };
  }
}

export async function unregisterDevice(
  apiUnregisterFn?: (deviceToken: string) => Promise<void>,
): Promise<{ success: boolean; error?: string }> {
  const stored = getStoredRegistration();
  if (!stored?.deviceToken) {
    return { success: false, error: 'No device registered' };
  }

  try {
    if (apiUnregisterFn) {
      await apiUnregisterFn(stored.deviceToken);
    }
    clearRegistration();
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unregister failed';
    return { success: false, error: message };
  }
}

export function optOut(apiOptOutFn?: (optedOut: boolean) => Promise<void>): void {
  setOptOutState(true);
  const stored = getStoredRegistration();
  if (stored) {
    saveRegistration({ ...stored, optOut: true });
  }
  apiOptOutFn?.(true);
}

export function optIn(apiOptInFn?: (optedOut: boolean) => Promise<void>): void {
  setOptOutState(false);
  const stored = getStoredRegistration();
  if (stored) {
    saveRegistration({ ...stored, optOut: false });
  }
  apiOptInFn?.(false);
}
