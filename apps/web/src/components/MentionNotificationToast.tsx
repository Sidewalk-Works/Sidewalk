import React, { useState, useMemo } from 'react';
import type { MentionNotificationPayload } from '@qyou/shared';

interface MentionNotificationToastProps {
  payload: MentionNotificationPayload;
  currentUserId?: string;
  onView?: (caseId: string, commentId: string) => void;
}

interface ParsedMention {
  username: string;
  isSelfMention: boolean;
}

export function MentionNotificationToast({
  payload,
  currentUserId,
  onView,
}: MentionNotificationToastProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const parsedMentions: ParsedMention[] = useMemo(() => {
    return payload.mentions.map((m) => ({
      username: m.mentionedUsername,
      isSelfMention: currentUserId
        ? m.mentionedUsername === currentUserId
        : false,
    }));
  }, [payload.mentions, currentUserId]);

  const isSelfMention = parsedMentions.some((m) => m.isSelfMention);
  const highlightColor = isSelfMention ? '#7c3aed' : '#3b82f6';
  const bgColor = isSelfMention ? '#f5f3ff' : '#eff6ff';
  const borderColor = isSelfMention ? '#c4b5fd' : '#93c5fd';

  const contextLabel = isSelfMention
    ? 'You were directly mentioned'
    : 'You were mentioned in a reply';

  function handleView() {
    onView?.(payload.caseId, payload.commentId);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '14px 18px',
        background: bgColor,
        color: '#1e293b',
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        minWidth: '320px',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: highlightColor,
            display: 'inline-block',
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: highlightColor }}>
            {contextLabel}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            by <strong>{payload.author.username}</strong>
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '8px 12px',
          background: '#ffffff',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
          &ldquo;{payload.snippet}&rdquo;
        </p>
      </div>

      {parsedMentions.length > 1 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '11px',
            textAlign: 'left',
            padding: 0,
          }}
        >
          {isExpanded ? 'Hide details' : `Show ${parsedMentions.length} mentions`}
        </button>
      )}

      {isExpanded && parsedMentions.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {parsedMentions.map((m, i) => (
            <span
              key={i}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: m.isSelfMention ? '#ede9fe' : '#dbeafe',
                color: m.isSelfMention ? '#7c3aed' : '#2563eb',
              }}
            >
              @{m.username}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={handleView}
        style={{
          alignSelf: 'flex-start',
          background: highlightColor,
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 14px',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
        }}
      >
        View Comment
      </button>
    </div>
  );
}
