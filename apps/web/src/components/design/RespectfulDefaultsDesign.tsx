import React from 'react';

const USER_TIERS = [
  {
    tier: 'Anonymous',
    description: 'Not signed in',
    defaults: ['In-app only for session', 'No email', 'No push'],
    color: '#f1f5f9',
    textColor: '#475569',
  },
  {
    tier: 'New User',
    description: 'Signed up, no activity yet',
    defaults: ['In-app notifications', 'Email for critical only', 'No push'],
    color: '#e0f2fe',
    textColor: '#0369a1',
  },
  {
    tier: 'Registered User',
    description: 'Active contributor',
    defaults: ['All channels enabled', 'Email digest daily', 'Push for mentions'],
    color: '#dcfce7',
    textColor: '#15803d',
  },
];

const PROGRESSIVE_OPTIONS = [
  { label: 'Email digest frequency', shownAt: 'new_user', options: ['Off', 'Daily', 'Weekly'] },
  { label: 'Push notification types', shownAt: 'new_user', options: ['Mentions only', 'All activity'] },
  { label: 'Quiet hours', shownAt: 'registered', options: ['Off', '10pm\u20138am', 'Custom'] },
  { label: 'Channel-specific rules', shownAt: 'registered', options: ['Default', 'Custom'] },
];

export function RespectfulDefaultsDesign() {
  return (
    <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', maxWidth: '680px' }}>
      <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a' }}>Respectful Defaults</h2>
      <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#64748b' }}>Minimal, privacy-first notification defaults that expand as users engage.</p>

      <div style={{ marginBottom: '28px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>Default Settings by User Tier</h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          {USER_TIERS.map((tier) => (
            <div key={tier.tier} style={{ flex: 1, padding: '16px', background: tier.color, borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: tier.textColor, marginBottom: '4px' }}>{tier.tier}</div>
              <div style={{ fontSize: '12px', color: tier.textColor, opacity: 0.7, marginBottom: '12px' }}>{tier.description}</div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: tier.textColor }}>
                {tier.defaults.map((d) => <li key={d} style={{ marginBottom: '4px' }}>{d}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '28px', padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>Why minimal by default?</div>
        <div style={{ fontSize: '13px', color: '#78350f' }}>
          We believe notifications should earn your attention. New users start with the least intrusive settings. As you contribute, more options unlock \u2014 never surprises.
        </div>
      </div>

      <div style={{ marginBottom: '28px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>Progressive Disclosure</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {PROGRESSIVE_OPTIONS.map((opt) => (
            <div key={opt.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{opt.label}</span>
                <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', fontSize: '10px', color: '#64748b' }}>visible at: {opt.shownAt}</span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {opt.options.map((o, i) => (
                  <span key={o} style={{ padding: '4px 8px', borderRadius: '4px', background: i === 0 ? '#f1f5f9' : '#fff', border: '1px solid #e2e8f0', fontSize: '12px', color: i === 0 ? '#0f172a' : '#64748b', cursor: 'pointer' }}>
                    {o}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>"Why am I getting this?" Tooltip</h3>
        <div style={{ display: 'inline-block', position: 'relative' }}>
          <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#0f172a' }}>
            You received this because you commented on Report #398.
            <span style={{ marginLeft: '8px', display: 'inline-block', width: '18px', height: '18px', borderRadius: '50%', background: '#e2e8f0', textAlign: 'center', lineHeight: '18px', fontSize: '11px', fontWeight: '700', color: '#64748b', cursor: 'help' }}>?</span>
          </div>
          <div style={{ marginTop: '6px', padding: '10px 14px', background: '#0f172a', color: '#f8fafc', borderRadius: '8px', fontSize: '12px', maxWidth: '300px' }}>
            <strong>Why this notification?</strong><br />
            You are subscribed because you left a comment. You can manage this in your notification preferences.
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>Onboarding Flow</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['Welcome', 'Choose channels', 'Set frequency', 'All set!'].map((step, i) => (
            <div key={step} style={{ flex: 1, padding: '12px 8px', background: i === 3 ? '#dcfce7' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: i === 3 ? '#15803d' : '#cbd5e1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: '12px', fontWeight: '700' }}>{i + 1}</div>
              <div style={{ fontSize: '12px', color: '#334155', fontWeight: '600' }}>{step}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
