import React from 'react';

type BadgeState = 'none' | 'some' | 'many' | 'urgent';

interface UnreadNotificationBadgeIconProps {
  unreadCount?: number;
  urgentCount?: number;
  hasUrgent?: boolean;
  onClick?: () => void;
}

function getBadgeState(total: number, urgent: number): BadgeState {
  if (urgent > 0) return 'urgent';
  if (total > 50) return 'many';
  if (total > 0) return 'some';
  return 'none';
}

const BADGE_STYLES: Record<BadgeState, { bg: string; shadow: string }> = {
  none: { bg: 'transparent', shadow: 'none' },
  some: { bg: '#2563eb', shadow: '0 0 0 0 rgba(37,99,235,0)' },
  many: { bg: '#f59e0b', shadow: '0 0 0 0 rgba(245,158,11,0)' },
  urgent: { bg: '#ef4444', shadow: '0 0 0 0 rgba(239,68,68,0)' },
};

const PULSE_KEYFRAMES = `
@keyframes badge-pulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
  50% { transform: scale(1.08); box-shadow: 0 0 0 6px rgba(239,68,68,0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0); }
}
@keyframes badge-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
`;

export function UnreadNotificationBadgeIcon({ unreadCount = 0, urgentCount = 0, hasUrgent = false, onClick }: UnreadNotificationBadgeIconProps) {
  const effectiveUrgent = hasUrgent ? Math.max(urgentCount, 1) : urgentCount;
  const badgeState = getBadgeState(unreadCount, effectiveUrgent);
  const displayCount = effectiveUrgent > 0 ? effectiveUrgent : unreadCount;
  const { bg, shadow } = BADGE_STYLES[badgeState];

  const isPulsing = badgeState === 'urgent';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: onClick ? 'pointer' : undefined }}
    >
      {isPulsing && <style>{PULSE_KEYFRAMES}</style>}
      <span style={{ fontSize: '20px' }}>🔔</span>
      {badgeState !== 'none' && (
        <span
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-8px',
            background: bg,
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 'bold',
            borderRadius: '10px',
            padding: '2px 6px',
            lineHeight: 1,
            animation: isPulsing ? 'badge-pulse 1.5s ease-in-out infinite' : badgeState === 'many' ? 'badge-breathe 2s ease-in-out infinite' : 'none',
            boxShadow: shadow,
            minWidth: '18px',
            textAlign: 'center',
          }}
        >
          {displayCount > 99 ? '99+' : displayCount}
        </span>
      )}
    </div>
  );
}
