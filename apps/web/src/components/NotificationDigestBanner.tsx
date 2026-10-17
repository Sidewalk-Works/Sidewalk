import React from 'react';

interface NotificationDigestBannerProps {
  onEnableDigest: (frequency: 'daily' | 'weekly') => void;
  onDismiss: () => void;
}

export function NotificationDigestBanner({ onEnableDigest, onDismiss }: NotificationDigestBannerProps) {
  return (
    <div role="status" aria-live="polite" style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
      <div>
        <h4 style={{ margin: '0 0 4px 0', color: '#92400e', fontSize: '15px' }}>Too many alerts?</h4>
        <p style={{ margin: 0, color: '#b45309', fontSize: '13px' }}>
          Switch to a daily or weekly digest to get a summary of civic updates instead of real-time pings.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => onEnableDigest('daily')} style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold' }}>
          Daily
        </button>
        <button onClick={() => onEnableDigest('weekly')} style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold' }}>
          Weekly
        </button>
        <button onClick={onDismiss} style={{ background: 'transparent', color: '#92400e', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: '6px' }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
