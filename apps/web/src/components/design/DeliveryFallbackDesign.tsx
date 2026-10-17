import React from 'react';

const fallbackAttempts = [
  { channel: 'Email', status: 'failed', attemptedAt: '10:30:01 AM', detail: 'SMTP timeout after 30s' },
  { channel: 'Push', status: 'success', attemptedAt: '10:30:32 AM', detail: 'Delivered to device token abc123' },
  { channel: 'In-App', status: 'skipped', attemptedAt: '—', detail: 'Skipped: push succeeded' },
];

const channelStatusGrid = [
  { channel: 'Email', success: 42, failed: 7, pending: 2 },
  { channel: 'Push', success: 56, failed: 3, pending: 1 },
  { channel: 'In-App', success: 38, failed: 0, pending: 4 },
];

const deliveryBanner = { status: 'delivered', message: 'Your alert was delivered via Push Notification at 10:30 AM.' };

export function DeliveryFallbackDesign() {
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px', maxWidth: '820px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Delivery Fallback Design</h2>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '28px' }}>Cascade flow, retry logic, and delivery status UI</p>

      {/* Delivery Flow Diagram */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Delivery Cascade Flow</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0' }}>
          {[
            { label: 'Email', icon: '📧', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
            { label: 'Push', icon: '📲', color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
            { label: 'In-App', icon: '🔔', color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' },
          ].map((ch, i) => (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '16px 20px', background: ch.bg, border: `1px solid ${ch.border}`, borderRadius: '10px', minWidth: '120px' }}>
                <span style={{ fontSize: '24px' }}>{ch.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: ch.color }}>{ch.label}</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Attempt {i + 1}</span>
              </div>
              {i < 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 6px' }}>
                  <span style={{ fontSize: '18px', color: '#94a3b8' }}>→</span>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>if fails</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* Fallback Attempt Log */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fallback Attempt Log</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          {fallbackAttempts.map((a, i) => {
            const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
              failed: { bg: '#fef2f2', text: '#991b1b', dot: '#ef4444' },
              success: { bg: '#f0fdf4', text: '#166534', dot: '#22c55e' },
              skipped: { bg: '#f8fafc', text: '#64748b', dot: '#cbd5e1' },
            };
            const s = statusColors[a.status];
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 90px 1fr 1fr', alignItems: 'center', padding: '10px 14px', borderBottom: i < fallbackAttempts.length - 1 ? '1px solid #f1f5f9' : 'none', background: '#fff', fontSize: '13px' }}>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{a.channel}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.dot }} />
                  <span style={{ padding: '1px 7px', borderRadius: '4px', background: s.bg, color: s.text, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{a.status}</span>
                </span>
                <span style={{ color: '#64748b' }}>{a.attemptedAt}</span>
                <span style={{ color: '#475569', fontSize: '12px' }}>{a.detail}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Channel Status Grid */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Channel Status Grid</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 14px', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
            <span>Channel</span>
            <span style={{ color: '#16a34a' }}>✓ Success</span>
            <span style={{ color: '#dc2626' }}>✗ Failed</span>
            <span style={{ color: '#d97706' }}>◦ Pending</span>
          </div>
          {channelStatusGrid.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', padding: '10px 14px', borderBottom: i < channelStatusGrid.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: '13px', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{row.channel}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ height: '6px', borderRadius: '3px', background: '#dcfce7', width: '100%', position: 'relative' }}>
                  <div style={{ height: '100%', borderRadius: '3px', background: '#22c55e', width: `${(row.success / 60) * 100}%` }} />
                </div>
                <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600, minWidth: '20px' }}>{row.success}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ height: '6px', borderRadius: '3px', background: '#fee2e2', width: '100%', position: 'relative' }}>
                  <div style={{ height: '100%', borderRadius: '3px', background: '#ef4444', width: `${(row.failed / 60) * 100}%` }} />
                </div>
                <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: 600, minWidth: '20px' }}>{row.failed}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ height: '6px', borderRadius: '3px', background: '#fef3c7', width: '100%', position: 'relative' }}>
                  <div style={{ height: '100%', borderRadius: '3px', background: '#f59e0b', width: `${(row.pending / 60) * 100}%` }} />
                </div>
                <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600, minWidth: '20px' }}>{row.pending}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Retry Countdown Timer */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Retry Countdown</h3>
        <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#92400e' }}>0:47</div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>Next retry in 47 seconds</div>
            <div style={{ fontSize: '12px', color: '#a16207', marginTop: '2px' }}>Email delivery failed. Will retry via Push Notification.</div>
          </div>
          <button style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: '12px', fontWeight: 600, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Retry Now</button>
        </div>
      </section>

      {/* User-Facing Delivery Status Banner */}
      <section>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>User-Facing Delivery Status</h3>
        <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>✅</span>
          <span style={{ fontSize: '13px', color: '#166534', flex: 1 }}>{deliveryBanner.message}</span>
          <span style={{ fontSize: '11px', color: '#86efac' }}>Delivered</span>
        </div>
        <div style={{ marginTop: '8px', padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>⚠️</span>
          <span style={{ fontSize: '13px', color: '#991b1b', flex: 1 }}>Email delivery failed. We'll try again in 5 minutes.</span>
          <span style={{ fontSize: '11px', color: '#fca5a5' }}>Retry pending</span>
        </div>
      </section>
    </div>
  );
}
