import React, { useState } from 'react';

const SYNC_STATUS = {
  synced: { color: '#22c55e', label: 'Synced' },
  syncing: { color: '#f59e0b', label: 'Syncing…' },
  conflict: { color: '#ef4444', label: 'Conflict' },
} as const;

type SyncState = keyof typeof SYNC_STATUS;

const devices = [
  { id: 'dev-1', name: 'iPhone 15 Pro', os: 'ios' as const, status: 'synced' as SyncState, lastSync: '2 min ago' },
  { id: 'dev-2', name: 'MacBook Air M2', os: 'web' as const, status: 'synced' as SyncState, lastSync: '5 min ago' },
  { id: 'dev-3', name: 'Pixel 8', os: 'android' as const, status: 'conflict' as SyncState, lastSync: '1 hr ago' },
];

const timeline = [
  { version: 'v3', changedAt: '2:14 PM', changedBy: 'MacBook Air M2', changes: 'Push alerts toggled on' },
  { version: 'v2', changedAt: '1:42 PM', changedBy: 'Pixel 8', changes: 'Email digest changed to weekly' },
  { version: 'v1', changedAt: '11:30 AM', changedBy: 'iPhone 15 Pro', changes: 'Initial settings saved' },
];

const conflictLeft = { device: 'MacBook Air M2', emailDigest: 'Daily', pushAlerts: true };
const conflictRight = { device: 'Pixel 8', emailDigest: 'Weekly', pushAlerts: false };

export function SettingsPersistenceDesign() {
  const [syncing, setSyncing] = useState(false);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 2000);
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px', maxWidth: '820px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Settings Persistence Design</h2>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '28px' }}>Multi-device sync, conflict resolution, and version history</p>

      {/* Sync Status Indicator */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sync Status Indicator</h3>
        <div style={{ display: 'flex', gap: '16px' }}>
          {(Object.entries(SYNC_STATUS) as [SyncState, { color: string; label: string }][]).map(([key, { color, label }]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', flex: 1 }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, boxShadow: key === 'syncing' ? `0 0 6px ${color}` : 'none', animation: key === 'syncing' ? 'pulse 1.5s infinite' : 'none' }} />
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Device List */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Connected Devices</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          {devices.map((d, i) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', borderBottom: i < devices.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>{d.os === 'ios' ? '📱' : d.os === 'android' ? '🤖' : '💻'}</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{d.name}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>Last synced {d.lastSync}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: SYNC_STATUS[d.status].color }} />
                <span style={{ fontSize: '12px', color: '#64748b' }}>{SYNC_STATUS[d.status].label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Last Updated Display */}
      <section style={{ marginBottom: '32px', padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '14px' }}>✅</span>
        <span style={{ fontSize: '13px', color: '#166534' }}>Last updated on <strong>MacBook Air M2</strong> at <strong>2:14 PM</strong></span>
      </section>

      {/* Conflict Resolution */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conflict Resolution</h3>
        <div style={{ border: '2px solid #fecaca', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#fef2f2', padding: '10px 16px', borderBottom: '1px solid #fecaca', fontSize: '13px', color: '#991b1b', fontWeight: 600 }}>
            ⚠️ Settings conflict detected between two devices
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#e2e8f0' }}>
            {[conflictLeft, conflictRight].map((side, idx) => (
              <div key={idx} style={{ background: '#fff', padding: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '10px', textTransform: 'uppercase' }}>{side.device}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#f8fafc', borderRadius: '4px' }}>
                    <span style={{ fontSize: '13px', color: '#475569' }}>Email Digest</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{side.emailDigest}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#f8fafc', borderRadius: '4px' }}>
                    <span style={{ fontSize: '13px', color: '#475569' }}>Push Alerts</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{side.pushAlerts ? 'On' : 'Off'}</span>
                  </div>
                </div>
                <button style={{ marginTop: '12px', width: '100%', padding: '8px', fontSize: '12px', fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', color: '#334155', cursor: 'pointer' }}>
                  Use this version
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Manual Sync Button */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Manual Sync</h3>
        <button onClick={handleSync} disabled={syncing} style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 600, background: syncing ? '#93c5fd' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: syncing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {syncing && <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
          {syncing ? 'Syncing…' : 'Sync All Devices'}
        </button>
      </section>

      {/* Version History Timeline */}
      <section>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Settings Version History</h3>
        <div style={{ position: 'relative', paddingLeft: '24px' }}>
          <div style={{ position: 'absolute', left: '8px', top: '4px', bottom: '4px', width: '2px', background: '#e2e8f0' }} />
          {timeline.map((t, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: i < timeline.length - 1 ? '16px' : 0 }}>
              <div style={{ position: 'absolute', left: '-20px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: i === 0 ? '#3b82f6' : '#cbd5e1', border: '2px solid #fff' }} />
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{t.version}</span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{t.changedAt}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{t.changedBy}</div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>{t.changes}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
