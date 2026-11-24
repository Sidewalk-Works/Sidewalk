import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { usePushRegistration } from '../hooks/usePushRegistration';
import type { PushRegistrationResult, PushRegistrationState } from '../services/pushRegistrationService';
import * as pushService from '../services/pushRegistrationService';

jest.mock('../services/pushRegistrationService', () => {
  const actual = jest.requireActual('../services/pushRegistrationService');
  return {
    ...actual,
    getStoredRegistration: jest.fn(),
    getOptOutState: jest.fn(),
    registerDevice: jest.fn(),
    unregisterDevice: jest.fn(),
    optOut: jest.fn(),
    optIn: jest.fn(),
  };
});

type HookReturn = ReturnType<typeof usePushRegistration>;

function HookHarness({
  options,
  onRender,
}: {
  options?: Parameters<typeof usePushRegistration>[0];
  onRender: (value: HookReturn) => void;
}) {
  const value = usePushRegistration(options);
  onRender(value);
  return null;
}

function flushPromises() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('usePushRegistration', () => {
  const mocked = pushService as jest.Mocked<typeof pushService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mocked.getStoredRegistration.mockReturnValue(null);
    mocked.getOptOutState.mockReturnValue(false);
  });

  it('hydrates state from stored registration on mount', async () => {
    const stored: PushRegistrationState = {
      isRegistered: true,
      deviceToken: 'stored-token',
      platform: 'ios',
      permissionState: 'granted',
      registeredAtIso: '2026-01-01T00:00:00.000Z',
      optOut: false,
    };
    mocked.getStoredRegistration.mockReturnValue(stored);
    mocked.getOptOutState.mockReturnValue(false);

    let latest: HookReturn | undefined;
    await act(async () => {
      renderer.create(<HookHarness onRender={(v) => { latest = v; }} />);
    });

    expect(latest?.state).toEqual(stored);
    expect(latest?.isOptedOut).toBe(false);
  });

  it('calls opt-in API through service when opting in', async () => {
    const apiOptOutFn = jest.fn().mockResolvedValue(undefined);
    const stored: PushRegistrationState = {
      isRegistered: true,
      deviceToken: 'token-1',
      platform: 'web',
      permissionState: 'granted',
      registeredAtIso: '2026-01-01T00:00:00.000Z',
      optOut: true,
    };
    mocked.getStoredRegistration.mockReturnValue(stored);
    mocked.getOptOutState.mockReturnValue(true);

    let latest: HookReturn | undefined;
    await act(async () => {
      renderer.create(
        <HookHarness options={{ apiOptOutFn }} onRender={(v) => { latest = v; }} />,
      );
    });

    await act(async () => {
      latest!.optIn();
    });

    expect(mocked.optIn).toHaveBeenCalledWith(apiOptOutFn);
    expect(latest?.isOptedOut).toBe(false);
  });

  it('surfaces permission-denied registration without marking device registered', async () => {
    mocked.registerDevice.mockResolvedValue({
      success: false,
      permissionState: 'denied',
      error: 'Push permission denied',
    });

    let latest: HookReturn | undefined;
    await act(async () => {
      renderer.create(<HookHarness onRender={(v) => { latest = v; }} />);
    });

    let result: PushRegistrationResult | undefined;
    await act(async () => {
      result = await latest!.register('denied-token');
    });

    expect(result).toEqual({
      success: false,
      permissionState: 'denied',
      error: 'Push permission denied',
    });
    expect(latest?.state).toBeNull();
  });

  it('handles unmount during an in-flight registration call', async () => {
    let resolveRegister!: (value: PushRegistrationResult) => void;
    mocked.registerDevice.mockImplementation(
      () =>
        new Promise<PushRegistrationResult>((resolve) => {
          resolveRegister = resolve;
        }),
    );

    let latest: HookReturn | undefined;
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HookHarness onRender={(v) => { latest = v; }} />);
    });

    let pending!: Promise<PushRegistrationResult>;
    await act(async () => {
      pending = latest!.register('slow-token');
    });

    await act(async () => {
      tree!.unmount();
    });

    await act(async () => {
      resolveRegister({ success: true, deviceToken: 'slow-token', permissionState: 'granted' });
      await flushPromises();
      await pending;
    });

    expect(mocked.registerDevice).toHaveBeenCalledWith('slow-token', undefined);
  });
});
