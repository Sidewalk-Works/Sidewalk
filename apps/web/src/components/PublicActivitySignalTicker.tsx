import React from 'react';
import type { PublicProgressEvent } from '@qyou/shared';

interface PublicActivitySignalTickerProps {
  events: PublicProgressEvent[];
}

export function PublicActivitySignalTicker({ events }: PublicActivitySignalTickerProps) {
  if (!events || events.length === 0) return null;

  return (
    <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', display: 'flex', overflowX: 'auto', whiteSpace: 'nowrap', gap: '24px', alignItems: 'center' }}>
      <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Live Activity:</span>
      {events.map((evt) => (
        <div key={evt.eventId} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <span style={{ color: '#0f172a', fontWeight: '500' }}>{evt.caseTitle}</span>
          <span style={{ color: '#64748b' }}>- {evt.description}</span>
        </div>
      ))}
    </div>
  );
}
