"use client";

import React from 'react';
import type { RealtimeStatusPayload } from '@sidewalk/shared';

interface StatusChangeToastProps {
  payload: RealtimeStatusPayload;
  onDismiss?: (id: string) => void;
  onViewCase?: (caseId: string) => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  submitted: { bg: '#eff6ff', text: '#1d4ed8', border: '#3b82f6' },
  under_review: { bg: '#fef3c7', text: '#b45309', border: '#f59e0b' },
  in_progress: { bg: '#f5f3ff', text: '#7c3aed', border: '#8b5cf6' },
  resolved: { bg: '#f0fdf4', text: '#15803d', border: '#22c55e' },
  closed: { bg: '#f8fafc', text: '#475569', border: '#6b7280' },
  reopened: { bg: '#fef2f2', text: '#b91c1c', border: '#ef4444' },
};

function getStatusStyle(status: string) {
  return STATUS_COLORS[status.toLowerCase()] ?? { bg: '#f1f5f9', text: '#334155', border: '#94a3b8' };
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function StatusChangeToast({
  payload,
  onDismiss,
  onViewCase,
}: StatusChangeToastProps) {
  const style = getStatusStyle(payload.newStatus);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: style.bg,
        color: style.text,
        padding: '14px 18px',
        borderRadius: '10px',
        borderLeft: `4px solid ${style.border}`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        minWidth: '320px',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Case Status Updated</div>
        <span style={{ fontSize: '11px', opacity: 0.7 }}>{formatTime(payload.updatedAtIso)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'rgba(0,0,0,0.06)',
            fontSize: '12px',
            fontWeight: '600',
            textTransform: 'capitalize',
          }}
        >
          {payload.newStatus.replace('_', ' ')}
        </span>
        <span style={{ fontSize: '12px', opacity: 0.7 }}>Case {payload.caseId}</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {onViewCase && (
          <button
            onClick={() => onViewCase(payload.caseId)}
            style={{
              padding: '6px 14px',
              background: style.border,
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            View Case
          </button>
        )}
        {onDismiss && (
          <button
            onClick={() => onDismiss(payload.toast.id)}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              color: style.text,
              border: `1px solid ${style.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
