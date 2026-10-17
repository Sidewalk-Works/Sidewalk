import React, { useState } from 'react';

const promptVariants = [
  { type: 'return-inactivity', title: 'Welcome back!', body: "It's been 14 days since your last visit. 3 new reports were filed in your neighborhood.", icon: '👋', accent: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  { type: 'new-activity', title: 'New activity on your report', body: 'The city responded to your sidewalk damage report on Oak Ave. Tap to see the update.', icon: '🔔', accent: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
  { type: 'community-milestone', title: 'Community milestone reached!', body: 'Your neighborhood just logged 100 completed repairs. You contributed 12 reports!', icon: '🎉', accent: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' },
  { type: 'weekly-summary', title: 'Your weekly summary', body: '4 reports resolved, 2 pending, 1 new in your area. See the full breakdown.', icon: '📊', accent: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
];

const optimalSendTimes = [
  { day: 'Mon', hour: '8 AM', score: 72, bar: '72%' },
  { day: 'Tue', hour: '12 PM', score: 88, bar: '88%' },
  { day: 'Wed', hour: '6 PM', score: 65, bar: '65%' },
  { day: 'Thu', hour: '8 AM', score: 91, bar: '91%' },
  { day: 'Fri', hour: '12 PM', score: 78, bar: '78%' },
  { day: 'Sat', hour: '10 AM', score: 45, bar: '45%' },
  { day: 'Sun', hour: '—', score: 30, bar: '30%' },
];

const frequencyCap = [
  { week: 'Week 1', prompts: 3 },
  { week: 'Week 2', prompts: 2 },
  { week: 'Week 3', prompts: 4 },
  { week: 'Week 4', prompts: 1 },
];

export function EngagementPromptDesign() {
  const [optOutStep, setOptOutStep] = useState(0);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px', maxWidth: '820px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Engagement Prompt Design</h2>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '28px' }}>Re-engagement variants, timing, frequency capping, and opt-out</p>

      {/* Prompt Variant Cards */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Re-Engagement Prompt Variants</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {promptVariants.map((p, i) => (
            <div key={i} style={{ padding: '16px', background: p.bg, border: `1px solid ${p.border}`, borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '20px' }}>{p.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: p.accent, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{p.type}</span>
              </div>
              <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{p.title}</h4>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>{p.body}</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, background: p.accent, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Open</button>
                <button style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 500, background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer' }}>Snooze</button>
                <button style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 500, background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Prompt Timing Visualization */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Optimal Send Times</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '60px 70px 1fr 40px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 14px', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
            <span>Day</span>
            <span>Time</span>
            <span>Engagement Score</span>
            <span style={{ textAlign: 'right' }}>%</span>
          </div>
          {optimalSendTimes.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 70px 1fr 40px', padding: '8px 14px', borderBottom: i < optimalSendTimes.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems: 'center', fontSize: '12px' }}>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{t.day}</span>
              <span style={{ color: '#64748b' }}>{t.hour}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '4px', background: t.score >= 80 ? '#22c55e' : t.score >= 60 ? '#f59e0b' : '#94a3b8', width: t.bar }} />
                </div>
              </div>
              <span style={{ textAlign: 'right', fontWeight: 600, color: t.score >= 80 ? '#166534' : t.score >= 60 ? '#92400e' : '#64748b' }}>{t.score}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Dismiss/Snooze Options */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dismiss & Snooze Options</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[{ label: 'Snooze 1 hour', style: { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' } }, { label: 'Snooze 24 hours', style: { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' } }, { label: 'Snooze 1 week', style: { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' } }, { label: 'Dismiss', style: { background: '#fff', border: '1px solid #fecaca', color: '#991b1b' } }, { label: 'Don\'t show again', style: { background: '#fff', border: '1px solid #fecaca', color: '#991b1b' } }].map((b, i) => (
            <button key={i} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 500, borderRadius: '6px', cursor: 'pointer', ...b.style }}>{b.label}</button>
          ))}
        </div>
      </section>

      {/* What You Missed */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>"What You Missed" Summary</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ background: '#3b82f6', padding: '10px 16px', color: '#fff', fontSize: '14px', fontWeight: 600 }}>What you missed</div>
          <div style={{ padding: '16px' }}>
            {[
              { text: '3 new reports in your neighborhood', icon: '📍', color: '#3b82f6' },
              { text: '1 report you followed was resolved', icon: '✅', color: '#22c55e' },
              { text: '2 community discussions you might like', icon: '💬', color: '#8b5cf6' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
                <span style={{ fontSize: '16px' }}>{item.icon}</span>
                <span style={{ fontSize: '13px', color: '#334155', flex: 1 }}>{item.text}</span>
                <span style={{ fontSize: '11px', color: item.color, fontWeight: 600 }}>New</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Frequency Capping */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Frequency Capping</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '100px', marginBottom: '8px' }}>
            {frequencyCap.map((w, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{w.prompts}</span>
                <div style={{ width: '100%', height: `${(w.prompts / 4) * 64}px`, background: w.prompts >= 4 ? '#fecaca' : w.prompts >= 3 ? '#fde68a' : '#dcfce7', borderRadius: '4px 4px 0 0', border: `1px solid ${w.prompts >= 4 ? '#fca5a5' : w.prompts >= 3 ? '#fcd34d' : '#86efac'}` }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {frequencyCap.map((w, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>{w.week}</div>
            ))}
          </div>
          <div style={{ marginTop: '10px', padding: '8px 12px', background: '#f8fafc', borderRadius: '4px', fontSize: '12px', color: '#64748b' }}>
            Max <strong>5 prompts/week</strong>. Current usage: <strong>10 total</strong> across 4 weeks.
          </div>
        </div>
      </section>

      {/* Opt-Out Flow */}
      <section>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opt-Out Flow</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
            {['Select types', 'Confirm', 'Done'].map((step, i) => (
              <React.Fragment key={i}>
                <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: i <= optOutStep ? '#3b82f6' : '#e2e8f0', color: i <= optOutStep ? '#fff' : '#94a3b8' }}>{step}</span>
                {i < 2 && <span style={{ color: '#cbd5e1', fontSize: '11px' }}>→</span>}
              </React.Fragment>
            ))}
          </div>
          <div style={{ padding: '16px' }}>
            {optOutStep === 0 && (
              <div>
                <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#475569' }}>Select which prompts you'd like to stop receiving:</p>
                {['Re-engagement prompts', 'Weekly summaries', 'Community milestones', 'New activity alerts'].map((label, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: i < 3 ? '1px solid #f1f5f9' : 'none', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ accentColor: '#3b82f6' }} />
                    {label}
                  </label>
                ))}
                <button onClick={() => setOptOutStep(1)} style={{ marginTop: '12px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Continue</button>
              </div>
            )}
            {optOutStep === 1 && (
              <div>
                <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#475569' }}>Are you sure? You can always re-enable these in Settings.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setOptOutStep(2)} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 600, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Yes, opt out</button>
                  <button onClick={() => setOptOutStep(0)} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 500, background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
            {optOutStep === 2 && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <span style={{ fontSize: '28px' }}>✅</span>
                <p style={{ margin: '8px 0 0', fontSize: '14px', fontWeight: 600, color: '#166534' }}>Preferences saved</p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>You won't receive the selected prompts anymore.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
