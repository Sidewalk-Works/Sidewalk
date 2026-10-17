"use client";

import React, { useState } from 'react';
import type {
  AlertPreviewPayload,
} from '@sidewalk/shared';

interface AlertPreviewExplainerCardProps {
  preview: AlertPreviewPayload;
  onOpenPreferences?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  report_author: 'Report author',
  subscribed_category: 'Subscribed category',
  neighborhood_proximity: 'Neighborhood proximity',
  community_mention: 'Community mention',
};

export function AlertPreviewExplainerCard({ preview, onOpenPreferences }: AlertPreviewExplainerCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const categoryLabel = CATEGORY_LABELS[preview.category] ?? 'Notification';

  return (
    <div style={{ padding: '16px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', color: '#0f172a', fontWeight: '600' }}>{preview.headline}</h4>
        <span style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '12px',
          background: '#f1f5f9',
          color: '#475569',
          whiteSpace: 'nowrap',
        }}>
          {categoryLabel}
        </span>
      </div>
      <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
        {preview.bodySnippet}
      </p>
      <div
        style={{
          padding: '10px 14px',
          background: '#eff6ff',
          borderLeft: '3px solid #3b82f6',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#1e40af',
          cursor: 'pointer',
        }}
        onClick={() => setShowDetails((prev) => !prev)}
      >
        <div style={{ fontWeight: '600', marginBottom: showDetails ? '6px' : 0 }}>
          Why you got this alert
        </div>
        {showDetails && (
          <>
            <p style={{ margin: '0 0 8px 0', lineHeight: '1.5' }}>
              {preview.explainerCopy}
            </p>
            <p style={{ margin: '0 0 6px 0', fontSize: '11px', color: '#64748b' }}>
              Generated {new Date(preview.generatedAtIso).toLocaleString()}
            </p>
            {onOpenPreferences && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPreferences();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Change your notification preferences
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
