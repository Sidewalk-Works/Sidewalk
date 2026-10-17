import React, { useState } from 'react';
import type { SubscriptionCleanupRule } from '@qyou/shared';

interface SubscriptionCleanupPanelProps {
  rules: SubscriptionCleanupRule[];
  onAddRule?: (rule: Omit<SubscriptionCleanupRule, 'ruleId' | 'createdAtIso' | 'lastRunAtIso' | 'runCount'>) => void;
  onRemoveRule?: (ruleId: string) => void;
  onToggleRule?: (ruleId: string, enabled: boolean) => void;
  onManualCleanup?: (reportId: string) => void;
}

const TRIGGER_LABELS: Record<string, string> = {
  report_closed: 'Report Closed',
  report_merged: 'Report Merged',
  report_archived: 'Report Archived',
  manual: 'Manual',
};

const ACTION_LABELS: Record<string, string> = {
  remove_subscription: 'Remove Subscription',
  notify_subscriber: 'Notify Subscriber',
  log_only: 'Log Only',
};

export function SubscriptionCleanupPanel({
  rules = [],
  onAddRule,
  onRemoveRule,
  onToggleRule,
  onManualCleanup,
}: SubscriptionCleanupPanelProps) {
  const [manualReportId, setManualReportId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newTrigger, setNewTrigger] = useState<string>('report_closed');
  const [newAction, setNewAction] = useState<string>('remove_subscription');
  const [newDescription, setNewDescription] = useState('');

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
    background: '#ffffff',
  };

  const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '12px', color: '#64748b', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' };
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' };
  const inputStyle: React.CSSProperties = { padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px' };
  const btnStyle = (bg: string, color: string): React.CSSProperties => ({ padding: '6px 12px', borderRadius: '4px', border: 'none', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', background: bg, color });

  const handleAddRule = () => {
    if (!newDescription) return;
    onAddRule?.({
      ruleId: '',
      trigger: newTrigger as SubscriptionCleanupRule['trigger'],
      action: newAction as SubscriptionCleanupRule['action'],
      enabled: true,
      description: newDescription,
      createdAtIso: new Date().toISOString(),
      lastRunAtIso: null,
      runCount: 0,
    });
    setNewDescription('');
    setShowForm(false);
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Subscription Cleanup Rules</h3>
        <button style={btnStyle('#dcfce7', '#166534')} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Trigger</label>
            <select value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)} style={inputStyle}>
              <option value="report_closed">Report Closed</option>
              <option value="report_merged">Report Merged</option>
              <option value="report_archived">Report Archived</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Action</label>
            <select value={newAction} onChange={(e) => setNewAction(e.target.value)} style={inputStyle}>
              <option value="remove_subscription">Remove Subscription</option>
              <option value="notify_subscriber">Notify Subscriber</option>
              <option value="log_only">Log Only</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Description</label>
            <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Rule description..." style={{ ...inputStyle, width: '100%' }} />
          </div>
          <button style={btnStyle('#3b82f6', '#ffffff')} onClick={handleAddRule}>Save</button>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>Rule</th>
              <th style={th}>Trigger</th>
              <th style={th}>Action</th>
              <th style={th}>Runs</th>
              <th style={th}>Enabled</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...td, color: '#64748b', textAlign: 'center' }}>No cleanup rules configured.</td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.ruleId}>
                  <td style={td}>{rule.description}</td>
                  <td style={td}>{TRIGGER_LABELS[rule.trigger]}</td>
                  <td style={td}>{ACTION_LABELS[rule.action]}</td>
                  <td style={td}>{rule.runCount}</td>
                  <td style={td}>
                    <button
                      style={btnStyle(rule.enabled ? '#dcfce7' : '#fee2e2', rule.enabled ? '#166534' : '#991b1b')}
                      onClick={() => onToggleRule?.(rule.ruleId, !rule.enabled)}
                    >
                      {rule.enabled ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td style={td}>
                    <button style={btnStyle('#fee2e2', '#991b1b')} onClick={() => onRemoveRule?.(rule.ruleId)}>Remove</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Manual Cleanup</h4>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={manualReportId}
            onChange={(e) => setManualReportId(e.target.value)}
            placeholder="Report ID"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            style={btnStyle('#3b82f6', '#ffffff')}
            onClick={() => { if (manualReportId) { onManualCleanup?.(manualReportId); setManualReportId(''); } }}
          >
            Run Cleanup
          </button>
        </div>
      </div>
    </div>
  );
}
