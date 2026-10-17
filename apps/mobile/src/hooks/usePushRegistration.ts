import { useState, useEffect, useCallback } from 'react';
import type { PushRegistrationState, PushRegistrationResult } from '../services/pushRegistrationService';
import {
  getStoredRegistration,
  registerDevice,
  unregisterDevice,
  optOut as optOutService,
  optIn as optInService,
  getOptOutState,
} from '../services/pushRegistrationService';

interface UsePushRegistrationOptions {
  apiRegisterFn?: (data: { deviceToken: string; platform: string; optIn: boolean; registeredAtIso: string }) => Promise<void>;
  apiUnregisterFn?: (deviceToken: string) => Promise<void>;
  apiOptOutFn?: (optedOut: boolean) => Promise<void>;
}

interface UsePushRegistrationReturn {
  state: PushRegistrationState | null;
  isLoading: boolean;
  isOptedOut: boolean;
  register: (deviceToken: string) => Promise<PushRegistrationResult>;
  unregister: () => Promise<{ success: boolean; error?: string }>;
  optOut: () => void;
  optIn: () => void;
  refresh: () => void;
}

export function usePushRegistration(
  options: UsePushRegistrationOptions = {},
): UsePushRegistrationReturn {
  const [state, setState] = useState<PushRegistrationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOptedOut, setIsOptedOut] = useState(false);

  useEffect(() => {
    const stored = getStoredRegistration();
    if (stored) setState(stored);
    setIsOptedOut(getOptOutState());
  }, []);

  const register = useCallback(
    async (deviceToken: string) => {
      setIsLoading(true);
      try {
        const result = await registerDevice(deviceToken, options.apiRegisterFn);
        if (result.success) {
          const updated = getStoredRegistration();
          if (updated) setState(updated);
          setIsOptedOut(false);
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [options.apiRegisterFn],
  );

  const unregister = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await unregisterDevice(options.apiUnregisterFn);
      if (result.success) {
        setState(null);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [options.apiUnregisterFn]);

  const optOut = useCallback(() => {
    optOutService(options.apiOptOutFn);
    setIsOptedOut(true);
    const stored = getStoredRegistration();
    if (stored) setState({ ...stored, optOut: true });
  }, [options.apiOptOutFn]);

  const optIn = useCallback(() => {
    optInService(options.apiOptOutFn);
    setIsOptedOut(false);
    const stored = getStoredRegistration();
    if (stored) setState({ ...stored, optOut: false });
  }, [options.apiOptOutFn]);

  const refresh = useCallback(() => {
    const stored = getStoredRegistration();
    if (stored) setState(stored);
    setIsOptedOut(getOptOutState());
  }, []);

  return {
    state,
    isLoading,
    isOptedOut,
    register,
    unregister,
    optOut,
    optIn,
    refresh,
  };
}
