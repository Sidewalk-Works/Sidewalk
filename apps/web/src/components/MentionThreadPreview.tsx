"use client";

import React, { useState } from 'react';
import type { CommunityMention } from '@sidewalk/shared';

interface CommentThread {
  commentId: string;
  authorName: string;
  authorRole?: 'citizen' | 'moderator' | 'admin';
  body: string;
  createdAt: Date;
  mentions: Array<{
    username: string;
    startIndex: number;
    endIndex: number;
  }>;
}

interface MentionThreadPreviewProps {
  mention: CommunityMention;
  thread?: CommentThread[];
  currentUserId?: string;
  onNavigateToCase?: (caseId: string, commentId: string) => void;
}

function highlightMentions(
  text: string,
  mentions: Array<{ username: string; startIndex: number; endIndex: number }>,
  currentUserId?: string,
): React.ReactNode[] {
  if (mentions.length === 0) return [text];

  const sorted = [...mentions].sort((a, b) => a.startIndex - b.startIndex);
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const mention of sorted) {
    if (mention.startIndex > lastIndex) {
      parts.push(text.slice(lastIndex, mention.startIndex));
    }
    const isSelf = currentUserId ? mention.username === currentUserId : false;
    parts.push(
      <span
        key={mention.startIndex}
        style={{
          color: isSelf ? '#7c3aed' : '#2563eb',
          fontWeight: '600',
          background: isSelf ? '#ede9fe' : '#dbeafe',
          padding: '1px 4px',
          borderRadius: '3px',
        }}
      >
        @{mention.username}
      </span>,
    );
    lastIndex = mention.endIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function formatTime(date: Date): string {
  try {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(date);
  }
}

const ROLE_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  moderator: { label: 'MOD', bg: '#f5f3ff', color: '#7c3aed' },
  admin: { label: 'ADMIN', bg: '#fef2f2', color: '#dc2626' },
  citizen: { label: '', bg: '', color: '' },
};

export function MentionThreadPreview({
  mention,
  thread = [],
  currentUserId,
  onNavigateToCase,
}: MentionThreadPreviewProps) {
  const [showFullThread, setShowFullThread] = useState(false);

  const relevantComment = thread.find((c) => c.commentId === mention.commentId);

  const displayThread = showFullThread ? thread : relevantComment ? [relevantComment] : [];

  return (
    <div
      style={{
        padding: '16px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#0f172a',
            }}
          >
            {mention.caseTitle}
          </span>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: '#faf5ff',
              color: '#7c3aed',
              fontWeight: '600',
            }}
          >
            MENTION
          </span>
        </div>
        {onNavigateToCase && (
          <button
            onClick={() => onNavigateToCase(mention.caseId, mention.commentId)}
            style={{
              fontSize: '12px',
              color: '#2563eb',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Go to case
          </button>
        )}
      </div>

      {displayThread.length === 0 ? (
        <div
          style={{
            padding: '12px',
            background: '#faf5ff',
            borderRadius: '8px',
            borderLeft: '3px solid #7c3aed',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
              {mention.mentioningUserName}
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{formatTime(mention.createdAt)}</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
            &ldquo;{mention.excerpt}&rdquo;
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {displayThread.map((comment) => {
            const isMentionComment = comment.commentId === mention.commentId;
            const roleBadge = ROLE_BADGES[comment.authorRole ?? 'citizen'];

            return (
              <div
                key={comment.commentId}
                style={{
                  padding: '12px',
                  background: isMentionComment ? '#faf5ff' : '#f8fafc',
                  borderRadius: '8px',
                  borderLeft: isMentionComment ? '3px solid #7c3aed' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
                      {comment.authorName}
                    </span>
                    {roleBadge.label && (
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: roleBadge.bg,
                          color: roleBadge.color,
                          fontWeight: '700',
                        }}
                      >
                        {roleBadge.label}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{formatTime(comment.createdAt)}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
                  {highlightMentions(comment.body, comment.mentions, currentUserId)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {thread.length > 1 && !showFullThread && (
        <button
          onClick={() => setShowFullThread(true)}
          style={{
            marginTop: '10px',
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '4px 0',
            textDecoration: 'underline',
          }}
        >
          Show full thread ({thread.length} comments)
        </button>
      )}
      {showFullThread && thread.length > 1 && (
        <button
          onClick={() => setShowFullThread(false)}
          style={{
            marginTop: '10px',
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '4px 0',
            textDecoration: 'underline',
          }}
        >
          Collapse thread
        </button>
      )}
    </div>
  );
}
