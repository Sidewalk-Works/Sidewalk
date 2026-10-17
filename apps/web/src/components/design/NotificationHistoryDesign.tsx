import React from 'react';

interface TimelineEntry {
  id: string;
  title: string;
  channel: 'email' | 'push' | 'inApp';
  status: 'sent' | 'delivered' | 'failed';
  timestamp: string;
}

const DEMO_ENTRIES: TimelineEntry[] = [
  { id: '1', title: 'Report #401 status changed to Under Investigation', channel: 'email', status: 'delivered', timestamp: '2026-07-26T14:30:00Z' },
  { id: '2', title: 'New comment on Report #398', channel: 'push', status: 'delivered', timestamp: '2026-07-26T12:15:00Z' },
  { id: '3', title: 'Your report was marked resolved', channel: 'email', status: 'failed', timestamp: '2026-07-25T09:00:00Z' },
  { id: '4', title: 'Watchlist update: 3 reports changed', channel: 'inApp', status: 'sent', timestamp: '2026-07-24T18:45:00Z' },
];

const CHANNEL_ICONS: Record<string, string> = { email: '\u2709', push: '\uD83D\uDD14', inApp: '\uD83D\uDCAC' };

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  sent: { bg: '#fef3c7', text: '#b45309' },
  delivered: { bg: '#dcfce7', text: '#15803d' },
  failed: { bg: '#fee2e2', text: '#991b1b' },
};

export function NotificationHistoryDesign() {
  return (
    <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', maxWidth: '640px' }}>
      <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a' }}>Notification History Timeline</h2>
      <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b' }}>Visual timeline of all notifications sent to you across channels.</p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="From date"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#94a3b8' }}
        />
        <input
          type="text"
          placeholder="To date"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#94a3b8' }}
        />
        <button style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Export</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {DEMO_ENTRIES.map((entry, i) => {
          const sc = STATUS_COLORS[entry.status];
          return (
            <div key={entry.id} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: sc.text, flexShrink: 0, marginTop: '4px' }} />
                {i < DEMO_ENTRIES.length - 1 && <div style={{ width: '2px', flex: 1, background: '#e2e8f0', margin: '2px 0' }} />}
              </div>
              <div style={{ flex: 1, padding: '0 0 20px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px' }}>{CHANNEL_ICONS[entry.channel]}</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{entry.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: sc.bg, color: sc.text, fontSize: '11px', fontWeight: 'bold' }}>{entry.status}</span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(entry.timestamp).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '20px', padding: '32px 16px', background: '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
        <p style={{ margin: '0', fontSize: '14px', color: '#94a3b8' }}>No earlier notifications to display.</p>
      </div>
    </div>
  );
}
