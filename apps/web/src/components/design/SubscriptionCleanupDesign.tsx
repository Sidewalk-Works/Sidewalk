import React from 'react';

const CLEANUP_RULES = [
  { name: 'Close on report merge', description: 'When duplicate reports are merged, unsubscribe watchers from the closed report', enabled: true },
  { name: 'Remove on report close', description: 'Automatically remove subscriptions when a report is marked resolved', enabled: true },
  { name: 'Archive stale subscriptions', description: 'Archive subscriptions for reports with no activity for 90 days', enabled: false },
  { name: 'Prune deleted reports', description: 'Remove all subscriptions when a report is permanently deleted', enabled: true },
];

const CLEANUP_LOG = [
  { action: 'Removed 3 subscriptions', target: 'Report #392 (merged)', date: '2026-07-26', rule: 'Close on report merge' },
  { action: 'Archived 12 subscriptions', target: 'Stale reports (90d+)', date: '2026-07-20', rule: 'Archive stale subscriptions' },
  { action: 'Removed 1 subscription', target: 'Report #380 (resolved)', date: '2026-07-18', rule: 'Remove on report close' },
];

const PREVIEW_ITEMS = [
  { type: 'merge', label: '2 subscriptions will be removed (pending merge)', severity: 'info' },
  { type: 'stale', label: '8 subscriptions inactive for 90+ days', severity: 'warning' },
  { type: 'close', label: '1 subscription on resolved report', severity: 'info' },
];

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  info: { bg: '#e0f2fe', text: '#0369a1' },
  warning: { bg: '#fef3c7', text: '#b45309' },
};

export function SubscriptionCleanupDesign() {
  return (
    <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', maxWidth: '640px' }}>
      <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a' }}>Subscription Cleanup</h2>
      <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b' }}>Automatically clean up subscriptions when reports change state or become inactive.</p>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>Cleanup Rules</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {CLEANUP_RULES.map((rule) => (
            <div key={rule.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{rule.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{rule.description}</div>
              </div>
              <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: rule.enabled ? '#22c55e' : '#cbd5e1', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: rule.enabled ? '18px' : '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>Cleanup Preview</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {PREVIEW_ITEMS.map((item, i) => {
            const sc = SEVERITY_COLORS[item.severity];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: sc.bg, borderRadius: '6px', fontSize: '13px', color: sc.text }}>
                <span>{item.type === 'stale' ? '\u23F0' : '\u2139\uFE0F'}</span>
                {item.label}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <button style={{ padding: '10px 20px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          Run Cleanup Now
        </button>
      </div>

      <div>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>Recent Cleanup History</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {CLEANUP_LOG.map((entry, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < CLEANUP_LOG.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#0f172a' }}>{entry.action}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{entry.target} &middot; {entry.rule}</div>
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{entry.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
