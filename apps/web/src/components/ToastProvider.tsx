"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ToastNotificationMessage, BannerNotificationType } from '@sidewalk/shared';

interface ToastEntry extends ToastNotificationMessage {
  createdAtMs: number;
}

interface BannerEntry extends BannerNotificationType {
  dismissable: boolean;
  createdAtMs: number;
}

interface ToastContextValue {
  toasts: ToastEntry[];
  banners: BannerEntry[];
  addToast: (toast: Omit<ToastNotificationMessage, 'id'> & { id?: string }) => string;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
  addBanner: (banner: Omit<BannerNotificationType, 'bannerId'> & { bannerId?: string; dismissable?: boolean }) => string;
  dismissBanner: (bannerId: string) => void;
  clearAllBanners: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastContext must be used within a ToastProvider');
  return ctx;
}

interface ToastProviderProps {
  maxToasts?: number;
  defaultToastDurationMs?: number;
  children: React.ReactNode;
}

export function ToastProvider({
  maxToasts = 5,
  defaultToastDurationMs = 5000,
  children,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [banners, setBanners] = useState<BannerEntry[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastNotificationMessage, 'id'> & { id?: string }) => {
      const id = toast.id ?? `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const entry: ToastEntry = { ...toast, id, createdAtMs: Date.now() };

      setToasts((prev) => {
        const next = [entry, ...prev];
        return next.slice(0, maxToasts);
      });

      const duration = toast.autoDismissMs ?? defaultToastDurationMs;
      const timer = setTimeout(() => dismissToast(id), duration);
      timersRef.current.set(id, timer);

      return id;
    },
    [maxToasts, defaultToastDurationMs, dismissToast],
  );

  const clearAllToasts = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const dismissBanner = useCallback((bannerId: string) => {
    setBanners((prev) => prev.filter((b) => b.bannerId !== bannerId));
  }, []);

  const addBanner = useCallback(
    (banner: Omit<BannerNotificationType, 'bannerId'> & { bannerId?: string; dismissable?: boolean }) => {
      const bannerId = banner.bannerId ?? `banner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const entry: BannerEntry = {
        ...banner,
        bannerId,
        dismissable: banner.dismissable ?? true,
        createdAtMs: Date.now(),
      };
      setBanners((prev) => [...prev, entry]);
      return bannerId;
    },
    [],
  );

  const clearAllBanners = useCallback(() => {
    setBanners([]);
  }, []);

  const value: ToastContextValue = {
    toasts,
    banners,
    addToast,
    dismissToast,
    clearAllToasts,
    addBanner,
    dismissBanner,
    clearAllBanners,
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
