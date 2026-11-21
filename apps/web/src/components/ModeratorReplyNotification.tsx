"use client";

import React from "react";
import type { CommunityMention } from "@sidewalk/shared";

interface ModeratorReplyNotificationProps {
  mention: CommunityMention;
  moderatorName: string;
  replySnippet: string;
  onNavigate?: (caseId: string, commentId?: string) => void;
  onDismiss?: (mentionId: string) => void;
  isRead?: boolean;
}

const CONTEXT_LABELS: Record<CommunityMention["context"], string> = {
  comment: "Mentioned you in a comment",
  moderator_reply: "Replied to your report",
  status_update: "Updated a case you follow",
};

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

function formatTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ModeratorReplyNotification({
  mention,
  moderatorName,
  replySnippet,
  onNavigate,
  onDismiss,
  isRead = false,
}: ModeratorReplyNotificationProps) {
  const contextLabel = CONTEXT_LABELS[mention.context] ?? "New activity";
  const canNavigate = Boolean(onNavigate);

  return (
    <article
      className="sw-moderator-reply"
      style={{
        padding: "14px 16px",
        background: isRead ? "#ffffff" : "#faf5ff",
        border: `1px solid ${isRead ? "#e2e8f0" : "#c4b5fd"}`,
        borderRadius: "10px",
      }}
    >
      <style>{`
        .sw-moderator-reply { transition: box-shadow 0.15s ease, border-color 0.15s ease; }
        .sw-moderator-reply:hover { box-shadow: 0 2px 8px rgba(124,58,237,0.08); }
        .sw-moderator-reply:focus-within { outline: 2px solid #7c3aed; outline-offset: 2px; }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "16px",
              background: "#ede9fe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              fontWeight: 700,
              color: "#7c3aed",
              flexShrink: 0,
            }}
          >
            {getInitial(moderatorName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{moderatorName}</span>
              <span
                style={{
                  fontSize: "9px",
                  padding: "1px 5px",
                  borderRadius: "3px",
                  background: "#f5f3ff",
                  color: "#7c3aed",
                  fontWeight: 700,
                }}
              >
                MODERATOR
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "1px" }}>{contextLabel}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {!isRead && <span aria-label="Unread" style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#7c3aed" }} />}
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(mention.id)}
              aria-label={`Dismiss notification from ${moderatorName}`}
              style={{
                background: "transparent",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
                padding: "2px 4px",
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
        On: <strong style={{ color: "#334155" }}>{mention.caseTitle}</strong>
      </div>

      <div
        style={{
          padding: "10px 12px",
          background: "#ffffff",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
          borderLeft: "3px solid #7c3aed",
        }}
      >
        <p style={{ margin: 0, fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>
          &ldquo;{replySnippet}&rdquo;
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", gap: "8px" }}>
        <time style={{ fontSize: "11px", color: "#64748b" }}>{formatTimestamp(mention.createdAt)}</time>
        <button
          type="button"
          onClick={() => onNavigate?.(mention.caseId, mention.commentId)}
          disabled={!canNavigate}
          style={{
            padding: "4px 12px",
            background: canNavigate ? "#7c3aed" : "#cbd5e1",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: 500,
            cursor: canNavigate ? "pointer" : "not-allowed",
          }}
        >
          View reply
        </button>
      </div>
    </article>
  );
}
