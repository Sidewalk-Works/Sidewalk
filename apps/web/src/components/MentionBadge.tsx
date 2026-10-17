"use client";

import React from 'react';

interface MentionBadgeProps {
  count: number;
  hasDirectMentions?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CONFIG = {
  sm: { fontSize: '10px', padding: '1px 5px', minSize: '16px' },
  md: { fontSize: '11px', padding: '2px 6px', minSize: '18px' },
  lg: { fontSize: '12px', padding: '3px 8px', minSize: '22px' },
};

export function MentionBadge({
  count,
  hasDirectMentions = false,
  onClick,
  size = 'md',
}: MentionBadgeProps) {
  if (count === 0) return null;

  const config = SIZE_CONFIG[size];
  const bgColor = hasDirectMentions ? '#7c3aed' : '#3b82f6';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <span style={{ fontSize: size === 'lg' ? '20px' : '16px' }}>@</span>
      <span
        style={{
          position: 'absolute',
          top: '-4px',
          right: '-8px',
          background: bgColor,
          color: '#ffffff',
          fontSize: config.fontSize,
          fontWeight: 'bold',
          borderRadius: '10px',
          padding: config.padding,
          lineHeight: 1,
          minWidth: config.minSize,
          textAlign: 'center',
        }}
      >
        {count > 99 ? '99+' : count}
      </span>
    </div>
  );
}
