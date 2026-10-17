"use client";

import React, { useState } from 'react';
import type { CommunityMention } from '@sidewalk/shared';

interface ModeratorReplyNotificationProps {
  mention: CommunityMention;
  moderatorName: string;
  replySnippet: string;
  caseTitle: string;
  onNavigate?: (caseId: string, commentId: string) => void;
  onDismiss?: (mentionId: string) => void;
  isRead?: boolean;
}

export function ModeratorReplyNotification({
  mention,
  moderatorName,
  replySnippet,
  caseTitle,
  onNavigate,
  onDismiss,
  isRead = false,
}: ModeratorReplyNotificationProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onNavigate?.(mention.caseId, mention.commentId)}
      style={{
        padding: '14px 16px',
        background: isRead ? '#ffffff' : '#faf5ff',
        border: `1px solid ${isRead ? '#e2e8f0' : '#c4b5fd'}`,
        borderRadius: '10px',
        cursor: 'pointer',
        transition: 'background 0.15s',
        boxShadow: isHovered ? '0 2px 8px rgba(124,58,237,0.08)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '16px',
              background: '#ede9fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: '700',
              color: '#7c3aed',
            }}
          >
            M
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{moderatorName}</span>
              <span
                style={{
                  fontSize: '9px',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: '#f5f3ff',
                  color: '#7c3aed',
                  fontWeight: '700',
                }}
              >
                MODERATOR
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
              Replied to your report
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isRead && (
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#7c3aed',
                flexShrink: 0,
              }}
            />
          )}
          {isHovered && onDismiss && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(mention.id);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: 1,
                padding: 0,
              }}
            >
              x
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: '12px',
          color: '#64748b',
          marginBottom: '6px',
        }}
      >
        On: <strong style={{ color: '#334155' }}>{caseTitle}</strong>
      </div>

      <div
        style={{
          padding: '10px 12px',
          background: '#ffffff',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          borderLeft: '3px solid #7c3aed',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
          &ldquo;{replySnippet}&rdquo;
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          {new Date(mention.createdAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate?.(mention.caseId, mention.commentId);
          }}
          style={{
            padding: '4px 12px',
            background: '#7c3aed',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          View Reply
        </button>
      </div>
    </div>
  );
}
