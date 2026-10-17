import React, { useEffect, useState } from 'react';
import type { NotificationCategoryPreferences, ModerationEventChannels } from '@qyou/shared';

interface DeliveryChannelControlsPanelProps {
  userId: string;
}

type DigestFrequency = 'daily' | 'weekly' | 'none';

const CATEGORY_META: { key: keyof NotificationCategoryPreferences; label: string }[] = [
  { key: 'reportStatusChanges', label: 'Report Status Updates' },
  { key: 'moderationActions', label: 'Moderation & Flag Events' },
  { key: 'communityReplies', label: 'Community Replies' },
  { key: 'neighborhoodAlerts', label: 'Neighborhood Alerts' },
];

const CHANNEL_META: { channel: keyof ModerationEventChannels; label: string }[] = [
  { channel: 'email', label: 'Email' },
  { channel: 'push', label: 'Push' },
  { channel: 'inApp', label: 'In-App' },
];

function buildDefaultPreferences(): NotificationCategoryPreferences {
  const channels = { email: true, push: true, inApp: true };
  return {
    reportStatusChanges: { ...channels },
    moderationActions: { ...channels },
    communityReplies: { ...channels },
    neighborhoodAlerts: { ...channels },
  };
}

export function DeliveryChannelControlsPanel({ userId }: DeliveryChannelControlsPanelProps) {
  const [preferences, setPreferences] = useState<NotificationCategoryPreferences>(buildDefaultPreferences);
  const [savedPreferences, setSavedPreferences] = useState<NotificationCategoryPreferences>(buildDefaultPreferences);
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>('daily');
  const [savedDigestFrequency, setSavedDigestFrequency] = useState<DigestFrequency>('daily');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    // Stub: in production, fetch from API
    const loaded = buildDefaultPreferences();
    setPreferences(loaded);
    setSavedPreferences(loaded);
  }, [userId]);

  const hasChanges = JSON.stringify(preferences) !== JSON.stringify(savedPreferences) || digestFrequency !== savedDigestFrequency;

  const handleChannelToggle = (category: keyof NotificationCategoryPreferences, channel: keyof ModerationEventChannels) => {
    setPreferences((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !prev[category][channel],
      },
    }));
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    // Stub: in production, POST to API
    await new Promise((r) => setTimeout(r, 400));
    setSavedPreferences(preferences);
    setSavedDigestFrequency(digestFrequency);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>Delivery Channel Controls</h3>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155' }}>
          <span style={{ fontWeight: '500' }}>Digest Frequency:</span>
          <select
            value={digestFrequency}
            onChange={(e) => setDigestFrequency(e.target.value as DigestFrequency)}
            style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="none">None</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {CATEGORY_META.map(({ key, label }) => (
          <div key={key} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>{label}</div>
            <div style={{ display: 'flex', gap: '16px' }}>
              {CHANNEL_META.map(({ channel, label: chLabel }) => (
                <label key={channel} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={preferences[key][channel]}
                    onChange={() => handleChannelToggle(key, channel)}
                  />
                  {chLabel}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '16px', gap: '8px' }}>
        {saveStatus === 'saved' && (
          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: '500' }}>Saved successfully</span>
        )}
        <button
          onClick={handleSave}
          disabled={!hasChanges || saveStatus === 'saving'}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: hasChanges && saveStatus !== 'saving' ? '#3b82f6' : '#94a3b8',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: '500',
            cursor: hasChanges && saveStatus !== 'saving' ? 'pointer' : 'default',
            opacity: saveStatus === 'saving' ? 0.7 : 1,
          }}
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
