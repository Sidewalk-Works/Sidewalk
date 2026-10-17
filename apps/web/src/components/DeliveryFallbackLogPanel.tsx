"use client";

import React from 'react';
import type {
  DeliveryFailureLog,
} from '@sidewalk/shared';

interface DeliveryFallbackLogPanelProps {
  logs: DeliveryFailureLog[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  success: { bg: '#d1fae5', text: '#065f46' },
  failed: { bg: '#fee2e2', text: '#991b1b' },
};

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  push: 'Push',
  inApp: 'In-App',
};

export function DeliveryFallbackLogPanel({ logs }: DeliveryFallbackLogPanelProps) {
  if (logs.length === 0) {
    return (
      <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#0f172a' }}>Delivery Fallback Log</h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>No fallback attempts recorded yet.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>Delivery Fallback Log</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {logs.map((log) => (
          <div
            key={log.logId}
            style={{
              padding: '12px',
              background: log.finalStatus === 'delivered' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${log.finalStatus === 'delivered' ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                Notification: {log.notificationId}
              </span>
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: log.finalStatus === 'delivered' ? '#d1fae5' : '#fee2e2',
                color: log.finalStatus === 'delivered' ? '#065f46' : '#991b1b',
                fontWeight: '500',
              }}>
                {log.finalStatus === 'delivered' ? 'Delivered' : 'All channels failed'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
              Primary: {CHANNEL_LABELS[log.strategy.primaryChannel] ?? log.strategy.primaryChannel} &middot;
              Max retries: {log.strategy.maxRetries} &middot;
              Completed: {new Date(log.completedAtIso).toLocaleString()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {log.attempts.map((attempt) => {
                const colors = STATUS_COLORS[attempt.status] ?? STATUS_COLORS.pending;
                return (
                  <div
                    key={attempt.attemptId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: colors.bg,
                      color: colors.text,
                    }}
                  >
                    <span>
                      {CHANNEL_LABELS[attempt.channel] ?? attempt.channel}
                      {attempt.error ? ` — ${attempt.error}` : ''}
                    </span>
                    <span style={{ fontWeight: '500', textTransform: 'capitalize' }}>{attempt.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
