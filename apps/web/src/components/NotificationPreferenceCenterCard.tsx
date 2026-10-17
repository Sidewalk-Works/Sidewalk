import React, { useEffect, useState } from 'react';
import type { NotificationCategoryPreferences, ModerationEventChannels } from '@qyou/shared';

interface NotificationPreferenceCenterCardProps {
  userId: string;
}

const CATEGORY_META: { key: keyof NotificationCategoryPreferences; label: string; description: string }[] = [
  { key: 'reportStatusChanges', label: 'Report Status Updates', description: 'Alerts when civic cases change status' },
  { key: 'moderationActions', label: 'Moderation & Flag Events', description: 'Content moderation feedback alerts' },
  { key: 'communityReplies', label: 'Community Replies', description: 'Replies to your reports and comments' },
  { key: 'neighborhoodAlerts', label: 'Neighborhood Alerts', description: 'Alerts for your neighborhood area' },
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

export function NotificationPreferenceCenterCard({ userId }: NotificationPreferenceCenterCardProps) {
  const [preferences, setPreferences] = useState<NotificationCategoryPreferences>(buildDefaultPreferences);
  const [savedPreferences, setSavedPreferences] = useState<NotificationCategoryPreferences>(buildDefaultPreferences);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Stub: in production, fetch from API via useNotificationPreferences(userId)
    const loaded = buildDefaultPreferences();
    setPreferences(loaded);
    setSavedPreferences(loaded);
  }, [userId]);

  const handleToggle = (category: keyof NotificationCategoryPreferences, channel: keyof ModerationEventChannels) => {
    setPreferences((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !prev[category][channel],
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    setSavedPreferences(preferences);
    setHasChanges(false);
  };

  const handleDiscard = () => {
    setPreferences(savedPreferences);
    setHasChanges(false);
  };

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>Notification Preferences</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {CATEGORY_META.map(({ key, label, description }) => (
          <div key={key} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{label}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{description}</div>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              {CHANNEL_META.map(({ channel, label: chLabel }) => (
                <label key={channel} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={preferences[key][channel]}
                    onChange={() => handleToggle(key, channel)}
                  />
                  {chLabel}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {hasChanges && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleDiscard}
            style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#ffffff', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
          >
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}
