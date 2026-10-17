import React, { useState, useMemo } from 'react';
import type { GroupedCaseNotification } from '@qyou/shared';

interface GroupedCaseNotificationCardProps {
  groupedNotification: GroupedCaseNotification;
  sortIndicator?: 'newest' | 'oldest' | 'most-updates';
  onMarkRead?: (groupId: string) => void;
  onSnooze?: (groupId: string, durationMs: number) => void;
  onDismiss?: (groupId: string) => void;
}

function formatTimeRange(firstIso: string, lastIso: string): string {
  const first = new Date(firstIso);
  const last = new Date(lastIso);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  const firstStr = first.toLocaleDateString('en-US', opts);
  const lastStr = last.toLocaleDateString('en-US', opts);
  if (firstStr === lastStr) return firstStr;
  return `${firstStr} – ${lastStr}`;
}

function getSortLabel(indicator?: 'newest' | 'oldest' | 'most-updates'): string {
  if (indicator === 'newest') return '↓ Newest first';
  if (indicator === 'oldest') return '↑ Oldest first';
  if (indicator === 'most-updates') return '↓ Most updates';
  return '';
}

export function GroupedCaseNotificationCard({
  groupedNotification,
  sortIndicator,
  onMarkRead,
  onSnooze,
  onDismiss,
}: GroupedCaseNotificationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { groupId, caseTitle, updateCount, latestMessage, participantCount, firstEventAtIso, lastEventAtIso } = groupedNotification;

  const timeRange = useMemo(() => formatTimeRange(firstEventAtIso, lastEventAtIso), [firstEventAtIso, lastEventAtIso]);
  const sortLabel = useMemo(() => getSortLabel(sortIndicator), [sortIndicator]);

  const quickActions = [
    { label: 'Mark read', onClick: () => onMarkRead?.(groupId) },
    { label: 'Snooze 1h', onClick: () => onSnooze?.(groupId, 60 * 60 * 1000) },
    { label: 'Snooze 24h', onClick: () => onSnooze?.(groupId, 24 * 60 * 60 * 1000) },
    { label: 'Dismiss', onClick: () => onDismiss?.(groupId) },
  ];

  return (
    <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '10px' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', cursor: 'pointer' }}
        onClick={() => setExpanded((p) => !p)}
      >
        <h4 style={{ margin: 0, fontSize: '14px', color: '#0f172a', flex: 1 }}>
          {expanded ? '▾' : '▸'} {caseTitle}
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {sortLabel && (
            <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>{sortLabel}</span>
          )}
          <span style={{ padding: '2px 8px', background: '#e0f2fe', color: '#0369a1', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
            {updateCount} updates
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#64748b', marginBottom: expanded ? '8px' : 0 }}>
        <span>{timeRange}</span>
        {participantCount > 1 && <span>{participantCount} participants</span>}
      </div>

      {expanded && (
        <div style={{ marginTop: '8px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569', padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            {latestMessage}
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: action.label === 'Dismiss' ? '#fef2f2' : '#ffffff',
                  color: action.label === 'Dismiss' ? '#b91c1c' : '#334155',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
