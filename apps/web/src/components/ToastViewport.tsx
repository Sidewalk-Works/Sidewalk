"use client";

import React from 'react';
import { useToastContext } from './ToastProvider';

const LEVEL_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  info: { bg: '#0f172a', border: '#334155', icon: 'ℹ️' },
  success: { bg: '#065f46', border: '#059669', icon: '✓' },
  warning: { bg: '#78350f', border: '#d97706', icon: '⚠' },
  error: { bg: '#7f1d1d', border: '#dc2626', icon: '✕' },
};

export function ToastViewport() {
  const { toasts, dismissToast } = useToastContext();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      role="status"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '400px',
      }}
    >
      {toasts.map((toast) => {
        const style = LEVEL_STYLES[toast.level] ?? LEVEL_STYLES.info;
        return (
          <div
            key={toast.id}
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
              animation: 'toastSlideIn 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '16px', lineHeight: 1 }}>{style.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{toast.title}</div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                  {toast.message}
                </div>
              </div>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
                padding: '0 0 0 8px',
                flexShrink: 0,
              }}
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
}
