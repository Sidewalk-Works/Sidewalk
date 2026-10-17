import React, { useEffect, useState } from 'react';
import type {
  SubscriptionRule,
  SubscriptionRulePayload,
  SubscriptionScope,
  SubscriptionTarget,
} from '@qyou/shared';

interface SubscriptionRulesPanelProps {
  userId: string;
}

const TARGET_LABELS: Record<SubscriptionTarget, string> = {
  reports: 'Reports',
  categories: 'Categories',
  locations: 'Locations',
};

const SCOPE_OPTIONS: { value: SubscriptionScope; label: string }[] = [
  { value: 'following', label: 'Following' },
  { value: 'global', label: 'Global' },
  { value: 'muted', label: 'Muted' },
];

export function SubscriptionRulesPanel({ userId }: SubscriptionRulesPanelProps) {
  const [rules, setRules] = useState<SubscriptionRule[]>([]);
  const [newTarget, setNewTarget] = useState<SubscriptionTarget>('reports');
  const [newTargetRef, setNewTargetRef] = useState('');
  const [newScope, setNewScope] = useState<SubscriptionScope>('following');

  useEffect(() => {
    // In production this would be an API call; stubbed for now
    setRules([
      {
        id: 'rule-1',
        userId,
        target: 'reports',
        targetRef: 'all-reports',
        scope: 'following',
        createdAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
      },
    ]);
  }, [userId]);

  const handleAddRule = () => {
    if (!newTargetRef.trim()) return;
    const now = new Date().toISOString();
    const rule: SubscriptionRule = {
      id: `rule-${Date.now()}`,
      userId,
      target: newTarget,
      targetRef: newTargetRef.trim(),
      scope: newScope,
      createdAtIso: now,
      updatedAtIso: now,
    };
    setRules((prev) => [...prev, rule]);
    setNewTargetRef('');
  };

  const handleRemoveRule = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const handleScopeChange = (ruleId: string, scope: SubscriptionScope) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId ? { ...r, scope, updatedAtIso: new Date().toISOString() } : r,
      ),
    );
  };

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>Subscription Rules</h3>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <select
          value={newTarget}
          onChange={(e) => setNewTarget(e.target.value as SubscriptionTarget)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
        >
          {Object.entries(TARGET_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Reference (e.g. report-id, category name)"
          value={newTargetRef}
          onChange={(e) => setNewTargetRef(e.target.value)}
          style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
        />
        <select
          value={newScope}
          onChange={(e) => setNewScope(e.target.value as SubscriptionScope)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
        >
          {SCOPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          onClick={handleAddRule}
          style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#ffffff', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
        >
          Add
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rules.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center' }}>No subscription rules configured.</p>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                  {TARGET_LABELS[rule.target]} — {rule.targetRef}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Scope: {rule.scope}</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {SCOPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleScopeChange(rule.id, opt.value)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      background: rule.scope === opt.value ? '#3b82f6' : '#ffffff',
                      color: rule.scope === opt.value ? '#ffffff' : '#334155',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={() => handleRemoveRule(rule.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#ef4444' }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
