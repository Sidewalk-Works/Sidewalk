"use client";

import { useState } from "react";
import type { NotificationDefaults } from "@sidewalk/shared";

interface NotificationDefaultsCardProps {
  userId?: string;
  onChange?: (defaults: NotificationDefaults) => void;
}

export function NotificationDefaultsCard({ onChange }: NotificationDefaultsCardProps) {
  const [defaults, setDefaults] = useState<NotificationDefaults>({
    email: false,
    push: false,
    inApp: true,
  });

  function toggle(channel: 'email' | 'push' | 'inApp') {
    setDefaults((prev) => {
      const next = { ...prev, [channel]: !prev[channel] };
      onChange?.(next);
      return next;
    });
  }

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#0f172a' }}>
        Notification Defaults
      </h3>
      <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
        By default, new accounts start with minimal notifications. Only in-app alerts are enabled.
        Opt in below to receive email or push notifications.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>Email Notifications</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Receive email summaries for activity</div>
          </div>
          <input
            type="checkbox"
            checked={defaults.email}
            onChange={() => toggle('email')}
          />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>Push Notifications</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Get real-time push alerts on your devices</div>
          </div>
          <input
            type="checkbox"
            checked={defaults.push}
            onChange={() => toggle('push')}
          />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>In-App Notifications</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Show alerts inside the app (always on by default)</div>
          </div>
          <input
            type="checkbox"
            checked={defaults.inApp}
            onChange={() => toggle('inApp')}
          />
        </label>
      </div>
    </div>
  );
}
