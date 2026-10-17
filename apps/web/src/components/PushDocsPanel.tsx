import React, { useState, useCallback } from 'react';

type PermissionState = 'granted' | 'denied' | 'default';

interface DeviceRegistration {
  deviceToken: string;
  platform: 'ios' | 'android' | 'web';
  optIn: boolean;
}

export function PushDocsPanel() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>('default');
  const [deviceToken, setDeviceToken] = useState('');
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web');
  const [optOut, setOptOut] = useState(false);
  const [showOptOutConfirm, setShowOptOutConfirm] = useState(false);
  const [lastRegisteredAt, setLastRegisteredAt] = useState<string | null>(null);

  const handleRegister = useCallback(async () => {
    if (!deviceToken.trim()) return;

    try {
      if ('Notification' in window) {
        const result = await Notification.requestPermission();
        setPermissionState(result as PermissionState);
        if (result !== 'granted') return;
      }
    } catch {
      // Non-browser environment — proceed without permission API
    }

    const registration: DeviceRegistration = {
      deviceToken: deviceToken.trim(),
      platform,
      optIn: true,
    };

    setIsRegistered(true);
    setOptOut(false);
    setLastRegisteredAt(new Date().toISOString());
    setDeviceToken('');
  }, [deviceToken, platform]);

  const handleRevoke = useCallback(() => {
    setIsRegistered(false);
    setPermissionState('default');
    setLastRegisteredAt(null);
  }, []);

  const handleOptOutToggle = useCallback(() => {
    if (optOut) {
      setOptOut(false);
      setShowOptOutConfirm(false);
      return;
    }
    setShowOptOutConfirm(true);
  }, [optOut]);

  const confirmOptOut = useCallback(() => {
    setOptOut(true);
    setShowOptOutConfirm(false);
  }, []);

  const statusColor = isRegistered
    ? optOut
      ? '#f59e0b'
      : '#22c55e'
    : '#94a3b8';

  const statusLabel = isRegistered
    ? optOut
      ? 'Registered but opted out of push notifications'
      : 'Device is registered for push alerts'
    : 'Device is NOT registered';

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>
        Mobile Push Device Management
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusColor,
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: '14px', color: '#334155' }}>{statusLabel}</span>
        </div>

        {permissionState !== 'default' && (
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Push permission: <strong>{permissionState}</strong>
          </div>
        )}

        {lastRegisteredAt && (
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Last registered: {new Date(lastRegisteredAt).toLocaleString()}
          </div>
        )}

        {!isRegistered && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#475569' }}>Device Token</label>
            <input
              type="text"
              value={deviceToken}
              onChange={(e) => setDeviceToken(e.target.value)}
              placeholder="Enter device token"
              style={{
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <label style={{ fontSize: '13px', color: '#475569' }}>Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as 'ios' | 'android' | 'web')}
              style={{
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
              }}
            >
              <option value="web">Web</option>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!isRegistered ? (
            <button
              onClick={handleRegister}
              disabled={!deviceToken.trim()}
              style={{
                padding: '8px 16px',
                background: !deviceToken.trim() ? '#cbd5e1' : '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: !deviceToken.trim() ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '500',
              }}
            >
              Register Device
            </button>
          ) : (
            <>
              <button
                onClick={handleRevoke}
                style={{
                  padding: '8px 16px',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                }}
              >
                Revoke Push Access
              </button>
              <button
                onClick={handleOptOutToggle}
                style={{
                  padding: '8px 16px',
                  background: optOut ? '#22c55e' : '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                }}
              >
                {optOut ? 'Opt Back In' : 'Opt Out of Push'}
              </button>
            </>
          )}
        </div>

        {showOptOutConfirm && (
          <div
            style={{
              padding: '12px',
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <p style={{ margin: 0, fontSize: '13px', color: '#92400e' }}>
              Are you sure you want to opt out of push notifications? You will still receive in-app notifications.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={confirmOptOut}
                style={{
                  padding: '6px 12px',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Yes, Opt Out
              </button>
              <button
                onClick={() => setShowOptOutConfirm(false)}
                style={{
                  padding: '6px 12px',
                  background: '#e2e8f0',
                  color: '#334155',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
