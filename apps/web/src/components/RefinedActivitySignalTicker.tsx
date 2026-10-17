import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ActivityFeedState } from '@qyou/shared';

interface ActivitySignalTickerProps {
  state: ActivityFeedState;
}

function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const SIGNAL_ICONS: Record<string, { icon: string; color: string }> = {
  status_change: { icon: '🔄', color: '#3b82f6' },
  new_comment: { icon: '💬', color: '#8b5cf6' },
  resolution: { icon: '✅', color: '#10b981' },
};

export function RefinedActivitySignalTicker({ state }: ActivitySignalTickerProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  const events = state.events ?? [];

  const tick = useCallback(() => {
    setScrollOffset((prev) => {
      const container = containerRef.current;
      if (!container) return prev;
      const maxScroll = container.scrollWidth - container.clientWidth;
      if (maxScroll <= 0) return 0;
      const next = prev + 1;
      return next > maxScroll ? 0 : next;
    });
    animRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (!isPaused && events.length > 0) {
      animRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isPaused, tick, events.length]);

  if (events.length === 0) return null;

  return (
    <div
      style={{
        background: '#0f172a',
        padding: '10px 0',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '16px', borderRight: '1px solid #1e293b' }}>
          {state.isLive && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
          )}
          <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#38bdf8', textTransform: 'uppercase' }}>Live</span>
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          display: 'flex',
          gap: '24px',
          paddingLeft: '120px',
          paddingRight: '20px',
          whiteSpace: 'nowrap',
          transform: `translateX(-${scrollOffset}px)`,
          transition: isPaused ? 'none' : undefined,
        }}
      >
        {events.map((evt) => {
          const signalType = (evt as Record<string, unknown>).signalType as string | undefined;
          const signal = SIGNAL_ICONS[signalType] ?? { icon: '📌', color: '#94a3b8' };
          const caseId = (evt as Record<string, unknown>).caseId as string | undefined;
          const timestamp = (evt as Record<string, unknown>).timestamp as string | undefined;

          return (
            <a
              key={evt.id}
              href={caseId ? `/cases/${caseId}` : '#'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: '16px' }}>{signal.icon}</span>
              <span style={{ color: signal.color, fontWeight: '600' }}>{evt.title}</span>
              <span style={{ color: '#94a3b8' }}>- {evt.summary}</span>
              {timestamp && (
                <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '4px' }}>
                  {timeAgo(timestamp)}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
