import React from 'react';

const LIFECYCLE_STAGES = [
  { label: 'Open', color: '#f1f5f9', textColor: '#475569', icon: '\uD83D\uDCE6' },
  { label: 'Under Investigation', color: '#fef3c7', textColor: '#b45309', icon: '\uD83D\uDD0D' },
  { label: 'Work Scheduled', color: '#e0f2fe', textColor: '#0369a1', icon: '\uD83D\uDCC5' },
  { label: 'Resolved', color: '#dcfce7', textColor: '#15803d', icon: '\u2705' },
];

const URGENCY_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: '#f1f5f9', text: '#475569' },
  medium: { bg: '#fef3c7', text: '#b45309' },
  high: { bg: '#ffedd5', text: '#c2410c' },
  critical: { bg: '#fee2e2', text: '#991b1b' },
};

const TRIGGER_RULES = [
  { name: 'Auto-assign on submit', description: 'Automatically assign reports to the nearest responder', urgency: 'medium', enabled: true },
  { name: 'Escalate after 48h', description: 'Escalate unresolved reports after 48 hours', urgency: 'high', enabled: true },
  { name: 'Close on merge', description: 'Auto-close duplicates when reports are merged', urgency: 'low', enabled: false },
  { name: 'Alert on critical', description: 'Send immediate alert for critical-priority reports', urgency: 'critical', enabled: true },
];

const EXAMPLE_EVALUATION = {
  rule: 'Escalate after 48h',
  before: { stage: 'Under Investigation', assignee: 'Community Team', hoursOpen: 52 },
  after: { stage: 'Work Scheduled', assignee: 'Ops Lead', hoursOpen: 52 },
};

export function LifecycleTriggerDesign() {
  return (
    <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', maxWidth: '680px' }}>
      <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a' }}>Lifecycle Trigger Rules</h2>
      <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#64748b' }}>Define rules that automatically transition reports through lifecycle stages.</p>

      <div style={{ marginBottom: '28px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>Lifecycle Flow</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', overflowX: 'auto' }}>
          {LIFECYCLE_STAGES.map((stage, i) => (
            <React.Fragment key={stage.label}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 16px', background: stage.color, borderRadius: '8px', minWidth: '120px' }}>
                <span style={{ fontSize: '18px', marginBottom: '4px' }}>{stage.icon}</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: stage.textColor, textAlign: 'center' }}>{stage.label}</span>
              </div>
              {i < LIFECYCLE_STAGES.length - 1 && (
                <span style={{ margin: '0 4px', color: '#cbd5e1', fontSize: '18px' }}>{'\u2192'}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '28px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>Trigger Rules</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {TRIGGER_RULES.map((rule) => {
            const uc = URGENCY_COLORS[rule.urgency];
            return (
              <div key={rule.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: uc.bg, color: uc.text, fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>{rule.urgency}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{rule.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{rule.description}</div>
                  </div>
                </div>
                <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: rule.enabled ? '#22c55e' : '#cbd5e1', position: 'relative', cursor: 'pointer' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: rule.enabled ? '18px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>Example Evaluation</h3>
        <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '12px' }}>Rule: {EXAMPLE_EVALUATION.rule}</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1, padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Before</div>
              <div style={{ fontSize: '13px', color: '#0f172a' }}>Stage: {EXAMPLE_EVALUATION.before.stage}</div>
              <div style={{ fontSize: '13px', color: '#0f172a' }}>Assignee: {EXAMPLE_EVALUATION.before.assignee}</div>
              <div style={{ fontSize: '13px', color: '#0f172a' }}>Hours open: {EXAMPLE_EVALUATION.before.hoursOpen}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '18px' }}>{'\u2192'}</div>
            <div style={{ flex: 1, padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #dcfce7' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#15803d', textTransform: 'uppercase', marginBottom: '8px' }}>After</div>
              <div style={{ fontSize: '13px', color: '#0f172a' }}>Stage: {EXAMPLE_EVALUATION.after.stage}</div>
              <div style={{ fontSize: '13px', color: '#0f172a' }}>Assignee: {EXAMPLE_EVALUATION.after.assignee}</div>
              <div style={{ fontSize: '13px', color: '#0f172a' }}>Hours open: {EXAMPLE_EVALUATION.after.hoursOpen}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
