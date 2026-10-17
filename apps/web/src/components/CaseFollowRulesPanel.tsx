import React, { useState, useMemo } from 'react';

interface FollowRule {
  ruleId: string;
  caseId: string;
  triggerCondition: string;
  notificationConfig: {
    onNewComment: boolean;
    onStatusChange: boolean;
    onAssignment: boolean;
    onMention: boolean;
  };
  isActive: boolean;
  createdAtIso: string;
}

interface CaseFollowRulesPanelProps {
  rules: FollowRule[];
  onAddRule?: (triggerCondition: string) => void;
  onRemoveRule?: (ruleId: string) => void;
  onToggleConfig?: (ruleId: string, key: string, value: boolean) => void;
}

const TRIGGER_LABELS: Record<string, string> = {
  case_created: 'Case Created',
  new_comment: 'New Comment',
  status_change: 'Status Change',
  assigned_to_me: 'Assigned to Me',
  mentioned_in_comment: 'Mentioned in Comment',
};

export function CaseFollowRulesPanel({
  rules,
  onAddRule,
  onRemoveRule,
  onToggleConfig,
}: CaseFollowRulesPanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState('new_comment');

  const activeRules = useMemo(() => rules.filter((r) => r.isActive), [rules]);

  function handleAdd() {
    onAddRule?.(selectedTrigger);
    setIsAdding(false);
  }

  return (
    <div
      style={{
        padding: '20px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>
          Case Follow Rules
        </h3>
        <button
          onClick={() => setIsAdding(!isAdding)}
          style={{
            padding: '6px 12px',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
          }}
        >
          {isAdding ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      {isAdding && (
        <div
          style={{
            padding: '12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <label style={{ fontSize: '13px', color: '#475569' }}>Trigger Condition</label>
          <select
            value={selectedTrigger}
            onChange={(e) => setSelectedTrigger(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none',
            }}
          >
            {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            style={{
              padding: '8px 16px',
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              alignSelf: 'flex-start',
            }}
          >
            Add Rule
          </button>
        </div>
      )}

      {activeRules.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
          No follow rules configured. Add a rule to get notified on case activity.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {activeRules.map((rule) => (
            <div
              key={rule.ruleId}
              style={{
                padding: '12px 16px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#0f172a',
                  }}
                >
                  {TRIGGER_LABELS[rule.triggerCondition] ?? rule.triggerCondition}
                </span>
                <button
                  onClick={() => onRemoveRule?.(rule.ruleId)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                >
                  Remove
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                }}
              >
                {(
                  Object.entries(rule.notificationConfig) as [
                    string,
                    boolean
                  ][]
                ).map(([key, value]) => {
                  const label = key
                    .replace(/^on/, '')
                    .replace(/([A-Z])/g, ' $1')
                    .trim();
                  return (
                    <label
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        color: '#475569',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) =>
                          onToggleConfig?.(
                            rule.ruleId,
                            key,
                            e.target.checked
                          )
                        }
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
