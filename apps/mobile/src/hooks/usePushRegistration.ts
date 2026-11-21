import { useState, useEffect, useCallback, useRef } from 'react';
import type { PushRegistrationState, PushRegistrationResult } from '../services/pushRegistrationService';
import {
  getStoredRegistration,
  registerDevice,
  unregisterDevice,
  optOut as optOutService,
  optIn as optInService,
  getOptOutState,
} from '../services/pushRegistrationService';

type SyncStatus = 'idle' | 'pending' | 'failed';

interface PendingOptAction {
  optedOut: boolean;
}

interface UsePushRegistrationOptions {
  apiRegisterFn?: (data: { deviceToken: string; platform: string; optIn: boolean; registeredAtIso: string }) => Promise<void>;
  apiUnregisterFn?: (deviceToken: string) => Promise<void>;
  apiOptOutFn?: (optedOut: boolean) => Promise<void>;
  isOnline?: () => boolean;
  subscribeOnline?: (listener: () => void) => () => void;
}

interface UsePushRegistrationReturn {
  state: PushRegistrationState | null;
  isLoading: boolean;
  isOptedOut: boolean;
  syncStatus: SyncStatus;
  syncError?: string;
  register: (deviceToken: string) => Promise<PushRegistrationResult>;
  unregister: () => Promise<{ success: boolean; error?: string }>;
  optOut: () => void;
  optIn: () => void;
  refresh: () => void;
}

const defaultIsOnline = () => {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
};

const defaultSubscribeOnline = (listener: () => void) => {
  const target: any = typeof window !== 'undefined' ? window : globalThis;
  if (target?.addEventListener) {
    target.addEventListener('online', listener);
    return () => target.removeEventListener?.('online', listener);
  }
  return () => {};
};

export function usePushRegistration(
  options: UsePushRegistrationOptions = {},
): UsePushRegistrationReturn {
  const [state, setState] = useState<PushRegistrationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOptedOut, setIsOptedOut] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | undefined>(undefined);
  const pendingAction = useRef<PendingOptAction | null>(null);
  const mounted = useRef(true);

  const isOnline = options.isOnline ?? defaultIsOnline;
  const subscribeOnline = options.subscribeOnline ?? defaultSubscribeOnline;

  useEffect(() => {
    mounted.current = true;
    const stored = getStoredRegistration();
    if (stored) setState(stored);
    setIsOptedOut(getOptOutState());
    return () => {
      mounted.current = false;
    };
  }, []);

  const flushPendingAction = useCallback(async () => {
    const action = pendingAction.current;
    if (!action || !options.apiOptOutFn) {
      if (action && !options.apiOptOutFn) {
        pendingAction.current = null;
        if (mounted.current) {
          setSyncStatus('idle');
          setSyncError(undefined);
        }
      }
      return;
    }
    if (!isOnline()) {
      if (mounted.current) setSyncStatus('pending');
      return;
    }

    if (mounted.current) {
      setSyncStatus('pending');
      setSyncError(undefined);
    }

    try {
      await options.apiOptOutFn(action.optedOut);
      if (pendingAction.current === action) {
        pendingAction.current = null;
      }
      if (mounted.current) {
        setSyncStatus('idle');
        setSyncError(undefined);
      }
    } catch (error) {
      if (mounted.current) {
        setSyncStatus('failed');
        setSyncError(error instanceof Error ? error.message : 'Failed to sync push settings');
      }
    }
  }, [isOnline, options.apiOptOutFn]);

  useEffect(() => {
    return subscribeOnline(() => {
      void flushPendingAction();
    });
  }, [flushPendingAction, subscribeOnline]);

  const register = useCallback(
    async (deviceToken: string) => {
      setIsLoading(true);
      try {
        const result = await registerDevice(deviceToken, options.apiRegisterFn);
        if (result.success) {
          const updated = getStoredRegistration();
          if (updated && mounted.current) setState(updated);
          if (mounted.current) setIsOptedOut(false);
        }
        return result;
      } finally {
        if (mounted.current) setIsLoading(false);
      }
    },
    [options.apiRegisterFn],
  );

  const unregister = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await unregisterDevice(options.apiUnregisterFn);
      if (result.success && mounted.current) {
        setState(null);
      }
      return result;
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, [options.apiUnregisterFn]);

  const applyOptAction = useCallback(
    (optedOut: boolean) => {
      if (optedOut) {
        optOutService();
      } else {
        optInService();
      }
      setIsOptedOut(optedOut);
      const stored = getStoredRegistration();
      if (stored) setState({ ...stored, optOut: optedOut });

      if (!options.apiOptOutFn) {
        setSyncStatus('idle');
        setSyncError(undefined);
        return;
      }

      pendingAction.current = { optedOut };
      setSyncStatus('pending');
      setSyncError(undefined);
      void flushPendingAction();
    },
    [flushPendingAction, options.apiOptOutFn],
  );

  const optOut = useCallback(() => {
    applyOptAction(true);
  }, [applyOptAction]);

  const optIn = useCallback(() => {
    applyOptAction(false);
  }, [applyOptAction]);

  const refresh = useCallback(() => {
    const stored = getStoredRegistration();
    if (stored) setState(stored);
    setIsOptedOut(getOptOutState());
  }, []);

  return {
    state,
    isLoading,
    isOptedOut,
    syncStatus,
    syncError,
    register,
    unregister,
    optOut,
    optIn,
    refresh,
  };
}
