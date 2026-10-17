import React, { useEffect, useCallback, useRef } from 'react';
import type { ToastNotificationMessage } from '@qyou/shared';

interface RealtimeStatusToastBannerContainerProps {
  toasts?: ToastNotificationMessage[];
  onDismiss?: (id: string) => void;
  maxVisible?: number;
  defaultDismissMs?: number;
}

export function RealtimeStatusToastBannerContainer({
  toasts = [],
  onDismiss,
  maxVisible = 5,
  defaultDismissMs = 5000,
}: RealtimeStatusToastBannerContainerProps) {
  const dismissedRef = useRef<Set<string>>(new Set());

  const handleAutoDismiss = useCallback(
    (id: string) => {
      if (!dismissedRef.current.has(id)) {
        dismissedRef.current.add(id);
        onDismiss?.(id);
      }
    },
    [onDismiss]
  );

  const handleManualDismiss = useCallback(
    (id: string) => {
      dismissedRef.current.add(id);
      onDismiss?.(id);
    },
    [onDismiss]
  );

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const visibleToasts = toasts.slice(0, maxVisible);

    for (const toast of visibleToasts) {
      if (dismissedRef.current.has(toast.id)) continue;
      const duration = toast.autoDismissMs ?? defaultDismissMs;
      const timer = setTimeout(() => handleAutoDismiss(toast.id), duration);
      timers.push(timer);
    }

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [toasts, maxVisible, defaultDismissMs, handleAutoDismiss]);

  const visibleToasts = toasts
    .filter((t) => !dismissedRef.current.has(t.id))
    .slice(0, maxVisible);

  if (visibleToasts.length === 0) return null;

  const levelStyles: Record<string, { bg: string; border: string }> = {
    info: { bg: '#0f172a', border: '#334155' },
    success: { bg: '#065f46', border: '#059669' },
    warning: { bg: '#78350f', border: '#d97706' },
    error: { bg: '#7f1d1d', border: '#dc2626' },
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '380px',
      }}
    >
      {visibleToasts.map((t, index) => {
        const style = levelStyles[t.level] ?? levelStyles.info;
        return (
          <div
            key={t.id}
            style={{
              background: style.bg,
              color: '#ffffff',
              padding: '12px 16px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              borderLeft: `4px solid ${style.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              animation: index < visibleToasts.length - 1 ? undefined : 'fadeIn 0.2s ease-in',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{t.title}</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>{t.message}</div>
            </div>
            {onDismiss && (
              <button
                onClick={() => handleManualDismiss(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                  padding: '0 0 0 8px',
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
