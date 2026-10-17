import React, { useState } from 'react';
import type { BannerAlert } from '@qyou/shared';

interface StatusTransition {
  from: string;
  to: string;
}

interface StatusChangeBannerProps {
  alert: BannerAlert;
  transition?: StatusTransition;
  timestamp?: string;
  actorName?: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6',
  investigating: '#f59e0b',
  in_progress: '#8b5cf6',
  resolved: '#22c55e',
  closed: '#6b7280',
  reopened: '#ef4444',
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status.toLowerCase()] ?? '#6b7280';
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function StatusChangeBanner({
  alert,
  transition,
  timestamp,
  actorName,
}: StatusChangeBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  const bannerBg = transition ? getStatusColor(transition.to) : '#3b82f6';

  return (
    <div
      style={{
        background: bannerBg,
        color: '#fff',
        padding: '12px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {transition ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600' }}>
            <span
              style={{
                background: 'rgba(255,255,255,0.2)',
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'capitalize',
              }}
            >
              {transition.from}
            </span>
            <span style={{ opacity: 0.7 }}>→</span>
            <span
              style={{
                background: 'rgba(255,255,255,0.3)',
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'capitalize',
              }}
            >
              {transition.to}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: '14px', fontWeight: '500' }}>{alert.content}</span>
        )}
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', opacity: 0.85 }}>
          {actorName && <span>by {actorName}</span>}
          {timestamp && <span>{formatTimestamp(timestamp)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {alert.actionUrl && (
          <a
            href={alert.actionUrl}
            style={{
              color: '#fff',
              textDecoration: 'underline',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            View Details
          </a>
        )}
        {alert.isDismissible && (
          <button
            onClick={() => setIsVisible(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
