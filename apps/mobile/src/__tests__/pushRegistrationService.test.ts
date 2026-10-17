const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import {
  getStoredRegistration,
  saveRegistration,
  clearRegistration,
  getOptOutState,
  setOptOutState,
  buildPushRegistrationData,
  buildInitialState,
  registerDevice,
  unregisterDevice,
  optOut,
  optIn,
  type PushRegistrationState,
} from '../services/pushRegistrationService';

const mockState: PushRegistrationState = {
  isRegistered: true,
  deviceToken: 'test-token-123',
  platform: 'web',
  permissionState: 'granted',
  registeredAtIso: '2026-01-15T10:00:00.000Z',
  optOut: false,
};

describe('pushRegistrationService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and retrieves registration state', () => {
    saveRegistration(mockState);
    const stored = getStoredRegistration();
    expect(stored).toEqual(mockState);
  });

  it('returns null when no registration exists', () => {
    expect(getStoredRegistration()).toBeNull();
  });

  it('clears registration', () => {
    saveRegistration(mockState);
    clearRegistration();
    expect(getStoredRegistration()).toBeNull();
  });

  it('manages opt-out state independently', () => {
    expect(getOptOutState()).toBe(false);
    setOptOutState(true);
    expect(getOptOutState()).toBe(true);
    setOptOutState(false);
    expect(getOptOutState()).toBe(false);
  });

  it('builds push registration data correctly', () => {
    const data = buildPushRegistrationData('token-abc', 'ios');
    expect(data.deviceToken).toBe('token-abc');
    expect(data.platform).toBe('ios');
    expect(data.optIn).toBe(true);
    expect(data.registeredAtIso).toBeTruthy();
  });

  it('builds initial state with correct defaults', () => {
    const state = buildInitialState('device-token', 'granted');
    expect(state.isRegistered).toBe(true);
    expect(state.deviceToken).toBe('device-token');
    expect(state.permissionState).toBe('granted');
    expect(state.optOut).toBe(false);
  });

  it('registers device successfully', async () => {
    const apiFn = jest.fn().mockResolvedValue(undefined);
    const result = await registerDevice('token-xyz', apiFn);
    expect(result.success).toBe(true);
    expect(result.deviceToken).toBe('token-xyz');
    expect(apiFn).toHaveBeenCalledTimes(1);
  });

  it('handles registration failure', async () => {
    const apiFn = jest.fn().mockRejectedValue(new Error('Network error'));
    const result = await registerDevice('token-xyz', apiFn);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('unregisters device successfully', async () => {
    saveRegistration(mockState);
    const apiFn = jest.fn().mockResolvedValue(undefined);
    const result = await unregisterDevice(apiFn);
    expect(result.success).toBe(true);
    expect(getStoredRegistration()).toBeNull();
  });

  it('returns error when unregistering with no device', async () => {
    const result = await unregisterDevice();
    expect(result.success).toBe(false);
    expect(result.error).toBe('No device registered');
  });

  it('opts out of push notifications', () => {
    saveRegistration(mockState);
    optOut();
    expect(getOptOutState()).toBe(true);
    const stored = getStoredRegistration();
    expect(stored?.optOut).toBe(true);
  });

  it('opts back in to push notifications', () => {
    saveRegistration({ ...mockState, optOut: true });
    setOptOutState(true);
    optIn();
    expect(getOptOutState()).toBe(false);
    const stored = getStoredRegistration();
    expect(stored?.optOut).toBe(false);
  });
});
