"use client";

import React, { useState } from 'react';
import type { BannerNotificationType, RealtimeStatusPayload } from '@sidewalk/shared';

interface StatusChangeEvent {
  id: string;
  caseId: string;
  caseTitle: string;
  oldStatus: string;
  newStatus: string;
  timestamp: string;
  actorName?: string;
}

interface StatusChangeBannerGroupProps {
  events: StatusChangeEvent[];
  onDismiss?: (id: string) => void;
  onViewCase?: (caseId: string) => void;
  maxVisible?: number;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: '#3b82f6',
  under_review: '#f59e0b',
  in_progress: '#8b5cf6',
  resolved: '#22c55e',
  closed: '#6b7280',
  reopened: '#ef4444',
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status.toLowerCase()] ?? '#6b7280';
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function StatusChangeBannerGroup({
  events,
  onDismiss,
  onViewCase,
  maxVisible = 5,
}: StatusChangeBannerGroupProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visibleEvents = events
    .filter((e) => !dismissedIds.has(e.id))
    .slice(0, maxVisible);

  if (visibleEvents.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    onDismiss?.(id);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginBottom: '16px',
      }}
    >
      {visibleEvents.map((event) => {
        const bannerColor = getStatusColor(event.newStatus);
        return (
          <div
            key={event.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 20px',
              background: bannerColor,
              color: '#ffffff',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}>
                <span style={{ opacity: 0.9 }}>{event.caseTitle}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    textTransform: 'capitalize',
                    fontSize: '12px',
                  }}
                >
                  {event.oldStatus.replace('_', ' ')}
                </span>
                <span style={{ opacity: 0.7, fontSize: '12px' }}>-></span>
                <span
                  style={{
                    background: 'rgba(255,255,255,0.3)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    textTransform: 'capitalize',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}
                >
                  {event.newStatus.replace('_', ' ')}
                </span>
                {event.actorName && (
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>by {event.actorName}</span>
                )}
              </div>
              <span style={{ fontSize: '11px', opacity: 0.7 }}>{formatTimestamp(event.timestamp)}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '16px' }}>
              {onViewCase && (
                <button
                  onClick={() => onViewCase(event.caseId)}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(255,255,255,0.2)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  View
                </button>
              )}
              <button
                onClick={() => handleDismiss(event.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                  opacity: 0.7,
                }}
              >
                x
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
