import React, { useState } from 'react';
import type { EmailDigestTemplate } from '@qyou/shared';

type DigestFrequency = 'daily' | 'weekly';

interface CategoryBreakdown {
  category: string;
  count: number;
  color: string;
}

interface EnhancedEmailDigestTemplate extends EmailDigestTemplate {
  frequency: DigestFrequency;
  categoryBreakdown?: CategoryBreakdown[];
}

interface EmailDigestPreviewProps {
  template: EnhancedEmailDigestTemplate;
  onSnooze?: (days: number) => void;
}

const FREQUENCY_LABELS: Record<DigestFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
};

const SNOOZE_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 30, label: '1 month' },
];

export function EmailDigestPreview({ template, onSnooze }: EmailDigestPreviewProps) {
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedFrequency, setSelectedFrequency] = useState<DigestFrequency>(template.frequency);
  const [showSnooze, setShowSnooze] = useState(false);

  const breakdown = template.categoryBreakdown ?? [
    { category: 'New Reports', count: template.items.filter((i) => i.category === 'new').length || 3, color: '#3b82f6' },
    { category: 'Status Changes', count: template.items.filter((i) => i.category === 'status').length || 2, color: '#f59e0b' },
    { category: 'Resolutions', count: template.items.filter((i) => i.category === 'resolved').length || 1, color: '#10b981' },
  ];

  const totalCount = breakdown.reduce((sum, b) => sum + b.count, 0);

  const sampleTemplate: EnhancedEmailDigestTemplate = previewMode
    ? {
        ...template,
        frequency: selectedFrequency,
        items: [
          { id: 'sample-1', category: 'New Reports', title: 'Pothole on Main Street', description: 'A new pothole report was submitted near downtown.' },
          { id: 'sample-2', category: 'Status Changes', title: 'Broken Streetlight Updated', description: 'Status changed from "Submitted" to "Under Review".' },
          { id: 'sample-3', category: 'Resolutions', title: 'Graffiti Cleanup Completed', description: 'The reported graffiti has been removed.' },
        ],
        categoryBreakdown: [
          { category: 'New Reports', count: 5, color: '#3b82f6' },
          { category: 'Status Changes', count: 3, color: '#f59e0b' },
          { category: 'Resolutions', count: 2, color: '#10b981' },
        ],
      }
    : template;

  return (
    <div style={{ padding: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ color: '#0f172a', margin: 0, fontSize: '20px' }}>
          Your {FREQUENCY_LABELS[sampleTemplate.frequency]} Civic Update, {sampleTemplate.recipient.name}
        </h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setPreviewMode(!previewMode)}
            style={{
              padding: '4px 10px',
              background: previewMode ? '#3b82f6' : '#f1f5f9',
              color: previewMode ? '#fff' : '#64748b',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            {previewMode ? 'Live' : 'Preview'}
          </button>
          <select
            value={selectedFrequency}
            onChange={(e) => setSelectedFrequency(e.target.value as DigestFrequency)}
            style={{
              padding: '4px 8px',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#334155',
            }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', padding: '12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '13px', color: '#64748b', marginRight: 'auto' }}>
          <strong style={{ color: '#1e293b' }}>{totalCount}</strong> updates this {sampleTemplate.frequency === 'weekly' ? 'week' : 'day'}
        </div>
        {breakdown.map((b) => (
          <div key={b.category} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#334155' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: b.color }} />
            {b.category}: {b.count}
          </div>
        ))}
      </div>

      <div style={{ borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', marginBottom: '16px' }} />

      <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {sampleTemplate.items.map((item) => (
          <li key={item.id} style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
            <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>
              {item.category}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
              {item.title}
            </div>
            <div style={{ fontSize: '14px', color: '#334155', lineHeight: '1.5' }}>
              {item.description}
            </div>
          </li>
        ))}
      </ul>

      {onSnooze && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showSnooze ? '8px' : 0 }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Snooze this digest</span>
            <button
              onClick={() => setShowSnooze(!showSnooze)}
              style={{
                padding: '4px 10px',
                background: '#f1f5f9',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {showSnooze ? 'Cancel' : 'Snooze'}
            </button>
          </div>
          {showSnooze && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {SNOOZE_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => {
                    onSnooze(opt.days);
                    setShowSnooze(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#f8fafc',
                    color: '#334155',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
        Sent to {sampleTemplate.recipient.email} • Generated at {new Date(sampleTemplate.generatedAtIso).toLocaleString()}
      </div>
    </div>
  );
}
