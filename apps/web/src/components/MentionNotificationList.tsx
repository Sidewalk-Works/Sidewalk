"use client";

import React, { useState, useMemo } from 'react';
import type { CommunityMention, MentionNotification } from '@sidewalk/shared';

interface MentionNotificationListProps {
  mentions: MentionNotification[];
  currentUserId?: string;
  onMarkRead?: (mentionId: string) => void;
  onMarkAllRead?: () => void;
  onNavigateToCase?: (caseId: string) => void;
}

const CONTEXT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  comment: { label: 'Comment', color: '#2563eb', bg: '#eff6ff' },
  moderator_reply: { label: 'Moderator Reply', color: '#7c3aed', bg: '#f5f3ff' },
  status_update: { label: 'Status Update', color: '#0891b2', bg: '#ecfeff' },
};

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MentionNotificationList({
  mentions,
  currentUserId,
  onMarkRead,
  onMarkAllRead,
  onNavigateToCase,
}: MentionNotificationListProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = useMemo(() => {
    if (filter === 'unread') return mentions.filter((m) => !m.mention.read);
    return mentions;
  }, [mentions, filter]);

  const unreadCount = useMemo(() => mentions.filter((m) => !m.mention.read).length, [mentions]);

  if (mentions.length === 0) {
    return (
      <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#0f172a' }}>Mentions</h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>
          No mentions yet. When someone mentions you in a comment, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Mentions</h3>
          {unreadCount > 0 && (
            <span
              style={{
                background: '#7c3aed',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '1px 8px',
                fontSize: '11px',
                fontWeight: '600',
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {unreadCount > 0 && onMarkAllRead && (
            <button
              onClick={onMarkAllRead}
              style={{
                background: 'none',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                color: '#7c3aed',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              Mark all read
            </button>
          )}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${filter === f ? '#7c3aed' : '#e2e8f0'}`,
                  background: filter === f ? '#7c3aed' : '#ffffff',
                  color: filter === f ? '#ffffff' : '#64748b',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: filter === f ? '600' : '400',
                }}
              >
                {f === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.map((notification) => {
          const { mention, deliveryChannel } = notification;
          const contextMeta = CONTEXT_LABELS[mention.context] ?? CONTEXT_LABELS.comment;
          const isSelfMention = currentUserId ? mention.mentionedUserId === currentUserId : false;

          return (
            <div
              key={mention.id}
              onClick={() => {
                if (!mention.read) onMarkRead?.(mention.id);
                onNavigateToCase?.(mention.caseId);
              }}
              style={{
                padding: '14px',
                background: mention.read ? '#ffffff' : isSelfMention ? '#faf5ff' : '#f0f9ff',
                border: `1px solid ${mention.read ? '#e2e8f0' : isSelfMention ? '#c4b5fd' : '#bfdbfe'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: contextMeta.bg,
                      color: contextMeta.color,
                      fontSize: '11px',
                      fontWeight: '600',
                    }}
                  >
                    {contextMeta.label}
                  </span>
                  {isSelfMention && (
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#ede9fe',
                        color: '#7c3aed',
                        fontSize: '10px',
                        fontWeight: '700',
                      }}
                    >
                      YOU
                    </span>
                  )}
                </div>
                {!mention.read && (
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: isSelfMention ? '#7c3aed' : '#3b82f6',
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>

              <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}>
                <strong>{mention.mentioningUserName}</strong> mentioned you in{' '}
                <strong>{mention.caseTitle}</strong>
              </div>

              <p
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '13px',
                  color: '#475569',
                  lineHeight: '1.5',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  borderLeft: `3px solid ${contextMeta.color}`,
                }}
              >
                &ldquo;{mention.excerpt}&rdquo;
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {formatRelativeTime(mention.createdAt)}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: '#f1f5f9',
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  {deliveryChannel === 'in_app' ? 'In-App' : deliveryChannel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
