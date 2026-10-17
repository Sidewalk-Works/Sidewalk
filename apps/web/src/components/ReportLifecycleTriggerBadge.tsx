import React, { useState } from 'react';
import type { ReportLifecycleStage, LifecycleTriggerEvaluationPayload } from '@qyou/shared';

interface ReportLifecycleTriggerBadgeProps {
  stage?: ReportLifecycleStage;
  triggerEvaluation?: LifecycleTriggerEvaluationPayload;
}

const STAGE_ICONS: Record<ReportLifecycleStage, string> = {
  submitted: '📋',
  under_investigation: '🔍',
  work_scheduled: '🔧',
  resolved: '✅',
  archived: '📦',
};

const STAGE_COLORS: Record<ReportLifecycleStage, { bg: string; text: string }> = {
  submitted: { bg: '#f1f5f9', text: '#334155' },
  under_investigation: { bg: '#fffbeb', text: '#92400e' },
  work_scheduled: { bg: '#f0f9ff', text: '#0369a1' },
  resolved: { bg: '#f0fdf4', text: '#166534' },
  archived: { bg: '#faf5ff', text: '#6b21a8' },
};

const URGENT_STAGES: ReportLifecycleStage[] = ['under_investigation', 'work_scheduled'];

export function ReportLifecycleTriggerBadge({ stage = 'submitted', triggerEvaluation }: ReportLifecycleTriggerBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const isUrgent = URGENT_STAGES.includes(stage);
  const colors = STAGE_COLORS[stage];

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: '12px',
    background: colors.bg,
    color: colors.text,
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    cursor: 'pointer',
    position: 'relative',
  };

  const urgentBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    padding: '2px 6px',
    borderRadius: '4px',
    background: '#fef2f2',
    color: '#dc2626',
    fontSize: '10px',
    fontWeight: 'bold',
    marginLeft: '6px',
  };

  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '6px',
    padding: '12px',
    background: '#1e293b',
    color: '#f8fafc',
    borderRadius: '8px',
    fontSize: '12px',
    lineHeight: 1.5,
    whiteSpace: 'nowrap',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <div
        style={badgeStyle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span>{STAGE_ICONS[stage]}</span>
        <span>{stage.replace('_', ' ')}</span>
        {isUrgent && <span style={urgentBadgeStyle}>URGENT</span>}
        {showTooltip && triggerEvaluation && (
          <div style={tooltipStyle}>
            <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Trigger Evaluation</div>
            <div>Report: {triggerEvaluation.reportId}</div>
            <div>Previous: {triggerEvaluation.previousStage.replace('_', ' ')}</div>
            <div>New: {triggerEvaluation.newStage.replace('_', ' ')}</div>
            <div>Evaluated: {new Date(triggerEvaluation.evaluatedAtIso).toLocaleString()}</div>
            <div style={{ borderTop: '1px solid #475569', marginTop: '6px', paddingTop: '6px' }}>
              Actions taken:
              {triggerEvaluation.ruleApplied.notifyAuthor && <div>- Notify author</div>}
              {triggerEvaluation.ruleApplied.notifySubscribers && <div>- Notify subscribers</div>}
              {triggerEvaluation.ruleApplied.requiresUrgentAlert && <div>- Urgent alert sent</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
