import React, { useState } from 'react';

const explainerVariants = [
  { category: 'report_author', label: 'Report Author', headline: 'Update on Pothole on Elm St', body: 'The pothole you reported on Elm Street has been triaged by the city and is scheduled for repair next week.', explainer: 'You received this because you authored the original report.', color: '#3b82f6' },
  { category: 'subscribed_category', label: 'Subscribed Topic', headline: 'New Sidewalk Damage in Downtown', body: 'Three new sidewalk damage reports were filed in the Downtown area today, affecting pedestrian access near Main St.', explainer: 'You subscribed to alerts for the "Sidewalk Damage" topic.', color: '#8b5cf6' },
  { category: 'neighborhood_proximity', label: 'Nearby Alert', headline: 'Unsafe Crosswalk Near You', body: 'A new report flags the crosswalk at Oak Ave & 5th as missing pedestrian signals. View details and add your input.', explainer: 'This alert is based on your location — it\'s within 0.5 miles of your home.', color: '#f59e0b' },
];

const formatPreviews = [
  {
    format: 'Email',
    icon: '📧',
    bg: '#fff',
    border: '#e2e8f0',
    render: () => (
      <div>
        <div style={{ background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px 6px 0 0', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
        </div>
        <div style={{ padding: '14px', background: '#fff' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>From: alerts@sidewalk.works</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Update on Pothole on Elm St</div>
          <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.6', marginBottom: '10px' }}>The pothole you reported on Elm Street has been triaged by the city and is scheduled for repair next week.</div>
          <div style={{ display: 'inline-block', padding: '6px 14px', background: '#3b82f6', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>View Report</div>
        </div>
      </div>
    ),
  },
  {
    format: 'In-App',
    icon: '🔔',
    bg: '#fff',
    border: '#e2e8f0',
    render: () => (
      <div>
        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🚧</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Update on Pothole on Elm St</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>The pothole you reported has been triaged…</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <span style={{ padding: '3px 10px', background: '#3b82f6', color: '#fff', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>View</span>
              <span style={{ padding: '3px 10px', background: '#f1f5f9', color: '#475569', borderRadius: '4px', fontSize: '11px' }}>Dismiss</span>
            </div>
          </div>
          <span style={{ fontSize: '11px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>2m ago</span>
        </div>
      </div>
    ),
  },
  {
    format: 'Push Notification',
    icon: '📲',
    bg: '#1e293b',
    border: '#334155',
    render: () => (
      <div style={{ background: '#1e293b', padding: '14px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff' }}>SW</div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Sidewalk · now</span>
        </div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>Update on Pothole on Elm St</div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>The pothole you reported has been triaged by the city…</div>
      </div>
    ),
  },
];

export function AlertPreviewDesign() {
  const [expandedWhy, setExpandedWhy] = useState<number | null>(null);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px', maxWidth: '820px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Alert Preview Design</h2>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '28px' }}>Preview cards, category explainers, and format mockups</p>

      {/* Alert Preview Card Mockup */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alert Preview Card</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ background: '#3b82f6', padding: '3px 14px', fontSize: '11px', color: '#fff', fontWeight: 600 }}>PREVIEW</div>
          <div style={{ padding: '16px', background: '#fff' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Update on Pothole on Elm St</h4>
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>The pothole you reported on Elm Street has been triaged by the city and is scheduled for repair next week.</p>
            <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '10px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>ℹ️ You received this because you authored the original report.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Category-Based Explainer Variations */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Explainer Variations by Category</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {explainerVariants.map((v, i) => (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.color }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{v.label}</span>
                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>{v.category}</span>
              </div>
              <div style={{ padding: '14px' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{v.headline}</h4>
                <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>{v.body}</p>
                <div style={{ padding: '8px 12px', background: '#f0f9ff', borderLeft: `3px solid ${v.color}`, borderRadius: '4px', fontSize: '12px', color: '#1e40af' }}>
                  ℹ️ {v.explainer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why am I getting this? Accordion */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>"Why am I getting this?" Accordion</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          {explainerVariants.map((v, i) => (
            <div key={i} style={{ borderBottom: i < explainerVariants.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <button onClick={() => setExpandedWhy(expandedWhy === i ? null : i)} style={{ width: '100%', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.color }} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>{v.headline}</span>
                </div>
                <span style={{ fontSize: '14px', color: '#94a3b8', transition: 'transform 0.2s', transform: expandedWhy === i ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
              </button>
              {expandedWhy === i && (
                <div style={{ padding: '0 14px 14px 30px', background: '#f8fafc' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#475569' }}>{v.explainer}</p>
                  <a href="#" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none' }}>Manage preferences →</a>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Format Previews */}
      <section>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Format Previews</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {formatPreviews.map((f, i) => (
            <div key={i}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>{f.icon}</span> {f.format}
              </div>
              <div style={{ border: `1px solid ${f.border}`, borderRadius: '8px', overflow: 'hidden', background: f.bg }}>
                {f.render()}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
