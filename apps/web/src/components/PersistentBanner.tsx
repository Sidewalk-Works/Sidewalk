"use client";

import React, { useState } from 'react';

interface PersistentBannerProps {
  id: string;
  level: 'info' | 'warning' | 'error' | 'success';
  heading: string;
  body: string;
  actionText?: string;
  actionUrl?: string;
  onAction?: (id: string) => void;
  dismissable?: boolean;
  onDismiss?: (id: string) => void;
}

const LEVEL_CONFIG: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', icon: 'ℹ️' },
  warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: '⚠' },
  error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: '✕' },
  success: { bg: '#f0fdf4', border: '#22c55e', text: '#166534', icon: '✓' },
};

export function PersistentBanner({
  id,
  level,
  heading,
  body,
  actionText,
  actionUrl,
  onAction,
  dismissable = true,
  onDismiss,
}: PersistentBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const config = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.info;

  if (!isVisible) return null;

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.(id);
  };

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 20px',
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: '8px',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
        <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0 }}>{config.icon}</span>
        <div>
          <div style={{ fontWeight: '600', fontSize: '14px', color: config.text }}>{heading}</div>
          <div style={{ fontSize: '13px', color: config.text, opacity: 0.85, marginTop: '2px' }}>
            {body}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0, marginLeft: '16px' }}>
        {actionText && (
          actionUrl ? (
            <a
              href={actionUrl}
              style={{
                padding: '6px 14px',
                background: config.border,
                color: '#ffffff',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {actionText}
            </a>
          ) : (
            <button
              onClick={() => onAction?.(id)}
              style={{
                padding: '6px 14px',
                background: config.border,
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {actionText}
            </button>
          )
        )}
        {dismissable && onDismiss && (
          <button
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              color: config.text,
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: 1,
              padding: '0',
              opacity: 0.6,
            }}
          >
            x
          </button>
        )}
      </div>
    </div>
  );
}
