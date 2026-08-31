import React, { useState } from 'react';
import type { StaleReportReminder } from '@qyou/shared';

interface StaleReportReminderBannerProps {
  reminders: StaleReportReminder[];
  onSnooze?: (reminderId: string, days: number) => void;
  onDismiss?: (reminderId: string) => void;
  onAcknowledge?: (reminderId: string) => void;
}

export function StaleReportReminderBanner({
  reminders = [],
  onSnooze,
  onDismiss,
  onAcknowledge,
}: StaleReportReminderBannerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeReminders = reminders.filter((r) => !r.dismissed && !r.acknowledgedAtIso);

  if (activeReminders.length === 0) return null;

  const containerStyle: React.CSSProperties = {
    border: '1px solid #fbbf24',
    borderRadius: '8px',
    background: '#fffbeb',
    padding: '12px 16px',
    marginBottom: '12px',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontWeight: 'bold',
    fontSize: '13px',
    color: '#92400e',
    marginBottom: '8px',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: '#ffffff',
    borderRadius: '6px',
    marginBottom: '6px',
    border: '1px solid #fde68a',
    fontSize: '13px',
  };

  const btnStyle = (bg: string, color: string): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '12px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    background: bg,
    color,
  });

  return (
    <div role="status" aria-live="polite" style={containerStyle}>
      <div style={headerStyle}>
        <span>Stale Report Reminders ({activeReminders.length})</span>
      </div>
      {activeReminders.map((reminder) => (
        <div key={reminder.reminderId}>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold' }}>Report: {reminder.reportId}</div>
              <div style={{ color: '#6b7280', fontSize: '12px' }}>
                Frequency: {reminder.frequency}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                style={btnStyle('#fef3c7', '#92400e')}
                onClick={() => setExpandedId(expandedId === reminder.reminderId ? null : reminder.reminderId)}
              >
                Snooze
              </button>
              <button style={btnStyle('#fee2e2', '#991b1b')} onClick={() => onDismiss?.(reminder.reminderId)}>
                Dismiss
              </button>
              <button style={btnStyle('#dcfce7', '#166534')} onClick={() => onAcknowledge?.(reminder.reminderId)}>
                Acknowledge
              </button>
            </div>
          </div>
          {expandedId === reminder.reminderId && (
            <div style={{ padding: '8px 12px', background: '#fef9ee', borderRadius: '0 0 6px 6px', marginBottom: '6px', display: 'flex', gap: '6px' }}>
              <button style={btnStyle('#e0f2fe', '#0369a1')} onClick={() => { onSnooze?.(reminder.reminderId, 1); setExpandedId(null); }}>1 day</button>
              <button style={btnStyle('#e0f2fe', '#0369a1')} onClick={() => { onSnooze?.(reminder.reminderId, 3); setExpandedId(null); }}>3 days</button>
              <button style={btnStyle('#e0f2fe', '#0369a1')} onClick={() => { onSnooze?.(reminder.reminderId, 7); setExpandedId(null); }}>7 days</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
