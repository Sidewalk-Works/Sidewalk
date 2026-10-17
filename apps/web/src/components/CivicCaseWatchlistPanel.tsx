import React, { useState, useMemo } from 'react';
import type { CivicWatchlistItem } from '@qyou/shared';

type FollowUpStatus = 'active_review' | 'pending_city_response' | 'resolved';

interface EnhancedWatchlistItem extends CivicWatchlistItem {
  followUpStatus: FollowUpStatus;
  addedAt: string;
}

interface CivicCaseWatchlistPanelProps {
  items?: EnhancedWatchlistItem[];
  onRemoveItem?: (caseId: string) => void;
  onAddItem?: (caseId: string) => void;
}

const STATUS_CONFIG: Record<FollowUpStatus, { label: string; bg: string; color: string }> = {
  active_review: { label: 'Active Review', bg: '#dbeafe', color: '#1d4ed8' },
  pending_city_response: { label: 'Pending City', bg: '#fef3c7', color: '#b45309' },
  resolved: { label: 'Resolved', bg: '#d1fae5', color: '#047857' },
};

const SORT_OPTIONS = [
  { value: 'added_desc', label: 'Newest First' },
  { value: 'added_asc', label: 'Oldest First' },
] as const;

export function CivicCaseWatchlistPanel({
  items = [],
  onRemoveItem,
  onAddItem,
}: CivicCaseWatchlistPanelProps) {
  const [statusFilter, setStatusFilter] = useState<FollowUpStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'added_desc' | 'added_asc'>('added_desc');

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== 'all') {
      result = result.filter((item) => item.followUpStatus === statusFilter);
    }
    return [...result].sort((a, b) => {
      const diff = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      return sortBy === 'added_desc' ? -diff : diff;
    });
  }, [items, statusFilter, sortBy]);

  const totalCount = items.length;
  const activeCount = items.filter(
    (i) => i.followUpStatus === 'active_review' || i.followUpStatus === 'pending_city_response',
  ).length;

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Watched Civic Cases</h3>
        {onAddItem && (
          <button
            onClick={() => onAddItem('new_case')}
            style={{
              padding: '6px 12px',
              background: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            + Add Case
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '13px', color: '#64748b' }}>
        <span>Total: <strong style={{ color: '#1e293b' }}>{totalCount}</strong></span>
        <span>Active: <strong style={{ color: '#3b82f6' }}>{activeCount}</strong></span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FollowUpStatus | 'all')}
          style={{
            padding: '6px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#334155',
            background: '#ffffff',
          }}
        >
          <option value="all">All Statuses</option>
          <option value="active_review">Active Review</option>
          <option value="pending_city_response">Pending City Response</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          style={{
            padding: '6px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#334155',
            background: '#ffffff',
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#64748b' }}>
          {items.length === 0
            ? 'No civic cases currently added to your watchlist.'
            : 'No cases match the current filter.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((item) => {
            const badge = STATUS_CONFIG[item.followUpStatus];
            return (
              <div
                key={item.caseId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>
                      {item.title}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        background: badge.bg,
                        color: badge.color,
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    📍 {item.neighborhood} | Category: {item.category}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                    Added {new Date(item.addedAt).toLocaleDateString()}
                  </div>
                </div>
                {onRemoveItem && (
                  <button
                    onClick={() => onRemoveItem(item.caseId)}
                    style={{
                      padding: '4px 8px',
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Unwatch
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
